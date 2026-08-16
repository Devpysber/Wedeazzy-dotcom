#!/usr/bin/env node
/**
 * Vendor data synchronizer.
 * 
 * If a CSV file path is provided as an argument, it imports from the local file.
 * Otherwise, it downloads and syncs directly from the Google Sheet URL configured in environmental variables.
 *
 * Usage:
 *   node src/scripts/seed-vendors.js [path/to/vendors.csv]
 */
const fs = require('fs');
const path = require('path');
const prisma = require('../config/db');
const env = require('../config/env');
const { syncGoogleSheetData } = require('../services/vendorSync.service');
const { slugify } = require('../utils/slug');

// Minimum CSV parser for local file parsing
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
  const headers = rows.shift().map(h => h.trim());
  return rows.filter(r => r.length && r.join('').trim()).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] || '').trim(); });
    return o;
  });
}

async function syncLocalFile(csvPath) {
  console.log(`[SYNC] Reading local CSV file from: ${csvPath}`);
  if (!fs.existsSync(csvPath)) {
    console.error(`[SYNC] Local CSV file not found at: ${csvPath}`);
    process.exit(1);
  }
  
  const text = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(text);
  console.log(`[SYNC] Parsed ${rows.length} local rows. Syncing with database...`);

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
        console.error(`[SYNC] Error syncing legacyId ${legacyId}: ${err.message}`);
        skipped++;
      }
    }));
    
    if ((i + batchSize) % 1000 < batchSize) {
      console.log(`[SYNC] ... processed ${Math.min(i + batchSize, rows.length)} / ${rows.length} records`);
    }
  }

  console.log(`[SYNC] Done. created=${created} updated=${updated} skipped=${skipped}`);
}

async function main() {
  const localPath = process.argv[2];
  if (localPath) {
    await syncLocalFile(path.resolve(localPath));
  } else {
    const csvUrl = env.GOOGLE_SHEET_CSV_URL;
    console.log(`[SYNC] No local file specified. Syncing from live Google Sheet URL...`);
    await syncGoogleSheetData(csvUrl);
  }
  
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[SYNC] Synchronizer execution failed:', e);
  prisma.$disconnect();
  process.exit(1);
});
