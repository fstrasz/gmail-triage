import Anthropic from '@anthropic-ai/sdk';
import { loadSettings } from './settings.js';

export async function searchEventsOfInterest(interests, locations) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const now = new Date();
  const until = new Date(now.getTime() + 90 * 24 * 3600000);
  const fmt = d => d.toISOString().slice(0, 10);

  const prompt = `Search the web for upcoming real-world events matching these interests, \
in the listed locations, from ${fmt(now)} through ${fmt(until)} (next 3 months).

Interests:
${interests.map(i => `- ${i}`).join('\n')}

Locations: ${locations.length ? locations.join(', ') : 'any'}

For every event found return a JSON array (no markdown, raw JSON only):
[{ "title", "date" (YYYY-MM-DD), "time" (HH:MM 24h or null), "location" (venue + city), "url", "description" (1-2 sentences), "interest" (which interest matched), "configuredLocation" (which of the Locations listed above matched, exactly as written) }]

Return [] if nothing found.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try { return JSON.parse(match[0]); } catch { return []; }
}

export async function sendEventsEmail(gmail, events, settings) {
  const to = settings.eventsSearchEmail || settings.dailySummaryEmail;
  if (!to) return;

  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Group events by configured location
  const grouped = {};
  for (const e of events) {
    const key = e.configuredLocation || e.location || 'Other';
    (grouped[key] = grouped[key] || []).push(e);
  }

  const eventBlocks = events.length
    ? Object.entries(grouped).map(([loc, evs]) => `
      <h3 style="color:#1e293b;margin:20px 0 8px;font-size:15px;border-bottom:1px solid #e5e7eb;padding-bottom:4px">&#128205; ${loc}</h3>
      <ul style="margin:0;padding-left:20px">
        ${evs.map(e => `<li style="margin-bottom:12px">
          <strong>${e.url ? `<a href="${e.url}" style="color:#1d4ed8">${e.title}</a>` : e.title}</strong>
          <span style="color:#6b7280;font-size:12px"> &mdash; ${e.interest || ''}</span><br>
          <span style="color:#374151">&#128197; ${e.date || 'TBD'}${e.time ? ' at ' + e.time : ''} &nbsp;|&nbsp; ${e.location || 'TBD'}</span><br>
          <span style="color:#6b7280;font-size:13px">${e.description || ''}</span>
        </li>`).join('')}
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
