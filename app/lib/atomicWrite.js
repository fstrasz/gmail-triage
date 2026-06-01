import fs from "fs";
import path from "path";

// Atomic file write via temp + rename. POSIX rename is atomic — readers see old
// file or new file, never half-written. Prevents the load-X / save-X corruption
// risk when fs.writeFileSync is interrupted mid-flight (crash, kill -9, etc.).
//
// Synchronous to match existing saveX() call signatures across blocklist.js,
// viplist.js, settings.js, stats.js, rules.js. Drop-in replacement.
export function atomicWriteFileSync(filePath, content) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  // Unique-ish temp name within same dir (must be same filesystem for atomic rename)
  const tmp = path.join(dir, '.' + base + '.tmp-' + process.pid + '-' + Date.now());
  try {
    fs.writeFileSync(tmp, content);
    fs.renameSync(tmp, filePath);
  } catch (e) {
    // Best-effort cleanup if rename failed but tmp was written
    try { fs.unlinkSync(tmp); } catch {}
    throw e;
  }
}
