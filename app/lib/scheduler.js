import fs from "fs";
import path from "path";
import { loadSettings, setDailySummaryDebug, setDailySummaryLastSentAt } from "./settings.js";

const LOG_PATH = path.join(process.cwd(), "scan-log.json");

// ─── Scan log ──────────────────────────────────────────────────────────────────
export function loadScanLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH)); } catch { return []; }
}
export function clearScanLog() {
  try { fs.writeFileSync(LOG_PATH, "[]"); } catch {}
}
function appendToLog(entries) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const log = loadScanLog().filter(e => e.runAt && new Date(e.runAt).getTime() > cutoff);
  log.push(...entries);
  fs.writeFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

// ─── Timing helpers ────────────────────────────────────────────────────────────
function tzParts(date) {
  const tz = loadSettings().timezone || "America/Los_Angeles";
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "numeric", minute: "numeric", hour12: false,
  });
  return Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
}

function msUntilHour(targetHour) {
  const parts = tzParts(new Date());
  const curHour = parseInt(parts.hour);
  const curMin  = parseInt(parts.minute);
  let addDays = 0;
  let hoursUntil = targetHour - curHour;
  if (hoursUntil < 0 || (hoursUntil === 0 && curMin >= 1)) {
    hoursUntil += 24; addDays = 1;
  }
  const minUntil = addDays * 24 * 60 + hoursUntil * 60 - curMin;
  return Math.max(minUntil * 60 * 1000, 60 * 1000);
}

function msUntilNextScan() {
  const s = loadSettings();
  const startHour   = s.schedulerStartHour ?? 10;
  const startMinute = s.schedulerStartMinute ?? 0;
  const intervalMin = Math.round((s.schedulerIntervalHours ?? 2) * 60);

  // Build schedule as minutes-since-midnight
  const schedule = [];
  for (let m = startHour * 60 + startMinute; m < 24 * 60; m += intervalMin) schedule.push(m);

  const parts      = tzParts(new Date());
  const curTotalMin = parseInt(parts.hour) * 60 + parseInt(parts.minute);

  let nextTotalMin = schedule.find(m => m > curTotalMin);
  let addDays = 0;
  if (nextTotalMin === undefined) { nextTotalMin = schedule[0]; addDays = 1; }

  const minUntil = addDays * 24 * 60 + nextTotalMin - curTotalMin;
  return Math.max(minUntil * 60 * 1000, 60 * 1000);
}

