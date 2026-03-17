import fs from "fs";
import path from "path";

// ── VIP ────────────────────────────────────────────────────────────────────────
const VIPLIST_PATH = path.join(process.cwd(), "viplist.json");

export function loadViplist() {
  try {
    const raw = JSON.parse(fs.readFileSync(VIPLIST_PATH));
    const seen = new Set();
    return raw.filter(e => {
      const k = e.email.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch { return []; }
}
export function saveViplist(list) {
  fs.writeFileSync(VIPLIST_PATH, JSON.stringify(list, null, 2));
}
export function addToViplist(email, name = null) {
  const list = loadViplist();
  const key = email.toLowerCase().trim();
  const normName = name ? name.trim() : null;
  const existing = list.find(e => e.email === key);
  if (existing) {
    if (normName && !existing.name) existing.name = normName;
  } else {
    list.push({ email: key, name: normName, date: new Date().toISOString() });
  }
  saveViplist(list);
}
export function removeFromViplist(email, name = null) {
  saveViplist(loadViplist().filter(e => e.email !== email));
}
export function isViplisted(fromEmail, fromName = null) {
  const list = loadViplist();
  const addr = fromEmail.toLowerCase().trim();
  const domain = addr.split("@")[1] || "";
  const normName = fromName ? fromName.trim() : null;
  return !!list.find(e => {
    if (e.email === "@" + domain) return true;
    if (e.email !== addr) return false;
    return !e.name || !normName || e.name === normName;
  });
}

// ── OK ─────────────────────────────────────────────────────────────────────────
const OKLIST_PATH = path.join(process.cwd(), "oklist.json");

export function loadOklist() {
  try {
    const raw = JSON.parse(fs.readFileSync(OKLIST_PATH));
    const seen = new Set();
    return raw.filter(e => {
      const k = e.email.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch { return []; }
}
export function saveOklist(list) {
  fs.writeFileSync(OKLIST_PATH, JSON.stringify(list, null, 2));
}
export function addToOklist(email, name = null) {
  const list = loadOklist();
  const key = email.toLowerCase().trim();
  const normName = name ? name.trim() : null;
  const existing = list.find(e => e.email === key);
  if (existing) {
    if (normName && !existing.name) existing.name = normName;
  } else {
    list.push({ email: key, name: normName, date: new Date().toISOString() });
  }
  saveOklist(list);
}
export function removeFromOklist(email, name = null) {
  saveOklist(loadOklist().filter(e => e.email !== email));
}
export function isOklisted(fromEmail, fromName = null) {
  const list = loadOklist();
  const addr = fromEmail.toLowerCase().trim();
  const domain = addr.split("@")[1] || "";
  const normName = fromName ? fromName.trim() : null;
  return !!list.find(e => {
    if (e.email === "@" + domain) return true;
    if (e.email !== addr) return false;
    return !e.name || !normName || e.name === normName;
  });
}
