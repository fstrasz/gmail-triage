import fs from "node:fs";
import path from "node:path";
import { appendLog } from "./activityLog.js";
import { atomicWriteFileSync } from "./atomicWrite.js";
import { loadBlocklist } from "./blocklist.js";
import {
  scanEmailsForEvents,
  searchEventsOfInterest,
  sendEventsEmail,
  shouldSkipWebSearch,
} from "./eventSearch.js";
import {
  loadFoundEvents,
  pruneInvalidEmailEvents,
  upsertFoundEvents,
} from "./foundEvents.js";
import {
  scanAndApplyRules,
  scanAndCleanBlocklist,
  scanAndLabelTier,
} from "./gmail.js";
import { loadOklist } from "./oklist.js";
import { triageReadState } from "./readTriage.js";
import { loadRules } from "./rules.js";
import {
  loadSettings,
  setDailySummaryDebug,
  setDailySummaryLastSentAt,
  setEventsSearchLastRunAt,
  setSchedulerLastRunAt,
  setWebSearchLastRunAt,
} from "./settings.js";
import { loadViplist } from "./viplist.js";

const escHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const LOG_PATH = path.join(process.cwd(), "scan-log.json");

// ─── Scan log ──────────────────────────────────────────────────────────────────
export function loadScanLog() {
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH));
  } catch {
    return [];
  }
}
export function clearScanLog() {
  try {
    fs.writeFileSync(LOG_PATH, "[]");
  } catch {}
}
function appendToLog(entries) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const log = loadScanLog().filter(
    (e) => e.runAt && new Date(e.runAt).getTime() > cutoff,
  );
  log.push(...entries);
  atomicWriteFileSync(LOG_PATH, JSON.stringify(log, null, 2));
}

// ─── Timing helpers ────────────────────────────────────────────────────────────
function tzParts(date) {
  const tz = loadSettings().timezone || "America/Los_Angeles";
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  return Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  );
}

function _msUntilHour(targetHour) {
  const parts = tzParts(new Date());
  const curHour = parseInt(parts.hour);
  const curMin = parseInt(parts.minute);
  let addDays = 0;
  let hoursUntil = targetHour - curHour;
  if (hoursUntil < 0 || (hoursUntil === 0 && curMin >= 1)) {
    hoursUntil += 24;
    addDays = 1;
  }
  const minUntil = addDays * 24 * 60 + hoursUntil * 60 - curMin;
  return Math.max(minUntil * 60 * 1000, 60 * 1000);
}

function msUntilNextScan() {
  const s = loadSettings();
  const startHour = s.schedulerStartHour ?? 10;
  const startMinute = s.schedulerStartMinute ?? 0;
  const intervalMin = Math.round((s.schedulerIntervalHours ?? 2) * 60);

  const parts = tzParts(new Date());
  const curTotalMin = parseInt(parts.hour) * 60 + parseInt(parts.minute);
  const startMin = startHour * 60 + startMinute;

  // Find the next slot in the infinite recurring cycle (startMin, startMin+i, startMin+2i, ...)
  // regardless of where curTotalMin falls — before startMin, mid-day, or past midnight.
  // Formula: next = startMin + ceil((curTotalMin - startMin + 1) / intervalMin) * intervalMin
  const n = Math.floor((curTotalMin - startMin) / intervalMin) + 1;
  const next = startMin + n * intervalMin;
  return Math.max((next - curTotalMin) * 60 * 1000, 60 * 1000);
}

