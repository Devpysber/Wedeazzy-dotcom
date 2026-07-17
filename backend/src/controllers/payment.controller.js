const crypto = require('crypto');
const prisma = require('../config/db');
const env = require('../config/env');
const logger = require('../config/logger');
const { HttpError } = require('../middleware/error');
const emailService = require('../services/email.service');
const whatsappService = require('../services/whatsapp.service');

// Plan pricing: base (INR) → total with 18% GST in paise
const fs = require('fs');
const path = require('path');

function getPlanPricing() {
  try {
    const plans = require('../config/plansConfig').getPlansConfig();
    const pricing = {};
    for (const [key, details] of Object.entries(plans)) {
      if (key === 'Free') continue;
      const base = details.price;
      const totalPaise = Math.round(base * 1.18 * 100);
      pricing[key] = { base, totalPaise };
    }
    return pricing;
  } catch (err) {
    return {
      Premium:  { base: 2999, totalPaise: 353882 },
      Featured: { base: 5999, totalPaise: 707882 }
    };
  }
}

// ---------------------------------------------------------------------------
// Razorpay helpers
// ---------------------------------------------------------------------------

function getRazorpayConfig() {
  const keyId     = env.RAZORPAY.keyId;
  const keySecret = env.RAZORPAY.keySecret;
  if (!keyId || !keySecret) {
    throw new HttpError(503, 'Payment gateway is not configured', 'ERR_PAYMENT_CONFIG');
  }
  return { keyId, keySecret };
}

