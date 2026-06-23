import fs from "fs";
import path from "path";
import { atomicWriteFileSync } from "./atomicWrite.js";

// Factory for a JSON-backed sender list. Collapses the load/save/remove/match logic
// shared by the VIP, OK, and Blocklist modules into one place. Each consumer module
// builds a store with senderList(filename, options) and re-exports the pieces it needs
// under its own public names (e.g. loadViplist, isBlocked).
//
// Identity is name-scoped (email + display name), matching `match`: the same address
// can be listed under multiple display names, and only an exact email+name pair counts
// as a duplicate. This mirrors the Blocklist's long-standing behavior.
//
// Options:
//   dedupeOnLoad — drop exact (email+name) duplicates on load (email compared
//     case-insensitively). VIP/OK dedupe on load; the Blocklist passes false.
//
// `add` pushes a new entry unless an exact email+name pair already exists. The Blocklist
// keeps a bespoke `add` (it also carries a `reason`) and uses the factory only for
// load/save/remove/match.
export function senderList(filename, { dedupeOnLoad = true } = {}) {
  // filePath is computed lazily at each IO call so tests can chdir into a temp dir
  // and import the module once; the correct path is resolved on every read/write.
  const getPath = () => path.join(process.cwd(), filename);

  function load() {
    const filePath = getPath();
    try {
      const raw = JSON.parse(fs.readFileSync(filePath));
      if (!dedupeOnLoad) return raw;
      const seen = new Set();
      return raw.filter(e => {
        const k = e.email.toLowerCase() + "\x00" + (e.name || "");
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    } catch { return []; }
  }

  function save(list) {
    atomicWriteFileSync(getPath(), JSON.stringify(list, null, 2));
  }

  // Name-scoped when `name` is given: removes ONLY the exact email+name pair (so other
  // name-variants for the address survive — the v1.2.05 name-scoping). When `name` is
  // omitted/null, keeps the back-compat behavior of removing ALL entries for the email.
  function remove(email, name) {
    const key = email.toLowerCase().trim();
    if (name == null) {
      save(load().filter(e => e.email !== email));
      return;
    }
    const normName = name.trim();
    save(load().filter(e => !(e.email === key && (normName ? e.name === normName : !e.name))));
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
    // Name-scoped: only an exact email+name pair is a duplicate, so the same address
    // can be added under multiple display names (matches `match` and the Blocklist).
    if (!list.find(e => e.email === key && (normName ? e.name === normName : !e.name)))
      list.push({ email: key, name: normName, date: new Date().toISOString() });
    save(list);
  }

  return { get filePath() { return getPath(); }, load, save, remove, match, add };
}
