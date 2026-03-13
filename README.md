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

• **Triage queue** - Fetches up to 25 unread emails and presents them one at a time. Each email shows the sender, subject, and a row of action buttons: VIP, OK, OK & Clean, Junk, Unsubscribe, Archive, Delete, and Review. As emails are actioned, new ones are automatically loaded to keep the queue topped up.

• **Tier labels** - Senders can be marked as `..VIP` or `..OK` (the `..` prefix causes these labels to sort to the top of Gmail's label list). On each triage load, all inbox emails from known VIP/OK senders are automatically labeled. Unread VIP/OK emails still appear in the triage queue; already-read ones are skipped.

• **Blocklist** - Senders are blocked by email address + display name, or by entire domain (e.g. `@example.com`). On each triage load, the blocklist is scanned against the inbox via Gmail queries and any matching emails (verified by display name where a name is stored) are labeled `DelPend` and removed from the inbox. Blocked senders are also filtered out of the triage queue before it renders.

• **OK & Clean** - Labels the current email `..OK` (marking the sender as trusted and keeping it in the inbox), then finds every other email from that same sender — matched by both email address and display name — and labels them all `DelPend`. Cleans up an entire sender's history in one click.

• **Auto-unsubscribe** - Reads the `List-Unsubscribe` and `List-Unsubscribe-Post` headers. Attempts removal in this order: (1) RFC 8058 one-click POST if supported, (2) HTTP GET to the unsubscribe URL, (3) sends an unsubscribe email via the Gmail API using the `mailto:` address, (4) opens the URL in a new browser tab as a last resort. If no header exists at all, opens a pre-filled Gmail compose window addressed to the sender.

• **Claude AI analysis** - Uses Claude Opus to analyze the full email body and return a structured response: a plain-English summary, a suggested action (keep / archive / junk / none) with reasoning, detection of local real-world events (based on your configured locations), a list of extracted calendar events with title, date, time, location, and description, and a suggested draft reply when one is warranted.

• **Google Calendar integration** - When Claude detects local events in an email, the extracted event details (title, date, time, location) are surfaced in the Review queue. A single click creates the event directly in your primary Google Calendar using your configured timezone (set in Settings).

• **Review queue** - Clicking Review on any email fetches its full body, sends it to Claude for analysis, labels it `For_Review` in Gmail, and adds it to a queue at `/review`. From there you can act on Claude's recommendation: Keep (adds sender to OK list), Archive, Junk (blocks sender), create Calendar events from detected dates, or Dismiss to clear it from the queue.

• **Settings** - A settings page at `/settings` lets you manage locations of interest for Claude's AI analysis. Add locations manually (e.g., "Las Vegas, NV"), detect your current location automatically via browser geolocation (reverse-geocoded using OpenStreetMap Nominatim), or leave the list empty for "All" mode where Claude surfaces local events regardless of location. Changes take effect immediately on the next email analyzed.

• **Stats** - Tracks per-action counts (kept, cleaned, junked, unsubscribed, VIP, OK) as both running totals and daily breakdowns, and snapshots inbox size over time. Viewable at `/stats`.

---

## 🛠 Tech Stack

• **Node.js / Express** - ES Modules, runs on port 3000

• **Gmail API** - Google OAuth2 for full inbox access

• **Anthropic Claude API** - AI-powered email analysis

• **Docker / Docker Compose** - Containerized, runs on any Docker-compatible runtime

• **No database** - All state stored as JSON files in `config/`

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

This also creates `config/settings.json` with default locations (Las Vegas, NV and Temecula, CA). You can change these anytime from the Settings page at `/settings`. All other JSON data files (`blocklist.json`, `viplist.json`, etc.) are created automatically by the app on first run.

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

This opens a browser window to authorize the app against your Google account and saves `config/token.json`.

```bash
cd app
npm install
node auth.js
```

Follow the browser prompt, grant access, and confirm the token was saved.

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
| `gmail.send` | Send unsubscribe requests |
| `gmail.settings.basic` | Read filter/settings info |

---

## 📁 Project Structure

```
gmail-triage/
├── app/
│   ├── triage.js          # Express routes
│   ├── auth.js            # One-time OAuth2 setup
│   └── lib/
│       ├── gmail.js       # Gmail API wrapper
│       ├── pages.js       # HTML page rendering
│       ├── html.js        # Shell and email card templates
│       ├── blocklist.js   # Blocklist logic
│       ├── viplist.js     # VIP and OK list logic
│       ├── stats.js       # Stats tracking
│       ├── unsub.js       # Auto-unsubscribe
│       ├── keepClean.js   # OK & Clean logic
│       ├── keptlist.js    # Kept senders list
│       ├── claude.js      # Anthropic Claude integration
│       ├── calendar.js    # Google Calendar integration
│       ├── review.js      # Review queue
│       └── settings.js    # Settings (locations) load/save
├── config/                # Not in git — created by setup script
├── scripts/
│   └── setup-config.ps1   # First-time config setup
├── Dockerfile
├── compose.yaml
└── deploy.ps1             # Sync to NAS via robocopy (optional)
```

---

## 🚢 Deployment *(optional)*

`deploy.ps1` syncs the app to a mapped network drive (e.g., a NAS) using robocopy. Edit the destination path in the script to match your setup. Config files are synced separately and credentials are never copied.

```powershell
.\deploy.ps1          # deploy
.\deploy.ps1 -WhatIf  # dry run
```
