// ─── Unsubscribe logic ─────────────────────────────────────────────────────────

export async function tryUnsubscribe(gmail, unsubUrl, unsubPost, fromEmail) {
  // No header — open Gmail compose pre-filled so user can send manually
  if (!unsubUrl || !unsubUrl.trim()) {
    const openTabUrl = "https://mail.google.com/mail/?view=cm"
      + "&to="   + encodeURIComponent(fromEmail)
      + "&su="   + encodeURIComponent("UNSUBSCRIBE")
      + "&body=" + encodeURIComponent("Please UNSUBSCRIBE me.\nThank you.");
    return { result: "no-header→compose", openTab: true, openTabUrl };
  }

  const httpUrl  = unsubUrl.match(/<(https?:\/\/[^>]+)>/i)?.[1]
    ?? (unsubUrl.startsWith("http") ? unsubUrl : null);
  const mailto   = unsubUrl.match(/<mailto:([^>]+)>/i)?.[1] ?? null;
  const oneClick = (unsubPost || "").toLowerCase().includes("one-click");

  // Try HTTP first
  if (httpUrl) {
    const httpResult = await unsubHttp(httpUrl, oneClick);
    if (!httpResult.startsWith("failed") && !httpResult.startsWith("error"))
      return { result: httpResult, openTab: false, openTabUrl: null };
    // HTTP failed → try mailto fallback
    if (mailto) {
      const mailResult = await unsubMailto(gmail, mailto);
      if (!mailResult.startsWith("mailto-error"))
        return { result: "http-failed→" + mailResult, openTab: false, openTabUrl: null };
    }
    // Both failed → open URL in browser as last resort
    return { result: "auto-failed→open-tab", openTab: true, openTabUrl: httpUrl };
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

async function unsubHttp(url, oneClick) {
  try {
    const r = oneClick
      ? await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click" })
      : await fetch(url);
    return r.ok ? (oneClick ? "one-click-post" : "http-get") : "failed-" + r.status;
  } catch(e) { return "error: " + e.message; }
}

async function unsubMailto(gmail, val) {
  const [addr, q] = val.split("?");
  const p = new URLSearchParams(q || "");
  const subject = p.get("subject") || "Unsubscribe";
  const body    = p.get("body")    || "Please unsubscribe me.";
  const mime = [
    "From: me",
    "To: " + addr,
    "Subject: " + subject,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0",
    "",
    body,
  ].join("\r\n");
  const raw = Buffer.from(mime).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  try {
    await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
    return "mailto-sent";
  } catch(e) {
    console.error("unsubMailto error:", e.message);
    return "mailto-error: " + e.message;
  }
}

export function unsubLabel(result) {
  const map = {
    "one-click-post":        "✅ One-click POST",
    "http-get":              "✅ HTTP unsubscribed",
    "mailto-sent":           "✅ Unsubscribe email sent",
    "no-header→compose":     "✋ Compose opened — hit Send",
    "no-valid-header":       "⚠️ Invalid header",
    "auto-failed→open-tab":  "🌐 Opened in browser",
  };
  if (map[result]) return map[result];
  if (result.startsWith("http-failed→mailto-sent")) return "✅ HTTP failed → email sent";
  if (result.startsWith("failed-") || result.startsWith("error:") || result.startsWith("mailto-error"))
    return "❌ " + result;
  return result;
}