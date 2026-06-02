import fs from "fs";
import path from "path";
import { atomicWriteFileSync } from "./atomicWrite.js";

// Factory for a JSON-backed sender list. Collapses the load/save/remove/match logic
// shared by the VIP, OK, and Blocklist modules into one place. Each consumer module
// builds a store with senderList(filename, options) and re-exports the pieces it needs
// under its own public names (e.g. loadViplist, isBlocked).
//
// Options:
//   dedupeOnLoad — drop duplicate emails (case-insensitive) when loading.
//     VIP/OK dedupe on load; the Blocklist does not (it allows name-scoped duplicates).
//
// `add` implements the VIP/OK "upgrade name on re-add" semantics. The Blocklist's add
// is different (carries a `reason`, dedupes on email+name) and stays bespoke in
// blocklist.js — that module uses the factory only for load/save/remove/match.
export function senderList(filename, { dedupeOnLoad = true } = {}) {
  const filePath = path.join(process.cwd(), filename);

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath));
      if (!dedupeOnLoad) return raw;
      const seen = new Set();
      return raw.filter(e => {
        const k = e.email.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    } catch { return []; }
  }

  function save(list) {
    atomicWriteFileSync(filePath, JSON.stringify(list, null, 2));
  }

  function remove(email) {
    save(load().filter(e => e.email !== email));
  }

  // Returns the matching entry (or undefined). `@domain` entries match any address in
  // that domain; otherwise the address must match exactly, with an optional name check.
  function match(fromEmail, fromName = null) {
    const list = load();
    const addr = fromEmail.toLowerCase().trim();
    const domain = addr.split("@")[1] || "";
    const normName = fromName ? fromName.trim() : null;
    return list.find(e => {
      if (e.email === "@" + domain) return true;
      if (e.email !== addr) return false;
      return !e.name || !normName || e.name === normName;
    });
  }

  function add(email, name = null) {
    const list = load();
    const key = email.toLowerCase().trim();
    const normName = name ? name.trim() : null;
    const existing = list.find(e => e.email === key);
    if (existing) {
      if (normName && !existing.name) existing.name = normName;
    } else {
      list.push({ email: key, name: normName, date: new Date().toISOString() });
    }
    save(list);
  }

  return { filePath, load, save, remove, match, add };
}
