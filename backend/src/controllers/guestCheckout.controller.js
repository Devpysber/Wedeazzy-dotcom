/**
 * Guest checkout for the public /grow marketing page.
 *
 * A visitor picks a Grow campaign or listing plan, fills in name / business /
 * email / phone, and pays through Razorpay without having a vendor account.
 * Unlike /api/payment/initiate there is no User to attach a Transaction to, so
 * the purchase is stored as a GuestOrder and the WedEazzy team links it to the
 * listing and activates it by hand. After payment we tell the buyer whether
 * their business already has an account (sign in), an unclaimed listing
 * (claim it) or nothing yet (register).
 */
const prisma = require('../config/db');
const env = require('../config/env');
const logger = require('../config/logger');
const { HttpError } = require('../middleware/error');
const { sanitizeText } = require('../utils/sanitize');
const { normalisePhone } = require('../utils/phone');
const { getGrowCampaignsPricing } = require('../config/growCampaignsPricingConfig');
const plansConfig = require('../config/plansConfig');
const emailService = require('../services/email.service');
const { razorpayRequest, verifyRazorpaySignature } = require('./payment.controller');

const COUNTRY_CURRENCIES = { IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED', CA: 'CAD', AU: 'AUD' };
const GROW_LABELS = { whatsapp_leads: 'WhatsApp Enquiries', more_leads: 'More Leads', website_sales: 'Website Sales' };
const LISTING_PLANS = ['Premium', 'Featured'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function last10(s) {
  return String(s || '').replace(/[^0-9]/g, '').slice(-10);
}

function maskPhone(phone) {
  if (!phone) return '';
  const s = String(phone).replace(/[^0-9]/g, '');
  if (s.length <= 6) return s;
  const head = s.slice(0, 4);
  const tail = s.slice(-3);
  return `+${head} ${'•'.repeat(Math.max(3, s.length - 7))}${tail}`;
}

function durationLabel(days) {
  return days === 90 ? '3 months' : `${days} days`;
}

/**
 * Server-side price for the chosen plan. Never trust an amount from the
 * browser. Grow prices are tax-inclusive (see resolvePlanPricing in
 * campaign.controller.js); listing plans add 18% GST like initiatePayment.
 * Returns { amount (minor units), planLabel, planDays }.
 */
function resolvePrice(planType, planKey, days, countryCode, testToken) {
  // Smallest-possible live payment (1 rupee / 1 unit) used to verify the real
  // gateway end to end. Only works while TEST_CHECKOUT_TOKEN is set on the
  // server and the caller sends the matching token, so it is never reachable
  // by an ordinary visitor. Unset the variable to switch it off.
  if (planType === 'test') {
    const token = process.env.TEST_CHECKOUT_TOKEN;
    if (!token || String(testToken || '') !== token) {
      throw new HttpError(403, 'Test checkout is not available.', 'ERR_TEST_DISABLED');
    }
    return { amount: 100, planLabel: 'Test payment (1 unit)', planDays: 0 };
  }
  if (planType === 'grow') {
    const pkg = (getGrowCampaignsPricing(countryCode) || {})[planKey];
    const plan = pkg && Array.isArray(pkg.plans) && pkg.plans.find((p) => !p.custom && p.days === days);
    if (!GROW_LABELS[planKey] || !plan || !Number.isFinite(Number(plan.price))) {
      throw new HttpError(400, 'Please choose a valid plan and duration.', 'ERR_INPUT');
    }
    return {
      amount: Math.round(Number(plan.price) * 100),
      planLabel: `${GROW_LABELS[planKey]} (${durationLabel(days)})`,
      planDays: days
    };
  }
  if (planType === 'listing') {
    const plan = LISTING_PLANS.includes(planKey) && plansConfig.getPlansConfig(countryCode)[planKey];
    if (!plan || !Number.isFinite(Number(plan.price)) || Number(plan.price) <= 0) {
      throw new HttpError(400, 'Please choose a valid plan.', 'ERR_INPUT');
    }
    return { amount: Math.round(Number(plan.price) * 1.18 * 100), planLabel: `${planKey} Listing (1 month)`, planDays: 30 };
  }
  throw new HttpError(400, 'Please choose a valid plan.', 'ERR_INPUT');
}

function readBuyer(body, countryCode, pickedVendor) {
  const name = sanitizeText(body.name, 120);
  const businessName = sanitizeText(body.businessName || (pickedVendor && pickedVendor.businessName), 160);
  const email = sanitizeText(body.email, 190).toLowerCase();
  const rawPhone = sanitizeText(body.phone, 32);
  const city = sanitizeText(body.city || (pickedVendor && pickedVendor.city), 80);
  if (name.length < 2) throw new HttpError(400, 'Please enter your name.', 'ERR_INPUT');
  if (businessName.length < 2) throw new HttpError(400, 'Please enter your business name.', 'ERR_INPUT');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.', 'ERR_INPUT');

  let phone;
  const fallbackRegistered = pickedVendor && (pickedVendor.whatsappNumber || pickedVendor.alternateMobile || (pickedVendor.user && pickedVendor.user.phone));
  if (rawPhone.includes('•') && fallbackRegistered) {
    phone = normalisePhone(fallbackRegistered) || fallbackRegistered.replace(/[^0-9]/g, '');
  } else if (countryCode === 'IN') {
    phone = normalisePhone(rawPhone);
    if (!phone) throw new HttpError(400, 'Please enter a valid 10-digit mobile number.', 'ERR_INPUT');
  } else {
    phone = rawPhone.replace(/[^0-9]/g, '');
    if (phone.length < 7 || phone.length > 15) throw new HttpError(400, 'Please enter a valid phone number with country code.', 'ERR_INPUT');
  }
  return { name, businessName, email, phone, city };
}

/**
 * Listing the buyer picked from the business-name search (same search as the
 * claim page). Must be a real, active vendor; its name and city win over what
 * was typed. Returns null when nothing was picked.
 */
async function resolvePickedVendor(vendorId) {
  if (!vendorId) return null;
  const v = await prisma.vendor.findFirst({
    where: { id: String(vendorId).slice(0, 64), isActive: true },
    select: {
      id: true,
      businessName: true,
      city: true,
      country: true,
      countryCode: true,
      whatsappNumber: true,
      alternateMobile: true,
      userId: true,
      user: { select: { phone: true, email: true, mustChangePassword: true } }
    }
  });
  if (!v) throw new HttpError(400, 'The selected business could not be found. Please search again.', 'ERR_INPUT');
  return v;
}

/**
 * Where does this buyer's business stand on WedEazzy?
 *   account   - a vendor login already uses this email/phone   -> sign in
 *   claimed   - matching listing is owned by someone          -> sign in
 *   unclaimed - matching listing has no owner yet              -> claim it
 *   new       - nothing found                                  -> register
 */
async function findListing({ email, phone, businessName, matchedVendorId }) {
  const base = env.PUBLIC_BASE_URL || '';
  const p10 = last10(phone);
  const signIn = (name) => ({
    actionUrl: `${base}/pages/vendor-login.html?next=grow${email ? `&email=${encodeURIComponent(email)}` : ''}${name ? `&business=${encodeURIComponent(name)}` : ''}`,
    actionLabel: 'Sign in to your claimed listing'
  });

  // 1. If buyer picked a specific listing from the search dropdown, THAT listing dictates state
  if (matchedVendorId) {
    const picked = await prisma.vendor.findUnique({
      where: { id: matchedVendorId },
      select: {
        id: true,
        businessName: true,
        whatsappNumber: true,
        alternateMobile: true,
        city: true,
        country: true,
        countryCode: true,
        userId: true,
        user: { select: { phone: true, email: true, mustChangePassword: true } }
      }
    });
    if (picked) {
      const phoneToMask = picked.whatsappNumber || picked.alternateMobile || (picked.user && picked.user.phone);
      if (picked.userId && (!picked.user || picked.user.mustChangePassword === false)) {
        return {
          state: 'claimed',
          vendorId: picked.id,
          vendorName: picked.businessName,
          phoneMasked: maskPhone(phoneToMask),
          ...signIn(picked.businessName)
        };
      }
      return {
        state: 'unclaimed',
        vendorId: picked.id,
        vendorName: picked.businessName,
        phoneMasked: maskPhone(phoneToMask),
        actionUrl: `${base}/pages/claim.html`,
        actionLabel: 'Claim your listing'
      };
    }
  }

  // 2. If buyer did not pick from the list, check if businessName exact-matches an existing listing
  if (businessName && businessName.trim().length >= 2) {
    const exact = await prisma.vendor.findFirst({
      where: {
        isActive: true,
        businessName: { equals: businessName.trim() }
      },
      select: {
        id: true,
        businessName: true,
        whatsappNumber: true,
        alternateMobile: true,
        userId: true,
        user: { select: { phone: true, email: true, mustChangePassword: true } }
      }
    });
    if (exact) {
      const phoneToMask = exact.whatsappNumber || exact.alternateMobile || (exact.user && exact.user.phone);
      if (exact.userId && (!exact.user || exact.user.mustChangePassword === false)) {
        return {
          state: 'claimed',
          vendorId: exact.id,
          vendorName: exact.businessName,
          phoneMasked: maskPhone(phoneToMask),
          ...signIn(exact.businessName)
        };
      }
      return {
        state: 'unclaimed',
        vendorId: exact.id,
        vendorName: exact.businessName,
        phoneMasked: maskPhone(phoneToMask),
        actionUrl: `${base}/pages/claim.html`,
        actionLabel: 'Claim your listing'
      };
    }
  }

  // 3. Otherwise: Unlisted / New Business!
  // Always return state: 'new' so it takes the user to the registration page
  return {
    state: 'new',
    vendorId: null,
    vendorName: null,
    phoneMasked: null,
    actionUrl: `${base}/pages/claim.html?mode=register`,
    actionLabel: 'Register your business free'
  };
}

/**
 * Activates a purchased plan or campaign on a vendor account immediately.
 */
async function activatePlanForVendor(vendorId, order, paymentId) {
  if (!vendorId || !order) return null;
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, businessName: true, categorySlug: true, citySlug: true, city: true }
  });
  if (!vendor) return null;

  const days = order.planDays || 30;
  const startDate = new Date();
  const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  if (order.planType === 'listing') {
    const isFeatured = order.planKey === 'Featured';
    await prisma.vendor.update({
      where: { id: vendor.id },
      data: {
        subscriptionPlan: order.planKey,
        subscriptionStart: startDate,
        subscriptionExpiry: expiryDate,
        razorpayOrderId: paymentId || order.razorpayOrderId,
        tier: isFeatured ? 'featured' : 'basic',
        featuredUntil: isFeatured ? expiryDate : null,
        updatedAt: new Date()
      }
    });
    logger.info(`GuestOrder ${order.id}: Activated ${order.planKey} for Vendor ${vendor.id}. Expiry: ${expiryDate}`);
    return { type: 'listing', vendorId: vendor.id, plan: order.planKey, expiryDate };
  } else if (order.planType === 'grow' || order.planType === 'test') {
    const totalAmount = Math.round(order.amount / 100);
    const gstAmount = Math.round(totalAmount - totalAmount / 1.18);
    const baseAmount = totalAmount - gstAmount;

    let goal = 'leads';
    if (order.planKey === 'whatsapp_leads') goal = 'whatsapp';
    else if (order.planKey === 'website_sales') goal = 'traffic';

    const campaign = await prisma.adCampaign.create({
      data: {
        vendorId: vendor.id,
        platform: order.planKey === 'whatsapp_leads' ? 'whatsapp' : 'facebook',
        dailyBudget: Math.max(1, Math.round(baseAmount / Math.max(1, days))),
        durationDays: days,
        goal,
        targetCity: vendor.city || order.city || null,
        status: 'pending_review',
        packageType: order.planKey,
        planDays: days,
        totalAmount,
        gstAmount,
        baseAmount,
        paymentMethod: 'razorpay',
        paymentStatus: 'paid',
        paymentRef: paymentId || order.razorpayPaymentId || order.razorpayOrderId,
        adminStatus: 'approved'
      }
    });
    logger.info(`GuestOrder ${order.id}: Created & activated AdCampaign ${campaign.id} for Vendor ${vendor.id}`);
    return { type: 'grow', vendorId: vendor.id, campaignId: campaign.id };
  }
  return null;
}

