const path = require('path');
// Load environment variables from backend/.env when this script is run directly
// (e.g. `npm run seed:admin`) so the admin credentials below are available.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const bcrypt = require('bcryptjs');
const prisma = require('../config/db');

async function main() {
  try {
    console.log('--- Starting Admin & Platform Seeding ---');

    // 1. Seed/Upsert Admin user — credentials come from environment variables,
    //    never hardcoded. Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env.
    //    The admin phone reuses the first entry of ADMIN_PHONES (already in .env).
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPhone = (process.env.ADMIN_PHONES || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)[0] || null;
    const password = process.env.ADMIN_PASSWORD;

    // Fail loudly instead of silently seeding an insecure/default admin account.
    if (!adminEmail || !password) {
      console.error(
        '[seed-admin] Missing required environment variables. ' +
        'Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env before seeding the admin account.'
      );
      process.exit(1);
    }

    console.log(`Checking if admin user exists...`);
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: adminEmail },
          { phone: adminPhone }
        ]
      }
    });

    // Idempotent seed: if an admin account already exists, leave it untouched.
    // NEVER overwrite the password on an existing account — otherwise every
    // server restart would reset the admin's password back to ADMIN_PASSWORD.
    if (existing) {
      console.log(`Admin user already exists (ID: ${existing.id}). Leaving credentials unchanged.`);
      console.log('--- Platform Seeding Successfully Completed ---');
      return;
    }

    console.log(`Admin user not found, hashing password and inserting new admin...`);
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        phone: adminPhone,
        role: 'admin',
        name: 'WedEazzy Administrator',
        passwordHash,
        verifiedAt: new Date()
      }
    });
    console.log(`Success! Admin user created: ${admin.email} (ID: ${admin.id})`);
    console.log('--- Platform Seeding Successfully Completed ---');
  } catch (err) {
    console.error('Error seeding admin user database:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
