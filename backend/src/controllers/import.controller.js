/**
 * Bulk vendor import from CSV/XLSX — Admin > Import Listings.
 *
 * Two-phase: preview (parse + dedup, no writes) then commit.
 * Supports both Indian and USA vendor data with automatic phone normalisation.
 */

const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const prisma = require('../config/db');
const logger = require('../config/logger');
const { HttpError } = require('../middleware/error');
const { slugify } = require('../utils/slug');
const { stripDangerousTags } = require('../utils/sanitize');

const STAGING_DIR = path.resolve(__dirname, '..', '..', 'import-staging');
fs.mkdirSync(STAGING_DIR, { recursive: true });

const STAGING_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ROWS = 60000;
const COMMIT_BATCH_SIZE = 200;

/* ============================================================
   PHONE NORMALISATION — country-aware
   ============================================================ */
function normalisePhoneForCountry(raw, countryCode) {
  if (!raw) return '';
  const digits = String(raw).replace(/[^0-9]/g, '');
  if (!digits) return '';

  if (countryCode === 'IN') {
    let p = digits;
    if (p.startsWith('0')) p = p.slice(1);
    if (p.length === 10) p = '91' + p;
    // Accept Indian mobile: 91[6-9]XXXXXXXXX
    if (/^91[6-9]\d{9}$/.test(p)) return p;
    // Accept Indian landline: 8-13 digits (2-3 digit area code + 6-8 digit number)
    // e.g. "022 4942 3758" (Mumbai) → 02249423758 → keep as-is for storage
    if (p.length >= 8 && p.length <= 13) return p;
    return '';
  }

  if (countryCode === 'US') {
    // Strip country code 1 if present
    let p = digits;
    if (p.startsWith('1') && p.length === 11) p = p.slice(1);
    if (p.length === 10) return '1' + p;
    return '';
  }

  if (countryCode === 'GB' || countryCode === 'UK') {
    // UK numbers: 44 + 10 digits, or 0 + 10 digits, or plain 10 digits
    let p = digits;
    if (p.startsWith('44') && p.length >= 12) return p;
    if (p.startsWith('0')) p = p.slice(1);
    if (p.length === 10) return '44' + p;
    if (p.length >= 8 && p.length <= 13) return p;
    return '';
  }

  if (countryCode === 'AU') {
    // Australian numbers: 61 + 9 digits (mobile starts with 4)
    let p = digits;
    if (p.startsWith('61') && p.length >= 11) return p;
    if (p.startsWith('0')) p = p.slice(1);
    if (p.length === 9) return '61' + p;
    if (p.length >= 8 && p.length <= 13) return p;
    return '';
  }

  if (countryCode === 'AE') {
    // UAE numbers: 971 + 9 digits (mobile starts with 5)
    let p = digits;
    if (p.startsWith('971') && p.length >= 12) return p;
    if (p.startsWith('0')) p = p.slice(1);
    if (p.length === 9) return '971' + p;
    if (p.length >= 8 && p.length <= 13) return p;
    return '';
  }

  if (countryCode === 'CA') {
    // Canadian numbers: same format as USA (1 + 10 digits)
    let p = digits;
    if (p.startsWith('1') && p.length === 11) p = p.slice(1);
    if (p.length === 10) return '1' + p;
    return '';
  }

  // Generic: return digits if at least 7 chars
  return digits.length >= 7 ? digits : '';
}

/* ============================================================
   COUNTRY DETECTION
   ============================================================ */
const COUNTRY_MAP = {
  'IN': { name: 'India',     code: 'IN' },
  'US': { name: 'USA',       code: 'US' },
  'GB': { name: 'UK',        code: 'GB' },
  'UK': { name: 'UK',        code: 'GB' },
  'AU': { name: 'Australia', code: 'AU' },
  'AE': { name: 'UAE',       code: 'AE' },
  'CA': { name: 'Canada',    code: 'CA' },
};

