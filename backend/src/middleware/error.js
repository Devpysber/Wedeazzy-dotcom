/**
 * Centralized HTTP error type + Express error-handling middleware.
 * Controllers should `throw new HttpError(status, message, code)` and let it
 * propagate to `next(err)` — `errorHandler` below turns it into a consistent
 * `{ ok, code, message }` JSON response.
 */

const logger = require('../config/logger');

/** An error carrying an HTTP status code and a machine-readable error code. */
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || 'ERR_GENERIC';
  }
}

/** Express catch-all for unmatched routes — always 404s as ERR_NOT_FOUND. */
function notFound(req, res, next) {
  next(new HttpError(404, 'Route not found', 'ERR_NOT_FOUND'));
}

/**
 * Express error-handling middleware (must be registered last, after all routes).
 * 5xx errors are logged at error level with the full stack; 4xx are logged as
 * warnings. The client never sees raw 5xx error messages — only a generic
 * "Internal server error" — to avoid leaking implementation details.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  if (status >= 500) {
    logger.error({ err, path: req.path }, 'Unhandled error');
  } else {
    logger.warn({ status, msg: err.message, path: req.path });
  }
  res.status(status).json({
    ok: false,
    code: err.code || 'ERR_GENERIC',
    message: status >= 500 ? 'Internal server error' : err.message,
  });
}

module.exports = { HttpError, notFound, errorHandler };
