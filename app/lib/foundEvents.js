import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const PATH = path.join(process.cwd(), 'found-events.json');

export function loadFoundEvents() {
  try { return JSON.parse(fs.readFileSync(PATH)); } catch { return []; }
}
export function saveFoundEvents(events) {
  fs.writeFileSync(PATH, JSON.stringify(events, null, 2));
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
