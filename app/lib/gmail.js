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
    const params = { userId: "me", q: fromQuery(fromEmail), maxResults: 500 };
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
  const labelId = await ensureLabel(gmail, "DelPend");
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
  const labelId     = await ensureLabel(gmail, "DelPend");
  const keptLabelId = await ensureLabel(gmail, "Kept");

  const results = await Promise.all(blocklist.map(async entry => {
    const q = entry.email.startsWith("@")
      ? "from:*" + entry.email + " -label:DelPend -in:sent -in:trash"
      : "from:" + entry.email + " -label:DelPend -in:sent -in:trash";
    const ids = [];
    let pageToken = null;
    do {
      const params = { userId: "me", q, maxResults: 500 };
      if (pageToken) params.pageToken = pageToken;
      const res = await gmail.users.messages.list(params);
      const fetches = await Promise.all((res.data.messages || []).map(m =>
        gmail.users.messages.get({ userId: "me", id: m.id, format: "minimal" })
      ));
      for (const full of fetches) {
        const labels = full.data.labelIds || [];
        if (labels.includes("INBOX") && !labels.includes(labelId) && !labels.includes(keptLabelId))
          ids.push(full.data.id);
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
    return { email: entry.email, reason: entry.reason, moved: ids.length };
  }));
  return results.filter(Boolean);
}

// ─── Fetch emails for triage ───────────────────────────────────────────────────
export async function fetchEmails(gmail, max = 25) {
  await Promise.all(["..VIP", "..OK", "Kept", "DelPend"].map(n => ensureLabel(gmail, n).catch(() => {})));

  const res = await gmail.users.messages.list({
    userId: "me", q: "in:inbox -label:DelPend -label:Kept", maxResults: 100,
  });
  const messages = res.data.messages || [];
  const details = await Promise.all(messages.map(msg =>
    gmail.users.messages.get({
      userId: "me", id: msg.id, format: "metadata",
      metadataHeaders: ["Subject", "From", "Date", "List-Unsubscribe", "List-Unsubscribe-Post"],
    })
  ));

  const emails = [];
  const seenSenders = new Set();
  for (const d of details) {
    if (emails.length >= max) break;
    const h = d.data.payload.headers;
    const g = n => h.find(x => x.name === n)?.value || "";
    const fromRaw   = g("From");
    const fromEmail = extractEmail(fromRaw);
    const fromName  = extractName(fromRaw);
    const senderKey = fromName + "<" + fromEmail + ">";
    if (seenSenders.has(senderKey)) continue;
    seenSenders.add(senderKey);

    const lbls  = d.data.labelIds || [];
    const vipId = labelCache["..VIP"] || "";
    const okId  = labelCache["..OK"]  || "";
    const tier  = lbls.includes(vipId) ? "..VIP" : lbls.includes(okId) ? "..OK" : null;

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