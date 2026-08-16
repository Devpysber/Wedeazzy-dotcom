const fs = require('fs');
const path = require('path');

let cached = null;
const configPath = path.join(__dirname, 'cities.json');

function getCities() {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    cached = JSON.parse(raw);
    return cached;
  } catch (err) {
    console.error('Failed to load cities config:', err);
    return [];
  }
}

function saveCities(cities) {
  fs.writeFileSync(configPath, JSON.stringify(cities, null, 2), 'utf8');
  cached = cities;
}

function clearCache() {
  cached = null;
}

module.exports = { getCities, saveCities, clearCache };
