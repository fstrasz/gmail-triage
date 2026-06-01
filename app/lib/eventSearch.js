import Anthropic from '@anthropic-ai/sdk';
import { loadSettings, addScannedEmailIds } from './settings.js';

function searchHorizon() {
  const now = new Date();
  const until = new Date(now.getTime() + SEARCH_WINDOW_DAYS * 24 * 3600000);
  const fmt = d => d.toISOString().slice(0, 10);
  return { now, until, today: fmt(now), horizon: fmt(until), fmt };
}

export async function searchEventsOfInterest(interests, locations) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { today, horizon } = searchHorizon();

  const prompt = `Search the web for upcoming real-world events matching these interests, \
in the listed locations, from ${today} through ${horizon} (next ${SEARCH_WINDOW_DAYS / 30} months).

Interests:
${interests.map(i => `- ${i}`).join('\n')}

Locations: ${locations.length ? locations.join(', ') : 'any'}

${INTERPRETATION_RULES}

For every event found return a JSON array (no markdown, raw JSON only):
[{ "title", "date" (YYYY-MM-DD), "time" (HH:MM 24h or null), "location" (venue + city), "url", "description" (1-2 sentences describing the EVENT itself — what it is, what attendees experience. Do NOT include match-explanation phrases like "Matches wine festivals" or "Aligns with your interests" — the matched interest is shown separately as a tag.), "interest" (which interest matched), "configuredLocation" (which of the Locations listed above matched, exactly as written), "rating" (numeric Google/Yelp/venue rating e.g. 4.5, or null if not found), "pricePerPerson" (estimated price per person as a string e.g. "$50-$120", "Free", or null) }]

Return [] if nothing found.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const toolUses = response.content.filter(b => b.type === 'tool_use').length;
  const arr = extractJsonArray(text);
  console.log(`[eventSearch] web search: response ${text.length} chars, tool_use blocks: ${toolUses}, json match: ${arr ? 'yes' : 'no'}, stop_reason: ${response.stop_reason}`);
  if (!arr) {
    console.log(`[eventSearch] web search response preview (first 400 chars): ${text.slice(0, 400)}`);
    return [];
  }
  try {
    const events = JSON.parse(arr);
    console.log(`[eventSearch] web search returned ${events.length} event(s)`);
    return events;
  } catch (e) {
    console.error(`[eventSearch] web search JSON parse failed:`, e.message);
    console.error(`[eventSearch] web search JSON head (first 300 chars): ${arr.slice(0, 300)}`);
    console.error(`[eventSearch] web search JSON tail (last 300 chars): ${arr.slice(-300)}`);
    return [];
  }
}

// Pull inline + attached images from a Gmail message, capped to keep request size sane.
const GMAIL_MSG_URL_RE = /^https:\/\/mail\.google\.com\/mail\/u\/\d+\/#all\/([a-f0-9]+)$/i;
const VISION_MAX_IMAGES = 4;
const VISION_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const VISION_SUPPORTED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// Body-scan batching constants — pack as many emails per Claude call as fit under the budget,
// AND cap batch size by email count to preserve per-email attention in long contexts.
const BODY_TOKEN_BUDGET = 180_000;          // Sonnet 4.6 context is 200k; leave 20k for response + overhead
const BODY_PROMPT_OVERHEAD_TOKENS = 800;    // fixed prompt template
const BODY_MAX_EMAILS_PER_BATCH = 20;       // attention cap — even if tokens fit, smaller batches enumerate better
const BODY_RESPONSE_MAX_TOKENS = 16384;     // headroom for 50+ events JSON
const CHARS_PER_TOKEN = 4;                  // rough English approximation

// Per-event enrichment models — short-input/short-output classification tasks use Haiku
const ENRICHMENT_MODEL = 'claude-haiku-4-5';
// Bounded concurrency for enrichment Claude calls (per-event)
const ENRICHMENT_CONCURRENCY = 5;

// Shared prompt fragments — these used to be duplicated across web search + body scan + image vision.
const SEARCH_WINDOW_DAYS = 90;
const INTERPRETATION_RULES = `INTERPRETATION RULES (apply liberally):
- Interest matching is SEMANTIC, not literal. "wine dinners" matches wine pairings, wine tastings, wine flights, vintner dinners, wine festivals. "food festivals" matches culinary events, tasting events, food expos. "trap shooting" matches skeet, sporting clays, shotgun-sports events. "events at the Sphere" matches any show, concert, or residency at Sphere Las Vegas. Cooking classes match any food/beverage interest. Whiskey/spirits events match wine-adjacent interests.
- Location matching is REGIONAL. "Las Vegas, NV" includes Henderson, North Las Vegas, Boulder City, and the greater Las Vegas metro. "Temecula, CA" includes the Temecula Valley wine country, Murrieta, Wildomar, Fallbrook, and adjacent wine-country communities. Include events at venues in those regions even if the address is in a different listed city.
- When in doubt, INCLUDE. Better to surface a borderline match than miss a real one.`;

// Robust JSON-array extraction: walk the text tracking bracket depth, accounting for
// strings and escapes. Returns the first complete top-level [ ... ] substring, or null.
export function extractJsonArray(text) {
  if (!text) return null;
  const i0 = text.indexOf('[');
  if (i0 < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = i0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) return text.slice(i0, i + 1);
    }
  }
  return null;
}

export function estimateTokens(text) {
  return Math.ceil((text || '').length / CHARS_PER_TOKEN);
}

// Greedy pack items into batches under a token budget AND (optionally) a max-count cap.
// Either limit triggers a new batch. The max-count cap improves per-item attention in
// long Claude contexts, which falls off well before raw token limits are hit.
export function batchByTokenBudget(items, getTokens, budget, maxCount = Infinity) {
  const batches = [];
  let current = [];
  let currentTokens = 0;
  for (const it of items) {
    const t = getTokens(it);
    const wouldExceedTokens = current.length > 0 && currentTokens + t > budget;
    const wouldExceedCount = current.length >= maxCount;
    if (wouldExceedTokens || wouldExceedCount) {
      batches.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(it);
    currentTokens += t;
  }
  if (current.length) batches.push(current);
  return batches;
}

function htmlToText(html) {
  return (html || '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getTextBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const p of payload.parts) {
      const r = getTextBody(p);
      if (r) return r;
    }
  }
  return '';
}

// Prefer whichever part has more actual content. Marketing emails commonly include a
// short text/plain stub ("Hi Frank, click here") with all real content in text/html —
// always using text/plain causes us to miss multi-event newsletters like The Juice.
export function getEmailBodyText(payload) {
  const plain = getTextBody(payload);
  const html = getHtmlBody(payload);
  const stripped = html ? htmlToText(html) : '';
  if (plain && stripped) return plain.length >= stripped.length ? plain : stripped;
  return plain || stripped;
}

async function fetchEmailImages(gmail, messageId, getFullMessage) {
  const msg = await getFullMessage(messageId);
  const images = [];
  async function walk(part) {
    if (images.length >= VISION_MAX_IMAGES || !part) return;
    if (VISION_SUPPORTED_MIME.has(part.mimeType) && part.body) {
      const size = part.body.size || 0;
      if (size > 0 && size < VISION_MAX_IMAGE_BYTES) {
        let data = part.body.data;
        if (!data && part.body.attachmentId) {
          try {
            const att = await gmail.users.messages.attachments.get({
              userId: 'me', messageId, id: part.body.attachmentId,
            });
            data = att.data.data;
          } catch (e) { console.error('fetchEmailImages: attachment fetch failed:', e.message); }
        }
        if (data) {
          const standardBase64 = data.replace(/-/g, '+').replace(/_/g, '/');
          images.push({ mimeType: part.mimeType, data: standardBase64 });
        }
      }
    }
    if (part.parts) { for (const p of part.parts) await walk(p); }
  }
  await walk(msg.data.payload);
  return images;
}

// ─── Canonical link extraction ────────────────────────────────────────────────
// "View this email in your browser" / "View online" / "View as web page" etc.
const VIEW_IN_BROWSER_RE = /\b(view\s+(this\s+)?(email|message)?\s*(in\s+(your\s+|a\s+)?browser|as\s+(a\s+)?web\s*page|online|in\s+a\s+browser)|trouble\s+viewing|having\s+trouble\s+viewing|see\s+(it|this)\s+in\s+your\s+browser)\b/i;

const ANCHOR_NOISE_TEXT = [
  /\bunsubscribe\b/i,
  /\bmanage\s+(your\s+)?(email\s+)?preferences\b/i,
  /\bupdate\s+(your\s+)?(profile|preferences|subscription)\b/i,
  /\bopt[- ]out\b/i,
  /\bprivacy\s+policy\b/i,
  /\bterms\s+(of|and)\b/i,
  /\bcontact\s+us\b/i,
];
const ANCHOR_NOISE_HOST = [
  /facebook\.com/i, /twitter\.com/i, /x\.com/i, /linkedin\.com/i,
  /instagram\.com/i, /youtube\.com/i, /tiktok\.com/i, /pinterest\.com/i,
];

function getHtmlBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const p of payload.parts) {
      const r = getHtmlBody(p);
      if (r) return r;
    }
  }
  return '';
}

function extractAnchors(html) {
  const anchors = [];
  const RE = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = RE.exec(html)) !== null) {
    const href = m[1].trim();
    if (!/^https?:\/\//i.test(href)) continue;
    const text = m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    anchors.push({ href, text });
  }
  return anchors;
}

// Rank candidate URLs by how many meaningful words from the event title appear in
// the URL or anchor text. Bubbles title-matching candidates to the top so the
// per-event TICKETS link beats header/footer anchors in long marketing emails.
const STOP_WORDS = new Set(['the','and','with','for','class','series','event','a','an','at','in','on','of','to','from','our','your','this','that']);
export function scoreCandidateByTitle(candidate, eventTitle) {
  const titleWords = (eventTitle || '').toLowerCase().match(/[a-z0-9]+/g) || [];
  const meaningful = titleWords.filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  if (!meaningful.length) return 0;
  const url = (candidate.href || '').toLowerCase();
  const text = (candidate.text || '').toLowerCase();
  let score = 0;
  for (const w of meaningful) {
    if (url.includes(w)) score += 2;
    if (text.includes(w)) score += 1;
  }
  return score;
}

// Decision logic for canonical-link picker. Pure function — testable without Claude.
// Returns:
//   { kind: 'none' }                                 — no candidates
//   { kind: 'direct', href, score? }                 — short-circuit on rank confidence
//   { kind: 'ambiguous', candidates: [...] }          — caller should ask Claude
const CANONICAL_MIN_CLEAR_SCORE = 4;       // ≥2 meaningful title words in URL
const CANONICAL_CLAUDE_FALLBACK_CAP = 50;  // generous cap on the Claude fallback path
export function pickCanonicalFromCandidates(candidates, eventTitle, opts = {}) {
  const minClear = opts.minClearScore ?? CANONICAL_MIN_CLEAR_SCORE;
  const cap = opts.maxClaudeCandidates ?? CANONICAL_CLAUDE_FALLBACK_CAP;
  if (!candidates || !candidates.length) return { kind: 'none' };
  if (candidates.length === 1) return { kind: 'direct', href: candidates[0].href };

  const ranked = candidates
    .map(c => ({ ...c, score: scoreCandidateByTitle(c, eventTitle) }))
    .sort((a, b) => b.score - a.score);

  const top = ranked[0];
  const second = ranked[1];
  if (top.score >= minClear && (!second || top.score > second.score)) {
    return { kind: 'direct', href: top.href, score: top.score };
  }
  return { kind: 'ambiguous', candidates: ranked.slice(0, cap) };
}

async function extractCanonicalLink(gmail, messageId, eventTitle, client, getFullMessage) {
  try {
    const msg = await getFullMessage(messageId);
    const html = getHtmlBody(msg.data.payload);
    if (!html) return null;
    const anchors = extractAnchors(html);
    if (!anchors.length) return null;

    // Priority 1: explicit "View in browser" link wins outright (hosted web version of the email)
    const viewInBrowser = anchors.find(a => a.text && VIEW_IN_BROWSER_RE.test(a.text));
    if (viewInBrowser) return viewInBrowser.href;

    // Filter noise
    const filtered = anchors.filter(a => {
      if (a.text && ANCHOR_NOISE_TEXT.some(p => p.test(a.text))) return false;
      try {
        const host = new URL(a.href).host;
        if (ANCHOR_NOISE_HOST.some(p => p.test(host))) return false;
      } catch { return false; }
      return true;
    });

    // Dedupe by href, keep first anchor text
    const seen = new Map();
    for (const a of filtered) if (!seen.has(a.href)) seen.set(a.href, a.text || '');
    const unique = [...seen.entries()].map(([href, text]) => ({ href, text }));

    const decision = pickCanonicalFromCandidates(unique, eventTitle);
    if (decision.kind === 'none') return null;
    if (decision.kind === 'direct') {
      console.log(`[eventSearch] canonical (rank-only) for "${eventTitle}": ${decision.href}${decision.score != null ? ' score=' + decision.score : ''}`);
      return decision.href;
    }
    // Ambiguous → ask Claude (Haiku — pick-one-URL classification)
    const capped = decision.candidates;
    const response = await client.messages.create({
      model: ENRICHMENT_MODEL,
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: `Event title: "${eventTitle}"\n\nFrom the candidate links below (extracted from the email body), pick the URL most likely to be the canonical public web page for this event — the page an external recipient could open to view event details, register, or buy tickets. Avoid email-platform tracking URLs only if a clear non-tracking equivalent exists. Return ONLY the URL on a single line, or exactly: null\n\nCandidates:\n${capped.map((c, i) => `${i+1}. [${c.text || '(no text)'}] ${c.href}`).join('\n')}`
      }],
    });
    const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (text === 'null') return null;
    const urlMatch = text.match(/https?:\/\/\S+/);
    if (!urlMatch) return null;
    const returned = urlMatch[0].replace(/[.,;:!?)\]]+$/, '');
    // Sanity: must be one of the candidates we offered (no hallucinated URLs)
    return capped.some(c => c.href === returned) ? returned : null;
  } catch (e) {
    console.error(`extractCanonicalLink failed for "${eventTitle}":`, e.message);
    return null;
  }
}

// Bounded-concurrency mapper. Runs at most `concurrency` workers; ignores per-item errors
// (logged by callers via their own try/catch). Preserves input order in returned array.
export async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      try { results[i] = await fn(items[i], i); }
      catch (e) { results[i] = undefined; }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function enrichCanonicalLinks(gmail, events, getFullMessage) {
  const todo = events.filter(e =>
    e.source === 'email' && !e.canonicalUrl && GMAIL_MSG_URL_RE.test(e.url || '')
  );
  if (!todo.length) return;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  await mapWithConcurrency(todo, ENRICHMENT_CONCURRENCY, async (event) => {
    const messageId = event.url.match(GMAIL_MSG_URL_RE)[1];
    const link = await extractCanonicalLink(gmail, messageId, event.title, client, getFullMessage);
    if (link) {
      event.canonicalUrl = link;
      console.log(`[eventSearch] canonical link for "${event.title}": ${link}`);
    }
  });
}

// For events the text scan left dateless, send the source email's images to Claude vision.
async function enrichDatesFromImages(gmail, events, getFullMessage) {
  const todo = events.filter(e =>
    e.source === 'email' && !e.date && GMAIL_MSG_URL_RE.test(e.url || '')
  );
  if (!todo.length) return;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { today, horizon } = searchHorizon();

  await mapWithConcurrency(todo, ENRICHMENT_CONCURRENCY, async (event) => {
    const messageId = event.url.match(GMAIL_MSG_URL_RE)[1];
    try {
      const images = await fetchEmailImages(gmail, messageId, getFullMessage);
      if (!images.length) return;

      const content = [
        ...images.map(img => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: img.data },
        })),
        {
          type: 'text',
          text: `These images are from an email about an event titled "${event.title}". \
