const express = require('express');
const ctrl = require('../controllers/vendor.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.post('/signup', requireRole('vendor', 'admin'), ctrl.signup);
router.get('/me',      requireRole('vendor', 'admin'), ctrl.getMe);
router.patch('/me',    requireRole('vendor', 'admin'), ctrl.patchMe);
router.delete('/me',   requireRole('vendor', 'admin'), ctrl.deleteMe);
router.post('/me/photos', requireRole('vendor', 'admin'), ctrl.addPhoto);
router.delete('/me/photos/:id', requireRole('vendor', 'admin'), ctrl.removePhoto);
router.patch('/me/photos/:id/cover', requireRole('vendor', 'admin'), ctrl.setCoverPhoto);

module.exports = router;
