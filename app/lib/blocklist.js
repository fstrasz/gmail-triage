import fs from "fs";
import path from "path";
import { atomicWriteFileSync } from "./atomicWrite.js";
import { senderList } from "./senderList.js";

// Blocklist — senders routed to `.DelPend`. Uses the shared senderList factory for
// load/save/remove/match, but keeps a bespoke `add` (carries a `reason`, dedupes on
// email+name) and its own backup/restore machinery, which the VIP/OK lists don't have.
// dedupeOnLoad is OFF: the blocklist allows multiple name-scoped entries per email.
const store = senderList("blocklist.json", { dedupeOnLoad: false });

const BACKUP_PATH         = path.join(process.cwd(), "blocklist.backup.json");
const NAMED_BACKUPS_PATH  = path.join(process.cwd(), "blocklist.backups.json");

export const loadBlocklist = store.load;
export const saveBlocklist = store.save;
export const removeFromBlocklist = store.remove;
// isBlocked returns the matched entry (truthy/undefined), unlike the boolean VIP/OK matchers.
export const isBlocked = (fromEmail, fromName = null) => store.match(fromEmail, fromName);

export function resetBlocklist() {
  saveBlocklist([]);
}
export function backupBlocklist() {
  const list = loadBlocklist();
  atomicWriteFileSync(BACKUP_PATH, JSON.stringify({ list, backedUpAt: new Date().toISOString() }, null, 2));
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
  atomicWriteFileSync(NAMED_BACKUPS_PATH, JSON.stringify(backups, null, 2));
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
  atomicWriteFileSync(NAMED_BACKUPS_PATH, JSON.stringify(loadNamedBackups().filter(b => b.n !== n), null, 2));
}

export function addToBlocklist(email, reason = "junk", name = null) {
  const list = loadBlocklist();
  const key = email.toLowerCase().trim();
  const normName = name ? name.trim() : null;
  if (!list.find(e => e.email === key && (normName ? e.name === normName : !e.name)))
    list.push({ email: key, name: normName, reason, date: new Date().toISOString() });
  saveBlocklist(list);
}