function detectCountryFromFilePath(filePath) {
  const p = String(filePath || '').toUpperCase();
  if (p.includes('/USA/') || p.includes('\\USA\\')) return COUNTRY_MAP.US;
  if (p.includes('/INDIA/') || p.includes('\\INDIA\\')) return COUNTRY_MAP.IN;
  if (p.includes('/UK/') || p.includes('\\UK\\') || p.includes('/GB/') || p.includes('\\GB\\')) return COUNTRY_MAP.GB;
  if (p.includes('/AUSTRALIA/') || p.includes('\\AUSTRALIA\\') || p.includes('/AU/') || p.includes('\\AU\\')) return COUNTRY_MAP.AU;
  if (p.includes('/UAE/') || p.includes('\\UAE\\') || p.includes('/AE/') || p.includes('\\AE\\')) return COUNTRY_MAP.AE;
  if (p.includes('/CANADA/') || p.includes('\\CANADA\\') || p.includes('/CA/') || p.includes('\\CA\\')) return COUNTRY_MAP.CA;
  return null;
}

function detectCountryFromAddress(address) {
  if (!address) return null;
  const a = String(address).toLowerCase();

  // USA patterns
  if (/\b(new york|los angeles|san francisco|washington dc|chicago|miami|houston|phoenix|seattle|boston|atlanta)\b/.test(a)) return COUNTRY_MAP.US;
  if (/,\s*(ny|ca|tx|fl|wa|il|az|nv|pa|ga|ma|nj|va|nc|co|oh|mi|mn|or|md)\s+\d{5}/.test(a)) return COUNTRY_MAP.US;
  if (/united states|\busa\b/i.test(a)) return COUNTRY_MAP.US;

  // UK patterns
  if (/\b(london|manchester|birmingham|leeds|glasgow|edinburgh|liverpool|bristol|sheffield)\b/.test(a)) return COUNTRY_MAP.GB;
  if (/united kingdom|england|scotland|wales|\buk\b/i.test(a)) return COUNTRY_MAP.GB;
  // UK postcodes: SW1A 1AA, M1 1AE, etc.
  if (/\b[a-z]{1,2}\d[a-z\d]?\s+\d[a-z]{2}\b/i.test(a)) return COUNTRY_MAP.GB;

  // Australia patterns
  if (/\b(sydney|melbourne|brisbane|perth|adelaide|canberra|gold coast|newcastle)\b/.test(a)) return COUNTRY_MAP.AU;
  if (/australia|\bnsw\b|\bvic\b|\bqld\b|\bwa\b australia|\bsa\b australia/i.test(a)) return COUNTRY_MAP.AU;

  // UAE patterns
  if (/\b(dubai|abu dhabi|sharjah|ajman|ras al khaimah|fujairah)\b/.test(a)) return COUNTRY_MAP.AE;
  if (/united arab emirates|\buae\b/i.test(a)) return COUNTRY_MAP.AE;

  // Canada patterns
  if (/\b(toronto|vancouver|montreal|calgary|ottawa|edmonton|winnipeg|quebec city)\b/.test(a)) return COUNTRY_MAP.CA;
  if (/canada|\bon\b canada|\bbc\b canada|\bqc\b canada|\bab\b canada/i.test(a)) return COUNTRY_MAP.CA;
  // Canadian postal codes: A1A 1A1
  if (/\b[a-z]\d[a-z]\s*\d[a-z]\d\b/i.test(a)) return COUNTRY_MAP.CA;

  // India patterns
  if (/\b(mumbai|delhi|bangalore|pune|hyderabad|chennai|kolkata|jaipur|goa|ahmedabad|surat|thane|nashik|nagpur|lucknow|patna|indore|bhopal|kochi|coimbatore)\b/.test(a)) return COUNTRY_MAP.IN;
  if (/\b(maharashtra|karnataka|gujarat|rajasthan|telangana|tamil nadu|west bengal|kerala|uttar pradesh|bihar|punjab|haryana|odisha|assam|jharkhand|chhattisgarh)\b/.test(a)) return COUNTRY_MAP.IN;
  if (/\bindia\b/i.test(a)) return COUNTRY_MAP.IN;

  return null;
}

