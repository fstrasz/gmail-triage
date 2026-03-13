<h1 align="center">📧&nbsp; Gmail Triage</h1>

<p align="center">
  <strong>Stop drowning in email. Triage your inbox one message at a time.<br>
  Powered by Gmail API &amp; Anthropic Claude.</strong>
</p>

<p align="center">
  <a href="#-quick-start"><img src="https://img.shields.io/badge/Quick_Start-4_Steps-blue?style=for-the-badge" alt="Quick Start"></a>
  <a href="#-features"><img src="https://img.shields.io/badge/Actions-9_Types-green?style=for-the-badge" alt="Actions"></a>
  <a href="#-deployment-optional"><img src="https://img.shields.io/badge/Deploy-Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-≥20-brightgreen?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/express-4.x-lightgrey?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Gmail_API-OAuth2-red?logo=gmail&logoColor=white" alt="Gmail API">
  <img src="https://img.shields.io/badge/Claude_API-Anthropic-blueviolet" alt="Anthropic">
  <img src="https://img.shields.io/badge/storage-JSON_files-orange" alt="Storage">
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="License">
</p>

---

## ✨ Features

### Triage Queue
Fetches up to 25 unread emails and presents them one at a time. Each email shows the sender, subject, and a row of action buttons: VIP, OK, OK & Clean, Junk, Unsubscribe, Archive, Delete, and Review. As emails are actioned, new ones are automatically loaded to keep the queue topped up.

