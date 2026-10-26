const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "blob:", "data:"],
      mediaSrc: ["'self'", "blob:"],
      connectSrc: ["'self'", "wss:", "ws:", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "same-origin" },
  referrerPolicy: { policy: "no-referrer" },
  hsts: process.env.NODE_ENV === "production"
    ? { maxAge: 31536000, includeSubDomains: true, preload: true }
    : false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { error: "too many attempts" },
  standardHeaders: true, legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 120,
  message: { error: "rate limit" },
  standardHeaders: true, legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, max: 20,
  message: { error: "upload rate limit" },
  standardHeaders: true, legacyHeaders: false,
});

function requireJson(req, res, next) {
  if (["POST", "PUT", "PATCH"].includes(req.method) &&
      !req.is("application/json") &&
      !req.is("application/octet-stream")) {
    return res.status(415).json({ error: "unsupported media type" });
  }
  next();
}

function errorHandler(err, req, res, next) {
  console.error(`[ERR] ${req.method} ${req.path}:`, err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production" ? "server error" : err.message,
  });
}

module.exports = { securityHeaders, authLimiter, apiLimiter, uploadLimiter, requireJson, errorHandler };
