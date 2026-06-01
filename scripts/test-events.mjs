// Retroactive test harness for Session 3 event-pipeline changes.
// Run with: node scripts/test-events.mjs
//
// Covers:
//   - Date filter (drops past, keeps today + future + TBD, honors ignored)
//   - TBD-after-dated sort comparator
//   - GMAIL_MSG_URL_RE pattern
//   - "Gmail Triage" self-referential subject filter
//   - Image-vision date-window sanity check
//   - pruneInvalidEmailEvents integration (mock Gmail + temp file)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const scriptDir  = path.dirname(url.fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, '..');
const foundEventsModulePath = url.pathToFileURL(
  path.join(projectDir, 'app', 'lib', 'foundEvents.js')
).href;
const unsubModulePath = url.pathToFileURL(
  path.join(projectDir, 'app', 'lib', 'unsub.js')
).href;
const htmlModulePath = url.pathToFileURL(
  path.join(projectDir, 'app', 'lib', 'html.js')
).href;
const blocklistModulePath = url.pathToFileURL(
  path.join(projectDir, 'app', 'lib', 'blocklist.js')
).href;
const viplistModulePath = url.pathToFileURL(
  path.join(projectDir, 'app', 'lib', 'viplist.js')
).href;

// ─── Pure-logic tests (no Gmail, no IO) ──────────────────────────────────────

test('date filter: keeps today and future, drops past', () => {
  const today = '2026-05-15';
  const events = [
    { title: 'Past',   date: '2026-03-26' },
    { title: 'Today',  date: '2026-05-15' },
    { title: 'Future', date: '2026-06-01' },
  ];
  const out = events.filter(e => !e.ignored && (!e.date || e.date >= today));
  assert.deepEqual(out.map(e => e.title), ['Today', 'Future']);
});

test('date filter: keeps TBD (null date), drops past', () => {
  const today = '2026-05-15';
  const events = [
    { title: 'TBD',  date: null },
    { title: 'Past', date: '2026-03-26' },
  ];
  const out = events.filter(e => !e.ignored && (!e.date || e.date >= today));
  assert.deepEqual(out.map(e => e.title), ['TBD']);
});

test('date filter: respects ignored flag independently of date', () => {
  const today = '2026-05-15';
  const events = [
    { title: 'Future-Ignored', date: '2026-06-01', ignored: true },
    { title: 'Future-Active',  date: '2026-06-01', ignored: false },
    { title: 'TBD-Ignored',    date: null,         ignored: true },
  ];
  const out = events.filter(e => !e.ignored && (!e.date || e.date >= today));
  assert.deepEqual(out.map(e => e.title), ['Future-Active']);
});

test('sort: dated chronological ascending, TBD last', () => {
  const cmp = (a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  };
  const events = [
    { title: 'TBD-A', date: null },
    { title: 'Jun',   date: '2026-06-01' },
    { title: 'May',   date: '2026-05-20' },
    { title: 'TBD-B', date: null },
    { title: 'Jul',   date: '2026-07-04' },
  ];
  events.sort(cmp);
  assert.deepEqual(events.map(e => e.title), ['May', 'Jun', 'Jul', 'TBD-A', 'TBD-B']);
});

test('gmail message url regex: matches valid forms', () => {
  const RE = /^https:\/\/mail\.google\.com\/mail\/u\/\d+\/#all\/([a-f0-9]+)$/i;
  assert.equal(
    'https://mail.google.com/mail/u/0/#all/19d541dea6836cdf'.match(RE)?.[1],
    '19d541dea6836cdf',
  );
  assert.equal(
    'https://mail.google.com/mail/u/3/#all/ABCDEF0123456789'.match(RE)?.[1],
    'ABCDEF0123456789',
  );
});

test('gmail message url regex: rejects malformed and non-Gmail URLs', () => {
  const RE = /^https:\/\/mail\.google\.com\/mail\/u\/\d+\/#all\/([a-f0-9]+)$/i;
  assert.equal(null, 'https://example.com/event'.match(RE));
  assert.equal(null, 'https://mail.google.com/mail/u/0/#inbox/abc'.match(RE));
  assert.equal(null, 'https://mail.google.com/mail/u/0/#all/xyz123'.match(RE), 'non-hex ID');
  assert.equal(null, ''.match(RE));
});

test('subject filter: "Gmail Triage" includes() catches both self-sent variants', () => {
  const isSelfReferential = subject => (subject || '').includes('Gmail Triage');
  assert.ok( isSelfReferential('Gmail Triage - Upcoming Events (May 15, 2026)'));
  assert.ok( isSelfReferential('Gmail Triage - Daily Auto-Clean Summary (May 15, 2026)'));
  assert.ok(!isSelfReferential("Mother's Day Brunch at the Vineyard"));
  assert.ok(!isSelfReferential('Re: meeting on Friday'));
  assert.ok(!isSelfReferential(''));
});

test('image-vision date window: accepts in-range, rejects out-of-range or pre-today', () => {
  const today = '2026-05-15';
  const horizon = '2026-08-13';
  const accept = c => c >= today && c <= horizon;
  assert.ok( accept('2026-05-15'), 'today inclusive');
  assert.ok( accept('2026-08-13'), 'horizon inclusive');
  assert.ok( accept('2026-06-01'), 'mid-window');
  assert.ok(!accept('2026-05-14'), 'one day before today');
  assert.ok(!accept('2026-08-14'), 'one day after horizon');
  assert.ok(!accept('2025-12-31'), 'prior year');
});