/**
 * Links any paid GuestOrders to a newly claimed, registered, or authenticated vendor
 * ONLY after ownership of the vendor has been verified.
 */
async function linkPendingGuestOrders(vendorId, verifiedUserId) {
  if (!vendorId) return;

  // 1. Verify ownership of the vendor
  const vendor = await prisma.vendor.findUnique({
    where: { id: vendorId },
    select: { id: true, userId: true, whatsappNumber: true, user: { select: { email: true, phone: true } } }
  });
  if (!vendor) return;

  // If verifiedUserId is provided, ensure vendor is owned by this user
  if (verifiedUserId && vendor.userId !== verifiedUserId) {
    logger.warn({ vendorId, verifiedUserId, ownerUserId: vendor.userId }, 'linkPendingGuestOrders: user does not own this vendor - plan NOT attached');
    return;
  }

  const vendorEmail = (vendor.user && vendor.user.email) ? vendor.user.email.toLowerCase() : null;
  const vendorPhone = vendor.whatsappNumber || (vendor.user && vendor.user.phone);
  const p10 = vendorPhone ? last10(vendorPhone) : '';

  const orConditions = [{ matchedVendorId: vendorId }];
  if (vendorEmail) orConditions.push({ email: vendorEmail });
  if (p10 && p10.length === 10) orConditions.push({ phone: { endsWith: p10 } });

  const pendingOrders = await prisma.guestOrder.findMany({
    where: {
      status: 'paid',
      OR: orConditions
    }
  });

  for (const order of pendingOrders) {
    logger.info({ orderId: order.id, vendorId, plan: order.planKey }, 'Ownership verified: activating pending plan for vendor');
    await activatePlanForVendor(vendorId, order, order.razorpayPaymentId).catch((err) => {
      logger.error({ err, orderId: order.id, vendorId }, 'Failed to activate plan from pending guest order');
    });
    await prisma.guestOrder.update({
      where: { id: order.id },
      data: {
        matchedVendorId: vendorId,
        listingState: 'claimed',
        status: 'activated'
      }
    });
  }
}

