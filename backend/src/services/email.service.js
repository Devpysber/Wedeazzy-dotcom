const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');
const { getEmailWorkflows } = require('../config/emailWorkflowsConfig');

/**
 * Automated-email workflows (Admin panel > Automated Email) can be toggled
 * off or given a custom HTML body. Checked at the top of each gated send
 * function below rather than at every call site, so callers can keep firing
 * their existing .catch()-wrapped, fire-and-forget sends unchanged.
 */
function isWorkflowEnabled(workflowId) {
  const workflow = getEmailWorkflows()[workflowId];
  return !workflow || workflow.enabled !== false;
}

function getWorkflowCustomHtml(workflowId) {
  const workflow = getEmailWorkflows()[workflowId];
  return (workflow && workflow.customHtml) || null;
}

/**
 * HTML-escapes user-supplied values before they're interpolated into an
 * email's HTML body. This is the actual point of injection for
 * sendInquiryNotification/sendContactFormEmail — upstream controller-level
 * sanitization (utils/sanitize.js) is a blacklist tag-stripper, not an
 * escaper, and doesn't cover every field (e.g. `email` was never sanitized
 * at all). An admin opening a malicious inquiry/contact email in their mail
 * client would otherwise execute attacker HTML (tracking pixels, spoofed
 * content, credential-harvesting links) — escape here regardless of what
 * happened upstream.
 */
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const { host, port, secure, user, pass } = env.SMTP;
  if (!user || !pass) {
    logger.warn('[SMTP] Email service credentials not set in .env. Falling back to console-logging mock email service in development.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: secure !== undefined ? secure : port === 465,
    auth: { user, pass },
    // Timeouts prevent a slow/unresponsive SMTP server from hanging the
    // entire HTTP request. Without these, a vendor login that triggers an
    // OTP email can stall for 2+ minutes before the socket gives up.
    connectionTimeout: 8000,     // 8s to establish TCP connection
    greetingTimeout: 8000,       // 8s for SMTP greeting
    socketTimeout: 15000,        // 15s for any subsequent socket idle
  });

  return transporter;
}

/**
 * Renders the WedEazzy elegant wedding brand HTML frame.
 */
