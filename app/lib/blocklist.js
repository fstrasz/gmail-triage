import fs from "fs";
import path from "path";

const BLOCKLIST_PATH      = path.join(process.cwd(), "blocklist.json");
const BACKUP_PATH         = path.join(process.cwd(), "blocklist.backup.json");
const NAMED_BACKUPS_PATH  = path.join(process.cwd(), "blocklist.backups.json");

export function loadBlocklist() {
  try { return JSON.parse(fs.readFileSync(BLOCKLIST_PATH)); } catch { return []; }
}

export function saveBlocklist(list) {
  fs.writeFileSync(BLOCKLIST_PATH, JSON.stringify(list, null, 2));
}

export function resetBlocklist() {
  saveBlocklist([]);
}
export function backupBlocklist() {
  const list = loadBlocklist();
  fs.writeFileSync(BACKUP_PATH, JSON.stringify({ list, backedUpAt: new Date().toISOString() }, null, 2));
  return list.length;
}
export function loadBlocklistBackup() {
  try { const raw = JSON.parse(fs.readFileSync(BACKUP_PATH)); return { list: raw.list || [], backedUpAt: raw.backedUpAt }; } catch { return null; }
}
function mergeInto(current, incoming) {
  const merged = [...current];
  for (const e of incoming) {
    if (!merged.find(c => c.email === e.email && (e.name ? c.name === e.name : !c.name)))
      merged.push(e);
  }
  return merged;
}
export function restoreBlocklistBackup(merge = false) {
  const backup = loadBlocklistBackup();
  if (!backup) throw new Error("No backup found");
  const list = merge ? mergeInto(loadBlocklist(), backup.list) : backup.list;
  saveBlocklist(list);
  return list.length;
}

// ─── Named backups ─────────────────────────────────────────────────────────────
export function loadNamedBackups() {
  try { return JSON.parse(fs.readFileSync(NAMED_BACKUPS_PATH)); } catch { return []; }
}
export function createNamedBackup() {
  const backups = loadNamedBackups();
  const n = backups.length ? Math.max(...backups.map(b => b.n)) + 1 : 1;
  backups.push({ n, list: loadBlocklist(), backedUpAt: new Date().toISOString() });
  fs.writeFileSync(NAMED_BACKUPS_PATH, JSON.stringify(backups, null, 2));
  return n;
}
export function restoreNamedBackup(n, merge = false) {
  const backup = loadNamedBackups().find(b => b.n === n);
  if (!backup) throw new Error(`Backup #${n} not found`);
  const list = merge ? mergeInto(loadBlocklist(), backup.list) : backup.list;
  saveBlocklist(list);
  return list.length;
}
export function deleteNamedBackup(n) {
  fs.writeFileSync(NAMED_BACKUPS_PATH, JSON.stringify(loadNamedBackups().filter(b => b.n !== n), null, 2));
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