// ─── pruneInvalidEmailEvents integration (mock Gmail + temp cwd) ─────────────

// ─── Canonical-link extraction pure-logic tests ──────────────────────────────

test('view-in-browser regex: matches common phrasings', () => {
  const RE = /\b(view\s+(this\s+)?(email|message)?\s*(in\s+(your\s+|a\s+)?browser|as\s+(a\s+)?web\s*page|online|in\s+a\s+browser)|trouble\s+viewing|having\s+trouble\s+viewing|see\s+(it|this)\s+in\s+your\s+browser)\b/i;
  assert.ok(RE.test('View this email in your browser'));
  assert.ok(RE.test('View in browser'));
  assert.ok(RE.test('view as web page'));
  assert.ok(RE.test('View Online'));
  assert.ok(RE.test('Having trouble viewing? Click here'));
  assert.ok(RE.test('See it in your browser'));
  assert.ok(!RE.test('Register'));
  assert.ok(!RE.test('Get Tickets'));
  assert.ok(!RE.test('View Event Details')); // 'view' alone, no browser/online/web cue
});

test('extractAnchors: pulls href + cleaned text, only http(s)', () => {
  const html = `
    <p>Hello.</p>
    <a href="https://example.com/event">Register Now</a>
    <a href="mailto:foo@bar.com">Email us</a>
    <a href="tel:+15555551212">Call us</a>
    <a href="https://example.com/two"><span style="color:red">Click&nbsp;here</span></a>
    <a href="HTTP://EXAMPLE.COM/THREE">  Spaced \n text  </a>
  `;
  const RE = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const anchors = [];
  let m;
  while ((m = RE.exec(html)) !== null) {
    const href = m[1].trim();
    if (!/^https?:\/\//i.test(href)) continue;
    const text = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    anchors.push({ href, text });
  }
  assert.equal(anchors.length, 3);
  assert.equal(anchors[0].href, 'https://example.com/event');
  assert.equal(anchors[0].text, 'Register Now');
  assert.equal(anchors[1].text, 'Click here');
  assert.equal(anchors[2].text, 'Spaced text');
});

test('source-icon predicate: shown only when source=email AND no canonicalUrl', () => {
  const shouldShowEmailIcon = e => e.source === 'email' && !e.canonicalUrl;
  assert.ok( shouldShowEmailIcon({ source: 'email', url: 'gmail-url' }), 'email-source without canonical → icon');
  assert.ok(!shouldShowEmailIcon({ source: 'email', url: 'gmail-url', canonicalUrl: 'https://example.com/event' }), 'email-source WITH canonical → NO icon');
  assert.ok( shouldShowEmailIcon({ source: 'email', canonicalUrl: '' }), 'empty-string canonical is falsy → icon shows');
  assert.ok(!shouldShowEmailIcon({ source: 'web' }), 'non-email source → no icon');
  assert.ok(!shouldShowEmailIcon({}), 'no source → no icon');
});

test('noise filter: rejects unsubscribe + social hosts', () => {
  const NOISE_TEXT = [/\bunsubscribe\b/i, /\bopt[- ]out\b/i, /\bprivacy\s+policy\b/i];
  const NOISE_HOST = [/facebook\.com/i, /twitter\.com/i];
  const isNoise = a => {
    if (a.text && NOISE_TEXT.some(p => p.test(a.text))) return true;
    try { return NOISE_HOST.some(p => p.test(new URL(a.href).host)); }
    catch { return true; }
  };
  assert.ok( isNoise({ href: 'https://example.com/u', text: 'Unsubscribe' }));
  assert.ok( isNoise({ href: 'https://facebook.com/event/123', text: 'Share' }));
  assert.ok( isNoise({ href: 'not-a-url', text: 'broken' }));
  assert.ok(!isNoise({ href: 'https://localwineevents.com/c/abc', text: 'Get Tickets' }));
});

// ─── Pass-2 batching helpers ─────────────────────────────────────────────────

const eventSearchModulePath = url.pathToFileURL(
  path.join(projectDir, 'app', 'lib', 'eventSearch.js')
).href;

test('estimateTokens: ~chars/4 rounded up', async () => {
  const { estimateTokens } = await import(eventSearchModulePath);
  assert.equal(estimateTokens(''), 0);
  assert.equal(estimateTokens('1234'), 1);
  assert.equal(estimateTokens('12345'), 2);
  assert.equal(estimateTokens('a'.repeat(4000)), 1000);
});

test('batchByTokenBudget: packs greedily, opens new batch when budget would be exceeded', async () => {
  const { batchByTokenBudget } = await import(eventSearchModulePath);
  const items = [
    { id: 'a', tokens: 4000 },
    { id: 'b', tokens: 4000 },
    { id: 'c', tokens: 4000 },
    { id: 'd', tokens: 4000 },
  ];
  const batches = batchByTokenBudget(items, i => i.tokens, 9000);
  // First batch: a+b = 8000 (fits); adding c would be 12000 > 9000 → new batch
  assert.equal(batches.length, 2);
  assert.deepEqual(batches[0].map(b => b.id), ['a', 'b']);
  assert.deepEqual(batches[1].map(b => b.id), ['c', 'd']);
});

test('batchByTokenBudget: single oversized item gets its own batch', async () => {
  const { batchByTokenBudget } = await import(eventSearchModulePath);
  const items = [
    { id: 'huge', tokens: 50_000 },
    { id: 'small', tokens: 100 },
  ];
  const batches = batchByTokenBudget(items, i => i.tokens, 10_000);
  // huge exceeds budget but goes in its own batch (current is empty so it's allowed)
  // then small starts a new batch because adding it would exceed (huge already there)
  assert.equal(batches.length, 2);
  assert.deepEqual(batches[0].map(b => b.id), ['huge']);
  assert.deepEqual(batches[1].map(b => b.id), ['small']);
});

test('batchByTokenBudget: empty input → empty batches', async () => {
  const { batchByTokenBudget } = await import(eventSearchModulePath);
  assert.deepEqual(batchByTokenBudget([], i => i.tokens, 10_000), []);
});

test('batchByTokenBudget: everything fits in one batch', async () => {
  const { batchByTokenBudget } = await import(eventSearchModulePath);
  const items = [{ id: 'a', t: 100 }, { id: 'b', t: 100 }, { id: 'c', t: 100 }];
  const batches = batchByTokenBudget(items, i => i.t, 10_000);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].length, 3);
});