/* ============================================================
   CATEGORY NORMALISATION
   ============================================================ */
const CATEGORY_ALIASES = {
  'Photography': ['photographer', 'photography', 'photo'],
  'Banquet Halls': ['banquet', 'venue', 'event space', 'event venue', 'venue & event', 'wedding chapel', 'reception hall', 'arts & entertainment', 'arts and entertainment'],
  'Catering': ['caterer', 'catering', 'food', 'restaurant', 'barbecue', 'american restaurant', 'indian restaurant'],
  'Makeup Artist': ['makeup', 'make-up', 'bridal makeup', 'makeup artist', 'beauty', 'cosmetic', 'salon'],
  'Decorator': ['decorator', 'decoration', 'florist', 'floral', 'flower'],
  'DJ & Entertainment': ['dj', 'entertainment', 'music', 'band', 'wedding entertainment', 'sound'],
  'Wedding Planner': ['wedding planner', 'event planner', 'planner'],
  'Invitation': ['invitation', 'stationery', 'card'],
  'Hotel': ['hotel', 'resort', 'accommodation', 'inn', 'motel'],
  'Mehendi': ['mehendi', 'mehndi', 'henna'],
  'Jewellery': ['jewellery', 'jewelry', 'jeweler'],
};

function normaliseCategory(raw) {
  if (!raw) return 'Other';
  const lower = String(raw).toLowerCase().trim();
  for (const [canon, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some(a => lower.includes(a))) return canon;
  }
  // Title-case the raw value
  return String(raw).trim().replace(/\b\w/g, c => c.toUpperCase());
}

/* ============================================================
   CITY EXTRACTION
   ============================================================ */
function extractCityFromFolderPath(filePath) {
  // e.g. /USA/NewYork/ -> New York, /USA/LosAngeles/ -> Los Angeles
  const cityMap = {
    'newyork': 'New York', 'losangeles': 'Los Angeles', 'sanfrancisco': 'San Francisco',
    'washingtondc': 'Washington DC', 'chicago': 'Chicago', 'miami': 'Miami',
    'mumbai': 'Mumbai', 'delhi': 'Delhi', 'bangalore': 'Bangalore', 'pune': 'Pune',
    'goa': 'Goa', 'hyderabad': 'Hyderabad', 'chennai': 'Chennai', 'kolkata': 'Kolkata',
  };
  const parts = String(filePath || '').split(/[/\\]/);
  for (const part of parts) {
    const key = part.toLowerCase().replace(/[^a-z]/g, '');
    if (cityMap[key]) return cityMap[key];
  }
  return null;
}

function extractCityFromUSAddress(address) {
  if (!address) return '';
  // Pattern: "..., City, STATE ZIP" e.g. "25 Broadway, New York, NY 10004"
  const m = address.match(/,\s*([^,]+),\s*[A-Z]{2}\s*\d{5}/);
  if (m) return m[1].trim();
  // Fallback: second-to-last comma segment
  const parts = address.split(',');
  if (parts.length >= 3) return parts[parts.length - 3].trim();
  return '';
}

/* ============================================================
   CSV PARSER
   ============================================================ */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
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
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') field += c;
    }
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows.shift().map(h => String(h || '').trim());
  const records = rows
    .filter(r => r.join('').trim())
    .map(r => {
      const o = {};
      headers.forEach((h, i) => { o[h] = String(r[i] || '').trim(); });
      return o;
    });
  return { headers, records };
}

/* ============================================================
   COLUMN MAPPING — handles both India (Google Maps Leads) and USA (Bing Scraper) formats
   ============================================================ */
