import { authenticate } from "@google-cloud/local-auth";
import path from "path";
import fs from "fs";

const credPath = path.join(process.cwd(), "..", "config", "credentials.json");
const tokenPath = path.join(process.cwd(), "..", "config", "token.json");

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
  fs.writeFileSync(tokenPath, JSON.stringify(auth.credentials, null, 2));
  console.log("Token saved successfully to config/token.json");
} catch(e) {
  console.error("Auth failed:", e.message);
}