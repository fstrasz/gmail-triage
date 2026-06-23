import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { isBlocked } from "./blocklist.js";
import { loadRules } from "./rules.js";

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
  return `from:"${fromEmail}" -in:sent -in:trash`;
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

// ─── Reapply query builder ────────────────────────────────────────────────────
// Builds the Gmail search query used by /api/reapply guard, /api/reapply/preview, and
// internally inside reapplyTier/reapplyBlocklist/reapplyRules. One source of truth so
// future tweaks (e.g. adding -in:spam) apply uniformly. Returns null if the entry is empty.
export function buildReapplyQuery(list, entry) {
  const email = entry.email || '';
  const fromClause = list === "rules"
    ? (entry.senders?.length
        ? '(' + entry.senders.map(s => s.startsWith('@') ? `from:*${s}` : `from:${s}`).join(' OR ') + ')'
        : '')
    : (email.startsWith("@") ? `from:*${email}` : `from:${email}`);
  const subjectPart = list === "rules" && entry.subjects?.length
    ? '(' + entry.subjects.map(s => `subject:"${s}"`).join(' OR ') + ')'
    : '';
  const labelExcl = list === "vip" ? " -label:..VIP"
    : list === "ok" ? " -label:..OK"
    : list === "blocklist" ? " -label:.DelPend"
    : (entry.label ? ` -label:${entry.label.includes(' ') ? '"' + entry.label + '"' : entry.label}` : '');
  const q = [fromClause, subjectPart].filter(Boolean).join(' ') + labelExcl + ' -in:sent -in:trash';
  if (q.trim() === '-in:sent -in:trash') return null;
  return q;
}

// ─── Bulk guard ───────────────────────────────────────────────────────────────
export const BULK_GUARD_THRESHOLD = 100;

export async function countMatchingEmails(gmail, query) {
  let count = 0;
  let pageToken = null;
  do {
    const params = { userId: "me", q: query, maxResults: 500 };
    if (pageToken) params.pageToken = pageToken;
    const res = await gmail.users.messages.list(params);
    count += (res.data.messages || []).length;
    pageToken = res.data.nextPageToken || null;
  } while (pageToken);
  return count;
}

// ─── Label all sender emails ───────────────────────────────────────────────────
export async function labelSender(gmail, labelName, fromEmail, fromName = null, removeLabels = []) {
  const labelId = await ensureLabel(gmail, labelName);
  const ids = [];
  let pageToken = null;
  do {
    // in:inbox naturally excludes sent-only and trashed mail
    const params = { userId: "me", q: `from:"${fromEmail}" in:inbox`, maxResults: 500 };
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
    const ids = []; const subjects = []; const dates = [];
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
        dates.push(parseInt(full.data.internalDate || '0'));
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
    return { email: entry.email, reason: entry.reason, moved: ids.length, labelName: ".DelPend", subjects: subjects.slice(0, 5), latestEmailDate: dates.length ? Math.max(...dates) : null };
  }));
  return results.filter(Boolean);
}

// ─── Fetch emails for triage ───────────────────────────────────────────────────
export async function fetchEmails(gmail, max = 25, { skipSender = null } = {}) {
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

  // Build rule label ID → name map for badge display
  const ruleLabelMap = {};
  for (const r of loadRules()) {
    if (r.enabled === false || !r.label) continue;
    const id = labelCache[r.label];
    if (id) ruleLabelMap[id] = r.label;
  }

  const emails = [];
  for (const d of details) {
    if (emails.length >= max) break;
    const h = d.data.payload.headers;
    const g = n => h.find(x => x.name === n)?.value || "";
    const fromRaw   = g("From");
    const fromEmail = extractEmail(fromRaw);
    const fromName  = extractName(fromRaw);

    // Skip senders the caller wants hidden (e.g. VIP/OK-listed when the triage filter is on).
    // Done here (inside the 100-message pool) so the queue still fills up to `max` unlisted emails.
    if (skipSender && skipSender(fromEmail, fromName)) continue;

    const lbls  = d.data.labelIds || [];
    const vipId = labelCache["..VIP"] || "";
    const okId  = labelCache["..OK"]  || "";
    const tier  = lbls.includes(vipId) ? "..VIP" : lbls.includes(okId) ? "..OK" : null;

    // VIP/OK emails that are already read need no action — skip them
    if (tier && !lbls.includes("UNREAD")) continue;

    const ruleLabels = lbls.map(id => ruleLabelMap[id]).filter(Boolean);

    emails.push({
      id: d.data.id, threadId: d.data.threadId, subject: g("Subject"), from: fromRaw,
      date: g("Date"), snippet: d.data.snippet,
      listUnsubscribe: g("List-Unsubscribe"),
      listUnsubscribePost: g("List-Unsubscribe-Post"),
      tier, ruleLabels,
    });
  }
  return emails;
}