const COLUMN_ALIASES = {
  name:        ['name','businessname','business','title','vendorname','companyname','company name','company_name','listingname'],
  category:    ['category','categoryname','type','businesstype','keyword','maincategory','main_category'],
  city:        ['city','town','cityname','location','locality'],
  area:        ['area','suburb','neighbourhood','sublocality'],
  address:     ['address','fulladdress','streetaddress','addressline'],
  pincode:     ['pincode','pin','zip','zipcode','postalcode'],
  phone:       ['phone','phonenumber','mobile','contact','contactnumber','whatsapp','tel','telephone'],
  email:       ['email','emailaddress','mail','contactemail','email 1','email1','emails'],
  website:     ['website','url','site','webaddress'],
  description: ['description','about','desc','summary','details','description'],
  rating:      ['rating','stars','score','avgrating','review','ratinginfo'],
  instagram:   ['instagram'],
  facebook:    ['facebook'],
  lat:         ['lat','latitude'],
  lng:         ['lng','lon','long','longitude'],
  legacyId:    ['id','legacyid','listingid','externalid','ref','place_id','ypid'],
};

function normaliseHeader(h) {
  return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function buildColumnMap(headers) {
  const map = {};
  const normalised = headers.map(h => ({ raw: h, norm: normaliseHeader(h) }));
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const hit = normalised.find(h => aliases.includes(h.norm));
    if (hit) map[field] = hit.raw;
  }
  return map;
}

function pick(record, columnMap, field) {
  const header = columnMap[field];
  return header ? String(record[header] ?? '').trim() : '';
}

/* ============================================================
   ROW → CANDIDATE
   ============================================================ */
function toCandidate(record, columnMap, rowNumber, importMeta) {
  const country = importMeta.country || { name: 'India', code: 'IN' };
  const folderCity = importMeta.folderCity || '';
  const folderCategory = importMeta.folderCategory || '';

  let name = stripDangerousTags(pick(record, columnMap, 'name'));
  let rawCategory = pick(record, columnMap, 'category') || folderCategory;
  let category = normaliseCategory(rawCategory);

  // For USA Bing data the category column is very specific — use folder inference
  // when the detected category maps to a non-wedding type
  if (folderCategory && category === 'Other') {
    category = normaliseCategory(folderCategory);
  }

  let city = pick(record, columnMap, 'city') || folderCity;
  // USA: extract city from address when there's no explicit city column
  if (!city && country.code === 'US') {
    city = extractCityFromUSAddress(pick(record, columnMap, 'address')) || folderCity;
  }

  const rawPhone = pick(record, columnMap, 'phone');
  const phone = normalisePhoneForCountry(rawPhone, country.code);

  const rawEmail = pick(record, columnMap, 'email');
  // "emails" column in Bing format can have multiple separated by comma
  const email = rawEmail.split(',')[0].trim().toLowerCase();

  // Rating: handle "Rated 4.5 out of 5," format (India) or plain float (USA)
  const rawRating = pick(record, columnMap, 'rating');
  let rating = 4.5;
  const ratingMatch = rawRating.match(/(\d+(\.\d+)?)/);
  if (ratingMatch) {
    const r = parseFloat(ratingMatch[1]);
    if (r > 0 && r <= 5) rating = r;
  }

  const rawAddress = stripDangerousTags(pick(record, columnMap, 'address'));
  const pincode = pick(record, columnMap, 'pincode').replace(/[^0-9]/g, '').slice(0, 10) || null;

  // Country resolution:
  //   1. Start with what the admin selected in the UI (importMeta.country)
  //   2. If the address is clearly USA (has NY/CA/TX zip patterns), override
  //      to USA even if admin picked India — protects against a mis-click
  //      forcing 50 USA vendors into the India tab
  //   3. Same for clear Indian address markers
  let detectedCountry = country;
  const addrCountry = detectCountryFromAddress(rawAddress) || detectCountryFromAddress(city);
  if (addrCountry && addrCountry.code !== country.code) {
    // Address strongly disagrees with the UI selection — trust the address.
    detectedCountry = addrCountry;
  }

  // For Bing/scraper CSVs that have no category column, fall back to the
  // filename hint. If still nothing, use 'Other' rather than rejecting the row.
  if (!category || category === 'Other') {
    if (folderCategory) category = normaliseCategory(folderCategory);
    if (!category || category === 'Other') category = 'Other';
  }

  // If city is still empty after address extraction, use a placeholder so
  // the row is saved rather than dropped — admin can correct it later.
  if (!city) city = folderCity || 'Unknown';

  const errors = [];
  if (!name) errors.push('Missing business name');
  // Category and city are no longer hard-required — we default them above.
  if (rawPhone && !phone) errors.push(`Unusable phone "${rawPhone.slice(0, 20)}"`);
  // Email: if it's not a valid format, silently drop it rather than rejecting
  // the whole row. Scraped data often has placeholders like "### In progress ###"
  // or multiple emails joined with commas — we already take the first, so if
  // that first fragment isn't valid, we just save the row without an email.
  const emailFinal = (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) ? email : null;

  const legacyIdRaw = pick(record, columnMap, 'legacyId') || `${slugify(name)}-${slugify(city)}`;
  const legacyId = legacyIdRaw.slice(0, 180);

  const instagram = pick(record, columnMap, 'instagram') || null;
  const facebook = pick(record, columnMap, 'facebook') || null;
  const website = pick(record, columnMap, 'website') || null;
  const lat = parseFloat(pick(record, columnMap, 'lat')) || null;
  const lng = parseFloat(pick(record, columnMap, 'lng')) || null;

  return {
    rowNumber,
    name, category,
    categorySlug: slugify(category),
    city, citySlug: slugify(city),
    country: detectedCountry.name,
    countryCode: detectedCountry.code,
    area: stripDangerousTags(pick(record, columnMap, 'area')) || null,
    address: rawAddress || null,
    pincode,
    phone: phone || null,
    email: emailFinal,
    website, description: stripDangerousTags(pick(record, columnMap, 'description')) || null,
    instagram, facebook,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    rating, legacyId,
    keyPhone: phone || null,
    keyEmail: emailFinal,
    keyNameCity: name && city ? `${slugify(name)}|${slugify(city)}` : null,
    errors, valid: errors.length === 0,
  };
}

