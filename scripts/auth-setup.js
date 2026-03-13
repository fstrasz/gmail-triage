/**
 * auth-setup.js  —  One-time OAuth2 setup for Gmail + Google Calendar
 *
 * Run from the project root:
 *   node scripts/auth-setup.js
 *
 * This will print an authorization URL. Visit it, approve access,
 * then paste the code back here. A new token.json is written that
 * covers both Gmail and Google Calendar scopes.
 */

import { google } from "googleapis";
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CRED_PATH   = path.join(__dirname, "../config/credentials.json");
const TOKEN_PATH  = path.join(__dirname, "../config/token.json");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
];

const credentials = JSON.parse(fs.readFileSync(CRED_PATH));
const { client_id, client_secret, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

const authUrl = oAuth2Client.generateAuthUrl({ access_type: "offline", scope: SCOPES, prompt: "consent" });

console.log("\n=== Gmail Triage — OAuth2 Setup ===\n");
console.log("Open this URL in your browser and approve access:\n");
console.log(authUrl);
console.log("");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Paste the authorization code here: ", async (code) => {
  rl.close();
  try {
    const { tokens } = await oAuth2Client.getToken(code.trim());
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log("\n✅ token.json written to:", TOKEN_PATH);
    console.log("Scopes granted:", tokens.scope);
    console.log("\nRestart the Docker container to pick up the new token.");
  } catch (e) {
    console.error("\n❌ Error exchanging code:", e.message);
  }
});
