#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Dev-only mock server for the React UI (web/dist).
//
// Serves the built SPA at /app/ and implements every /api/* route the React app
// calls, against in-memory synthetic fixtures. It never imports app/triage.js or
// app/lib/*, never reads config/, and makes no network calls (no Gmail, Google,
// Anthropic). Response shapes mirror the real handlers in app/triage.js and
// app/lib/triageApi.js — keep them in sync if those change.
//
//   npm run mock-ui                       (from the repo root; build web first)
//   PORT=5180 MOCK_LATENCY_MS=600 npm run mock-ui
//   MOCK_EMPTY=1 npm run mock-ui          (empty triage queue)
//
// State is in memory only — restart the server to reset it.
// ---------------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIST = path.join(ROOT, "web", "dist");

// express is a dependency of app/, not the repo root — resolve it from there.
// Only the express package is loaded; nothing from app/ itself.
function loadExpress() {
  for (const base of [ROOT, path.join(ROOT, "app")]) {
    try {
      return createRequire(path.join(base, "package.json"))("express");
    } catch {
      /* try next */
    }
  }
  console.error(
    "express not found. Run `npm ci` in app/ (or the repo root) first.",
  );
  process.exit(1);
}
const express = loadExpress();

const PORT = Number(process.env.PORT) || 5179;
const LATENCY = Number(process.env.MOCK_LATENCY_MS ?? 150) || 0;
const EMPTY = process.env.MOCK_EMPTY === "1";
const BULK_GUARD_THRESHOLD = 100; // mirrors the backend constant
const NAME_FRAGMENTATION_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = Date.now();
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const iso = (ms) => new Date(ms).toISOString();
// Email Date header (RFC 2822-ish), which is what the real API passes through.
const rfcDate = (ms) => new Date(ms).toUTCString().replace("GMT", "+0000");
const ymd = (ms) => iso(ms).slice(0, 10);
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const fromHeader = (name, email) => (name ? `${name} <${email}>` : email);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hash = (s) => {
  let h = 0;
  for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};
const clone = (v) => structuredClone(v);

// ---------------------------------------------------------------------------
// Fixtures — one fictional person (Jordan Avery) and their inbox.
// ---------------------------------------------------------------------------

const OWNER = "jordan.avery@example.com";

// [fromName, fromEmail, subject, snippet, hoursAgo, tier, ruleLabels, unsub, mailboxCount]
const QUEUE_ROWS = [
  [
    "Dana Whitfield",
    "dana@whitfield-family.example",
    "Dinner Saturday?",
    "Hey! Are you two free Saturday around 7? We're thinking of trying that new Thai place on Rainbow.",
    0.4,
    "..VIP",
    [],
    false,
    38,
  ],
  [
    "Northwind Bank",
    "alerts@northwindbank.example",
    "Your September statement is ready",
    "Your statement for the account ending in 4417 is now available to view online.",
    1.1,
    "..OK",
    ["Finance"],
    false,
    64,
  ],
  [
    "Contoso Air",
    "deals@contosoair.example",
    "Last chance: fall fares from $59 one-way to 40+ cities, plus double points on every booking through Sunday night",
    "Fall getaway sale ends Sunday. Book now and earn double points on every flight.",
    1.6,
    null,
    [],
    true,
    412,
  ],
  [
    null,
    "noreply@parcelpost.example",
    "Delivery exception for tracking 9400 1118 9922 3401 7781",
    "We attempted delivery but no one was available to sign. A notice was left at your door.",
    2.3,
    null,
    [],
    false,
    7,
  ],
  [
    "The Riverside Community Gardens Volunteer Coordination Committee",
    "volunteers@riversidegardens.example",
    "Workday sign-ups",
    "We need six more hands for the October 18 bed rebuild. Gloves and coffee provided.",
    3,
    null,
    [],
    true,
    22,
  ],
  [
    "Tailspin Toys",
    "orders@tailspintoys.example",
    "🎉 Your order #TT-48213 has shipped!",
    "Good news — your order is on the way. Estimated delivery Thursday.",
    3.8,
    null,
    [],
    true,
    15,
  ],
  [
    "Fabrikam HR",
    "hr@fabrikam.example",
    "Benefits open enrollment closes Friday",
    "Reminder: elections must be submitted in the portal by 5pm Friday or your current plan rolls over.",
    4.5,
    "..VIP",
    ["Work"],
    false,
    120,
  ],
  [
    "Greenleaf Grocers",
    "weekly@greenleafgrocers.example",
    "This week's ad: Honeycrisp apples 99¢/lb",
    "Plus BOGO on pasta, fresh salmon fillets, and a free reusable bag with any $40 purchase.",
    5.2,
    "..OK",
    [],
    true,
    260,
  ],
  [
    "Marcus Lee",
    "marcus.lee@lee-design.example",
    "Re: kitchen remodel quote",
    "Attached is the revised estimate. The cabinet change saves about $1,800. Let me know if you want to walk through it.",
    6.1,
    null,
    [],
    false,
    11,
  ],
  [
    "Lumen Weekly",
    "news@lumen-magazine.example",
    "The Sunday Read: why cities are planting forests on rooftops",
    "A long read on urban canopies, plus this week's letters and a crossword.",
    7.4,
    "..OK",
    [],
    true,
    188,
  ],
  [
    "Adventure Works Outfitters",
    "hello@adventureworks.example",
    "Trail season essentials",
    "New arrivals in hiking boots and lightweight packs.",
    8.2,
    null,
    [],
    true,
    97,
  ],
  [
    "Pat Okafor",
    "pat.okafor@strasz-partners.example",
    "Quarterly review deck — comments by Wed?",
    "Can you look at slides 6-11 before Wednesday? Mostly the pipeline numbers.",
    9,
    "..VIP",
    ["Work"],
    false,
    54,
  ],
  [
    "City Water Utility",
    "billing@citywater.example",
    "Your bill is ready: $84.17 due Oct 21",
    "Autopay is scheduled for October 21. No action needed.",
    11,
    "..OK",
    ["Finance"],
    false,
    30,
  ],
  [
    "Litware Cloud",
    "no-reply@litware.example",
    "Security alert: new sign-in from Chrome on Windows",
    "We noticed a new sign-in to your account. If this was you, you can ignore this message.",
    13,
    null,
    [],
    false,
    19,
  ],
  [
    "Wingtip Wine Club",
    "club@wingtipwines.example",
    "Your October shipment is being prepared",
    "Three reds and a sparkling rosé this month. Skip by Oct 10 to opt out.",
    16,
    null,
    [],
    true,
    44,
  ],
  [
    "Dr. Elena Ruiz's Office",
    "frontdesk@ruizfamilymed.example",
    "Appointment reminder: Tue Oct 14, 9:30 AM",
    "Please reply C to confirm or call to reschedule.",
    20,
    "..VIP",
    [],
    false,
    9,
  ],
  [
    "Coho Fitness",
    "members@cohofitness.example",
    "New class: Saturday sunrise yoga",
    "Starting this weekend at the Summerlin location.",
    26,
    null,
    [],
    true,
    73,
  ],
  [
    "Alpine Ski House",
    "promo@alpineskihouse.example",
    "Early-bird season passes 30% off",
    "Lock in this year's price before November 1.",
    30,
    null,
    [],
    true,
    36,
  ],
  [
    "Sam Avery",
    "sam.avery@example.com",
    "Mom's birthday plan",
    "I booked the brunch for the 26th. Can you handle the cake?",
    34,
    "..VIP",
    [],
    false,
    61,
  ],
  [
    "Proseware Weekly",
    "digest@proseware.example",
    "Your weekly digest",
    "5 new posts from people you follow.",
    40,
    null,
    [],
    true,
    140,
  ],
  [
    "Temecula Valley Balloon Co.",
    "hello@temeculaballoons.example",
    "Sunrise flights are back for fall",
    "Weekend sunrise flights over wine country, champagne toast included.",
    46,
    "..OK",
    [],
    true,
    18,
  ],
  [
    "Woodgrove Insurance",
    "policy@woodgrove.example",
    "Your auto policy renews on Nov 2",
    "Your premium is changing from $612 to $648 for the 6-month term.",
    52,
    null,
    ["Finance"],
    false,
    12,
  ],
  [
    null,
    "alerts@scheduler.example",
    "Reminder",
    "You have 1 upcoming event tomorrow.",
    60,
    null,
    [],
    false,
    5,
  ],
  [
    "Blue Yonder Airlines",
    "itinerary@blueyonder.example",
    "Itinerary change: flight BY 1182",
    "Your departure time has changed from 8:05 AM to 8:40 AM.",
    70,
    null,
    [],
    false,
    8,
  ],
  [
    "Lumen Magazine",
    "news@lumen-magazine.example",
    "Members-only: behind the cover",
    "How we shot this month's cover in a single afternoon.",
    80,
    "..OK",
    [],
    true,
    188,
  ],
];

