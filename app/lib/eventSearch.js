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
[{ "title", "date" (YYYY-MM-DD), "time" (HH:MM 24h or null), "location" (venue + city), "url", "description" (1-2 sentences), "interest" (which interest matched), "configuredLocation" (which of the Locations listed above matched, exactly as written), "rating" (numeric Google/Yelp/venue rating e.g. 4.5, or null if not found), "pricePerPerson" (estimated price per person as a string e.g. "$50-$120", "Free", or null) }]

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

export async function scanEmailsForEvents(gmail, interests, locations) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const listRes = await gmail.users.messages.list({
    userId: 'me', q: 'in:inbox newer_than:3d', maxResults: 100,
  });
  const messages = listRes.data.messages || [];
  if (!messages.length) return [];

  // Fetch subject + snippet for each message
  const emails = await Promise.all(messages.map(async m => {
    const msg = await gmail.users.messages.get({
      userId: 'me', id: m.id, format: 'metadata', metadataHeaders: ['Subject'],
    });
    const subject = (msg.data.payload?.headers || []).find(h => h.name === 'Subject')?.value || '(no subject)';
    return { id: m.id, subject, snippet: msg.data.snippet || '' };
  }));

  const now = new Date();
  const until = new Date(now.getTime() + 90 * 24 * 3600000);
  const fmt = d => d.toISOString().slice(0, 10);

  const prompt = `From the following inbox emails (subject + snippet), identify any that contain \
announcements or information about real-world events matching these interests in these locations, \
from ${fmt(now)} through ${fmt(until)}.

Interests:
${interests.map(i => `- ${i}`).join('\n')}

Locations: ${locations.length ? locations.join(', ') : 'any'}

Emails:
${emails.map(e => `ID:${e.id} | Subject: ${e.subject} | Snippet: ${e.snippet}`).join('\n')}

Return a JSON array (no markdown, raw JSON only) of events found. For each use the message ID to build a Gmail URL:
[{ "title", "date" (YYYY-MM-DD or null), "time" (HH:MM 24h or null), "location" (venue + city), "url": "https://mail.google.com/mail/u/0/#all/MESSAGE_ID", "description" (1-2 sentences), "interest" (which interest matched), "configuredLocation" (which of the Locations listed above matched, exactly as written), "rating" (null), "pricePerPerson" (if mentioned, else null), "source": "email" }]

Return [] if no relevant events found.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try { return JSON.parse(match[0]); } catch { return []; }
}

function renderEventItem(e) {
  const priceRating = [
    e.pricePerPerson ? `<strong style="color:#16a34a">${e.pricePerPerson} / person</strong>` : '',
    e.rating ? `&#11088; ${e.rating}` : '',
  ].filter(Boolean).join(' &nbsp;&bull;&nbsp; ');

  const sourceIcon = e.source === 'email' ? '&#9993; ' : '';
  const titleLink = e.url
    ? `<a href="${e.url}" style="color:#1d4ed8">${sourceIcon}${e.title}</a>`
    : `${sourceIcon}${e.title}`;

  return `<li style="margin-bottom:14px">
    <strong>${titleLink}</strong>
    <span style="color:#6b7280;font-size:12px"> &mdash; ${e.interest || ''}</span><br>
    ${priceRating ? `<span style="font-size:13px">${priceRating}</span><br>` : ''}
    <span style="color:#374151;font-size:13px">&#128197; ${e.date || 'TBD'}${e.time ? ' at ' + e.time : ''} &nbsp;|&nbsp; ${e.location || 'TBD'}</span><br>
    <span style="color:#6b7280;font-size:13px">${e.description || ''}</span>
  </li>`;
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
