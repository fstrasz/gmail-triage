// ─── Events of Interest store (SQLite) ─────────────────────────────────────
// Backed by node:sqlite (built in from Node 22; the container base was bumped
// to node:24-alpine for it). Replaces found-events.json, which was rewritten
// whole on every upsert and had grown to 75% dead past-dated rows.
//
// WAL mode is deliberate: the EventViewer writes to this database DIRECTLY
// (operator decision), so a reader and one writer must coexist. WAL creates
// events.db-wal / events.db-shm beside the file, which is why compose mounts
// the containing DIRECTORY rather than the single file — under a single-file
// mount those sidecars land in the container's ephemeral layer and a host-side
// reader sees a stale database.
//
// The export surface is unchanged from the JSON version so no caller moved.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

// Resolved lazily, not at module load: a test that chdir()s into a temp dir
// after this module is already cached must still open the right file — the
// same lazy-path pattern settings.js and senderList.js use.
const dbDir = () => path.join(process.cwd(), "eventsdb");
const dbPath = () => path.join(dbDir(), "events.db");

const COLUMNS = [
  "id",
  "title",
  "date",
  "time",
  "location",
  "url",
  "canonicalUrl",
  "description",
  "interest",
  "configuredLocation",
  "rating",
  "pricePerPerson",
  "source",
  "foundAt",
  "ignored",
  "calendarEventUrl",
];

let _db = null;
let _dbPath = null;

function db() {
  const target = dbPath();
  // Reopen when cwd moved (tests) — a cached handle on the old path would
  // silently read the wrong database.
  if (_db && _dbPath === target) return _db;
  if (_db) _db.close();

  fs.mkdirSync(dbDir(), { recursive: true });
  const conn = new DatabaseSync(target);
  conn.exec("PRAGMA journal_mode = WAL");
  // Wait rather than throwing SQLITE_BUSY the instant the EventViewer holds
  // the write lock.
  conn.exec("PRAGMA busy_timeout = 5000");
  conn.exec(`CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    title TEXT,
    date TEXT,
    time TEXT,
    location TEXT,
    url TEXT,
    canonicalUrl TEXT,
    description TEXT,
    interest TEXT,
    configuredLocation TEXT,
    rating REAL,
    pricePerPerson TEXT,
    source TEXT,
    foundAt TEXT,
    ignored INTEGER NOT NULL DEFAULT 0,
    calendarEventUrl TEXT
  )`);
  // The two queries the EventViewer and the email both run.
  conn.exec("CREATE INDEX IF NOT EXISTS idx_events_date ON events(date)");
  conn.exec("CREATE INDEX IF NOT EXISTS idx_events_ignored ON events(ignored)");

  _db = conn;
  _dbPath = target;
  return _db;
}

// Test hook: drop the cached handle so the next call reopens.
export function closeEventsDb() {
  if (_db) _db.close();
  _db = null;
  _dbPath = null;
}

// SQLite has no boolean type; `ignored` round-trips as 0/1. Callers have
// always treated it as a boolean (`!e.ignored`), so convert at the boundary.
function rowToEvent(row) {
  return { ...row, ignored: Boolean(row.ignored) };
}

function eventToRow(ev) {
  return [
    ev.id,
    ev.title ?? null,
    ev.date ?? null,
    ev.time ?? null,
    ev.location ?? null,
    ev.url ?? null,
    ev.canonicalUrl ?? null,
    ev.description ?? null,
    ev.interest ?? null,
    ev.configuredLocation ?? null,
    ev.rating ?? null,
    ev.pricePerPerson ?? null,
    ev.source ?? null,
    ev.foundAt ?? null,
    ev.ignored ? 1 : 0,
    ev.calendarEventUrl ?? null,
  ];
}

export function loadFoundEvents() {
  try {
    // rowid order preserves insertion order, matching the JSON array the
    // callers used to receive.
    return db()
      .prepare("SELECT * FROM events ORDER BY rowid")
      .all()
      .map(rowToEvent);
  } catch {
    return [];
  }
}

