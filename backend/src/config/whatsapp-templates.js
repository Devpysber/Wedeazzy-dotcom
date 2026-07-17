/**
 * Body templates for outbound WhatsApp messages.
 * {{var}} placeholders are replaced by whatsapp.service.sendTemplate(toE164, key, { var: value }).
 *
 * Template keys:
 *  login_otp              — Phone OTP for login
 *  vendor_welcome         — New vendor registration confirmed
 *  vendor_profile_incomplete — Vendor profile nudge
 *  vendor_featured_pitch  — Sales pitch for featured listing
 *  vendor_new_inquiry     — Full inquiry details forwarded to vendor (post-admin gating)
 *  vendor_approved        — Vendor listing approved by admin
 *  couple_welcome         — New couple registration
 *  couple_task_reminder   — Planning task due reminder
 *  booking_confirmed      — Booking confirmed notification
 *  booking_cancelled      — Booking cancelled notification
 *  admin_new_lead         — New inquiry alert to admin
 *  payment_receipt        — Subscription/campaign payment receipt
 */
module.exports = {

  login_otp:
    '*WedEazzy.com* — your login code:\n\n*{{code}}*\n\nValid for {{minutes}} minutes. Do not share this code with anyone.',

  vendor_welcome:
    'Namaste {{name}}! 🙏\n\nYour *{{businessName}}* listing is now *live* on WedEazzy.com 🎉\n\nNext steps:\n1. Complete your profile (photos, services, pricing)\n2. Wedding-ready couples in {{city}} can now reach you\n\nLogin: {{loginUrl}}\n\n— Team WedEazzy',

  vendor_profile_incomplete:
    'Hi {{name}}, your WedEazzy listing for *{{businessName}}* is only *{{percent}}% complete*.\n\nCouples shortlist complete profiles 4× more often.\n\nFinish in 5 minutes: {{loginUrl}}\n\n— Team WedEazzy',

  vendor_featured_pitch:
    'Hi {{name}},\n\nWe have *one featured spot left* in pincode {{pincode}} for *{{category}}*.\n\nFeatured = top of listings + branded promo + couple notifications.\n\nOne-time: *₹5,000*.\nPay: {{payUrl}}\n\nReserved for you for the next 24 hours.\n\n— {{salesName}}, WedEazzy',

  vendor_new_inquiry:
    '*New wedding inquiry on WedEazzy!* 💍\n\n*Couple:* {{coupleName}}\n*Phone:* {{couplePhone}}\n*Event date:* {{eventDate}}\n*City:* {{city}}\n*Guests:* {{guests}}\n*Budget:* {{budget}}\n\n{{notes}}\n\nRespond fast — first 3 vendors to reply usually win the booking.\n\n— Team WedEazzy',

  vendor_approved:
    'Great news, {{name}}! ✅\n\n*{{businessName}}* has been *verified and approved* on WedEazzy.com.\n\nYour listing is now visible to thousands of couples looking for {{category}} services in {{city}}.\n\nLogin to complete your profile: {{loginUrl}}\n\n— Team WedEazzy',

  couple_welcome:
    'Hi {{name}}! 💕\n\nWelcome to WedEazzy — your wedding planning dashboard is ready:\n\n{{dashboardUrl}}\n\n• Save vendors you love\n• Get reminders for every shaadi task\n• Direct WhatsApp to verified vendors\n\nFree always for couples. Happy planning! 🌸\n\n— Team WedEazzy',

  couple_task_reminder:
    '⏰ *Wedding planning reminder*\n\n{{task}}\n\nDue: {{dueDate}}\n\nDashboard: {{dashboardUrl}}\n\n— Team WedEazzy',

  booking_confirmed:
    `✅ *Booking Confirmed!*\n\nHi {{name}}, your booking with *{{vendorName}}* has been confirmed.\n\n*Event Date:* {{eventDate}}\n*Venue / Service:* {{vendorName}}\n*Amount:* ₹{{amount}}\n*Booking ID:* {{bookingId}}\n\nNeed to make changes? Contact us at ${process.env.SUPPORT_EMAIL || 'support@wedeazzy.com'}.\n\n— Team WedEazzy`,

  booking_cancelled:
    `❌ *Booking Cancelled*\n\nHi {{name}}, your booking with *{{vendorName}}* (Booking ID: {{bookingId}}) has been cancelled.\n\nIf this was unexpected, please contact ${process.env.SUPPORT_EMAIL || 'support@wedeazzy.com'} immediately.\n\n— Team WedEazzy`,

  admin_new_lead:
    '*ADMIN: new lead on WedEazzy* 🔔\n\n{{summary}}\n\n*Couple WA:* {{couplePhone}}\n*Vendor:* {{vendorName}} ({{vendorPhone}})\n\nForward & follow up in <1h.',

  payment_receipt:
    '💳 *Payment Confirmed - WedEazzy.com* 🎉\n\nDear Partner,\n\nWe have received your payment for the *{{planName}} Plan*.\n\n*Amount Paid:* ₹{{amount}} (inc. GST)\n*Transaction ID:* {{txnId}}\n*Validity:* 30 Days\n\nYour premium features and listing upgrades are now active. Thank you for partnering with WedEazzy!\n\nAccess Dashboard: {{dashboardUrl}}\n\n— Team WedEazzy',
};