test('batchByTokenBudget: max-count cap triggers new batch even when tokens fit', async () => {
  const { batchByTokenBudget } = await import(eventSearchModulePath);
  // 5 items, each 100 tokens. Budget 10k (plenty). maxCount 2.
  const items = Array.from({ length: 5 }, (_, i) => ({ id: `i${i}`, t: 100 }));
  const batches = batchByTokenBudget(items, i => i.t, 10_000, 2);
  assert.equal(batches.length, 3, 'expect ceil(5/2) = 3 batches');
  assert.equal(batches[0].length, 2);
  assert.equal(batches[1].length, 2);
  assert.equal(batches[2].length, 1);
});

test('batchByTokenBudget: max-count Infinity (default) keeps old behavior', async () => {
  const { batchByTokenBudget } = await import(eventSearchModulePath);
  const items = Array.from({ length: 50 }, (_, i) => ({ id: `i${i}`, t: 10 }));
  const batches = batchByTokenBudget(items, i => i.t, 10_000);
  assert.equal(batches.length, 1, '50 items × 10 tokens = 500 tokens, all fit, default no-count-cap');
});

// ─── scoreCandidateByTitle: bubbles title-matching URLs to top ───────────────

test('scoreCandidateByTitle: URL contains all meaningful words → high score', async () => {
  const { scoreCandidateByTitle } = await import(eventSearchModulePath);
  const s = scoreCandidateByTitle(
    { href: 'https://x.ticketspice.com/hands-on-pasta-making-2026', text: 'TICKETS' },
    'Hands-On Pasta Making Class',
  );
  // hands, pasta, making → 3 meaningful words × 2 (in URL) = 6
  assert.equal(s, 6);
});

test('scoreCandidateByTitle: URL with no overlap → 0', async () => {
  const { scoreCandidateByTitle } = await import(eventSearchModulePath);
  assert.equal(scoreCandidateByTitle({ href: 'https://x.com/random/path', text: '' }, 'Hands-On Pasta Making Class'), 0);
});

test('scoreCandidateByTitle: anchor text adds 1 per word', async () => {
  const { scoreCandidateByTitle } = await import(eventSearchModulePath);
  const s = scoreCandidateByTitle(
    { href: 'https://x.com/event', text: 'Hands On Pasta Making' },
    'Hands-On Pasta Making Class',
  );
  // hands, pasta, making in text only → 3 × 1 = 3
  assert.equal(s, 3);
});

test('scoreCandidateByTitle: empty/stopword title → 0', async () => {
  const { scoreCandidateByTitle } = await import(eventSearchModulePath);
  assert.equal(scoreCandidateByTitle({ href: 'https://x.com', text: 'TICKETS' }, ''), 0);
  assert.equal(scoreCandidateByTitle({ href: 'https://x.com', text: 'TICKETS' }, 'The And Of'), 0);
});

test('pickCanonicalFromCandidates: empty list → kind none', async () => {
  const { pickCanonicalFromCandidates } = await import(eventSearchModulePath);
  assert.equal(pickCanonicalFromCandidates([], 'Anything').kind, 'none');
  assert.equal(pickCanonicalFromCandidates(null, 'Anything').kind, 'none');
});

test('pickCanonicalFromCandidates: single candidate → kind direct (no Claude)', async () => {
  const { pickCanonicalFromCandidates } = await import(eventSearchModulePath);
  const r = pickCanonicalFromCandidates([{ href: 'https://x.com/only', text: 'TICKETS' }], 'Event');
  assert.equal(r.kind, 'direct');
  assert.equal(r.href, 'https://x.com/only');
});

