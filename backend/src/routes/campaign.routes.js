const express = require('express');
const ctrl = require('../controllers/campaign.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Apply authentication guard to all routes
router.use(requireAuth);

// ── Admin-only routes (must be BEFORE /:id patterns) ─────────────────────────
router.get('/admin/all', requireRole('admin'), ctrl.adminListCampaigns);
router.patch('/admin/:id', requireRole('admin'), ctrl.adminUpdateCampaign);

// ── Vendor routes (vendor OR admin) ──────────────────────────────────────────
router.use(requireRole('vendor', 'admin'));

router.post('/', ctrl.createCampaign);
router.get('/', ctrl.getCampaigns);
router.get('/analytics/overview', ctrl.getAnalyticsOverview);
router.get('/:id', ctrl.getCampaignById);
router.patch('/:id', ctrl.updateCampaign);
router.patch('/:id/status', ctrl.updateCampaignStatus);
router.delete('/:id', ctrl.deleteCampaign);

module.exports = router;
