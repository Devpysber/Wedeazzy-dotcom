/**
 * Business Data Intelligence & Normalizer Service for WedEazzy
 * Includes synonym matching, value inspection, confidence scoring,
 * canonical data normalization, and schema mapping memory.
 */

const crypto = require('crypto');
const prisma = require('../config/db');
const logger = require('../config/logger');

// Supported target fields in WedEazzy listing model
const TARGET_FIELDS = [
  { key: 'businessName', label: 'Business Name', required: true },
  { key: 'phone', label: 'Phone / Mobile Number', required: false },
  { key: 'category', label: 'Category', required: false },
  { key: 'city', label: 'City', required: false },
  { key: 'area', label: 'Area / Suburb', required: false },
  { key: 'address', label: 'Full Address', required: false },
  { key: 'pincode', label: 'Pincode / Zip', required: false },
  { key: 'email', label: 'Email Address', required: false },
  { key: 'website', label: 'Website URL', required: false },
  { key: 'googleMapsUrl', label: 'Google Maps URL', required: false },
  { key: 'instagram', label: 'Instagram Handle/URL', required: false },
  { key: 'facebook', label: 'Facebook Page/URL', required: false },
  { key: 'rating', label: 'Rating (1-5)', required: false },
  { key: 'reviewCount', label: 'Review Count', required: false },
  { key: 'description', label: 'Description / About', required: false },
  { key: 'lat', label: 'Latitude', required: false },
  { key: 'lng', label: 'Longitude', required: false },
  { key: 'openingHours', label: 'Opening Hours', required: false },
  { key: 'priceRange', label: 'Price / Price Range', required: false },
  { key: 'imageUrl', label: 'Image URL', required: false },
  { key: 'logoUrl', label: 'Logo URL', required: false },
  { key: 'source', label: 'Data Source', required: false },
  { key: 'legacyId', label: 'Listing / External ID', required: false },
];

// Comprehensive Synonym Dictionary
const SYNONYM_DICTIONARY = {
  businessName: [
    'name', 'businessname', 'business name', 'company', 'companyname', 'company name',
    'title', 'vendorname', 'vendor name', 'shopname', 'shop name', 'restaurantname',
    'listingname', 'listing name', 'place name', 'placename', 'store name'
  ],
  phone: [
    'phone', 'phonenumber', 'phone number', 'mobile', 'mobilenumber', 'mobile number',
    'contact', 'contactnumber', 'contact number', 'telephone', 'telephonenumber',
    'whatsapp', 'whatsapp number', 'tel', 'cell', 'phone 1'
  ],
  category: [
    'category', 'categoryname', 'category name', 'businesstype', 'business type',
    'industry', 'type', 'maincategory', 'main category', 'keyword', 'service type', 'niche'
  ],
  city: [
    'city', 'cityname', 'city name', 'town', 'location', 'locality', 'district', 'city/town'
  ],
  area: [
    'area', 'suburb', 'neighbourhood', 'sublocality', 'neighborhood', 'zone', 'sector'
  ],
  address: [
    'address', 'fulladdress', 'full address', 'streetaddress', 'street address', 'addressline', 'location address'
  ],
  pincode: [
    'pincode', 'pin', 'zip', 'zipcode', 'zip code', 'postalcode', 'postal code'
  ],
  email: [
    'email', 'emailaddress', 'email address', 'mail', 'contactemail', 'contact email', 'email1'
  ],
  website: [
    'website', 'websiteurl', 'website url', 'url', 'site', 'webaddress', 'domain', 'web'
  ],
  googleMapsUrl: [
    'googlemaps', 'google maps', 'googlemapsurl', 'google maps url', 'gmaps', 'map url', 'maplink'
  ],
  instagram: ['instagram', 'insta', 'instagram url', 'instagram handle'],
  facebook: ['facebook', 'fb', 'facebook url', 'facebook page'],
  rating: ['rating', 'stars', 'score', 'avgrating', 'avg rating', 'review rating', 'google rating'],
  reviewCount: ['reviewcount', 'review count', 'reviews', 'number of reviews', 'num_reviews'],
  description: ['description', 'about', 'desc', 'summary', 'details', 'bio', 'overview'],
  lat: ['lat', 'latitude'],
  lng: ['lng', 'lon', 'long', 'longitude'],
  openingHours: ['openinghours', 'opening hours', 'timings', 'business hours', 'hours'],
  priceRange: ['pricerange', 'price range', 'price', 'pricing', 'cost'],
  imageUrl: ['imageurl', 'image url', 'photo', 'photourl', 'photo url', 'image'],
  logoUrl: ['logourl', 'logo url', 'logo'],
  source: ['source', 'scraper', 'data source', 'platform'],
  legacyId: ['id', 'legacyid', 'listingid', 'externalid', 'ref', 'place_id', 'ypid', 'placeid']
};