// ─── Fetch all emails from one sender (for sender detail page) ────────────────
export async function fetchSenderEmails(gmail, fromEmail, maxResults = 100) {
  const res = await gmail.users.messages.list({
    userId: "me", q: `from:"${fromEmail}" -in:trash -in:sent`, maxResults,
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

// ─── Fetch emails by label ─────────────────────────────────────────────────────
export async function fetchLabeledEmails(gmail, labelName, maxResults = 200) {
  const labelId = await ensureLabel(gmail, labelName);
  let ids = [], pageToken;
  do {
    const p = { userId: "me", labelIds: [labelId], maxResults: 500 };
    if (pageToken) p.pageToken = pageToken;
    const r = await gmail.users.messages.list(p);
    if (r.data.messages) ids.push(...r.data.messages.map(m => m.id));
    pageToken = r.data.nextPageToken;
  } while (pageToken && ids.length < maxResults);
  ids = ids.slice(0, maxResults);
  if (!ids.length) return [];
  const details = await Promise.all(ids.map(id =>
    gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["Subject", "From", "Date"] })
  ));
  return details.map(d => {
    const h = d.data.payload.headers;
    const g = n => h.find(x => x.name === n)?.value || "";
    const lbls = d.data.labelIds || [];
    return { id: d.data.id, subject: g("Subject"), from: g("From"), date: g("Date"), snippet: d.data.snippet, isRead: !lbls.includes("UNREAD") };
  });
}

// ─── Trash a single message ────────────────────────────────────────────────────
export async function trashMessage(gmail, id) {
  await gmail.users.messages.batchModify({
    userId: "me",
    requestBody: { ids: [id], addLabelIds: ["TRASH"], removeLabelIds: ["INBOX", "UNREAD"] },
  });
}

// ─── Undo a trash: restore the message to the inbox ────────────────────────────
// untrash clears TRASH; batchModify then re-adds INBOX (trashMessage removed it).
// UNREAD is NOT restored — the prior read state isn't tracked (best-effort undo).
export async function untrashMessage(gmail, id) {
  await gmail.users.messages.untrash({ userId: "me", id });
  await gmail.users.messages.batchModify({
    userId: "me",
    requestBody: { ids: [id], addLabelIds: ["INBOX"] },
  });
}

// ─── DelPend summary (total + per-sender counts) ───────────────────────────────
// Paginates all DelPend IDs, fetches From headers in chunks, groups by sender.
// Returns exact counts for every sender in DelPend regardless of blocklist.
// Home page DelPend section:
// 1) Total count comes from messages.list pagination over the label (cheap).
// 2) Senders discovered by fetching From headers for the SAMPLE_CAP newest messages.
// 3) Each discovered sender's accurate count fetched separately, capped at PER_SENDER_CAP
//    to bound per-call cost (display shows "200+" when capped).
const DELPEND_SAMPLE_CAP = 200;
const DELPEND_PER_SENDER_CAP = 200;

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
  if (total === 0) return { total: 0, senders: [], sampled: 0 };

  // Discover unique senders from the newest SAMPLE_CAP messages
  const sampledIds = ids.slice(0, DELPEND_SAMPLE_CAP);
  const CHUNK = 25;
  const details = [];
  for (let i = 0; i < sampledIds.length; i += CHUNK) {
    const batch = await Promise.all(sampledIds.slice(i, i + CHUNK).map(id =>
      gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["From"] })
    ));
    details.push(...batch);
  }
  const senderInfo = {};
  for (const d of details) {
    const from = d.data.payload.headers.find(h => h.name === "From")?.value || "";
    const email = extractEmail(from);
    if (!email) continue;
    const name = extractName(from);
    if (!senderInfo[email]) senderInfo[email] = { email, name };
  }

  // Per-sender accurate count, capped — one cheap messages.list per sender
  const senders = [];
  for (const info of Object.values(senderInfo)) {
    const escaped = info.email.replace(/"/g, '\\"');
    const q = `from:"${escaped}" label:.DelPend`;
    try {
      const res = await gmail.users.messages.list({
        userId: "me", q, maxResults: DELPEND_PER_SENDER_CAP + 1,
      });
      const matched = (res.data.messages || []).length;
      senders.push({
        email: info.email,
        name: info.name,
        count: Math.min(matched, DELPEND_PER_SENDER_CAP),
        capped: matched > DELPEND_PER_SENDER_CAP,
      });
    } catch (e) {
      console.error(`getDelPendSummary count failed for ${info.email}:`, e.message);
    }
  }
  senders.sort((a, b) => b.count - a.count);

  return { total, sampled: sampledIds.length, senders };
}

