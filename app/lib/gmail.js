import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { isBlocked } from "./blocklist.js";

const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CRED_PATH  = path.join(process.cwd(), "credentials.json");

// ─── Auth ──────────────────────────────────────────────────────────────────────
let _gmail = null;
export async function getGmailClient() {
  if (_gmail) return _gmail;
  const credentials = JSON.parse(fs.readFileSync(CRED_PATH));
  const { client_id, client_secret, redirect_uris } = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH));
  oAuth2Client.setCredentials(token);
  oAuth2Client.on("tokens", t =>
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...token, ...t }, null, 2))
  );
  _gmail = google.gmail({ version: "v1", auth: oAuth2Client });
  return _gmail;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
export function extractEmail(from) {
  const m = from.match(/<(.+?)>/);
  return (m ? m[1] : from).toLowerCase().trim();
}
export function extractName(from) {
  const m = from.match(/^(.+?)\s*</);
  return m ? m[1].replace(/"/g, "").trim() : from;
}
export function fromQuery(fromEmail) {
  return "from:" + fromEmail + " -in:sent -in:trash";
}

// ─── Label cache ───────────────────────────────────────────────────────────────
const labelCache = {};
export async function ensureLabel(gmail, name) {
  if (labelCache[name]) return labelCache[name];
  const list = await gmail.users.labels.list({ userId: "me" });
  const ex = list.data.labels.find(l => l.name === name);
  if (ex) { labelCache[name] = ex.id; return ex.id; }
  const cr = await gmail.users.labels.create({
    userId: "me",
    requestBody: { name, labelListVisibility: "labelShow", messageListVisibility: "show" },
  });
  labelCache[name] = cr.data.id;
  return cr.data.id;
}
export function getLabelId(name) { return labelCache[name] || null; }

// ─── Label all sender emails ───────────────────────────────────────────────────
export async function labelSender(gmail, labelName, fromEmail, fromName = null, removeLabels = []) {
  const labelId = await ensureLabel(gmail, labelName);
  const ids = [];
  let pageToken = null;
  do {
    // in:inbox naturally excludes sent-only and trashed mail
    const params = { userId: "me", q: "from:" + fromEmail + " in:inbox", maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;
    const res = await gmail.users.messages.list(params);
    for (const m of res.data.messages || []) {
      if (fromName) {
        const d = await gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From"] });
        const fh = d.data.payload.headers.find(h => h.name === "From")?.value || "";
        if (extractName(fh) !== fromName) continue;
      }
      ids.push(m.id);
    }
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);

  if (!ids.length) return 0;
  for (let i = 0; i < ids.length; i += 1000) {
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: [labelId], removeLabelIds: removeLabels },
    });
  }
  return ids.length;
}

// ─── Block sender → DelPend ────────────────────────────────────────────────────
export async function blockSender(gmail, fromEmail, fromName = null, excludeId = null) {
  const labelId = await ensureLabel(gmail, ".DelPend");
  const ids = [];
  let pageToken = null;
  do {
    const params = { userId: "me", q: fromQuery(fromEmail), maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;
    const res = await gmail.users.messages.list(params);
    for (const m of res.data.messages || []) {
      if (excludeId && m.id === excludeId) continue;
      if (fromName) {
        const d = await gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From"] });
        const fh = d.data.payload.headers.find(h => h.name === "From")?.value || "";
        if (extractName(fh) !== fromName) continue;
      }
      ids.push(m.id);
    }
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);

  if (!ids.length) return 0;
  for (let i = 0; i < ids.length; i += 1000) {
    try {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: [labelId], removeLabelIds: ["INBOX", "UNREAD"] },
      });
    } catch(e) { console.error("blockSender batchModify FAILED:", e.message); }
  }
  return ids.length;
}

