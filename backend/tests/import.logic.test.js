/**
 * Unit tests for Universal Business Data Importer & Intelligence System
 */
jest.mock('../src/config/db', () => ({
  vendor: {
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(async () => null),
    create: jest.fn(async () => ({})),
    update: jest.fn(async () => ({})),
  },
  importHistory: {
    create: jest.fn(async () => ({})),
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(async () => null),
  },
  importMappingPreference: {
    upsert: jest.fn(async () => ({})),
    findUnique: jest.fn(async () => null),
  },
}));

const { parseUploadedFile, detectDelimiter, isHeaderless } = require('../src/services/universalParser.service');
const { autoDetectColumnMap, normaliseName, normaliseCity, normaliseCategory } = require('../src/services/businessDataNormalizer.service');
const { calculateDataQualityScore, generateDistributionAnalytics, generateDuplicateIntelligence } = require('../src/services/importAnalytics.service');
const { _normalisePhoneForCountry: normalisePhone } = require('../src/controllers/import.controller');

describe('universalParser service', () => {
  test('detects comma delimiter', () => {
    expect(detectDelimiter('name,city,phone\nRoyal,Mumbai,9876543210')).toBe(',');
  });

  test('detects tab delimiter for TSV', () => {
    expect(detectDelimiter('name\tcity\tphone\nRoyal\tMumbai\t9876543210')).toBe('\t');
  });

  test('parses CSV buffer with BOM', () => {
    const buf = Buffer.from('\uFEFFname,city\nRoyal Palace,Mumbai\n', 'utf8');
    const { headers, records } = parseUploadedFile(buf, 'vendors.csv');
    expect(headers).toEqual(['name', 'city']);
    expect(records[0]).toEqual({ name: 'Royal Palace', city: 'Mumbai' });
  });

  test('detects headerless file', () => {
    expect(isHeaderless(['+919082610087', 'Mumbai', 'Photography'])).toBe(true);
  });
});

describe('normalisePhone — Multi-Country', () => {
  test('10-digit India → E.164 91...', () => expect(normalisePhone('9876543210', 'IN')).toBe('919876543210'));
  test('India phone with +91 and spaces', () => expect(normalisePhone('+91 98765-43210', 'IN')).toBe('919876543210'));
  test('USA 10-digit phone → 1212...', () => expect(normalisePhone('(212) 555-1234', 'US')).toBe('12125551234'));
});

describe('businessDataNormalizer service', () => {
  test('auto detects exact and synonym headers', () => {
    const headers = ['Business Name', 'Mobile Number', 'Location', 'Business Type'];
    const map = autoDetectColumnMap(headers);
    expect(map['Business Name'].targetField).toBe('businessName');
    expect(map['Mobile Number'].targetField).toBe('phone');
    expect(map['Location'].targetField).toBe('city');
    expect(map['Business Type'].targetField).toBe('category');
  });

  test('value pattern inspection maps phone values', () => {
    const headers = ['UnknownCol'];
    const records = [{ UnknownCol: '+919082610087' }, { UnknownCol: '+919876543210' }];
    const map = autoDetectColumnMap(headers, records);
    expect(map['UnknownCol'].targetField).toBe('phone');
  });

  test('normalises category aliases', () => {
    expect(normaliseCategory('Wedding Photographer').normalizedCategory).toBe('Photography');
    expect(normaliseCategory('Banquet Hall').normalizedCategory).toBe('Banquet Halls');
  });
});

describe('importAnalytics service', () => {
  test('calculates Data Quality Score correctly', () => {
    const candidates = [
      { name: 'A', phone: '919876543210', city: 'Mumbai', category: 'Photography', email: 'a@b.com', website: 'https://a.com' },
      { name: 'B', phone: '919876543211', city: 'Pune', category: 'Catering', email: null, website: null },
    ];
    const summary = { total: 2, duplicateInFile: 0, duplicateInDb: 0 };
    const dq = calculateDataQualityScore(candidates, summary);
    expect(dq.overallScore).toBeGreaterThan(60);
    expect(dq.grade).toBeDefined();
  });

  test('generates distribution analytics matrix', () => {
    const candidates = [
      { city: 'Mumbai', category: 'Photography' },
      { city: 'Mumbai', category: 'Catering' },
      { city: 'Pune', category: 'Photography' },
    ];
    const dist = generateDistributionAnalytics(candidates);
    expect(dist.uniqueCitiesCount).toBe(2);
    expect(dist.uniqueCategoriesCount).toBe(2);
    expect(dist.matrix.rows.length).toBe(2);
  });
});
