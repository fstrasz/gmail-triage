import fs from "fs";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), "settings.json");
const DEFAULTS = {
  locations: [],
  timezone: "America/Los_Angeles",
  schedulerEnabled: true,
  schedulerStartHour: 10,
  schedulerStartMinute: 0,
  schedulerIntervalHours: 2,
  dailySummaryEnabled: false,
  dailySummaryEmail: "",
  dailySummaryDebug: false,
  dailySummaryDebugEnabledAt: null,
  lastTriageRead: null,
};

export function loadSettings() {
  try { return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH)) }; } catch { return { ...DEFAULTS }; }
}
export function saveSettings(s) {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2));
}
export function addLocation(loc) {
  const s = loadSettings();
  const trimmed = loc.trim();
  if (trimmed && !s.locations.includes(trimmed)) s.locations.push(trimmed);
  saveSettings(s);
}
export function removeLocation(loc) {
  const s = loadSettings();
  s.locations = s.locations.filter(l => l !== loc);
  saveSettings(s);
}
export function setTimezone(tz) {
  const s = loadSettings();
  s.timezone = tz.trim();
  saveSettings(s);
}
export function setScheduler(enabled, startHour, startMinute, intervalHours) {
  const s = loadSettings();
  s.schedulerEnabled = !!enabled;
  s.schedulerStartHour = parseInt(startHour);
  s.schedulerStartMinute = parseInt(startMinute) || 0;
  s.schedulerIntervalHours = parseFloat(intervalHours);
  saveSettings(s);
}
export function setDailySummary(enabled, email) {
  const s = loadSettings();
  s.dailySummaryEnabled = !!enabled;
  s.dailySummaryEmail = (email || "").trim();
  saveSettings(s);
}
export function setLastTriageRead() {
  const s = loadSettings();
  s.lastTriageRead = new Date().toISOString();
  saveSettings(s);
}
export function setDailySummaryDebug(enabled) {
  const s = loadSettings();
  s.dailySummaryDebug = !!enabled;
  s.dailySummaryDebugEnabledAt = enabled ? new Date().toISOString() : null;
  saveSettings(s);
}
