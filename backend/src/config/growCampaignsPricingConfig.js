const fs = require('fs');
const path = require('path');

let cached = null;
const configPath = path.join(__dirname, 'growCampaignsPricing.json');

function getGrowCampaignsPricing() {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    cached = JSON.parse(raw);
    return cached;
  } catch (err) {
    console.error('Failed to load grow campaigns pricing config:', err);
    return {};
  }
}

function saveGrowCampaignsPricing(pricing) {
  fs.writeFileSync(configPath, JSON.stringify(pricing, null, 2), 'utf8');
  cached = pricing;
}

function clearCache() {
  cached = null;
}

module.exports = { getGrowCampaignsPricing, saveGrowCampaignsPricing, clearCache };
