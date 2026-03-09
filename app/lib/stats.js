import fs from "fs";
import path from "path";

const STATS_PATH = path.join(process.cwd(), "stats.json");

export function loadStats() {
  try {
    const s = JSON.parse(fs.readFileSync(STATS_PATH));
    if (!s.daily) s.daily = [];
    return s;
  } catch {
    return { kept: 0, cleaned: 0, junked: 0, unsubbed: 0, vip: 0, ok: 0, daily: [] };
  }
}

export function saveStats(s) {
  fs.writeFileSync(STATS_PATH, JSON.stringify(s, null, 2));
}

export function resetStats() {
  saveStats({ kept: 0, cleaned: 0, junked: 0, unsubbed: 0, vip: 0, ok: 0, daily: [] });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function ensureTodayEntry(s) {
  const d = todayStr();
  let e = s.daily.find(e => e.date === d);
  if (!e) {
    e = { date: d, kept: 0, cleaned: 0, junked: 0, unsubbed: 0, vip: 0, ok: 0, inboxSize: null };
    s.daily.push(e);
  }
  return e;
}

export function addToStats(delta) {
  const s = loadStats();
  const today = ensureTodayEntry(s);
  for (const k of Object.keys(delta)) {
    if (k === "inboxSize") { today.inboxSize = delta.inboxSize; continue; }
    s[k] = (s[k] || 0) + delta[k];
    today[k] = (today[k] || 0) + delta[k];
  }
  saveStats(s);
  return s;
}