import fs from "fs";
import path from "path";

const KEPTLIST_PATH = path.join(process.cwd(), "keptlist.json");

export function loadKeptlist() {
  try { return JSON.parse(fs.readFileSync(KEPTLIST_PATH)); } catch { return []; }
}

export function saveKeptlist(list) {
  fs.writeFileSync(KEPTLIST_PATH, JSON.stringify(list, null, 2));
}

export function addToKeptlist(email, name = null) {
  const list = loadKeptlist();
  const key = email.toLowerCase().trim();
  const normName = name ? name.trim() : null;
  if (!list.find(e => e.email === key && (normName ? e.name === normName : !e.name)))
    list.push({ email: key, name: normName, date: new Date().toISOString() });
  saveKeptlist(list);
}

export function removeFromKeptlist(email, name = null) {
  const normName = name?.trim() || null;
  saveKeptlist(loadKeptlist().filter(e =>
    !(e.email === email.toLowerCase().trim() && (normName ? e.name === normName : true))
  ));
}

export function isKept(fromEmail, fromName = null) {
  const list = loadKeptlist();
  const addr = fromEmail.toLowerCase().trim();
  const domain = addr.split("@")[1] || "";
  const normName = fromName ? fromName.trim() : null;
  return !!list.find(e => {
    if (e.email === "@" + domain) return true;
    if (e.email !== addr) return false;
    return !e.name || !normName || e.name === normName;
  });
}
