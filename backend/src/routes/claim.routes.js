/**
 * Public claim-business & vendor registration routes. No auth required.
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/claim.controller');

router.post('/search',            ctrl.search);
router.post('/start',             ctrl.startSession);
router.post('/verify-phone',      ctrl.verifyPhone);
router.post('/complete',          ctrl.complete);
router.post('/register-business', ctrl.registerBusiness);
router.post('/request-manual',    ctrl.requestManual);

// Legacy stubs
router.post('/send-otp',          ctrl.sendOtp);
router.post('/verify',            ctrl.verify);

module.exports = router;