function makeBody(m) {
  const greeting = m.fromName && !m.unsub ? "Hi Jordan," : "Hello,";
  const promo = m.unsub
    ? `<p style="text-align:center;margin:24px 0"><a href="https://example.com/offer" style="background:#2f2822;color:#fbf8f2;padding:10px 18px;border-radius:6px;text-decoration:none">View in browser</a></p>
       <p style="color:#6b6155;font-size:12px;border-top:1px solid #ddd5c7;padding-top:12px">You are receiving this because you signed up at ${esc(m.fromEmail.split("@")[1])}.
       <a style="color:#6b6155" href="https://example.com/unsubscribe">Unsubscribe</a> · <a style="color:#6b6155" href="https://example.com/prefs">Email preferences</a></p>`
    : `<p>Thanks,<br/>${esc(m.fromName || m.fromEmail)}</p>`;
  return `<div style="max-width:600px;margin:0 auto;font-family:-apple-system,Segoe UI,sans-serif;color:#231d16;line-height:1.5">
  <h2 style="font-size:18px;margin:0 0 12px">${esc(m.subject)}</h2>
  <p>${greeting}</p>
  <p>${esc(m.snippet)}</p>
  <p>This is synthetic mock content — no real email was fetched. Lorem ipsum dolor sit amet,
  consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
  ${promo}
</div>`;
}

function seedMessages() {
  return QUEUE_ROWS.map((r, i) => {
    const [
      fromName,
      fromEmail,
      subject,
      snippet,
      hoursAgo,
      tier,
      ruleLabels,
      unsub,
      count,
    ] = r;
    const m = {
      id: `mock${String(i + 1).padStart(3, "0")}`,
      threadId: `thr${String(i + 1).padStart(3, "0")}`,
      fromName,
      fromEmail,
      subject,
      snippet,
      dateMs: NOW - hoursAgo * HOUR,
      tier,
      ruleLabels,
      unsub,
      mailboxCount: count,
      unread: true,
      state: EMPTY ? "archived" : "inbox", // inbox | archived | trashed | review
    };
    m.listUnsubscribe = unsub
      ? `<https://${fromEmail.split("@")[1]}/unsubscribe?u=mock>, <mailto:unsub@${fromEmail.split("@")[1]}>`
      : null;
    m.listUnsubscribePost = unsub ? "List-Unsubscribe=One-Click" : null;
    m.body = makeBody(m);
    return m;
  });
}

const entry = (email, name, daysAgo) => ({
  email,
  name,
  date: iso(NOW - daysAgo * DAY),
});

function seedVip() {
  return [
    entry("dana@whitfield-family.example", "Dana Whitfield", 210),
    entry("sam.avery@example.com", "Sam Avery", 400),
    entry("hr@fabrikam.example", "Fabrikam HR", 95),
    entry("pat.okafor@strasz-partners.example", "Pat Okafor", 60),
    entry("frontdesk@ruizfamilymed.example", "Dr. Elena Ruiz's Office", 33),
    entry("@strasz-partners.example", null, 300),
    entry("lena.avery@example.com", "Lena Avery", 380),
    entry("coach.reyes@westside-youth-soccer.example", "Coach Reyes", 41),
    entry(
      "principal@desertwillow-elementary.example",
      "Desert Willow Elementary",
      120,
    ),
    entry("accounts@northwindbank.example", "Northwind Bank Fraud Team", 70),
    entry("t.nguyen@lee-design.example", "Tran Nguyen", 14),
    entry("landlord@sagebrush-properties.example", "Sagebrush Properties", 180),
  ];
}

function seedOk() {
  return [
    entry("alerts@northwindbank.example", "Northwind Bank", 200),
    entry("weekly@greenleafgrocers.example", "Greenleaf Grocers", 150),
    // One address under three display names → trips the Fragmented marker (>= 3).
    entry("news@lumen-magazine.example", "Lumen Magazine", 300),
    entry("news@lumen-magazine.example", "Lumen Weekly", 90),
    entry("news@lumen-magazine.example", "The Lumen Daily", 12),
    entry("billing@citywater.example", "City Water Utility", 330),
    entry("hello@temeculaballoons.example", "Temecula Valley Balloon Co.", 45),
    entry("@litware.example", null, 260),
    entry("receipts@tailspintoys.example", "Tailspin Toys", 88),
    entry("statements@woodgrove.example", "Woodgrove Insurance", 140),
    entry("events@vegas-arts-council.example", "Vegas Arts Council", 75),
    entry("newsletter@redrock-trails.example", "Red Rock Trails Alliance", 66),
    entry("library@clarkcounty-library.example", "Clark County Library", 240),
    entry("noreply@pharmacy-plus.example", "PharmacyPlus", 52),
    entry("updates@neighborly.example", "Neighborly", 31),
    entry("pta@desertwillow-elementary.example", "Desert Willow PTA", 110),
    entry("orders@greenleafgrocers.example", "Greenleaf Grocers Delivery", 20),
    entry("tickets@smithcenter.example", "The Smith Center", 99),
    entry("hello@farmbox.example", "FarmBox", 17),
    entry("dispatch@solarco.example", "SolarCo Service", 8),
  ];
}

function seedBlocklist() {
  const reasons = ["junk", "junk", "unsub", "manual"];
  const rows = [
    ["@spamcannon.example", null],
    ["@promo.megamart.example", null],
    ["@mail.clickbait.example", null],
    ["@deals.fastfashion.example", null],
    ["winner@prize-center.example", "Prize Center"],
    ["offers@crypto-moon.example", "CryptoMoon"],
    ["no-reply@warranty-dept.example", "Vehicle Warranty Dept"],
    ["news@daily-hot-takes.example", "Daily Hot Takes"],
    ["promo@bargainbarn.example", "Bargain Barn"],
    ["promo@bargainbarn.example", "Bargain Barn Deals"],
    ["hello@pushy-saas.example", "Pushy SaaS"],
    ["marketing@timeshare-escape.example", "Timeshare Escape"],
    ["alerts@credit-score-now.example", null],
    ["info@seminar-invites.example", "Free Seminar Invitations"],
    ["sales@solar-leads.example", "Solar Leads"],
    ["survey@feedback-farm.example", "Feedback Farm"],
    ["team@growth-hacks.example", "Growth Hacks"],
    ["deals@mattress-blowout.example", "Mattress Blowout"],
    ["noreply@sweepstakes-hub.example", null],
    ["promo@gadget-galaxy.example", "Gadget Galaxy"],
    ["offers@cheap-flights-4u.example", "Cheap Flights 4U"],
    ["hello@influencer-box.example", "Influencer Box"],
    ["digest@clickfarm-news.example", "ClickFarm News"],
    ["specials@pizza-palace.example", "Pizza Palace"],
    ["newsletter@retired-hobby.example", "Retired Hobby Club"],
    ["deals@phone-upgrade.example", "Phone Upgrade Center"],
    ["notify@webinar-blast.example", "Webinar Blast"],
    ["promo@vitamin-vault.example", "Vitamin Vault"],
    ["rewards@loyalty-loop.example", null],
    ["info@political-pac.example", "Citizens for Something"],
  ];
  return rows.map(([email, name], i) => ({
    email,
    name,
    reason: reasons[i % reasons.length],
    date: iso(NOW - (i * 7 + 3) * DAY),
  }));
}

function seedRules() {
  return [
    {
      id: randomUUID(),
      name: "Receipts",
      senders: ["receipts@tailspintoys.example", "@greenleafgrocers.example"],
      subjects: ["receipt", "order confirmation"],
      label: "Receipts",
      skipInbox: true,
      enabled: true,
      date: iso(NOW - 120 * DAY),
    },
    {
      id: randomUUID(),
      name: "Work",
      senders: ["@fabrikam.example", "@strasz-partners.example"],
      subjects: [],
      label: "Work",
      skipInbox: false,
      enabled: true,
      date: iso(NOW - 200 * DAY),
    },
    {
      id: randomUUID(),
      name: "Finance",
      senders: [
        "@northwindbank.example",
        "@woodgrove.example",
        "@citywater.example",
      ],
      subjects: ["statement", "bill"],
      label: "Finance",
      skipInbox: false,
      enabled: true,
      date: iso(NOW - 90 * DAY),
    },
    {
      id: randomUUID(),
      name: "",
      senders: [],
      subjects: ["newsletter", "weekly digest"],
      label: "Reading",
      skipInbox: true,
      enabled: false,
      date: iso(NOW - 30 * DAY),
    },
  ];
}

