import fs from "fs";

const BLOCKLIST = "Y:\\gmail-triage\\config\\blocklist.json";
const now = new Date().toISOString();

const toAdd = [
  { email: "customerservice@wienscellars.com", name: "Wiens Cellars",        date: now, reason: "marketing" },
  { email: "wines@tamberbey.com",              name: "Tamber Bey Vineyards", date: now, reason: "marketing" },
  { email: "hello@em.rivian.com",              name: "Rivian",               date: now, reason: "marketing" },
  { email: "recommendations@discover.pinterest.com", name: "Pinterest",      date: now, reason: "marketing" },
  { email: "southwestairlines@iluv.southwest.com", name: "Southwest Airlines", date: now, reason: "marketing" },
  { email: "eric.m.schiffer@interdependenchub.info", name: "Eric Schiffer",  date: now, reason: "spam" },
  { email: "info@kirbys.fbmta.com",            name: "Kirby's Steakhouse",   date: now, reason: "marketing" },
  { email: "info@bookbub.com",                 name: "BookBub",              date: now, reason: "marketing" },
  { email: "fl@e.myfilingservices.com",        name: "FL Filing Services",   date: now, reason: "spam" },
];

const existing = JSON.parse(fs.readFileSync(BLOCKLIST));
const existingEmails = new Set(existing.map(e => e.email.toLowerCase()));

const added = [];
for (const entry of toAdd) {
  if (!existingEmails.has(entry.email.toLowerCase())) {
    existing.push(entry);
    added.push(entry.email);
  }
}

fs.writeFileSync(BLOCKLIST, JSON.stringify(existing, null, 2));
console.log(`Added ${added.length} entries. Total: ${existing.length}`);
added.forEach(e => console.log("  +", e));