/* ============================================================
   DUPLICATE ANALYSIS
   ============================================================ */
async function analyseDuplicates(candidates, rules) {
  const seenPhone = new Map(), seenEmail = new Map(), seenNameCity = new Map(), seenLegacy = new Map();

  for (const c of candidates) {
    if (!c.valid) { c.status = 'invalid'; continue; }
    let dupOf = null, reason = null;
    if (rules.byPhone && c.keyPhone && seenPhone.has(c.keyPhone)) { dupOf = seenPhone.get(c.keyPhone); reason = 'Same phone number'; }
    else if (rules.byNameCity && c.keyNameCity && seenNameCity.has(c.keyNameCity)) { dupOf = seenNameCity.get(c.keyNameCity); reason = 'Same business name in same city'; }
    else if (rules.byEmail && c.keyEmail && seenEmail.has(c.keyEmail)) { dupOf = seenEmail.get(c.keyEmail); reason = 'Same email address'; }
    else if (c.legacyId && seenLegacy.has(c.legacyId)) { dupOf = seenLegacy.get(c.legacyId); reason = 'Same listing ID'; }

    if (dupOf !== null) { c.status = 'duplicate_in_file'; c.duplicateOfRow = dupOf; c.duplicateReason = reason; continue; }
    if (c.keyPhone) seenPhone.set(c.keyPhone, c.rowNumber);
    if (c.keyEmail) seenEmail.set(c.keyEmail, c.rowNumber);
    if (c.keyNameCity) seenNameCity.set(c.keyNameCity, c.rowNumber);
    if (c.legacyId) seenLegacy.set(c.legacyId, c.rowNumber);
    c.status = 'new';
  }

  const fresh = candidates.filter(c => c.status === 'new');
  const phones = [...new Set(fresh.map(c => c.keyPhone).filter(Boolean))];
  const legacyIds = [...new Set(fresh.map(c => c.legacyId).filter(Boolean))];
  const CHUNK = 500;

  const existingByPhone = new Map(), existingByLegacy = new Map(), existingByNameCity = new Map();

  if (rules.byPhone && phones.length) {
    for (let i = 0; i < phones.length; i += CHUNK) {
      const hits = await prisma.vendor.findMany({ where: { whatsappNumber: { in: phones.slice(i, i+CHUNK) } }, select: { id: true, businessName: true, whatsappNumber: true } });
      hits.forEach(h => existingByPhone.set(h.whatsappNumber, h));
    }
  }
  if (legacyIds.length) {
    for (let i = 0; i < legacyIds.length; i += CHUNK) {
      const hits = await prisma.vendor.findMany({ where: { legacyId: { in: legacyIds.slice(i, i+CHUNK) } }, select: { id: true, businessName: true, legacyId: true } });
      hits.forEach(h => existingByLegacy.set(h.legacyId, h));
    }
  }
  if (rules.byNameCity && fresh.length) {
    const citySlugs = [...new Set(fresh.map(c => c.citySlug).filter(Boolean))];
    for (let i = 0; i < citySlugs.length; i += 50) {
      const hits = await prisma.vendor.findMany({ where: { citySlug: { in: citySlugs.slice(i, i+50) } }, select: { id: true, businessName: true, citySlug: true } });
      hits.forEach(h => existingByNameCity.set(`${slugify(h.businessName)}|${h.citySlug}`, h));
    }
  }

  for (const c of fresh) {
    let match = null, reason = null;
    if (c.legacyId && existingByLegacy.has(c.legacyId)) { match = existingByLegacy.get(c.legacyId); reason = 'Already imported'; }
    else if (rules.byPhone && c.keyPhone && existingByPhone.has(c.keyPhone)) { match = existingByPhone.get(c.keyPhone); reason = 'Phone number already exists'; }
    else if (rules.byNameCity && c.keyNameCity && existingByNameCity.has(c.keyNameCity)) { match = existingByNameCity.get(c.keyNameCity); reason = 'Business already listed in this city'; }
    if (match) { c.status = 'duplicate_in_db'; c.existingVendorId = match.id; c.existingVendorName = match.businessName; c.duplicateReason = reason; }
  }
  return candidates;
}