/** Razorpay REST call with Basic-Auth (key_id:key_secret). */
async function razorpayRequest(path, options = {}) {
  const { keyId, keySecret } = getRazorpayConfig();
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(`https://api.razorpay.com/v1${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${credentials}`,
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Verify HMAC-SHA256 signature returned by Razorpay after a payment. */
function verifyRazorpaySignature(orderId, paymentId, signature) {
  const { keySecret } = getRazorpayConfig();
  const expected = crypto
    .createHmac('sha256', keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}

/** Verify Razorpay webhook payload signature (uses raw request body). */
function verifyWebhookSignature(rawBody, signature) {
  const secret = env.RAZORPAY.webhookSecret;
  if (!secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  return expected === signature;
}

// ---------------------------------------------------------------------------
// Subscription activation / deactivation helpers
// ---------------------------------------------------------------------------

/** Fully downgrade a vendor to Basic and release any pincode lock they hold. */
async function downgradeVendorToBasic(vendorId) {
  await prisma.vendor.update({
    where: { id: vendorId },
    data: {
      subscriptionPlan: 'Free',
      subscriptionExpiry: null,
      featuredUntil: null,
      tier: 'basic',
      razorpayOrderId: null,
      updatedAt: new Date()
    }
  });
  await prisma.pincodeLock.deleteMany({ where: { vendorId } });
}

/** Mark a transaction failed — only downgrades "initiated" rows. */
async function markFailed(merchantOrderId, reason) {
  await prisma.transaction.updateMany({
    where: { id: merchantOrderId, status: 'initiated' },
    data: { status: 'failed', updatedAt: new Date() }
  }).catch(err =>
    logger.error({ err }, `Failed to mark transaction ${merchantOrderId} as failed (${reason})`)
  );
}

/** Activate subscription / campaign after a confirmed Razorpay payment. */
async function activateSubscription(merchantTransactionId, razorpayPaymentId) {
  const txn = await prisma.transaction.findUnique({
    where: { id: merchantTransactionId },
    include: { user: { include: { vendor: true } } }
  });

  if (!txn) {
    logger.error(`Transaction not found: ${merchantTransactionId}`);
    return false;
  }
  if (txn.status === 'success') return true; // idempotent

  const updateCount = await prisma.transaction.updateMany({
    where: { id: merchantTransactionId, status: { notIn: ['success', 'failed', 'refunded'] } },
    data: { status: 'success', gatewayRef: razorpayPaymentId, updatedAt: new Date() }
  });
  if (updateCount.count === 0) {
    logger.info(`Transaction ${merchantTransactionId} already processed concurrently.`);
    return true;
  }

  const updatedTxn = { ...txn, status: 'success', gatewayRef: razorpayPaymentId };
  const vendor = txn.user.vendor;
  if (!vendor) {
    logger.error(`Vendor not found for user: ${txn.userId}`);
    return false;
  }

  // ---- Subscription activation ----
  if (txn.purpose.startsWith('subscription:')) {
    const planName  = txn.purpose.slice(13);
    const now = new Date();
    
    // Check if vendor already has an active subscription for the same plan, if so extend it
    const freshVendor = await prisma.vendor.findUnique({ where: { id: vendor.id } });
    let startDate = now;
    let expiryDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    if (freshVendor && freshVendor.subscriptionPlan === planName && freshVendor.subscriptionExpiry) {
      const currentExpiry = new Date(freshVendor.subscriptionExpiry);
      if (currentExpiry > now) {
        startDate = freshVendor.subscriptionStart || now;
        expiryDate = new Date(currentExpiry.getTime() + 30 * 24 * 60 * 60 * 1000);
      }
    }
    const isFeatured = planName === 'Featured';

    if (planName === 'Featured') {
      const fresh = await prisma.vendor.findUnique({ where: { id: vendor.id } });
      if (fresh?.pincode && fresh?.categorySlug) {
        // Clean expired locks
        await prisma.pincodeLock.deleteMany({
          where: { pincode: fresh.pincode, categorySlug: fresh.categorySlug, lockedUntil: { lt: new Date() } }
        });
        await prisma.pincodeLock.deleteMany({
          where: { vendorId: vendor.id, lockedUntil: { lt: new Date() } }
        });

        const activeLock = await prisma.pincodeLock.findFirst({
          where: { pincode: fresh.pincode, categorySlug: fresh.categorySlug, lockedUntil: { gte: new Date() }, vendorId: { not: vendor.id } }
        });

        if (activeLock) {
          // Pincode taken — downgrade to Premium and alert support
          logger.warn(`Pincode conflict: ${fresh.pincode}/${fresh.categorySlug} taken by ${activeLock.vendorId}. Downgrading ${vendor.id} to Premium.`);
          await prisma.vendor.update({
            where: { id: vendor.id },
            data: { subscriptionPlan: 'Premium', subscriptionStart: startDate, subscriptionExpiry: expiryDate, razorpayOrderId: razorpayPaymentId, tier: 'basic', featuredUntil: null, updatedAt: new Date() }
          });
          const alertEmail = env.SUPPORT_EMAIL || env.ADMIN_EMAIL;
          if (alertEmail) {
            await emailService.sendMail({
              to: alertEmail,
              subject: 'ALERT: Pincode Lock Conflict during Payment Activation',
              html: `<p>Vendor <strong>${vendor.businessName}</strong> (ID: ${vendor.id}) paid for Featured Plan (Txn: ${merchantTransactionId}) but pincode <strong>${fresh.pincode}</strong> / <strong>${fresh.categorySlug}</strong> was already locked by Vendor ID <strong>${activeLock.vendorId}</strong>. Activated Premium instead. Please issue partial refund.</p>`,
              text: `ALERT: Pincode conflict. Vendor ${vendor.businessName} paid for Featured but pincode taken. Activated Premium instead.`
            }).catch(err => logger.error({ err }, 'Failed to send pincode conflict alert'));
          } else {
            logger.warn('Pincode conflict alert not emailed — SUPPORT_EMAIL/ADMIN_EMAIL not configured.');
          }
        } else {
          await prisma.pincodeLock.upsert({
            where: { vendorId: vendor.id },
            update: { pincode: fresh.pincode, categorySlug: fresh.categorySlug, lockedUntil: expiryDate },
            create: { vendorId: vendor.id, pincode: fresh.pincode, categorySlug: fresh.categorySlug, lockedUntil: expiryDate }
          });
          await prisma.vendor.update({
            where: { id: vendor.id },
            data: { subscriptionPlan: 'Featured', subscriptionStart: startDate, subscriptionExpiry: expiryDate, razorpayOrderId: razorpayPaymentId, tier: 'featured', featuredUntil: expiryDate, updatedAt: new Date() }
          });
        }
      } else {
        logger.warn(`Featured plan activated for vendor ${vendor.id} but pincode/category missing.`);
        await prisma.vendor.update({
          where: { id: vendor.id },
          data: { subscriptionPlan: 'Featured', subscriptionStart: startDate, subscriptionExpiry: expiryDate, razorpayOrderId: razorpayPaymentId, tier: 'featured', featuredUntil: expiryDate, updatedAt: new Date() }
        });
      }
    } else {
      await prisma.vendor.update({
        where: { id: vendor.id },
        data: { subscriptionPlan: planName, subscriptionStart: startDate, subscriptionExpiry: expiryDate, razorpayOrderId: razorpayPaymentId, tier: isFeatured ? 'featured' : 'basic', featuredUntil: isFeatured ? expiryDate : null, updatedAt: new Date() }
      });
    }
    logger.info(`Activated ${planName} for Vendor ${vendor.id}. Expiry: ${expiryDate}`);

  } else if (txn.purpose.startsWith('campaign:')) {
    const campaignId = txn.purpose.slice(9);
    await prisma.adCampaign.update({
      where: { id: campaignId },
      data: { paymentStatus: 'paid', paymentRef: razorpayPaymentId, status: 'pending_review', adminStatus: 'approved' }
    });
    logger.info(`Activated Ad Campaign ${campaignId} post-payment.`);
  }

  // ---- Notifications ----
  const vendorName   = vendor.businessName;
  const userEmail    = txn.user.email;
  const userPhone    = txn.user.phone;
  const planLabel    = txn.purpose.startsWith('subscription:') ? txn.purpose.slice(13) : 'Ad Campaign';
  const amountRs     = (txn.amount / 100).toFixed(2);

  if (userEmail) {
    await emailService.sendPaymentReceiptEmail(userEmail, updatedTxn, vendorName).catch(err =>
      logger.error({ err }, 'Failed to send payment receipt email')
    );
  }
  if (userPhone) {
    await whatsappService.sendTemplate(userPhone, 'payment_receipt', {
      planName: planLabel, amount: amountRs, txnId: merchantTransactionId,
      dashboardUrl: `${env.PUBLIC_BASE_URL}/pages/bdashboard.html`
    }).catch(err => logger.error({ err }, 'Failed to send payment receipt WhatsApp'));
  }

  return true;
}

async function getVendorForRequest(req, options = {}) {
  const vendorId = req.headers['x-vendor-id'] || req.query.vendorId;
  if (vendorId) {
    const v = await prisma.vendor.findFirst({
      where: { id: vendorId, userId: req.user.id },
      ...options
    });
    if (v) return v;
  }
  return await prisma.vendor.findFirst({
    where: { userId: req.user.id },
    ...options
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

/**
 * POST /api/payment/initiate
 * Creates a Razorpay Order and returns orderId + keyId to the frontend.
 * The frontend opens the Razorpay modal; no server-side redirect needed.
 */
async function initiatePayment(req, res, next) {
  try {
    const { planName, campaignId } = req.body || {};

    if (!req.user || req.user.role !== 'vendor') {
      throw new HttpError(403, 'Only vendors can purchase subscription plans or ad campaigns', 'ERR_FORBIDDEN');
    }

    const vendor = await getVendorForRequest(req);
    if (!vendor) throw new HttpError(404, 'Vendor profile not found. Please register first.', 'ERR_NO_VENDOR');

    let amountPaise = 0;
    let purpose = '';
    let meta = { vendorId: vendor.id };

    if (campaignId) {
      const campaign = await prisma.adCampaign.findUnique({ where: { id: campaignId } });
      if (!campaign || campaign.vendorId !== vendor.id) {
        throw new HttpError(404, 'Campaign not found or does not belong to you', 'ERR_NOT_FOUND');
      }
      const totalAmount = campaign.totalAmount || (campaign.dailyBudget * campaign.durationDays);
      amountPaise       = totalAmount * 100;
      purpose           = `campaign:${campaignId}`;
      meta.campaignId   = campaignId;
      meta.baseAmount   = campaign.baseAmount || Math.round(totalAmount / 1.18);
    } else {
      const pricingMap = getPlanPricing();
      if (!planName || !pricingMap[planName]) {
        throw new HttpError(400, 'Invalid subscription plan selected', 'ERR_INPUT');
      }
      const pricing   = pricingMap[planName];
      amountPaise     = pricing.totalPaise;
      purpose         = `subscription:${planName}`;
      meta.planName   = planName;
      meta.baseAmount = pricing.base;

      if (planName === 'Featured') {
        if (vendor.pincode && vendor.categorySlug) {
          // Clean expired locks then check availability
          await prisma.pincodeLock.deleteMany({
            where: { pincode: vendor.pincode, categorySlug: vendor.categorySlug, lockedUntil: { lt: new Date() } }
          });
          await prisma.pincodeLock.deleteMany({ where: { vendorId: vendor.id, lockedUntil: { lt: new Date() } } });

          const existingLock = await prisma.pincodeLock.findFirst({
            where: { pincode: vendor.pincode, categorySlug: vendor.categorySlug, lockedUntil: { gte: new Date() }, vendorId: { not: vendor.id } }
          });

          if (existingLock) {
            throw new HttpError(400, `The pincode ${vendor.pincode} is already locked for the ${vendor.categorySlug || 'selected'} category by another featured vendor.`, 'ERR_PINCODE_LOCKED');
          }

          // Reserve for 15 minutes
          await prisma.pincodeLock.upsert({
            where: { vendorId: vendor.id },
            update:  { pincode: vendor.pincode, categorySlug: vendor.categorySlug, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
            create:  { vendorId: vendor.id, pincode: vendor.pincode, categorySlug: vendor.categorySlug, lockedUntil: new Date(Date.now() + 15 * 60 * 1000) }
          });
        }
      }
    }

    // Expire stale "initiated" transactions older than 20 min
    const staleThreshold = new Date(Date.now() - 20 * 60 * 1000);
    await prisma.transaction.updateMany({
      where: { userId: req.user.id, status: 'initiated', createdAt: { lt: staleThreshold } },
      data: { status: 'failed', updatedAt: new Date() }
    });

    // Block duplicate in-flight checkout for same purpose
    const inFlight = await prisma.transaction.findFirst({
      where: { userId: req.user.id, purpose, status: 'initiated', createdAt: { gte: staleThreshold } },
      orderBy: { createdAt: 'desc' }
    });
    if (inFlight) {
      throw new HttpError(409, 'A payment for this plan is already in progress. Complete or wait for it to expire before retrying.', 'ERR_PAYMENT_IN_PROGRESS');
    }

    const txnId = `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Save transaction record
    await prisma.transaction.create({
      data: { id: txnId, userId: req.user.id, amount: amountPaise, purpose, gateway: 'razorpay', status: 'initiated', meta }
    });

    // Create Razorpay order
    logger.info(`Creating Razorpay order for txn: ${txnId}, amount: ${amountPaise} paise`);
    let razorpayOrder;
    try {
      const resp = await razorpayRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt: txnId,
          notes: { vendorId: vendor.id, purpose, txnId }
        })
      });
      razorpayOrder = await resp.json();
      if (!resp.ok || !razorpayOrder.id) {
        logger.error({ razorpayOrder }, 'Razorpay order creation failed');
        await prisma.transaction.update({ where: { id: txnId }, data: { status: 'failed', updatedAt: new Date() } })
          .catch(e => logger.error({ e }, 'Failed to mark txn failed after Razorpay order error'));
        throw new HttpError(400, razorpayOrder.error?.description || 'Payment gateway order creation failed', 'ERR_PAYMENT');
      }
    } catch (err) {
      if (err instanceof HttpError) throw err;
      logger.error({ err }, `Razorpay order creation request failed for txn: ${txnId}`);
      await prisma.transaction.update({ where: { id: txnId }, data: { status: 'failed', updatedAt: new Date() } })
        .catch(e => logger.error({ e }, 'Failed to mark txn failed after Razorpay network error'));
      throw new HttpError(503, 'Payment gateway is unreachable. Please try again shortly.', 'ERR_PAYMENT_GATEWAY');
    }

    // Store Razorpay order ID in transaction meta
    await prisma.transaction.update({
      where: { id: txnId },
      data: { meta: { ...meta, razorpayOrderId: razorpayOrder.id } }
    }).catch(err => logger.error({ err }, 'Failed to store razorpayOrderId in transaction meta'));

    res.json({
      ok: true,
      orderId: razorpayOrder.id,
      transactionId: txnId,
      amount: amountPaise,
      currency: 'INR',
      keyId: env.RAZORPAY.keyId
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/payment/verify
 * Called by the frontend after Razorpay modal completes successfully.
 * Verifies HMAC-SHA256 signature and activates the subscription.
 */
async function verifyPayment(req, res, next) {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, transactionId } = req.body || {};

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !transactionId) {
      throw new HttpError(400, 'Missing required payment verification fields', 'ERR_INPUT');
    }

    if (!verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
      logger.error({ transactionId, razorpay_order_id }, 'Razorpay payment signature verification failed');
      await markFailed(transactionId, 'verify-signature-mismatch');
      throw new HttpError(400, 'Payment verification failed — signature mismatch.', 'ERR_SIGNATURE');
    }

    logger.info({ transactionId, razorpay_payment_id }, 'Razorpay payment signature verified ✅');

    const activated = await activateSubscription(transactionId, razorpay_payment_id);
    if (!activated) {
      throw new HttpError(500, 'Payment verified but subscription activation failed. Please contact support.', 'ERR_ACTIVATION');
    }

    const txn = await prisma.transaction.findUnique({ where: { id: transactionId } });
    const planName = txn?.purpose?.startsWith('subscription:') ? txn.purpose.slice(13) : 'Ad Campaign';

    res.json({
      ok: true,
      message: 'Payment verified and subscription activated successfully.',
      plan: planName,
      amount: txn?.amount ? (txn.amount / 100).toFixed(2) : '0',
      transactionId,
      razorpayPaymentId: razorpay_payment_id
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Check payment status with Razorpay — used by reconcile cron.
 * Returns 'COMPLETED' | 'PENDING' | 'FAILED' | 'ERROR'.
 */
async function checkRazorpayPaymentStatus(razorpayOrderId) {
  try {
    const resp = await razorpayRequest(`/orders/${razorpayOrderId}/payments`);
    const data = await resp.json();
    if (!resp.ok) return { state: 'ERROR', raw: data };

    const payments = data.items || [];
    if (payments.length === 0) return { state: 'PENDING', raw: data };

    const captured = payments.find(p => p.status === 'captured');
    if (captured) return { state: 'COMPLETED', raw: captured, paymentId: captured.id };

    const failed = payments.find(p => p.status === 'failed');
    if (failed) return { state: 'FAILED', raw: failed };

    return { state: 'PENDING', raw: data };
  } catch (err) {
    logger.error({ err }, `Razorpay status check failed for order: ${razorpayOrderId}`);
    return { state: 'ERROR', raw: null };
  }
}

/**
 * POST /api/payment/webhook
 * Server-to-server webhook from Razorpay.
 * Signature: X-Razorpay-Signature = HMAC-SHA256(rawBody, webhookSecret)
 */
async function handleWebhook(req, res, next) {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody   = req.rawBody;

    if (!rawBody) {
      logger.error('Razorpay webhook received but rawBody not captured — check server.js express.json verify option');
      return res.status(400).json({ success: false, error: 'Raw body not available' });
    }

    if (!env.RAZORPAY.webhookSecret) {
      logger.error('RAZORPAY_WEBHOOK_SECRET not configured — rejecting webhook');
      return res.status(503).json({ success: false, error: 'Webhook not configured' });
    }

    if (!signature || !verifyWebhookSignature(rawBody, signature)) {
      logger.error('Razorpay webhook signature verification failed');
      return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
    }

    const body    = JSON.parse(rawBody);
    const event   = body.event;
    const payload = body.payload;

    logger.info({ event }, 'Received Razorpay webhook');

    if (event === 'payment.captured' || event === 'order.paid') {
      const payment  = payload.payment?.entity || payload.order?.entity;
      const orderId  = payment?.order_id || payload.order?.entity?.id;
      const paymentId = payload.payment?.entity?.id;

      if (!orderId) {
        logger.warn({ event, body }, 'Webhook missing order_id');
        return res.json({ success: true });
      }

      // Find our transaction by razorpayOrderId stored in meta
      const txn = await prisma.transaction.findFirst({
        where: { meta: { path: '$.razorpayOrderId', equals: orderId }, status: { notIn: ['success', 'failed', 'refunded'] } }
      });

      if (!txn) {
        logger.warn({ orderId }, 'Webhook: no matching initiated transaction found');
        return res.json({ success: true });
      }

      await activateSubscription(txn.id, paymentId || orderId);
      return res.json({ success: true });
    }

    if (event === 'payment.failed') {
      const orderId = payload.payment?.entity?.order_id;
      if (orderId) {
        const txn = await prisma.transaction.findFirst({
          where: { meta: { path: '$.razorpayOrderId', equals: orderId } }
        });
        if (txn) await markFailed(txn.id, 'webhook-payment-failed');
      }
      return res.json({ success: true });
    }

    // All other events — ack and ignore
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Error handling Razorpay webhook');
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/payment/cancel
 * Vendor cancels their own subscription.
 */
async function cancelMySubscription(req, res, next) {
  try {
    const vendor = await getVendorForRequest(req, { include: { user: true } });
    if (!vendor) throw new HttpError(404, 'Vendor profile not found', 'ERR_NO_VENDOR');

    await downgradeVendorToBasic(vendor.id);

    const userEmail = vendor.user?.email;
    const userPhone = vendor.user?.phone;
    if (userEmail) {
      await emailService.sendMail({
        to: userEmail,
        subject: 'Subscription Cancelled - WedEazzy.com',
        html: `<p>Dear ${vendor.businessName} Team,</p><p>Your WedEazzy subscription has been cancelled. Your listing is now on the <strong>Free Plan</strong>. Pincode lock released.</p><p>Best regards,<br>WedEazzy Relations Team</p>`,
        text: `Subscription cancelled. Listing downgraded to Free Plan.`
      }).catch(err => logger.error({ err }, 'Failed to send cancellation email'));
    }
    if (userPhone) {
      await whatsappService.sendWa({ to: userPhone, body: `*Subscription Cancelled - WedEazzy.com*\n\nYour subscription has been cancelled. Listing is now on Free plan.`, template: 'subscription_cancelled' })
        .catch(err => logger.error({ err }, 'Failed to send cancellation WhatsApp'));
    }

    res.json({ ok: true, message: 'Subscription cancelled successfully.' });
  } catch (err) { next(err); }
}

/**
 * POST /api/admin/transactions/:id/refund
 * Admin refunds a successful transaction via Razorpay Refunds API.
 */
async function refundTransaction(req, res, next) {
  try {
    const { id } = req.params;
    const txn = await prisma.transaction.findUnique({
      where: { id },
      include: { user: { include: { vendor: true } } }
    });
    if (!txn) throw new HttpError(404, 'Transaction not found', 'ERR_NOT_FOUND');
    if (txn.status !== 'success') throw new HttpError(400, 'Only successful transactions can be refunded', 'ERR_INPUT');
    if (!txn.gatewayRef) throw new HttpError(400, 'No Razorpay payment ID on record — cannot refund', 'ERR_INPUT');

    let refundSuccess = false;
    let refundId = null;

    try {
      const resp = await razorpayRequest(`/payments/${txn.gatewayRef}/refund`, {
        method: 'POST',
        body: JSON.stringify({ amount: txn.amount })
      });
      const data = await resp.json();
      if (resp.ok && data.id) {
        refundSuccess = true;
        refundId = data.id;
      } else {
        logger.error({ data }, 'Razorpay refund API responded with failure');
      }
    } catch (err) {
      logger.error({ err }, 'Razorpay refund API request failed');
    }

    // A refund is only ever recorded when Razorpay actually confirms it (real
    // refund id in the API response). Test mode still works because Razorpay's
    // test environment returns a genuine refund id for rzp_test_* keys. There
    // is deliberately NO mock/fake success fallback — otherwise a payment could
    // be marked refunded and the subscription cancelled without money moving.
    if (!refundSuccess) throw new HttpError(400, 'Refund failed at the payment gateway — no changes were made. The payment is still marked successful and the subscription remains active. Please retry or check the Razorpay dashboard.', 'ERR_PAYMENT');

    const currentMeta = txn.meta && typeof txn.meta === 'object' ? txn.meta : {};
    await prisma.transaction.update({
      where: { id: txn.id },
      data: { status: 'refunded', meta: { ...currentMeta, refundId, refundedAt: new Date().toISOString() }, updatedAt: new Date() }
    });

    const vendor = txn.user.vendor;
    if (txn.purpose.startsWith('subscription:') && vendor) {
      await downgradeVendorToBasic(vendor.id);
    } else if (txn.purpose.startsWith('campaign:')) {
      await prisma.adCampaign.update({
        where: { id: txn.purpose.slice(9) },
        data: { paymentStatus: 'failed', status: 'draft', adminStatus: 'rejected', adminNotes: 'Payment refunded by administrator.' }
      });
    }

    const userEmail  = txn.user.email;
    const userPhone  = txn.user.phone;
    const vendorName = vendor?.businessName || txn.user.name || 'Vendor';
    const planLabel  = txn.purpose.startsWith('subscription:') ? txn.purpose.slice(13) : 'Campaign';
    const refundAmt  = txn.amount / 100;

    if (userEmail) {
      await emailService.sendMail({
        to: userEmail,
        subject: 'Payment Refund Issued - WedEazzy.com',
        html: `<p>Dear ${vendorName} Team,</p><p>We have processed a refund of <strong>₹${refundAmt.toFixed(2)}</strong> for transaction <strong>${txn.id}</strong> (${planLabel} Plan). Your listing has been downgraded to the Basic Plan. The amount will reflect in 5-7 business days.</p><p>Best regards,<br>WedEazzy Billing Team</p>`,
        text: `Refund of ₹${refundAmt.toFixed(2)} processed for transaction ${txn.id}.`
      }).catch(err => logger.error({ err }, 'Failed to send refund email'));
    }
    if (userPhone) {
      await whatsappService.sendWa({ to: userPhone, body: `*Refund Issued - WedEazzy.com*\n\nRefund of *₹${refundAmt.toFixed(2)}* for transaction *${txn.id}* has been issued. Amount will credit in 5-7 days.`, template: 'refund_issued' })
        .catch(err => logger.error({ err }, 'Failed to send refund WhatsApp'));
    }

    res.json({ ok: true, message: 'Transaction refunded and subscription deactivated.' });
  } catch (err) { next(err); }
}

/**
 * POST /api/admin/vendors/:id/cancel-subscription
 * Admin cancels a specific vendor's subscription.
 */
async function cancelVendorSubscription(req, res, next) {
  try {
    const { id } = req.params;
    const vendor = await prisma.vendor.findUnique({ where: { id }, include: { user: true } });
    if (!vendor) throw new HttpError(404, 'Vendor not found', 'ERR_NOT_FOUND');

    await downgradeVendorToBasic(id);

    if (vendor.user?.email) {
      await emailService.sendMail({
        to: vendor.user.email,
        subject: 'Subscription Cancelled - WedEazzy.com',
        html: `<p>Dear ${vendor.businessName} Team,</p><p>Your WedEazzy subscription has been cancelled by the administrator. Your profile is now on the <strong>Free Plan</strong>.</p>`,
        text: `Your subscription has been cancelled by the administrator. Downgraded to Free Plan.`
      }).catch(err => logger.error({ err }, 'Failed to send admin cancellation email'));
    }

    res.json({ ok: true, message: 'Subscription cancelled and vendor downgraded.' });
  } catch (err) { next(err); }
}

/**
 * GET /api/payment/transactions
 * Returns the authenticated vendor's transaction history.
 */
async function getMyTransactions(req, res, next) {
  try {
    const txns = await prisma.transaction.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json({ ok: true, data: txns });
  } catch (err) { next(err); }
}

/**
 * Reconcile transactions stuck in "initiated" (abandoned checkouts).
 * Called by cron every 10 minutes.
 */
async function reconcileStuckTransactions() {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  const stuck = await prisma.transaction.findMany({
    where: { status: 'initiated', gateway: 'razorpay', createdAt: { lt: cutoff } },
    take: 100
  });

  let resolved = 0;
  for (const txn of stuck) {
    try {
      const meta = txn.meta && typeof txn.meta === 'object' ? txn.meta : {};
      const razorpayOrderId = meta.razorpayOrderId;
      if (!razorpayOrderId) {
        await markFailed(txn.id, 'reconcile-no-razorpay-order-id');
        resolved++;
        continue;
      }

      const { state, paymentId } = await checkRazorpayPaymentStatus(razorpayOrderId);
      if (state === 'COMPLETED') {
        await activateSubscription(txn.id, paymentId);
        resolved++;
      } else if (state === 'FAILED') {
        await markFailed(txn.id, 'reconcile-payment-failed');
        resolved++;
      }
      // PENDING / ERROR — leave for next run
    } catch (err) {
      logger.error({ err, txnId: txn.id }, '[Reconcile] Failed to check stuck transaction');
    }
  }

  if (stuck.length > 0) {
    logger.info(`[Reconcile] Checked ${stuck.length} stuck transactions, resolved ${resolved}.`);
  }
  return { checked: stuck.length, resolved };
}

module.exports = {
  initiatePayment,
  verifyPayment,
  handleWebhook,
  cancelMySubscription,
  refundTransaction,
  cancelVendorSubscription,
  getMyTransactions,
  reconcileStuckTransactions,
  downgradeVendorToBasic,
  activateSubscription
};