function seedEvents() {
  const ev = (n, o) => ({
    id: `evt-${n}`,
    title: o.title,
    date: o.days == null ? null : ymd(NOW + o.days * DAY),
    time: o.time ?? null,
    location: o.location,
    url: o.url ?? `https://example.com/events/${n}`,
    canonicalUrl: o.canonical ?? null,
    description: o.description,
    interest: o.interest,
    configuredLocation: o.configuredLocation ?? null,
    rating: o.rating ?? null,
    pricePerPerson: o.price ?? null,
    source: o.source ?? "web",
    foundAt: iso(NOW - 2 * DAY),
    ignored: !!o.ignored,
    calendarEventUrl: null,
  });
  return [
    ev(1, {
      title: "Jazz in the Park: Desert Sky Quartet",
      days: 3,
      time: "7:00 PM",
      location: "Clark County Amphitheater, Las Vegas",
      configuredLocation: "Las Vegas",
      description: "Free outdoor concert; bring a blanket.",
      interest: "live jazz",
      rating: 4.5,
      price: "Free",
      canonical: "https://example.com/jazz-in-the-park",
    }),
    ev(2, {
      title: "Red Rock Canyon Guided Sunrise Hike",
      days: 5,
      time: "6:15 AM",
      location: "Red Rock Canyon, Las Vegas",
      configuredLocation: "Las Vegas",
      description: "Ranger-led 4-mile loop. Registration required.",
      interest: "hiking",
      rating: 4.8,
      price: "$15",
      source: "email",
    }),
    ev(3, {
      title: "Las Vegas Food Truck Rally",
      days: 9,
      time: "5:00 PM",
      location: "Downtown Container Park, Las Vegas",
      configuredLocation: "Las Vegas",
      description: "Thirty trucks, live DJ, family friendly.",
      interest: "food festivals",
      rating: 4.1,
      price: "$5 entry",
    }),
    ev(4, {
      title: "The Smith Center: 'Hamilton' touring cast",
      days: 16,
      time: "7:30 PM",
      location: "The Smith Center, Las Vegas",
      configuredLocation: "Las Vegas",
      description: "Limited run; tickets from $89.",
      interest: "theater",
      rating: 4.9,
      price: "$89+",
      source: "email",
    }),
    ev(5, {
      title: "Las Vegas Pickleball Open — spectators welcome",
      days: 21,
      time: null,
      location: "Sunset Park, Las Vegas",
      configuredLocation: "Las Vegas",
      description: "Regional tournament; free to watch.",
      interest: "pickleball",
      rating: 3.6,
      price: "Free",
    }),
    ev(6, {
      title: "Temecula Balloon & Wine Festival preview night",
      days: 4,
      time: "6:00 PM",
      location: "Lake Skinner, Temecula",
      configuredLocation: "Temecula",
      description: "Balloon glow, tastings from 20 wineries.",
      interest: "wine tasting",
      rating: 4.7,
      price: "$65",
      source: "email",
    }),
    ev(7, {
      title: "Old Town Temecula Farmers Market",
      days: 6,
      time: "8:00 AM",
      location: "Old Town Temecula",
      configuredLocation: "Temecula",
      description: "Every Saturday; local produce and crafts.",
      interest: "farmers markets",
      rating: 4.3,
      price: "Free",
    }),
    ev(8, {
      title: "Harvest crush party at Vineyard Hill",
      days: 12,
      time: "11:00 AM",
      location: "Vineyard Hill Winery, Temecula",
      configuredLocation: "Temecula",
      description: "Grape stomp, lunch, and barrel tasting.",
      interest: "wine tasting",
      rating: 4.4,
      price: "$95",
    }),
    ev(9, {
      title: "Online: Intro to Astrophotography (webinar)",
      days: 8,
      time: "5:30 PM",
      location: "Online",
      description: "Beginner session on phone-based night shots.",
      interest: "photography",
      rating: 3.9,
      price: "Free",
    }),
    ev(10, {
      title: "Comedy night at The Laugh Factory",
      days: 2,
      time: "9:00 PM",
      location: "Tropicana, Las Vegas",
      configuredLocation: "Las Vegas",
      description: "Ignored by the operator — should not appear.",
      interest: "comedy",
      rating: 3.2,
      price: "$40",
      ignored: true,
    }),
    ev(11, {
      title: "Temecula Rod Run car show",
      days: null,
      time: null,
      location: "Old Town Temecula",
      configuredLocation: "Temecula",
      description: "Date to be announced.",
      interest: "car shows",
      rating: null,
      price: null,
    }),
  ];
}

function seedReview() {
  return [
    {
      id: "rev001",
      subject: "Invitation: Desert Willow fall fundraiser gala",
      from: "Desert Willow PTA <pta@desertwillow-elementary.example>",
      date: rfcDate(NOW - 26 * HOUR),
      analysis: {
        summary:
          "The PTA is inviting parents to its fall fundraiser gala on Oct 25 at 6pm. Tickets are $45 and RSVP is requested by Oct 15.",
        action: "keep",
        actionReason:
          "School event with an RSVP deadline the operator likely cares about.",
        isLocalEvent: true,
        events: [
          {
            title: "Desert Willow fall fundraiser gala",
            date: ymd(NOW + 19 * DAY),
            time: "18:00",
            location: "Desert Willow Elementary gym, Las Vegas",
            description: "PTA fundraiser; tickets $45, RSVP by Oct 15.",
            url: "https://example.com/gala",
          },
        ],
        draftReply:
          "Hi! Count us in for two tickets to the gala. Is there a way to pay online?\n\nThanks,\nJordan",
      },
      status: "pending",
      analyzedAt: iso(NOW - 25 * HOUR),
    },
    {
      id: "rev002",
      subject: "Your warranty is about to expire — final notice",
      from: "Vehicle Services Center <notice@auto-protect.example>",
      date: rfcDate(NOW - 50 * HOUR),
      analysis: {
        summary:
          "A generic 'final notice' about an extended vehicle warranty. No account details; typical lead-generation mail.",
        action: "junk",
        actionReason:
          "Unsolicited extended-warranty marketing with urgency language.",
        isLocalEvent: false,
        events: [],
        draftReply: null,
      },
      status: "pending",
      analyzedAt: iso(NOW - 49 * HOUR),
    },
    {
      id: "rev003",
      subject: "Kitchen remodel — site visit options",
      from: "Marcus Lee <marcus.lee@lee-design.example>",
      date: rfcDate(NOW - 74 * HOUR),
      analysis: {
        summary:
          "Marcus offers two site-visit slots (Thu 10am or Fri 2pm) to measure for the revised cabinet layout, and asks which works.",
        action: "keep",
        actionReason:
          "Direct correspondence with a contractor requiring a reply.",
        isLocalEvent: false,
        events: [
          {
            title: "Remodel site visit (option A)",
            date: ymd(NOW + 2 * DAY),
            time: "10:00",
            location: "Home",
            description: "Marcus Lee measuring for cabinets.",
            url: null,
          },
          {
            title: "Remodel site visit (option B)",
            date: ymd(NOW + 3 * DAY),
            time: "14:00",
            location: "Home",
            description: "Marcus Lee measuring for cabinets.",
            url: null,
          },
        ],
        draftReply:
          "Hi Marcus,\n\nThursday at 10 works best. See you then.\n\nJordan",
      },
      status: "pending",
      analyzedAt: iso(NOW - 70 * HOUR),
    },
    {
      id: "rev004",
      subject: "Your order receipt from Greenleaf Grocers",
      from: "Greenleaf Grocers <orders@greenleafgrocers.example>",
      date: rfcDate(NOW - 120 * HOUR),
      analysis: {
        summary: "Receipt for a $62.18 grocery delivery. Nothing to act on.",
        action: "archive",
        actionReason:
          "Transactional receipt; keep for records but no action needed.",
        isLocalEvent: false,
        events: [],
        draftReply: null,
      },
      status: "executed",
      analyzedAt: iso(NOW - 118 * HOUR),
      executedAction: "archive",
      executedAt: iso(NOW - 100 * HOUR),
    },
  ];
}

function seedSettings() {
  return {
    locations: ["Las Vegas", "Temecula"],
    timezone: "America/Los_Angeles",
    schedulerEnabled: true,
    schedulerStartHour: 10,
    schedulerStartMinute: 0,
    schedulerIntervalHours: 2,
    dailySummaryEnabled: true,
    dailySummaryEmail: OWNER,
    dailySummaryHour: 6,
    dailySummaryMinute: 30,
    dailySummaryIntervalUnit: "days",
    dailySummaryIntervalValue: 1,
    dailySummaryLastSentAt: iso(NOW - 9 * HOUR),
    dailySummaryDebug: false,
    dailySummaryDebugEnabledAt: null,
    lastTriageAt: iso(NOW - 3 * HOUR),
    listsViewMode: "table",
    eventInterests: [
      "live jazz",
      "hiking",
      "wine tasting",
      "theater",
      "farmers markets",
      "food festivals",
    ],
    eventsSearchEnabled: true,
    eventsSearchEmail: OWNER,
    eventsSearchIntervalDays: 7,
    eventsSearchLastRunAt: iso(NOW - 2 * DAY),
    schedulerLastRunAt: iso(NOW - 40 * 60_000),
    lastReapply: {},
    readTriageEnabled: true,
    lastReadTriage: null,
    readTriageLocalModelEnabled: false,
    readTriageReportEnabled: false,
    bulkGuardThreshold: BULK_GUARD_THRESHOLD,
  };
}

