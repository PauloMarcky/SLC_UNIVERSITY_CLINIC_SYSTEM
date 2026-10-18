// Strict policy for the app's own pages and API: no inline or third-party scripts.
// Inline styles stay allowed because several pages use style="" attributes.
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "object-src 'none'"
].join('; ');

// The printable certificate and prescription pages are server-rendered with escaped values
// and carry their own small print script, so they need inline script and style.
const PRINT_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'self' data:",
  "frame-ancestors 'self'",
  "base-uri 'none'",
  "form-action 'none'"
].join('; ');

const PRINT_PAGE = /^\/(certificates|prescriptions)\/[^/]+\/(print|preview)\/?$/;

/** Headers sent with every response. Pass { hsts: true } when the site is served over HTTPS. */
export function securityHeaders({ hsts = false } = {}) {
  return function setSecurityHeaders(req, res, next) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Content-Security-Policy', PRINT_PAGE.test(req.path) ? PRINT_CSP : APP_CSP);
    if (hsts) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}