// Known Indian & International Cities for Value Inspection
const KNOWN_CITIES = new Set([
  'mumbai', 'delhi', 'pune', 'bangalore', 'bengaluru', 'hyderabad', 'chennai', 'kolkata',
  'jaipur', 'goa', 'ahmedabad', 'surat', 'thanas', 'thane', 'nashik', 'nagpur', 'lucknow',
  'patna', 'indore', 'bhopal', 'kochi', 'coimbatore', 'chandigarh', 'udaipur', 'jodhpur',
  'new york', 'los angeles', 'chicago', 'houston', 'miami', 'london', 'dubai', 'sydney'
]);

// Known Wedding Categories for Value Inspection
const KNOWN_CATEGORIES = new Set([
  'photography', 'photographer', 'wedding planner', 'catering', 'caterer', 'makeup',
  'bridal makeup', 'banquet', 'venue', 'decorator', 'decoration', 'mehendi', 'mehndi',
  'dj', 'jewellery', 'jewelry', 'invitation', 'florist', 'hotel', 'resort'
]);

function normalizeHeaderString(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Value Pattern Inspection
 * Evaluates raw column sample values to infer target field type.
 */
function inspectValuePatterns(sampleValues) {
  if (!sampleValues || !sampleValues.length) return null;
  const nonEmpties = sampleValues.map(s => String(s || '').trim()).filter(Boolean);
  if (!nonEmpties.length) return null;

  let phoneHits = 0;
  let emailHits = 0;
  let urlHits = 0;
  let cityHits = 0;
  let categoryHits = 0;
  let gmapsHits = 0;
  let numHits = 0;

  for (const val of nonEmpties) {
    const lower = val.toLowerCase();
    // Phone pattern
    if (/^(\+91|\+1|0)?[6-9]\d{9}$/.test(val.replace(/[\s-]/g, '')) || /^(\+?\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}$/.test(val)) {
      phoneHits++;
    }
    // Email pattern
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
      emailHits++;
    }
    // Google Maps URL
    if (lower.includes('google.com/maps') || lower.includes('maps.app.goo.gl') || lower.includes('g.page')) {
      gmapsHits++;
    } else if (/^https?:\/\//i.test(val) || /www\./i.test(val)) {
      urlHits++;
    }
    // City match
    if (KNOWN_CITIES.has(lower) || [...KNOWN_CITIES].some(c => lower.includes(c))) {
      cityHits++;
    }
    // Category match
    if (KNOWN_CATEGORIES.has(lower) || [...KNOWN_CATEGORIES].some(cat => lower.includes(cat))) {
      categoryHits++;
    }
    // Number pattern (rating / counts)
    if (/^\d+(\.\d+)?$/.test(val)) {
      numHits++;
    }
  }

  const len = nonEmpties.length;
  if (phoneHits / len >= 0.4) return { field: 'phone', confidence: 0.92 };
  if (emailHits / len >= 0.4) return { field: 'email', confidence: 0.95 };
  if (gmapsHits / len >= 0.4) return { field: 'googleMapsUrl', confidence: 0.98 };
  if (urlHits / len >= 0.4) return { field: 'website', confidence: 0.85 };
  if (cityHits / len >= 0.4) return { field: 'city', confidence: 0.88 };
  if (categoryHits / len >= 0.4) return { field: 'category', confidence: 0.88 };

  return null;
}

/**
 * Intelligent Column Detection Engine
 * Returns a mapping of uploadedHeader -> { targetField, confidence, confidenceBadge, matchMethod }
 */
function autoDetectColumnMap(headers, records = [], savedMapping = null) {
  const result = {};
  const usedTargetFields = new Set();

  // Create sample value lists per column
  const sampleMap = {};
  headers.forEach(h => { sampleMap[h] = []; });
  records.slice(0, 30).forEach(r => {
    headers.forEach(h => {
      if (r[h]) sampleMap[h].push(r[h]);
    });
  });

  // Step 1: Check saved mapping memory if available
  if (savedMapping) {
    headers.forEach(h => {
      const savedTarget = savedMapping[h];
      if (savedTarget && savedTarget !== 'DONT_IMPORT') {
        result[h] = {
          targetField: savedTarget,
          confidence: 1.0,
          confidenceBadge: 'High',
          matchMethod: 'Remembered Mapping',
        };
        usedTargetFields.add(savedTarget);
      }
    });
  }

  // Step 2: Exact & Synonym Matching
  headers.forEach(h => {
    if (result[h]) return;
    const norm = normalizeHeaderString(h);

    for (const [targetField, aliases] of Object.entries(SYNONYM_DICTIONARY)) {
      if (usedTargetFields.has(targetField)) continue;
      const normalizedAliases = aliases.map(normalizeHeaderString);

      if (normalizedAliases.includes(norm)) {
        const isExact = aliases.some(a => a.toLowerCase() === h.trim().toLowerCase());
        const conf = isExact ? 0.99 : 0.92;
        result[h] = {
          targetField,
          confidence: conf,
          confidenceBadge: 'High',
          matchMethod: isExact ? 'Exact Match' : 'Synonym Match',
        };
        usedTargetFields.add(targetField);
        break;
      }
    }
  });

  // Step 3: Value Inspection for remaining unmapped columns
  headers.forEach(h => {
    if (result[h]) return;
    const sampleValues = sampleMap[h];
    const valueMatch = inspectValuePatterns(sampleValues);

    if (valueMatch && !usedTargetFields.has(valueMatch.field)) {
      result[h] = {
        targetField: valueMatch.field,
        confidence: valueMatch.confidence,
        confidenceBadge: valueMatch.confidence >= 0.85 ? 'High' : 'Medium',
        matchMethod: 'Value Pattern Inspection',
      };
      usedTargetFields.add(valueMatch.field);
    }
  });

  // Step 4: Fallback / Unmapped
  headers.forEach(h => {
    if (!result[h]) {
      result[h] = {
        targetField: 'DONT_IMPORT',
        confidence: 0.0,
        confidenceBadge: 'Needs Review',
        matchMethod: 'Unmapped',
      };
    }
  });

  return result;
}

