const fs = require('fs');
const path = require('path');

let cachedPlans = null;
const configPath = path.join(__dirname, 'plans.json');

function getPlansConfig() {
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
      Featured: { price: 5999, maxPhotos: 15, maxBusinesses: 7, description: 'Exclusive lockout ranking' }
    };
  }
}

function clearPlansCache() {
  cachedPlans = null;
}

module.exports = { getPlansConfig, clearPlansCache };
