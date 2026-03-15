import fs from "fs";
import path from "path";

const LOG_PATH = path.join(process.cwd(), "activity-log.json");
const MAX_ENTRIES = 1000;

export function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH)); } catch { return []; }
}

function saveLog(entries) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2));
}

export function appendLog(entry) {
  try {
    const entries = loadLog();
    entries.unshift({ ts: new Date().toISOString(), ...entry });
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    saveLog(entries);
  } catch (e) {
    console.error("[activityLog] write failed:", e.message);
  }
}
