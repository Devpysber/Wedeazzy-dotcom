const fs = require('fs');
const path = require('path');

let cachedPlans = null;
const configPath = path.join(__dirname, 'plans.json');

function loadFullConfig() {
  if (cachedPlans) return cachedPlans;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    cachedPlans = JSON.parse(raw);
    return cachedPlans;
  } catch (err) {
    console.error('Failed to load plans config:', err);
    return {
      Free: { price: 0, maxPhotos: 4, maxBusinesses: 1, description: 'Best for basic listing' },
      Premium: { price: 2999, maxPhotos: 10, maxBusinesses: 3, description: 'Boost visibility & reports' },
      Featured: { price: 5999, maxPhotos: 15, maxBusinesses: 7, description: 'Exclusive lockout ranking' },
      countries: {}
    };
  }
}

function getPlansConfig(countryCode) {
  const full = loadFullConfig();

  // If no specific country code is requested, return full object for admin management
  if (!countryCode || countryCode === 'all') {
    return full;
  }

  const code = String(countryCode).toUpperCase();
  if (full.countries && full.countries[code]) {
    return full.countries[code];
  }

  // Fallback to IN or root tier prices
  if (full.countries && full.countries.IN) {
    return full.countries.IN;
  }

  return {
    currency: 'INR',
    currencySymbol: '₹',
    Free: full.Free || { price: 0, maxPhotos: 4, maxBusinesses: 1, description: 'Basic listing' },
    Premium: full.Premium || { price: 2999, maxPhotos: 10, maxBusinesses: 3, description: 'Boost visibility' },
    Featured: full.Featured || { price: 5999, maxPhotos: 15, maxBusinesses: 7, description: 'Exclusive lockout ranking' }
  };
}

function clearPlansCache() {
  cachedPlans = null;
}

module.exports = { getPlansConfig, loadFullConfig, clearPlansCache };
