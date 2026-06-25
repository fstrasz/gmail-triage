// Generic Claude/LLM + token utilities, extracted from eventSearch.js (Phase 11,
// future-release #18) so the event-search module stays focused on event extraction.
// All pure / side-effect-free: JSON-array salvage from model text, token estimation,
// token-budget batching, and a bounded-concurrency mapper.

const CHARS_PER_TOKEN = 4;                  // rough English approximation

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
