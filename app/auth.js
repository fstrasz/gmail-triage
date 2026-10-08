import fs from "node:fs";
import { authenticate } from "@google-cloud/local-auth";
import { google } from "googleapis";
import { authPaths } from "./lib/authPaths.js";

const { credPath, tokenPath } = authPaths(process.argv[2]);

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.settings.basic",
];

try {
  const auth = await authenticate({
    keyfilePath: credPath,
    scopes: SCOPES,
  });
  const profile = await google
    .gmail({ version: "v1", auth })
    .users.getProfile({ userId: "me" });
  fs.writeFileSync(tokenPath, JSON.stringify(auth.credentials, null, 2));
  console.log(`Token for ${profile.data.emailAddress} saved to ${tokenPath}`);
} catch (e) {
  console.error("Auth failed:", e.message);
}
