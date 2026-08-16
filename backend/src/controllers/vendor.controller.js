/** Thin HTTP layer for vendor self-service profile/photo management — see vendor.service.js for logic. */
const service = require('../services/vendor.service');

async function signup(req, res, next) {
  try {
    const v = await service.signupOrAttach(req.user, req.body || {});
    res.json({ ok: true, vendor: v });
  } catch (e) { next(e); }
}

async function getMe(req, res, next) {
  try {
    const vendorId = req.headers['x-vendor-id'] || req.query.vendorId || null;
    const dash = await service.getMyDashboard(req.user, vendorId);
    if (!dash) return res.json({ ok: true, vendor: null, completion: 0 });
    res.json({ ok: true, ...dash });
  } catch (e) { next(e); }
}

async function patchMe(req, res, next) {
  try {
    const vendorId = req.headers['x-vendor-id'] || req.query.vendorId || null;
    const r = await service.updateProfile(req.user, req.body || {}, vendorId);
    res.json({ ok: true, ...r });
  } catch (e) { next(e); }
}

async function addPhoto(req, res, next) {
  try {
    const fileUrl = req.body && req.body.url;
    if (!fileUrl) return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: 'url required' });
    const vendorId = req.headers['x-vendor-id'] || req.query.vendorId || null;
    const photo = await service.addPhoto(req.user, fileUrl, { isCover: !!req.body.isCover }, vendorId);
    res.json({ ok: true, photo });
  } catch (e) { next(e); }
}

async function removePhoto(req, res, next) {
  try {
    const vendorId = req.headers['x-vendor-id'] || req.query.vendorId || null;
    await service.removePhoto(req.user, req.params.id, vendorId);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

async function deleteMe(req, res, next) {
  try {
    const vendorId = req.headers['x-vendor-id'] || req.query.vendorId || null;
    await service.deleteProfile(req.user, vendorId);
    res.json({ ok: true });
  } catch (e) { next(e); }
}

async function setCoverPhoto(req, res, next) {
  try {
    const vendorId = req.headers['x-vendor-id'] || req.query.vendorId || null;
    const photo = await service.setCoverPhoto(req.user, req.params.id, vendorId);
    res.json({ ok: true, photo });
  } catch (e) { next(e); }
}

module.exports = { signup, getMe, patchMe, addPhoto, removePhoto, deleteMe, setCoverPhoto };
