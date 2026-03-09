import fs from "fs";
import path from "path";

const BLOCKLIST_PATH = path.join(process.cwd(), "blocklist.json");

export function loadBlocklist() {
  try { return JSON.parse(fs.readFileSync(BLOCKLIST_PATH)); } catch { return []; }
}

export function saveBlocklist(list) {
  fs.writeFileSync(BLOCKLIST_PATH, JSON.stringify(list, null, 2));
}

export function resetBlocklist() {
  saveBlocklist([]);
}

export function addToBlocklist(email, reason = "junk", name = null) {
  const list = loadBlocklist();
  const key = email.toLowerCase().trim();
  const normName = name ? name.trim() : null;
  if (!list.find(e => e.email === key && (normName ? e.name === normName : !e.name)))
    list.push({ email: key, name: normName, reason, date: new Date().toISOString() });
  saveBlocklist(list);
}

export function removeFromBlocklist(email, name = null) {
  const normName = name?.trim() || null;
  saveBlocklist(loadBlocklist().filter(e =>
    !(e.email === email && (normName ? e.name === normName : !e.name))
  ));
}

export function isBlocked(fromEmail, fromName = null) {
  const list = loadBlocklist();
  const addr = fromEmail.toLowerCase().trim();
  const domain = addr.split("@")[1] || "";
  const normName = fromName ? fromName.trim() : null;
  return list.find(e => {
    if (e.email === "@" + domain) return true;
    if (e.email !== addr) return false;
    return !e.name || !normName || e.name === normName;
  });
}