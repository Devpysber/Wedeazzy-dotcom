const fs = require('fs');
const path = require('path');

let cached = null;
const configPath = path.join(__dirname, 'vendorCategories.json');

function getVendorCategories() {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    cached = JSON.parse(raw);
    return cached;
  } catch (err) {
    console.error('Failed to load vendor categories config:', err);
    return [];
  }
}

function saveVendorCategories(categories) {
  fs.writeFileSync(configPath, JSON.stringify(categories, null, 2), 'utf8');
  cached = categories;
}

function clearCache() {
  cached = null;
}

module.exports = { getVendorCategories, saveVendorCategories, clearCache };
