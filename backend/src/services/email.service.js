const nodemailer = require('nodemailer');
const env = require('../config/env');
const logger = require('../config/logger');

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
    logger.error({ err, to }, 'Failed to send SMTP email');
    return { ok: false, error: err.message };
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
    const title = 'Your WedEazzy Login Code';
    const heading = 'Passwordless Login OTP';
    const html = renderHtmlFrame(title, heading, `
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
  async sendPasswordResetTokenEmail(to, token) {
    const title = 'Reset your password';
    const heading = 'Password Reset Request';
    const resetUrl = `${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/admin-login.html?action=reset&token=${token}`;
    const html = renderHtmlFrame(title, heading, `
      <p>Hello there,</p>
      <p>We received a request to reset the password for your WedEazzy administrative account.</p>
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
    const title = 'Registration Complete';
    const heading = 'Welcome to WedEazzy Business!';
    const html = renderHtmlFrame(title, heading, `
      <p>Dear ${businessName} Team,</p>
      <p>Congratulations! Your business registration on WedEazzy.com is complete and your email address has been successfully verified.</p>
      <p>You can now log in to the Business Portal dashboard to complete your portfolio, upload images, manage reviews, track pricing, and claim verified customer leads.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${env.PUBLIC_BASE_URL || 'http://localhost:4000'}/pages/bdashboard.html" class="btn">Access Business Portal</a>
      </div>
      <p>Best regards,<br>The WedEazzy Business Relations Team</p>
    `);
    const text = `Welcome to WedEazzy Business! Your business registration for ${businessName} is complete. Log in to your portal to get started.`;
    return sendMail({ to, subject: 'Welcome to WedEazzy - Your Business Profile is Live! 🏛️', html, text });
  },

  /**
   * Send Inquiry Notification to Admin or Vendor.
   */
  async sendInquiryNotification(to, inquiryData, vendorName, recipientType = 'admin') {
    const title = 'New Inquiry Received';
    const heading = recipientType === 'admin' ? 'New Platform Inquiry Alert' : 'New Couple Inquiry';
    
    const eventDateStr = inquiryData.eventDate ? new Date(inquiryData.eventDate).toDateString() : 'N/A';
    
    const html = renderHtmlFrame(title, heading, `
      <p>Hello there,</p>
      <p>A new wedding inquiry has been captured on WedEazzy.com for <strong>${vendorName}</strong>.</p>
      
      <table style="width:100%; border-collapse:collapse; margin:20px 0; font-size:14px; text-align:left;">
        <tr style="background:#FAE7E9; border-bottom:1px solid #E8DFD4;">
          <th style="padding:10px;">Field</th>
          <th style="padding:10px;">Details</th>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Couple Name</td>
          <td style="padding:10px;">${inquiryData.name}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Phone</td>
          <td style="padding:10px;">${inquiryData.phone}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Email</td>
          <td style="padding:10px;">${inquiryData.email || 'N/A'}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Event Date</td>
          <td style="padding:10px;">${eventDateStr}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Guests</td>
          <td style="padding:10px;">${inquiryData.guests || 'N/A'}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Budget Band</td>
          <td style="padding:10px;">${inquiryData.budget || 'N/A'}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Notes</td>
          <td style="padding:10px;">${inquiryData.notes || 'N/A'}</td>
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
          <td style="padding:10px;">${contactData.name}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Email Address</td>
          <td style="padding:10px;">${contactData.email}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Subject</td>
          <td style="padding:10px;">${contactData.subject || 'Support request'}</td>
        </tr>
        <tr style="border-bottom:1px solid #E8DFD4;">
          <td style="padding:10px; font-weight:bold;">Message</td>
          <td style="padding:10px; white-space:pre-wrap;">${contactData.message}</td>
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
  }
};
