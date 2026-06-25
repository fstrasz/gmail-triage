import fs from "fs";
import path from "path";

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

  // Single read: getHealthReport defaults each settings field it reads, so the raw
  // parsed object (or {} on failure) is sufficient — no need to also call loadSettings.
  let settings, configState;
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH));
    configState = "ok";
  } catch (e) {
    settings = {};
    configState = e.code === "ENOENT" ? "absent" : "corrupt"; // absent → defaults are fine
  }

  return { settings, tokenState, configState };
}

// Edge I/O: does the built web bundle exist? Returns the webAsset verdict string
// consumed by getHealthReport. Kept here (with the other edge I/O) so the /health
// route stays import-light and this fs call is unit-testable.
export function readWebAsset(webDist, webEnabled) {
  if (!webEnabled) return "disabled";
  return fs.existsSync(path.join(webDist, "index.html")) ? "ok" : "missing";
}

// web/dist sits at a different depth relative to triage.js depending on layout:
// locally triage.js is in app/ so the build is at ../web/dist; in the container
// triage.js is at /app/triage.js and the bundle is bind-mounted at /app/web/dist
// (a child — no "..").  Probe both and pick whichever actually holds index.html so
// /app resolves in BOTH environments. (A module-relative "../web/dist" alone was
// cwd-independent but not layout-independent — it overshot to /web/dist in prod.)
export function resolveWebDist(moduleDir) {
  const candidates = [
    path.join(moduleDir, "..", "web", "dist"), // local:     <repo>/app/triage.js -> <repo>/web/dist
    path.join(moduleDir, "web", "dist"),        // container: /app/triage.js       -> /app/web/dist
  ];
  return candidates.find((p) => fs.existsSync(path.join(p, "index.html"))) || candidates[0];
}

// Pure: decide the 200/503 verdict from injected state. No I/O, no clock.
// webAsset: 'ok' | 'missing' | 'disabled' (from caller, computed via fs.existsSync)
export function getHealthReport({ version, uptimeSec, now, settings, tokenState, configState, webAsset }) {
  const checks = {};
  let ok = true;

  checks.config = configState;
  if (configState === "corrupt") ok = false;

  checks.token = tokenState;
  if (tokenState !== "ok") ok = false;

  const schedulerEnabled = settings.schedulerEnabled !== false;
  checks.scheduler = schedulerEnabled ? "enabled" : "disabled";

  const staleThresholdMin = (settings.schedulerIntervalHours ?? 2) * 60 * 2 + 30; // 2× interval + 30 min grace
  const lastRun = settings.schedulerLastRunAt ? new Date(settings.schedulerLastRunAt).getTime() : null;
  const lastScanAgeMin = lastRun ? Math.max(0, Math.round((now - lastRun) / 60000)) : null;
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

  if (webAsset !== undefined) {
    checks.web = webAsset;
    if (webAsset === "missing") ok = false;
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
