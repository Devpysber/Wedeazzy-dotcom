/**
 * Universal File Parser Service for WedEazzy
 * Supports .csv, .tsv, .xlsx, .xls formats with encoding auto-detection,
 * delimiter auto-detection, headerless file detection, and sheet selection.
 */

const XLSX = require('xlsx');

/**
 * Detect delimiter from raw text lines.
 */
function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0).slice(0, 10);
  if (!lines.length) return ',';

  const delimiters = [',', ';', '\t', '|'];
  const counts = delimiters.map(d => {
    let sum = 0;
    lines.forEach(l => {
      const parts = l.split(d);
      if (parts.length > 1) sum += parts.length - 1;
    });
    return { delimiter: d, count: sum / lines.length };
  });

  counts.sort((a, b) => b.count - a.count);
  return counts[0].count > 0 ? counts[0].delimiter : ',';
}

/**
 * Clean UTF-8 BOM if present.
 */
function stripBOM(text) {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

/**
 * Detect if headers are missing by inspecting line 1 values.
 */
function isHeaderless(firstRowValues) {
  if (!firstRowValues || !firstRowValues.length) return false;
  let matchesDataPattern = 0;
  for (const val of firstRowValues) {
    const s = String(val || '').trim();
    // Check if value looks like a phone number (+91..., 9082610087)
    if (/^(\+91|\+1|0)?[6-9]\d{9}$/.test(s) || /^\d{10,12}$/.test(s)) matchesDataPattern++;
    // Check if value looks like a URL
    else if (/^https?:\/\//i.test(s) || /www\./i.test(s)) matchesDataPattern++;
    // Check if value looks like email
    else if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) matchesDataPattern++;
  }
  return matchesDataPattern >= 1;
}

/**
 * Custom CSV/TSV parser supporting quotes and escaped quotes.
 */
function parseDelimitedText(text, delimiter = ',') {
  const clean = stripBOM(text);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === delimiter) {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else if (c !== '\r') {
        field += c;
      }
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const validRows = rows.filter(r => r.join('').trim().length > 0);
  if (!validRows.length) return { headers: [], records: [], isHeaderless: false, delimiter };

  const firstRow = validRows[0].map(v => String(v || '').trim());
  const headerless = isHeaderless(firstRow);

  let headers = [];
  let dataRows = [];

  if (headerless) {
    headers = firstRow.map((_, idx) => `Column ${idx + 1}`);
    dataRows = validRows;
  } else {
    headers = firstRow;
    dataRows = validRows.slice(1);
  }

  const records = dataRows.map(r => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = String(r[idx] != null ? r[idx] : '').trim();
    });
    return obj;
  });

  return {
    headers,
    records,
    isHeaderless: headerless,
    delimiter,
  };
}

/**
 * Universal parse function accepting File Buffer and options.
 */
function parseUploadedFile(buffer, originalName = '', options = {}) {
  const ext = (originalName.split('.').pop() || '').toLowerCase();

  if (ext === 'xlsx' || ext === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetNames = workbook.SheetNames || [];
    const selectedSheet = options.sheetName && sheetNames.includes(options.sheetName)
      ? options.sheetName
      : sheetNames[0];

    const worksheet = workbook.Sheets[selectedSheet];
    if (!worksheet) return { headers: [], records: [], sheetNames, selectedSheet };

    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    const validRows = rawRows.filter(r => Array.isArray(r) && r.join('').trim().length > 0);
    if (!validRows.length) return { headers: [], records: [], sheetNames, selectedSheet };

    const firstRow = validRows[0].map(v => String(v || '').trim());
    const headerless = isHeaderless(firstRow);

    let headers = [];
    let dataRows = [];

    if (headerless) {
      headers = firstRow.map((_, idx) => `Column ${idx + 1}`);
      dataRows = validRows;
    } else {
      headers = firstRow;
      dataRows = validRows.slice(1);
    }

    const records = dataRows.map(r => {
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = String(r[idx] != null ? r[idx] : '').trim();
      });
      return obj;
    });

    return {
      headers,
      records,
      sheetNames,
      selectedSheet,
      isHeaderless: headerless,
      delimiter: 'excel',
    };
  }

  // Text-based: CSV, TSV, or plaintext
  let text = '';
  try {
    text = buffer.toString('utf8');
  } catch (_) {
    text = buffer.toString('binary');
  }

  const delimiter = options.delimiter || detectDelimiter(text);
  const parsed = parseDelimitedText(text, delimiter);

  return {
    ...parsed,
    sheetNames: [],
    selectedSheet: null,
  };
}

module.exports = {
  parseUploadedFile,
  detectDelimiter,
  isHeaderless,
};
