const prisma = require('../config/db');
const { slugify } = require('../utils/slug');
const logger = require('../config/logger');

// Minimum CSV parser (robust against double quotes and commas)
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQ = false; }
      else { field += c; }
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else { field += c; }
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length && r.join('').trim()).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return o;
  });
}

/**
 * Downloads Google Sheet CSV data and upserts it in batches to the MySQL Vendor table.
 * Maps:
 *   - id -> legacyId and slug
 *   - name -> businessName
 *   - phone -> whatsappNumber
 * 
 * @param {string} csvUrl 
 */
async function syncGoogleSheetData(csvUrl) {
  logger.info(`[SYNC] Downloading Google Sheet CSV data from: ${csvUrl}`);
  
  const response = await fetch(csvUrl);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} failed to download CSV`);
  }
  
  const text = await response.text();
  const rows = parseCSV(text);
  logger.info(`[SYNC] Parsed ${rows.length} CSV rows. Syncing with database...`);

  let created = 0, updated = 0, skipped = 0;
  const batchSize = 100;

  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);
    
    await Promise.all(slice.map(async (r) => {
      if (!r.name || !r.city || !r.category) {
        skipped++;
        return;
      }
      
      let legacyId = r.id || (slugify(r.name) + '-' + slugify(r.city));
      if (legacyId.length > 190) {
        legacyId = legacyId.substring(0, 190);
      }
      
      const slug = legacyId;
      
      const payload = {
        legacyId,
        businessName: r.name,
        category: r.category,
        categorySlug: r.category_slug || slugify(r.category),
        city: r.city,
        citySlug: r.city_slug || slugify(r.city),
        area: r.area || null,
        address: r.address || null,
        pincode: r.pincode || null,
        googleCid: r.google_cid || null,
        whatsappNumber: r.phone || null, // Map phone to whatsappNumber
        rating: parseFloat(r.rating) || 4.5,
        isActive: (r.active || 'yes').toLowerCase() !== 'no',
      };

      try {
        const existing = await prisma.vendor.findUnique({ where: { legacyId } });
        if (existing) {
          await prisma.vendor.update({ where: { id: existing.id }, data: payload });
          updated++;
        } else {
          await prisma.vendor.create({ data: { slug, ...payload } });
          created++;
        }
      } catch (err) {
        logger.error(`[SYNC] Error syncing legacyId ${legacyId}: ${err.message}`);
        skipped++;
      }
    }));
    
    if ((i + batchSize) % 1000 < batchSize) {
      logger.info(`[SYNC] ... processed ${Math.min(i + batchSize, rows.length)} / ${rows.length} records`);
    }
  }

  logger.info(`[SYNC] Done. created=${created} updated=${updated} skipped=${skipped}`);
  return { created, updated, skipped };
}

module.exports = {
  syncGoogleSheetData
};