function seedStats() {
  const daily = [];
  const totals = { kept: 0, cleaned: 0, junked: 0, unsubbed: 0, vip: 0, ok: 0 };
  for (let i = 29; i >= 0; i--) {
    const h = hash(`day${i}`);
    const d = {
      date: ymd(NOW - i * DAY),
      kept: h % 6,
      cleaned: 10 + (h % 35),
      junked: 3 + ((h >> 3) % 18),
      unsubbed: (h >> 5) % 3,
      vip: (h >> 7) % 4,
      ok: 2 + ((h >> 9) % 9),
      inboxSize:
        i % 9 === 4
          ? null
          : 140 + Math.round(60 * Math.sin(i / 4)) + ((h >> 11) % 25),
    };
    for (const k of Object.keys(totals)) totals[k] += d[k];
    daily.push(d);
  }
  // Lifetime totals are larger than the 30-day window.
  return {
    kept: totals.kept + 212,
    cleaned: totals.cleaned + 8410,
    junked: totals.junked + 3127,
    unsubbed: totals.unsubbed + 188,
    vip: totals.vip + 341,
    ok: totals.ok + 2290,
    daily,
  };
}

function seedLog() {
  const rows = [
    {
      type: "triage",
      action: "junk",
      sender: "promo@gadget-galaxy.example",
      senderName: "Gadget Galaxy",
      count: 14,
    },
    { type: "rule", ruleName: "Receipts", label: "Receipts", count: 3 },
    {
      type: "triage",
      action: "ok",
      sender: "weekly@greenleafgrocers.example",
      senderName: "Greenleaf Grocers",
      count: 6,
    },
    { type: "triage", action: "archive", msgId: "old001" },
    {
      type: "triage",
      action: "unsub",
      sender: "deals@mattress-blowout.example",
      senderName: "Mattress Blowout",
      count: 22,
      unsubResult: "one-click-post",
    },
    {
      type: "triage",
      action: "vip",
      sender: "t.nguyen@lee-design.example",
      senderName: "Tran Nguyen",
      count: 2,
    },
    {
      type: "triage",
      action: "ok-clean",
      sender: "updates@neighborly.example",
      senderName: "Neighborly",
      count: 31,
    },
    { type: "rule", ruleName: "Finance", label: "Finance", count: 1 },
    { type: "triage", action: "delete", msgId: "old002" },
    {
      type: "triage",
      action: "junk",
      sender: "team@growth-hacks.example",
      senderName: "Growth Hacks",
      count: 9,
    },
    {
      type: "triage",
      action: "archive-all",
      sender: "hello@influencer-box.example",
      senderName: "Influencer Box",
      count: 47,
    },
    {
      type: "triage",
      action: "unsub",
      sender: "notify@webinar-blast.example",
      senderName: "Webinar Blast",
      count: 12,
      unsubResult: "mailto-sent",
    },
    {
      type: "triage",
      action: "vip-clean",
      sender: "coach.reyes@westside-youth-soccer.example",
      senderName: "Coach Reyes",
      count: 4,
    },
    { type: "rule", ruleName: "Work", label: "Work", count: 5 },
    { type: "triage", action: "review", msgId: "rev001" },
  ];
  return rows.map((r, i) => ({ ts: iso(NOW - (i * 5 + 1) * HOUR), ...r }));
}

function seedLabeled(messages) {
  const items = [];
  const push = (label, m) =>
    items.push({
      label,
      id: m.id,
      subject: m.subject,
      from: fromHeader(m.fromName, m.fromEmail),
      date: rfcDate(m.dateMs),
      snippet: m.snippet,
      isRead: !m.unread,
    });
  for (const m of messages) if (m.tier) push(m.tier, m);
  const extra = [
    [
      "..VIP",
      "Lena Avery",
      "lena.avery@example.com",
      "Photos from the lake",
      "Here are the ones from Sunday — the sunset ones came out great.",
    ],
    [
      "..VIP",
      "Coach Reyes",
      "coach.reyes@westside-youth-soccer.example",
      "Saturday game moved to 9am",
      "Field 3 at Westside. Please arrive by 8:30 for warmups.",
    ],
    [
      "..VIP",
      "Sagebrush Properties",
      "landlord@sagebrush-properties.example",
      "HVAC service visit Thursday",
      "Our technician will need access between 1 and 4pm.",
    ],
    [
      "..OK",
      "Clark County Library",
      "library@clarkcounty-library.example",
      "Your hold is ready for pickup",
      "'The Overstory' is available at the Summerlin branch until Oct 12.",
    ],
    [
      "..OK",
      "The Smith Center",
      "tickets@smithcenter.example",
      "Your tickets for Saturday",
      "Doors open at 6:45pm. Mobile tickets are attached.",
    ],
    [
      "..OK",
      "PharmacyPlus",
      "noreply@pharmacy-plus.example",
      "Prescription ready",
      "Your prescription is ready for pickup at the Rainbow Blvd store.",
    ],
    [
      "..OK",
      "Red Rock Trails Alliance",
      "newsletter@redrock-trails.example",
      "October trail report",
      "Calico Tanks reopens; volunteer cleanup Oct 19.",
    ],
    [
      ".DelPend",
      "Bargain Barn",
      "promo@bargainbarn.example",
      "FLASH SALE 70% OFF",
      "Today only. Everything must go.",
    ],
    [
      ".DelPend",
      "CryptoMoon",
      "offers@crypto-moon.example",
      "You've been selected",
      "Claim your 0.05 BTC airdrop now before it expires.",
    ],
    [
      ".DelPend",
      "Pizza Palace",
      "specials@pizza-palace.example",
      "2 large pizzas for $19.99",
      "This week only — use code TWOFER.",
    ],
    [
      ".DelPend",
      null,
      "rewards@loyalty-loop.example",
      "Your points are expiring",
      "1,250 points expire at the end of the month.",
    ],
    [
      ".DelPend",
      "Webinar Blast",
      "notify@webinar-blast.example",
      "Starts in 1 hour: Growth secrets",
      "Save your seat for today's live session.",
    ],
  ];
  extra.forEach(([label, name, email, subject, snippet], i) =>
    items.push({
      label,
      id: `lab${String(i + 1).padStart(3, "0")}`,
      subject,
      from: fromHeader(name, email),
      date: rfcDate(NOW - (i * 13 + 5) * HOUR),
      snippet,
      isRead: i % 3 !== 0,
    }),
  );
  return items;
}

