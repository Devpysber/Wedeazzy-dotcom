const prisma = require('../config/db');
const adminAnalytics = require('../services/adminAnalytics.service');

async function runAudit() {
  console.log('=== 1. DATABASE SCHEMA & DATA DISTRIBUTION ===');
  
  const userCounts = await prisma.user.groupBy({ by: ['role'], _count: { id: true } });
  console.log('User roles breakdown:', userCounts);

  const vendorCounts = await prisma.vendor.groupBy({ by: ['countryCode'], _count: { id: true } });
  console.log('Vendor countryCode breakdown:', vendorCounts);

  const dbCountries = await prisma.country.findMany({
    include: { _count: { select: { cities: true, regions: true, vendors: true } } }
  });
  console.log('Countries in DB:', dbCountries.map(c => ({
    name: c.name, code: c.code, currency: c.currency, status: c.status,
    cities: c._count.cities, regions: c._count.regions, vendors: c._count.vendors
  })));

  const dbCities = await prisma.city.findMany({ select: { name: true, slug: true, countryId: true } });
  console.log('Total DB Cities count:', dbCities.length);

  const inquiriesCount = await prisma.inquiry.count();
  const bookingsCount = await prisma.booking.count();
  const campaignsCount = await prisma.adCampaign.count();
  const transactionCount = await prisma.transaction.count();

  console.log({ inquiriesCount, bookingsCount, campaignsCount, transactionCount });

  console.log('\n=== 2. ADMIN ANALYTICS SERVICE COUNTRY ISOLATION TEST ===');

  const countryCodes = ['IN', 'US', 'GB', 'AE', 'CA', 'AU', 'all'];

  for (const code of countryCodes) {
    try {
      const overview = await adminAnalytics.getPlatformOverview({ countryCode: code });
      console.log(`\n--- Analytics for [${code}] ---`);
      console.log('KPIs Vendors:', overview.kpis?.vendors);
      console.log('KPIs Listings:', overview.kpis?.listings);
      console.log('KPIs Claimed:', overview.kpis?.claimedListings);
      console.log('KPIs Active Subs:', overview.kpis?.activeSubscriptions);
      console.log('KPIs Revenue:', overview.kpis?.revenue);
      console.log('KPIs Cities:', overview.kpis?.cities);
      console.log('Bookings overview:', overview.bookingsOverview);
      console.log('Ad Campaign Overview:', overview.adCampaignOverview);
      console.log('Claim Analytics:', overview.claimAnalytics);
    } catch (err) {
      console.error(`Error fetching analytics for ${code}:`, err.message);
    }
  }

  console.log('\n=== 3. CHECKING CROSS-COUNTRY DATA LEAKAGE IN DB ===');
  
  // Check if non-IN vendors have correct countryCode
  const mismatchedVendors = await prisma.vendor.findMany({
    where: {
      OR: [
        { countryCode: 'AE', country: { notIn: ['UAE', 'United Arab Emirates', 'AE'] } },
        { countryCode: 'US', country: { notIn: ['USA', 'United States', 'US'] } },
        { countryCode: 'GB', country: { notIn: ['UK', 'United Kingdom', 'GB'] } },
        { countryCode: 'CA', country: { notIn: ['Canada', 'CA'] } },
        { countryCode: 'AU', country: { notIn: ['Australia', 'AU'] } },
      ]
    },
    select: { id: true, businessName: true, country: true, countryCode: true }
  });
  console.log('Mismatched Vendor records count:', mismatchedVendors.length);

  await prisma.$disconnect();
}

runAudit().catch(err => {
  console.error(err);
  prisma.$disconnect();
});