Today is ${today}. Look at the images and return ONLY the event date in strict YYYY-MM-DD format. \
The date must fall between ${today} and ${horizon}. \
If no date is clearly visible in the images, or the date does not fall in that window, return exactly: null. \
No other text, no explanation.`,
        },
      ];

      const response = await client.messages.create({
        model: ENRICHMENT_MODEL,
        max_tokens: 50,
        messages: [{ role: 'user', content }],
      });
      const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
      const dateMatch = text.match(/(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const candidate = dateMatch[1];
        if (candidate >= today && candidate <= horizon) {
          event.date = candidate;
          console.log(`[eventSearch] image-derived date for "${event.title}": ${candidate}`);
        }
      }
    } catch (e) {
      console.error(`enrichDatesFromImages failed for "${event.title}":`, e.message);
    }
  });
}

// Per-email body cap so a single mega-newsletter can't consume the whole token budget alone.
const MAX_BODY_CHARS_PER_EMAIL = 50_000;

export async function scanEmailsForEvents(gmail, interests, locations) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Exclude: self-sent emails ("Gmail Triage" subject), and any sender already routed to .DelPend
  const listRes = await gmail.users.messages.list({
    userId: 'me', q: 'in:inbox newer_than:3d -subject:"Gmail Triage" -label:.DelPend', maxResults: 100,
  });
  const allMessages = listRes.data.messages || [];
  const alreadyScanned = new Set(loadSettings().scannedEmailIds || []);
  const messages = allMessages.filter(m => !alreadyScanned.has(m.id));
  console.log(`[eventSearch] email scan: ${allMessages.length} recent (excluding .DelPend), ${messages.length} new to scan`);
  if (!messages.length) return [];

  // Per-run message cache so subsequent passes (event extraction, image vision,
  // canonical-link extraction) don't refetch the same full message.
  const messageCache = new Map();
  const getFullMessage = async (id) => {
    if (messageCache.has(id)) return messageCache.get(id);
    const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    messageCache.set(id, msg);
    return msg;
  };

  const { now, until, fmt } = searchHorizon();

  // Fetch full bodies for every eligible message (no Pass 1 pre-filter — bodies decide)
  const bodies = await Promise.all(messages.map(async m => {
    const msg = await getFullMessage(m.id);
    const subject = (msg.data.payload?.headers || []).find(h => h.name === 'Subject')?.value || '(no subject)';
    let body = getEmailBodyText(msg.data.payload);
    if (body.length > MAX_BODY_CHARS_PER_EMAIL) {
      body = body.slice(0, MAX_BODY_CHARS_PER_EMAIL) + '\n[…body truncated at ' + MAX_BODY_CHARS_PER_EMAIL + ' chars]';
    }
    const formatted = `=== ID:${m.id} ===\nSubject: ${subject}\n\n${body}`;
    return { id: m.id, subject, body, formatted, tokens: estimateTokens(formatted) };
  }));
  console.log(`[eventSearch] fetched ${bodies.length} bodies, total ~${bodies.reduce((s, b) => s + b.tokens, 0)} tokens`);

  const batches = batchByTokenBudget(
    bodies,
    b => b.tokens,
    BODY_TOKEN_BUDGET - BODY_PROMPT_OVERHEAD_TOKENS,
    BODY_MAX_EMAILS_PER_BATCH,
  );
  console.log(`[eventSearch] body scan: ${bodies.length} emails packed into ${batches.length} batch(es) (cap ${BODY_MAX_EMAILS_PER_BATCH}/batch)`);

  const pass2Schema = `Return a JSON array (no markdown, raw JSON only). For each event found:
