/**
 * Shared express-rate-limit `handler` — logs every 429 server-side before
 * sending the response. Without this, a sustained brute-force/scrape attack
 * that gets rate-limited leaves zero trace in the logs: the client just gets
 * a 429 JSON body and the attempt is otherwise invisible to anyone reviewing
 * server activity.
 *
 * Usage: pass `handler: rateLimitHandler(message)` alongside a limiter's own
 * `message` option (kept for parity/back-compat with existing configs).
 */
const logger = require('../config/logger');

function rateLimitHandler(message) {
  return (req, res /*, next, options */) => {
    logger.warn({ ip: req.ip, method: req.method, path: req.originalUrl || req.path }, 'Rate limit exceeded');
    res.status(429).json(message);
  };
}

module.exports = { rateLimitHandler };
