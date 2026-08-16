const express = require('express');
const ctrl = require('../controllers/couple.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/me',                  requireRole('couple', 'admin'), ctrl.getMe);
router.put('/me',                  requireRole('couple', 'admin'), ctrl.putMe);
router.post('/me/shortlist',       requireRole('couple', 'admin'), ctrl.addShortlist);
router.delete('/me/shortlist/:vendorId', requireRole('couple', 'admin'), ctrl.removeShortlist);
router.post('/me/tasks',           requireRole('couple', 'admin'), ctrl.createTask);
router.put('/me/tasks/:taskId',    requireRole('couple', 'admin'), ctrl.updateTask);
router.delete('/me/tasks/:taskId', requireRole('couple', 'admin'), ctrl.deleteTask);
router.post('/me/reviews',           requireRole('couple', 'admin'), ctrl.addReview);
router.post('/me/guests',            requireRole('couple', 'admin'), ctrl.createGuest);
router.put('/me/guests/:guestId',    requireRole('couple', 'admin'), ctrl.updateGuest);
router.delete('/me/guests/:guestId', requireRole('couple', 'admin'), ctrl.deleteGuest);

module.exports = router;
