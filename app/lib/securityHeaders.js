// ─── Security response headers ────────────────────────────────────────────────
// Set on every response before any route runs. A route that serves raw email HTML
// overrides Content-Security-Policy with its own sandbox policy afterwards
// (setEmailBodyHeaders in triage.js), so that stricter policy is never clobbered.

// Old server-rendered UI: inline <script> blocks and onclick handlers are
// everywhere, so no script-src — just framing, plugins and <base> hijacking.
export const BASE_CSP =
  "frame-ancestors 'self'; object-src 'none'; base-uri 'self'";

// The React build under /app has no inline script (verified against web/dist),
// so it gets a full enforcing policy.
export const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function isAppPath(p) {
  return p === "/app" || String(p || "").startsWith("/app/");
}

/** Pure: the headers for a request path. */
export function securityHeadersFor(reqPath) {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "SAMEORIGIN",
    "Content-Security-Policy": isAppPath(reqPath) ? APP_CSP : BASE_CSP,
  };
}

export function securityHeaders() {
  return function securityHeadersMiddleware(req, res, next) {
    res.set(securityHeadersFor(req.path));
    next();
  };
}
