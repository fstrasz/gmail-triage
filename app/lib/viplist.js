import fs from "fs";
import path from "path";

// ── VIP ────────────────────────────────────────────────────────────────────────
const VIPLIST_PATH = path.join(process.cwd(), "viplist.json");

export function loadViplist() {
  try { return JSON.parse(fs.readFileSync(VIPLIST_PATH)); } catch { return []; }
}
export function saveViplist(list) {
  fs.writeFileSync(VIPLIST_PATH, JSON.stringify(list, null, 2));
}
export function addToViplist(email, name = null) {
  const list = loadViplist();
  const key = email.toLowerCase().trim();
  const normName = name ? name.trim() : null;
  if (!list.find(e => e.email === key && (normName ? e.name === normName : !e.name)))
    list.push({ email: key, name: normName, date: new Date().toISOString() });
  saveViplist(list);
}
export function removeFromViplist(email, name = null) {
  const normName = name?.trim() || null;
  saveViplist(loadViplist().filter(e =>
    !(e.email === email && (normName ? e.name === normName : !e.name))
  ));
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
  try { return JSON.parse(fs.readFileSync(OKLIST_PATH)); } catch { return []; }
}
export function saveOklist(list) {
  fs.writeFileSync(OKLIST_PATH, JSON.stringify(list, null, 2));
}
export function addToOklist(email, name = null) {
  const list = loadOklist();
  const key = email.toLowerCase().trim();
  const normName = name ? name.trim() : null;
  if (!list.find(e => e.email === key && (normName ? e.name === normName : !e.name)))
    list.push({ email: key, name: normName, date: new Date().toISOString() });
  saveOklist(list);
}
export function removeFromOklist(email, name = null) {
  const normName = name?.trim() || null;
  saveOklist(loadOklist().filter(e =>
    !(e.email === email && (normName ? e.name === normName : !e.name))
  ));
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