test('pickCanonicalFromCandidates: clear-winner score ≥ 4 → kind direct', async () => {
  const { pickCanonicalFromCandidates } = await import(eventSearchModulePath);
  const cands = [
    { href: 'https://x.com/header', text: 'Home' },
    { href: 'https://x.com/hands-on-pasta-making-2026', text: 'TICKETS' },
    { href: 'https://x.com/footer', text: 'Footer' },
  ];
  const r = pickCanonicalFromCandidates(cands, 'Hands-On Pasta Making Class');
  assert.equal(r.kind, 'direct');
  assert.equal(r.href, 'https://x.com/hands-on-pasta-making-2026');
  assert.equal(r.score, 6);
});

test('pickCanonicalFromCandidates: tied top scores → kind ambiguous (Claude picks)', async () => {
  const { pickCanonicalFromCandidates } = await import(eventSearchModulePath);
  const cands = [
    { href: 'https://x.com/wine-dinner-2026', text: 'TICKETS' },
    { href: 'https://x.com/wine-dinner-archive', text: 'View past' },
    { href: 'https://x.com/footer', text: 'Footer' },
  ];
  const r = pickCanonicalFromCandidates(cands, 'Wine Dinner');
  // both first candidates score 4 ("wine" + "dinner" in URL = 2×2); ambiguous
  assert.equal(r.kind, 'ambiguous');
});

test('pickCanonicalFromCandidates: top score below threshold → kind ambiguous', async () => {
  const { pickCanonicalFromCandidates } = await import(eventSearchModulePath);
  // Single-word title overlap → score 2, below threshold of 4
  const cands = [
    { href: 'https://tr.example.com/click/abc123', text: 'TICKETS' },
    { href: 'https://x.com/header', text: 'Home' },
  ];
  const r = pickCanonicalFromCandidates(cands, 'Tickets Wine Dinner');
  assert.equal(r.kind, 'ambiguous');
});

test('pickCanonicalFromCandidates: ambiguous returns ranked + capped candidates', async () => {
  const { pickCanonicalFromCandidates } = await import(eventSearchModulePath);
  const cands = Array.from({ length: 100 }, (_, i) => ({ href: 'https://x.com/p' + i, text: 'Link ' + i }));
  const r = pickCanonicalFromCandidates(cands, 'Untitled', { maxClaudeCandidates: 10 });
  assert.equal(r.kind, 'ambiguous');
  assert.equal(r.candidates.length, 10);
});

test('scoreCandidateByTitle: ranking puts target URL first among many', async () => {
  const { scoreCandidateByTitle } = await import(eventSearchModulePath);
  const candidates = [
    { href: 'https://x.com/header-logo', text: 'Home' },
    { href: 'https://x.com/footer', text: 'Footer' },
    { href: 'https://x.com/chefs-kitchen-dining-2026', text: 'TICKETS' },
    { href: 'https://x.com/hands-on-pasta-making-2026', text: 'TICKETS' },
    { href: 'https://x.com/sangria-festival-2026', text: 'TICKETS' },
  ];
  const ranked = candidates
    .map(c => ({ ...c, score: scoreCandidateByTitle(c, 'Hands-On Pasta Making Class') }))
    .sort((a, b) => b.score - a.score);
  assert.equal(ranked[0].href, 'https://x.com/hands-on-pasta-making-2026', 'pasta URL bubbles to top');
});

// ─── shouldSkipWebSearch: 24h rolling gate ───────────────────────────────────

test('shouldSkipWebSearch: never ran → do not skip', async () => {
  const { shouldSkipWebSearch } = await import(eventSearchModulePath);
  assert.equal(shouldSkipWebSearch(Date.now(), null), false);
  assert.equal(shouldSkipWebSearch(Date.now(), undefined), false);
  assert.equal(shouldSkipWebSearch(Date.now(), ''), false);
});

test('shouldSkipWebSearch: last ran <24h ago → skip', async () => {
  const { shouldSkipWebSearch } = await import(eventSearchModulePath);
  const now = Date.UTC(2026, 4, 15, 12, 0, 0);
  const lastRun = new Date(now - 23 * 3600 * 1000).toISOString();
  assert.equal(shouldSkipWebSearch(now, lastRun), true);
});

test('shouldSkipWebSearch: last ran exactly 24h ago → do not skip', async () => {
  const { shouldSkipWebSearch } = await import(eventSearchModulePath);
  const now = Date.UTC(2026, 4, 15, 12, 0, 0);
  const lastRun = new Date(now - 24 * 3600 * 1000).toISOString();
  assert.equal(shouldSkipWebSearch(now, lastRun), false);
});

test('shouldSkipWebSearch: last ran >24h ago → do not skip', async () => {
  const { shouldSkipWebSearch } = await import(eventSearchModulePath);
  const now = Date.UTC(2026, 4, 15, 12, 0, 0);
  const lastRun = new Date(now - 25 * 3600 * 1000).toISOString();
  assert.equal(shouldSkipWebSearch(now, lastRun), false);
});

test('shouldSkipWebSearch: malformed timestamp → do not skip', async () => {
  const { shouldSkipWebSearch } = await import(eventSearchModulePath);
  assert.equal(shouldSkipWebSearch(Date.now(), 'not-a-date'), false);
});

