/**
 * Normalise an India-centric phone number to E.164 without +.
 * Returns ONLY valid 12-digit numbers matching 91[6-9]XXXXXXXXX.
 * Returns '' (empty string) for anything that can't be normalised.
 *
 * Examples:
 *  "9876543210"        → "919876543210"
 *  "+91 98765-43210"   → "919876543210"
 *  "919876543210"      → "919876543210"
 *  "07498987620"       → "917498987620"
 *  "99"                → ""   (too short — was a bug before this fix)
 *  "google_abc123"     → ""   (non-numeric — was a bug before)
 *  ""                  → ""
 */
function normalisePhone(input) {
  if (!input) return '';
  // Strip all non-digit characters
  let p = String(input).replace(/[^0-9]/g, '');
  // Strip leading 0 (trunk prefix)
  if (p.startsWith('0')) p = p.slice(1);
  // Prepend country code if 10-digit number
  if (p.length === 10) p = '91' + p;
  // Must be exactly 12 digits starting with 91[6-9] to be a valid Indian mobile
  if (/^91[6-9]\d{9}$/.test(p)) return p;
  // Anything else is invalid
  return '';
}

function isValidPhone(p) {
  const n = normalisePhone(p);
  return n.length === 12;
}

module.exports = { normalisePhone, isValidPhone };
