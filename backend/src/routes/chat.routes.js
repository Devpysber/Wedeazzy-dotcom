const express = require('express');
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/chat.controller');
const { requireAuth, requireRole } = require('../middleware/auth');
const { rateLimitHandler } = require('../utils/rateLimitLogger');

const router = express.Router();

// Couples and vendors only. Admin reads chats through /api/admin/chat, which
// never marks messages read and never makes admin a participant.
router.use(requireAuth);
router.use(requireRole('couple', 'vendor'));

const sendMessage = { ok: false, code: 'ERR_RATE', message: 'You are sending messages too quickly. Please wait a moment.' };
const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user.id,
  message: sendMessage,
  handler: rateLimitHandler(sendMessage),
});

router.get('/conversations', ctrl.list);
router.get('/unread-count', ctrl.unread);
router.get('/conversations/:id/messages', ctrl.messages);
router.post('/conversations/:id/messages', sendLimiter, ctrl.send);
router.post('/enquiries/:enquiryId/conversation', ctrl.openForEnquiry);

module.exports = router;
