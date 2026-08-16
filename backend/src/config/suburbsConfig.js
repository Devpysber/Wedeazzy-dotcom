const fs = require('fs');
const path = require('path');

let cached = null;
const configPath = path.join(__dirname, 'suburbs.json');

function getSuburbs() {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    cached = JSON.parse(raw);
    return cached;
  } catch (err) {
    console.error('Failed to load suburbs config:', err);
    return [];
  }
}

function saveSuburbs(suburbs) {
  fs.writeFileSync(configPath, JSON.stringify(suburbs, null, 2), 'utf8');
  cached = suburbs;
}

function clearCache() {
  cached = null;
}

module.exports = { getSuburbs, saveSuburbs, clearCache };