test('shouldSkipWebSearch: custom interval honored', async () => {
  const { shouldSkipWebSearch } = await import(eventSearchModulePath);
  const now = Date.UTC(2026, 4, 15, 12, 0, 0);
  const oneHourAgo = new Date(now - 3600 * 1000).toISOString();
  // 30 min interval → 1h ago does NOT skip
  assert.equal(shouldSkipWebSearch(now, oneHourAgo, 30 * 60 * 1000), false);
  // 2h interval → 1h ago DOES skip
  assert.equal(shouldSkipWebSearch(now, oneHourAgo, 2 * 60 * 60 * 1000), true);
});

// ─── sortGroupKeysByLocationOrder: stable group ordering ─────────────────────

test('sortGroupKeysByLocationOrder: respects configured locations order', async () => {
  const { sortGroupKeysByLocationOrder } = await import(eventSearchModulePath);
  const out = sortGroupKeysByLocationOrder(
    ['Temecula, CA', 'Las Vegas, NV'],
    ['Las Vegas, NV', 'Temecula, CA'],
  );
  assert.deepEqual(out, ['Las Vegas, NV', 'Temecula, CA']);
});

test('sortGroupKeysByLocationOrder: unknown keys fall to end, alphabetical', async () => {
  const { sortGroupKeysByLocationOrder } = await import(eventSearchModulePath);
  const out = sortGroupKeysByLocationOrder(
    ['Other', 'Zurich', 'Las Vegas, NV', 'Aspen', 'Temecula, CA'],
    ['Las Vegas, NV', 'Temecula, CA'],
  );
  assert.deepEqual(out, ['Las Vegas, NV', 'Temecula, CA', 'Aspen', 'Other', 'Zurich']);
});

test('sortGroupKeysByLocationOrder: empty configured → pure alphabetical', async () => {
  const { sortGroupKeysByLocationOrder } = await import(eventSearchModulePath);
  const out = sortGroupKeysByLocationOrder(['Temecula, CA', 'Las Vegas, NV', 'Other'], []);
  assert.deepEqual(out, ['Las Vegas, NV', 'Other', 'Temecula, CA']);
});

test('sortGroupKeysByLocationOrder: does not mutate input array', async () => {
  const { sortGroupKeysByLocationOrder } = await import(eventSearchModulePath);
  const input = ['Temecula, CA', 'Las Vegas, NV'];
  const copy = [...input];
  sortGroupKeysByLocationOrder(input, ['Las Vegas, NV', 'Temecula, CA']);
  assert.deepEqual(input, copy, 'input should be unchanged');
});

// ─── getEmailBodyText: longer-wins picker (fixes The Juice text/plain stub bug) ─

function makePayload({ plain, html }) {
  const parts = [];
  if (plain != null) parts.push({
    mimeType: 'text/plain',
    body: { data: Buffer.from(plain, 'utf-8').toString('base64') },
  });
  if (html != null) parts.push({
    mimeType: 'text/html',
    body: { data: Buffer.from(html, 'utf-8').toString('base64') },
  });
  return { mimeType: 'multipart/alternative', parts };
}

test('getEmailBodyText: stripped-html longer than plain → returns stripped html (The Juice case)', async () => {
  const { getEmailBodyText } = await import(eventSearchModulePath);
  const plain = 'Hi Frank. Here is a list of upcoming events.\nLink: https://example.com';
  const html  = '<html><body>' +
    Array.from({length: 16}, (_, i) => `<div>May ${15 + (i % 3)}, 2026 (Fri)<br>Event ${i+1}: Wine Tasting</div>`).join('') +
    '</body></html>';
  const out = getEmailBodyText(makePayload({ plain, html }));
  assert.ok(out.includes('Event 1: Wine Tasting'), 'should contain html-derived event listings');
  assert.ok(out.length > plain.length, 'should be longer than plain stub');
});

test('getEmailBodyText: plain longer than stripped html → returns plain', async () => {
  const { getEmailBodyText } = await import(eventSearchModulePath);
  const plain = 'A'.repeat(2000);
  const html  = '<html><body>short</body></html>';
  const out = getEmailBodyText(makePayload({ plain, html }));
  assert.equal(out, plain);
});

test('getEmailBodyText: only html → returns stripped html', async () => {
  const { getEmailBodyText } = await import(eventSearchModulePath);
  const out = getEmailBodyText(makePayload({ html: '<p>Hello <strong>world</strong></p>' }));
  assert.ok(out.includes('Hello'));
  assert.ok(out.includes('world'));
  assert.ok(!out.includes('<strong>'));
});

test('getEmailBodyText: only plain → returns plain', async () => {
  const { getEmailBodyText } = await import(eventSearchModulePath);
  const out = getEmailBodyText(makePayload({ plain: 'just plain text' }));
  assert.equal(out, 'just plain text');
});

test('getEmailBodyText: neither part → empty string', async () => {
  const { getEmailBodyText } = await import(eventSearchModulePath);
  assert.equal(getEmailBodyText({ mimeType: 'text/plain', parts: [] }), '');
});

