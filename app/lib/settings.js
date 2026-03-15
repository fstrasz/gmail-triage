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
  dailySummaryHour: 6,
  dailySummaryMinute: 0,
  dailySummaryIntervalUnit: "days",
  dailySummaryIntervalValue: 1,
  dailySummaryLastSentAt: null,
  dailySummaryDebug: false,
  dailySummaryDebugEnabledAt: null,
  lastTriageAt: null,
  listsViewMode: "table",
  eventInterests: [],
  eventsSearchEnabled: false,
  eventsSearchEmail: null,
  eventsSearchIntervalDays: 7,
  eventsSearchLastRunAt: null,
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
export function setLastTriageAt() {
  const s = loadSettings();
  s.lastTriageAt = new Date().toISOString();
  saveSettings(s);
}
export function setListsViewMode(mode) {
  const s = loadSettings();
  s.listsViewMode = mode === "compact" ? "compact" : "table";
  saveSettings(s);
}
export function setDailySummarySchedule(hour, minute, intervalUnit, intervalValue) {
  const s = loadSettings();
  s.dailySummaryHour = Math.min(23, Math.max(0, parseInt(hour) || 6));
  s.dailySummaryMinute = Math.min(59, Math.max(0, parseInt(minute) || 0));
  s.dailySummaryIntervalUnit = ["hours", "days", "weeks"].includes(intervalUnit) ? intervalUnit : "days";
  s.dailySummaryIntervalValue = Math.max(1, parseFloat(intervalValue) || 1);
  s.dailySummaryLastSentAt = null;
  saveSettings(s);
}
export function setDailySummaryLastSentAt() {
  const s = loadSettings();
  s.dailySummaryLastSentAt = new Date().toISOString();
  saveSettings(s);
}
export function addEventInterest(topic) {
  const s = loadSettings();
  const t = topic.trim();
  if (t && !s.eventInterests.includes(t)) s.eventInterests.push(t);
  saveSettings(s);
}
export function removeEventInterest(topic) {
  const s = loadSettings();
  s.eventInterests = s.eventInterests.filter(t => t !== topic);
  saveSettings(s);
}
export function updateEventInterest(oldTopic, newTopic) {
  const s = loadSettings();
  const idx = s.eventInterests.indexOf(oldTopic);
  if (idx >= 0) s.eventInterests[idx] = newTopic.trim();
  saveSettings(s);
}
export function setEventsSearchSettings(enabled, intervalDays, email) {
  const s = loadSettings();
  s.eventsSearchEnabled = !!enabled;
  s.eventsSearchIntervalDays = Math.max(1, parseInt(intervalDays) || 7);
  if (email !== undefined) s.eventsSearchEmail = email || null;
  saveSettings(s);
}
export function setEventsSearchLastRunAt() {
  const s = loadSettings();
  s.eventsSearchLastRunAt = new Date().toISOString();
  saveSettings(s);
}
export function setDailySummaryDebug(enabled) {
  const s = loadSettings();
  s.dailySummaryDebug = !!enabled;
  s.dailySummaryDebugEnabledAt = enabled ? new Date().toISOString() : null;
  saveSettings(s);
}
