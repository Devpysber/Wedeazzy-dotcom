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

function readBuyer(body, countryCode) {
  const name = sanitizeText(body.name, 120);
  const businessName = sanitizeText(body.businessName, 160);
  const email = sanitizeText(body.email, 190).toLowerCase();
  const rawPhone = sanitizeText(body.phone, 32);
  const city = sanitizeText(body.city, 80);
  if (name.length < 2) throw new HttpError(400, 'Please enter your name.', 'ERR_INPUT');
  if (businessName.length < 2) throw new HttpError(400, 'Please enter your business name.', 'ERR_INPUT');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Please enter a valid email address.', 'ERR_INPUT');

  let phone;
  if (countryCode === 'IN') {
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
    select: { id: true, businessName: true, city: true, userId: true, user: { select: { mustChangePassword: true } } }
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
  const signIn = { actionUrl: `${base}/pages/vendor-login.html?next=grow`, actionLabel: 'Sign in to your dashboard' };

  const user = await prisma.user.findFirst({
    where: { role: 'vendor', OR: [{ email }, ...(p10.length === 10 ? [{ phone: { endsWith: p10 } }] : [])] },
    select: { vendor: { select: { id: true, businessName: true }, take: 1 } }
  });
  if (user) {
    const v = user.vendor && user.vendor[0];
    return { state: 'account', vendorId: v ? v.id : null, vendorName: v ? v.businessName : null, ...signIn };
  }

  if (matchedVendorId) {
    const picked = await prisma.vendor.findUnique({
      where: { id: matchedVendorId },
      select: { id: true, businessName: true, userId: true, user: { select: { mustChangePassword: true } } }
    });
    if (picked) {
      if (picked.userId && (!picked.user || picked.user.mustChangePassword === false)) {
        return { state: 'claimed', vendorId: picked.id, vendorName: picked.businessName, ...signIn };
      }
      return { state: 'unclaimed', vendorId: picked.id, vendorName: picked.businessName, actionUrl: `${base}/pages/claim.html`, actionLabel: 'Claim your listing' };
    }
  }

  const or = [{ businessName }];
  if (p10.length === 10) or.push({ whatsappNumber: { endsWith: p10 } }, { alternateMobile: { endsWith: p10 } });
  const candidates = await prisma.vendor.findMany({
    where: { isActive: true, OR: or },
    select: { id: true, businessName: true, whatsappNumber: true, alternateMobile: true, userId: true, user: { select: { mustChangePassword: true } } },
    take: 10
  });
  // Prefer a phone match over a name-only match
  const byPhone = candidates.find((v) => p10.length === 10 && (last10(v.whatsappNumber) === p10 || last10(v.alternateMobile) === p10));
  const v = byPhone || candidates[0];
  if (!v) {
    return { state: 'new', vendorId: null, vendorName: null, actionUrl: `${base}/pages/claim.html?mode=register`, actionLabel: 'Register your business free' };
  }
  // Same rule as claim.controller search(): owned and password set = claimed
  if (v.userId && (!v.user || v.user.mustChangePassword === false)) {
    return { state: 'claimed', vendorId: v.id, vendorName: v.businessName, ...signIn };
  }
  return { state: 'unclaimed', vendorId: v.id, vendorName: v.businessName, actionUrl: `${base}/pages/claim.html`, actionLabel: 'Claim your listing' };
}

async function notifyAdmin(order, listing) {
  const to = env.SUPPORT_EMAIL || env.ADMIN_EMAIL;
  if (!to) {
    logger.warn({ orderId: order.id }, 'Guest order paid but SUPPORT_EMAIL/ADMIN_EMAIL not set - no admin alert sent');
    return;
  }
  const amount = `${order.currency} ${(order.amount / 100).toFixed(2)}`;
  const rows = [
    ['Plan', order.planLabel], ['Amount', amount], ['Name', order.name], ['Business', order.businessName],
    ['City', order.city || '-'], ['Email', order.email], ['Phone', order.phone], ['Country', order.countryCode],
    ['Listing', `${listing.state}${listing.vendorName ? ` - ${listing.vendorName}` : ''}${listing.vendorId ? ` (vendor ${listing.vendorId})` : ''}`],
    ['Razorpay order', order.razorpayOrderId], ['Razorpay payment', order.razorpayPaymentId || '-']
  ].map(([k, v]) => `<tr><td style="padding:6px 10px;font-weight:bold;">${esc(k)}</td><td style="padding:6px 10px;">${esc(v)}</td></tr>`).join('');
  await emailService.sendAdminNotification(to, `New plan purchase: ${order.planLabel} - ${order.businessName}`,
    `<p>A plan was bought from the /grow page. Set up the campaign and link it to the vendor's listing.</p><table style="border-collapse:collapse;font-size:14px;">${rows}</table>`);
}

/**
 * Mark an order paid (idempotent: verify and the webhook can both arrive) and
 * send the receipt + admin alert exactly once.
 */
async function completeOrder(order, paymentId) {
  const updated = await prisma.guestOrder.updateMany({
    where: { id: order.id, status: { not: 'paid' } },
    data: { status: 'paid', razorpayPaymentId: paymentId || null, paidAt: new Date() }
  });
  const fresh = await prisma.guestOrder.findUnique({ where: { id: order.id } });
  const listing = await findListing(fresh);

  if (updated.count === 1) {
    await prisma.guestOrder.update({ where: { id: fresh.id }, data: { matchedVendorId: listing.vendorId || fresh.matchedVendorId, listingState: listing.state } });
    const receipt = await emailService.sendGuestOrderReceiptEmail(fresh.email, fresh, listing)
      .catch((err) => { logger.error({ err, orderId: fresh.id }, 'Guest order receipt email failed'); return null; });
    if (receipt && receipt.ok) {
      await prisma.guestOrder.update({ where: { id: fresh.id }, data: { emailSentAt: new Date() } }).catch(() => {});
    }
    await notifyAdmin(fresh, listing).catch((err) => logger.error({ err, orderId: fresh.id }, 'Guest order admin alert failed'));
    logger.info({ orderId: fresh.id, plan: fresh.planKey, listing: listing.state }, 'Guest order paid');
  }
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
    const buyer = readBuyer(body, countryCode);
    const picked = await resolvePickedVendor(body.vendorId);
    // No sign-in is required to pay. After payment, verifyOrder tells the
    // buyer whether to sign in (claimed listing), claim it, or register.
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
      email: paid.email,
      planLabel: paid.planLabel,
      city: paid.city,
      listing: { state: listing.state, vendorName: listing.vendorName, actionUrl: listing.actionUrl, actionLabel: listing.actionLabel }
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

module.exports = { createOrder, verifyOrder, handleWebhookPaid, handleWebhookFailed, findListing };