// Only ever called as saveFoundEvents([]) today (Reset & Rebuild), but kept
// general: replace the whole table in one transaction.
export function saveFoundEvents(events) {
  const conn = db();
  const insert = conn.prepare(
    `INSERT INTO events (${COLUMNS.join(",")}) VALUES (${COLUMNS.map(() => "?").join(",")})`,
  );
  conn.exec("BEGIN");
  try {
    conn.exec("DELETE FROM events");
    for (const ev of events) insert.run(...eventToRow(ev));
    conn.exec("COMMIT");
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}

// Build the dedup key for an event. Email-source events from the SAME newsletter
// share the same Gmail message URL — using url alone would drop 15 of 16 events
// from a multi-event digest. Web events keep url as the key (canonical event page).
export function dedupKey(ev) {
  if (ev.url && GMAIL_MSG_URL_RE.test(ev.url)) {
    // Email-source: scope key with title (+date if present) so per-event uniqueness holds.
    return `${ev.url}|${ev.title || ""}|${ev.date || ""}`;
  }
  if (ev.url) return ev.url;
  return `${ev.title || ""}|${ev.date || ""}`;
}

// Merge new events in. Email-source events dedup by (url, title, date) so multi-event
// newsletters preserve every entry. Web events dedup by url. Ignored events stay ignored.
export function upsertFoundEvents(newEvents) {
  const conn = db();
  const existing = loadFoundEvents();
  const ignoredKeys = new Set(existing.filter((e) => e.ignored).map(dedupKey));
  const knownKeys = new Set(existing.map(dedupKey));
  const insert = conn.prepare(
    `INSERT INTO events (${COLUMNS.join(",")}) VALUES (${COLUMNS.map(() => "?").join(",")})`,
  );

  let added = 0;
  conn.exec("BEGIN");
  try {
    for (const ev of newEvents) {
      const key = dedupKey(ev);
      if (ignoredKeys.has(key)) continue;
      if (knownKeys.has(key)) continue;
      insert.run(
        ...eventToRow({
          id: randomUUID(),
          ...ev,
          foundAt: new Date().toISOString(),
          ignored: false,
          calendarEventUrl: null,
        }),
      );
      knownKeys.add(key);
      added++;
    }
    conn.exec("COMMIT");
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
  return added;
}

// NOT INTERESTED.
export function ignoreFoundEvent(id) {
  db().prepare("UPDATE events SET ignored = 1 WHERE id = ?").run(id);
}

// ADDED TO CALENDAR.
export function setEventCalendarLink(id, url) {
  db().prepare("UPDATE events SET calendarEventUrl = ? WHERE id = ?").run(url, id);
}

// Mark events ignored when their Gmail message URL no longer resolves
// (message purged → 404, or moved to Trash → drops to #all on click).
const GMAIL_MSG_URL_RE =
  /^https:\/\/mail\.google\.com\/mail\/u\/\d+\/#all\/([a-f0-9]+)$/i;

export async function pruneInvalidEmailEvents(gmail) {
  const events = loadFoundEvents();
  const today = new Date().toISOString().slice(0, 10);
  const toIgnore = [];
  let skipped = 0;

  for (const e of events) {
    if (e.ignored) continue;
    const m = e.url?.match(GMAIL_MSG_URL_RE);
    if (!m) continue;
    // Skip past-date events — they're already filtered from the email at send time
    // (see scheduler.js + triage.js /events/send-email), so checking their Gmail status
    // wastes API calls. Null-date and future events are still validated.
    if (e.date && e.date < today) {
      skipped++;
      continue;
    }
    try {
      const res = await gmail.users.messages.get({
        userId: "me",
        id: m[1],
        format: "metadata",
        metadataHeaders: ["Subject"],
      });
      const labels = res.data.labelIds || [];
      if (labels.includes("TRASH")) {
        toIgnore.push(e.id);
        continue;
      }
      const subject =
        (res.data.payload?.headers || []).find((h) => h.name === "Subject")
          ?.value || "";
      if (subject.includes("Gmail Triage")) toIgnore.push(e.id);
    } catch (err) {
      if (err.code === 404 || err.status === 404) toIgnore.push(e.id);
      // other errors: leave the event alone
    }
  }

  if (skipped)
    console.log(`[foundEvents] prune: skipped ${skipped} past-date events`);
  if (toIgnore.length) {
    const conn = db();
    const upd = conn.prepare("UPDATE events SET ignored = 1 WHERE id = ?");
    conn.exec("BEGIN");
    try {
      for (const id of toIgnore) upd.run(id);
      conn.exec("COMMIT");
    } catch (e) {
      conn.exec("ROLLBACK");
      throw e;
    }
  }
}