function summarise(candidates) {
  return {
    total: candidates.length,
    newCount: candidates.filter(c => c.status === 'new').length,
    duplicateInFile: candidates.filter(c => c.status === 'duplicate_in_file').length,
    duplicateInDb: candidates.filter(c => c.status === 'duplicate_in_db').length,
    invalid: candidates.filter(c => c.status === 'invalid').length,
  };
}

function sweepStaging() {
  try {
    const now = Date.now();
    for (const f of fs.readdirSync(STAGING_DIR)) {
      const full = path.join(STAGING_DIR, f);
      try { if (now - fs.statSync(full).mtimeMs > STAGING_TTL_MS) fs.unlinkSync(full); } catch (_) {}
    }
  } catch (err) { logger.warn({ err }, 'Import staging sweep failed'); }
}

/* ============================================================
   CONTROLLER: PREVIEW
   ============================================================ */
async function previewVendorImport(req, res, next) {
  try {
    if (!req.file) throw new HttpError(400, 'No CSV file was uploaded', 'ERR_NO_FILE');
    sweepStaging();

    const rules = {
      byPhone: req.body.dedupePhone !== 'false',
      byNameCity: req.body.dedupeNameCity !== 'false',
      byEmail: req.body.dedupeEmail === 'true',
    };

    // Country override from the UI (admin selects India/USA before uploading)
    const countryOverride = req.body.country || null;
    const cityOverride = req.body.city || null;
    const categoryOverride = req.body.category || null;

    let countryInfo = null;
    let countryFromFolder = false;

    if (countryOverride) {
      const key = String(countryOverride).toUpperCase();
      countryInfo = COUNTRY_MAP[key] || COUNTRY_MAP.IN;
      countryFromFolder = true;
    }

    // Detect country from original filename if sent
    const originalName = req.file.originalname || '';
    if (!countryInfo) {
      const detected = detectCountryFromFilePath(originalName);
      if (detected) { countryInfo = detected; countryFromFolder = true; }
    }

    if (!countryInfo) countryInfo = { name: 'India', code: 'IN' };

    // Extract city from folder hint passed by client
    const folderCity = cityOverride || extractCityFromFolderPath(originalName) || '';
    const folderCategory = categoryOverride || '';

    const importMeta = {
      country: countryInfo,
      countryFromFolder,
      folderCity,
      folderCategory,
    };

    const text = req.file.buffer.toString('utf8');
    const { headers, records } = parseCSV(text);

    if (!headers.length) throw new HttpError(400, 'The CSV file appears to be empty', 'ERR_EMPTY_CSV');
    if (records.length > MAX_ROWS) throw new HttpError(400, `File has ${records.length.toLocaleString()} rows — limit is ${MAX_ROWS.toLocaleString()}`, 'ERR_TOO_MANY_ROWS');

    const columnMap = buildColumnMap(headers);
    const missingRequired = ['name'].filter(f => !columnMap[f]);
    if (missingRequired.length) {
      throw new HttpError(400, `Could not find a name column. Detected: ${headers.slice(0,12).join(', ')}`, 'ERR_MISSING_COLUMNS');
    }

    const candidates = records.map((r, i) => toCandidate(r, columnMap, i + 2, importMeta));
    await analyseDuplicates(candidates, rules);

    const importId = uuid();
    fs.writeFileSync(
      path.join(STAGING_DIR, `${importId}.json`),
      JSON.stringify({ createdAt: Date.now(), rules, columnMap, candidates, importMeta })
    );

    res.json({
      ok: true, importId,
      fileName: req.file.originalname,
      columnMap, detectedHeaders: headers, rules,
      country: countryInfo,
      summary: summarise(candidates),
      sample: candidates.slice(0, 200),
    });
  } catch (e) { next(e); }
}

