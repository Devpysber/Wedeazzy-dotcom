const adminAnalyticsService = require('../src/services/adminAnalytics.service');

describe('Country-Scoped Admin Analytics Test Suite', () => {
  jest.setTimeout(30000);

  test('India Scope (IN) returns non-zero listings and active cities', async () => {
    const data = await adminAnalyticsService.getPlatformOverview({ countryCode: 'IN', range: '30d' });
    expect(data.ok).toBe(true);
    expect(data.kpis.listings.value).toBeGreaterThan(0);
    expect(data.topCities.length).toBeGreaterThan(0);
    expect(data.bookingsOverview.total).toBeGreaterThan(0);
  });

  test('UAE Scope (AE) returns strictly 0 listings, 0 users, 0 revenue, and 0 bookings with NO India leakage', async () => {
    const data = await adminAnalyticsService.getPlatformOverview({ countryCode: 'AE', range: '30d' });
    expect(data.ok).toBe(true);
    expect(data.kpis.listings.value).toBe(0);
    expect(data.kpis.vendors.value).toBe(0);
    expect(data.kpis.users.value).toBe(0);
    expect(data.kpis.inquiries.value).toBe(0);
    expect(data.revenue.totalRevenue).toBe(0);
    expect(data.bookingsOverview.total).toBe(0);
    expect(data.bookingsOverview.pending).toBe(0);
    expect(data.bookingsOverview.confirmed).toBe(0);
    
    // Verify growth series contains flat 0s
    const totalGrowthListings = data.growthSeries.listings.reduce((sum, val) => sum + val, 0);
    expect(totalGrowthListings).toBe(0);

    const totalGrowthUsers = data.growthSeries.users.reduce((sum, val) => sum + val, 0);
    expect(totalGrowthUsers).toBe(0);
  });

  test('UK Scope (GB) returns strictly 0 listings and 0 inquiries', async () => {
    const data = await adminAnalyticsService.getPlatformOverview({ countryCode: 'GB', range: '30d' });
    expect(data.ok).toBe(true);
    expect(data.kpis.listings.value).toBe(0);
    expect(data.kpis.inquiries.value).toBe(0);
    expect(data.bookingsOverview.total).toBe(0);
  });

  test('Global Scope (all) aggregates platform total listings and bookings', async () => {
    const data = await adminAnalyticsService.getPlatformOverview({ countryCode: 'all', range: '30d' });
    expect(data.ok).toBe(true);
    expect(data.kpis.listings.value).toBeGreaterThan(0);
    expect(data.countryPerformance.length).toBeGreaterThan(0);
    expect(data.bookingsOverview.total).toBeGreaterThan(0);
  });

});
