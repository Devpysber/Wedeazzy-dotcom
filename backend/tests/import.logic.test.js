/**
 * Unit tests for CSV import parser / dedup / phone normalisation.
 * Tests both Indian and USA vendor data formats.
 */
jest.mock('../src/config/db', () => ({
  vendor: {
    findMany: jest.fn(async () => []),
    findUnique: jest.fn(async () => null),
    create: jest.fn(async () => ({})),
    update: jest.fn(async () => ({})),
  },
}));

const {
  _parseCSV: parseCSV,
  _buildColumnMap: buildColumnMap,
  _toCandidate: toCandidate,
  _analyseDuplicates: analyseDuplicates,
  _normalisePhoneForCountry: normalisePhone,
  _normaliseCategory: normaliseCategory,
} = require('../src/controllers/import.controller');

const IN_META = { country: { name: 'India', code: 'IN' }, countryFromFolder: true, folderCity: 'Mumbai', folderCategory: '' };
const US_META = { country: { name: 'USA', code: 'US' }, countryFromFolder: true, folderCity: 'New York', folderCategory: 'Banquet Halls' };
const IN_MAP = buildColumnMap(['name', 'category', 'city', 'phone', 'email', 'rating']);
const US_MAP = buildColumnMap(['Name', 'Category', 'Address', 'Phone', 'Emails', 'Rating']);

describe('parseCSV', () => {
  test('parses headers and rows', () => {
    const { headers, records } = parseCSV('name,city\nRoyal Palace,Mumbai\n');
    expect(headers).toEqual(['name', 'city']);
    expect(records[0]).toEqual({ name: 'Royal Palace', city: 'Mumbai' });
  });
  test('handles quoted commas', () => {
    const { records } = parseCSV('name,address\n"Bloom, Decor","12 Link Rd, Andheri"\n');
    expect(records[0].name).toBe('Bloom, Decor');
  });
  test('strips BOM', () => {
    const { headers } = parseCSV('\uFEFFname,city\nA,B\n');
    expect(headers[0]).toBe('name');
  });
  test('handles CRLF', () => {
    const { records } = parseCSV('name,city\r\nA,B\r\nC,D\r\n');
    expect(records).toHaveLength(2);
  });
});

describe('normalisePhone — India', () => {
  test('10-digit → prefixed', () => expect(normalisePhone('9876543210', 'IN')).toBe('919876543210'));
  test('with +91 and spaces', () => expect(normalisePhone('+91 98765-43210', 'IN')).toBe('919876543210'));
  test('already 12-digit', () => expect(normalisePhone('919876543210', 'IN')).toBe('919876543210'));
  test('leading zero stripped', () => expect(normalisePhone('09876543210', 'IN')).toBe('919876543210'));
  test('invalid landline returns empty', () => expect(normalisePhone('011-23456789', 'IN')).toBe(''));
  test('2-digit returns empty', () => expect(normalisePhone('99', 'IN')).toBe(''));
});

describe('normalisePhone — USA', () => {
  test('10-digit → prefixed with 1', () => expect(normalisePhone('2125551234', 'US')).toBe('12125551234'));
  test('11-digit with country code', () => expect(normalisePhone('12125551234', 'US')).toBe('12125551234'));
  test('formatted US number', () => expect(normalisePhone('(212) 555-1234', 'US')).toBe('12125551234'));
  test('too short returns empty', () => expect(normalisePhone('555123', 'US')).toBe(''));
});

describe('normaliseCategory', () => {
  test('photographer → Photography', () => expect(normaliseCategory('Wedding Photographer')).toBe('Photography'));
  test('banquet → Banquet Halls', () => expect(normaliseCategory('Banquet Hall')).toBe('Banquet Halls'));
  test('venue → Banquet Halls', () => expect(normaliseCategory('Venue & event space')).toBe('Banquet Halls'));
  test('makeup → Makeup Artist', () => expect(normaliseCategory('Bridal makeup artist')).toBe('Makeup Artist'));
  test('caterer → Catering', () => expect(normaliseCategory('Catering services')).toBe('Catering'));
  test('unknown → title-cased raw', () => expect(normaliseCategory('Invitation Design Studio')).toBe('Invitation'));
});