test('extractJsonArray: clean array', async () => {
  const { extractJsonArray } = await import(eventSearchModulePath);
  assert.equal(extractJsonArray('[1,2,3]'), '[1,2,3]');
  assert.equal(extractJsonArray('[]'), '[]');
});

test('extractJsonArray: array with preamble and postamble', async () => {
  const { extractJsonArray } = await import(eventSearchModulePath);
  assert.equal(extractJsonArray('Here you go: [1,2,3] hope that helps'), '[1,2,3]');
  assert.equal(extractJsonArray('Sure!\n[]\n'), '[]');
});

test('extractJsonArray: bracket inside string literal does not confuse', async () => {
  const { extractJsonArray } = await import(eventSearchModulePath);
  const s = 'reply: [{"url":"https://a.b/[xyz]","title":"hi"}]';
  assert.equal(extractJsonArray(s), '[{"url":"https://a.b/[xyz]","title":"hi"}]');
});

test('extractJsonArray: escaped quote in string', async () => {
  const { extractJsonArray } = await import(eventSearchModulePath);
  const s = '[{"title":"He said \\"hi\\"","date":"2026-05-15"}]';
  assert.equal(extractJsonArray(s), s);
});

test('extractJsonArray: nested arrays', async () => {
  const { extractJsonArray } = await import(eventSearchModulePath);
  assert.equal(extractJsonArray('intro [[1,2],[3,4]] outro'), '[[1,2],[3,4]]');
});

test('extractJsonArray: returns null when no array', async () => {
  const { extractJsonArray } = await import(eventSearchModulePath);
  assert.equal(extractJsonArray('no array here'), null);
  assert.equal(extractJsonArray(''), null);
  assert.equal(extractJsonArray(null), null);
});

test('extractJsonArray: returns null when unbalanced', async () => {
  const { extractJsonArray } = await import(eventSearchModulePath);
  assert.equal(extractJsonArray('start [1,2 no close'), null);
});

