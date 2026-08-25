/**
 * Seed Countries, Cities, and Link Existing Vendors (Bulk Optimized)
 * ===================================================================
 * Initializes WedEazzy's 6 official marketplace countries:
 * 1. India (IN)
 * 2. UAE (AE)
 * 3. UK (GB)
 * 4. USA (US)
 * 5. Canada (CA)
 * 6. Australia (AU)
 *
 * Populates official cities under each country and updates existing
 * vendors with countryId and cityId relations in bulk.
 */

const prisma = require('../config/db');

const INITIAL_COUNTRIES = [
  {
    name: 'India',
    slug: 'india',
    code: 'IN',
    isoAlpha3: 'IND',
    currency: 'INR',
    currencySymbol: '₹',
    phoneCode: '+91',
    flag: '🇮🇳',
    timezone: 'Asia/Kolkata',
    displayOrder: 1,
    cities: [
      { name: 'Mumbai', slug: 'mumbai', state: 'Maharashtra', image: 'assets/images/mumbai.png' },
      { name: 'Delhi NCR', slug: 'delhi-ncr', state: 'Delhi', image: 'assets/images/delhi.png' },
      { name: 'Pune', slug: 'pune', state: 'Maharashtra', image: 'assets/images/pune.png' },
      { name: 'Jaipur', slug: 'jaipur', state: 'Rajasthan', image: 'assets/images/jaipur.png' },
      { name: 'Lucknow', slug: 'lucknow', state: 'Uttar Pradesh', image: 'assets/images/lucknow.png' },
      { name: 'Patna', slug: 'patna', state: 'Bihar', image: 'assets/images/patna.png' },
      { name: 'Navi Mumbai', slug: 'navi-mumbai', state: 'Maharashtra', image: 'assets/images/navi-mumbai.png' },
      { name: 'Ahmedabad', slug: 'ahmedabad', state: 'Gujarat', image: 'assets/images/ahmedabad.png' },
      { name: 'Bengaluru', slug: 'bengaluru', state: 'Karnataka', image: 'assets/images/bengaluru.png' },
      { name: 'Goa', slug: 'goa', state: 'Goa', image: '' },
      { name: 'Kolkata', slug: 'kolkata', state: 'West Bengal', image: '' },
      { name: 'Chennai', slug: 'chennai', state: 'Tamil Nadu', image: '' },
      { name: 'Hyderabad', slug: 'hyderabad', state: 'Telangana', image: '' },
      { name: 'Udaipur', slug: 'udaipur', state: 'Rajasthan', image: '' }
    ]
  },
  {
    name: 'UAE',
    slug: 'uae',
    code: 'AE',
    isoAlpha3: 'ARE',
    currency: 'AED',
    currencySymbol: 'AED ',
    phoneCode: '+971',
    flag: '🇦🇪',
    timezone: 'Asia/Dubai',
    displayOrder: 2,
    cities: [
      { name: 'Dubai', slug: 'dubai', state: 'Dubai', image: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=600&h=400&fit=crop&q=80' },
      { name: 'Abu Dhabi', slug: 'abu-dhabi', state: 'Abu Dhabi', image: 'https://images.unsplash.com/photo-1512632578888-169bbbc64f35?w=600&h=400&fit=crop&q=80' },
      { name: 'Sharjah', slug: 'sharjah', state: 'Sharjah', image: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=600&h=400&fit=crop&q=80' }
    ]
  },
  {
    name: 'UK',
    slug: 'uk',
    code: 'GB',
    isoAlpha3: 'GBR',
    currency: 'GBP',
    currencySymbol: '£',
    phoneCode: '+44',
    flag: '🇬🇧',
    timezone: 'Europe/London',
    displayOrder: 3,
    cities: [
      { name: 'London', slug: 'london', state: 'England', image: 'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&h=400&fit=crop&q=80' },
      { name: 'Birmingham', slug: 'birmingham', state: 'England', image: 'https://images.unsplash.com/photo-1605883746910-ee1182d04dd9?w=600&h=400&fit=crop&q=80' },
      { name: 'Manchester', slug: 'manchester', state: 'England', image: 'https://images.unsplash.com/photo-1543832923-4368d9b538ab?w=600&h=400&fit=crop&q=80' }
    ]
  },
  {
    name: 'USA',
    slug: 'usa',
    code: 'US',
    isoAlpha3: 'USA',
    currency: 'USD',
    currencySymbol: '$',
    phoneCode: '+1',
    flag: '🇺🇸',
    timezone: 'America/New_York',
    displayOrder: 4,
    cities: [
      { name: 'New York', slug: 'new-york', state: 'New York', image: 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=600&h=400&fit=crop&q=80' },
      { name: 'Los Angeles', slug: 'los-angeles', state: 'California', image: 'https://images.unsplash.com/photo-1580655653885-65763b2597d0?w=600&h=400&fit=crop&q=80' },
      { name: 'Miami', slug: 'miami', state: 'Florida', image: 'https://images.unsplash.com/photo-1506966953602-c20cc11f75e3?w=600&h=400&fit=crop&q=80' },
      { name: 'Chicago', slug: 'chicago', state: 'Illinois', image: 'https://images.unsplash.com/photo-1494522855154-9297ac14b55f?w=600&h=400&fit=crop&q=80' }
    ]
  },
  {
    name: 'Canada',
    slug: 'canada',
    code: 'CA',
    isoAlpha3: 'CAN',
    currency: 'CAD',
    currencySymbol: 'CA$',
    phoneCode: '+1',
    flag: '🇨🇦',
    timezone: 'America/Toronto',
    displayOrder: 5,
    cities: [
      { name: 'Toronto', slug: 'toronto', state: 'Ontario', image: 'https://images.unsplash.com/photo-1507992781348-310259076fe0?w=600&h=400&fit=crop&q=80' },
      { name: 'Vancouver', slug: 'vancouver', state: 'British Columbia', image: 'https://images.unsplash.com/photo-1559511260-66a654ae982a?w=600&h=400&fit=crop&q=80' },
      { name: 'Montreal', slug: 'montreal', state: 'Quebec', image: 'https://images.unsplash.com/photo-1519178614-68693b05be79?w=600&h=400&fit=crop&q=80' }
    ]
  },
  {
    name: 'Australia',
    slug: 'australia',
    code: 'AU',
    isoAlpha3: 'AUS',
    currency: 'AUD',
    currencySymbol: 'A$',
    phoneCode: '+61',
    flag: '🇦🇺',
    timezone: 'Australia/Sydney',
    displayOrder: 6,
    cities: [
      { name: 'Sydney', slug: 'sydney', state: 'New South Wales', image: 'https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?w=600&h=400&fit=crop&q=80' },
      { name: 'Melbourne', slug: 'melbourne', state: 'Victoria', image: 'https://images.unsplash.com/photo-1514395462725-fb4566210144?w=600&h=400&fit=crop&q=80' },
      { name: 'Brisbane', slug: 'brisbane', state: 'Queensland', image: 'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=600&h=400&fit=crop&q=80' }
    ]
  }
];

async function seedCountries() {
  console.log('🌏 Starting Seed: Countries & Cities Migration (Bulk)...');

  for (const cData of INITIAL_COUNTRIES) {
    const { cities, ...countryData } = cData;

    const country = await prisma.country.upsert({
      where: { code: countryData.code },
      update: { ...countryData },
      create: { ...countryData }
    });

    console.log(`✅ Country initialized: ${country.flag} ${country.name} (${country.code})`);

    for (const cityData of cities) {
      const city = await prisma.city.upsert({
        where: { slug: cityData.slug },
        update: {
          name: cityData.name,
          state: cityData.state,
          image: cityData.image || undefined,
          countryId: country.id
        },
        create: {
          name: cityData.name,
          slug: cityData.slug,
          state: cityData.state,
          image: cityData.image || '',
          countryId: country.id
        }
      });

      // Bulk link vendors matching this city slug
      const res = await prisma.vendor.updateMany({
        where: { citySlug: city.slug },
        data: {
          cityId: city.id,
          countryId: country.id
        }
      });
      if (res.count > 0) {
        console.log(`   └─ Linked ${res.count} vendors to city "${city.name}" (${country.name})`);
      }
    }

    // Bulk link remaining unlinked vendors matching country code or country name
    const countryRes = await prisma.vendor.updateMany({
      where: {
        countryId: null,
        OR: [
          { countryCode: country.code },
          { country: country.name }
        ]
      },
      data: { countryId: country.id }
    });
    if (countryRes.count > 0) {
      console.log(`   └─ Linked ${countryRes.count} vendors directly to ${country.name}`);
    }
  }

  // Set any remaining unlinked vendors to India
  const india = await prisma.country.findUnique({ where: { code: 'IN' } });
  if (india) {
    const remaining = await prisma.vendor.updateMany({
      where: { countryId: null },
      data: { countryId: india.id }
    });
    if (remaining.count > 0) {
      console.log(`🇮🇳 Linked remaining ${remaining.count} vendors to India default.`);
    }
  }

  console.log('🎉 Country & City bulk seeding and vendor linking completed successfully!');
}

if (require.main === module) {
  seedCountries()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ Error seeding countries:', err);
      process.exit(1);
    });
}

module.exports = { seedCountries };
