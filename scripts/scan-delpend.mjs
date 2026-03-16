// Scan .DelPend label for senders not already in blocklist
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { google } = require("C:/Users/frank/gmail-triage/app/node_modules/googleapis");
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configDir = path.join(__dirname, "../../app/../config"); // Y:\gmail-triage\config via worktree path — use absolute

// Load from Y:\gmail-triage\config
const CONFIG_DIR = "Y:\\gmail-triage\\config";
const creds    = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "credentials.json")));
const token    = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "token.json")));
const blocklist = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, "blocklist.json")));

const { client_id, client_secret, redirect_uris } = creds.installed;
const auth = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
auth.setCredentials(token);

// Save refreshed token if it changes
auth.on("tokens", (newTokens) => {
  const updated = { ...token, ...newTokens };
  fs.writeFileSync(path.join(CONFIG_DIR, "token.json"), JSON.stringify(updated, null, 2));
});

const gmail = google.gmail({ version: "v1", auth });

// Find .DelPend label ID
const labelsRes = await gmail.users.labels.list({ userId: "me" });
const delPendLabel = labelsRes.data.labels.find(l => l.name === ".DelPend");
if (!delPendLabel) { console.error(".DelPend label not found"); process.exit(1); }

const labelId = delPendLabel.id;
const blocklistEmails = new Set(blocklist.map(e => e.email.toLowerCase()));

// Paginate through all .DelPend messages
let pageToken;
const fromMap = new Map(); // email -> { name, email, count, subjects[] }

process.stderr.write("Scanning .DelPend");
do {
  const res = await gmail.users.messages.list({
    userId: "me",
    labelIds: [labelId],
    maxResults: 500,
    ...(pageToken ? { pageToken } : {}),
  });
  pageToken = res.data.nextPageToken;
  const messages = res.data.messages || [];
  process.stderr.write(".");

  // Fetch From headers in parallel batches of 50
  for (let i = 0; i < messages.length; i += 50) {
    const batch = messages.slice(i, i + 50);
    const headers = await Promise.all(
      batch.map(m =>
        gmail.users.messages.get({
          userId: "me",
          id: m.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject"],
        }).then(r => r.data.payload.headers)
      )
    );
    for (const hdrs of headers) {
      const fromHdr = hdrs.find(h => h.name === "From")?.value || "";
      const subjHdr = hdrs.find(h => h.name === "Subject")?.value || "";
      // Parse "Name <email>" or just "email"
      const m = fromHdr.match(/^(?:"?([^"<]+)"?\s+)?<([^>]+)>$/) || fromHdr.match(/^([^\s@]+@[^\s]+)$/);
      let email, name;
      if (fromHdr.includes("<")) {
        const parts = fromHdr.match(/^(.*?)\s*<([^>]+)>$/);
        email = (parts?.[2] || "").toLowerCase().trim();
        name  = (parts?.[1] || "").trim().replace(/^"|"$/g, "").trim();
      } else {
        email = fromHdr.toLowerCase().trim();
        name  = "";
      }
      if (!email) continue;
      if (!fromMap.has(email)) fromMap.set(email, { email, name, count: 0, subjects: [] });
      const e = fromMap.get(email);
      e.count++;
      if (e.subjects.length < 3) e.subjects.push(subjHdr);
    }
  }
} while (pageToken);

process.stderr.write("\n");

// Filter out already-blocked senders
const newSenders = [...fromMap.values()]
  .filter(e => !blocklistEmails.has(e.email))
  .sort((a, b) => b.count - a.count);

console.log(JSON.stringify(newSenders, null, 2));
