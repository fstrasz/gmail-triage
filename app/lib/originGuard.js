// ─── Cross-origin + DNS-rebinding guard ───────────────────────────────────────
// The app has no login: anything that can make the operator's browser send a
// state-changing request to it can act on the mailbox. Two defences:
//
//  1. Origin check (always on). A non-safe-method request is rejected when the
//     browser says it is cross-site (Sec-Fetch-Site), or when its Origin host is
//     not the Host it was sent to (or an ALLOWED_HOSTS entry). Requests carrying
//     neither header (curl, the compose healthcheck, server-to-server) pass —
//     browsers always send at least one of them on a cross-site POST.
//  2. Host allowlist (opt-in via ALLOWED_HOSTS). Defeats DNS rebinding, where an
//     attacker's hostname is re-pointed at this server so the page becomes
//     "same-origin" with it; the Host header still carries the attacker's name.

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Parse ALLOWED_HOSTS ("host[:port],host[:port]") → lowercased array, or null when unset/empty. */
export function parseAllowedHosts(raw) {
  if (!raw || !String(raw).trim()) return null;
  const list = String(raw)
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : null;
}

function headerValue(headers, name) {
  const v = headers?.[name];
  return Array.isArray(v) ? v[0] : v;
}

function originHost(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.host.toLowerCase();
  } catch {
    return null; // includes the opaque "null" origin
  }
}

/**
 * Decide whether a request may proceed. Pure: takes method + headers + the parsed
 * allowlist, returns null to allow or { status, body } to reject.
 */
export function checkRequest({ method, headers }, allowedHosts = null) {
  const host = String(headerValue(headers, "host") || "").toLowerCase();

  if (allowedHosts && !allowedHosts.includes(host)) {
    return { status: 421, body: { ok: false, error: "misdirected-host" } };
  }

  if (SAFE_METHODS.has(String(method || "").toUpperCase())) return null;

  const site = headerValue(headers, "sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return { status: 403, body: { ok: false, error: "cross-origin" } };
  }

  const origin = headerValue(headers, "origin");
  if (origin !== undefined) {
    const oh = originHost(origin);
    const ok = oh && (oh === host || allowedHosts?.includes(oh));
    if (!ok) return { status: 403, body: { ok: false, error: "cross-origin" } };
  }
  return null;
}

/** Express middleware. Mount BEFORE the body parsers so rejected bodies are never parsed. */
export function originGuard({
  allowedHosts = parseAllowedHosts(process.env.ALLOWED_HOSTS),
  log = console.log,
} = {}) {
  if (!allowedHosts) {
    log(
      "[security] ALLOWED_HOSTS is not set — Host allowlist (DNS-rebinding defence) is OFF; Origin checks remain on.",
    );
  }
  return function originGuardMiddleware(req, res, next) {
    const verdict = checkRequest(req, allowedHosts);
    if (!verdict) return next();
    console.warn(
      `[security] rejected ${req.method} ${req.path} (${verdict.body.error}) host=${req.headers.host || ""} origin=${req.headers.origin || ""} sec-fetch-site=${req.headers["sec-fetch-site"] || ""}`,
    );
    res.status(verdict.status).json(verdict.body);
  };
}
