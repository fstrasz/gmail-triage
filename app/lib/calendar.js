import { google } from "googleapis";
import fs from "fs";
import path from "path";
import { loadSettings } from "./settings.js";

export function getCalendarClient() {
  const creds = JSON.parse(fs.readFileSync(path.join(process.cwd(), "credentials.json")));
  const { client_id, client_secret, redirect_uris } = creds.installed;
  const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  const token = JSON.parse(fs.readFileSync(path.join(process.cwd(), "token.json")));
  auth.setCredentials(token);
  auth.on("tokens", t => {
    const TOKEN_PATH = path.join(process.cwd(), "token.json");
    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...token, ...t }, null, 2));
  });
  return google.calendar({ version: "v3", auth });
}

export async function createCalendarEvent(calendar, event) {
  const hasTime = event.time && event.time.trim() !== "";
  const startTime = hasTime ? event.time : "09:00";
  const endTime   = hasTime
    ? (() => { const [h, m] = startTime.split(":").map(Number); return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`; })()
    : "17:00";

  const description = [
    event.description || "",
    event.url ? `\nMore info: ${event.url}` : "",
  ].filter(Boolean).join("\n").trim();

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: event.title,
      location: event.location || "",
      description,
      start: { dateTime: `${event.date}T${startTime}:00`, timeZone: loadSettings().timezone },
      end:   { dateTime: `${event.date}T${endTime}:00`,   timeZone: loadSettings().timezone },
    },
  });
  return res.data.htmlLink;
}
