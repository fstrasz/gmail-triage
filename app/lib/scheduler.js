import fs from "fs";
import path from "path";
import { loadSettings } from "./settings.js";

const LOG_PATH = path.join(process.cwd(), "scan-log.json");

// ─── Scan log ──────────────────────────────────────────────────────────────────
export function loadScanLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH)); } catch { return []; }
}
export function clearScanLog() {
  try { fs.writeFileSync(LOG_PATH, "[]"); } catch {}
}
function appendToLog(entries) {
  const log = loadScanLog();
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

  let nextTotalMin = schedule.find(m => m >= curTotalMin);
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
                                        scanAndCleanBlocklist, scanAndLabelTier) {
  const timeLabel = fmtTime(new Date());
  const gmail = await getGmailClient();
  const [scanClean, scanVip, scanOk] = await Promise.all([
    scanAndCleanBlocklist(gmail, loadBlocklist()),
    scanAndLabelTier(gmail, loadViplist(), "..VIP"),
    scanAndLabelTier(gmail, loadOklist(), "..OK"),
  ]);
  const results = [...scanClean, ...scanVip, ...scanOk];
  if (results.length) {
    appendToLog(results.map(r => ({ ...r, reason: `⏰ ${timeLabel} - ${r.reason}`, runAt: new Date().toISOString() })));
  }
  const sumMoved = arr => arr.reduce((s, r) => s + r.moved, 0);
  const blocklistMoved = sumMoved(scanClean);
  const vipMoved = sumMoved(scanVip);
  const okMoved = sumMoved(scanOk);
  const totalMoved = blocklistMoved + vipMoved + okMoved;
  console.log(`[scheduler] ${timeLabel}: ${totalMoved} emails labeled (blocklist:${blocklistMoved} vip:${vipMoved} ok:${okMoved})`);
  return { results, timeLabel, totalMoved, blocklistMoved, vipMoved, okMoved };
}

