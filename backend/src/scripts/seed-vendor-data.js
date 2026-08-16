#!/usr/bin/env node
/**
 * WedEazzy Vendor Data Bulk Seeder
 * =================================
 * Imports all vendor data from the Wedeazzy_Data folder structure into the database.
 * Handles both Indian (Google Maps Leads format) and USA (Bing Maps Scraper format) data.
 *
 * Usage:
 *   node src/scripts/seed-vendor-data.js --data-dir /path/to/Wedeazzy_Data
 *   node src/scripts/seed-vendor-data.js --data-dir /path/to/Wedeazzy_Data --dry-run
 *   node src/scripts/seed-vendor-data.js --data-dir /path/to/Wedeazzy_Data --country INDIA
 *   node src/scripts/seed-vendor-data.js --data-dir /path/to/Wedeazzy_Data --country USA
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const prisma = require('../config/db');
const { slugify } = require('../utils/slug');
const { stripDangerousTags } = require('../utils/sanitize');

const args = process.argv.slice(2);
const DATA_DIR = args[args.indexOf('--data-dir') + 1] || path.join(__dirname, '../../../../Wedeazzy_Data');
const DRY_RUN = args.includes('--dry-run');
const COUNTRY_FILTER = args.includes('--country') ? args[args.indexOf('--country') + 1]?.toUpperCase() : null;
const BATCH_SIZE = 200;

let xlsx;
try { xlsx = require('xlsx'); } catch { xlsx = null; }

/* ============================================================
   PHONE NORMALISATION
   ============================================================ */
function normalisePhone(raw, countryCode) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (!digits) return '';

  if (countryCode === 'IN') {
    let p = digits;
    if (p.startsWith('0')) p = p.slice(1);
    if (p.length === 10) p = '91' + p;
    if (/^91[6-9]\d{9}$/.test(p)) return p;
    return '';
  }
  if (countryCode === 'US') {
    let p = digits;
    if (p.startsWith('1') && p.length === 11) p = p.slice(1);
    if (p.length === 10) return '1' + p;
    return '';
  }
  return digits.length >= 7 ? digits : '';
}

/* ============================================================
   CATEGORY NORMALISATION
   ============================================================ */
const CATEGORY_ALIASES = {
  'Photography': ['photographer', 'photography', 'photo'],
  'Banquet Halls': ['banquet', 'venue', 'event space', 'event venue', 'wedding chapel', 'reception hall', 'arts & entertainment', 'arts and entertainment'],
  'Catering': ['caterer', 'catering', 'food', 'restaurant', 'barbecue', 'american restaurant'],
  'Makeup Artist': ['makeup', 'make-up', 'bridal makeup', 'beauty'],
  'Decorator': ['decorator', 'decoration', 'florist', 'floral'],
  'DJ & Entertainment': ['dj', 'entertainment', 'music', 'band', 'wedding entertainment'],
  'Wedding Planner': ['wedding planner', 'event planner', 'planner'],
  'Invitation': ['invitation', 'stationery'],
  'Hotel': ['hotel', 'resort', 'accommodation'],
  'Mehendi': ['mehendi', 'mehndi', 'henna'],
};

function normaliseCategory(raw, hint) {
  const candidates = [raw, hint].filter(Boolean);
  for (const c of candidates) {
    const lower = String(c || '').toLowerCase().trim();
    for (const [canon, aliases] of Object.entries(CATEGORY_ALIASES)) {
      if (aliases.some(a => lower.includes(a))) return canon;
    }
  }
  if (raw) return String(raw).trim().replace(/\b\w/g, c => c.toUpperCase());
  return 'Other';
}

/* ============================================================
   CITY EXTRACTION
   ============================================================ */
const CITY_FROM_PATH = {
  'newyork': 'New York', 'new york': 'New York',
  'losangeles': 'Los Angeles', 'los angeles': 'Los Angeles',
  'sanfrancisco': 'San Francisco', 'san francisco': 'San Francisco',
  'washingtondc': 'Washington DC', 'washington': 'Washington DC',
  'chicago': 'Chicago', 'miami': 'Miami',
  'mumbai': 'Mumbai', 'delhi': 'Delhi', 'delhincr': 'Delhi NCR', 'delhi ncr': 'Delhi NCR',
  'bangalore': 'Bangalore', 'bengaluru': 'Bangalore',
  'pune': 'Pune', 'goa': 'Goa', 'hyderabad': 'Hyderabad',
  'chennai': 'Chennai', 'kolkata': 'Kolkata', 'thane': 'Thane',
  'nashik': 'Nashik', 'nagpur': 'Nagpur', 'ahmedabad': 'Ahmedabad',
  'jaipur': 'Jaipur', 'surat': 'Surat', 'lucknow': 'Lucknow',
};

