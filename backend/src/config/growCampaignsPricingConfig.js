const fs = require('fs');
const path = require('path');

let cached = null;
const configPath = path.join(__dirname, 'growCampaignsPricing.json');

function getGrowCampaignsPricing(countryCode) {
  if (!cached) {
    try {
      const raw = fs.readFileSync(configPath, 'utf8');
      cached = JSON.parse(raw);
    } catch (err) {
      console.error('Failed to load grow campaigns pricing config:', err);
      return {};
    }
  }

  if (!countryCode || countryCode === 'all') {
    return cached;
  }

  const code = countryCode.toUpperCase();
  if (cached.countries && cached.countries[code]) {
    return cached.countries[code];
  }
  if (cached.countries && cached.countries.IN) {
    return cached.countries.IN;
  }

  return cached;
}

function saveGrowCampaignsPricing(pricing, countryCode) {
  const full = getGrowCampaignsPricing('all');

  if (countryCode && countryCode !== 'all') {
    const code = countryCode.toUpperCase();
    if (!full.countries) full.countries = {};
    full.countries[code] = pricing;
  } else {
    Object.assign(full, pricing);
  }

  fs.writeFileSync(configPath, JSON.stringify(full, null, 2), 'utf8');
  cached = full;
}

const COUNTRY_METADATA = {
  IN: { name: 'India', code: 'IN', currency: 'INR', symbol: '₹', flag: '🇮🇳' },
  AE: { name: 'UAE', code: 'AE', currency: 'AED', symbol: 'AED ', flag: '🇦🇪' },
  GB: { name: 'United Kingdom', code: 'GB', currency: 'GBP', symbol: '£', flag: '🇬🇧' },
  US: { name: 'USA', code: 'US', currency: 'USD', symbol: '$', flag: '🇺🇸' },
  CA: { name: 'Canada', code: 'CA', currency: 'CAD', symbol: 'CA$', flag: '🇨🇦' },
  AU: { name: 'Australia', code: 'AU', currency: 'AUD', symbol: 'A$', flag: '🇦🇺' },
};

function getSupportedGrowCountries() {
  const full = getGrowCampaignsPricing('all');
  const codes = ['IN'];
  if (full && full.countries) {
    Object.keys(full.countries).forEach(c => {
      if (!codes.includes(c)) codes.push(c);
    });
  }
  return codes.map(code => COUNTRY_METADATA[code] || {
    name: code, code, currency: 'USD', symbol: '$', flag: '🌐'
  });
}

function clearCache() {
  cached = null;
}

module.exports = {
  getGrowCampaignsPricing,
  saveGrowCampaignsPricing,
  clearCache,
  getSupportedGrowCountries,
  COUNTRY_METADATA
};

