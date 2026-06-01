import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { atomicWriteFileSync } from './atomicWrite.js';

const PATH = path.join(process.cwd(), 'found-events.json');

export function loadFoundEvents() {
  try { return JSON.parse(fs.readFileSync(PATH)); } catch { return []; }
}
export function saveFoundEvents(events) {
  atomicWriteFileSync(PATH, JSON.stringify(events, null, 2));
}

// Merge new events in, deduplicating by URL (or title+date if no URL).
// Ignored events are never re-added.
export function upsertFoundEvents(newEvents) {
  const existing = loadFoundEvents();
  const ignoredUrls = new Set(existing.filter(e => e.ignored && e.url).map(e => e.url));
  const knownUrls   = new Set(existing.filter(e => e.url).map(e => e.url));
  const knownKeys   = new Set(existing.map(e => `${e.title}|${e.date}`));
  let added = 0;
  for (const ev of newEvents) {
    if (ev.url && ignoredUrls.has(ev.url)) continue;
    if (ev.url && knownUrls.has(ev.url)) continue;
    if (!ev.url && knownKeys.has(`${ev.title}|${ev.date}`)) continue;
    existing.push({ id: randomUUID(), ...ev,
      foundAt: new Date().toISOString(), ignored: false, calendarEventUrl: null });
    added++;
  }
  saveFoundEvents(existing);
  return added;
}

export function ignoreFoundEvent(id) {
  const events = loadFoundEvents();
  const idx = events.findIndex(e => e.id === id);
  if (idx >= 0) events[idx].ignored = true;
  saveFoundEvents(events);
}

export function setEventCalendarLink(id, url) {
  const events = loadFoundEvents();
  const idx = events.findIndex(e => e.id === id);
  if (idx >= 0) events[idx].calendarEventUrl = url;
  saveFoundEvents(events);
}

// Mark events ignored when their Gmail message URL no longer resolves
// (message purged → 404, or moved to Trash → drops to #all on click).
const GMAIL_MSG_URL_RE = /^https:\/\/mail\.google\.com\/mail\/u\/\d+\/#all\/([a-f0-9]+)$/i;

export async function pruneInvalidEmailEvents(gmail) {
  const events = loadFoundEvents();
  const today = new Date().toISOString().slice(0, 10);
  let modified = false;
  let skipped = 0;
  for (const e of events) {
    if (e.ignored) continue;
    const m = e.url?.match(GMAIL_MSG_URL_RE);
    if (!m) continue;
    // Skip past-date events — they're already filtered from the email at send time
    // (see scheduler.js + triage.js /events/send-email), so checking their Gmail status
    // wastes API calls. Null-date and future events are still validated.
    if (e.date && e.date < today) { skipped++; continue; }
    try {
      const res = await gmail.users.messages.get({
        userId: 'me', id: m[1], format: 'metadata', metadataHeaders: ['Subject'],
      });
      const labels = res.data.labelIds || [];
      if (labels.includes('TRASH')) { e.ignored = true; modified = true; continue; }
      const subject = (res.data.payload?.headers || []).find(h => h.name === 'Subject')?.value || '';
      if (subject.includes('Gmail Triage')) { e.ignored = true; modified = true; }
    } catch (err) {
      if (err.code === 404 || err.status === 404) { e.ignored = true; modified = true; }
      // other errors: leave the event alone
    }
  }
  if (skipped) console.log(`[foundEvents] prune: skipped ${skipped} past-date events`);
  if (modified) saveFoundEvents(events);
}
