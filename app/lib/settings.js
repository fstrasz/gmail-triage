import fs from "fs";
import path from "path";

const SETTINGS_PATH = path.join(process.cwd(), "settings.json");
const DEFAULTS = { locations: [], timezone: "America/Los_Angeles" };

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