test('pruneInvalidEmailEvents: TRASH, 404, and self-subject all flip ignored=true; others kept', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-triage-test-'));
  const origCwd = process.cwd();
  process.chdir(tmpDir);
  try {
    const initial = [
      { id: '1', title: 'Active',   url: 'https://mail.google.com/mail/u/0/#all/aaa111', ignored: false },
      { id: '2', title: 'Trashed',  url: 'https://mail.google.com/mail/u/0/#all/bbb222', ignored: false },
      { id: '3', title: 'Purged',   url: 'https://mail.google.com/mail/u/0/#all/ccc333', ignored: false },
      { id: '4', title: 'Self-ref', url: 'https://mail.google.com/mail/u/0/#all/ddd444', ignored: false },
      { id: '5', title: 'WebEvt',   url: 'https://example.com/event',                   ignored: false },
      { id: '6', title: 'AlreadyIgnored', url: 'https://mail.google.com/mail/u/0/#all/eee555', ignored: true },
    ];
    fs.writeFileSync('found-events.json', JSON.stringify(initial, null, 2));

    const mockGmail = {
      users: {
        messages: {
          get: async ({ id }) => {
            if (id === 'aaa111') return { data: { labelIds: ['INBOX'], payload: { headers: [{ name: 'Subject', value: "Mother's Day brunch" }] } } };
            if (id === 'bbb222') return { data: { labelIds: ['TRASH'], payload: { headers: [{ name: 'Subject', value: 'Old event' }] } } };
            if (id === 'ccc333') { const e = new Error('not found'); e.code = 404; throw e; }
            if (id === 'ddd444') return { data: { labelIds: ['INBOX'], payload: { headers: [{ name: 'Subject', value: 'Gmail Triage - Upcoming Events (May 14, 2026)' }] } } };
            if (id === 'eee555') { throw new Error('should never be called: already-ignored event must be skipped'); }
            throw new Error('unexpected id: ' + id);
          },
        },
      },
    };

    const { pruneInvalidEmailEvents } = await import(foundEventsModulePath);
    await pruneInvalidEmailEvents(mockGmail);

    const after = JSON.parse(fs.readFileSync('found-events.json'));
    const by = id => after.find(e => e.id === id);
    assert.equal(by('1').ignored, false, 'active stays');
    assert.equal(by('2').ignored, true,  'TRASH-labeled flipped');
    assert.equal(by('3').ignored, true,  '404 flipped');
    assert.equal(by('4').ignored, true,  'self-referential subject flipped');
    assert.equal(by('5').ignored, false, 'non-Gmail URL skipped');
    assert.equal(by('6').ignored, true,  'already-ignored unchanged');
  } finally {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('pruneInvalidEmailEvents: transient API error leaves event untouched', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-triage-test-'));
  const origCwd = process.cwd();
  process.chdir(tmpDir);
  try {
    const initial = [
      { id: '1', title: 'Survives 500', url: 'https://mail.google.com/mail/u/0/#all/aaa111', ignored: false },
    ];
    fs.writeFileSync('found-events.json', JSON.stringify(initial, null, 2));

    const mockGmail = {
      users: {
        messages: {
          get: async () => {
            const e = new Error('backend unavailable');
            e.code = 503;
            throw e;
          },
        },
      },
    };

    const { pruneInvalidEmailEvents } = await import(foundEventsModulePath);
    await pruneInvalidEmailEvents(mockGmail);

    const after = JSON.parse(fs.readFileSync('found-events.json'));
    assert.equal(after[0].ignored, false, '503 must not flip ignored');
  } finally {
    process.chdir(origCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ─── sanitizeUrl: SSRF guard (backing CodeQL alert W1 dismissed) ─────────────

test('sanitizeUrl: accepts public http/https URLs', async () => {
  const { sanitizeUrl } = await import(unsubModulePath);
  assert.equal(sanitizeUrl('https://example.com/unsub'), 'https://example.com/unsub');
  assert.equal(sanitizeUrl('http://example.com/unsub'), 'http://example.com/unsub');
  assert.equal(sanitizeUrl('https://list-manage.com/unsubscribe?u=123'), 'https://list-manage.com/unsubscribe?u=123');
});

test('sanitizeUrl: rejects non-http(s) protocols', async () => {
  const { sanitizeUrl } = await import(unsubModulePath);
  assert.equal(sanitizeUrl('javascript:alert(1)'), null);
  assert.equal(sanitizeUrl('file:///etc/passwd'), null);
  assert.equal(sanitizeUrl('ftp://internal.corp/file'), null);
  assert.equal(sanitizeUrl('data:text/html,<script>'), null);
});

test('sanitizeUrl: rejects localhost and loopback', async () => {
  const { sanitizeUrl } = await import(unsubModulePath);
  assert.equal(sanitizeUrl('http://localhost/admin'), null);
  assert.equal(sanitizeUrl('http://localhost:8080/x'), null);
  assert.equal(sanitizeUrl('http://[::1]/admin'), null);
  assert.equal(sanitizeUrl('http://127.0.0.1/admin'), null);
  assert.equal(sanitizeUrl('http://127.1.2.3/admin'), null);
});

test('sanitizeUrl: rejects RFC1918 private ranges', async () => {
  const { sanitizeUrl } = await import(unsubModulePath);
  assert.equal(sanitizeUrl('http://10.0.0.1/'), null);
  assert.equal(sanitizeUrl('http://10.255.255.255/'), null);
  assert.equal(sanitizeUrl('http://172.16.0.1/'), null);
  assert.equal(sanitizeUrl('http://172.20.5.5/'), null);
  assert.equal(sanitizeUrl('http://172.31.255.255/'), null);
  assert.equal(sanitizeUrl('http://192.168.1.1/'), null);
  assert.equal(sanitizeUrl('http://192.168.20.10/'), null);
});

test('sanitizeUrl: 172.16/12 boundary correct — 172.15 and 172.32 are public', async () => {
  const { sanitizeUrl } = await import(unsubModulePath);
  assert.equal(sanitizeUrl('http://172.15.0.1/'), 'http://172.15.0.1/');
  assert.equal(sanitizeUrl('http://172.32.0.1/'), 'http://172.32.0.1/');
});

test('sanitizeUrl: rejects link-local 169.254/16 (AWS/Azure metadata)', async () => {
  const { sanitizeUrl } = await import(unsubModulePath);
  assert.equal(sanitizeUrl('http://169.254.169.254/latest/meta-data/'), null);
  assert.equal(sanitizeUrl('http://169.254.0.1/'), null);
});

test('sanitizeUrl: rejects .local and .internal TLDs', async () => {
  const { sanitizeUrl } = await import(unsubModulePath);
  assert.equal(sanitizeUrl('http://server.local/'), null);
  assert.equal(sanitizeUrl('http://api.internal/'), null);
  assert.equal(sanitizeUrl('http://printer.local:631/'), null);
});

test('sanitizeUrl: rejects malformed URLs', async () => {
  const { sanitizeUrl } = await import(unsubModulePath);
  assert.equal(sanitizeUrl(''), null);
  assert.equal(sanitizeUrl('not a url'), null);
  assert.equal(sanitizeUrl(null), null);
  assert.equal(sanitizeUrl(undefined), null);
});

test('sanitizeUrl: case-insensitive hostname matching', async () => {
  const { sanitizeUrl } = await import(unsubModulePath);
  assert.equal(sanitizeUrl('http://LOCALHOST/'), null);
  assert.equal(sanitizeUrl('http://Server.LOCAL/'), null);
});

test('sanitizeUrl: returns reconstructed href (breaks CodeQL taint)', async () => {
  const { sanitizeUrl } = await import(unsubModulePath);
  // CodeQL SSRF taint analysis requires returned value to be reconstructed from URL parsing,
  // not the raw input string. Verify by trailing-slash normalization.
  assert.equal(sanitizeUrl('https://example.com'), 'https://example.com/');
});

// ─── esc / safe: XSS escape helpers (backing CodeQL alerts F6, F8) ───────────

test('esc: replaces ampersand, lt, gt, quote correctly', async () => {
  const { esc } = await import(htmlModulePath);
  assert.equal(esc('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.equal(esc('A & B'), 'A &amp; B');
  assert.equal(esc('quote: "hi"'), 'quote: &quot;hi&quot;');
  assert.equal(esc('mix <"&>'), 'mix &lt;&quot;&amp;&gt;');
});

test('esc: ampersand escaped first (no double-escape)', async () => {
  const { esc } = await import(htmlModulePath);
  assert.equal(esc('<a>'), '&lt;a&gt;');
  assert.equal(esc('&lt;'), '&amp;lt;');
});

test('esc: empty/falsy inputs return empty string', async () => {
  const { esc } = await import(htmlModulePath);
  assert.equal(esc(''), '');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '');
});

test('esc: numbers and booleans coerced to string', async () => {
  const { esc } = await import(htmlModulePath);
  assert.equal(esc(42), '42');
  assert.equal(esc(true), 'true');
});

test('safe: escapes backslash and single quote for JS string literals', async () => {
  const { safe } = await import(htmlModulePath);
  assert.equal(safe("O'Brien"), "O\\'Brien");
  assert.equal(safe("path\\to\\file"), "path\\\\to\\\\file");
  assert.equal(safe("both\\and'mix"), "both\\\\and\\'mix");
});

test('safe: backslash escaped before quote (no double-escape)', async () => {
  const { safe } = await import(htmlModulePath);
  assert.equal(safe("\\'"), "\\\\\\'");
});

test('safe: empty/falsy inputs return empty string', async () => {
  const { safe } = await import(htmlModulePath);
  assert.equal(safe(''), '');
  assert.equal(safe(null), '');
  assert.equal(safe(undefined), '');
});

test('safe: does NOT escape double quotes (single-quote context only)', async () => {
  const { safe } = await import(htmlModulePath);
  assert.equal(safe('"quoted"'), '"quoted"');
});

// ─── List matchers: isBlocked / isViplisted / isOklisted ─────────────────────
// NOTE: blocklist.js and viplist.js cache `path.join(process.cwd(), '...')` at module-import
// time. concurrent top-level tests + chdir races would fight; bundle every list-matcher
// assertion into one serial test that chdirs once, imports once, and runs assertions inline.

test('list matchers: isBlocked / isViplisted / isOklisted contracts', async () => {
  const sharedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gmail-triage-list-test-'));
  const origCwd = process.cwd();
  process.chdir(sharedDir);
  try {
    // Cache-bust the imports — other tests (esc/safe) transitively import html.js → gmail.js
    // → blocklist.js, which captures path.join(process.cwd(), ...) at module-init time.
    // Without the query string we'd reuse the cached module pointing at project root.
    const bust = '?t=' + Date.now() + Math.random();
    const { isBlocked } = await import(blocklistModulePath + bust);
    const { isViplisted, isOklisted } = await import(viplistModulePath + bust);
    const write = (name, data) => fs.writeFileSync(path.join(sharedDir, name), JSON.stringify(data));
    const clear = (name) => { const p = path.join(sharedDir, name); if (fs.existsSync(p)) fs.unlinkSync(p); };

    // exact email match
    write('blocklist.json', [{ email: 'spam@example.com', reason: 'junk' }]);
    assert.ok(isBlocked('spam@example.com'), 'isBlocked: exact match');
    assert.ok(!isBlocked('other@example.com'), 'isBlocked: non-match returns falsy');

    // case-insensitive and trim
    assert.ok(isBlocked('SPAM@EXAMPLE.COM'), 'isBlocked: uppercase normalized');
    assert.ok(isBlocked('  spam@example.com  '), 'isBlocked: whitespace trimmed');

    // domain match via @domain entries
    write('blocklist.json', [{ email: '@badcorp.com', reason: 'junk' }]);
    assert.ok(isBlocked('anyone@badcorp.com'), 'isBlocked: domain match');
    assert.ok(isBlocked('other@badcorp.com'), 'isBlocked: domain match');
    assert.ok(!isBlocked('anyone@goodcorp.com'), 'isBlocked: different domain not matched');

    // name-scoped entry matches same name; unscoped caller still matches
    write('blocklist.json', [{ email: 'shared@example.com', name: 'Spammer One' }]);
    assert.ok(isBlocked('shared@example.com', 'Spammer One'), 'isBlocked: name match');
    assert.ok(!isBlocked('shared@example.com', 'Different Sender'), 'isBlocked: name mismatch');
    assert.ok(isBlocked('shared@example.com'), 'isBlocked: no name from caller still matches');

    // isViplisted returns boolean
    write('viplist.json', [{ email: 'vip@example.com' }]);
    assert.equal(isViplisted('vip@example.com'), true, 'isViplisted: returns true');
    assert.equal(isViplisted('other@example.com'), false, 'isViplisted: returns false');

    // isOklisted returns boolean
    write('oklist.json', [{ email: 'ok@example.com' }]);
    assert.equal(isOklisted('ok@example.com'), true, 'isOklisted: returns true');
    assert.equal(isOklisted('other@example.com'), false, 'isOklisted: returns false');

    // missing files return safe defaults
    clear('blocklist.json');
    clear('viplist.json');
    clear('oklist.json');
    assert.ok(!isBlocked('any@example.com'), 'isBlocked: missing file → falsy');
    assert.equal(isViplisted('any@example.com'), false, 'isViplisted: missing file → false');
    assert.equal(isOklisted('any@example.com'), false, 'isOklisted: missing file → false');
  } finally {
    process.chdir(origCwd);
    fs.rmSync(sharedDir, { recursive: true, force: true });
  }
});
