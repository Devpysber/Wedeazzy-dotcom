/**
 * Dev helper: walk a /grow guest checkout end to end without opening Razorpay.
 *
 * Creates a real (test-mode) Razorpay order through our own API, then signs the
 * success callback with the local RAZORPAY_KEY_SECRET exactly as Razorpay would
 * and posts it to /api/public/checkout/verify. Prints what the buyer sees after
 * payment, what was stored, and whether the emails went out.
 *
 *   node backend/src/scripts/simulate-guest-payment.js
 *   node backend/src/scripts/simulate-guest-payment.js --business "Royal Palace Banquet" --city Mumbai
 *   node backend/src/scripts/simulate-guest-payment.js --base http://localhost:4000 --plan whatsapp_leads --days 10
 *   node backend/src/scripts/simulate-guest-payment.js --keep     (don't delete the test order)
 *
 * Only for local/test keys. Refuses to run against live Razorpay keys.
 */
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });
const prisma = require('../config/db');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:4000');
const KEEP = args.includes('--keep');

if (!/^rzp_test/.test(process.env.RAZORPAY_KEY_ID || '')) {
  console.error('Refusing to run: RAZORPAY_KEY_ID is not a test key.');
  process.exit(1);
}

const post = async (p, body) => {
  const r = await fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

(async () => {
  const businessName = arg('business', 'Zzq Test Studio ' + Date.now());
  const buyer = {
    planType: arg('planType', 'grow'),
    planKey: arg('plan', 'more_leads'),
    days: Number(arg('days', 30)),
    countryCode: arg('country', 'IN'),
    name: arg('name', 'Test Buyer'),
    businessName,
    city: arg('city', 'Pune'),
    email: arg('email', 'guest.checkout.test@example.com'),
    phone: arg('phone', '9123456780')
  };

  // If the business is already listed, link the order to that listing like the page does
  const listed = await prisma.vendor.findFirst({
    where: { isActive: true, businessName }, select: { id: true, businessName: true, city: true, userId: true }
  });
  if (listed) buyer.vendorId = listed.id;

  console.log('1. Creating order for:', buyer.businessName, listed ? `(matched listing ${listed.id})` : '(not listed)');
  const order = await post('/api/public/checkout/order', buyer);
  if (order.status !== 200) return console.error('   order failed:', order.status, order.body.message || order.body);
  console.log('   order:', order.body.orderId, '| amount:', (order.body.amount / 100).toLocaleString('en-IN'), order.body.currency, '|', order.body.planLabel);

  const paymentId = 'pay_SIM' + crypto.randomBytes(6).toString('hex');
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${order.body.orderId}|${paymentId}`).digest('hex');

  console.log('2. Posting the signed "payment successful" callback…');
  const verify = await post('/api/public/checkout/verify', {
    razorpay_order_id: order.body.orderId, razorpay_payment_id: paymentId, razorpay_signature: signature
  });
  if (verify.status !== 200) return console.error('   verify failed:', verify.status, verify.body.message || verify.body);

  const l = verify.body.listing || {};
  console.log('3. What the buyer sees after payment:');
  console.log('   receipt email to :', verify.body.email);
  console.log('   listing state    :', l.state, '(account/claimed = sign in, unclaimed = claim, new = register)');
  if (l.vendorName) console.log('   matched listing  :', l.vendorName);
  console.log('   button           :', l.actionLabel, '->', l.actionUrl);

  const row = await prisma.guestOrder.findUnique({ where: { razorpayOrderId: order.body.orderId } });
  console.log('4. Stored order row:');
  console.log('   status:', row.status, '| paidAt:', row.paidAt, '| payment:', row.razorpayPaymentId);
  console.log('   business:', row.businessName, '| city:', row.city || '-', '| linked listing:', row.matchedVendorId || 'none');
  console.log('   receipt email sent at:', row.emailSentAt || 'not sent (check SMTP settings / server log)');

  if (!KEEP) {
    await prisma.guestOrder.delete({ where: { id: row.id } });
    console.log('5. Test order deleted (pass --keep to leave it in the database).');
  }
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
