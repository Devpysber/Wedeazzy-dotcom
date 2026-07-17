/**
 * OTP generation and verification helpers.
 * Codes are always bcrypt-hashed before persistence — never store plaintext OTPs.
 */

const bcrypt = require('bcryptjs');
const env = require('../config/env');

/**
 * Generate a random numeric OTP code.
 * @param {number} [len=env.OTP_LENGTH] - Number of digits
 * @returns {string} Numeric code, e.g. "483920"
 */
function generateOtp(len = env.OTP_LENGTH) {
  let out = '';
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
}

/**
 * Hash a plaintext OTP code for storage.
 * @param {string} code
 * @returns {Promise<string>} bcrypt hash
 */
async function hashOtp(code) {
  return bcrypt.hash(code, 8);
}

/**
 * Compare a plaintext OTP code against its stored hash.
 * @param {string} code - User-submitted code
 * @param {string} hash - Stored bcrypt hash
 * @returns {Promise<boolean>}
 */
async function compareOtp(code, hash) {
  return bcrypt.compare(code, hash);
}

module.exports = { generateOtp, hashOtp, compareOtp };
