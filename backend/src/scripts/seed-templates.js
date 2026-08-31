/**
 * WedEazzy Initial Email Templates Seed Script
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const INITIAL_TEMPLATES = [
  // 1. Profile Completion
  {
    name: 'Complete Your WedEazzy Profile',
    category: 'Profile Completion',
    subject: 'Complete your {{business_name}} profile on WedEazzy 💍',
    previewText: 'Reach more couples in {{city}} by completing your vendor profile today.',
    isSystem: true,
    status: 'active',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
    <h2 style="color: #DC1F30; margin: 0; font-size: 24px;">WedEazzy</h2>
    <p style="color: #666; font-size: 13px; margin-top: 4px;">India's Premier Wedding Platform</p>
  </div>

  <div style="padding: 24px 0;">
    <h3 style="color: #1A1D1F; font-size: 18px; margin-bottom: 12px;">Hello {{owner_name}},</h3>
    <p style="color: #4A4D4F; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
      We noticed that your business profile for <strong>{{business_name}}</strong> in {{city}} is currently <strong>{{profile_completion_percentage}} complete</strong>.
    </p>
    <p style="color: #4A4D4F; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
      Vendors with 100% complete profiles get up to <strong>4x more inquiries</strong> and direct WhatsApp leads from couples searching for {{business_category}} in {{city}}.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="{{dashboard_url}}" style="background-color: #DC1F30; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">Complete My Profile</a>
    </div>

    <p style="color: #7A7D7F; font-size: 13px; line-height: 1.5;">
      If you need any assistance updating your pricing, services, or gallery photos, our team is always here to help.
    </p>
  </div>

  <div style="border-top: 1px solid #f0f0f0; padding-top: 20px; text-align: center; color: #9A9D9F; font-size: 12px;">
    <p style="margin: 4px 0;">© WedEazzy Platform. All rights reserved.</p>
    <p style="margin: 4px 0;">Need help? Email <a href="mailto:{{support_email}}" style="color: #DC1F30;">{{support_email}}</a></p>
  </div>
</div>`
  },
  {
    name: 'Your WedEazzy Profile Is Almost Complete',
    category: 'Profile Completion',
    subject: 'You are almost there! Finish {{business_name}}\'s profile on WedEazzy ✨',
    previewText: 'Just a few details left to showcase your {{business_category}} services in {{city}}.',
    isSystem: true,
    status: 'active',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
    <h2 style="color: #DC1F30; margin: 0; font-size: 24px;">WedEazzy</h2>
  </div>

  <div style="padding: 24px 0;">
    <h3 style="color: #1A1D1F; font-size: 18px;">Hi {{owner_name}},</h3>
    <p style="color: #4A4D4F; font-size: 15px; line-height: 1.6;">
      Your profile for <strong>{{business_name}}</strong> is sitting at <strong>{{profile_completion_percentage}}</strong>. You are just a few steps away from going fully live and receiving couple bookings!
    </p>

    <div style="background-color: #FFF5F5; border-left: 4px solid #DC1F30; padding: 16px; margin: 20px 0; border-radius: 4px;">
      <h4 style="margin: 0 0 8px 0; color: #DC1F30; font-size: 14px;">Quick Checklist to Reach 100%:</h4>
      <ul style="margin: 0; padding-left: 20px; color: #4A4D4F; font-size: 13px; line-height: 1.8;">
        <li>Upload high-resolution portfolio photos</li>
        <li>Set price range and service details</li>
        <li>Verify contact phone number & city location</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="{{dashboard_url}}" style="background-color: #DC1F30; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block;">Finish My Profile Now</a>
    </div>
  </div>

  <div style="border-top: 1px solid #f0f0f0; padding-top: 20px; text-align: center; color: #9A9D9F; font-size: 12px;">
    <p>© WedEazzy Platform • Support: {{support_email}}</p>
  </div>
</div>`
  },

  // 2. Subscription
  {
    name: 'Upgrade Your WedEazzy Plan',
    category: 'Subscription',
    subject: 'Upgrade {{business_name}} to Featured Tier for 5x More Leads 🚀',
    previewText: 'Unlock premium badge, top city ranking, and unlimited lead inquiries.',
    isSystem: true,
    status: 'active',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
    <h2 style="color: #DC1F30; margin: 0; font-size: 24px;">WedEazzy Pro</h2>
  </div>

  <div style="padding: 24px 0;">
    <h3 style="color: #1A1D1F; font-size: 18px;">Hi {{owner_name}},</h3>
    <p style="color: #4A4D4F; font-size: 15px; line-height: 1.6;">
      Your current plan for <strong>{{business_name}}</strong> is <strong>{{subscription_name}}</strong>. Upgrade to WedEazzy Featured Tier today to rank #1 in {{city}} for {{business_category}}.
    </p>

    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; padding: 20px; border-radius: 8px; margin: 20px 0;">
      <h4 style="margin: 0 0 12px 0; color: #0F172A; font-size: 15px;">Featured Membership Benefits:</h4>
      <p style="margin: 4px 0; color: #334155; font-size: 13px;">✔ Priority Placement at Top of {{city}} Search Results</p>
      <p style="margin: 4px 0; color: #334155; font-size: 13px;">✔ Verified Pro Badge on Your Listing</p>
      <p style="margin: 4px 0; color: #334155; font-size: 13px;">✔ Direct WhatsApp & Phone Click Lead Forwarding</p>
      <p style="margin: 4px 0; color: #334155; font-size: 13px;">✔ Dedicated Support Manager</p>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="{{upgrade_url}}" style="background-color: #DC1F30; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">Explore Premium Plans</a>
    </div>
  </div>

  <div style="border-top: 1px solid #f0f0f0; padding-top: 20px; text-align: center; color: #9A9D9F; font-size: 12px;">
    <p>© WedEazzy Platform • Support: {{support_email}}</p>
  </div>
</div>`
  },
  {
    name: 'Unlock More With WedEazzy',
    category: 'Subscription',
    subject: 'Maximize your wedding bookings with WedEazzy Premium 💎',
    previewText: 'See how top vendors in {{city}} are getting 50+ wedding bookings per month.',
    isSystem: true,
    status: 'active',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
    <h2 style="color: #DC1F30; margin: 0; font-size: 24px;">WedEazzy</h2>
  </div>

  <div style="padding: 24px 0;">
    <h3 style="color: #1A1D1F; font-size: 18px;">Hello {{owner_name}},</h3>
    <p style="color: #4A4D4F; font-size: 15px; line-height: 1.6;">
      Did you know that couples on WedEazzy browse over 100,000 vendor profiles every month? Stand out from competitors with WedEazzy Premium.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="{{upgrade_url}}" style="background-color: #10B981; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">View Plans & Pricing</a>
    </div>
  </div>

  <div style="border-top: 1px solid #f0f0f0; padding-top: 20px; text-align: center; color: #9A9D9F; font-size: 12px;">
    <p>© WedEazzy Platform • {{support_email}}</p>
  </div>
</div>`
  },

  // 3. Grow Business
  {
    name: 'Grow Your Business With WedEazzy',
    category: 'Grow Business',
    subject: 'Boost {{business_name}}\'s Wedding Leads & Visibility 📈',
    previewText: 'Accelerate your revenue with targeted marketing services on WedEazzy.',
    isSystem: true,
    status: 'active',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
    <h2 style="color: #DC1F30; margin: 0; font-size: 24px;">WedEazzy Grow Business</h2>
  </div>

  <div style="padding: 24px 0;">
    <h3 style="color: #1A1D1F; font-size: 18px;">Hello {{owner_name}},</h3>
    <p style="color: #4A4D4F; font-size: 15px; line-height: 1.6;">
      WedEazzy Grow Business helps {{business_category}} businesses in {{city}} generate guaranteed qualified leads through WhatsApp campaigns, website traffic, and targeted social media ads.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="{{grow_business_url}}" style="background-color: #DC1F30; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">Explore Grow Business</a>
    </div>
  </div>

  <div style="border-top: 1px solid #f0f0f0; padding-top: 20px; text-align: center; color: #9A9D9F; font-size: 12px;">
    <p>© WedEazzy Platform • {{support_email}}</p>
  </div>
</div>`
  },
  {
    name: 'Get More Leads on WhatsApp',
    category: 'Grow Business',
    subject: 'Receive Direct WhatsApp Inquiries for {{business_name}} 📲',
    previewText: 'Connect directly with couples searching for {{business_category}} in {{city}} via WhatsApp.',
    isSystem: true,
    status: 'active',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
    <h2 style="color: #25D366; margin: 0; font-size: 24px;">WedEazzy WhatsApp Leads</h2>
  </div>

  <div style="padding: 24px 0;">
    <h3 style="color: #1A1D1F; font-size: 18px;">Hi {{owner_name}},</h3>
    <p style="color: #4A4D4F; font-size: 15px; line-height: 1.6;">
      90% of couples prefer contacting wedding vendors on WhatsApp. Activate WhatsApp Lead Forwarding for <strong>{{business_name}}</strong> and never miss a potential booking in {{city}}.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="{{whatsapp_leads_url}}" style="background-color: #25D366; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">Get WhatsApp Leads Now</a>
    </div>
  </div>

  <div style="border-top: 1px solid #f0f0f0; padding-top: 20px; text-align: center; color: #9A9D9F; font-size: 12px;">
    <p>© WedEazzy Platform • {{support_email}}</p>
  </div>
</div>`
  },
  {
    name: 'Turn Your Website Into More Leads',
    category: 'Grow Business',
    subject: 'Drive High-Intent Couples to {{business_name}}\'s Website 🌐',
    previewText: 'Convert website visitors into confirmed wedding inquiries with WedEazzy Website Leads.',
    isSystem: true,
    status: 'active',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
    <h2 style="color: #2563EB; margin: 0; font-size: 24px;">WedEazzy Website Leads</h2>
  </div>

  <div style="padding: 24px 0;">
    <h3 style="color: #1A1D1F; font-size: 18px;">Hi {{owner_name}},</h3>
    <p style="color: #4A4D4F; font-size: 15px; line-height: 1.6;">
      Promote <strong>{{business_name}}</strong> directly to couples searching for top {{business_category}} in {{city}} and drive targeted traffic to your website.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="{{website_leads_url}}" style="background-color: #2563EB; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">Get Website Leads</a>
    </div>
  </div>

  <div style="border-top: 1px solid #f0f0f0; padding-top: 20px; text-align: center; color: #9A9D9F; font-size: 12px;">
    <p>© WedEazzy Platform • {{support_email}}</p>
  </div>
</div>`
  },
  {
    name: 'Get More Leads From Social Media',
    category: 'Grow Business',
    subject: 'Social Media Promotion for {{business_name}} on Instagram & Facebook 📸',
    previewText: 'Featured post & story campaigns for {{business_category}} in {{city}}.',
    isSystem: true,
    status: 'active',
    body: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px; background-color: #ffffff;">
  <div style="text-align: center; padding-bottom: 20px; border-bottom: 1px solid #f0f0f0;">
    <h2 style="color: #E1306C; margin: 0; font-size: 24px;">WedEazzy Social Growth</h2>
  </div>

  <div style="padding: 24px 0;">
    <h3 style="color: #1A1D1F; font-size: 18px;">Hi {{owner_name}},</h3>
    <p style="color: #4A4D4F; font-size: 15px; line-height: 1.6;">
      Get featured on WedEazzy\'s official social channels to showcase <strong>{{business_name}}</strong> to thousands of engaged couples.
    </p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="{{social_media_leads_url}}" style="background-color: #E1306C; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: bold; font-size: 15px; display: inline-block;">Grow With Social Media</a>
    </div>
  </div>

  <div style="border-top: 1px solid #f0f0f0; padding-top: 20px; text-align: center; color: #9A9D9F; font-size: 12px;">
    <p>© WedEazzy Platform • {{support_email}}</p>
  </div>
</div>`
  }
];

async function seedTemplates() {
  try {
    for (const t of INITIAL_TEMPLATES) {
      const existing = await prisma.emailTemplate.findFirst({
        where: { name: t.name }
      });

      if (!existing) {
        await prisma.emailTemplate.create({
          data: {
            name: t.name,
            category: t.category,
            subject: t.subject,
            previewText: t.previewText,
            body: t.body,
            status: t.status,
            isSystem: t.isSystem
          }
        });
        console.log(`[SEED] Created template: "${t.name}"`);
      }
    }
    console.log('[SEED] Email templates check complete.');
  } catch (err) {
    console.error('[SEED] Error seeding email templates:', err.message);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  seedTemplates();
}

module.exports = seedTemplates;