// ─── Trash all DelPend messages (optionally scoped to one sender) ───────────────
export async function trashDelPend(gmail, fromEmail = null) {
  const delPendId = await ensureLabel(gmail, ".DelPend");
  const q = fromEmail ? `label:.DelPend from:"${fromEmail}"` : "label:.DelPend";
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

// ─── Archive all messages in a thread (read + remove inbox) ───────────────────
export async function archiveThread(gmail, threadId) {
  await gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: { removeLabelIds: ["INBOX", "UNREAD"] },
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
    const ids = []; const subjects = []; const dates = [];
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
          dates.push(parseInt(d.data.internalDate || '0'));
        }
        ids.push(m.id);
      }
      pageToken = res.data.nextPageToken || null;
    } while (pageToken);

    if (!ids.length) return null;

    // For entries without name filter, fetch subjects + dates for first 5 messages
    if (!entry.name && ids.length) {
      const fetched = await Promise.all(ids.slice(0, 5).map(id =>
        gmail.users.messages.get({ userId: "me", id, format: "metadata", metadataHeaders: ["Subject"] })
      ));
      subjects.push(...fetched.map(d => d.data.payload?.headers?.find(h => h.name === "Subject")?.value || "(no subject)"));
      dates.push(...fetched.map(d => parseInt(d.data.internalDate || '0')));
    }

    for (let i = 0; i < ids.length; i += 1000) {
      await gmail.users.messages.batchModify({
        userId: "me",
        requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: [labelId] },
      });
    }
    return { email: entry.email, reason: `auto-${tierName}`, moved: ids.length, labelName: tierName, subjects: subjects.slice(0, 5), latestEmailDate: dates.length ? Math.max(...dates) : null };
  }));
  return results.filter(Boolean);
}

// ─── Reapply tier labels across all mail ──────────────────────────────────────
export async function reapplyTier(gmail, list, tierName, onProgress = null) {
  if (!list.length) return [];
  const labelId = await ensureLabel(gmail, tierName);
  const results = [];

  for (let idx = 0; idx < list.length; idx++) {
    const entry = list[idx];
    if (onProgress) onProgress({ current: idx + 1, total: list.length, email: entry.email });
    try {
      const fromClause = entry.email.startsWith("@") ? `from:*${entry.email}` : `from:${entry.email}`;
      const q = `${fromClause} -label:${tierName} -in:sent -in:trash`;
      const ids = [];
      let pageToken = null;
      do {
        const params = { userId: "me", q, maxResults: 500 };
        if (pageToken) params.pageToken = pageToken;
        const res = await gmail.users.messages.list(params);
        for (const m of res.data.messages || []) {
          if (entry.name) {
            const d = await gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From"] });
            const fh = d.data.payload.headers.find(h => h.name === "From")?.value || "";
            if (extractName(fh) !== entry.name) continue;
          }
          ids.push(m.id);
        }
        pageToken = res.data.nextPageToken || null;
      } while (pageToken);

      if (!ids.length) continue;
      for (let i = 0; i < ids.length; i += 1000) {
        await gmail.users.messages.batchModify({
          userId: "me",
          requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: [labelId] },
        });
      }
      results.push({ email: entry.email, labeled: ids.length });
    } catch (e) {
      console.error(`reapplyTier failed for ${entry.email}:`, e.message);
      if (onProgress) onProgress({ current: idx + 1, total: list.length, email: entry.email, error: e.message });
      results.push({ email: entry.email, labeled: 0, error: e.message });
    }
  }
  return results;
}