/**
 * Checks whether an email or phone number is already registered to an existing vendor account or listing.
 */
async function checkContactAvailability({ email, phone }) {
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  const rawPhone = phone ? String(phone).trim() : null;
  const p10 = rawPhone ? last10(rawPhone) : null;

  let existingUser = null;
  if (normalizedEmail) {
    existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { vendor: { select: { id: true, businessName: true, city: true, isActive: true } } }
    });
  }

  let userByPhone = null;
  if (p10 && p10.length === 10) {
    userByPhone = await prisma.user.findFirst({
      where: { phone: { endsWith: p10 } },
      include: { vendor: { select: { id: true, businessName: true, city: true, isActive: true } } }
    });
  }

  let vendorByPhone = null;
  if (p10 && p10.length === 10) {
    vendorByPhone = await prisma.vendor.findFirst({
      where: {
        isActive: true,
        OR: [
          { whatsappNumber: { endsWith: p10 } },
          { alternateMobile: { endsWith: p10 } }
        ]
      },
      select: { id: true, businessName: true, city: true, userId: true, user: { select: { email: true } } }
    });
  }

  const conflicts = [];
  if (existingUser && existingUser.vendor && existingUser.vendor.length > 0) {
    const v = existingUser.vendor[0];
    conflicts.push({
      type: 'email_vendor',
      email: normalizedEmail,
      vendorName: v.businessName,
      vendorId: v.id,
      city: v.city,
      isClaimed: true,
      message: `The email "${normalizedEmail}" is already linked to "${v.businessName}". Please sign in to manage your plan.`
    });
  } else if (existingUser) {
    conflicts.push({
      type: 'email_user',
      email: normalizedEmail,
      message: `An account already exists for "${normalizedEmail}". Please sign in with your password.`
    });
  }

  if (vendorByPhone) {
    const isClaimed = Boolean(vendorByPhone.userId);
    conflicts.push({
      type: 'phone_vendor',
      phone: rawPhone,
      vendorName: vendorByPhone.businessName,
      vendorId: vendorByPhone.id,
      city: vendorByPhone.city,
      isClaimed,
      message: isClaimed
        ? `The phone number is registered with "${vendorByPhone.businessName}". Please sign in to attach this plan.`
        : `The phone number matches listing "${vendorByPhone.businessName}". You can claim this listing instead of creating a duplicate.`
    });
  } else if (userByPhone && userByPhone.vendor && userByPhone.vendor.length > 0) {
    const v = userByPhone.vendor[0];
    conflicts.push({
      type: 'phone_user_vendor',
      phone: rawPhone,
      vendorName: v.businessName,
      vendorId: v.id,
      city: v.city,
      isClaimed: true,
      message: `This phone number is already registered to "${v.businessName}". Please sign in.`
    });
  }

  return {
    available: conflicts.length === 0,
    conflicts
  };
}

