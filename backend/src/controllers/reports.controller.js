const service = require('../services/reports.service');

async function exportUsers(req, res, next) {
  try {
    const data = await service.getUsersReport();
    res.json({ ok: true, data });
  } catch (e) { next(e); }
}

async function exportVendors(req, res, next) {
  try {
    const data = await service.getVendorsReport();
    res.json({ ok: true, data });
  } catch (e) { next(e); }
}

async function exportBookings(req, res, next) {
  try {
    const data = await service.getBookingsReport();
    res.json({ ok: true, data });
  } catch (e) { next(e); }
}

async function exportPayments(req, res, next) {
  try {
    const data = await service.getPaymentsReport();
    res.json({ ok: true, data });
  } catch (e) { next(e); }
}

async function exportLeads(req, res, next) {
  try {
    const data = await service.getLeadsReport();
    res.json({ ok: true, data });
  } catch (e) { next(e); }
}

async function exportRevenue(req, res, next) {
  try {
    const data = await service.getRevenueReport();
    res.json({ ok: true, data });
  } catch (e) { next(e); }
}

async function exportAnalytics(req, res, next) {
  try {
    const data = await service.getPlatformAnalytics();
    res.json({ ok: true, data });
  } catch (e) { next(e); }
}

async function getVendorLeads(req, res, next) {
  try {
    const vendorId = req.headers['x-vendor-id'] || req.query.vendorId || null;
    const data = await service.getVendorLeads(req.user.id, vendorId);
    res.json({ ok: true, data });
  } catch (e) { next(e); }
}

async function getVendorBookings(req, res, next) {
  try {
    const vendorId = req.headers['x-vendor-id'] || req.query.vendorId || null;
    const data = await service.getVendorBookings(req.user.id, vendorId);
    res.json({ ok: true, data });
  } catch (e) { next(e); }
}

const MAX_IMPORT_RECORDS = 500;

/**
 * Build a bulk-import handler for the given record type. All three import
 * endpoints share identical validation (array check, max-records cap) and
 * only differ in the field name and the service method they delegate to.
 * @param {string} recordType - singular label used in error messages, e.g. "vendor"
 * @param {string} bodyField - expected array field on the request body, e.g. "vendors"
 * @param {(records: any[]) => Promise<any>} importFn - service method to run
 */
function makeImportHandler(recordType, bodyField, importFn) {
  return async function (req, res, next) {
    try {
      const records = req.body[bodyField] || req.body;
      if (!Array.isArray(records)) {
        return res.status(400).json({ ok: false, message: `Expected an array of ${recordType} records` });
      }
      if (records.length > MAX_IMPORT_RECORDS) {
        return res.status(400).json({ ok: false, message: `Maximum ${MAX_IMPORT_RECORDS} records per import request. Received: ${records.length}` });
      }
      const results = await importFn(records);
      res.json({ ok: true, results });
    } catch (e) { next(e); }
  };
}

const importVendors = makeImportHandler('vendor', 'vendors', service.bulkImportVendors);
const importUsers = makeImportHandler('user', 'users', service.bulkImportUsers);
const importBookings = makeImportHandler('booking', 'bookings', service.bulkImportBookings);

module.exports = {
  exportUsers,
  exportVendors,
  exportBookings,
  exportPayments,
  exportLeads,
  exportRevenue,
  exportAnalytics,
  getVendorLeads,
  getVendorBookings,
  importVendors,
  importUsers,
  importBookings
};
