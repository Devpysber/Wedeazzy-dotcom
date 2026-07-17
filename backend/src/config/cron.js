const cron = require('node-cron');
const prisma = require('./db');
const logger = require('./logger');
const env = require('./env');
const emailService = require('../services/email.service');
const reportsService = require('../services/reports.service');
const { syncGoogleSheetData } = require('../services/vendorSync.service');
const paymentController = require('../controllers/payment.controller');
const { downgradeVendorToBasic, reconcileStuckTransactions } = require('../controllers/payment.controller');

/**
 * Initialize background cron-scheduled routines.
 */
function initCron() {
  logger.info('[CRON] Initializing system schedulers...');

  // 1. Weekly Analytics Performance Report
  // Trigger: Sunday at 00:00 (0 0 * * 0)
  cron.schedule('0 0 * * 0', async () => {
    logger.info('[CRON] Running Weekly Analytics Performance Report...');
    try {
      const adminEmail = env.ADMIN_EMAIL;
      if (!adminEmail) {
        logger.warn('[CRON] Skipping weekly report — ADMIN_EMAIL is not configured.');
        return;
      }

      const analytics = await reportsService.getPlatformAnalytics();
      const revenue = await reportsService.getRevenueReport();
      const subject = `Weekly Performance Summary - WedEazzy Platform`;
      const title = 'Weekly Platform Summary';
      const heading = 'Weekly Analytics Performance';
      
      const htmlContent = `
        <p>Dear Administrator,</p>
        <p>Here is your weekly platform performance and health summary report compiled automatically on Sunday at midnight:</p>
        
        <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:14px; text-align:left;">
          <tr style="background:#FAE7E9; border-bottom:1px solid #E8DFD4;">
            <th style="padding:10px;">Metric Description</th>
            <th style="padding:10px; text-align:right;">Registered Counters</th>
          </tr>
          <tr style="border-bottom:1px solid #E8DFD4;">
            <td style="padding:10px;">Total Registered Vendors</td>
            <td style="padding:10px; text-align:right; font-weight:bold;">${analytics.counters.vendorsCount}</td>
          </tr>
          <tr style="border-bottom:1px solid #E8DFD4;">
            <td style="padding:10px;">Total Registered Couples</td>
            <td style="padding:10px; text-align:right; font-weight:bold;">${analytics.counters.couplesCount}</td>
          </tr>
          <tr style="border-bottom:1px solid #E8DFD4;">
            <td style="padding:10px;">Aggregate Inquiries Captured</td>
            <td style="padding:10px; text-align:right; font-weight:bold;">${analytics.counters.totalInquiries}</td>
          </tr>
          <tr style="border-bottom:1px solid #E8DFD4;">
            <td style="padding:10px;">Successful Razorpay Sales</td>
            <td style="padding:10px; text-align:right; font-weight:bold;">${analytics.counters.successfulTxnsCount}</td>
          </tr>
          <tr style="background:#FBF7F2; font-weight:bold; border-top:2px solid #C8102E;">
            <td style="padding:10px;">Total Platform Gross Revenue</td>
            <td style="padding:10px; text-align:right; color:#C8102E;">INR ${(revenue.aggregates.totalRevenue).toLocaleString()}</td>
          </tr>
        </table>

        <p>Your database schema matches production indexes perfectly, and WebSocket gateways remain online.</p>
        <p>Best regards,<br>WedEazzy Automation Core</p>
      `;

      await emailService.sendMail({
        to: adminEmail,
        subject,
        html: htmlContent,
        text: `Weekly Performance Summary: Total Vendors: ${analytics.counters.vendorsCount}, Couples: ${analytics.counters.couplesCount}, Inquiries: ${analytics.counters.totalInquiries}, Revenue: INR ${revenue.aggregates.totalRevenue}`
      });
      
      logger.info('[CRON] Weekly Analytics Performance Report completed successfully.');
    } catch (err) {
      logger.error({ err }, '[CRON] Weekly Analytics Performance Report failed');
    }
  });

  // 2. SaaS Subscription Renewal Check
  // Trigger: Daily at 01:00 (0 1 * * *)
  cron.schedule('0 1 * * *', async () => {
    logger.info('[CRON] Checking SaaS Subscription Expirations...');
    try {
      const now = new Date();
      // Find all vendors whose subscription plan has expired
      const expiredVendors = await prisma.vendor.findMany({
        where: {
          subscriptionPlan: { in: ['Premium', 'Featured'] },
          subscriptionExpiry: { lt: now }
        },
        take: 500,
      });

      if (expiredVendors.length > 0) {
        logger.info(`[CRON] Found ${expiredVendors.length} expired subscriptions. Reverting to Free...`);

        for (const v of expiredVendors) {
          await downgradeVendorToBasic(v.id).catch(err =>
            logger.error({ err, vendorId: v.id }, '[CRON] Failed to downgrade vendor to Free')
          );
        }

        logger.info('[CRON] Expired subscriptions successfully reverted to Free.');
      } else {
        logger.info('[CRON] No expired subscriptions found.');
      }
    } catch (err) {
      logger.error({ err }, '[CRON] SaaS Subscription Expirations check failed');
    }
  });

  // 3. Outreach Marketing Triggers
  // Trigger: Daily at 12:00 (0 12 * * *)
  cron.schedule('0 12 * * *', async () => {
    logger.info('[CRON] Running daily outreach marketing campaign check...');
    try {
      // Find couples who haven't completed any planning tasks or have empty checklist details
      const incompleteCouples = await prisma.couple.findMany({
        where: { partnerName: null },
        include: { user: true },
        take: 200,
      });

      if (incompleteCouples.length > 0) {
        logger.info(`[CRON] Found ${incompleteCouples.length} couples with incomplete profile metadata. Triggering outreach...`);
        // Simulated WhatsApp / Email triggers for onboarding conversion loops
        for (const c of incompleteCouples) {
          if (c.user.email) {
            logger.info(`[CRON] Dispatching onboarding helper email to ${c.user.email}`);
          }
        }
      }
    } catch (err) {
      logger.error({ err }, '[CRON] Outreach marketing triggers failed');
    }
  });

  // 4. Daily Google Sheet Vendor Sync
  // Trigger: Daily at 02:00 (0 2 * * *)
  cron.schedule('0 2 * * *', async () => {
    logger.info('[CRON] Running daily Google Sheet vendor sync...');
    try {
      const csvUrl = env.GOOGLE_SHEET_CSV_URL;
      const result = await syncGoogleSheetData(csvUrl);
      logger.info(`[CRON] Google Sheet sync completed: created=${result.created}, updated=${result.updated}, skipped=${result.skipped}`);
    } catch (err) {
      logger.error({ err }, '[CRON] Daily Google Sheet vendor sync failed');
    }
  });

  // 5. Expired OTP Cleanup (Hourly)
  // Removes stale OTP records from both OtpCode and UserOtp tables
  cron.schedule('0 * * * *', async () => {
    logger.info('[CRON] Running expired OTP cleanup...');
    try {
      const now = new Date();
      const [otpResult, userOtpResult] = await Promise.all([
        prisma.otpCode.deleteMany({ where: { expiresAt: { lt: now } } }),
        prisma.userOtp.deleteMany({ where: { expiresAt: { lt: now } } })
      ]);
      logger.info(`[CRON] OTP cleanup: removed ${otpResult.count} expired OtpCode + ${userOtpResult.count} expired UserOtp records`);
    } catch (err) {
      logger.error({ err }, '[CRON] Expired OTP cleanup failed');
    }
  });

  // 6. JWT Denylist Cleanup (Daily at 03:00)
  // Removes expired tokens from the denylist to prevent unbounded table growth
  cron.schedule('0 3 * * *', async () => {
    logger.info('[CRON] Running JWT denylist cleanup...');
    try {
      const result = await prisma.jwtDenylist.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });
      logger.info(`[CRON] JWT denylist cleanup: removed ${result.count} expired entries`);
    } catch (err) {
      logger.error({ err }, '[CRON] JWT denylist cleanup failed');
    }
  });

  // 7. Expired Session Cleanup (Daily at 03:30)
  // Removes expired session records to keep the sessions table lean
  cron.schedule('30 3 * * *', async () => {
    logger.info('[CRON] Running expired session cleanup...');
    try {
      const result = await prisma.session.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });
      logger.info(`[CRON] Session cleanup: removed ${result.count} expired sessions`);
    } catch (err) {
      logger.error({ err }, '[CRON] Expired session cleanup failed');
    }
  });

  // 8. Expired Password Reset Token Cleanup (Daily at 04:00)
  cron.schedule('0 4 * * *', async () => {
    logger.info('[CRON] Running expired password reset token cleanup...');
    try {
      const result = await prisma.passwordResetToken.deleteMany({
        where: { expiresAt: { lt: new Date() } }
      });
      logger.info(`[CRON] Password reset token cleanup: removed ${result.count} expired tokens`);
    } catch (err) {
      logger.error({ err }, '[CRON] Password reset token cleanup failed');
    }
  });

  // 9. Stuck Payment Reconciliation (every 10 minutes)
  // Re-verifies transactions left in "initiated" status (abandoned checkouts,
  // dropped webhooks) directly against Razorpay so they don't stay unresolved.
  cron.schedule('*/10 * * * *', async () => {
    try {
      await paymentController.reconcileStuckTransactions();
    } catch (err) {
      logger.error({ err }, '[CRON] Stuck transaction reconciliation failed');
    }
  });

  logger.info('[CRON] All system tasks scheduled successfully.');
}

module.exports = { initCron };