[{ "title", "date" (YYYY-MM-DD or null), "time" (HH:MM 24h or null), "location" (venue + city), "url": "https://mail.google.com/mail/u/0/#all/MESSAGE_ID", "description" (1-2 sentences describing the EVENT itself — what it is, what attendees experience. Do NOT include match-explanation phrases like "Matches wine festivals" or "Aligns with your interests" — the matched interest is shown separately as a tag.), "interest" (which interest matched), "configuredLocation" (which of the Locations listed above matched, exactly as written), "rating" (null), "pricePerPerson" (if mentioned, else null), "source": "email" }]

CRITICAL ENUMERATION RULE: if a single email lists multiple distinct events (a weekly digest, "upcoming events" newsletter, multi-event calendar, multi-event roundup, weekend roundup, etc.), you MUST return EACH event as its own separate array entry. The entry's title/date/location/description must describe the SPECIFIC event, not the email or newsletter overall. Use the source email's ID for the url field of EVERY event extracted from that email.

Example: an email titled "Weekend Wine & Food Events near Las Vegas" with body listing 16 events (each with its own date, venue, and title) should produce 16 separate array entries, NOT one entry titled "Weekend Wine & Food Events".

Return [] if no relevant events found.`;

  // Stable system prefix — interests/locations/rules/schema are identical across all batches
  // in this run. Marking with cache_control: ephemeral lets batches 2..N pay ~10% input cost
  // on the cached prefix tokens.
  const systemBlocks = [{
    type: 'text',
    text: `You extract real-world events from inbox emails. Apply these rules to every batch.