function fmtTime(date) {
  const tz = loadSettings().timezone || "America/Los_Angeles";
  return date.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
function fmtDate(date) {
  const tz = loadSettings().timezone || "America/Los_Angeles";
  return date.toLocaleDateString("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// Run all four scans in parallel against the same Gmail client. Returns per-scan arrays.
// Shared by the scheduler (runScheduledScan) and the on-demand /triage GET handler.
export async function scanAll(gmail) {
  const [scanClean, scanVip, scanOk, scanRules] = await Promise.all([
    scanAndCleanBlocklist(gmail, loadBlocklist()),
    scanAndLabelTier(gmail, loadViplist(), "..VIP"),
    scanAndLabelTier(gmail, loadOklist(), "..OK"),
    scanAndApplyRules(gmail, loadRules()),
  ]);
  return { scanClean, scanVip, scanOk, scanRules };
}

// ─── Read/unread triage report ─────────────────────────────────────────────────
// Builds the report email body for docs/superpowers/specs/2026-08-20-read-unread-triage-design.md.
// Per the spec: every kept (left-unread) message with sender/subject/reason, the
// cleared count, every amount/date the classifier surfaced, an uncertain callout,
// and the undo endpoint.
function buildReadTriageReportHtml(result) {
  const amounts = [];
  const dates = [];
  for (const m of result.kept) {
    amounts.push(...m.amounts);
    dates.push(...m.dates);
  }
  const keptRows = result.kept
    .map((m) => {
      const flag = m.uncertain
        ? ` <span style="color:#b45309;font-weight:600">(uncertain)</span>`
        : "";
      return `<tr><td style="padding:4px 12px;font-size:13px;color:#374151">${escHtml(m.from)}${flag}</td>
        <td style="padding:4px 12px;font-size:13px;color:#374151">${escHtml(m.subject)}</td>
        <td style="padding:4px 12px;font-size:13px;color:#6b7280">${escHtml(m.reason)}</td></tr>`;
    })
    .join("");
  const amountsDatesHtml =
    amounts.length || dates.length
      ? `<p style="color:#374151;font-size:13px"><strong>Amounts/dates surfaced:</strong> ${[...amounts, ...dates].map(escHtml).join(", ")}</p>`
      : "";
  // Surface a classifier failure in the report itself, not only in a server
  // log — a silent no-op on exactly the backlog this feature exists to clear
  // is the defect a console.error alone leaves in place.
  // A capped run must say so. Otherwise a backlog drains 100 at a time while
  // every report reads like the whole queue was handled.
  const skippedHtml = result.skipped
    ? `<p style="color:#b45309;font-size:13px;font-weight:600">${result.skipped} more unread ..OK/..VIP message(s) were left for the next run (this run is capped to protect the Gmail per-minute quota).</p>`
    : "";
  const failureHtml = result.failedCount
    ? `<p style="color:#b91c1c;font-size:13px;font-weight:600">${result.failedCount} message(s) could not be classified this run due to a classifier error and were left unread.</p>`
    : "";

  return `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1e293b;font-size:18px;margin-bottom:4px">Gmail Triage – Read/Unread Report</h2>
      <p style="color:#6b7280;font-size:13px;margin-top:0">${result.cleared} email(s) marked read</p>
      ${failureHtml}
      ${skippedHtml}
      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#f8fafc">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Sender</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Subject</th>
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600">Reason left unread</th>
        </tr></thead>
        <tbody>${keptRows}</tbody>
      </table>
      ${amountsDatesHtml}
      <p style="color:#9ca3af;font-size:11px;margin-top:16px">To reverse this run: POST /api/read-triage/undo</p>
    </div>`;
}

// Reuses the same MIME-construction + recipient-resolution path as sendDailySummary.
async function sendReadTriageReport(gmail, result) {
  const s = loadSettings();
  let to = s.dailySummaryEmail;
  if (!to) {
    const profile = await gmail.users.getProfile({ userId: "me" });
    to = profile.data.emailAddress;
  }

  const dateStr = fmtDate(new Date());
  const subject = `Gmail Triage - Read/Unread Report (${dateStr})`;
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;
  const bodyHtml = buildReadTriageReportHtml(result);

  const message = [
    `To: ${to}`,
    `Subject: ${subjectEncoded}`,
    `Content-Type: text/html; charset=utf-8`,
    `MIME-Version: 1.0`,
    ``,
    bodyHtml,
  ].join("\r\n");

  const encoded = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
  console.log(`[scheduler] read-triage report sent to ${to}`);
}

// Runs the read/unread pass and, if anything happened, emails the report.
// A failure here must never abort the rest of the scan — caught and logged.
// `triage`/`send` are injectable for tests; production callers just pass gmail.
export async function runReadTriagePass(
  gmail,
  { triage = triageReadState, send = sendReadTriageReport } = {},
) {
  try {
    const result = await triage(gmail);
    // Nothing cleared and nothing kept ⇒ nothing happened this run — an empty
    // report every cycle is how a useful report gets filtered into oblivion.
    if (!result.enabled) return;
    if (result.cleared === 0 && result.kept.length === 0) return;
    await send(gmail, result);
  } catch (e) {
    console.error(`[scheduler] read-triage failed: ${e.message}`);
  }
}

// ─── Scheduled scan ────────────────────────────────────────────────────────────
export async function runScheduledScan(getGmailClient) {
  const timeLabel = fmtTime(new Date());
  const gmail = await getGmailClient();
  const { scanClean, scanVip, scanOk, scanRules } = await scanAll(gmail);
  await runReadTriagePass(gmail);
  setSchedulerLastRunAt(); // stamp on every successful scan (even no-op) so /health staleness is trustworthy
  const results = [...scanClean, ...scanVip, ...scanOk, ...scanRules];
  if (results.length) {
    appendToLog(
      results.map((r) => ({
        ...r,
        reason: `⏰ ${timeLabel} - ${r.reason}`,
        runAt: new Date().toISOString(),
      })),
    );
    for (const r of scanRules) {
      if (r.moved > 0)
        appendLog({
          type: "rule",
          ruleName: r.email,
          label: r.labelName,
          count: r.moved,
        });
    }
  }
  const sumMoved = (arr) => arr.reduce((s, r) => s + r.moved, 0);
  const blocklistMoved = sumMoved(scanClean);
  const vipMoved = sumMoved(scanVip);
  const okMoved = sumMoved(scanOk);
  const rulesMoved = sumMoved(scanRules);
  const totalMoved = blocklistMoved + vipMoved + okMoved + rulesMoved;
  console.log(
    `[scheduler] ${timeLabel}: ${totalMoved} emails labeled (blocklist:${blocklistMoved} vip:${vipMoved} ok:${okMoved} rules:${rulesMoved})`,
  );

  // Debug mode: send summary email after each scan, auto-disable after 12h
  const sd = loadSettings();
  if (sd.dailySummaryDebug && sd.dailySummaryDebugEnabledAt) {
    const elapsedHrs =
      (Date.now() - new Date(sd.dailySummaryDebugEnabledAt).getTime()) /
      3600000;
    if (elapsedHrs >= 12) {
      setDailySummaryDebug(false);
      console.log("[scheduler] debug summary mode auto-disabled after 12h");
    } else {
      try {
        await sendDailySummary(gmail, { force: true });
      } catch (e) {
        console.error(`[scheduler] debug summary failed: ${e.message}`);
      }
    }
  }

  return {
    results,
    timeLabel,
    totalMoved,
    blocklistMoved,
    vipMoved,
    okMoved,
    rulesMoved,
  };
}

export function startScheduler(getGmailClient) {
  async function runScan() {
    const s = loadSettings();
    if (s.schedulerEnabled) {
      try {
        await runScheduledScan(getGmailClient);
      } catch (e) {
        console.error(`[scheduler] scan failed: ${e.message}`);
      }
    }
    setTimeout(runScan, msUntilNextScan());
  }

  const ms = msUntilNextScan();
  console.log(
    `[scheduler] next scan at ${fmtTime(new Date(Date.now() + ms))} (in ${Math.round(ms / 60000)} min)`,
  );
  setTimeout(runScan, ms);
}

// ─── Daily email summary ───────────────────────────────────────────────────────
export async function sendDailySummary(gmail, { force = false } = {}) {
  const s = loadSettings();
  if (!s.dailySummaryEnabled && !force) return false;

  const _tz = s.timezone || "America/Los_Angeles";
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const log = loadScanLog().filter(
    (e) => e.runAt && new Date(e.runAt) >= since,
  );

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
    // Group by ISO minute (date+time) so midnight entries stay separate and sort correctly
    const groups = {};
    for (const e of log) {
      const d = new Date(e.runAt);
      const key = d.toISOString().slice(0, 16); // "2026-03-15T22:00"
      if (!groups[key]) groups[key] = { label: fmtTime(d), entries: [] };
      groups[key].entries.push(e);
    }
    const esc = (s) =>
      String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    const rows = Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a)) // ISO desc = newest first
      .map(([, { label: timeLabel, entries }]) => {
        const entryRows = entries
          .map((e) => {
            const label = e.labelName || ".DelPend";
            const searchUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${e.email} label:${label}`)}`;
            const subjectHtml = (e.subjects || []).length
              ? `<div style="margin-top:3px">${e.subjects.map((s) => `<span style="display:block;font-size:11px;color:#9ca3af">${esc(s)}</span>`).join("")}</div>`
              : "";
            return `<tr><td style="padding:4px 12px;font-size:13px;color:#374151"><a href="${searchUrl}" style="color:#2563eb;text-decoration:none">${esc(e.email)}</a>${subjectHtml}</td>
              <td style="padding:4px 12px;font-size:13px;color:#6b7280">${esc(e.reason.replace(/^⏰[^-]*-\s*/, ""))}</td>
              <td style="padding:4px 12px;font-size:13px;text-align:right;color:#374151">${e.moved} labeled</td></tr>`;
          })
          .join("");
        return `<tr><td colspan="3" style="padding:10px 12px 4px;font-size:12px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:.05em">${timeLabel}</td></tr>${entryRows}`;
      })
      .join("");

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

  const encoded = Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
  if (!force) setDailySummaryLastSentAt();
  console.log(`[scheduler] daily summary sent to ${to}`);
  return true;
}

// ─── Summary schedule helpers ──────────────────────────────────────────────────
// Returns UTC ms of next occurrence of H:MM (in tz) at or after afterTs
function nextTimeOccurrence(hour, minute, tz, afterTs) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const d = new Date(afterTs);
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  const curTotal = parseInt(parts.hour) * 60 + parseInt(parts.minute);
  const targetTotal = hour * 60 + minute;
  let minUntil = targetTotal - curTotal;
  if (minUntil <= 0) minUntil += 24 * 60;
  return afterTs + minUntil * 60000;
}