// ─── Scan inbox for blocked senders ───────────────────────────────────────────
export async function scanAndCleanBlocklist(gmail, blocklist) {
  if (!blocklist.length) return [];
  const labelId    = await ensureLabel(gmail, ".DelPend");
  const vipLabelId = await ensureLabel(gmail, "..VIP");
  const okLabelId  = await ensureLabel(gmail, "..OK");
  const skip = new Set([labelId, vipLabelId, okLabelId]);

  const results = await Promise.all(blocklist.map(async entry => {
    const base = entry.email.startsWith("@") ? "from:*" + entry.email : "from:" + entry.email;
    const q = base + " in:inbox -label:.DelPend -label:..OK -label:..VIP -in:sent -in:trash";
    const ids = []; const subjects = [];
    let pageToken = null;
    do {
      const params = { userId: "me", q, maxResults: 500 };
      if (pageToken) params.pageToken = pageToken;
      const res = await gmail.users.messages.list(params);
      const fetches = await Promise.all((res.data.messages || []).map(m =>
        gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From", "Subject"] })
      ));
      for (const full of fetches) {
        const labels = full.data.labelIds || [];
        if (!labels.includes("INBOX") || labels.some(l => skip.has(l))) continue;
        if (entry.name) {
          const fromHeader = full.data.payload?.headers?.find(h => h.name === "From")?.value || "";
          if (extractName(fromHeader) !== entry.name) continue;
        }
        ids.push(full.data.id);
        subjects.push(full.data.payload?.headers?.find(h => h.name === "Subject")?.value || "(no subject)");
      }
      pageToken = res.data.nextPageToken || null;
    } while (pageToken);

    if (!ids.length) return null;
    for (let i = 0; i < ids.length; i += 1000) {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: [labelId], removeLabelIds: ["INBOX", "UNREAD"] },
      });
    }
    return { email: entry.email, reason: entry.reason, moved: ids.length, labelName: ".DelPend", subjects: subjects.slice(0, 5) };
  }));
  return results.filter(Boolean);
}

// ─── Fetch emails for triage ───────────────────────────────────────────────────
export async function fetchEmails(gmail, max = 25) {
  await Promise.all(["..VIP", "..OK", ".DelPend"].map(n => ensureLabel(gmail, n).catch(() => {})));

  const res = await gmail.users.messages.list({
    userId: "me", q: "in:inbox -label:.DelPend", maxResults: 100,
  });
  const messages = res.data.messages || [];
  const details = await Promise.all(messages.map(msg =>
    gmail.users.messages.get({
      userId: "me", id: msg.id, format: "metadata",
      metadataHeaders: ["Subject", "From", "Date", "List-Unsubscribe", "List-Unsubscribe-Post"],
    })
  ));

  const emails = [];
  for (const d of details) {
    if (emails.length >= max) break;
    const h = d.data.payload.headers;
    const g = n => h.find(x => x.name === n)?.value || "";
    const fromRaw   = g("From");
    const fromEmail = extractEmail(fromRaw);
    const fromName  = extractName(fromRaw);

    const lbls  = d.data.labelIds || [];
    const vipId = labelCache["..VIP"] || "";
    const okId  = labelCache["..OK"]  || "";
    const tier  = lbls.includes(vipId) ? "..VIP" : lbls.includes(okId) ? "..OK" : null;

    // VIP/OK emails that are already read need no action — skip them
    if (tier && !lbls.includes("UNREAD")) continue;

    emails.push({
      id: d.data.id, subject: g("Subject"), from: fromRaw,
      date: g("Date"), snippet: d.data.snippet,
      listUnsubscribe: g("List-Unsubscribe"),
      listUnsubscribePost: g("List-Unsubscribe-Post"),
      tier,
    });
  }
  return emails;
}

// ─── Fetch all emails from one sender (for sender detail page) ────────────────
export async function fetchSenderEmails(gmail, fromEmail, maxResults = 100) {
  const res = await gmail.users.messages.list({
    userId: "me", q: `from:${fromEmail} -in:trash -in:sent`, maxResults,
  });
  const messages = res.data.messages || [];
  if (!messages.length) return [];
  const details = await Promise.all(messages.map(m =>
    gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["Subject", "From", "Date"] })
  ));
  return details.map(d => {
    const h = d.data.payload.headers;
    const g = n => h.find(x => x.name === n)?.value || "";
    const lbls = d.data.labelIds || [];
    return { id: d.data.id, subject: g("Subject"), date: g("Date"), snippet: d.data.snippet, isRead: !lbls.includes("UNREAD") };
  });
}

// ─── Trash a single message ────────────────────────────────────────────────────
export async function trashMessage(gmail, id) {
  await gmail.users.messages.batchModify({
    userId: "me",
    requestBody: { ids: [id], addLabelIds: ["TRASH"], removeLabelIds: ["INBOX", "UNREAD"] },
  });
}