Interests:
${interests.map(i => `- ${i}`).join('\n')}

Locations: ${locations.length ? locations.join(', ') : 'any'}

${INTERPRETATION_RULES}

${pass2Schema}`,
    cache_control: { type: 'ephemeral' },
  }];

  const allEvents = [];
  const successfulIds = new Set();
  const usage = { input: 0, output: 0, cache_read: 0, cache_creation: 0 };
  for (const [bi, batch] of batches.entries()) {
    const userPrompt = `Date window: ${fmt(now)} through ${fmt(until)}.

Emails:
${batch.map(b => b.formatted).join('\n\n')}

Return the JSON array per the schema above. Empty array if no events.`;
    try {
      const r = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: BODY_RESPONSE_MAX_TOKENS,
        system: systemBlocks,
        messages: [{ role: 'user', content: userPrompt }],
      });
      const u = r.usage || {};
      usage.input += u.input_tokens || 0;
      usage.output += u.output_tokens || 0;
      usage.cache_read += u.cache_read_input_tokens || 0;
      usage.cache_creation += u.cache_creation_input_tokens || 0;
      const t = r.content.filter(b => b.type === 'text').map(b => b.text).join('');
      const arr = extractJsonArray(t);
      console.log(`[eventSearch] body batch ${bi+1}/${batches.length}: ${batch.length} emails, response ${t.length} chars, stop_reason: ${r.stop_reason}, json match: ${arr ? 'yes' : 'no'}`);
      if (!arr) { console.warn(`[eventSearch] body batch ${bi+1}: response preview: ${t.slice(0, 400)}`); continue; }
      let parsed;
      try { parsed = JSON.parse(arr); }
      catch (je) {
        console.error(`[eventSearch] body batch ${bi+1}: JSON parse failed: ${je.message}`);
        console.error(`[eventSearch] body batch ${bi+1}: JSON head (first 300 chars): ${arr.slice(0, 300)}`);
        continue;
      }
      if (Array.isArray(parsed)) {
        console.log(`[eventSearch] body batch ${bi+1}: extracted ${parsed.length} event(s)`);
        allEvents.push(...parsed);
        // Only mark batch IDs as scanned on SUCCESSFUL parse. A transient API failure leaves
        // emails un-marked so they retry next run.
        for (const b of batch) successfulIds.add(b.id);
        // Diagnostic: when a batch returns ZERO events, dump what Claude said + the email
        // subjects + body excerpts in that batch so we can see why Claude declined to extract.
        if (parsed.length === 0) {
          console.warn(`[eventSearch] body batch ${bi+1}: ZERO events — preamble (first 500 chars): ${t.slice(0, 500).replace(/\s+/g, ' ')}`);
          for (const [ei, b] of batch.entries()) {
            const excerpt = (b.body || '').slice(0, 250).replace(/\s+/g, ' ');
            console.warn(`[eventSearch]   email ${ei+1}/${batch.length} id=${b.id} subj="${b.subject}" body[${b.body.length}ch]: ${excerpt}`);
          }
        }
      }
    } catch (e) {
      console.error(`[eventSearch] body batch ${bi+1} failed:`, e.message);
    }
  }
  // Mark only IDs from successfully-parsed batches as scanned — transient failures retry next run.
  if (successfulIds.size) addScannedEmailIds([...successfulIds]);
  console.log(`[eventSearch] body scan: extracted ${allEvents.length} event(s) total, ${successfulIds.size}/${messages.length} emails marked scanned`);
  // Cost summary — Sonnet 4.6 rates: $3/MTok input, $3.75/MTok cache write, $0.30/MTok cache read, $15/MTok output
  const cost = (usage.input * 3 + usage.cache_creation * 3.75 + usage.cache_read * 0.30 + usage.output * 15) / 1_000_000;
  console.log(`[eventSearch] body scan tokens: ${usage.input} input, ${usage.cache_creation} cache_creation, ${usage.cache_read} cache_read, ${usage.output} output — est $${cost.toFixed(4)}`);

  // Enrichment passes (share the same per-run message cache)
  await Promise.all([
    enrichDatesFromImages(gmail, allEvents, getFullMessage),
    enrichCanonicalLinks(gmail, allEvents, getFullMessage),
  ]);
  return allEvents;
}

function renderEventItem(e) {
  const priceRating = [
    e.pricePerPerson ? `<strong style="color:#16a34a">${e.pricePerPerson} / person</strong>` : '',
    e.rating ? `&#11088; ${e.rating}` : '',
  ].filter(Boolean).join(' &nbsp;&bull;&nbsp; ');

  const displayUrl = e.canonicalUrl || e.url;
  const sourceIcon = (e.source === 'email' && !e.canonicalUrl) ? '&#9993; ' : '';
  const titleLink = displayUrl
    ? `<a href="${displayUrl}" style="color:#1d4ed8">${sourceIcon}${e.title}</a>`
    : `${sourceIcon}${e.title}`;

  return `<li style="margin-bottom:14px">
    <strong>${titleLink}</strong>
    <span style="color:#6b7280;font-size:12px"> &mdash; ${e.interest || ''}</span><br>
    ${priceRating ? `<span style="font-size:13px">${priceRating}</span><br>` : ''}
    <span style="color:#374151;font-size:13px">&#128197; ${e.date || 'TBD'}${e.time ? ' at ' + e.time : ''} &nbsp;|&nbsp; ${e.location || 'TBD'}</span><br>
    <span style="color:#6b7280;font-size:13px">${e.description || ''}</span>
  </li>`;
}