/**
 * Fingerprint generator for header lists (schema memory signature).
 */
function getHeaderFingerprint(headers) {
  const sorted = [...headers].map(normalizeHeaderString).sort();
  return crypto.createHash('md5').update(sorted.join('|')).digest('hex');
}

/**
 * Save schema mapping preference for future files.
 */
async function saveMappingPreference(headers, columnMap) {
  try {
    const fingerprint = getHeaderFingerprint(headers);
    await prisma.importMappingPreference.upsert({
      where: { fingerprint },
      update: { columnMap, headers },
      create: { fingerprint, headers, columnMap },
    });
  } catch (err) {
    logger.warn({ err }, 'Failed to save import mapping preference');
  }
}

/**
 * Load saved schema mapping preference if exists.
 */
async function loadMappingPreference(headers) {
  try {
    const fingerprint = getHeaderFingerprint(headers);
    const pref = await prisma.importMappingPreference.findUnique({
      where: { fingerprint },
    });
    return pref ? pref.columnMap : null;
  } catch (err) {
    return null;
  }
}

/**
 * Canonical Data Normalizers
 */
function normaliseName(raw) {
  if (!raw) return '';
  return String(raw)
    .trim()
    .replace(/\s+/g, ' ');
}

function normaliseCity(raw, cityHint = '') {
  if (cityHint && cityHint.trim()) return cityHint.trim();
  if (!raw) return 'Unknown';

  const clean = String(raw).trim();
  const lower = clean.toLowerCase();

  const cityMap = {
    'bombay': 'Mumbai',
    'mumbai, maharashtra': 'Mumbai',
    'navi mumbai': 'Navi Mumbai',
    'bengaluru': 'Bangalore',
    'bangalore, karnataka': 'Bangalore',
    'new delhi': 'Delhi',
    'delhi ncr': 'Delhi',
  };

  for (const [key, canon] of Object.entries(cityMap)) {
    if (lower === key || lower.includes(key)) return canon;
  }

  // Title-case
  return clean.replace(/\b\w/g, c => c.toUpperCase());
}

const CATEGORY_ALIASES = {
  'Photography': ['photographer', 'photography', 'photo', 'photo studio'],
  'Banquet Halls': ['banquet', 'venue', 'event space', 'event venue', 'wedding chapel', 'reception hall'],
  'Catering': ['caterer', 'catering', 'food', 'restaurant'],
  'Makeup Artist': ['makeup', 'make-up', 'bridal makeup', 'makeup artist', 'salon', 'beauty'],
  'Decorator': ['decorator', 'decoration', 'florist', 'floral', 'flower'],
  'DJ & Entertainment': ['dj', 'entertainment', 'music', 'band', 'sound'],
  'Wedding Planner': ['wedding planner', 'event planner', 'planner'],
  'Invitation': ['invitation', 'stationery', 'card'],
  'Hotel': ['hotel', 'resort', 'inn'],
  'Mehendi': ['mehendi', 'mehndi', 'henna'],
  'Jewellery': ['jewellery', 'jewelry', 'jeweler'],
};

function normaliseCategory(raw, categoryHint = '') {
  const sourceCategory = String(raw || categoryHint || 'Other').trim();
  if (!sourceCategory) return { normalizedCategory: 'Other', sourceCategory: 'Other' };

  const lower = sourceCategory.toLowerCase();
  for (const [canon, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some(a => lower.includes(a))) {
      return { normalizedCategory: canon, sourceCategory };
    }
  }

  const titleCased = sourceCategory.replace(/\b\w/g, c => c.toUpperCase());
  return { normalizedCategory: titleCased, sourceCategory };
}

module.exports = {
  TARGET_FIELDS,
  autoDetectColumnMap,
  getHeaderFingerprint,
  saveMappingPreference,
  loadMappingPreference,
  normaliseName,
  normaliseCity,
  normaliseCategory,
  inspectValuePatterns,
};