// ─── DelPend summary (total + per-sender counts) ───────────────────────────────
// Paginates all DelPend IDs, fetches From headers in chunks, groups by sender.
// Returns exact counts for every sender in DelPend regardless of blocklist.
export async function getDelPendSummary(gmail) {
  const delPendId = await ensureLabel(gmail, ".DelPend");
  const ids = []; let pageToken = null;
  do {
    const params = { userId: "me", labelIds: [delPendId], maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;
    const res = await gmail.users.messages.list(params);
    for (const m of res.data.messages || []) ids.push(m.id);
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);

  const total = ids.length;
  if (total === 0) return { total: 0, senders: [] };

  // Batch-fetch From headers in parallel chunks of 50
  const CHUNK = 50;
  const details = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = await Promise.all(ids.slice(i, i + CHUNK).map(id =>
      gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["From"] })
    ));
    details.push(...batch);
  }

  // Group and count by sender email
  const senderMap = {};
  for (const d of details) {
    const from = d.data.payload.headers.find(h => h.name === "From")?.value || "";
    const email = extractEmail(from);
    const name  = extractName(from);
    if (!senderMap[email]) senderMap[email] = { email, name, count: 0 };
    senderMap[email].count++;
  }
  return { total, senders: Object.values(senderMap).sort((a, b) => b.count - a.count) };
}

// ─── Trash all DelPend messages (optionally scoped to one sender) ───────────────
export async function trashDelPend(gmail, fromEmail = null) {
  const delPendId = await ensureLabel(gmail, ".DelPend");
  const q = fromEmail ? `label:.DelPend from:${fromEmail}` : "label:.DelPend";
  const ids = []; let pageToken = null;
  do {
    const params = { userId: "me", q, maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;
    const res = await gmail.users.messages.list(params);
    for (const m of res.data.messages || []) ids.push(m.id);
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  for (let i = 0; i < ids.length; i += 1000) {
    try {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: ["TRASH"], removeLabelIds: [delPendId, "INBOX", "UNREAD"] },
      });
    } catch(e) { console.error("trashDelPend batchModify FAILED:", e.message); }
  }
  return { trashed: ids.length };
}

// ─── Archive a single message (read + remove inbox) ───────────────────────────
export async function archiveMessage(gmail, id) {
  await gmail.users.messages.batchModify({
    userId: "me",
    requestBody: { ids: [id], removeLabelIds: ["INBOX", "UNREAD"] },
  });
}

// ─── Auto-label VIP / OK senders ───────────────────────────────────────────────
export async function scanAndLabelTier(gmail, list, tierName) {
  if (!list.length) return [];
  const labelId = await ensureLabel(gmail, tierName);

  const results = await Promise.all(list.map(async entry => {
    const fromClause = entry.email.startsWith("@") ? `from:*${entry.email}` : `from:${entry.email}`;
    const otherTier = tierName === "..VIP" ? "-label:..OK" : "-label:..VIP";
    const q = `${fromClause} in:inbox -label:${tierName} ${otherTier} -label:.DelPend -in:sent -in:trash`;
    const ids = []; const subjects = [];
    let pageToken = null;
    do {
      const params = { userId: "me", q, maxResults: 500 };
      if (pageToken) params.pageToken = pageToken;
      const res = await gmail.users.messages.list(params);
      for (const m of res.data.messages || []) {
        if (entry.name) {
          const d = await gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From", "Subject"] });
          const fh = d.data.payload.headers.find(h => h.name === "From")?.value || "";
          if (extractName(fh) !== entry.name) continue;
          subjects.push(d.data.payload?.headers?.find(h => h.name === "Subject")?.value || "(no subject)");
        }
        ids.push(m.id);
      }
      pageToken = res.data.nextPageToken || null;
    } while (pageToken);

    if (!ids.length) return null;

    // For entries without name filter, fetch subjects for first 5 messages
    if (!entry.name && ids.length) {
      const fetched = await Promise.all(ids.slice(0, 5).map(id =>
        gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["Subject"] })
      ));
      subjects.push(...fetched.map(d => d.data.payload?.headers?.find(h => h.name === "Subject")?.value || "(no subject)"));
    }

    for (let i = 0; i < ids.length; i += 1000) {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: [labelId] },
      });
    }
    return { email: entry.email, reason: `auto-${tierName}`, moved: ids.length, labelName: tierName, subjects: subjects.slice(0, 5) };
  }));
  return results.filter(Boolean);
}

