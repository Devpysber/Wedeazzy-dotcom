#!/usr/bin/env node
/**
 * One-off import of vendor listings from the legacy PHP/MySQL site
 * (u277519461_wedeazzy_test.sql) into the current Prisma-managed database.
 *
 * Source data was loaded into a scratch MySQL database named
 * `wedeazzy_legacy_import` (see import instructions in the audit report).
 * This script reads from that scratch DB read-only and writes into the
 * real app database via Prisma — it never touches the scratch DB's data.
 *
 * Conventions deliberately mirror the existing vendorSync.service.js /
 * seed-vendors.js CSV importer:
 *   - Vendors are imported as "unclaimed" listings (userId left null) —
 *     the Prisma schema already supports this explicitly for exactly this
 *     scenario ("seeded/unclaimed listings have no owner yet").
 *   - `legacyId` is the de-dupe key; re-running this script is safe and
 *     will skip any legacyId already present instead of creating
 *     duplicates or overwriting existing data.
 *   - Default rating of 4.5 and isVerified=false match the existing
 *     importer's conventions for bulk-sourced (non-admin-reviewed) data.
 *
 * Deviation from the CSV importer: legacyId here also incorporates the
 * legacy `service_reg_id` (not just slugify(name + city)), because 409
 * legacy name+city pairs collide (multi-branch chains like salons) — the
 * CSV importer's assumption that name+city is unique doesn't hold for
 * this dataset.
 *
 * Portfolio photos are stored in the legacy DB as inline base64 data URIs
 * (not external URLs) — each is decoded and written to
 * backend/uploads/legacy-import/ as a real file, then linked via a
 * VendorPhoto row, since the VendorPhoto.url column is sized for a normal
 * URL and cannot hold raw base64 data.
 *
 * Usage: node src/scripts/import-legacy-vendors.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const prisma = require('../config/db');
const env = require('../config/env');
const { slugify } = require('../utils/slug');

// Legacy DB password must be provided via env — never hardcoded.
if (!process.env.LEGACY_DB_PASSWORD) {
  console.error(
    '[import-legacy-vendors] Missing LEGACY_DB_PASSWORD environment variable. ' +
    'Set it in backend/.env before running this one-off legacy import script.'
  );
  process.exit(1);
}

const LEGACY_DB_CONFIG = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: process.env.LEGACY_DB_PASSWORD,
  database: 'wedeazzy_legacy_import',
  // Without an explicit charset, mysql2 can negotiate a connection charset
  // that mangles multi-byte text (e.g. Hindi/Devanagari business names come
  // back as "??????"). The source dump is utf8mb4 — match it exactly.
  charset: 'utf8mb4',
};

const PHOTO_DIR = path.resolve(env.UPLOAD_DIR, 'legacy-import');
const MIME_TO_EXT = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif' };

/**
 * Parse the legacy `portfolio` column into a list of decoded image buffers.
 * Returns [] (not an error) for any shape we can't use — a handful of rows
 * store a now-unreachable local file path from the old server instead of a
 * data URI, and a missing/empty photo set should never block the vendor
 * record itself from importing.
 */
function decodePortfolioImages(portfolioRaw) {
  if (!portfolioRaw) return [];
  let entries;
  try {
    entries = JSON.parse(portfolioRaw);
  } catch {
    return []; // not JSON (e.g. a leftover "/uploads/business/..." file path)
  }
  if (!Array.isArray(entries)) return [];

  const images = [];
  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    const match = /^data:image\/(\w+);base64,(.+)$/.exec(entry);
    if (!match) continue; // skip anything that isn't an embedded data URI
    const ext = MIME_TO_EXT[match[1].toLowerCase()] || 'jpg';
    try {
      images.push({ ext, buffer: Buffer.from(match[2], 'base64') });
    } catch {
      // corrupt base64 — skip this one image, not the whole vendor
    }
  }
  return images;
}