function msUntilNextSummary() {
  const s = loadSettings();
  const unit = s.dailySummaryIntervalUnit || "days";
  const value = Math.max(1, parseFloat(s.dailySummaryIntervalValue) || 1);
  const hour = parseInt(s.dailySummaryHour ?? 6);
  const minute = parseInt(s.dailySummaryMinute ?? 0);
  const tz = s.timezone || "America/Los_Angeles";
  const now = Date.now();
  const lastSent = s.dailySummaryLastSentAt
    ? new Date(s.dailySummaryLastSentAt).getTime()
    : null;

  if (unit === "hours") {
    const base = lastSent ?? now;
    return Math.max(base + value * 3600000 - now, 60000);
  }
  const intervalMs = (unit === "weeks" ? value * 7 : value) * 24 * 3600000;
  const earliest = lastSent ? lastSent + intervalMs : now;
  const target = Math.max(earliest, now);
  return Math.max(nextTimeOccurrence(hour, minute, tz, target) - now, 60000);
}

let _summaryTimer = null;
let _summaryGmailGetter = null;

export function startDailySummaryScheduler(getGmailClient) {
  _summaryGmailGetter = getGmailClient;
  _scheduleSummary();
}

export function restartDailySummaryScheduler() {
  if (_summaryTimer) {
    clearTimeout(_summaryTimer);
    _summaryTimer = null;
  }
  console.log("[scheduler] daily summary schedule updated — rescheduling");
  if (_summaryGmailGetter) _scheduleSummary();
}