function fmtTime(date) {
  const tz = loadSettings().timezone || "America/Los_Angeles";
  return date.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtDate(date) {
  const tz = loadSettings().timezone || "America/Los_Angeles";
  return date.toLocaleDateString("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
}

// ─── Scheduled scan ────────────────────────────────────────────────────────────
export async function runScheduledScan(getGmailClient, loadBlocklist, loadViplist, loadOklist,
                                        scanAndCleanBlocklist, scanAndLabelTier,
                                        loadRules, scanAndApplyRules) {
  const timeLabel = fmtTime(new Date());
  const gmail = await getGmailClient();
  const [scanClean, scanVip, scanOk, scanRules] = await Promise.all([
    scanAndCleanBlocklist(gmail, loadBlocklist()),
    scanAndLabelTier(gmail, loadViplist(), "..VIP"),
    scanAndLabelTier(gmail, loadOklist(), "..OK"),
    scanAndApplyRules ? scanAndApplyRules(gmail, (loadRules ? loadRules() : [])) : Promise.resolve([]),
  ]);
  const results = [...scanClean, ...scanVip, ...scanOk, ...scanRules];
  if (results.length) {
    appendToLog(results.map(r => ({ ...r, reason: `⏰ ${timeLabel} - ${r.reason}`, runAt: new Date().toISOString() })));
  }
  const sumMoved = arr => arr.reduce((s, r) => s + r.moved, 0);
  const blocklistMoved = sumMoved(scanClean);
  const vipMoved = sumMoved(scanVip);
  const okMoved = sumMoved(scanOk);
  const rulesMoved = sumMoved(scanRules);
  const totalMoved = blocklistMoved + vipMoved + okMoved + rulesMoved;
  console.log(`[scheduler] ${timeLabel}: ${totalMoved} emails labeled (blocklist:${blocklistMoved} vip:${vipMoved} ok:${okMoved} rules:${rulesMoved})`);

  // Debug mode: send summary email after each scan, auto-disable after 12h
  const sd = loadSettings();
  if (sd.dailySummaryDebug && sd.dailySummaryDebugEnabledAt) {
    const elapsedHrs = (Date.now() - new Date(sd.dailySummaryDebugEnabledAt).getTime()) / 3600000;
    if (elapsedHrs >= 12) {
      setDailySummaryDebug(false);
      console.log("[scheduler] debug summary mode auto-disabled after 12h");
    } else {
      try { await sendDailySummary(gmail, { force: true }); } catch(e) { console.error(`[scheduler] debug summary failed: ${e.message}`); }
    }
  }

  return { results, timeLabel, totalMoved, blocklistMoved, vipMoved, okMoved, rulesMoved };
}

export function startScheduler(getGmailClient, loadBlocklist, loadViplist, loadOklist,
                                scanAndCleanBlocklist, scanAndLabelTier,
                                loadRules, scanAndApplyRules) {
  async function runScan() {
    const s = loadSettings();
    if (s.schedulerEnabled) {
      try {
        await runScheduledScan(getGmailClient, loadBlocklist, loadViplist, loadOklist,
                               scanAndCleanBlocklist, scanAndLabelTier,
                               loadRules, scanAndApplyRules);
      } catch(e) {
        console.error(`[scheduler] scan failed: ${e.message}`);
      }
    }
    setTimeout(runScan, msUntilNextScan());
  }

  const ms = msUntilNextScan();
  console.log(`[scheduler] next scan at ${fmtTime(new Date(Date.now() + ms))} (in ${Math.round(ms / 60000)} min)`);
  setTimeout(runScan, ms);
}

// ─── Daily email summary ───────────────────────────────────────────────────────
export async function sendDailySummary(gmail, { force = false } = {}) {
  const s = loadSettings();
  if (!s.dailySummaryEnabled && !force) return false;

  const tz = s.timezone || "America/Los_Angeles";
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const log = loadScanLog().filter(e => e.runAt && new Date(e.runAt) >= since);

  // Get recipient
  let to = s.dailySummaryEmail;
  if (!to) {
    const profile = await gmail.users.getProfile({ userId: "me" });
    to = profile.data.emailAddress;
  }

  const dateStr = fmtDate(now);
  const subject = `Gmail Triage - Daily Auto-Clean Summary (${dateStr})`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;

  let bodyHtml;
  if (!log.length) {
    bodyHtml = `<p style="font-family:sans-serif;color:#374151">No emails were auto-cleaned in the last 24 hours.</p>`;
  } else {
    // Group by runAt time
    const groups = {};
    for (const e of log) {
      const key = fmtTime(new Date(e.runAt));
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }
    const esc = s => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const rows = Object.entries(groups).reverse().map(([time, entries]) => {
      const entryRows = entries.map(e => {
        const label = e.labelName || ".DelPend";
        const searchUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${e.email} label:${label}`)}`;
        const subjectHtml = (e.subjects || []).length
          ? `<div style="margin-top:3px">${e.subjects.map(s => `<span style="display:block;font-size:11px;color:#9ca3af">${esc(s)}</span>`).join("")}</div>`
          : "";
        return `<tr><td style="padding:4px 12px;font-size:13px;color:#374151"><a href="${searchUrl}" style="color:#2563eb;text-decoration:none">${esc(e.email)}</a>${subjectHtml}</td>
              <td style="padding:4px 12px;font-size:13px;color:#6b7280">${esc(e.reason.replace(/^⏰[^-]*-\s*/,""))}</td>
              <td style="padding:4px 12px;font-size:13px;text-align:right;color:#374151">${e.moved} labeled</td></tr>`;
      }).join("");
      return `<tr><td colspan="3" style="padding:10px 12px 4px;font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">${time}</td></tr>${entryRows}`;
    }).join("");

    bodyHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#1e293b;font-size:18px;margin-bottom:4px">Gmail Triage – Auto-Clean Summary</h2>
        <p style="color:#6b7280;font-size:13px;margin-top:0">${dateStr}</p>
        <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <thead><tr style="background:#f8fafc">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Sender</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Action</th>
            <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600">Count</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="color:#9ca3af;font-size:11px;margin-top:16px">Sent by Gmail Triage</p>
      </div>`;
  }

  const message = [
    `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    `Content-Type: text/html; charset=utf-8`,
    `MIME-Version: 1.0`,
    ``,
    bodyHtml,
  ].join("\r\n");

  const encoded = Buffer.from(message).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  await gmail.users.messages.send({ userId: "me", requestBody: { raw: encoded } });
  if (!force) setDailySummaryLastSentAt();
  console.log(`[scheduler] daily summary sent to ${to}`);
  return true;
}

// ─── Summary schedule helpers ──────────────────────────────────────────────────
// Returns UTC ms of next occurrence of H:MM (in tz) at or after afterTs
function nextTimeOccurrence(hour, minute, tz, afterTs) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", hour12: false });
  const d = new Date(afterTs);
  const parts = Object.fromEntries(fmt.formatToParts(d).map(p => [p.type, p.value]));
  const curTotal = parseInt(parts.hour) * 60 + parseInt(parts.minute);
  const targetTotal = hour * 60 + minute;
  let minUntil = targetTotal - curTotal;
  if (minUntil <= 0) minUntil += 24 * 60;
  return afterTs + minUntil * 60000;
}

function msUntilNextSummary() {
  const s = loadSettings();
  const unit  = s.dailySummaryIntervalUnit  || "days";
  const value = Math.max(1, parseFloat(s.dailySummaryIntervalValue) || 1);
  const hour   = parseInt(s.dailySummaryHour   ?? 6);
  const minute = parseInt(s.dailySummaryMinute ?? 0);
  const tz = s.timezone || "America/Los_Angeles";
  const now = Date.now();
  const lastSent = s.dailySummaryLastSentAt ? new Date(s.dailySummaryLastSentAt).getTime() : null;

  if (unit === "hours") {
    const base = lastSent ?? now;
    return Math.max(base + value * 3600000 - now, 60000);
  }
  const intervalMs = (unit === "weeks" ? value * 7 : value) * 24 * 3600000;
  const earliest = lastSent ? lastSent + intervalMs : now;
  const target = Math.max(earliest, now);
  return Math.max(nextTimeOccurrence(hour, minute, tz, target) - now, 60000);
}

export function startDailySummaryScheduler(getGmailClient) {
  async function runSummary() {
    const s = loadSettings();
    if (s.dailySummaryEnabled) {
      try {
        const gmail = await getGmailClient();
        await sendDailySummary(gmail);
      } catch(e) {
        console.error(`[scheduler] daily summary failed: ${e.message}`);
      }
    }
    const ms2 = msUntilNextSummary();
    console.log(`[scheduler] next daily summary at ${fmtTime(new Date(Date.now() + ms2))} (in ${Math.round(ms2 / 60000)} min)`);
    setTimeout(runSummary, ms2);
  }

  const ms = msUntilNextSummary();
  console.log(`[scheduler] daily summary at ${fmtTime(new Date(Date.now() + ms))} (in ${Math.round(ms / 60000)} min)`);
  setTimeout(runSummary, ms);
}