/* ============================================================
   CONTROLLER: COMMIT
   ============================================================ */
async function commitVendorImport(req, res, next) {
  try {
    const { importId, importDuplicates = false, updateExisting = false } = req.body || {};
    if (!importId || !/^[a-f0-9-]{36}$/i.test(String(importId))) throw new HttpError(400, 'Valid importId required', 'ERR_INPUT');

    const stagePath = path.join(STAGING_DIR, `${importId}.json`);
    if (!fs.existsSync(stagePath)) throw new HttpError(404, 'Import expired or already committed. Please re-upload.', 'ERR_IMPORT_EXPIRED');

    const staged = JSON.parse(fs.readFileSync(stagePath, 'utf8'));
    const candidates = staged.candidates || [];

    const toCreate = candidates.filter(c => c.status === 'new' || (importDuplicates && c.status === 'duplicate_in_file'));
    const toUpdate = updateExisting ? candidates.filter(c => c.status === 'duplicate_in_db') : [];

    let created = 0, updated = 0, failed = 0;
    const errors = [];

    // Pre-reserve slugs in memory
    const desired = toCreate.map(c => c.legacyId || slugify(`${c.name}-${c.city}`));
    const taken = new Set();
    for (let i = 0; i < desired.length; i += 500) {
      const hits = await prisma.vendor.findMany({ where: { slug: { in: desired.slice(i, i+500) } }, select: { slug: true } });
      hits.forEach(h => taken.add(h.slug));
    }

    function reserveSlug(base) {
      let s = slugify(base) || 'listing';
      if (s.length > 180) s = s.slice(0, 180);
      let candidate = s, n = 1;
      while (taken.has(candidate)) { n++; candidate = `${s}-${n}`; }
      taken.add(candidate);
      return candidate;
    }

    for (let i = 0; i < toCreate.length; i += COMMIT_BATCH_SIZE) {
      const batch = toCreate.slice(i, i + COMMIT_BATCH_SIZE);
      await Promise.all(batch.map(async c => {
        try {
          await prisma.vendor.create({
            data: {
              legacyId: c.legacyId || null,
              businessName: c.name,
              slug: reserveSlug(c.legacyId || `${c.name}-${c.city}`),
              category: c.category,
              categorySlug: c.categorySlug || slugify(c.category),
              city: c.city,
              citySlug: c.citySlug || slugify(c.city),
              country: c.country || 'India',
              countryCode: c.countryCode || 'IN',
              area: c.area,
              address: c.address,
              pincode: c.pincode,
              lat: c.lat, lng: c.lng,
              whatsappNumber: c.phone,
              website: c.website,
              instagram: c.instagram,
              facebook: c.facebook,
              description: c.description,
              rating: c.rating ?? 4.5,
              isActive: true, isVerified: false,
            },
          });
          created++;
        } catch (err) {
          failed++;
          if (errors.length < 50) errors.push({ row: c.rowNumber, name: c.name, message: err.message.slice(0, 200) });
        }
      }));
    }

    for (let i = 0; i < toUpdate.length; i += COMMIT_BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + COMMIT_BATCH_SIZE);
      await Promise.all(batch.map(async c => {
        if (!c.existingVendorId) return;
        try {
          const current = await prisma.vendor.findUnique({ where: { id: c.existingVendorId } });
          if (!current) return;
          const patch = {};
          if (!current.whatsappNumber && c.phone) patch.whatsappNumber = c.phone;
          if (!current.address && c.address) patch.address = c.address;
          if (!current.website && c.website) patch.website = c.website;
          if (!current.instagram && c.instagram) patch.instagram = c.instagram;
          if (!current.facebook && c.facebook) patch.facebook = c.facebook;
          if (!current.description && c.description) patch.description = c.description;
          if (current.lat == null && c.lat != null) patch.lat = c.lat;
          if (current.lng == null && c.lng != null) patch.lng = c.lng;
          // Always update country if it was previously the default
          if (c.country && c.country !== 'India' && current.country === 'India') patch.country = c.country;
          if (c.countryCode && c.countryCode !== 'IN' && current.countryCode === 'IN') patch.countryCode = c.countryCode;
          if (Object.keys(patch).length) { await prisma.vendor.update({ where: { id: c.existingVendorId }, data: patch }); updated++; }
        } catch (err) {
          failed++;
          if (errors.length < 50) errors.push({ row: c.rowNumber, name: c.name, message: err.message.slice(0, 200) });
        }
      }));
    }

    try { fs.unlinkSync(stagePath); } catch (_) {}
    logger.info({ importId, created, updated, failed }, 'CSV vendor import committed');

    res.json({ ok: true, created, updated, failed, skipped: candidates.length - created - updated - failed, errors });
  } catch (e) { next(e); }
}