function renderHtmlFrame(title, heading, content) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <style>
        body { font-family: 'Inter', -apple-system, sans-serif; background-color: #FBF7F2; margin: 0; padding: 0; color: #3A3530; }
        .wrapper { width: 100%; max-width: 600px; margin: 40px auto; background: #FFFFFF; border: 1.5px solid #E8DFD4; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(80,40,20,0.05); }
        .header { background: #6B0F1A; padding: 30px 20px; text-align: center; border-bottom: 3px solid #C9A33A; }
        .logo { font-family: 'Playfair Display', Georgia, serif; font-size: 28px; color: #FFFFFF; font-weight: bold; letter-spacing: 1px; }
        .logo em { font-style: italic; color: #C9A33A; font-weight: normal; }
        .content { padding: 40px 30px; line-height: 1.65; }
        .heading { font-family: 'Playfair Display', Georgia, serif; font-size: 24px; color: #1B1B1F; margin-bottom: 20px; font-weight: 600; text-align: center; }
        .otp-box { background: #FAE7E9; border: 1px dashed #C8102E; border-radius: 12px; font-size: 32px; font-weight: bold; letter-spacing: 6px; text-align: center; padding: 18px; margin: 30px 0; color: #C8102E; font-family: monospace; }
        .btn { display: inline-block; padding: 12px 28px; background: #C8102E; color: #FFFFFF !important; text-decoration: none; border-radius: 999px; font-weight: 600; text-align: center; box-shadow: 0 6px 16px rgba(200,16,46,0.2); margin: 20px 0; }
        .footer { background: #1B1B1F; padding: 24px 20px; text-align: center; font-size: 12px; color: #B8A99A; border-top: 1px solid #2F2A26; }
        .footer a { color: #C9A33A; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">
          <div class="logo">Wed<em>Eazzy</em>.com</div>
        </div>
        <div class="content">
          <div class="heading">${heading}</div>
          ${content}
        </div>
        <div class="footer">
          <p>© 2026 WedEazzy.com — Wedding planning, made eazzy.</p>
          <p><a href="https://www.wedeazzy.com">Visit Website</a> | <a href="https://wa.me/917498987620">Support</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
}

/**
 * Sends a transactional email with retry logic and console logging fallback.
 */
async function sendMail({ to, subject, html, text }) {
  const client = getTransporter();
  
  if (!client) {
    logger.warn({ to, subject, text }, '[SMTP DEV-FALLBACK] E-mail created (but SMTP credentials missing in .env)');
    return { ok: true, fallback: true };
  }

  const mailOptions = {
    from: env.SMTP.from,
    to,
    subject,
    text,
    html,
  };

  try {
    const info = await client.sendMail(mailOptions);
    logger.info({ to, messageId: info.messageId }, 'Email sent successfully');
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    const errorMessage = err && (err.message || err.response || String(err));
    logger.error({ err, to }, 'Failed to send SMTP email');
    return { ok: false, error: errorMessage, smtpError: errorMessage };
  }
}

/**
 * Send OTP Verification email.
 */
async function sendOtpEmail(to, code) {
  const title = 'Verify your email address';
  const heading = 'Confirm Your Email';
  const html = renderHtmlFrame(title, heading, `
    <p>Hello there,</p>
    <p>Welcome to WedEazzy! To complete your registration and secure your profile, please verify your email address using the 6-digit verification code below:</p>
    <div class="otp-box">${code}</div>
    <p>This code is valid for <strong>${env.OTP_TTL_MIN} minutes</strong>. Please do not share this code with anyone for security purposes.</p>
    <p>Best regards,<br>The WedEazzy Team</p>
  `);
  const text = `Confirm Your Email: To complete your registration on WedEazzy.com, use code: ${code}`;
  
  return sendMail({ to, subject: 'Confirm Your Email - WedEazzy.com', html, text });
}

/**
 * Send Password Reset email.
 */
async function sendPasswordResetEmail(to, code) {
  const title = 'Reset your password';
  const heading = 'Password Reset Request';
  const html = renderHtmlFrame(title, heading, `
    <p>Hello,</p>
    <p>We received a request to reset the password for your WedEazzy account. Enter the 6-digit security code below to proceed with setting a new password:</p>
    <div class="otp-box">${code}</div>
    <p>This reset code is valid for <strong>15 minutes</strong>. If you did not initiate this request, you can safely ignore this email; your password will remain unchanged.</p>
    <p>Best regards,<br>The WedEazzy Team</p>
  `);
  const text = `Password Reset Request: To reset your WedEazzy password, use code: ${code}`;
  
  return sendMail({ to, subject: 'Password Reset Request - WedEazzy.com', html, text });
}

/**
 * Send Business Login OTP Verification email.
 */
async function sendBusinessLoginOtpEmail(to, code, businessName = 'your business') {
  const title = 'Verify your business login';
  const heading = 'Business Portal Login';
  const html = renderHtmlFrame(title, heading, `
    <p>Hello,</p>
    <p>We detected a new login request to the WedEazzy Business Portal for <strong>${businessName}</strong>.</p>
    <p>To verify this session and securely access your vendor control dashboard, please enter the following 6-digit verification code:</p>
    <div class="otp-box">${code}</div>
    <p>This code is valid for <strong>${env.OTP_TTL_MIN} minutes</strong>. For security purposes, please do not share this OTP with anyone.</p>
    <p style="color: #79706A; font-size: 13px; margin-top: 20px;">If you did not initiate this login request, please reset your password immediately or contact our support team.</p>
    <p>Best regards,<br>The WedEazzy Team</p>
  `);
  const text = `Verify your business login: To complete your WedEazzy Business Portal login, use code: ${code}`;
  
  return sendMail({ to, subject: 'Business Portal Verification Code - WedEazzy.com', html, text });
}

module.exports = {
  sendMail,
  sendOtpEmail,
  sendPasswordResetEmail,
  sendBusinessLoginOtpEmail,
  
  /**
   * Send Passwordless OTP Login verification email.
   */
  async sendPasswordlessOtpEmail(to, code) {
    if (!isWorkflowEnabled('couple-otp')) {
      return { ok: true, skipped: true, reason: 'workflow_disabled' };
    }
    const title = 'Your WedEazzy Login Code';
    const heading = 'Passwordless Login OTP';
    const html = getWorkflowCustomHtml('couple-otp') || renderHtmlFrame(title, heading, `
      <p>Hello there,</p>
      <p>Use the 6-digit verification code below to log in to your WedEazzy account instantly. No password required!</p>
      <div class="otp-box">${code}</div>
      <p>This code is valid for <strong>5 minutes</strong>. If you did not request this login, please ignore this email.</p>
      <p>Best regards,<br>The WedEazzy Team</p>
    `);
    const text = `Your WedEazzy Login Code: Use code: ${code} to sign in to your account.`;
    return sendMail({ to, subject: 'Your WedEazzy Login Code - WedEazzy.com', html, text });
  },

  /**
   * Send single-use secure token password reset email.
   */
  async sendPasswordResetTokenEmail(to, token, role = 'admin') {
    const title = 'Reset your password';
    const heading = 'Password Reset Request';
    const accountLabel = role === 'vendor' ? 'WedEazzy vendor account'
      : role === 'couple' ? 'WedEazzy account'
      : 'WedEazzy administrative account';
    const resetUrl = `${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/admin-login.html?action=reset&token=${token}&role=${role}`;
    const html = renderHtmlFrame(title, heading, `
      <p>Hello there,</p>
      <p>We received a request to reset the password for your ${accountLabel}.</p>
      <p>Please click the button below to set a new password. This reset link is valid for <strong>1 hour</strong> and can only be used once:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" class="btn">Reset Password Now</a>
      </div>
      <p style="color: #79706A; font-size: 12px; word-break: break-all;">If the button doesn't work, copy and paste this URL into your browser:<br>${resetUrl}</p>
      <p>If you did not make this request, you can safely ignore this email.</p>
      <p>Best regards,<br>The WedEazzy Team</p>
    `);
    const text = `Reset your password: Click the link to reset your WedEazzy password: ${resetUrl}`;
    return sendMail({ to, subject: 'Reset Your Password - WedEazzy.com', html, text });
  },

  /**
   * Send Vendor Registration Completion Notification.
   */
  async sendVendorRegistrationNotification(to, businessName) {
    if (!isWorkflowEnabled('welcome-otp')) {
      return { ok: true, skipped: true, reason: 'workflow_disabled' };
    }
    const title = 'Registration Complete';
    const heading = 'Welcome to WedEazzy Business!';
    const html = getWorkflowCustomHtml('welcome-otp') || renderHtmlFrame(title, heading, `
      <p>Dear ${businessName} Team,</p>
      <p>Congratulations! Your business registration on WedEazzy.com is complete and your email address has been successfully verified.</p>
      <p>You can now log in to the Business Portal dashboard to complete your portfolio, upload images, manage reviews, track pricing, and claim verified customer leads.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/bdashboard.html" class="btn">Access Business Portal</a>
      </div>
      <p>Best regards,<br>The WedEazzy Business Relations Team</p>
    `);
    const text = `Welcome to WedEazzy Business! Your business registration for ${businessName} is complete. Log in to your portal to get started.`;
    return sendMail({ to, subject: 'Welcome to WedEazzy - Your Business Profile is Live!', html, text });
  },

  /**
   * Send Inquiry Notification to Admin or Vendor.
   */
  async sendInquiryNotification(to, inquiryData, vendorName, recipientType = 'admin') {
    // Only the vendor-facing forward is a togglable "workflow" — the admin
    // alert copy is an internal ops notification, not one of the 5 admin
    // panel workflows, and always sends regardless of this toggle.
    if (recipientType === 'vendor' && !isWorkflowEnabled('inquiry-forward')) {
      return { ok: true, skipped: true, reason: 'workflow_disabled' };
    }
    const title = 'New Inquiry Received';
    const heading = recipientType === 'admin' ? 'New Platform Inquiry Alert' : 'New Couple Inquiry';
    
    const eventDateStr = inquiryData.eventDate ? new Date(inquiryData.eventDate).toDateString() : 'N/A';
    
    const html = (recipientType === 'vendor' && getWorkflowCustomHtml('inquiry-forward')) || renderHtmlFrame(title, heading, `
      <p>Hello there,</p>
      <p>A new wedding inquiry has been captured on WedEazzy.com for <strong>${esc(vendorName)}</strong>.</p>

      <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:14px; text-align:left;">
        <tr style="background:#FAE7E9; border-bottom:1px solid #E8DFD4;">
          <th style="padding:10px;">Field</th>
          <th style="padding:10px;">Details</th>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Couple Name</td>
          <td style="padding:10px;">${esc(inquiryData.name)}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Phone</td>
          <td style="padding:10px;">${esc(inquiryData.phone)}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Email</td>
          <td style="padding:10px;">${esc(inquiryData.email) || 'N/A'}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Event Date</td>
          <td style="padding:10px;">${esc(eventDateStr)}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Guests</td>
          <td style="padding:10px;">${esc(inquiryData.guests) || 'N/A'}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Budget Band</td>
          <td style="padding:10px;">${esc(inquiryData.budget) || 'N/A'}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Notes</td>
          <td style="padding:10px;">${esc(inquiryData.notes) || 'N/A'}</td>
        </tr>
      </table>

      ${recipientType === 'admin'
        ? '<p>Please verify and forward this lead to the vendor on WhatsApp.</p>'
        : '<p>You can view and reply to this inquiry directly in your vendor control dashboard.</p>'
      }
      <p>Best regards,<br>The WedEazzy Team</p>
    `);

    const text = `New Wedding Inquiry received for ${vendorName}. Couple Name: ${inquiryData.name}, Phone: ${inquiryData.phone}, Event Date: ${eventDateStr}.`;
    const subject = recipientType === 'admin'
      ? `[Admin Alert] New Lead: ${inquiryData.name} for ${vendorName}`
      : `New WedEazzy Inquiry: ${inquiryData.name}`;

    return sendMail({ to, subject, html, text });
  },

  /**
   * Send Contact Form Email to Admin.
   */
  async sendContactFormEmail(to, contactData) {
    const title = 'New Support Request';
    const heading = 'General Contact Form Submission';
    
    const html = renderHtmlFrame(title, heading, `
      <p>Dear Support Team,</p>
      <p>A new general message has been received from the website contact/support page:</p>
      
      <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:14px; text-align:left;">
        <tr style="background:#FAE7E9; border-bottom:1px solid #E8DFD4;">
          <th style="padding:10px; width:30%;">Field</th>
          <th style="padding:10px;">Details</th>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">From Name</td>
          <td style="padding:10px;">${esc(contactData.name)}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Email Address</td>
          <td style="padding:10px;">${esc(contactData.email)}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Subject</td>
          <td style="padding:10px;">${esc(contactData.subject) || 'Support request'}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Message</td>
          <td style="padding:10px; white-space:pre-wrap;">${esc(contactData.message)}</td>
        </tr>
      </table>
      
      <p>Best regards,<br>WedEazzy Platform Concierge</p>
    `);

    const text = `New Contact Form Submission: Name: ${contactData.name}, Email: ${contactData.email}, Subject: ${contactData.subject}. Message: ${contactData.message}`;
    const subject = `[Support Request] ${contactData.subject || 'General Inquiry'} - ${contactData.name}`;

    return sendMail({ to, subject, html, text });
  },

  /**
   * Send Admin Alert Notification.
   */
  async sendAdminNotification(to, subject, htmlContent) {
    const title = 'System Alert';
    const heading = 'Administrative Notification';
    const html = renderHtmlFrame(title, heading, `
      <p>Dear Administrator,</p>
      <div>${htmlContent}</div>
      <p>Best regards,<br>WedEazzy Automation Core</p>
    `);
    const text = `System Notification: ${subject}. Check dashboard logs.`;
    return sendMail({ to, subject: `[Admin Alert] ${subject}`, html, text });
  },

  /**
   * Send Payment Confirmation Receipt email.
   */
  async sendPaymentReceiptEmail(to, txn, vendorName) {
    const title = 'Payment Successful';
    const heading = 'Payment Confirmation Receipt';
    
    const isSubscription = txn.purpose.startsWith('subscription:');
    const planName = isSubscription ? txn.purpose.slice(13) : 'Ad Campaign';
    const amountRs = (txn.amount / 100).toFixed(2);
    const baseRs = (txn.amount / 1.18 / 100).toFixed(2);
    const gstRs = (txn.amount / 100 - parseFloat(baseRs)).toFixed(2);
    
    const dateStr = new Date(txn.createdAt).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const html = renderHtmlFrame(title, heading, `
      <p>Dear ${vendorName || 'Partner'} Team,</p>
      <p>Thank you for your payment. Your upgrade is now fully active!</p>
      
      <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:14px; text-align:left;">
        <tr style="background:#FAE7E9; border-bottom:1px solid #E8DFD4;">
          <th style="padding:10px;">Billing Details</th>
          <th style="padding:10px;">Details</th>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Activated Service</td>
          <td style="padding:10px;"><strong>${planName} Plan</strong></td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Transaction ID</td>
          <td style="padding:10px; font-family: monospace;">${txn.id}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Payment Gateway</td>
          <td style="padding:10px;">Razorpay Payment Gateway</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Gateway Ref ID</td>
          <td style="padding:10px; font-family: monospace;">${txn.gatewayRef || '—'}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Date & Time</td>
          <td style="padding:10px;">${dateStr}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Base Amount</td>
          <td style="padding:10px;">₹${baseRs}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">GST (18%)</td>
          <td style="padding:10px;">₹${gstRs}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold; color: #1B1B1F;">Total Paid (Inc. GST)</td>
          <td style="padding:10px; color: #C8102E; font-weight: bold; font-size:16px;">₹${amountRs}</td>
        </tr>
      </table>
      
      <p>Your listing visibility will reflect this upgrade for the next 30 days. You can access your invoices and manage campaigns via the partner dashboard.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/bdashboard.html" class="btn" style="color: #FFFFFF !important;">Go to Partner Dashboard</a>
      </div>
      <p>Best regards,<br>The WedEazzy Team</p>
    `);

    const text = `Payment Confirmed: Thank you for purchasing the ${planName} Plan. Transaction ID: ${txn.id}, Amount Paid: ₹${amountRs}.`;
    return sendMail({ to, subject: `Payment Receipt: ${planName} Activated - WedEazzy.com`, html, text });
  },

  /**
   * Send Booking Confirmed milestone email to the couple.
   */
  async sendBookingConfirmedEmail(to, booking, vendorName) {
    if (!isWorkflowEnabled('booking-confirm')) {
      return { ok: true, skipped: true, reason: 'workflow_disabled' };
    }
    const title = 'Booking Confirmed';
    const heading = 'Your Booking is Confirmed!';
    const eventDateStr = booking.eventDate ? new Date(booking.eventDate).toDateString() : 'your event date';
    const html = getWorkflowCustomHtml('booking-confirm') || renderHtmlFrame(title, heading, `
      <p>Hello,</p>
      <p>Great news — your booking with <strong>${esc(vendorName)}</strong> for <strong>${esc(eventDateStr)}</strong> has been confirmed by our team.</p>
      <p>You can view the full booking details, chat with your vendor, and track your wedding checklist from your WedEazzy dashboard.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/user-dashboard.html" class="btn">View My Booking</a>
      </div>
      <p>Best regards,<br>The WedEazzy Team</p>
    `);
    const text = `Booking Confirmed: Your booking with ${vendorName} for ${eventDateStr} has been confirmed.`;
    return sendMail({ to, subject: 'Your WedEazzy Booking is Confirmed!', html, text });
  },

  /**
   * Send Account Suspension notice to the affected user.
   */
  async sendAccountSuspendedEmail(to, name) {
    if (!isWorkflowEnabled('user-suspend')) {
      return { ok: true, skipped: true, reason: 'workflow_disabled' };
    }
    const title = 'Account Suspended';
    const heading = 'Your Account Has Been Suspended';
    const html = getWorkflowCustomHtml('user-suspend') || renderHtmlFrame(title, heading, `
      <p>Dear ${esc(name) || 'User'},</p>
      <p>Your WedEazzy account has been suspended by our administration team, and access to your dashboard has been restricted.</p>
      <p>If you believe this was done in error, or would like more information, please contact our support team.</p>
      <p>Best regards,<br>The WedEazzy Team</p>
    `);
    const text = `Account Suspended: Your WedEazzy account has been suspended by our administration team. Contact support for more information.`;
    return sendMail({ to, subject: 'Important: Your WedEazzy Account Status', html, text });
  },

  /**
   * Send Temporary Vendor Account Credentials Email upon business claim or new vendor registration.
   */
  async sendVendorCredentialsEmail(to, businessName, tempPassword, loginEmail) {
    const title = 'Your WedEazzy Vendor Account Is Ready';
    const heading = 'Welcome to WedEazzy Vendor Portal';
    const loginUrl = `${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/admin-login.html`;
    const html = renderHtmlFrame(title, heading, `
      <p>Hello,</p>
      <p>Your business <strong>${esc(businessName)}</strong> has been successfully set up on WedEazzy.</p>
      <p>Here are your temporary login details to access your Vendor Dashboard:</p>
      <div style="background: #F9FAFB; border: 1px solid #E5E7EB; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Business Name:</strong> ${esc(businessName)}</p>
        <p style="margin: 4px 0;"><strong>Login Email:</strong> ${esc(loginEmail || to)}</p>
        <p style="margin: 4px 0;"><strong>Temporary Password:</strong> <code style="background: #EBF5FF; color: #1E429F; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${esc(tempPassword)}</code></p>
      </div>
      <p style="color: #6B7280; font-size: 13px;">For security reasons, you will be required to change your temporary password when you first log in.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${loginUrl}" class="btn">Login to Vendor Dashboard</a>
      </div>
      <p>Best regards,<br>The WedEazzy Team</p>
    `);
    const text = `Welcome to WedEazzy! Your business "${businessName}" is ready. Login Email: ${loginEmail || to}, Temporary Password: ${tempPassword}. Login at: ${loginUrl}`;
    return sendMail({ to, subject: 'Your WedEazzy Vendor Account Credentials', html, text });
  },

  /**
   * Send the couple/user welcome email after email verification.
   *
   * Vendors already got sendVendorRegistrationNotification on verify; couples
   * completed the same OTP flow and heard nothing back, so this is the
   * matching welcome for the non-vendor side.
   */
  async sendCoupleWelcomeEmail(to, name) {
    if (!isWorkflowEnabled('couple-welcome')) {
      return { ok: true, skipped: true, reason: 'workflow_disabled' };
    }
    const title = 'Welcome to WedEazzy';
    const heading = 'Welcome to WedEazzy!';
    const html = getWorkflowCustomHtml('couple-welcome') || renderHtmlFrame(title, heading, `
      <p>Hello ${esc(name) || 'there'},</p>
      <p>Your WedEazzy account is verified and ready. You can now shortlist venues and vendors, send inquiries, compare quotes, and keep your whole wedding plan in one place.</p>
      <p>Here's a good place to start:</p>
      <ul>
        <li>Browse verified vendors in your city</li>
        <li>Save your favourites to your shortlist</li>
        <li>Send an inquiry and get quotes back on WhatsApp</li>
      </ul>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/user-dashboard.html" class="btn">Open My Dashboard</a>
      </div>
      <p>Best regards,<br>The WedEazzy Team</p>
    `);
    const text = `Welcome to WedEazzy, ${name || 'there'}! Your account is verified. Browse vendors, shortlist favourites, and send inquiries from your dashboard.`;
    return sendMail({ to, subject: 'Welcome to WedEazzy — Your Account is Ready', html, text });
  },

  /**
   * Acknowledge an inquiry back to the couple who submitted it.
   *
   * The admin and the vendor were both notified on submit; the couple was
   * not, so from their side the form vanished into nothing.
   */
  async sendInquiryReceivedEmail(to, inquiryData, vendorName) {
    if (!isWorkflowEnabled('inquiry-ack')) {
      return { ok: true, skipped: true, reason: 'workflow_disabled' };
    }
    const title = 'Inquiry Received';
    const heading = 'We Have Your Inquiry';
    const eventDateStr = inquiryData.eventDate ? new Date(inquiryData.eventDate).toDateString() : 'your event date';
    const html = getWorkflowCustomHtml('inquiry-ack') || renderHtmlFrame(title, heading, `
      <p>Hello ${esc(inquiryData.name) || 'there'},</p>
      <p>Thank you for your inquiry to <strong>${esc(vendorName)}</strong> for <strong>${esc(eventDateStr)}</strong>. Our team is verifying the details and will forward them to the vendor.</p>
      <p>You can expect a response on WhatsApp at <strong>${esc(inquiryData.phone)}</strong>, usually within one business day.</p>
      <p>In the meantime, shortlisting two or three more vendors in the same category is the fastest way to compare quotes.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/user-dashboard.html" class="btn">View My Inquiries</a>
      </div>
      <p>Best regards,<br>The WedEazzy Team</p>
    `);
    const text = `We have your inquiry for ${vendorName} (${eventDateStr}). Our team is verifying it and the vendor will reach you on ${inquiryData.phone}, usually within one business day.`;
    return sendMail({ to, subject: `We received your inquiry for ${vendorName} - WedEazzy.com`, html, text });
  },

  /**
   * Acknowledge a manual business-claim request back to the claimant.
   * Only the admin was notified on submit.
   */
  async sendClaimReceivedEmail(to, claimantName, businessName) {
    if (!isWorkflowEnabled('claim-ack')) {
      return { ok: true, skipped: true, reason: 'workflow_disabled' };
    }
    const title = 'Claim Request Received';
    const heading = 'Your Claim Is Under Review';
    const html = getWorkflowCustomHtml('claim-ack') || renderHtmlFrame(title, heading, `
      <p>Hello ${esc(claimantName) || 'there'},</p>
      <p>We received your request to claim the listing for <strong>${esc(businessName)}</strong> on WedEazzy.</p>
      <p>Our verification team reviews claims manually, typically within 1–2 business days. Once approved, you'll receive your vendor login details by email and can manage the listing yourself.</p>
      <p>If we need anything further to verify ownership, we'll reply to this address.</p>
      <p>Best regards,<br>The WedEazzy Verification Team</p>
    `);
    const text = `We received your claim request for "${businessName}". Our team reviews claims within 1-2 business days and will email your vendor login details once approved.`;
    return sendMail({ to, subject: `Claim request received: ${businessName} - WedEazzy.com`, html, text });
  },

  /**
   * Notify a vendor that a payment attempt failed, so a dropped checkout
   * doesn't end in silence with the subscription still inactive.
   */
  async sendPaymentFailedEmail(to, txn, reason) {
    if (!isWorkflowEnabled('payment-failed')) {
      return { ok: true, skipped: true, reason: 'workflow_disabled' };
    }
    const title = 'Payment Failed';
    const heading = 'Your Payment Did Not Go Through';
    const planName = txn && txn.purpose && txn.purpose.startsWith('subscription:')
      ? txn.purpose.slice(13)
      : 'Ad Campaign';
    const amountRs = txn && txn.amount ? (txn.amount / 100).toFixed(2) : null;
    const html = getWorkflowCustomHtml('payment-failed') || renderHtmlFrame(title, heading, `
      <p>Hello,</p>
      <p>Your payment for the <strong>${esc(planName)}</strong> plan could not be completed, so the upgrade has not been activated.</p>
      <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:14px; text-align:left;">
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Transaction ID</td>
          <td style="padding:10px; font-family: monospace;">${esc(txn && txn.id)}</td>
        </tr>
        ${amountRs ? `<tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Amount</td>
          <td style="padding:10px;">₹${esc(amountRs)}</td>
        </tr>` : ''}
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Reason</td>
          <td style="padding:10px;">${esc(reason) || 'The payment was declined or left incomplete'}</td>
        </tr>
      </table>
      <p>No amount has been captured. If your bank shows a debit, it is a pre-authorisation that is released automatically, usually within 5–7 working days.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/bdashboard.html" class="btn">Retry Payment</a>
      </div>
      <p>Best regards,<br>The WedEazzy Team</p>
    `);
    const text = `Payment failed for the ${planName} plan (Transaction ${txn && txn.id}). No amount was captured. Retry from your partner dashboard.`;
    return sendMail({ to, subject: `Payment Failed: ${planName} - WedEazzy.com`, html, text });
  },

  /**
   * Deliver a WhatsApp message body over email instead, when WhatsApp itself
   * could not deliver it.
   *
   * The WhatsApp session needs a human to scan a QR code in the admin panel;
   * while it is unauthenticated every send fails with WA_OFFLINE and only
   * queues for retry, so time-sensitive lead pings sat undelivered with the
   * recipient never told anything. This is the fallback channel for exactly
   * that window — the message still reaches them, just by email.
   */
  async sendWhatsAppFallbackEmail(to, body, subjectHint) {
    if (!isWorkflowEnabled('wa-fallback')) {
      return { ok: true, skipped: true, reason: 'workflow_disabled' };
    }
    const title = 'Message from WedEazzy';
    const heading = subjectHint || 'A Message From WedEazzy';
    // WhatsApp bodies use *asterisks* for bold; render that rather than
    // leaking the markup into the email.
    const rendered = esc(body).replace(/\*([^*]+)\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
    const html = getWorkflowCustomHtml('wa-fallback') || renderHtmlFrame(title, heading, `
      <div style="background:#F9FAFB; border:1px solid #E5E7EB; padding:16px; border-radius:8px; margin:20px 0; line-height:1.7;">
        ${rendered}
      </div>
      <p style="color:#79706A; font-size:13px;">We normally send this on WhatsApp. It came by email because our WhatsApp line could not deliver it — you can reply to this email or reach us on WhatsApp any time.</p>
      <p>Best regards,<br>The WedEazzy Team</p>
    `);
    const text = String(body || '').replace(/\*/g, '');
    return sendMail({ to, subject: `${subjectHint || 'Message from WedEazzy'} - WedEazzy.com`, html, text });
  }
};