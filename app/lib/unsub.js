// ─── Unsubscribe logic ─────────────────────────────────────────────────────────
import dns from "node:dns/promises";

/** Extract a value from angle brackets without regex backtracking */
function extractAngleBracket(header, prefix) {
  if (!header) return null;
  const lc = header.toLowerCase();
  const start = lc.indexOf("<" + prefix.toLowerCase());
  if (start === -1) return null;
  const end = header.indexOf(">", start + 1);
  if (end === -1) return null;
  return header.slice(start + 1, end);
}

// `deps` ({ lookup, fetchImpl }) is injectable so tests never touch DNS or the network.
export async function tryUnsubscribe(
  gmail,
  unsubUrl,
  unsubPost,
  fromEmail,
  deps = {},
) {
  // No header — open Gmail compose pre-filled so user can send manually
  if (!unsubUrl?.trim()) {
    const openTabUrl =
      "https://mail.google.com/mail/?view=cm" +
      "&to=" +
      encodeURIComponent(fromEmail) +
      "&su=" +
      encodeURIComponent("UNSUBSCRIBE") +
      "&body=" +
      encodeURIComponent("Please UNSUBSCRIBE me.\nThank you.");
    return { result: "no-header→compose", openTab: true, openTabUrl };
  }

  const httpUrl =
    extractAngleBracket(unsubUrl, "http") ??
    (unsubUrl.startsWith("http") ? unsubUrl.trim() : null);
  const mailto = extractAngleBracket(unsubUrl, "mailto:");
  const oneClick = (unsubPost || "").toLowerCase().includes("one-click");

  // Try HTTP first
  if (httpUrl) {
    const httpResult = await unsubHttp(httpUrl, oneClick, deps);
    if (!httpResult.startsWith("failed") && !httpResult.startsWith("error"))
      return { result: httpResult, openTab: false, openTabUrl: null };
    // HTTP failed → try mailto fallback
    if (mailto) {
      const mailResult = await unsubMailto(gmail, mailto);
      if (!mailResult.startsWith("mailto-error"))
        return {
          result: "http-failed→" + mailResult,
          openTab: false,
          openTabUrl: null,
        };
    }
    // Both failed → open URL in browser as last resort
    return {
      result: "auto-failed→open-tab",
      openTab: true,
      openTabUrl: httpUrl,
    };
  }

  // mailto only
  if (mailto) {
    const mailResult = await unsubMailto(gmail, mailto);
    if (!mailResult.startsWith("mailto-error"))
      return { result: mailResult, openTab: false, openTabUrl: null };
    return { result: mailResult, openTab: false, openTabUrl: null };
  }

  return { result: "no-valid-header", openTab: false, openTabUrl: null };
}

// ─── SSRF guard ───────────────────────────────────────────────────────────────
// The List-Unsubscribe URL is attacker-controlled and fetched from inside the
// container, which can reach the LAN, the Docker network and the tailnet. Two
// layers: a synchronous check on the URL itself (scheme, literal IPs, obviously
// local names), then an async DNS check that every resolved address is public.

// IPv4 ranges that are never a legitimate unsubscribe endpoint.
const BLOCKED_V4 = [
  ["0.0.0.0", 8], // "this network"; 0.0.0.0 reaches localhost on Linux
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT — includes Tailscale's 100.x addresses
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function v4ToInt(ip) {
  const p = ip.split(".");
  if (p.length !== 4) return null;
  let n = 0;
  for (const x of p) {
    if (!/^\d{1,3}$/.test(x) || Number(x) > 255) return null;
    n = n * 256 + Number(x);
  }
  return n;
}

function isBlockedV4(ip) {
  const n = v4ToInt(ip);
  if (n === null) return true;
  return BLOCKED_V4.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const b = v4ToInt(base);
    return n >= b && n < b + size;
  });
}

// Expand an IPv6 literal to 8 16-bit groups (handles "::" and a dotted-quad tail).
function v6Groups(ip) {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const n = v4ToInt(tail[1]);
    if (n === null) return null;
    s =
      s.slice(0, -tail[1].length) +
      ((n >>> 16) & 0xffff).toString(16) +
      ":" +
      (n & 0xffff).toString(16);
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...rest];
  if (groups.length !== 8) return null;
  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

// IPv6: allow only global unicast (2000::/3), minus documentation, 6to4 and the
// IETF-reserved 2001::/23 (Teredo etc.). IPv4-mapped/-compatible addresses are
// judged by the IPv4 address they carry.
function isBlockedV6(ip) {
  const g = v6Groups(ip);
  if (!g) return true;
  const first5Zero = g.slice(0, 5).every((x) => x === 0);
  if (first5Zero && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0) return true; // ::, ::1 and friends
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return isBlockedV4(v4);
  }
  if ((g[0] & 0xe000) !== 0x2000) return true; // not 2000::/3
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2002) return true; // 6to4 embeds an arbitrary IPv4
  if (g[0] === 0x2001 && g[1] < 0x0200) return true; // 2001::/23
  return false;
}

