const prisma = require('../config/db');

async function checkClaimedVendors() {
  console.log('--- Claimed Vendors (userId != null) ---');
  const claimedVendors = await prisma.vendor.findMany({
    where: { NOT: { userId: null } },
    select: { id: true, legacyId: true, businessName: true, userId: true, city: true, category: true, createdAt: true }
  });
  console.log('Claimed Vendors count:', claimedVendors.length);
  console.log('Claimed Vendors details:', JSON.stringify(claimedVendors, null, 2));

  console.log('\n--- Checking for demo seed vendors ---');
  const demoLegacyIds = [
    'royal-palace-banquet-mumbai',
    'dream-capture-studio-delhi',
    'bridal-glow-studio-jaipur',
    'the-wedding-garden-mumbai',
    'grand-celebration-hall-mumbai',
    'royal-wedding-planners-delhi',
    'shutter-bugs-studio-bangalore',
    'glam-up-bridal-studio-mumbai',
    'palace-grounds-banquet-bangalore'
  ];
  const demoVendors = await prisma.vendor.findMany({
    where: { legacyId: { in: demoLegacyIds } },
    select: { id: true, legacyId: true, businessName: true, userId: true }
  });
  console.log('Demo seed vendors count:', demoVendors.length);
  console.log('Demo seed vendors details:', JSON.stringify(demoVendors, null, 2));

  await prisma.$disconnect();
}

checkClaimedVendors().catch(console.error);