describe('toCandidate — India format', () => {
  test('valid Indian row extracts correctly', () => {
    const c = toCandidate(
      { name: 'Royal Palace', category: 'Banquet Halls', city: 'Mumbai', phone: '9876543210', email: 'a@b.com', rating: '4.7' },
      IN_MAP, 2, IN_META
    );
    expect(c.valid).toBe(true);
    expect(c.phone).toBe('919876543210');
    expect(c.country).toBe('India');
    expect(c.countryCode).toBe('IN');
    expect(c.rating).toBe(4.7);
  });
  test('"Rated 4.5 out of 5," rating format', () => {
    const c = toCandidate({ name: 'A', category: 'Catering', city: 'Pune', rating: 'Rated 4.3 out of 5,' }, IN_MAP, 2, IN_META);
    expect(c.rating).toBeCloseTo(4.3);
  });
  test('missing name → invalid', () => {
    const c = toCandidate({ name: '', category: 'C', city: 'Mumbai' }, IN_MAP, 2, IN_META);
    expect(c.valid).toBe(false);
    expect(c.errors).toContain('Missing business name');
  });
  test('strips XSS from name', () => {
    const c = toCandidate({ name: '<script>alert(1)</script>Evil Co', category: 'C', city: 'Pune' }, IN_MAP, 2, IN_META);
    expect(c.name).not.toContain('<script>');
  });
});

describe('toCandidate — USA format', () => {
  const usMap = buildColumnMap(['Name', 'Address', 'Phone', 'Emails', 'Rating', 'Category', 'Latitude', 'Longitude']);
  test('extracts city from address when no city column', () => {
    const c = toCandidate(
      { Name: 'Cipriani', Address: '25 Broadway, New York, NY 10004', Phone: '2125551234', Rating: '4.8', Category: 'Venue & event space' },
      usMap, 2, US_META
    );
    expect(c.valid).toBe(true);
    expect(c.country).toBe('USA');
    expect(c.countryCode).toBe('US');
    expect(c.phone).toBe('12125551234');
    expect(c.category).toBe('Banquet Halls'); // normalised from 'Venue & event space'
  });
  test('uses folderCity as fallback when address extraction fails', () => {
    const c = toCandidate(
      { Name: 'Venue XYZ', Phone: '2125556789', Category: 'Venue' },
      usMap, 2, US_META
    );
    expect(c.city).toBe('New York');
  });
  test('empty Emails cell → null email', () => {
    const c = toCandidate(
      { Name: 'Test', Address: '123 Main St, New York, NY 10001', Emails: '', Category: 'Banquet' },
      usMap, 2, US_META
    );
    expect(c.email).toBeNull();
  });
  test('comma-separated emails → takes first', () => {
    const c = toCandidate(
      { Name: 'Test', Address: '123 Main St, New York, NY 10001', Emails: 'a@b.com, c@d.com', Category: 'Venue' },
      usMap, 2, US_META
    );
    expect(c.email).toBe('a@b.com');
  });
});

describe('analyseDuplicates — in-file', () => {
  const rules = { byPhone: true, byNameCity: true, byEmail: false };

  function build(rows, meta = IN_META) {
    return rows.map((r, i) => toCandidate(r, IN_MAP, i + 2, meta));
  }

  test('same phone → second is duplicate', async () => {
    const c = build([
      { name: 'A', category: 'C', city: 'Mumbai', phone: '9876543210' },
      { name: 'B', category: 'C', city: 'Pune', phone: '9876543210' },
    ]);
    await analyseDuplicates(c, rules);
    expect(c[0].status).toBe('new');
    expect(c[1].status).toBe('duplicate_in_file');
  });

  test('same name+city → duplicate', async () => {
    const c = build([
      { name: 'Royal Palace', category: 'Venue', city: 'Mumbai', phone: '9876500001' },
      { name: 'royal palace', category: 'Venue', city: 'Mumbai', phone: '9876500002' },
    ]);
    await analyseDuplicates(c, rules);
    expect(c[1].status).toBe('duplicate_in_file');
  });

  test('same name different city → both new', async () => {
    const c = build([
      { name: 'Bloom Decor', category: 'Decor', city: 'Pune', phone: '9876500003' },
      { name: 'Bloom Decor', category: 'Decor', city: 'Delhi', phone: '9876500004' },
    ]);
    await analyseDuplicates(c, rules);
    expect(c[0].status).toBe('new');
    expect(c[1].status).toBe('new');
  });

  test('invalid rows never count as dups', async () => {
    const c = build([
      { name: '', category: 'C', city: 'Mumbai', phone: '9876543210' },
      { name: 'Real', category: 'C', city: 'Mumbai', phone: '9876543210' },
    ]);
    await analyseDuplicates(c, rules);
    expect(c[0].status).toBe('invalid');
    expect(c[1].status).toBe('new');
  });

  test('USA vendors deduplicated correctly', async () => {
    const usMap2 = buildColumnMap(['name', 'category', 'city', 'phone']);
    const makeUs = (rows) => rows.map((r, i) => toCandidate(r, usMap2, i+2, US_META));
    const c = makeUs([
      { name: 'Cipriani', category: 'Venue', city: 'New York', phone: '2125551234' },
      { name: 'Cipriani', category: 'Venue', city: 'New York', phone: '2125559999' },
    ]);
    await analyseDuplicates(c, rules);
    expect(c[0].status).toBe('new');
    expect(c[1].status).toBe('duplicate_in_file'); // same name+city
  });
});
