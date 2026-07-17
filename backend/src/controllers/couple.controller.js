/** Thin HTTP layer for couple dashboard/shortlist/checklist endpoints — see couple.service.js for logic. */
const service = require('../services/couple.service');
const reviewService = require('../services/review.service');

async function getMe(req, res, next) {
  try {
    const dash = await service.getMyDashboard(req.user);
    res.json({ ok: true, ...(dash || { couple: null }) });
  } catch (e) { next(e); }
}

async function putMe(req, res, next) {
  try {
    const couple = await service.upsertProfile(req.user, req.body || {});
    res.json({ ok: true, couple });
  } catch (e) { next(e); }
}

async function addShortlist(req, res, next) {
  try {
    const { vendorId } = req.body || {};
    if (!vendorId) return res.status(400).json({ ok: false, code: 'ERR_INPUT', message: 'vendorId required' });
    const r = await service.addShortlist(req.user, vendorId);
    res.json({ ok: true, shortlist: r });
  } catch (e) { next(e); }
}

async function removeShortlist(req, res, next) {
  try {
    const r = await service.removeShortlist(req.user, req.params.vendorId);
    res.json(r);
  } catch (e) { next(e); }
}

async function createTask(req, res, next) {
  try {
    const task = await service.createTask(req.user, req.body || {});
    res.json({ ok: true, task });
  } catch (e) { next(e); }
}

async function updateTask(req, res, next) {
  try {
    const task = await service.updateTask(req.user, req.params.taskId, req.body || {});
    res.json({ ok: true, task });
  } catch (e) { next(e); }
}

async function deleteTask(req, res, next) {
  try {
    const r = await service.deleteTask(req.user, req.params.taskId);
    res.json(r);
  } catch (e) { next(e); }
}

async function addReview(req, res, next) {
  try {
    const review = await reviewService.createReview(req.user, req.body || {});
    res.json({ ok: true, review });
  } catch (e) { next(e); }
}

module.exports = {
  getMe,
  putMe,
  addShortlist,
  removeShortlist,
  createTask,
  updateTask,
  deleteTask,
  addReview,
};
