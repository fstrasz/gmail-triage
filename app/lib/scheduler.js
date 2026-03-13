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
  const startHour = s.schedulerStartHour ?? 10;
  const interval  = s.schedulerIntervalHours ?? 2;
  const hours = [];
  for (let h = startHour; h < 24; h += interval) hours.push(h);

  const parts   = tzParts(new Date());
  const curHour = parseInt(parts.hour);
  const curMin  = parseInt(parts.minute);

  let nextHour = hours.find(h => h > curHour || (h === curHour && curMin < 1));
  let addDays = 0;
  if (nextHour === undefined) { nextHour = hours[0]; addDays = 1; }

  const minUntil = addDays * 24 * 60 + (nextHour - curHour) * 60 - curMin;
  return Math.max(minUntil * 60 * 1000, 60 * 1000);
}

function fmtTime(date) {
  const tz = loadSettings().timezone || "America/Los_Angeles";
  return date.toLocaleTimeString("en-US", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtDate(date) {
  const tz = loadSettings().timezone || "America/Los_Angeles";
  return date.toLocaleDateString("en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

// ─── Scheduled scan ────────────────────────────────────────────────────────────
export function startScheduler(getGmailClient, loadBlocklist, loadViplist, loadOklist,
                                scanAndCleanBlocklist, scanAndLabelTier) {
  async function runScan() {
    const s = loadSettings();
    if (s.schedulerEnabled) {
      const timeLabel = fmtTime(new Date());
      try {
        const gmail = await getGmailClient();
        const [scanClean, scanVip, scanOk] = await Promise.all([
          scanAndCleanBlocklist(gmail, loadBlocklist()),
          scanAndLabelTier(gmail, loadViplist(), "..VIP"),
          scanAndLabelTier(gmail, loadOklist(), "..OK"),
        ]);
        const results = [...scanClean, ...scanVip, ...scanOk];
        if (results.length) {
          appendToLog(results.map(r => ({ ...r, reason: `⏰ ${timeLabel} – ${r.reason}`, runAt: new Date().toISOString() })));
        }
        console.log(`[scheduler] ${timeLabel}: ${results.length} items labeled`);
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
  const subject = `Gmail Triage – Daily Auto-Clean Summary (${dateStr})`;

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
    const rows = Object.entries(groups).map(([time, entries]) => {
      const entryRows = entries.map(e =>
        `<tr><td style="padding:4px 12px;font-size:13px;color:#374151">${e.email}</td>
              <td style="padding:4px 12px;font-size:13px;color:#6b7280">${e.reason.replace(/⏰[^–]*–\s*/,"")}</td>
              <td style="padding:4px 12px;font-size:13px;text-align:right;color:#374151">${e.moved} labeled</td></tr>`
      ).join("");
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
    `Subject: ${subject}`,
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
