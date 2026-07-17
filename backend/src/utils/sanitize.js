/**
 * Input sanitization utilities to prevent XSS and injection attacks.
 * Apply to all user-submitted text fields before persistence.
 */

/**
 * Strip dangerous HTML tags but allow basic text.
 * Removes <script>, <iframe>, <object>, <embed>, <form>, on* event handlers.
 * @param {string} str - Raw user input
 * @returns {string} - Sanitized string
 */
function stripDangerousTags(str) {
  if (!str || typeof str !== 'string') return str || '';
  return str
    // Remove script/iframe/object/embed/form tags and content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
    .replace(/<embed[^>]*>/gi, '')
    .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '')
    // Remove event handlers (onclick, onerror, onload, etc.)
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    // Remove javascript: protocol URIs
    .replace(/javascript\s*:/gi, '')
    // Remove data: URIs that could contain scripts
    .replace(/data\s*:\s*text\/html/gi, '');
}

/**
 * Sanitize a plain-text user input field.
 * Trims whitespace, strips dangerous tags, and limits length.
 * @param {string} str - Raw user input
 * @param {number} maxLength - Maximum allowed length (default: 2000)
 * @returns {string} - Sanitized string
 */
function sanitizeText(str, maxLength = 2000) {
  if (!str || typeof str !== 'string') return '';
  return stripDangerousTags(str.trim()).slice(0, maxLength);
}

/**
 * Sanitize an object's string fields in place.
 * @param {object} obj - Object with string fields to sanitize
 * @param {string[]} fields - Array of field names to sanitize
 * @param {number} maxLength - Maximum allowed length per field
 * @returns {object} - The same object with sanitized fields
 */
function sanitizeFields(obj, fields, maxLength = 2000) {
  if (!obj || typeof obj !== 'object') return obj;
  for (const field of fields) {
    if (obj[field] && typeof obj[field] === 'string') {
      obj[field] = sanitizeText(obj[field], maxLength);
    }
  }
  return obj;
}

module.exports = { stripDangerousTags, sanitizeText, sanitizeFields };
