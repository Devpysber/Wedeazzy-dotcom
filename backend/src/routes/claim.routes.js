/**
 * Public claim-business routes. No auth required — this IS the auth for a
 * vendor who doesn't have an account yet. Rate limiting happens inside the
 * controller because the limits vary per endpoint.
 */

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/claim.controller');

router.post('/search',         ctrl.search);
router.post('/send-otp',       ctrl.sendOtp);
router.post('/verify',         ctrl.verify);
router.post('/request-manual', ctrl.requestManual);

module.exports = router;