import fs from "fs";
import path from "path";
import { atomicWriteFileSync } from "./atomicWrite.js";

const LOG_PATH = path.join(process.cwd(), "activity-log.json");
// The settings page only renders the newest 200 entries; cap a little above that so
// the "Last N events" count stays meaningful while keeping each rewrite small.
const MAX_ENTRIES = 250;

export function loadLog() {
  try { return JSON.parse(fs.readFileSync(LOG_PATH)); } catch { return []; }
}

function saveLog(entries) {
  // Compact (no pretty-print) — this file is machine-read only, never hand-edited,
  // and is rewritten on every triage action, so the smaller payload is worth it.
  atomicWriteFileSync(LOG_PATH, JSON.stringify(entries));
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