/** POST /api/public/checkout/check-availability */
async function checkAvailability(req, res, next) {
  try {
    const { email, phone } = req.body || {};
    const result = await checkContactAvailability({ email, phone });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}

async function notifyAdmin(order, listing) {
  const recipients = ['antriksh@psyber.co'];
  const fallback = env.SUPPORT_EMAIL || env.ADMIN_EMAIL;
  if (fallback && !recipients.includes(fallback)) {
    recipients.push(fallback);
  }

  const amount = `${order.currency} ${(order.amount / 100).toFixed(2)}`;
  const selectedListingStr = `${listing.state}${listing.vendorName ? ` - ${listing.vendorName}` : ''}${listing.vendorId ? ` (vendor ID: ${listing.vendorId})` : ' (No listing selected)'}`;
  const paymentDetailsStr = `Razorpay Order: ${order.razorpayOrderId}, Payment ID: ${order.razorpayPaymentId || 'N/A'}`;

  const rows = [
    ['Name', order.name],
    ['Business name', order.businessName],
    ['City', order.city || '-'],
    ['Phone', order.phone],
    ['Email', order.email],
    ['Selected listing', selectedListingStr],
    ['Purchased plan', order.planLabel || order.planKey],
    ['Amount', amount],
    ['Payment / order details', paymentDetailsStr]
  ].map(([k, v]) => `<tr><td style="padding:8px 12px;font-weight:bold;border:1px solid #e2e8f0;background:#f8fafc;width:200px;">${esc(k)}</td><td style="padding:8px 12px;border:1px solid #e2e8f0;">${esc(v)}</td></tr>`).join('');

  const html = `
    <div style="font-family:sans-serif;max-width:640px;color:#1e293b;line-height:1.5;">
      <h2 style="color:#0f172a;margin-bottom:12px;">New Plan Purchase from /grow</h2>
      <p style="margin-bottom:16px;">A new customer has completed payment. The details are below:</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;border:1px solid #e2e8f0;margin-bottom:20px;">
        ${rows}
      </table>
      <p style="font-size:12px;color:#64748b;">This notification is automatically sent to the management team upon payment verification.</p>
    </div>
  `;

  for (const to of recipients) {
    await emailService.sendAdminNotification(
      to,
      `New Plan Purchase: ${order.planLabel} - ${order.businessName}`,
      html
    ).catch((err) => logger.error({ err, to, orderId: order.id }, 'Guest order admin notification failed'));
  }
}

/**
 * Mark an order paid (idempotent: verify and the webhook can both arrive) and
 * send the receipt + admin alert exactly once.
 * PLAN SAFETY: The purchased plan remains unassigned until ownership is verified!
 */
async function completeOrder(order, paymentId) {
  const updated = await prisma.guestOrder.updateMany({
    where: { id: order.id, status: { not: 'paid' } },
    data: { status: 'paid', razorpayPaymentId: paymentId || null, paidAt: new Date() }
  });
  const fresh = await prisma.guestOrder.findUnique({ where: { id: order.id } });
  const listing = await findListing(fresh);

  const targetVendorId = listing.vendorId || fresh.matchedVendorId;

  if (updated.count === 1) {
    await prisma.guestOrder.update({
      where: { id: fresh.id },
      data: { matchedVendorId: targetVendorId, listingState: listing.state }
    });
    const receipt = await emailService.sendGuestOrderReceiptEmail(fresh.email, fresh, listing)
      .catch((err) => { logger.error({ err, orderId: fresh.id }, 'Guest order receipt email failed'); return null; });
    if (receipt && receipt.ok) {
      await prisma.guestOrder.update({ where: { id: fresh.id }, data: { emailSentAt: new Date() } }).catch(() => {});
    }
    await notifyAdmin(fresh, listing).catch((err) => logger.error({ err, orderId: fresh.id }, 'Guest order admin alert failed'));
    logger.info({ orderId: fresh.id, plan: fresh.planKey, listing: listing.state }, 'Guest order paid - pending ownership verification');
  }

  // NOTE: NEVER attach plan here. Ownership verification (login / claim / register) is required!

  return { order: fresh, listing };
}

/** POST /api/public/checkout/order */
async function createOrder(req, res, next) {
  try {
    const body = req.body || {};
    const countryCode = COUNTRY_CURRENCIES[String(body.countryCode || '').toUpperCase()] ? String(body.countryCode).toUpperCase() : 'IN';
    const currency = COUNTRY_CURRENCIES[countryCode];
    const planType = String(body.planType || '');
    const planKey = String(body.planKey || '');
    const days = parseInt(body.days, 10);
    const picked = await resolvePickedVendor(body.vendorId);
    const buyer = readBuyer(body, countryCode, picked);
    // If buyer picked a claimed listing, lock buyer email/phone to the registered owner's credentials
    if (picked && picked.userId && (!picked.user || picked.user.mustChangePassword === false)) {
      if (picked.user && picked.user.email) {
        buyer.email = picked.user.email.toLowerCase();
      }
      if (picked.whatsappNumber || (picked.user && picked.user.phone)) {
        buyer.phone = picked.whatsappNumber || picked.user.phone;
      }
    } else if (!picked) {
      // New business: verify that entered email and phone do not belong to existing vendor/account
      const check = await checkContactAvailability({ email: buyer.email, phone: buyer.phone });
      if (!check.available) {
        throw new HttpError(409, check.conflicts[0].message, 'ERR_DUPLICATE_CONTACT');
      }
    }

    if (picked) {
      buyer.businessName = picked.businessName.slice(0, 160);
      buyer.city = picked.city;
    } else if (buyer.city.length < 2) {
      throw new HttpError(400, 'Please enter the city your business is in.', 'ERR_INPUT');
    }
    const { amount, planLabel, planDays } = resolvePrice(planType, planKey, days, countryCode, body.testToken);

    let rzpOrder;
    try {
      const resp = await razorpayRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          amount,
          currency,
          receipt: `GUEST_${Date.now()}`,
          notes: { source: 'grow_page', plan: planLabel, business: buyer.businessName.slice(0, 250), city: buyer.city || '', email: buyer.email, phone: buyer.phone }
        })
      });
      rzpOrder = await resp.json();
      if (!resp.ok || !rzpOrder.id) {
        logger.error({ rzpOrder }, 'Guest checkout: Razorpay order creation failed');
        throw new HttpError(400, (rzpOrder.error && rzpOrder.error.description) || 'Could not start the payment. Please try again.', 'ERR_PAYMENT');
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      logger.error({ err }, 'Guest checkout: Razorpay unreachable');
      throw new HttpError(503, 'Payment gateway is unreachable. Please try again shortly.', 'ERR_PAYMENT_GATEWAY');
    }

    await prisma.guestOrder.create({
      data: { razorpayOrderId: rzpOrder.id, planType, planKey, planLabel, planDays, countryCode, currency, amount, ...buyer, matchedVendorId: picked ? picked.id : null }
    });

    res.json({ ok: true, orderId: rzpOrder.id, amount, currency, keyId: env.RAZORPAY.keyId, planLabel });
  } catch (err) {
    next(err);
  }
}

