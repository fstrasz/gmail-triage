import fs from "fs";
import path from "path";
import { loadSettings } from "./settings.js";

const TOKEN_PATH    = path.join(process.cwd(), "token.json");
const SETTINGS_PATH = path.join(process.cwd(), "settings.json");

// I/O at the edge: gather the raw state /health needs. Kept separate from the pure
// verdict (getHealthReport) so the verdict is trivially unit-testable.
export function readHealthInputs() {
  let tokenState;
  try {
    const tok = JSON.parse(fs.readFileSync(TOKEN_PATH));
    tokenState = tok.refresh_token ? "ok" : "no_refresh_token";
  } catch {
    tokenState = "missing";
  }

  let configState;
  try {
    JSON.parse(fs.readFileSync(SETTINGS_PATH));
    configState = "ok";
  } catch (e) {
    configState = e.code === "ENOENT" ? "absent" : "corrupt"; // absent → defaults are fine
  }

  return { settings: loadSettings(), tokenState, configState };
}

// Pure: decide the 200/503 verdict from injected state. No I/O, no clock.
export function getHealthReport({ version, uptimeSec, now, settings, tokenState, configState }) {
  const checks = {};
  let ok = true;

  checks.config = configState;
  if (configState === "corrupt") ok = false;

  checks.token = tokenState;
  if (tokenState !== "ok") ok = false;

  const schedulerEnabled = settings.schedulerEnabled !== false;
  checks.scheduler = schedulerEnabled ? "enabled" : "disabled";

  const staleThresholdMin = (settings.schedulerIntervalHours ?? 2) * 60 * 2 + 30;
  const lastRun = settings.schedulerLastRunAt ? new Date(settings.schedulerLastRunAt).getTime() : null;
  const lastScanAgeMin = lastRun ? Math.round((now - lastRun) / 60000) : null;
  checks.lastScanAgeMin = lastScanAgeMin;

  if (!schedulerEnabled) {
    checks.staleness = "n/a";
  } else if (lastScanAgeMin === null) {
    if (uptimeSec / 60 > staleThresholdMin) { checks.staleness = "stale"; ok = false; }
    else checks.staleness = "warming_up";
  } else if (lastScanAgeMin > staleThresholdMin) {
    checks.staleness = "stale"; ok = false;
  } else {
    checks.staleness = "ok";
  }

  return {
    ok,
    body: {
      status: ok ? "ok" : "degraded",
      version,
      uptimeSec: Math.round(uptimeSec),
      timestamp: new Date(now).toISOString(),
      checks,
    },
  };
}