function cityFromPath(filePath) {
  const parts = String(filePath).split(/[/\\]/);
  for (const part of parts.reverse()) {
    const key = part.toLowerCase().replace(/[^a-z ]/g, '').trim();
    if (CITY_FROM_PATH[key]) return CITY_FROM_PATH[key];
    // Try partial match
    for (const [k, v] of Object.entries(CITY_FROM_PATH)) {
      if (key === k || key.startsWith(k)) return v;
    }
  }
  return null;
}

function extractCityFromUSAddress(address) {
  if (!address) return '';
  const m = address.match(/,\s*([^,]+),\s*[A-Z]{2}\s*\d{5}/);
  if (m) return m[1].trim();
  const parts = String(address).split(',');
  if (parts.length >= 3) return parts[parts.length - 3].trim();
  return '';
}

/* ============================================================
   CSV PARSER
   ============================================================ */
function parseCSV(text) {
  if (typeof text === 'string' && text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); if (row.join('').trim()) rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
  }
  if (field || row.length) { row.push(field); if (row.join('').trim()) rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map(h => String(h || '').trim());
  return rows.map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = String(r[i] || '').trim(); });
    return o;
  });
}

/* ============================================================
   FILE READERS
   ============================================================ */
function readDataFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.csv') {
      const text = fs.readFileSync(filePath, { encoding: 'utf8', errors: 'replace' });
      return parseCSV(text);
    }
    if (ext === '.xlsx' || ext === '.xls') {
      if (!xlsx) {
        console.warn(`  ⚠  xlsx not installed, skipping ${path.basename(filePath)}`);
        return [];
      }
      const wb = xlsx.readFile(filePath, { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      return xlsx.utils.sheet_to_json(ws, { defval: '' });
    }
  } catch (e) {
    console.warn(`  ⚠  Could not read ${path.basename(filePath)}: ${e.message}`);
  }
  return [];
}

/* ============================================================
   NORMALISE HEADER → FIELD
   ============================================================ */
