/**
 * Universal Business Data Importer & Intelligence Controller
 * Admin > Import Listings
 */

const fs = require('fs');
const path = require('path');
const { v4: uuid } = require('uuid');
const prisma = require('../config/db');
const logger = require('../config/logger');
const { HttpError } = require('../middleware/error');
const { slugify } = require('../utils/slug');
const { stripDangerousTags } = require('../utils/sanitize');

const { parseUploadedFile } = require('../services/universalParser.service');
const {
  TARGET_FIELDS,
  autoDetectColumnMap,
  saveMappingPreference,
  loadMappingPreference,
  normaliseName,
  normaliseCity,
  normaliseCategory,
} = require('../services/businessDataNormalizer.service');

const {
  calculateDataQualityScore,
  generateDistributionAnalytics,
  generateDuplicateIntelligence,
} = require('../services/importAnalytics.service');

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
    if (/^91[6-9]\d{9}$/.test(p)) return p;
    if (p.length >= 8 && p.length <= 13) return p;
    return '';
  }

  if (countryCode === 'US' || countryCode === 'CA') {
    let p = digits;
    if (p.startsWith('1') && p.length === 11) p = p.slice(1);
    if (p.length === 10) return '1' + p;
    return '';
  }

  if (countryCode === 'GB' || countryCode === 'UK') {
    let p = digits;
    if (p.startsWith('44') && p.length >= 12) return p;
    if (p.startsWith('0')) p = p.slice(1);
    if (p.length === 10) return '44' + p;
    if (p.length >= 8 && p.length <= 13) return p;
    return '';
  }

  if (countryCode === 'AU') {
    let p = digits;
    if (p.startsWith('61') && p.length >= 11) return p;
    if (p.startsWith('0')) p = p.slice(1);
    if (p.length === 9) return '61' + p;
    if (p.length >= 8 && p.length <= 13) return p;
    return '';
  }

  if (countryCode === 'AE') {
    let p = digits;
    if (p.startsWith('971') && p.length >= 12) return p;
    if (p.startsWith('0')) p = p.slice(1);
    if (p.length === 9) return '971' + p;
    if (p.length >= 8 && p.length <= 13) return p;
    return '';
  }

  return digits.length >= 7 ? digits : '';
}

const COUNTRY_MAP = {
  'IN': { name: 'India',     code: 'IN' },
  'US': { name: 'USA',       code: 'US' },
  'GB': { name: 'UK',        code: 'GB' },
  'UK': { name: 'UK',        code: 'GB' },
  'AU': { name: 'Australia', code: 'AU' },
  'AE': { name: 'UAE',       code: 'AE' },
  'CA': { name: 'Canada',    code: 'CA' },
};

function detectCountryFromAddress(address) {
  if (!address) return null;
  const a = String(address).toLowerCase();

  if (/\b(new york|los angeles|san francisco|washington dc|chicago|miami|houston|phoenix|seattle|boston|atlanta)\b/.test(a)) return COUNTRY_MAP.US;
  if (/,\s*(ny|ca|tx|fl|wa|il|az|nv|pa|ga|ma|nj|va|nc|co|oh|mi|mn|or|md)\s+\d{5}/.test(a)) return COUNTRY_MAP.US;
  if (/united states|\busa\b/i.test(a)) return COUNTRY_MAP.US;

  if (/\b(london|manchester|birmingham|leeds|glasgow|edinburgh|liverpool|bristol|sheffield)\b/.test(a)) return COUNTRY_MAP.GB;
  if (/united kingdom|england|scotland|wales|\buk\b/i.test(a)) return COUNTRY_MAP.GB;

  if (/\b(sydney|melbourne|brisbane|perth|adelaide|canberra|gold coast|newcastle)\b/.test(a)) return COUNTRY_MAP.AU;
  if (/australia|\bnsw\b|\bvic\b|\bqld\b/i.test(a)) return COUNTRY_MAP.AU;

  if (/\b(dubai|abu dhabi|sharjah|ajman|ras al khaimah|fujairah)\b/.test(a)) return COUNTRY_MAP.AE;
  if (/united arab emirates|\buae\b/i.test(a)) return COUNTRY_MAP.AE;

  if (/\b(mumbai|delhi|bangalore|pune|hyderabad|chennai|kolkata|jaipur|goa|ahmedabad|surat|thane|nashik|nagpur|lucknow|patna|indore|bhopal|kochi|coimbatore)\b/.test(a)) return COUNTRY_MAP.IN;
  if (/\bindia\b/i.test(a)) return COUNTRY_MAP.IN;

  return null;
}