/** POST /api/public/checkout/verify - called by the page after Razorpay succeeds */
async function verifyOrder(req, res, next) {
  try {
    const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body || {};
    if (!orderId || !paymentId || !signature) throw new HttpError(400, 'Missing payment details.', 'ERR_INPUT');
    if (!verifyRazorpaySignature(String(orderId), String(paymentId), String(signature))) {
      throw new HttpError(400, 'Payment could not be verified. If money was deducted, contact us and we will sort it out.', 'ERR_SIGNATURE');
    }
    const order = await prisma.guestOrder.findUnique({ where: { razorpayOrderId: String(orderId) } });
    if (!order) throw new HttpError(404, 'Order not found.', 'ERR_NOT_FOUND');

    const { order: paid, listing } = await completeOrder(order, String(paymentId));
    res.json({
      ok: true,
      guestOrderId: paid.id,
      email: paid.email,
      phone: paid.phone,
      businessName: paid.businessName,
      planLabel: paid.planLabel,
      city: paid.city,
      listing: {
        state: listing.state,
        vendorId: listing.vendorId,
        vendorName: listing.vendorName,
        phoneMasked: listing.phoneMasked,
        actionUrl: listing.actionUrl,
        actionLabel: listing.actionLabel
      }
    });
  } catch (err) {
    next(err);
  }
}