function _scheduleSummary() {
  async function runSummary() {
    const s = loadSettings();
    if (s.dailySummaryEnabled) {
      try {
        const gmail = await _summaryGmailGetter();
        await sendDailySummary(gmail);
      } catch (e) {
        console.error(`[scheduler] daily summary failed: ${e.message}`);
      }
      // Also send current found events daily if there are any non-ignored events
      try {
        const gmail = await _summaryGmailGetter();
        await pruneInvalidEmailEvents(gmail);
        const today = new Date().toISOString().slice(0, 10);
        const activeEvents = loadFoundEvents().filter(
          (e) => !e.ignored && (!e.date || e.date >= today),
        );
        if (activeEvents.length) {
          await sendEventsEmail(gmail, activeEvents, loadSettings());
          console.log(
            `[scheduler] daily events email sent (${activeEvents.length} events)`,
          );
        }
      } catch (e) {
        console.error(`[scheduler] daily events email failed: ${e.message}`);
      }
    }
    const ms2 = msUntilNextSummary();
    console.log(
      `[scheduler] next daily summary at ${fmtTime(new Date(Date.now() + ms2))} (in ${Math.round(ms2 / 60000)} min)`,
    );
    _summaryTimer = setTimeout(runSummary, ms2);
  }

  const ms = msUntilNextSummary();
  console.log(
    `[scheduler] daily summary at ${fmtTime(new Date(Date.now() + ms))} (in ${Math.round(ms / 60000)} min)`,
  );
  _summaryTimer = setTimeout(runSummary, ms);
}

