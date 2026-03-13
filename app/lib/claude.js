import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { loadSettings } from "./settings.js";
dotenv.config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function analyzeEmail(subject, from, body) {
  const { locations } = loadSettings();
  const locationContext = locations.length
    ? `The user is based near ${locations.join(", ")}.`
    : `The user has no specific location preference.`;
  const eventRule = locations.length
    ? `isLocalEvent is true ONLY if the email describes one or more specific real-world events (meetups, concerts, classes, closures, special programs, etc.) in ${locations.join(" or ")} with dates.`
    : `isLocalEvent is true if the email describes any specific real-world events (meetups, concerts, classes, closures, special programs, etc.) with dates, regardless of location.`;

  const prompt = `You are analyzing an email. ${locationContext}
Respond ONLY with valid JSON (no markdown, no commentary) matching this schema exactly:
{
  "summary": "string — 1 to 2 sentence plain-English summary of what the email is about",
  "action": "keep" or "archive" or "junk" or "none",
  "actionReason": "string — brief reason for the suggested action",
  "isLocalEvent": true or false,
  "events": [
    {
      "title": "string",
      "date": "YYYY-MM-DD or null",
      "time": "HH:MM (24h) or null — null if no specific time is stated in the email; never guess or default to midnight",
      "location": "string",
      "description": "string — relevant details for calendar notes",
      "url": "string or null"
    }
  ],
  "draftReply": "string or null — suggested reply if the email warrants one, otherwise null"
}

Rules:
- ${eventRule}
- events must be an empty array [] when isLocalEvent is false.
- List ALL distinct events or date-specific occurrences mentioned in the email as separate objects in the events array (e.g. if an email mentions 4 different dates with different activities, create 4 event objects).
- action "junk" means the sender should be blocked.
- action "keep" means label the sender as a trusted keeper.
- action "archive" means archive this single email only.
- action "none" means no automated action is needed beyond reading.
- draftReply should be null unless the email clearly expects a reply (RSVP, question directed at user, etc.).

Email to analyze:
From: ${from}
Subject: ${subject}
---
${body.slice(0, 8000)}`;

  const msg = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const text = msg.content[0].text.trim();
  // Strip any accidental markdown code fences
  const clean = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(clean);
}