/** Webhook fallback (buyer closed the tab before /verify). Returns true if handled. */
async function handleWebhookPaid(orderId, paymentId) {
  const order = await prisma.guestOrder.findUnique({ where: { razorpayOrderId: orderId } });
  if (!order) return false;
  await completeOrder(order, paymentId);
  return true;
}

async function handleWebhookFailed(orderId) {
  const r = await prisma.guestOrder.updateMany({ where: { razorpayOrderId: orderId, status: 'created' }, data: { status: 'failed' } });
  return r.count > 0;
}

/**
 * POST /api/public/checkout/test-pay
 * Test/Simulate checkout payment without opening Razorpay gateway.
 */
async function testPayment(req, res, next) {
  try {
    const body = req.body || {};
    const countryCode = COUNTRY_CURRENCIES[String(body.countryCode || '').toUpperCase()] ? String(body.countryCode).toUpperCase() : 'IN';
    const currency = COUNTRY_CURRENCIES[countryCode];
    const planType = String(body.planType || 'grow');
    const planKey = String(body.planKey || 'more_leads');
    const days = parseInt(body.days, 10) || 30;
    const picked = await resolvePickedVendor(body.vendorId);
    const buyer = readBuyer(body, countryCode, picked);
    // If buyer picked a claimed listing, lock buyer email/phone to the registered owner's credentials
    if (picked && picked.userId && (!picked.user || picked.user.mustChangePassword === false)) {
      if (picked.user && picked.user.email) {
        buyer.email = picked.user.email.toLowerCase();
      }
      if (picked.whatsappNumber || (picked.user && picked.user.phone)) {
        buyer.phone = picked.whatsappNumber || picked.user.phone;
      }
    } else if (!picked) {
      // New business: verify that entered email and phone do not belong to existing vendor/account
      const check = await checkContactAvailability({ email: buyer.email, phone: buyer.phone });
      if (!check.available) {
        throw new HttpError(409, check.conflicts[0].message, 'ERR_DUPLICATE_CONTACT');
      }
    }

    if (picked) {
      buyer.businessName = picked.businessName.slice(0, 160);
      buyer.city = picked.city;
    } else if (buyer.city.length < 2) {
      throw new HttpError(400, 'Please enter the city your business is in.', 'ERR_INPUT');
    }
    const { amount, planLabel, planDays } = resolvePrice(planType, planKey, days, countryCode, body.testToken);

    const mockOrderId = `order_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const mockPaymentId = `pay_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const order = await prisma.guestOrder.create({
      data: {
        razorpayOrderId: mockOrderId,
        planType,
        planKey,
        planLabel,
        planDays,
        countryCode,
        currency,
        amount,
        ...buyer,
        matchedVendorId: picked ? picked.id : null
      }
    });

    const { order: paid, listing } = await completeOrder(order, mockPaymentId);

    res.json({
      ok: true,
      testMode: true,
      guestOrderId: paid.id,
      email: paid.email,
      phone: paid.phone,
      businessName: paid.businessName,
      planLabel: paid.planLabel,
      city: paid.city,
      listing: {
        state: listing.state,
        vendorId: listing.vendorId,
        vendorName: listing.vendorName,
        phoneMasked: listing.phoneMasked,
        actionUrl: listing.actionUrl,
        actionLabel: listing.actionLabel
      }
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createOrder,
  verifyOrder,
  testPayment,
  checkAvailability,
  checkContactAvailability,
  handleWebhookPaid,
  handleWebhookFailed,
  findListing,
  activatePlanForVendor,
  linkPendingGuestOrders
};

