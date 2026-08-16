const fs = require('fs');
const path = require('path');

let cached = null;
const configPath = path.join(__dirname, 'emailWorkflows.json');

function getEmailWorkflows() {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    cached = JSON.parse(raw);
    return cached;
  } catch (err) {
    console.error('Failed to load email workflows config:', err);
    return {};
  }
}

function saveEmailWorkflows(workflows) {
  fs.writeFileSync(configPath, JSON.stringify(workflows, null, 2), 'utf8');
  cached = workflows;
}

function clearCache() {
  cached = null;
}

module.exports = { getEmailWorkflows, saveEmailWorkflows, clearCache };