// ─── Apply custom label rules ──────────────────────────────────────────────────
export async function scanAndApplyRules(gmail, rules) {
  const results = [];
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    if (!rule.senders?.length && !rule.subjects?.length) continue;
    const fromPart = rule.senders?.length
      ? '(' + rule.senders.map(s => s.startsWith('@') ? `from:*${s}` : `from:${s}`).join(' OR ') + ')'
      : '';
    const subjectPart = rule.subjects?.length
      ? '(' + rule.subjects.map(s => `subject:"${s}"`).join(' OR ') + ')'
      : '';
    const labelQ = rule.label.includes(' ') ? `"${rule.label}"` : rule.label;
    const q = [fromPart, subjectPart].filter(Boolean).join(' ')
      + ` in:inbox -label:${labelQ} -in:sent -in:trash`;
    const ids = [];
    let pageToken;
    do {
      const p = { userId: 'me', q, maxResults: 500 };
      if (pageToken) p.pageToken = pageToken;
      const r = await gmail.users.messages.list(p);
      if (r.data.messages) ids.push(...r.data.messages.map(m => m.id));
      pageToken = r.data.nextPageToken;
    } while (pageToken);
    if (!ids.length) continue;
    const labelId = await ensureLabel(gmail, rule.label);
    const removeLabels = rule.skipInbox ? ['INBOX', 'UNREAD'] : [];
    for (let i = 0; i < ids.length; i += 1000) {
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: [labelId], removeLabelIds: removeLabels },
      });
    }
    results.push({ email: rule.name, reason: `rule:${rule.label}`,
                   moved: ids.length, labelName: rule.label, subjects: [] });
  }
  return results;
}

// ─── OK + DelPend conflict detection & resolution ──────────────────────────────
export async function getKeptDelPendConflicts(gmail) {
  const ids = []; let pageToken = null;
  do {
    const params = { userId: "me", q: "label:.DelPend label:..OK", maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;
    const res = await gmail.users.messages.list(params);
    for (const m of res.data.messages || []) ids.push(m.id);
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  if (!ids.length) return [];

  const CHUNK = 50;
  const details = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const batch = await Promise.all(ids.slice(i, i + CHUNK).map(id =>
      gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["From"] })
    ));
    details.push(...batch);
  }
  const senderMap = {};
  for (const d of details) {
    const from = d.data.payload.headers.find(h => h.name === "From")?.value || "";
    const email = extractEmail(from);
    const name  = extractName(from);
    if (!senderMap[email]) senderMap[email] = { email, name, count: 0 };
    senderMap[email].count++;
  }
  return Object.values(senderMap).sort((a, b) => b.count - a.count);
}

export async function removeDelPendFromSender(gmail, fromEmail) {
  const delPendId = await ensureLabel(gmail, ".DelPend");
  const ids = []; let pageToken = null;
  do {
    const params = { userId: "me", q: `label:.DelPend label:..OK from:${fromEmail}`, maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;
    const res = await gmail.users.messages.list(params);
    for (const m of res.data.messages || []) ids.push(m.id);
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  for (let i = 0; i < ids.length; i += 1000) {
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: { ids: ids.slice(i, i + 1000), removeLabelIds: [delPendId] },
    });
  }
  return ids.length;
}

export async function removeOkLabelFromSender(gmail, fromEmail) {
  const okId = await ensureLabel(gmail, "..OK");
  const ids = []; let pageToken = null;
  do {
    const params = { userId: "me", q: `label:.DelPend label:..OK from:${fromEmail}`, maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;
    const res = await gmail.users.messages.list(params);
    for (const m of res.data.messages || []) ids.push(m.id);
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  for (let i = 0; i < ids.length; i += 1000) {
    await gmail.users.messages.batchModify({
      userId: "me",
      requestBody: { ids: ids.slice(i, i + 1000), removeLabelIds: [okId] },
    });
  }
  return ids.length;
}

// ─── Inbox size snapshot ───────────────────────────────────────────────────────
export async function snapshotInboxSize(gmail) {
  try {
    const res = await gmail.users.messages.list({ userId: "me", q: "in:inbox", maxResults: 1 });
    return res.data.resultSizeEstimate ?? null;
  } catch(e) {
    console.error("inboxSize snapshot failed:", e.message);
    return null;
  }
}