// ─── Reapply blocklist labels across all mail ─────────────────────────────────
export async function reapplyBlocklist(gmail, blocklist, onProgress = null) {
  if (!blocklist.length) return [];
  const labelId    = await ensureLabel(gmail, ".DelPend");
  const vipLabelId = await ensureLabel(gmail, "..VIP");
  const okLabelId  = await ensureLabel(gmail, "..OK");
  const skip = new Set([labelId, vipLabelId, okLabelId]);
  const results = [];

  for (let idx = 0; idx < blocklist.length; idx++) {
    const entry = blocklist[idx];
    if (onProgress) onProgress({ current: idx + 1, total: blocklist.length, email: entry.email });
    try {
      const fromClause = entry.email.startsWith("@") ? `from:*${entry.email}` : `from:${entry.email}`;
      const q = `${fromClause} -label:.DelPend -in:sent -in:trash`;
      const ids = [];
      let pageToken = null;
      do {
        const params = { userId: "me", q, maxResults: 500 };
        if (pageToken) params.pageToken = pageToken;
        const res = await gmail.users.messages.list(params);
        const fetches = await Promise.all((res.data.messages || []).map(m =>
          gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From"] })
        ));
        for (const full of fetches) {
          const labels = full.data.labelIds || [];
          if (labels.some(l => skip.has(l))) continue;
          if (entry.name) {
            const fromHeader = full.data.payload?.headers?.find(h => h.name === "From")?.value || "";
            if (extractName(fromHeader) !== entry.name) continue;
          }
          ids.push(full.data.id);
        }
        pageToken = res.data.nextPageToken || null;
      } while (pageToken);

      if (!ids.length) continue;
      for (let i = 0; i < ids.length; i += 1000) {
        await gmail.users.messages.batchModify({
          userId: "me",
          requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: [labelId], removeLabelIds: ["INBOX", "UNREAD"] },
        });
      }
      results.push({ email: entry.email, labeled: ids.length });
    } catch (e) {
      console.error(`reapplyBlocklist failed for ${entry.email}:`, e.message);
      if (onProgress) onProgress({ current: idx + 1, total: blocklist.length, email: entry.email, error: e.message });
      results.push({ email: entry.email, labeled: 0, error: e.message });
    }
  }
  return results;
}

// ─── Reapply custom label rules across all mail ───────────────────────────────
export async function reapplyRules(gmail, rules, onProgress = null) {
  const results = [];
  let idx = 0;
  for (const rule of rules) {
    idx++;
    if (rule.enabled === false) continue;
    if (onProgress) onProgress({ current: idx, total: rules.length, email: rule.name });
    if (!rule.senders?.length && !rule.subjects?.length) continue;
    try {
      const fromPart = rule.senders?.length
        ? '(' + rule.senders.map(s => s.startsWith('@') ? `from:*${s}` : `from:${s}`).join(' OR ') + ')'
        : '';
      const subjectPart = rule.subjects?.length
        ? '(' + rule.subjects.map(s => `subject:"${s}"`).join(' OR ') + ')'
        : '';
      const labelQ = rule.label.includes(' ') ? `"${rule.label}"` : rule.label;
      const q = [fromPart, subjectPart].filter(Boolean).join(' ') + ` -label:${labelQ} -in:sent -in:trash`;
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
      results.push({ ruleName: rule.name, label: rule.label, labeled: ids.length });
    } catch (e) {
      console.error(`reapplyRules failed for ${rule.name}:`, e.message);
      if (onProgress) onProgress({ current: idx, total: rules.length, email: rule.name, error: e.message });
      results.push({ ruleName: rule.name, label: rule.label, labeled: 0, error: e.message });
    }
  }
  return results;
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
    const firstMsg = await gmail.users.messages.get({ userId: 'me', id: ids[0], format: 'minimal' });
    const latestEmailDate = parseInt(firstMsg.data.internalDate || '0') || null;
    const removeLabels = rule.skipInbox ? ['INBOX', 'UNREAD'] : [];
    for (let i = 0; i < ids.length; i += 1000) {
      await gmail.users.messages.batchModify({
        userId: 'me',
        requestBody: { ids: ids.slice(i, i + 1000), addLabelIds: [labelId], removeLabelIds: removeLabels },
      });
    }
    results.push({ email: rule.name, reason: `rule:${rule.label}`,
                   moved: ids.length, labelName: rule.label, subjects: [], latestEmailDate });
  }
  return results;
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