### Tier Labels
Senders can be marked as `..VIP` or `..OK` (the `..` prefix causes these labels to sort to the top of Gmail's label list). On each triage load, all inbox emails from known VIP/OK senders are automatically labeled. Unread VIP/OK emails still appear in the triage queue; already-read ones are skipped.

### Blocklist
Senders are blocked by email address + display name, or by entire domain (e.g. `@example.com`). On each triage load, the blocklist is scanned against the inbox via Gmail queries and any matching emails are labeled `.DelPend` and removed from the inbox. Blocked senders are also filtered out of the triage queue before it renders.

### OK & Clean
Labels the current email `..OK` (marking the sender as trusted), then finds every other email from that same sender — matched by both email address and display name — and labels them all `.DelPend`. Cleans up an entire sender's history in one click.

### Auto-unsubscribe
Reads the `List-Unsubscribe` and `List-Unsubscribe-Post` headers. Attempts removal in this order: (1) RFC 8058 one-click POST if supported, (2) HTTP GET to the unsubscribe URL, (3) sends an unsubscribe email via the Gmail API using the `mailto:` address, (4) opens the URL in a new browser tab as a last resort.

### Claude AI Analysis
Uses Claude to analyze the full email body and return a structured response: a plain-English summary, a suggested action with reasoning, detection of local real-world events based on your configured locations, extracted calendar events, and a suggested draft reply.

### Google Calendar Integration
When Claude detects events in an email, the extracted event details are surfaced in the Review queue. A single click creates the event directly in your primary Google Calendar using your configured timezone.

### Review Queue
Clicking Review fetches the full email body, sends it to Claude for analysis, labels it `For_Review` in Gmail, and adds it to a queue at `/review`. From there you can act on Claude's recommendation: Keep, Archive, Junk, create Calendar events, or Dismiss.

### Stats
Tracks per-action counts (kept, cleaned, junked, unsubscribed, VIP, OK) as running totals and daily breakdowns, and snapshots inbox size over time. Viewable at `/stats`.

---

## ⏰ Auto-Clean Scheduler

Gmail Triage includes a built-in background scheduler that automatically runs the blocklist, VIP, and OK scans on a configurable schedule — no manual triage needed.

### How It Works

The scheduler runs silently in the background. At each scheduled time it:
1. Scans the inbox for any emails matching blocked senders and labels them `.DelPend`
2. Scans for VIP-listed senders and labels matching inbox emails `..VIP`
3. Scans for OK-listed senders and labels matching inbox emails `..OK`

Results are logged and shown the next time you open the triage app — only activity since your last visit is displayed, so you always see what's new.

### Configuration (Settings Page)

| Setting | Default | Description |
|---------|---------|-------------|
| Enabled | On | Enable or disable automatic scheduled runs |
| Start time | 10:00 AM | Hour and minute the schedule begins each day |
| Interval | Every 2 hours | How often to run — options include 30 min, 1h, 2h, 3h, 4h, 6h |

All times use the timezone configured in Settings. The scheduler reads its configuration fresh on each run, so changes take effect at the next cycle without a restart.

**Example:** Start time 10:00 AM, interval 30 min → runs at 10:00, 10:30, 11:00, 11:30 ... until midnight, then resumes the next day.

### Manual Run

A **Run Auto-Clean Now** button in Settings triggers a full scan immediately — useful for testing or running on-demand outside the schedule. Results are included in the activity log and daily email summary just like a scheduled run.

---

## 📬 Daily Email Summary

Every morning at 6:00 AM, Gmail Triage can send you a summary of everything that was auto-cleaned in the last 24 hours.

### Email Design

The summary email is formatted as a clean HTML digest:

- **Header** — App name, date, and total emails labeled
- **Stat chips** — Color-coded counts by category: Blocked (red), VIP (blue), OK (green). Only categories with activity are shown.
- **Run sections** — Activity grouped by the time each auto-clean ran, showing the sender (as a clickable Gmail search link), reason, label category badge, and count
- **All clear state** — If nothing was cleaned, the email says so cleanly rather than sending an empty table

Clicking a sender's name opens a Gmail search filtered to emails from that address with the relevant label, making it easy to review what was cleaned.

### Configuration (Settings Page)

| Setting | Description |
|---------|-------------|
| Enabled | Turn the daily email on or off |
| Recipient | Email address to send to. Leave blank to send to your own Gmail account. |
| Send Test Email Now | Sends the summary immediately, covering the past 24h of activity |
| Debug mode | Sends the summary after **every** auto-clean run (scheduled or manual). Automatically disables itself after 12 hours. Useful for validating the email output during setup. |

### Activity Log Behavior

The activity log (`scan-log.json`) accumulates entries for 25 hours and is automatically trimmed on each write. Opening the triage app does **not** clear the log — it simply records when you last visited so it can show only new activity. This ensures the daily email always has access to the full 24-hour window regardless of how often you use the app.

---

## ⚙️ Settings

The Settings page at `/settings` is the control center for all configuration.

### Locations
A list of cities or regions used by Claude's AI analysis to detect locally relevant events. Add locations manually (e.g., "Las Vegas, NV") or use the **Use My Location** button to detect via browser geolocation (reverse-geocoded using OpenStreetMap). Leave the list empty for "All" mode where Claude surfaces local events globally.

### Timezone
Used for scheduling, log timestamps, and email formatting. Defaults to `America/Los_Angeles`.

### Auto-Clean Schedule
Controls the background scheduler — start time, interval, and enable/disable. See [Auto-Clean Scheduler](#-auto-clean-scheduler) above.

### Daily Email Summary
Controls the 6am digest email. See [Daily Email Summary](#-daily-email-summary) above.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥ 20, ES Modules |
| Web server | Express 4.x |
| Email | Gmail API (OAuth2) |
| AI | Anthropic Claude API |
| Calendar | Google Calendar API |
| Scheduling | `setTimeout`-based, timezone-aware (no extra packages) |
| Containerization | Docker / Docker Compose |
| Storage | JSON files in `config/` — no database |
| Deployment | `deploy.ps1` — robocopy to NAS |

---

## 🚀 Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (Desktop, Engine, or any Docker-compatible runtime)
- A [Google Cloud project](https://console.cloud.google.com/) with the Gmail API enabled
- An [Anthropic API key](https://console.anthropic.com/)

---

### Step 1: Clone the repo

```bash
git clone <repo-url>
cd gmail-triage
```

---

### Step 2: Set up the `config/` folder

The `config/` directory is not included in the repo (gitignored). Run the setup script to create it:

```powershell
.\scripts\setup-config.ps1
```

This will:
- Create the `config/` directory
- Prompt for your Anthropic API key and write `config/.env`
- Tell you if `credentials.json` is missing and what to do

This also creates `config/settings.json` with default locations. All other JSON data files (`blocklist.json`, `viplist.json`, `scan-log.json`, etc.) are created automatically by the app on first run.

**`config/credentials.json`** must be obtained manually from Google Cloud:

1. Go to [https://console.cloud.google.com/](https://console.cloud.google.com/)
2. Create a project and enable the **Gmail API**
3. Go to **APIs & Services > Credentials**
4. Create an **OAuth 2.0 Client ID** (Desktop app type)
5. Download the JSON and save it as `config/credentials.json`

```json
{
  "installed": {
    "client_id": "...",
    "client_secret": "...",
    "redirect_uris": ["http://localhost"]
  }
}
```

---

### Step 3: Authorize Gmail access *(first time only)*

```bash
cd app
npm install
node auth.js
```

Follow the browser prompt, grant access, and confirm the token was saved to `config/token.json`.

---

### Step 4: Run with Docker

```bash
docker-compose up
```

The app will be available at [http://localhost:3000](http://localhost:3000).

To run in the background:

```bash
docker-compose up -d
```

---

## 🔑 Gmail OAuth Scopes

| Scope | Purpose |
|-------|---------|
| `gmail.modify` | Read, label, and move emails |
| `gmail.labels` | Create and manage labels |
| `gmail.send` | Send unsubscribe requests and daily summary emails |
| `gmail.settings.basic` | Read filter/settings info |

---

## 📁 Project Structure

```
gmail-triage/
├── app/
│   ├── triage.js          # Express routes
│   ├── auth.js            # One-time OAuth2 setup
│   └── lib/
│       ├── gmail.js       # Gmail API wrapper (scan, label, block)
│       ├── pages.js       # HTML page rendering
│       ├── html.js        # Shell and email card templates
│       ├── blocklist.js   # Blocklist logic
│       ├── viplist.js     # VIP and OK list logic
│       ├── scheduler.js   # Auto-clean scheduler + daily email summary
│       ├── settings.js    # Settings load/save (timezone, schedule, etc.)
│       ├── stats.js       # Stats tracking
│       ├── unsub.js       # Auto-unsubscribe
│       ├── keepClean.js   # OK & Clean logic
│       ├── claude.js      # Anthropic Claude integration
│       ├── calendar.js    # Google Calendar integration
│       └── review.js      # Review queue
├── config/                # Not in git — created by setup script
│   ├── credentials.json   # Google OAuth credentials (manual)
│   ├── token.json         # OAuth token (generated by auth.js)
│   ├── settings.json      # App settings (locations, timezone, schedule)
│   ├── blocklist.json     # Blocked senders
│   ├── viplist.json       # VIP senders
│   ├── oklist.json        # OK senders
│   ├── scan-log.json      # 25h rolling log of auto-clean activity
│   └── stats.json         # Action and inbox-size history
├── scripts/
│   └── setup-config.ps1   # First-time config setup
├── Dockerfile
├── compose.yaml
└── deploy.ps1             # Sync to NAS via robocopy; auto-bumps version
```

---

## 🚢 Deployment *(optional)*

`deploy.ps1` syncs the app to a mapped network drive (e.g., a NAS) using robocopy. It automatically increments the app version on each deploy and commits it locally — no GitHub push. Config files are synced separately and credentials are never copied.

```powershell
.\deploy.ps1          # deploy (bumps version, syncs to Y:\gmail-triage)
.\deploy.ps1 -WhatIf  # dry run (no version bump, no files copied)
```

Every 10th version, the script shows a reminder to consider tagging a stable GitHub release.