function extractCityFromUSAddress(address) {
  if (!address) return '';
  const m = address.match(/,\s*([^,]+),\s*[A-Z]{2}\s*\d{5}/);
  if (m) return m[1].trim();
  const parts = address.split(',');
  if (parts.length >= 3) return parts[parts.length - 3].trim();
  return '';
}

function pickValue(record, effectiveMap, targetField) {
  const sourceHeaders = Object.keys(effectiveMap).filter(h => effectiveMap[h] === targetField);
  for (const h of sourceHeaders) {
    const val = record[h];
    if (val != null && String(val).trim().length > 0) {
      return String(val).trim();
    }
  }
  return '';
}

function extractRawExtraData(record, effectiveMap) {
  const extra = {};
  Object.keys(record).forEach(h => {
    const mappedTarget = effectiveMap[h];
    if (!mappedTarget || mappedTarget === 'DONT_IMPORT') {
      const val = record[h];
      if (val != null && String(val).trim().length > 0) {
        extra[h] = String(val).trim();
      }
    }
  });
  return Object.keys(extra).length ? extra : null;
}

/**
 * ROW → CANDIDATE CONVERSION
 */
function toCandidate(record, effectiveMap, rowNumber, importMeta) {
  const country = importMeta.country || { name: 'India', code: 'IN' };
  const cityHint = importMeta.cityHint || '';
  const categoryHint = importMeta.categoryHint || '';

  const rawName = pickValue(record, effectiveMap, 'businessName');
  const name = normaliseName(stripDangerousTags(rawName));

  const rawCategory = pickValue(record, effectiveMap, 'category');
  const { normalizedCategory, sourceCategory } = normaliseCategory(rawCategory, categoryHint);
  const category = normalizedCategory;

  const rawCity = pickValue(record, effectiveMap, 'city');
  let city = normaliseCity(rawCity, cityHint);

  if ((!city || city === 'Unknown') && country.code === 'US') {
    const extracted = extractCityFromUSAddress(pickValue(record, effectiveMap, 'address'));
    if (extracted) city = normaliseCity(extracted, '');
  }

  const rawPhone = pickValue(record, effectiveMap, 'phone');
  const phone = normalisePhoneForCountry(rawPhone, country.code);

  const rawEmail = pickValue(record, effectiveMap, 'email');
  const emailFragment = rawEmail ? rawEmail.split(',')[0].trim().toLowerCase() : '';
  const emailFinal = (emailFragment && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailFragment)) ? emailFragment : null;

  const rawRating = pickValue(record, effectiveMap, 'rating');
  let rating = 4.5;
  const ratingMatch = rawRating.match(/(\d+(\.\d+)?)/);
  if (ratingMatch) {
    const r = parseFloat(ratingMatch[1]);
    if (r > 0 && r <= 5) rating = r;
  }

  const rawReviewCount = pickValue(record, effectiveMap, 'reviewCount');
  const reviewCount = parseInt(rawReviewCount.replace(/[^0-9]/g, ''), 10) || 0;

  const rawAddress = stripDangerousTags(pickValue(record, effectiveMap, 'address'));
  const pincode = pickValue(record, effectiveMap, 'pincode').replace(/[^0-9]/g, '').slice(0, 10) || null;

  let detectedCountry = country;
  const addrCountry = detectCountryFromAddress(rawAddress) || detectCountryFromAddress(city);
  if (addrCountry && addrCountry.code !== country.code) {
    detectedCountry = addrCountry;
  }

  if (!city) city = 'Unknown';

  const errors = [];
  if (!name) errors.push('Missing business name');
  if (rawPhone && !phone) errors.push(`Unusable phone "${rawPhone.slice(0, 20)}"`);

  const legacyIdRaw = pickValue(record, effectiveMap, 'legacyId') || `${slugify(name)}-${slugify(city)}`;
  const legacyId = legacyIdRaw.slice(0, 180);

  const instagram = pickValue(record, effectiveMap, 'instagram') || null;
  const facebook = pickValue(record, effectiveMap, 'facebook') || null;
  const website = pickValue(record, effectiveMap, 'website') || null;
  const googleMapsUrl = pickValue(record, effectiveMap, 'googleMapsUrl') || null;
  const lat = parseFloat(pickValue(record, effectiveMap, 'lat')) || null;
  const lng = parseFloat(pickValue(record, effectiveMap, 'lng')) || null;
  const description = stripDangerousTags(pickValue(record, effectiveMap, 'description')) || null;

  const rawExtraData = extractRawExtraData(record, effectiveMap);

  // Completeness score (0-100)
  let filledFields = 0;
  const coreChecks = [name, phone, emailFinal, category, city, rawAddress, website, instagram, facebook, description];
  coreChecks.forEach(val => { if (val) filledFields++; });
  const completenessScore = Math.round((filledFields / coreChecks.length) * 100);

  return {
    rowNumber,
    name,
    category,
    sourceCategory,
    categorySlug: slugify(category),
    city,
    citySlug: slugify(city),
    country: detectedCountry.name,
    countryCode: detectedCountry.code,
    area: stripDangerousTags(pickValue(record, effectiveMap, 'area')) || null,
    address: rawAddress || null,
    pincode,
    phone: phone || null,
    rawPhone: rawPhone || null,
    email: emailFinal,
    website,
    googleMapsUrl,
    description,
    instagram,
    facebook,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    rating,
    reviewCount,
    legacyId,
    rawExtraData,
    completenessScore,
    keyPhone: phone || null,
    keyEmail: emailFinal,
    keyNameCity: name && city ? `${slugify(name)}|${slugify(city)}` : null,
    errors,
    valid: errors.length === 0,
  };
}