// ─── Events search scheduler ───────────────────────────────────────────────────
let _eventsTimer = null;
let _eventsGmailGetter = null;

export async function runEventsSearchNow(getGmailClient) {
  const s = loadSettings();
  const interests = s.eventInterests || [];
  if (!interests.length) {
    console.log("[scheduler] events search: no interests configured");
    return 0;
  }
  const locations = s.locations || [];
  const skipWeb = shouldSkipWebSearch(Date.now(), s.webSearchLastRunAt);
  console.log(
    `[scheduler] events search: inbox always, web ${skipWeb ? "SKIPPED (last ran " + s.webSearchLastRunAt + ")" : "will run (last ran " + (s.webSearchLastRunAt || "never") + ")"}`,
  );
  const gmail = await getGmailClient();
  const [webResult, emailResult] = await Promise.allSettled([
    skipWeb
      ? Promise.resolve([])
      : searchEventsOfInterest(interests, locations),
    scanEmailsForEvents(gmail, interests, locations),
  ]);
  const webEvents =
    webResult.status === "fulfilled"
      ? webResult.value
      : (console.error(
          "[scheduler] web search failed:",
          webResult.reason?.message,
        ),
        []);
  const emailEvents =
    emailResult.status === "fulfilled"
      ? emailResult.value
      : (console.error(
          "[scheduler] email scan failed:",
          emailResult.reason?.message,
        ),
        []);
  if (!skipWeb && webResult.status === "fulfilled") setWebSearchLastRunAt();
  const allEvents = [...webEvents, ...emailEvents];
  const added = upsertFoundEvents(allEvents);
  await sendEventsEmail(gmail, allEvents, s);
  setEventsSearchLastRunAt();
  console.log(
    `[scheduler] events search complete: ${webEvents.length} web + ${emailEvents.length} email = ${allEvents.length} found, ${added} new`,
  );
  return added;
}

export function startEventsSearchScheduler(getGmailClient) {
  _eventsGmailGetter = getGmailClient;
  _scheduleEventsSearch();
}

function _scheduleEventsSearch() {
  const s = loadSettings();
  if (!s.eventsSearchEnabled) {
    console.log("[scheduler] events search: disabled, not scheduling");
    return;
  }
  const days = Math.max(1, parseInt(s.eventsSearchIntervalDays) || 7);
  const hour = parseInt(s.dailySummaryHour ?? 6);
  const minute = parseInt(s.dailySummaryMinute ?? 0);
  const tz = s.timezone || "America/Los_Angeles";
  const last = s.eventsSearchLastRunAt
    ? new Date(s.eventsSearchLastRunAt).getTime()
    : null;
  const earliest = last ? last + days * 86400000 : Date.now();
  const target = Math.max(earliest, Date.now());
  const ms = Math.max(
    nextTimeOccurrence(hour, minute, tz, target) - Date.now(),
    60000,
  );
  _eventsTimer = setTimeout(async () => {
    try {
      await runEventsSearchNow(_eventsGmailGetter);
    } catch (e) {
      console.error(`[scheduler] events search failed: ${e.message}`);
    }
    _scheduleEventsSearch();
  }, ms);
  console.log(
    `[scheduler] next events search at ${fmtTime(new Date(Date.now() + ms))} (in ${Math.round(ms / 60000)} min)`,
  );
}
