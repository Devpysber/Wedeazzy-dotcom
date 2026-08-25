#!/usr/bin/env node
const prisma = require('../config/db');
const bcrypt = require('bcryptjs');

async function seedDemoCredentials() {
  console.log('--- SEEDING PERMANENT DEMO CREDENTIALS ---');

  try {
    const salt = await bcrypt.genSalt(10);
    const vendorPassword = await bcrypt.hash('VendorPass123!', salt);
    const adminPassword = await bcrypt.hash('AdminPass123!', salt);
    const couplePassword = await bcrypt.hash('CouplePass123!', salt);

    // 1. Admin Account
    await prisma.user.upsert({
      where: { email: 'admin@wedeazzy.com' },
      update: {
        role: 'admin',
        name: 'WedEazzy Admin',
        passwordHash: adminPassword,
        verifiedAt: new Date()
      },
      create: {
        email: 'admin@wedeazzy.com',
        phone: '919999900000',
        role: 'admin',
        name: 'WedEazzy Admin',
        passwordHash: adminPassword,
        verifiedAt: new Date()
      }
    });
    console.log('✓ Admin Account: admin@wedeazzy.com / AdminPass123!');

    // 2. Demo Vendor (India - INR)
    const userVendorIN = await prisma.user.upsert({
      where: { email: 'vendor@wedeazzy.com' },
      update: {
        role: 'vendor',
        name: 'Demo India Vendor',
        passwordHash: vendorPassword,
        verifiedAt: new Date()
      },
      create: {
        email: 'vendor@wedeazzy.com',
        phone: '919876543210',
        role: 'vendor',
        name: 'Demo India Vendor',
        passwordHash: vendorPassword,
        verifiedAt: new Date()
      }
    });

    const slugIN = 'royal-star-wedding-studio-mumbai';
    const existingIN = await prisma.vendor.findFirst({ where: { OR: [{ slug: slugIN }, { userId: userVendorIN.id }] } });
    if (existingIN) {
      await prisma.vendor.update({
        where: { id: existingIN.id },
        data: {
          userId: userVendorIN.id,
          businessName: 'Royal Star Wedding Studio',
          category: 'Photographers',
          categorySlug: 'photographers',
          country: 'India',
          countryCode: 'IN',
          state: 'Maharashtra',
          city: 'Mumbai',
          citySlug: 'mumbai',
          whatsappNumber: '919876543210',
          subscriptionPlan: 'Premium',
          subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        }
      });
    } else {
      await prisma.vendor.create({
        data: {
          userId: userVendorIN.id,
          businessName: 'Royal Star Wedding Studio',
          slug: slugIN,
          category: 'Photographers',
          categorySlug: 'photographers',
          country: 'India',
          countryCode: 'IN',
          state: 'Maharashtra',
          city: 'Mumbai',
          citySlug: 'mumbai',
          whatsappNumber: '919876543210',
          subscriptionPlan: 'Premium',
          subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        }
      });
    }
    console.log('✓ Demo India Vendor: vendor@wedeazzy.com / VendorPass123!');

    // 3. Demo Vendor (USA - USD)
    const userVendorUS = await prisma.user.upsert({
      where: { email: 'usvendor@wedeazzy.com' },
      update: {
        role: 'vendor',
        name: 'Demo US Vendor',
        passwordHash: vendorPassword,
        verifiedAt: new Date()
      },
      create: {
        email: 'usvendor@wedeazzy.com',
        phone: '19876543210',
        role: 'vendor',
        name: 'Demo US Vendor',
        passwordHash: vendorPassword,
        verifiedAt: new Date()
      }
    });

    const slugUS = 'elegant-us-events-photo-new-york-city';
    const existingUS = await prisma.vendor.findFirst({ where: { OR: [{ slug: slugUS }, { userId: userVendorUS.id }] } });
    if (existingUS) {
      await prisma.vendor.update({
        where: { id: existingUS.id },
        data: {
          userId: userVendorUS.id,
          businessName: 'Elegant US Events & Photo',
          category: 'Wedding Planners',
          categorySlug: 'wedding-planners',
          country: 'USA',
          countryCode: 'US',
          state: 'New York',
          city: 'New York City',
          citySlug: 'new-york-city',
          whatsappNumber: '19876543210',
          subscriptionPlan: 'Featured',
          subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        }
      });
    } else {
      await prisma.vendor.create({
        data: {
          userId: userVendorUS.id,
          businessName: 'Elegant US Events & Photo',
          slug: slugUS,
          category: 'Wedding Planners',
          categorySlug: 'wedding-planners',
          country: 'USA',
          countryCode: 'US',
          state: 'New York',
          city: 'New York City',
          citySlug: 'new-york-city',
          whatsappNumber: '19876543210',
          subscriptionPlan: 'Featured',
          subscriptionExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        }
      });
    }
    console.log('✓ Demo US Vendor: usvendor@wedeazzy.com / VendorPass123!');

    // 4. Demo Couple Account
    const userCouple = await prisma.user.upsert({
      where: { email: 'couple@wedeazzy.com' },
      update: {
        role: 'couple',
        name: 'Rahul & Ananya',
        passwordHash: couplePassword,
        verifiedAt: new Date()
      },
      create: {
        email: 'couple@wedeazzy.com',
        phone: '919999933333',
        role: 'couple',
        name: 'Rahul & Ananya',
        passwordHash: couplePassword,
        verifiedAt: new Date()
      }
    });

    const existingCouple = await prisma.couple.findUnique({ where: { userId: userCouple.id } });
    if (existingCouple) {
      await prisma.couple.update({
        where: { userId: userCouple.id },
        data: { partnerName: 'Ananya', city: 'Mumbai', citySlug: 'mumbai' }
      });
    } else {
      await prisma.couple.create({
        data: { userId: userCouple.id, partnerName: 'Ananya', city: 'Mumbai', citySlug: 'mumbai' }
      });
    }
    console.log('✓ Demo Couple: couple@wedeazzy.com / CouplePass123!');

    console.log('--- ALL DEMO CREDENTIALS SEEDED SUCCESSFULLY ---');
  } catch (err) {
    console.error('Error seeding demo credentials:', err);
  } finally {
    await prisma.$disconnect();
  }
}

seedDemoCredentials();