/**
 * DUPLICATE ANALYSIS
 */
async function analyseDuplicates(candidates, rules) {
  const seenPhone = new Map();
  const seenEmail = new Map();
  const seenNameCity = new Map();
  const seenLegacy = new Map();
  const seenWebsite = new Map();

  for (const c of candidates) {
    if (!c.valid) { c.status = 'invalid'; continue; }
    let dupOf = null;
    let reason = null;

    if (rules.byPhone && c.keyPhone && seenPhone.has(c.keyPhone)) {
      dupOf = seenPhone.get(c.keyPhone); reason = 'Same phone number';
    } else if (rules.byNameCity && c.keyNameCity && seenNameCity.has(c.keyNameCity)) {
      dupOf = seenNameCity.get(c.keyNameCity); reason = 'Same business name in same city';
    } else if (rules.byEmail && c.keyEmail && seenEmail.has(c.keyEmail)) {
      dupOf = seenEmail.get(c.keyEmail); reason = 'Same email address';
    } else if (rules.byWebsite && c.website && seenWebsite.has(c.website)) {
      dupOf = seenWebsite.get(c.website); reason = 'Same website URL';
    } else if (c.legacyId && seenLegacy.has(c.legacyId)) {
      dupOf = seenLegacy.get(c.legacyId); reason = 'Same listing ID';
    }

    if (dupOf !== null) {
      c.status = 'duplicate_in_file';
      c.duplicateOfRow = dupOf;
      c.duplicateReason = reason;
      continue;
    }

    if (c.keyPhone) seenPhone.set(c.keyPhone, c.rowNumber);
    if (c.keyEmail) seenEmail.set(c.keyEmail, c.rowNumber);
    if (c.keyNameCity) seenNameCity.set(c.keyNameCity, c.rowNumber);
    if (c.website) seenWebsite.set(c.website, c.rowNumber);
    if (c.legacyId) seenLegacy.set(c.legacyId, c.rowNumber);
    c.status = 'new';
  }

  const fresh = candidates.filter(c => c.status === 'new');
  const phones = [...new Set(fresh.map(c => c.keyPhone).filter(Boolean))];
  const legacyIds = [...new Set(fresh.map(c => c.legacyId).filter(Boolean))];
  const CHUNK = 500;

  const existingByPhone = new Map();
  const existingByLegacy = new Map();
  const existingByNameCity = new Map();
  const existingVendorsMap = {};

  if (rules.byPhone && phones.length) {
    for (let i = 0; i < phones.length; i += CHUNK) {
      const hits = await prisma.vendor.findMany({
        where: { whatsappNumber: { in: phones.slice(i, i + CHUNK) } },
        select: { id: true, businessName: true, whatsappNumber: true, city: true, category: true, website: true, address: true }
      });
      hits.forEach(h => {
        existingByPhone.set(h.whatsappNumber, h);
        existingVendorsMap[h.id] = h;
      });
    }
  }

  if (legacyIds.length) {
    for (let i = 0; i < legacyIds.length; i += CHUNK) {
      const hits = await prisma.vendor.findMany({
        where: { legacyId: { in: legacyIds.slice(i, i + CHUNK) } },
        select: { id: true, businessName: true, legacyId: true, whatsappNumber: true, city: true, category: true, website: true, address: true }
      });
      hits.forEach(h => {
        existingByLegacy.set(h.legacyId, h);
        existingVendorsMap[h.id] = h;
      });
    }
  }

  if (rules.byNameCity && fresh.length) {
    const citySlugs = [...new Set(fresh.map(c => c.citySlug).filter(Boolean))];
    for (let i = 0; i < citySlugs.length; i += 50) {
      const hits = await prisma.vendor.findMany({
        where: { citySlug: { in: citySlugs.slice(i, i + 50) } },
        select: { id: true, businessName: true, citySlug: true, whatsappNumber: true, city: true, category: true, website: true, address: true }
      });
      hits.forEach(h => {
        existingByNameCity.set(`${slugify(h.businessName)}|${h.citySlug}`, h);
        existingVendorsMap[h.id] = h;
      });
    }
  }

  for (const c of fresh) {
    let match = null;
    let reason = null;
    if (c.legacyId && existingByLegacy.has(c.legacyId)) {
      match = existingByLegacy.get(c.legacyId); reason = 'Already imported';
    } else if (rules.byPhone && c.keyPhone && existingByPhone.has(c.keyPhone)) {
      match = existingByPhone.get(c.keyPhone); reason = 'Phone number already exists';
    } else if (rules.byNameCity && c.keyNameCity && existingByNameCity.has(c.keyNameCity)) {
      match = existingByNameCity.get(c.keyNameCity); reason = 'Business already listed in this city';
    }

    if (match) {
      c.status = 'duplicate_in_db';
      c.existingVendorId = match.id;
      c.existingVendorName = match.businessName;
      c.duplicateReason = reason;
    }
  }

  return { candidates, existingVendorsMap };
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
   CONTROLLER: PREVIEW (Universal & Intelligent)
   ============================================================ */
async function previewVendorImport(req, res, next) {
  try {
    if (!req.file) throw new HttpError(400, 'No CSV/XLSX file was uploaded', 'ERR_NO_FILE');
    sweepStaging();

    const rules = {
      byPhone: req.body.dedupePhone !== 'false',
      byNameCity: req.body.dedupeNameCity !== 'false',
      byEmail: req.body.dedupeEmail === 'true',
      byWebsite: req.body.dedupeWebsite === 'true',
    };

    const countryOverride = req.body.country || null;
    const cityHint = req.body.city || null;
    const categoryHint = req.body.category || null;

    let countryInfo = null;
    if (countryOverride) {
      const key = String(countryOverride).toUpperCase();
      countryInfo = COUNTRY_MAP[key] || COUNTRY_MAP.IN;
    }
    if (!countryInfo) countryInfo = { name: 'India', code: 'IN' };

    const importMeta = {
      country: countryInfo,
      cityHint,
      categoryHint,
    };

    // Universal File Parsing
    const parsed = parseUploadedFile(req.file.buffer, req.file.originalname, {
      sheetName: req.body.sheetName,
      delimiter: req.body.delimiter,
    });

    const { headers, records, isHeaderless, sheetNames, selectedSheet } = parsed;

    if (!headers.length) throw new HttpError(400, 'The file appears to be empty or unreadable', 'ERR_EMPTY_FILE');
    if (records.length > MAX_ROWS) throw new HttpError(400, `File has ${records.length.toLocaleString()} rows — limit is ${MAX_ROWS.toLocaleString()}`, 'ERR_TOO_MANY_ROWS');

    // Load saved mapping preference or run auto-detection
    let savedMapping = await loadMappingPreference(headers);
    let userCustomMapping = null;
    if (req.body.customMapping) {
      try {
        userCustomMapping = typeof req.body.customMapping === 'string'
          ? JSON.parse(req.body.customMapping)
          : req.body.customMapping;
      } catch (_) {}
    }

    const detectedMapDetails = autoDetectColumnMap(headers, records, savedMapping);

    // Effective Map: user custom override > auto-detected
    const effectiveMap = {};
    const columnReviewList = [];
    let autoMappedCount = 0;
    let reviewNeededCount = 0;

    headers.forEach(h => {
      const detail = detectedMapDetails[h] || { targetField: 'DONT_IMPORT', confidence: 0, confidenceBadge: 'Needs Review', matchMethod: 'Unmapped' };
      const selectedTarget = (userCustomMapping && userCustomMapping[h] !== undefined)
        ? userCustomMapping[h]
        : detail.targetField;

      effectiveMap[h] = selectedTarget;

      if (selectedTarget !== 'DONT_IMPORT') autoMappedCount++;
      else reviewNeededCount++;

      columnReviewList.push({
        uploadedHeader: h,
        targetField: selectedTarget,
        autoDetectedField: detail.targetField,
        confidence: Math.round(detail.confidence * 100),
        confidenceBadge: detail.confidenceBadge,
        matchMethod: detail.matchMethod,
      });
    });

    // Save preferences if admin customized mapping
    if (userCustomMapping) {
      await saveMappingPreference(headers, userCustomMapping);
    }

    const candidates = records.map((r, i) => toCandidate(r, effectiveMap, i + (isHeaderless ? 1 : 2), importMeta));
    const { existingVendorsMap } = await analyseDuplicates(candidates, rules);

    const summary = summarise(candidates);
    const dataQuality = calculateDataQualityScore(candidates, summary);
    const distribution = generateDistributionAnalytics(candidates, dataQuality);
    const duplicateIntel = generateDuplicateIntelligence(candidates, existingVendorsMap);

    const importId = uuid();
    fs.writeFileSync(
      path.join(STAGING_DIR, `${importId}.json`),
      JSON.stringify({
        createdAt: Date.now(),
        rules,
        effectiveMap,
        columnReviewList,
        candidates,
        importMeta,
        fileName: req.file.originalname,
      })
    );

    res.json({
      ok: true,
      importId,
      fileName: req.file.originalname,
      isHeaderless,
      sheetNames,
      selectedSheet,
      targetFields: TARGET_FIELDS,
      columnReviewList,
      columnStats: {
        totalColumns: headers.length,
        autoMappedCount,
        reviewNeededCount,
      },
      rules,
      country: countryInfo,
      summary,
      dataQuality,
      distribution,
      duplicateIntelligence: duplicateIntel,
      sample: candidates.slice(0, 200),
    });
  } catch (e) { next(e); }
}

/* ============================================================
   CONTROLLER: COMMIT (Batch & Rule-based)
   ============================================================ */
async function commitVendorImport(req, res, next) {
  try {
    const {
      importId,
      duplicateAction = 'skip', // 'skip' | 'import_all' | 'first_only' | 'update_existing'
      excludedCities = [],
      excludedCategories = [],
      filters = {},
    } = req.body || {};

    if (!importId || !/^[a-f0-9-]{36}$/i.test(String(importId))) throw new HttpError(400, 'Valid importId required', 'ERR_INPUT');

    const stagePath = path.join(STAGING_DIR, `${importId}.json`);
    if (!fs.existsSync(stagePath)) throw new HttpError(404, 'Import expired or already committed. Please re-upload.', 'ERR_IMPORT_EXPIRED');

    const staged = JSON.parse(fs.readFileSync(stagePath, 'utf8'));
    let candidates = staged.candidates || [];

    // Apply City & Category Exclusion Rules
    const excludedCitySet = new Set((excludedCities || []).map(c => String(c).toLowerCase().trim()));
    const excludedCategorySet = new Set((excludedCategories || []).map(c => String(c).toLowerCase().trim()));

    candidates = candidates.filter(c => {
      if (excludedCitySet.has((c.city || '').toLowerCase().trim())) return false;
      if (excludedCategorySet.has((c.category || '').toLowerCase().trim())) return false;
      return true;
    });

    // Apply Advanced Quality Filters
    if (filters.onlyPhone) candidates = candidates.filter(c => !!c.phone);
    if (filters.onlyEmail) candidates = candidates.filter(c => !!c.email);
    if (filters.onlyWebsite) candidates = candidates.filter(c => !!c.website);
    if (filters.minRating) candidates = candidates.filter(c => c.rating >= parseFloat(filters.minRating));
    if (filters.minCompleteness) candidates = candidates.filter(c => c.completenessScore >= parseInt(filters.minCompleteness, 10));

    // Determine target create vs update lists based on duplicateAction
    let toCreate = [];
    let toUpdate = [];

    if (duplicateAction === 'import_all') {
      toCreate = candidates.filter(c => c.valid);
    } else if (duplicateAction === 'first_only') {
      toCreate = candidates.filter(c => c.status === 'new' || c.status === 'duplicate_in_db');
    } else if (duplicateAction === 'update_existing') {
      toCreate = candidates.filter(c => c.status === 'new');
      toUpdate = candidates.filter(c => c.status === 'duplicate_in_db');
    } else {
      // Default 'skip': Only import new unique records
      toCreate = candidates.filter(c => c.status === 'new');
    }

    let created = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    // Pre-reserve slugs in memory
    const desired = toCreate.map(c => c.legacyId || slugify(`${c.name}-${c.city}`));
    const taken = new Set();
    for (let i = 0; i < desired.length; i += 500) {
      const hits = await prisma.vendor.findMany({ where: { slug: { in: desired.slice(i, i + 500) } }, select: { slug: true } });
      hits.forEach(h => taken.add(h.slug));
    }

    function reserveSlug(base) {
      let s = slugify(base) || 'listing';
      if (s.length > 180) s = s.slice(0, 180);
      let candidate = s;
      let n = 1;
      while (taken.has(candidate)) { n++; candidate = `${s}-${n}`; }
      taken.add(candidate);
      return candidate;
    }

    // Chunked creation
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
              googleBusiness: c.googleMapsUrl,
              instagram: c.instagram,
              facebook: c.facebook,
              description: c.description,
              rating: c.rating ?? 4.5,
              ratingCount: c.reviewCount || 0,
              isActive: true,
              isVerified: false,
            },
          });
          created++;
        } catch (err) {
          failed++;
          if (errors.length < 100) errors.push({ rowNumber: c.rowNumber, businessName: c.name, reason: err.message.slice(0, 200), field: 'db', originalValue: c.phone || '' });
        }
      }));
    }

    // Chunked update
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
          if (!current.googleBusiness && c.googleMapsUrl) patch.googleBusiness = c.googleMapsUrl;
          if (!current.description && c.description) patch.description = c.description;
          if (current.lat == null && c.lat != null) patch.lat = c.lat;
          if (current.lng == null && c.lng != null) patch.lng = c.lng;

          if (Object.keys(patch).length) {
            await prisma.vendor.update({ where: { id: c.existingVendorId }, data: patch });
            updated++;
          }
        } catch (err) {
          failed++;
          if (errors.length < 100) errors.push({ rowNumber: c.rowNumber, businessName: c.name, reason: err.message.slice(0, 200), field: 'db', originalValue: c.phone || '' });
        }
      }));
    }

    const skipped = staged.candidates.length - created - updated - failed;

    // Log in ImportHistory database table
    try {
      await prisma.importHistory.create({
        data: {
          importBatchId: importId,
          fileName: staged.fileName || 'import.csv',
          totalRows: staged.candidates.length,
          importedCount: created,
          updatedCount: updated,
          skippedCount: Math.max(0, skipped),
          failedCount: failed,
          columnMap: staged.effectiveMap || {},
          errorLog: errors.length ? errors : null,
        },
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to record import history');
    }

    try { fs.unlinkSync(stagePath); } catch (_) {}
    logger.info({ importId, created, updated, failed }, 'Universal business import committed');

    res.json({
      ok: true,
      importBatchId: importId,
      created,
      updated,
      failed,
      skipped: Math.max(0, skipped),
      errors,
    });
  } catch (e) { next(e); }
}

/* ============================================================
   CONTROLLER: IMPORT HISTORY & REPORTS
   ============================================================ */
async function getImportHistory(req, res, next) {
  try {
    const history = await prisma.importHistory.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ ok: true, history });
  } catch (e) { next(e); }
}

async function downloadErrorReport(req, res, next) {
  try {
    const { batchId } = req.params;
    const item = await prisma.importHistory.findUnique({ where: { importBatchId: batchId } });
    if (!item || !item.errorLog) throw new HttpError(404, 'No error log found for this import batch');

    const errors = item.errorLog || [];
    const lines = ['rowNumber,businessName,reason,field,originalValue'];

    errors.forEach(e => {
      lines.push(`${e.rowNumber},"${(e.businessName || '').replace(/"/g, '""')}","${(e.reason || '').replace(/"/g, '""')}","${e.field || ''}","${(e.originalValue || '').replace(/"/g, '""')}"`);
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="import-errors-${batchId.slice(0, 8)}.csv"`);
    res.send(lines.join('\n'));
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
  previewVendorImport,
  commitVendorImport,
  getImportHistory,
  downloadErrorReport,
  downloadImportTemplate,
  _normalisePhoneForCountry: normalisePhoneForCountry,
};