export function startScheduler(getGmailClient, loadBlocklist, loadViplist, loadOklist,
                                scanAndCleanBlocklist, scanAndLabelTier) {
  async function runScan() {
    const s = loadSettings();
    if (s.schedulerEnabled) {
      try {
        await runScheduledScan(getGmailClient, loadBlocklist, loadViplist, loadOklist, scanAndCleanBlocklist, scanAndLabelTier);
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

  const esc = v => String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

  function badgeBg(label)   { if (label==="..VIP") return "#eff6ff"; if (label==="..OK") return "#f0fdf4"; return "#fef2f2"; }
  function badgeFg(label)   { if (label==="..VIP") return "#2563eb"; if (label==="..OK") return "#16a34a"; return "#dc2626"; }
  function badgeText(label) { if (label==="..VIP") return "VIP";     if (label==="..OK") return "OK";      return "Blocked"; }

  let bodyHtml;
  if (!log.length) {
    bodyHtml = `
      <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
          <tr><td align="center">
            <table cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;border-radius:12px;overflow:hidden">
              <tr><td style="background:#1e293b;padding:28px 32px">
                <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Auto-Clean Summary</div>
                <div style="color:#fff;font-size:22px;font-weight:700">Gmail Triage</div>
                <div style="color:#64748b;font-size:13px;margin-top:4px">${dateStr}</div>
              </td></tr>
              <tr><td style="background:#fff;border-radius:0 0 12px 12px;padding:48px 32px;text-align:center">
                <div style="font-size:36px;margin-bottom:12px">&#x2713;</div>
                <div style="color:#374151;font-size:16px;font-weight:600">All clear</div>
                <div style="color:#9ca3af;font-size:13px;margin-top:8px">No emails were auto-cleaned in the last 24 hours.</div>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body>`;
  } else {
    // Totals by category
    const blocklistTotal = log.filter(e => (e.labelName||".DelPend")===".DelPend").reduce((s,e)=>s+(e.moved||0),0);
    const vipTotal       = log.filter(e => e.labelName==="..VIP").reduce((s,e)=>s+(e.moved||0),0);
    const okTotal        = log.filter(e => e.labelName==="..OK" ).reduce((s,e)=>s+(e.moved||0),0);
    const totalAll       = blocklistTotal + vipTotal + okTotal;

    // Stat chips (only show non-zero)
    const chips = [
      { label:"Blocked", value:blocklistTotal, lname:".DelPend" },
      { label:"VIP",     value:vipTotal,       lname:"..VIP"    },
      { label:"OK",      value:okTotal,        lname:"..OK"     },
    ].filter(c => c.value > 0);
    const statsHtml = chips.map(c => `
      <td align="center" style="padding:0 8px">
        <table cellpadding="0" cellspacing="0" style="background:${badgeBg(c.lname)};border-radius:10px;padding:14px 24px">
          <tr><td align="center" style="font-size:30px;font-weight:700;color:${badgeFg(c.lname)};line-height:1">${c.value}</td></tr>
          <tr><td align="center" style="font-size:10px;color:${badgeFg(c.lname)};text-transform:uppercase;letter-spacing:.07em;padding-top:4px">${c.label}</td></tr>
        </table>
      </td>`).join("");

    // Group entries by run time
    const groups = {};
    for (const e of log) {
      const key = fmtTime(new Date(e.runAt));
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    }

    const runSections = Object.entries(groups).map(([time, entries]) => {
      const entryRows = entries.map((e, i) => {
        const label = e.labelName || ".DelPend";
        const searchUrl = `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(`from:${e.email} label:${label}`)}`;
        const subjectHtml = (e.subjects||[]).map(s =>
          `<div style="font-size:11px;color:#9ca3af;margin-top:2px">${esc(s)}</div>`
        ).join("");
        const reason = esc(e.reason.replace(/^⏰[^-]*-\s*/,""));
        const rowBg = i % 2 === 0 ? "#ffffff" : "#f9fafb";
        return `
          <tr style="background:${rowBg}">
            <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;vertical-align:top">
              <a href="${searchUrl}" style="color:#2563eb;font-weight:600;font-size:13px;text-decoration:none">${esc(e.email)}</a>
              ${subjectHtml}
              <div style="font-size:11px;color:#9ca3af;margin-top:3px">${reason}</div>
            </td>
            <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;vertical-align:top;text-align:right;white-space:nowrap">
              <span style="display:inline-block;background:${badgeBg(label)};color:${badgeFg(label)};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:600">${badgeText(label)}</span>
              <div style="font-size:13px;font-weight:700;color:#374151;margin-top:4px">${e.moved} labeled</div>
            </td>
          </tr>`;
      }).join("");

      return `
        <tr><td style="background:#fff;padding:0 0 8px">
          <div style="padding:14px 16px 8px;background:#f8fafc;border-top:2px solid #e2e8f0">
            <span style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em">&#9200; Run at ${esc(time)}</span>
            <span style="float:right;font-size:11px;color:#94a3b8">${entries.length} sender${entries.length!==1?"s":""} &nbsp;&#183;&nbsp; ${entries.reduce((s,e)=>s+(e.moved||0),0)} labeled</span>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0">${entryRows}</table>
        </td></tr>`;
    }).join("");

    bodyHtml = `
      <body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
          <tr><td align="center">
            <table cellpadding="0" cellspacing="0" style="max-width:580px;width:100%">

              <!-- Header -->
              <tr><td style="background:#1e293b;border-radius:12px 12px 0 0;padding:28px 32px">
                <div style="color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">Auto-Clean Summary</div>
                <div style="color:#fff;font-size:22px;font-weight:700">Gmail Triage</div>
                <div style="color:#64748b;font-size:13px;margin-top:4px">${dateStr} &nbsp;&#183;&nbsp; ${totalAll} email${totalAll!==1?"s":""} labeled</div>
              </td></tr>

              <!-- Stats -->
              <tr><td style="background:#fff;padding:20px 24px;border-bottom:2px solid #f1f5f9">
                <table cellpadding="0" cellspacing="0"><tr>${statsHtml}</tr></table>
              </td></tr>

              <!-- Run sections -->
              ${runSections}

              <!-- Footer -->
              <tr><td style="background:#f8fafc;border-radius:0 0 12px 12px;padding:14px 24px;border-top:1px solid #e2e8f0">
                <div style="color:#cbd5e1;font-size:11px;text-align:center">Gmail Triage &nbsp;&#183;&nbsp; ${dateStr}</div>
              </td></tr>

            </table>
          </td></tr>
        </table>
      </body>`;
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
  console.log(`[scheduler] daily summary sent to ${to}`);
  return true;
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
    setTimeout(runSummary, msUntilHour(6));
  }

  const ms = msUntilHour(6);
  console.log(`[scheduler] daily summary at ${fmtTime(new Date(Date.now() + ms))} (in ${Math.round(ms / 60000)} min)`);
  setTimeout(runSummary, ms);
}
