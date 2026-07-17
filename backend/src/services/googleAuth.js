const { OAuth2Client } = require('google-auth-library');
const prisma = require('../config/db');
const env = require('../config/env');
const logger = require('../config/logger');
const { uniqueSlug } = require('../utils/slug');
const { sendMail } = require('./email.service');

const oneTapClient = new OAuth2Client(env.GOOGLE.clientId);

/**
 * Verify Google One Tap Identity Token using Google OAuth2Client
 */
async function verifyIdToken(idToken) {
  try {
    const ticket = await oneTapClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE.clientId,
    });
    const payload = ticket.getPayload();
    return {
      email: payload.email,
      name: payload.name,
      googleId: payload.sub,
      imageUrl: payload.picture,
      verified: payload.email_verified,
    };
  } catch (err) {
    logger.error({ err }, 'Google ID Token verification failed');
    throw err;
  }
}

/**
 * Handles existing local user linking or new Google user account provisioning
 */
async function handleGoogleUser({ email, name, googleId, imageUrl, requestedRole = 'couple' }) {
  const normalizedEmail = email.toLowerCase().trim();
  let role = requestedRole;
  if (role === 'user') role = 'couple';
  if (role === 'business') role = 'vendor';

  // Check if requested role is valid
  const validRoles = new Set(['vendor', 'couple', 'admin']);
  if (!validRoles.has(role)) {
    role = 'couple'; // default fallback
  }

  // 1. Existing Local Account Linking
  let user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    include: { vendor: true, couple: true },
  });

  if (user) {
    // Keep user role sticky, do not allow role switches on login
    const shouldUpdateRole = false;
    const updateData = {
      lastLogin: new Date(),
      imageUrl: imageUrl || user.imageUrl,
    };

    if (!user.googleId) {
      updateData.googleId = googleId;
      updateData.authProvider = 'google';
      updateData.verifiedAt = user.verifiedAt || new Date();
    }

    if (shouldUpdateRole) {
      updateData.role = role;
    }

    user = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      include: { vendor: true, couple: true },
    });

    if (shouldUpdateRole) {
      if (role === 'vendor' && !user.vendor) {
        const slug = await uniqueSlug(prisma, 'vendor', (user.name || name || 'Vendor') + '-Mumbai');
        await prisma.vendor.create({
          data: {
            userId: user.id,
            businessName: `${user.name || name || 'Vendor'}'s Wedding Company`,
            slug,
            category: 'Wedding Planners',
            categorySlug: 'wedding-planners',
            city: 'Mumbai',
            citySlug: 'mumbai',
          },
        });
      } else if (role === 'couple' && !user.couple) {
        await prisma.couple.create({
          data: {
            userId: user.id,
          },
        });
      }
      user = await prisma.user.findUnique({
        where: { id: user.id },
        include: { vendor: true, couple: true },
      });
      logger.info({ userId: user.id, role }, 'Updated existing user role and provisioned profile record');
    } else {
      // Defensive profile creation for matching roles
      if (user.role === 'vendor' && !user.vendor) {
        const slug = await uniqueSlug(prisma, 'vendor', (user.name || name || 'Vendor') + '-Mumbai');
        await prisma.vendor.create({
          data: {
            userId: user.id,
            businessName: `${user.name || name || 'Vendor'}'s Wedding Company`,
            slug,
            category: 'Wedding Planners',
            categorySlug: 'wedding-planners',
            city: 'Mumbai',
            citySlug: 'mumbai',
          },
        });
        user = await prisma.user.findUnique({
          where: { id: user.id },
          include: { vendor: true, couple: true },
        });
      } else if (user.role === 'couple' && !user.couple) {
        await prisma.couple.create({
          data: {
            userId: user.id,
          },
        });
        user = await prisma.user.findUnique({
          where: { id: user.id },
          include: { vendor: true, couple: true },
        });
      }
      logger.info({ userId: user.id, email: normalizedEmail }, 'Linked existing user with Google OAuth');
    }
  } else {
    // 2. New Google User Registration & Auto Provisioning Onboarding
    user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          googleId,
          authProvider: 'google',
          role,
          name,
          imageUrl,
          verifiedAt: new Date(),
          lastLogin: new Date(),
        },
      });

      if (role === 'couple') {
        await tx.couple.create({
          data: {
            userId: newUser.id,
          },
        });
      } else if (role === 'vendor') {
        const slug = await uniqueSlug(tx, 'vendor', name + '-Mumbai');
        await tx.vendor.create({
          data: {
            userId: newUser.id,
            businessName: `${name}'s Wedding Company`,
            slug,
            category: 'Wedding Planners',
            categorySlug: 'wedding-planners',
            city: 'Mumbai',
            citySlug: 'mumbai',
          },
        });
      }
      return newUser;
    });

    // Fetch complete user profile for response
    user = await prisma.user.findUnique({
      where: { id: user.id },
      include: { vendor: true, couple: true },
    });

    // Onboarding welcome email using nodemailer
    sendWelcomeEmail(normalizedEmail, name).catch((err) => {
      logger.error({ err, email: normalizedEmail }, 'Failed to send welcome email');
    });
    logger.info({ userId: user.id }, 'Created new user account via Google onboarding');
  }

  return user;
}

/**
 * Sends elegant wedding themed onboarding welcome email
 */
async function sendWelcomeEmail(to, name) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Welcome to WedEazzy.com</title>
      <style>
        body { font-family: 'Inter', -apple-system, sans-serif; background-color: #FBF7F2; margin: 0; padding: 0; color: #3A3530; }
        .wrapper { width: 100%; max-width: 600px; margin: 40px auto; background: #FFFFFF; border: 1.5px solid #E8DFD4; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(80,40,20,0.05); }
        .header { background: #6B0F1A; padding: 30px 20px; text-align: center; border-bottom: 3px solid #C9A33A; }
        .logo { font-family: Georgia, serif; font-size: 28px; color: #FFFFFF; font-weight: bold; letter-spacing: 1px; }
        .logo em { font-style: italic; color: #C9A33A; font-weight: normal; }
        .content { padding: 40px 30px; line-height: 1.65; }
        .heading { font-family: Georgia, serif; font-size: 24px; color: #1B1B1F; margin-bottom: 20px; font-weight: 600; text-align: center; }
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
          <div class="heading">Welcome to the WedEazzy Family! 🌸</div>
          <p>Hello ${name},</p>
          <p>We are absolutely thrilled to welcome you to <strong>WedEazzy.com</strong> – your ultimate partner in making your wedding planning journey smooth, simple, and completely stress-free!</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="https://wedeazzy.com" class="btn">Explore Your Dashboard</a>
          </div>
          <p>Whether you're looking for the best vendor connections, tracking your timeline, or orchestrating your perfect wedding day, we've got you covered.</p>
          <p>If you have any questions or need custom assistance, feel free to reach out to our dedicated support team at any time.</p>
          <p>Happy Planning!</p>
          <p>Best regards,<br>The WedEazzy Team</p>
        </div>
        <div class="footer">
          <p>© 2026 WedEazzy.com — Wedding planning, made eazzy.</p>
          <p><a href="https://www.wedeazzy.com">Visit Website</a> | <a href="https://wa.me/917498987620">Support</a></p>
        </div>
      </div>
    </body>
    </html>
  `;
  return sendMail({
    to,
    subject: 'Welcome to WedEazzy.com! 🌸',
    html,
    text: `Welcome to WedEazzy.com, ${name}! We are excited to help you plan your perfect wedding day. Log in to explore your dashboard.`,
  });
}

module.exports = {
  verifyIdToken,
  handleGoogleUser,
};