/** True when an IP literal (v4 or v6, no brackets) is not publicly routable. */
export function isBlockedIp(ip) {
  const s = String(ip || "");
  return s.includes(":") ? isBlockedV6(s) : isBlockedV4(s);
}

const IPV4_LITERAL = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Validate and return a sanitized URL string, or null if unsafe (no DNS). */
export function sanitizeUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    // WHATWG URL already canonicalises IPv4 forms (0x7f.1, 2130706433 → 127.0.0.1).
    // Strip trailing dots so "localhost." and "server.local." cannot slip past.
    const host = u.hostname.toLowerCase().replace(/\.+$/, "");
    if (!host) return null;
    if (host.startsWith("[")) {
      if (isBlockedIp(host.slice(1, -1))) return null;
    } else if (IPV4_LITERAL.test(host)) {
      if (isBlockedIp(host)) return null;
    } else {
      if (host === "localhost" || host.endsWith(".localhost")) return null;
      if (host.endsWith(".local") || host.endsWith(".internal")) return null;
    }
    return u.href; // reconstructed URL breaks taint chain
  } catch {
    return null;
  }
}

/**
 * Async half of the guard: resolve the URL's hostname and reject if ANY address is
 * not public (a name can resolve to both a public and a private address). IP
 * literals were already judged by sanitizeUrl. `lookup` is injectable for tests.
 * Residual risk: fetch() resolves the name again, so a rebinding DNS server with a
 * zero TTL can still race this check; it does raise the bar from "any hostname".
 */
export async function assertPublicHost(urlString, lookup = dns.lookup) {
  const host = new URL(urlString).hostname.toLowerCase().replace(/\.+$/, "");
  if (host.startsWith("[") || IPV4_LITERAL.test(host)) return;
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error("blocked-unresolvable-host");
  }
  if (!Array.isArray(addrs) || !addrs.length)
    throw new Error("blocked-unresolvable-host");
  if (addrs.some((a) => isBlockedIp(a.address)))
    throw new Error("blocked-private-address");
}

// Manual redirect follower with per-hop SSRF re-check. fetch's redirect:'follow' would
// allow an attacker-controlled public URL to 302 into a private IP, bypassing the
// initial sanitizeUrl. We follow up to 5 hops, each through sanitizeUrl + DNS check.
export async function fetchWithSsrfGuardedRedirects(
  initialUrl,
  init = {},
  maxHops = 5,
  { lookup = dns.lookup, fetchImpl = fetch } = {},
) {
  let url = initialUrl;
  for (let hop = 0; hop <= maxHops; hop++) {
    const safe = sanitizeUrl(url);
    if (!safe) throw new Error("blocked-redirect-target");
    await assertPublicHost(safe, lookup);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 8000);
    try {
      const r = await fetchImpl(safe, {
        ...init,
        redirect: "manual",
        signal: ac.signal,
        headers: {
          "User-Agent": "gmail-triage/1.x (+unsub)",
          ...(init.headers || {}),
        },
      });
      if (r.status >= 300 && r.status < 400) {
        const next = r.headers.get("location");
        if (!next) return r;
        url = new URL(next, safe).toString();
        continue;
      }
      return r;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("too-many-redirects");
}

async function unsubHttp(url, oneClick, deps = {}) {
  const safe = sanitizeUrl(url);
  if (!safe) return "failed-blocked-url";
  try {
    const r = oneClick
      ? await fetchWithSsrfGuardedRedirects(
          safe,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "List-Unsubscribe=One-Click",
          },
          5,
          deps,
        )
      : await fetchWithSsrfGuardedRedirects(safe, {}, 5, deps);
    return r.ok
      ? oneClick
        ? "one-click-post"
        : "http-get"
      : "failed-" + r.status;
  } catch (e) {
    return "error: " + e.message;
  }
}

async function unsubMailto(gmail, val) {
  const [addr, q] = val.split("?");
  const p = new URLSearchParams(q || "");
  const subject = p.get("subject") || "Unsubscribe";
  const body = p.get("body") || "Please unsubscribe me.";
  const mime = [
    "From: me",
    "To: " + addr,
    "Subject: " + subject,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    body,
  ].join("\r\n");
  const raw = Buffer.from(mime).toString("base64url");
  try {
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return "mailto-sent";
  } catch (e) {
    console.error("unsubMailto error:", e.message);
    return "mailto-error: " + e.message;
  }
}

export function unsubLabel(result) {
  const map = {
    "one-click-post": "✅ One-click POST",
    "http-get": "✅ HTTP unsubscribed",
    "mailto-sent": "✅ Unsubscribe email sent",
    "no-header→compose": "✋ Compose opened — hit Send",
    "no-valid-header": "⚠️ Invalid header",
    "auto-failed→open-tab": "🌐 Opened in browser",
  };
  if (map[result]) return map[result];
  if (result.startsWith("http-failed→mailto-sent"))
    return "✅ HTTP failed → email sent";
  if (
    result.startsWith("failed-") ||
    result.startsWith("error:") ||
    result.startsWith("mailto-error")
  )
    return "❌ " + result;
  return result;
}