async function main() {
  fs.mkdirSync(PHOTO_DIR, { recursive: true });

  const legacyDb = await mysql.createConnection(LEGACY_DB_CONFIG);
  console.log('[IMPORT] Connected to legacy database. Fetching active vendors...');

  const [rows] = await legacyDb.query(
    `SELECT service_reg_id, vendor_name, vendor_rate, vendor_overview, portfolio,
            contact_number, pincode, vendor_address, city_name, vendor_service, email
     FROM vendors
     WHERE is_enable = 1`
  );
  await legacyDb.end();

  console.log(`[IMPORT] Fetched ${rows.length} active legacy vendors. Importing...`);

  let created = 0, skippedDuplicate = 0, skippedInvalid = 0;
  let photosImported = 0, photoErrors = 0;
  const batchSize = 50; // smaller than the CSV importer's 100 — each row also does file I/O

  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize);

    await Promise.all(slice.map(async (row) => {
      const name = (row.vendor_name || '').trim();
      const city = (row.city_name || '').trim();
      const category = (row.vendor_service || '').trim();

      if (!name || !city || !category) {
        skippedInvalid++;
        return;
      }

      // Disambiguated with service_reg_id since 409 legacy name+city pairs
      // collide (chain businesses with multiple branches).
      let legacyId = slugify(`${name}-${city}-${row.service_reg_id}`);
      if (legacyId.length > 190) legacyId = legacyId.slice(0, 190);

      try {
        const existing = await prisma.vendor.findUnique({ where: { legacyId } });
        if (existing) {
          skippedDuplicate++;
          return;
        }

        // A handful of legacy listings have SEO-stuffed names (200+ chars,
        // pipe-separated keyword spam) exceeding the businessName column's
        // 191-char limit — truncate rather than drop the whole listing.
        const businessName = name.length > 191 ? name.slice(0, 191) : name;

        const vendor = await prisma.vendor.create({
          data: {
            legacyId,
            slug: legacyId,
            businessName,
            category,
            categorySlug: slugify(category),
            city,
            citySlug: slugify(city),
            address: row.vendor_address || null,
            pincode: row.pincode || null,
            whatsappNumber: (row.contact_number || '').trim() || null,
            description: row.vendor_overview || null,
            priceMin: parseInt(row.vendor_rate, 10) || null,
            rating: 4.5,
            isActive: true,
            isVerified: false,
          },
        });

        const images = decodePortfolioImages(row.portfolio);
        for (let idx = 0; idx < images.length; idx++) {
          const { ext, buffer } = images[idx];
          const filename = `${legacyId}-${idx}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
          try {
            fs.writeFileSync(path.join(PHOTO_DIR, filename), buffer);
            await prisma.vendorPhoto.create({
              data: {
                vendorId: vendor.id,
                url: `${env.PUBLIC_BASE_URL}/uploads/legacy-import/${filename}`,
                position: idx,
                isCover: idx === 0,
              },
            });
            photosImported++;
          } catch (err) {
            photoErrors++;
            console.error(`[IMPORT] Photo write failed for ${legacyId} (#${idx}): ${err.message}`);
          }
        }

        created++;
      } catch (err) {
        console.error(`[IMPORT] Error importing service_reg_id=${row.service_reg_id} (${name}): ${err.message}`);
        skippedInvalid++;
      }
    }));

    if ((i + batchSize) % 500 < batchSize) {
      console.log(`[IMPORT] ... processed ${Math.min(i + batchSize, rows.length)} / ${rows.length}`);
    }
  }

  console.log('[IMPORT] Done.');
  console.log(`  Created:            ${created}`);
  console.log(`  Skipped (duplicate): ${skippedDuplicate}`);
  console.log(`  Skipped (invalid):   ${skippedInvalid}`);
  console.log(`  Photos imported:     ${photosImported}`);
  console.log(`  Photo errors:        ${photoErrors}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('[IMPORT] Fatal error:', e);
  prisma.$disconnect();
  process.exit(1);
});