function downloadImportTemplate(req, res) {
  const headers = ['name','category','city','country','area','address','pincode','phone','email','website','description','rating'];
  const indiaRow = ['"Royal Palace Banquet"','"Banquet Halls"','"Mumbai"','"India"','"Andheri West"','"12 Link Road, Andheri West"','"400053"','"9876543210"','"info@royal.com"','"https://royalpalace.com"','"Premium banquet hall"','"4.6"'];
  const usaRow   = ['"Cipriani 25 Broadway"','"Banquet Halls"','"New York"','"USA"','"Manhattan"','"25 Broadway, New York, NY 10004"','"10004"','"2125551234"','"info@cipriani.com"','"https://cipriani.com"','"Iconic event venue"','"4.8"'];
  const csv = `${headers.join(',')}\n${indiaRow.join(',')}\n${usaRow.join(',')}\n`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="wedeazzy-listings-template.csv"');
  res.send(csv);
}

module.exports = {
  previewVendorImport, commitVendorImport, downloadImportTemplate,
  _parseCSV: parseCSV, _buildColumnMap: buildColumnMap,
  _toCandidate: toCandidate, _analyseDuplicates: analyseDuplicates,
  _normalisePhoneForCountry: normalisePhoneForCountry,
  _normaliseCategory: normaliseCategory,
};