// Web search is the most expensive call in a scan run (one Claude call w/ web_search tool).
// Gate it to at most once per WEB_SEARCH_MIN_INTERVAL_MS — typically once per day.
export const WEB_SEARCH_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function shouldSkipWebSearch(now, lastRunIso, minIntervalMs = WEB_SEARCH_MIN_INTERVAL_MS) {
  if (!lastRunIso) return false;
  const last = new Date(lastRunIso).getTime();
  if (Number.isNaN(last)) return false;
  return (now - last) < minIntervalMs;
}

// Order group keys by the configured locations array so the rendered group order
// stays stable across ignores. Unknown keys fall to the end, alphabetical among themselves.
export function sortGroupKeysByLocationOrder(groupKeys, locationsOrder = []) {
  const order = new Map(locationsOrder.map((loc, i) => [loc, i]));
  return [...groupKeys].sort((a, b) => {
    const ai = order.has(a) ? order.get(a) : Infinity;
    const bi = order.has(b) ? order.get(b) : Infinity;
    if (ai !== bi) return ai - bi;
    return a.localeCompare(b);
  });
}

export async function sendEventsEmail(gmail, events, settings) {
  const rawTo = settings.eventsSearchEmail || settings.dailySummaryEmail;
  if (!rawTo) { console.warn('[eventSearch] no recipient configured — set Events Email in Settings'); return; }
  const to = rawTo.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).join(', ');

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Group events by configured location
  const grouped = {};
  for (const e of events) {
    const key = e.configuredLocation || e.location || 'Other';
    (grouped[key] = grouped[key] || []).push(e);
  }

  // Within each group, dated events first (chronological), TBD/null-date last
  for (const evs of Object.values(grouped)) {
    evs.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
  }

  const orderedKeys = sortGroupKeysByLocationOrder(Object.keys(grouped), settings.locations || []);
  const eventBlocks = events.length
    ? orderedKeys.map(loc => [loc, grouped[loc]]).map(([loc, evs]) => `
      <h3 style="color:#1e293b;margin:20px 0 8px;font-size:15px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">&#128205; ${loc}</h3>
      <ul style="margin:0;padding-left:20px">
        ${evs.map(renderEventItem).join('')}
      </ul>`).join('')
    : `<p style="color:#6b7280">No events found.</p>`;

  const html = `<div style="font-family:sans-serif;max-width:640px;margin:0 auto">
    <h2 style="color:#1e293b">Upcoming Events &mdash; ${dateStr}</h2>
    ${eventBlocks}
    <p style="color:#9ca3af;font-size:11px;margin-top:24px">Sent by Gmail Triage</p>
  </div>`;

  const subject = `Gmail Triage - Upcoming Events (${dateStr})`;
  const raw = [
    `From: me`, `To: ${to}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
    `MIME-Version: 1.0`, `Content-Type: text/html; charset=utf-8`, ``, html,
  ].join('\r\n');
  const encoded = Buffer.from(raw).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw: encoded } });
  console.log(`[eventSearch] events email sent to ${to}`);
}