function normH(h) { return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

const FIELD_MAP = {
  name:        ['name','businessname','companyname','company name','company_name'],
  category:    ['category','categoryname','keyword','maincategory','main_category'],
  city:        ['city','location','town','locality'],
  area:        ['area','sublocality'],
  address:     ['address','fulladdress'],
  pincode:     ['pincode','pin','zip','zipcode','postalcode'],
  phone:       ['phone','phonenumber','mobile','contact','tel','telephone'],
  email:       ['email','emailaddress','email 1','email1','emails'],
  website:     ['website','url','site'],
  description: ['description','about','desc'],
  rating:      ['rating','review','stars'],
  instagram:   ['instagram'],
  facebook:    ['facebook'],
  lat:         ['lat','latitude'],
  lng:         ['lng','lon','long','longitude'],
  legacyId:    ['id','legacyid','place_id','cid'],
};

function buildMap(record) {
  const headers = Object.keys(record);
  const map = {};
  const normed = headers.map(h => ({ raw: h, norm: normH(h) }));
  for (const [field, aliases] of Object.entries(FIELD_MAP)) {
    const hit = normed.find(h => aliases.includes(h.norm));
    if (hit) map[field] = hit.raw;
  }
  return map;
}

function pv(record, map, field) {
  const h = map[field];
  return h ? String(record[h] ?? '').trim() : '';
}

/* ============================================================
   ROW → VENDOR DATA
   ============================================================ */
function rowToVendor(record, meta) {
  const { countryCode, countryName, folderCity, categoryHint } = meta;
  const map = buildMap(record);

  const name = stripDangerousTags(pv(record, map, 'name'));
  if (!name) return null;

  const rawCategory = pv(record, map, 'category');
  const category = normaliseCategory(rawCategory, categoryHint);

  // City resolution: explicit column > folder hint > address extraction (USA)
  let city = pv(record, map, 'city') || folderCity || '';
  if (!city && countryCode === 'US') city = extractCityFromUSAddress(pv(record, map, 'address'));
  if (!city) return null; // can't place the vendor without a city

  const rawPhone = pv(record, map, 'phone');
  // Some rows have multiple emails comma-separated
  const rawEmail = pv(record, map, 'email').split(',')[0].trim().toLowerCase();
  const email = rawEmail.includes('@') ? rawEmail : null;

  // Rating: "Rated 4.5 out of 5," or plain float
  const rawRating = pv(record, map, 'rating');
  let rating = 4.5;
  const rm = String(rawRating).match(/(\d+(\.\d+)?)/);
  if (rm) { const r = parseFloat(rm[1]); if (r > 0 && r <= 5) rating = r; }

  const rawAddr = pv(record, map, 'address');
  const pincode = pv(record, map, 'pincode').replace(/[^0-9]/g, '').slice(0, 10) || null;
  const lat = parseFloat(pv(record, map, 'lat')) || null;
  const lng = parseFloat(pv(record, map, 'lng')) || null;
  const legacyIdRaw = pv(record, map, 'legacyId') || `${slugify(name)}-${slugify(city)}`;

  // Instagram: extract username from URL
  let instagram = pv(record, map, 'instagram') || null;
  if (instagram) {
    const igm = instagram.match(/instagram\.com\/([^/?&#]+)/);
    if (igm) instagram = `https://www.instagram.com/${igm[1]}/`;
  }

  return {
    legacyId: legacyIdRaw.slice(0, 180),
    businessName: name,
    category,
    categorySlug: slugify(category),
    city,
    citySlug: slugify(city),
    country: countryName,
    countryCode,
    area: stripDangerousTags(pv(record, map, 'area')) || null,
    address: stripDangerousTags(rawAddr) || null,
    pincode,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    whatsappNumber: normalisePhone(rawPhone, countryCode) || null,
    email,
    website: pv(record, map, 'website') || null,
    instagram,
    facebook: pv(record, map, 'facebook') || null,
    description: stripDangerousTags(pv(record, map, 'description')) || null,
    rating,
    isActive: true,
    isVerified: false,
  };
}

/* ============================================================
   SLUG RESERVATION
   ============================================================ */
const takenSlugs = new Set();

async function preloadSlugs() {
  const all = await prisma.vendor.findMany({ select: { slug: true }, take: 100000 });
  all.forEach(v => takenSlugs.add(v.slug));
  console.log(`  Pre-loaded ${takenSlugs.size} existing slugs`);
}

function reserveSlug(base) {
  let s = slugify(base) || 'vendor';
  if (s.length > 180) s = s.slice(0, 180);
  let candidate = s, n = 1;
  while (takenSlugs.has(candidate)) { n++; candidate = `${s}-${n}`; }
  takenSlugs.add(candidate);
  return candidate;
}

/* ============================================================
   DEDUPLICATION IN MEMORY
   ============================================================ */
const seenPhones = new Set();
const seenNameCities = new Set();

async function loadExistingDedup() {
  const vendors = await prisma.vendor.findMany({
    select: { whatsappNumber: true, businessName: true, citySlug: true },
    take: 100000,
  });
  vendors.forEach(v => {
    if (v.whatsappNumber) seenPhones.add(v.whatsappNumber);
    seenNameCities.add(`${slugify(v.businessName)}|${v.citySlug}`);
  });
  console.log(`  Pre-loaded ${seenPhones.size} phones, ${seenNameCities.size} name-city pairs for dedup`);
}

function isDuplicate(v) {
  if (v.whatsappNumber && seenPhones.has(v.whatsappNumber)) return true;
  const nc = `${slugify(v.businessName)}|${slugify(v.city)}`;
  if (seenNameCities.has(nc)) return true;
  return false;
}

function markSeen(v) {
  if (v.whatsappNumber) seenPhones.add(v.whatsappNumber);
  seenNameCities.add(`${slugify(v.businessName)}|${slugify(v.city)}`);
}

/* ============================================================
   DISCOVER FILES
   ============================================================ */
function discoverFiles(rootDir) {
  const results = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (/\.(csv|xlsx)$/i.test(entry)) results.push(full);
    }
  }
  walk(rootDir);
  return results;
}

function fileCountry(filePath) {
  const p = filePath.toUpperCase();
  if (p.includes(`${path.sep}USA${path.sep}`) || p.includes('/USA/')) return { name: 'USA', code: 'US' };
  if (p.includes(`${path.sep}INDIA${path.sep}`) || p.includes('/INDIA/')) return { name: 'India', code: 'IN' };
  return { name: 'India', code: 'IN' };
}

// Infer category hint from filename
function categoryHintFromFile(filePath) {
  const fn = path.basename(filePath).toLowerCase();
  if (fn.includes('photo')) return 'Photography';
  if (fn.includes('banquet') || fn.includes('hall') || fn.includes('venue')) return 'Banquet Halls';
  if (fn.includes('cater')) return 'Catering';
  if (fn.includes('makeup') || fn.includes('make-up') || fn.includes('bridal')) return 'Makeup Artist';
  if (fn.includes('decor') || fn.includes('florist')) return 'Decorator';
  if (fn.includes('entertainment') || fn.includes('dj')) return 'DJ & Entertainment';
  if (fn.includes('planner')) return 'Wedding Planner';
  if (fn.includes('invitation')) return 'Invitation';
  if (fn.includes('mehendi') || fn.includes('mehndi')) return 'Mehendi';
  return null;
}

/* ============================================================
   MAIN
   ============================================================ */
async function main() {
  console.log('\n🚀 WedEazzy Vendor Data Bulk Seeder');
  console.log(`   Data directory : ${DATA_DIR}`);
  console.log(`   Dry run        : ${DRY_RUN}`);
  console.log(`   Country filter : ${COUNTRY_FILTER || 'ALL'}\n`);

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ Data directory not found: ${DATA_DIR}`);
    process.exit(1);
  }

  if (!xlsx) {
    try {
      console.log('Installing xlsx...');
      require('child_process').execSync('npm install xlsx --no-audit --no-fund', { cwd: path.join(__dirname, '../..'), stdio: 'inherit' });
      xlsx = require('xlsx');
    } catch (e) {
      console.warn('⚠  Could not install xlsx — .xlsx files will be skipped');
    }
  }

  const files = discoverFiles(DATA_DIR);
  console.log(`Found ${files.length} data files\n`);

  await preloadSlugs();
  await loadExistingDedup();

  let totalProcessed = 0, totalCreated = 0, totalDuplicates = 0, totalInvalid = 0;
  const fileResults = [];

  for (const filePath of files) {
    const country = fileCountry(filePath);
    if (COUNTRY_FILTER && country.name.toUpperCase() !== COUNTRY_FILTER && country.code !== COUNTRY_FILTER) continue;

    const folderCity = cityFromPath(filePath);
    const categoryHint = categoryHintFromFile(filePath);
    const relPath = path.relative(DATA_DIR, filePath);

    console.log(`\n📄 ${relPath}`);
    console.log(`   Country: ${country.name}  City: ${folderCity || 'from-data'}  Category: ${categoryHint || 'from-data'}`);

    const rows = readDataFile(filePath);
    if (!rows.length) { console.log('   ⚠  No rows found'); continue; }
    console.log(`   ${rows.length} rows`);

    const meta = { countryCode: country.code, countryName: country.name, folderCity, categoryHint };
    const vendors = rows.map(r => rowToVendor(r, meta)).filter(Boolean);
    console.log(`   ${vendors.length} valid vendor rows`);

    const toInsert = [];
    let fileDups = 0, fileInvalid = rows.length - vendors.length;

    for (const v of vendors) {
      if (isDuplicate(v)) { fileDups++; continue; }
      v.slug = reserveSlug(v.legacyId || `${v.businessName}-${v.city}`);
      markSeen(v);
      toInsert.push(v);
    }

    console.log(`   New: ${toInsert.length}  Duplicates: ${fileDups}  Invalid: ${fileInvalid}`);
    totalDuplicates += fileDups; totalInvalid += fileInvalid; totalProcessed += rows.length;

    if (DRY_RUN || toInsert.length === 0) {
      fileResults.push({ file: relPath, new: toInsert.length, dups: fileDups, invalid: fileInvalid });
      continue;
    }

    let fileCreated = 0;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      try {
        const result = await prisma.vendor.createMany({ data: batch, skipDuplicates: true });
        fileCreated += result.count;
        totalCreated += result.count;
      } catch (err) {
        // Fall back to one-by-one on batch error (e.g. a single row has a constraint violation)
        for (const v of batch) {
          try {
            await prisma.vendor.create({ data: v });
            fileCreated++; totalCreated++;
          } catch (e2) {
            if (!e2.message.includes('Unique constraint')) {
              console.warn(`   ⚠  Row failed: ${v.businessName}: ${e2.message.slice(0, 80)}`);
            }
          }
        }
      }
    }
    console.log(`   ✅ Inserted: ${fileCreated}`);
    fileResults.push({ file: relPath, new: fileCreated, dups: fileDups, invalid: fileInvalid });
  }

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total rows processed : ${totalProcessed.toLocaleString('en-IN')}`);
  console.log(`New vendors created  : ${totalCreated.toLocaleString('en-IN')}`);
  console.log(`Duplicates skipped   : ${totalDuplicates.toLocaleString('en-IN')}`);
  console.log(`Invalid rows skipped : ${totalInvalid.toLocaleString('en-IN')}`);
  if (DRY_RUN) console.log('\n⚠  DRY RUN — nothing was written to the database');

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(e => {
  console.error('\n❌ Seeder failed:', e);
  process.exit(1);
});
