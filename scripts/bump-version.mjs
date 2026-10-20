// Bump APP_VERSION's patch number in app/lib/pages.js (v1.2.40 -> v1.2.41).
// Run in the feature branch before opening the PR; deploy.ps1 refuses to deploy
// a version that is already live.
import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const file = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  "..",
  "app",
  "lib",
  "pages.js",
);
const src = fs.readFileSync(file, "utf8");
const m = src.match(/const APP_VERSION = "v(\d+)\.(\d+)\.(\d+)"/);
if (!m) {
  console.error("APP_VERSION not found in app/lib/pages.js");
  process.exit(1);
}
const next = `v${m[1]}.${m[2]}.${String(Number(m[3]) + 1).padStart(2, "0")}`;
fs.writeFileSync(file, src.replace(m[0], `const APP_VERSION = "${next}"`));
console.log(`APP_VERSION v${m[1]}.${m[2]}.${m[3]} -> ${next}`);
