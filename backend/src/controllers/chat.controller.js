/**
 * Couple <-> vendor chat endpoints. Participant routes live under /api/chat;
 * the read-only admin views are mounted on the admin router (/api/admin/chat).
 */

const service = require('../services/chat.service');

const wrap = (fn) => async (req, res, next) => {
  try { await fn(req, res); } catch (e) { next(e); }
};

module.exports = {
  list: wrap(async (req, res) => {
    res.json({ ok: true, conversations: await service.listForUser(req.user) });
  }),
  unread: wrap(async (req, res) => {
    res.json({ ok: true, unread: await service.unreadCount(req.user) });
  }),
  messages: wrap(async (req, res) => {
    res.json({ ok: true, ...(await service.getMessages(req.user, req.params.id)) });
  }),
  send: wrap(async (req, res) => {
    res.json({ ok: true, message: await service.sendMessage(req.user, req.params.id, (req.body || {}).message) });
  }),
  openForEnquiry: wrap(async (req, res) => {
    res.json({ ok: true, conversation: await service.openForEnquiry(req.user, req.params.enquiryId) });
  }),

  adminList: wrap(async (req, res) => {
    res.json({ ok: true, conversations: await service.adminList({ q: req.query.q }) });
  }),
  adminGet: wrap(async (req, res) => {
    res.json({ ok: true, ...(await service.adminGet(req.params.id)) });
  }),
};