function seedBackups(blocklist) {
  return {
    single: {
      list: clone(blocklist.slice(0, 24)),
      backedUpAt: iso(NOW - 40 * DAY),
    },
    named: [
      {
        n: 1,
        list: clone(blocklist.slice(0, 18)),
        backedUpAt: iso(NOW - 120 * DAY),
      },
      {
        n: 2,
        list: clone(blocklist.slice(0, 27)),
        backedUpAt: iso(NOW - 15 * DAY),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const state = {};
function resetState() {
  state.messages = seedMessages();
  state.vip = seedVip();
  state.oklist = seedOk();
  state.blocklist = seedBlocklist();
  state.rules = seedRules();
  state.events = seedEvents();
  state.review = seedReview();
  state.settings = seedSettings();
  state.stats = seedStats();
  state.log = seedLog();
  state.labeled = seedLabeled(state.messages);
  state.backups = seedBackups(state.blocklist);
}
resetState();

// ---- Sender-list semantics (mirror app/lib/senderList.js) ----------------

function listMatch(list, fromEmail, fromName = null) {
  const addr = String(fromEmail || "")
    .toLowerCase()
    .trim();
  const domain = addr.split("@")[1] || "";
  const nm = fromName ? fromName.trim() : null;
  return list.find((e) => {
    if (e.email === `@${domain}`) return true;
    if (e.email !== addr) return false;
    return !e.name || !nm || e.name === nm;
  });
}
function distinctNameCount(email) {
  const names = new Set();
  for (const e of [...state.vip, ...state.oklist])
    if (e.email === email && e.name) names.add(e.name);
  return names.size;
}
function listAdd(which, email, name) {
  const list = state[which];
  const key = email.toLowerCase().trim();
  const nm = name ? name.trim() : null;
  const before = nm ? distinctNameCount(key) : null;
  if (!list.find((e) => e.email === key && (nm ? e.name === nm : !e.name)))
    list.push({ email: key, name: nm, date: iso(Date.now()) });
  if (before === null) return false;
  const t = NAME_FRAGMENTATION_THRESHOLD;
  return before < t && distinctNameCount(key) >= t;
}
function listRemove(which, email, name) {
  const key = String(email || "")
    .toLowerCase()
    .trim();
  if (name == null) {
    state[which] = state[which].filter((e) => e.email !== key);
    return;
  }
  const nm = name.trim();
  state[which] = state[which].filter(
    (e) => !(e.email === key && (nm ? e.name === nm : !e.name)),
  );
}
function blockAdd(email, reason, name) {
  const key = email.toLowerCase().trim();
  const nm = name ? name.trim() : null;
  if (
    !state.blocklist.find(
      (e) => e.email === key && (nm ? e.name === nm : !e.name),
    )
  )
    state.blocklist.push({
      email: key,
      name: nm,
      reason,
      date: iso(Date.now()),
    });
}
const isBlocked = (em, nm) => listMatch(state.blocklist, em, nm);
const isListed = (em, nm) =>
  listMatch(state.vip, em, nm) || listMatch(state.oklist, em, nm);
const threshold = () =>
  state.settings.bulkGuardThreshold || BULK_GUARD_THRESHOLD;

// ---- Message helpers -----------------------------------------------------

function shapeTriageEmail(m) {
  // mirrors app/lib/triageApi.js shapeTriageEmail
  return {
    id: m.id,
    threadId: m.threadId,
    fromEmail: m.fromEmail,
    fromName: m.fromName,
    subject: m.subject || "",
    snippet: m.snippet || "",
    date: rfcDate(m.dateMs),
    tier: m.tier ?? null,
    ruleLabels: m.ruleLabels || [],
    hasUnsub: !!m.listUnsubscribe,
    unsubUrl: m.listUnsubscribe || null,
    unsubPost: m.listUnsubscribePost || null,
  };
}
function inboxMessages({ hideListed }) {
  return state.messages
    .filter((m) => m.state === "inbox")
    .filter((m) => !isBlocked(m.fromEmail, m.fromName))
    .filter(
      (m) => !hideListed || (!m.tier && !isListed(m.fromEmail, m.fromName)),
    )
    .sort((a, b) => b.dateMs - a.dateMs);
}
const nameMatches = (m, name) => !name || m.fromName === name;
function senderCount(email) {
  return Math.max(
    0,
    ...state.messages
      .filter((m) => m.fromEmail === email)
      .map((m) => m.mailboxCount),
    state.messages.filter((m) => m.fromEmail === email).length,
  );
}
function addLabeled(label, m) {
  if (state.labeled.some((x) => x.label === label && x.id === m.id)) return;
  state.labeled.unshift({
    label,
    id: m.id,
    subject: m.subject,
    from: fromHeader(m.fromName, m.fromEmail),
    date: rfcDate(m.dateMs),
    snippet: m.snippet,
    isRead: !m.unread,
  });
}
function appendLog(e) {
  state.log.unshift({ ts: iso(Date.now()), ...e });
  if (state.log.length > 250) state.log.length = 250;
}
function addToStats(delta) {
  const d = ymd(Date.now());
  let today = state.stats.daily.find((x) => x.date === d);
  if (!today) {
    today = {
      date: d,
      kept: 0,
      cleaned: 0,
      junked: 0,
      unsubbed: 0,
      vip: 0,
      ok: 0,
      inboxSize: null,
    };
    state.stats.daily.push(today);
  }
  for (const [k, v] of Object.entries(delta)) {
    state.stats[k] = (state.stats[k] || 0) + v;
    today[k] = (today[k] || 0) + v;
  }
}
function guard(o) {
  // mirrors normalizeGuard in app/lib/triageApi.js
  return {
    ok: false,
    guard: {
      count: o.count,
      message: o.message,
      scope: o.scope,
      ...(o.action !== undefined && { action: o.action }),
      ...(o.fromName !== undefined && { fromName: o.fromName }),
    },
  };
}
function guardScope(action, fromName) {
  if (action === "ok-clean" || action === "vip-clean")
    return fromName
      ? `inbox only · only messages named "${fromName}"`
      : "inbox only · any display name";
  return "entire mailbox · any display name";
}
const findMessage = (id) =>
  state.messages.find((m) => m.id === id) ||
  state.labeled.find((m) => m.id === id);

function previewDocument(id, { noMeta = false } = {}) {
  // mirrors buildPreviewDocument in app/triage.js
  let subject, from, date, body;
  const m = state.messages.find((x) => x.id === id);
  const r = state.review.find((x) => x.id === id);
  const l = state.labeled.find((x) => x.id === id);
  if (m) {
    subject = m.subject;
    from = fromHeader(m.fromName, m.fromEmail);
    date = rfcDate(m.dateMs);
    body = m.body;
  } else if (r || l) {
    const src = r || l;
    subject = src.subject;
    from = src.from;
    date = src.date;
    const snip = r ? r.analysis.summary : l.snippet;
    body = `<div style="max-width:600px;font-family:sans-serif;line-height:1.5"><p>Hello Jordan,</p><p>${esc(snip)}</p><p>Synthetic mock content — no real email was fetched.</p></div>`;
  } else {
    subject = "(unknown message)";
    from = "";
    date = "";
    body = "<p>No content</p>";
  }
  const meta = noMeta
    ? ""
    : `<div class='meta'><div><strong>From:</strong> ${esc(from)}</div><div><strong>Subject:</strong> ${esc(subject)}</div><div><strong>Date:</strong> ${esc(date)}</div></div>`;
  return (
    "<!DOCTYPE html><html><head><meta charset='UTF-8'/><base target='_blank'/><style>body{margin:0;padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:14px}.meta{border-bottom:1px solid #e2e8f0;padding-bottom:12px;margin-bottom:16px;color:#475569;font-size:.85rem}.meta strong{color:#1e293b}</style></head><body>" +
    meta +
    body +
    "</body></html>"
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Latency so loading states are visible. Applied to /api only.
app.use("/api", async (req, _res, next) => {
  if (LATENCY > 0) await sleep(LATENCY);
  next();
});
app.use("/api", (req, _res, next) => {
  console.log(`[mock] ${req.method} ${req.originalUrl}`);
  next();
});

// ─── Triage (app/triage.js /api/triage/*) ─────────────────────────────────────
app.get("/api/triage/queue", (req, res) => {
  const hideListed = req.query.hideListed === "1";
  const limit = parseInt(req.query.limit, 10) || 25;
  const emails = inboxMessages({ hideListed })
    .slice(0, limit)
    .map(shapeTriageEmail);
  res.json({ emails, counts: { left: emails.length } });
});

app.get("/api/triage/next", (req, res) => {
  const seenSenders = new Set(
    String(req.query.seen || "")
      .split(",")
      .filter(Boolean),
  );
  const seenIds = new Set(
    String(req.query.seenIds || "")
      .split(",")
      .filter(Boolean),
  );
  const hideListed = req.query.hideListed === "1";
  const m = inboxMessages({ hideListed }).find(
    (x) => !seenIds.has(x.id) && !seenSenders.has(x.fromEmail),
  );
  if (!m) return res.json({ email: null, autoCleaned: [] });
  res.json({ email: shapeTriageEmail(m), autoCleaned: [] });
});

app.get("/api/triage/body", (req, res) => {
  res.set("Content-Security-Policy", "sandbox allow-popups");
  const { id } = req.query;
  if (!id) return res.status(400).send("<pre>Missing id</pre>");
  res.type("html").send(previewDocument(String(id), { noMeta: true }));
});

const ACTIONS = new Set([
  "ok",
  "vip",
  "ok-clean",
  "vip-clean",
  "junk",
  "unsub",
  "archive",
  "delete",
  "review",
  "delete-all",
  "archive-all",
]);
const UNDO = {
  ok: "removeListEntry",
  vip: "removeListEntry",
  "ok-clean": "listOnly",
  "vip-clean": "listOnly",
  junk: "listOnly",
  unsub: "none",
  archive: "addInbox",
  delete: "untrash",
  review: "none",
  "delete-all": "none",
  "archive-all": "none",
};

app.post("/api/triage/action", (req, res) => {
  const { action, id, threadId, fromEmail, fromName, subject, confirmed } =
    req.body || {};
  if (!ACTIONS.has(action))
    return res.status(400).json({ ok: false, error: "Invalid action" });
  const name = fromName || null;
  const undoBase = {
    action,
    id,
    threadId: threadId || null,
    fromEmail,
    fromName: name,
  };
  const msg = state.messages.find((m) => m.id === id);
  const fromSender = (m) => m.fromEmail === fromEmail;

  if (action === "ok" || action === "vip") {
    const isVip = action === "vip";
    const which = isVip ? "vip" : "oklist";
    const tier = isVip ? "..VIP" : "..OK";
    const alreadyListed = !!listMatch(state[which], fromEmail, name);
    let labeled = 0;
    if (!alreadyListed) {
      if (!confirmed) {
        const count = senderCount(fromEmail);
        if (count > threshold())
          return res.json(
            guard({
              count,
              message: `This will label ${count} emails from ${fromEmail}. Confirm?`,
            }),
          );
      }
      listAdd(which, fromEmail, name);
      const hits = state.messages.filter(
        (m) => fromSender(m) && nameMatches(m, name),
      );
      for (const m of hits) {
        m.tier = tier;
        addLabeled(tier, m);
      }
      labeled = Math.max(hits.length, senderCount(fromEmail));
      addToStats({ [isVip ? "vip" : "ok"]: labeled });
    } else {
      labeled = state.messages.filter(
        (m) => fromSender(m) && m.state === "inbox",
      ).length;
    }
    if (msg) msg.unread = false;
    appendLog({
      type: "triage",
      action,
      sender: fromEmail,
      senderName: name,
      count: labeled,
    });
    return res.json({
      ok: true,
      labeled,
      undo: {
        ...undoBase,
        addedToList: !alreadyListed,
        listName: isVip ? "vip" : "ok",
      },
    });
  }

  if (action === "ok-clean" || action === "vip-clean") {
    const isVip = action === "vip-clean";
    const which = isVip ? "vip" : "oklist";
    if (!confirmed) {
      const count = senderCount(fromEmail);
      if (count > threshold())
        return res.json(
          guard({
            count,
            scope: guardScope(action, name),
            message: `This will clean ${count} emails from ${fromEmail}. Confirm?`,
          }),
        );
    }
    const alreadyListed = !!listMatch(state[which], fromEmail, name);
    const hits = state.messages.filter(
      (m) =>
        m.state === "inbox" &&
        fromSender(m) &&
        nameMatches(m, name) &&
        (m.tier !== "..VIP" || m.id === id),
    );
    for (const m of hits) {
      m.state = "archived";
      addLabeled(".DelPend", m);
    }
    const cleaned = hits.length;
    listAdd(which, fromEmail, name);
    addToStats({ cleaned });
    appendLog({
      type: "triage",
      action,
      sender: fromEmail,
      senderName: name,
      count: cleaned,
    });
    return res.json({
      ok: true,
      labeled: cleaned,
      undo: {
        ...undoBase,
        addedToList: !alreadyListed,
        listName: isVip ? "vip" : "ok",
      },
    });
  }

  if (action === "junk" || action === "unsub") {
    if (action === "junk" && !confirmed) {
      const count = senderCount(fromEmail);
      if (count > threshold())
        return res.json(
          guard({
            count,
            scope: guardScope(action, name),
            message: `This will label ${count} emails from ${fromEmail} as junk. Confirm?`,
          }),
        );
    }
    const alreadyListed = !!isBlocked(fromEmail, name);
    blockAdd(fromEmail, action, name);
    const hits = state.messages.filter(
      (m) => m.state === "inbox" && fromSender(m) && nameMatches(m, name),
    );
    for (const m of hits) {
      m.state = "archived";
      addLabeled(".DelPend", m);
    }
    const moved = hits.length;
    const undo = {
      ...undoBase,
      addedToList: !alreadyListed,
      listName: "blocklist",
    };
    if (action === "junk") {
      addToStats({ junked: moved });
      appendLog({
        type: "triage",
        action,
        sender: fromEmail,
        senderName: name,
        count: moved,
      });
      return res.json({ ok: true, labeled: moved, undo });
    }
    const unsubResult = msg?.listUnsubscribePost
      ? "one-click-post"
      : "no-valid-header";
    addToStats({ junked: moved, unsubbed: 1 });
    appendLog({
      type: "triage",
      action,
      sender: fromEmail,
      senderName: name,
      count: moved,
      unsubResult,
    });
    return res.json({
      ok: true,
      labeled: moved,
      unsubResult,
      openTab: false,
      openTabUrl: null,
      undo,
    });
  }

  if (action === "delete-all" || action === "archive-all") {
    const isDelete = action === "delete-all";
    if (!confirmed) {
      const count = senderCount(fromEmail);
      return res.json(
        guard({
          count,
          action,
          fromName: name ?? null,
          scope: guardScope(action, name),
          message: `This will ${isDelete ? "delete" : "archive"} ${count} emails from ${fromEmail}. Confirm?`,
        }),
      );
    }
    const moved = senderCount(fromEmail);
    for (const m of state.messages.filter(fromSender))
      m.state = isDelete ? "trashed" : "archived";
    appendLog({
      type: "triage",
      action,
      sender: fromEmail,
      senderName: name,
      count: moved,
    });
    return res.json({
      ok: true,
      labeled: moved,
      undo: { ...undoBase, addedToList: false },
    });
  }

  if (action === "archive" || action === "delete") {
    const targets =
      action === "archive" && threadId
        ? state.messages.filter((m) => m.threadId === threadId)
        : state.messages.filter((m) => m.id === id);
    for (const m of targets)
      m.state = action === "archive" ? "archived" : "trashed";
    appendLog({ type: "triage", action, msgId: id });
    return res.json({ ok: true, undo: { ...undoBase, addedToList: false } });
  }

  // review
  const analysis = {
    summary:
      `Mock analysis of "${subject || msg?.subject || "(no subject)"}". ${msg?.snippet || ""}`.trim(),
    action: msg?.unsub ? "archive" : "keep",
    actionReason: msg?.unsub
      ? "Promotional mail with no action required."
      : "Personal or transactional mail worth keeping.",
    isLocalEvent: false,
    events: [],
    draftReply: msg?.unsub
      ? null
      : "Thanks — got it. I'll follow up shortly.\n\nJordan",
  };
  state.review.unshift({
    id,
    subject: subject || msg?.subject || "",
    from: msg
      ? fromHeader(msg.fromName, msg.fromEmail)
      : fromHeader(name, fromEmail),
    date: msg ? rfcDate(msg.dateMs) : rfcDate(Date.now()),
    analysis,
    status: "pending",
    analyzedAt: iso(Date.now()),
  });
  if (msg) msg.state = "review"; // For_Review is excluded from the queue query
  return res.json({
    ok: true,
    analysis,
    undo: { ...undoBase, addedToList: false },
  });
});

app.post("/api/triage/undo", (req, res) => {
  const d = req.body || {};
  const spec = UNDO[d.action];
  if (!spec)
    return res.status(400).json({ ok: false, error: "Invalid action" });
  if (spec === "untrash" || spec === "addInbox") {
    const m = state.messages.find((x) => x.id === d.id);
    if (m) m.state = "inbox";
    if (spec === "addInbox" && d.threadId)
      for (const x of state.messages)
        if (x.threadId === d.threadId) x.state = "inbox";
  } else if (
    (spec === "removeListEntry" || spec === "listOnly") &&
    d.addedToList
  ) {
    const which = { vip: "vip", ok: "oklist", blocklist: "blocklist" }[
      d.listName
    ];
    if (which) listRemove(which, d.fromEmail, d.fromName || null);
  }
  res.json({ ok: true });
});

// ─── Preview (old route, used by Review detail iframe) ──────────────────────
app.get("/api/preview/:id", (req, res) => {
  res.send(previewDocument(req.params.id));
});

// ─── Lists ────────────────────────────────────────────────────────────────────
function backupsMeta() {
  const b = state.backups;
  return {
    single: b.single
      ? { backedUpAt: b.single.backedUpAt, count: b.single.list.length }
      : null,
    named: b.named.map((x) => ({
      n: x.n,
      backedUpAt: x.backedUpAt,
      count: x.list.length,
    })),
  };
}
app.get("/api/lists", (_req, res) => {
  res.json({
    ok: true,
    vip: state.vip,
    oklist: state.oklist,
    blocklist: state.blocklist,
    rules: state.rules,
    backups: backupsMeta(),
    counts: {
      vip: state.vip.length,
      ok: state.oklist.length,
      blocklist: state.blocklist.length,
    },
    nameFragmentationThreshold: NAME_FRAGMENTATION_THRESHOLD,
  });
});
app.post("/api/lists/add", (req, res) => {
  const { list, email, name, reason } = req.body || {};
  if (!email) return res.status(400).json({ error: "Missing email" });
  const addr = String(email).trim().toLowerCase();
  const nm = name != null ? String(name).trim() || null : null;
  let fragmented = false;
  if (list === "vip") fragmented = listAdd("vip", addr, nm);
  else if (list === "ok") fragmented = listAdd("oklist", addr, nm);
  else if (list === "blocklist") blockAdd(addr, reason || "manual", nm);
  else return res.status(400).json({ error: "Invalid list" });
  res.json({ ok: true, fragmented });
});
app.post("/api/lists/remove", (req, res) => {
  const { list, email, name } = req.body || {};
  const nm = name != null ? String(name).trim() || null : null;
  const which = { vip: "vip", ok: "oklist", blocklist: "blocklist" }[list];
  if (!which) return res.status(400).json({ error: "Invalid list" });
  listRemove(which, email, nm);
  res.json({ ok: true });
});
app.post("/api/lists/reset-blocklist", (_req, res) => {
  const backedUp = state.blocklist.length;
  state.backups.single = {
    list: clone(state.blocklist),
    backedUpAt: iso(Date.now()),
  };
  state.blocklist = [];
  res.json({ ok: true, backedUp });
});
app.post("/api/lists/backup", (_req, res) => {
  const named = state.backups.named;
  const n = named.length ? Math.max(...named.map((b) => b.n)) + 1 : 1;
  named.push({ n, list: clone(state.blocklist), backedUpAt: iso(Date.now()) });
  res.json({ ok: true, n });
});

// ─── Rules ────────────────────────────────────────────────────────────────────
app.post("/api/rules/add", (req, res) => {
  const { name, senders, subjects, label, skipInbox } = req.body || {};
  if (!label?.trim()) return res.status(400).json({ error: "Missing label" });
  state.rules.push({
    id: randomUUID(),
    name: name?.trim() || "",
    senders: Array.isArray(senders) ? senders : [],
    subjects: Array.isArray(subjects) ? subjects : [],
    label: label.trim(),
    skipInbox: !!skipInbox,
    enabled: true,
    date: iso(Date.now()),
  });
  res.json({ ok: true });
});
app.post("/api/rules/update", (req, res) => {
  const { id, ...updates } = req.body || {};
  if (!id) return res.status(400).json({ error: "Missing id" });
  const i = state.rules.findIndex((r) => r.id === id);
  if (i >= 0) state.rules[i] = { ...state.rules[i], ...updates };
  res.json({ ok: true });
});
app.post("/api/rules/toggle", (req, res) => {
  if (!req.body?.id) return res.status(400).json({ error: "Missing id" });
  const r = state.rules.find((x) => x.id === req.body.id);
  if (r) r.enabled = r.enabled === false;
  res.json({ ok: true, enabled: r ? r.enabled : null });
});
app.post("/api/rules/delete", (req, res) => {
  if (!req.body?.id) return res.status(400).json({ error: "Missing id" });
  state.rules = state.rules.filter((r) => r.id !== req.body.id);
  res.json({ ok: true });
});

// ─── Reapply (SSE) ────────────────────────────────────────────────────────────
function reapplyEntries(list) {
  if (list === "vip") return state.vip;
  if (list === "ok") return state.oklist;
  if (list === "blocklist") return state.blocklist;
  return state.rules.filter((r) => r.enabled !== false);
}
const entryCount = (list, e) =>
  hash(`${list}:${e.email || e.name || e.id}`) %
  (list === "blocklist" ? 12 : 30);

app.post("/api/reapply", async (req, res) => {
  const { list, confirmed } = req.body || {};
  if (!["vip", "ok", "blocklist", "rules"].includes(list))
    return res.status(400).json({ ok: false, error: "Invalid list" });
  const entries = reapplyEntries(list);
  if (!entries.length)
    return res.json({ ok: true, list, totalLabeled: 0, results: [] });

  if (!confirmed) {
    const breakdown = [];
    let totalCount = 0;
    for (const e of entries) {
      const count = entryCount(list, e);
      totalCount += count;
      if (count > 0)
        breakdown.push({
          entry: list === "rules" ? e.name : e.email,
          count,
          query: `mock:${e.email || e.label}`,
        });
    }
    if (totalCount > threshold()) {
      const top10 = [...breakdown]
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      const lines = top10.map((b) => `  ${b.entry}: ~${b.count}`).join("\n");
      return res.json({
        ok: false,
        guard: true,
        count: totalCount,
        list,
        breakdown,
        message: `This will reapply labels to ~${totalCount} emails across ${entries.length} entries.\n\nTop contributors:\n${lines}\n\nConfirm?`,
      });
    }
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const results = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    await sleep(Math.min(120, 2400 / entries.length));
    const labeled = entryCount(list, e);
    const ids = Array.from(
      { length: labeled },
      (_, k) => `ra-${list}-${i}-${k}`,
    );
    if (list === "rules")
      results.push({
        name: e.name,
        label: e.label,
        skipInbox: e.skipInbox,
        labeled,
        ids,
      });
    else results.push({ email: e.email, labeled, ids });
    res.write(
      `data: ${JSON.stringify({ type: "progress", current: i + 1, total: entries.length, email: list === "rules" ? e.name || e.label : e.email })}\n\n`,
    );
  }
  const totalLabeled = results.reduce((s, r) => s + r.labeled, 0);
  const undoable = totalLabeled > 0 ? { list, count: totalLabeled } : null;
  if (undoable)
    state.settings.lastReapply[list] = {
      list,
      ts: iso(Date.now()),
      count: totalLabeled,
    };
  res.write(
    `data: ${JSON.stringify({ type: "done", ok: true, list, totalLabeled, results, undoable })}\n\n`,
  );
  res.end();
});

app.post("/api/reapply/undo", (req, res) => {
  const { list } = req.body || {};
  const record = state.settings.lastReapply?.[list];
  if (!record)
    return res.status(404).json({ ok: false, error: "no_undo_record" });
  delete state.settings.lastReapply[list];
  res.json({
    ok: true,
    list,
    reversed: record.count,
    caveat:
      list === "blocklist" || list === "rules"
        ? "Some previously-read mail was marked unread (read state is not restored)."
        : null,
  });
});

// ─── Events ───────────────────────────────────────────────────────────────────
app.get("/api/events", (_req, res) => {
  const today = ymd(Date.now());
  const active = state.events
    .filter((e) => !e.ignored && (!e.date || e.date >= today))
    .sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date.localeCompare(b.date);
    });
  const grouped = {};
  for (const e of active) {
    const key = e.configuredLocation || e.location || "Other";
    (grouped[key] = grouped[key] || []).push(e);
  }
  const order = new Map(state.settings.locations.map((l, i) => [l, i]));
  const keys = Object.keys(grouped).sort((a, b) => {
    const ai = order.has(a) ? order.get(a) : Infinity;
    const bi = order.has(b) ? order.get(b) : Infinity;
    return ai !== bi ? ai - bi : a.localeCompare(b);
  });
  const interests = state.settings.eventInterests || [];
  res.json({
    ok: true,
    groups: keys.map((location) => ({ location, events: grouped[location] })),
    lastRunAt: state.settings.eventsSearchLastRunAt,
    interests,
    hasInterests: interests.length > 0,
  });
});
app.post("/api/events/ignore", (req, res) => {
  const e = state.events.find((x) => x.id === req.body?.id);
  if (e) e.ignored = true;
  res.json({ ok: true });
});
app.post("/api/events/calendar", (req, res) => {
  const { id } = req.body || {};
  const url = `https://example.com/mock-calendar/event/${encodeURIComponent(id || randomUUID())}`;
  const e = state.events.find((x) => x.id === id);
  if (e) e.calendarEventUrl = url;
  res.json({ ok: true, url });
});
let searchSeq = 100;
function mockSearchAdd() {
  const n = ++searchSeq;
  state.events.push({
    id: `evt-${n}`,
    title: `Mock search result #${n}: Sunset market`,
    date: ymd(Date.now() + ((n % 20) + 1) * DAY),
    time: "5:00 PM",
    location: "Henderson Pavilion, Las Vegas",
    url: `https://example.com/events/${n}`,
    canonicalUrl: null,
    description: "Added by a mock 'Search now' run.",
    interest: "farmers markets",
    configuredLocation: "Las Vegas",
    rating: 4,
    pricePerPerson: "Free",
    source: "web",
    foundAt: iso(Date.now()),
    ignored: false,
    calendarEventUrl: null,
  });
  state.settings.eventsSearchLastRunAt = iso(Date.now());
}
app.post("/api/events/search", async (_req, res) => {
  await sleep(1200);
  mockSearchAdd();
  res.json({ ok: true, added: 1 });
});
app.post("/api/events/send-email", (_req, res) => res.json({ ok: true }));
app.post("/api/events/reset-rebuild", async (_req, res) => {
  await sleep(1500);
  state.events = seedEvents();
  state.settings.eventsSearchLastRunAt = iso(Date.now());
  res.json({ ok: true, added: state.events.length });
});

// ─── Review ───────────────────────────────────────────────────────────────────
app.get("/api/review", (_req, res) =>
  res.json({ ok: true, items: state.review }),
);
app.post("/api/review/execute", (req, res) => {
  const { id, action } = req.body || {};
  const item = state.review.find((i) => i.id === id);
  if (!item)
    return res.status(404).json({ ok: false, error: "Item not found" });
  const m = /<([^>]+)>/.exec(item.from);
  const fromEmail = (m ? m[1] : item.from).toLowerCase();
  const fromName = m ? item.from.slice(0, m.index).trim() : null;
  if (action === "keep") listAdd("oklist", fromEmail, fromName || null);
  else if (action === "junk") blockAdd(fromEmail, "junk", fromName || null);
  Object.assign(item, {
    status: "executed",
    executedAction: action,
    executedAt: iso(Date.now()),
  });
  res.json({ ok: true });
});
app.post("/api/review/calendar", (req, res) => {
  const { id, eventIndex } = req.body || {};
  const url = `https://example.com/mock-calendar/event/${encodeURIComponent(`${id}-${eventIndex ?? 0}`)}`;
  const item = state.review.find((i) => i.id === id);
  if (item)
    item.calendarLinks = {
      ...(item.calendarLinks || {}),
      [String(eventIndex ?? 0)]: url,
    };
  res.json({ ok: true, url });
});
app.post("/api/review/dismiss", (req, res) => {
  state.review = state.review.filter((i) => i.id !== req.body?.id);
  const m = state.messages.find((x) => x.id === req.body?.id);
  if (m && m.state === "review") m.state = "inbox";
  res.json({ ok: true });
});

// ─── Settings ─────────────────────────────────────────────────────────────────
app.get("/api/settings", (_req, res) => {
  res.json({
    ok: true,
    settings: state.settings,
    activityLog: state.log.slice(0, 200),
    backups: backupsMeta(),
    stats: state.stats,
    bulkGuardThreshold: threshold(),
  });
});
const s = () => state.settings;
const ok = (res) => res.json({ ok: true });
app.post("/api/settings/scheduler", (req, res) => {
  const { enabled, startHour, startMinute, intervalHours } = req.body || {};
  Object.assign(s(), {
    schedulerEnabled: !!enabled,
    schedulerStartHour: parseInt(startHour),
    schedulerStartMinute: parseInt(startMinute) || 0,
    schedulerIntervalHours: parseFloat(intervalHours),
  });
  ok(res);
});
app.post("/api/settings/daily-summary", (req, res) => {
  const { enabled, email } = req.body || {};
  Object.assign(s(), {
    dailySummaryEnabled: !!enabled,
    dailySummaryEmail: String(email || "").trim(),
  });
  ok(res);
});
app.post("/api/settings/daily-summary-schedule", (req, res) => {
  const { hour, minute, intervalValue, intervalUnit } = req.body || {};
  Object.assign(s(), {
    dailySummaryHour: Math.min(23, Math.max(0, parseInt(hour) || 6)),
    dailySummaryMinute: Math.min(59, Math.max(0, parseInt(minute) || 0)),
    dailySummaryIntervalUnit: ["hours", "days", "weeks"].includes(intervalUnit)
      ? intervalUnit
      : "days",
    dailySummaryIntervalValue: Math.max(1, parseInt(intervalValue) || 1),
  });
  ok(res);
});
app.post("/api/settings/events-search", (req, res) => {
  const { enabled, intervalDays, email } = req.body || {};
  s().eventsSearchEnabled = !!enabled;
  s().eventsSearchIntervalDays = Math.max(1, parseInt(intervalDays) || 7);
  if (email !== undefined) s().eventsSearchEmail = email || null;
  ok(res);
});
app.post("/api/settings/timezone", (req, res) => {
  const tz = req.body?.timezone;
  if (tz?.trim()) s().timezone = tz.trim();
  ok(res);
});
app.post("/api/settings/lists-view-mode", (req, res) => {
  s().listsViewMode = req.body?.mode === "compact" ? "compact" : "table";
  ok(res);
});
app.post("/api/settings/bulk-guard-threshold", (req, res) => {
  const n = req.body?.threshold;
  if (typeof n === "number" && Number.isFinite(n) && n > 0)
    s().bulkGuardThreshold = Math.floor(n);
  else delete s().bulkGuardThreshold;
  res.json({ ok: true, threshold: threshold() });
});
app.post("/api/settings/locations/add", (req, res) => {
  const loc = req.body?.location?.trim();
  if (loc && !s().locations.includes(loc)) s().locations.push(loc);
  ok(res);
});
app.post("/api/settings/locations/remove", (req, res) => {
  s().locations = s().locations.filter((l) => l !== req.body?.location);
  ok(res);
});
app.post("/api/settings/event-interests/add", (req, res) => {
  const t = String(req.body?.topic || "").trim();
  if (t && !s().eventInterests.includes(t)) s().eventInterests.push(t);
  ok(res);
});
app.post("/api/settings/event-interests/remove", (req, res) => {
  s().eventInterests = s().eventInterests.filter(
    (t) => t !== (req.body?.topic || ""),
  );
  ok(res);
});
app.post("/api/settings/event-interests/edit", (req, res) => {
  const { old: o, new: n } = req.body || {};
  const i = o && n ? s().eventInterests.indexOf(o) : -1;
  if (i >= 0) s().eventInterests[i] = n.trim();
  ok(res);
});
app.post("/api/settings/run-scan", async (_req, res) => {
  await sleep(900);
  s().schedulerLastRunAt = iso(Date.now());
  const timeLabel = new Date().toLocaleString("en-US", {
    timeZone: s().timezone,
    hour: "numeric",
    minute: "2-digit",
  });
  res.json({
    ok: true,
    totalMoved: 9,
    blocklistMoved: 5,
    vipMoved: 1,
    okMoved: 2,
    rulesMoved: 1,
    timeLabel,
  });
});
function mergeInto(current, incoming) {
  const merged = [...current];
  for (const e of incoming)
    if (
      !merged.find(
        (c) => c.email === e.email && (e.name ? c.name === e.name : !c.name),
      )
    )
      merged.push(e);
  return merged;
}
const isMerge = (m) => m === "true" || m === true;
app.post("/api/settings/restore-blocklist-backup", (req, res) => {
  const b = state.backups.single;
  if (!b) return res.status(500).json({ error: "Internal server error" });
  state.blocklist = isMerge(req.body?.merge)
    ? mergeInto(state.blocklist, clone(b.list))
    : clone(b.list);
  res.json({ ok: true, restored: state.blocklist.length });
});
app.post("/api/settings/restore-named-backup", (req, res) => {
  const b = state.backups.named.find((x) => x.n === parseInt(req.body?.n));
  if (!b) return res.status(500).json({ error: "Internal server error" });
  state.blocklist = isMerge(req.body?.merge)
    ? mergeInto(state.blocklist, clone(b.list))
    : clone(b.list);
  res.json({ ok: true, restored: state.blocklist.length });
});
app.post("/api/settings/delete-named-backup", (req, res) => {
  const n = parseInt(req.body?.n);
  if (req.body?.n == null || Number.isNaN(n))
    return res.status(400).json({ error: "Missing or invalid n" });
  state.backups.named = state.backups.named.filter((b) => b.n !== n);
  ok(res);
});

// ─── Labeled ──────────────────────────────────────────────────────────────────
app.get("/api/labeled", (req, res) => {
  const { label } = req.query;
  if (!["..VIP", "..OK", ".DelPend"].includes(label))
    return res.status(400).json({ ok: false });
  const items = state.labeled
    .filter((x) => x.label === label)
    .map(({ label: _l, ...rest }) => rest);
  res.json({ ok: true, label, items });
});

// ─── Read-triage undo (not called by the React app today; shape kept for parity)
app.post("/api/read-triage/undo", (_req, res) =>
  res.json({ ok: true, restored: 0, message: "Nothing to undo." }),
);

// ─── Mock-only helpers ────────────────────────────────────────────────────────
app.post("/api/__mock/reset", (_req, res) => {
  resetState();
  res.json({ ok: true });
});
app.get("/health", (_req, res) =>
  res.json({ status: "ok", version: "mock", mock: true }),
);

// Unknown API route: make the gap loud rather than falling through to the SPA.
app.use("/api", (req, res) => {
  console.warn(`[mock] UNIMPLEMENTED ${req.method} ${req.originalUrl}`);
  res.status(404).json({ ok: false, error: "not_implemented_in_mock" });
});

// Old-UI links the React app points out to (/legacy, /auth, /sender).
const placeholder = (title) => (req, res) =>
  res
    .type("html")
    .send(
      `<!DOCTYPE html><meta charset="utf-8"><title>${title}</title><body style="font-family:sans-serif;padding:32px"><h2>${title}</h2><p>This old-UI page is not available in the mock server.</p><p><code>${esc(req.originalUrl)}</code></p><p><a href="/app/">Back to the app</a></p>`,
    );
app.get("/legacy", placeholder("Legacy UI"));
app.get("/auth", placeholder("Gmail re-auth"));
app.get("/sender", placeholder("Sender drill-down"));

// ─── Static SPA ───────────────────────────────────────────────────────────────
if (!fs.existsSync(path.join(WEB_DIST, "index.html")))
  console.warn(
    `[mock] ${WEB_DIST}/index.html not found — run: npm --prefix web run build`,
  );
app.get("/", (_req, res) => res.redirect("/app/"));
app.use("/app", express.static(WEB_DIST));
app.get(/^\/app(\/.*)?$/, (_req, res) =>
  res.sendFile(path.join(WEB_DIST, "index.html")),
);

app.listen(PORT, () => {
  console.log(`Gmail Triage MOCK UI server: http://localhost:${PORT}/app/`);
  console.log(
    `  latency ${LATENCY}ms${EMPTY ? " · empty queue (MOCK_EMPTY=1)" : ""} · in-memory state, no Gmail/Google/Anthropic calls`,
  );
});
