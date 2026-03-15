<h1 align="center">📧&nbsp; Gmail Triage</h1>

<p align="center">
  <strong>Stop drowning in email. Triage your inbox one message at a time.<br>
  Powered by Gmail API &amp; Anthropic Claude.</strong>
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/Quick_Start-4_Steps-blue?style=for-the-badge" alt="Quick Start"></a>
  <a href="#features"><img src="https://img.shields.io/badge/Actions-9_Types-green?style=for-the-badge" alt="Actions"></a>
  <a href="#deployment-optional"><img src="https://img.shields.io/badge/Deploy-Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%E2%89%A520-brightgreen?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/express-4.x-lightgrey?logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Gmail_API-OAuth2-red?logo=gmail&logoColor=white" alt="Gmail API">
  <img src="https://img.shields.io/badge/Claude_API-Anthropic-blueviolet" alt="Anthropic">
  <img src="https://img.shields.io/badge/storage-JSON_files-orange" alt="Storage">
  <img src="https://img.shields.io/badge/license-MIT-yellow" alt="License">
</p>

---

## Features

### Inbox Triage

- **Triage queue** — Fetches up to 25 unread emails and presents them one at a time with sender, subject, and action buttons: VIP, OK, OK & Clean, Junk, Unsubscribe, Archive, Delete, and Review. As emails are actioned, new ones load automatically to keep the queue topped up.

- **Tier labels** — Senders are marked `..VIP` or `..OK` (the `..` prefix sorts these labels to the top of Gmail's sidebar). On each triage load, all inbox emails from known VIP/OK senders are auto-labeled. Unread VIP/OK emails still appear in the triage queue; already-read ones are skipped.

- **Blocklist** — Block by email address + display name, or entire domain (`@example.com`). On triage load, all matching inbox emails are labeled `.DelPend` and removed. Blocked senders are also filtered out of the triage queue before it renders.

- **OK & Clean** — Labels the current email `..OK` then bulk-labels every other email from that sender `.DelPend`. Cleans up an entire sender's history in one click.

- **Auto-unsubscribe** — Reads `List-Unsubscribe` / `List-Unsubscribe-Post` headers and attempts removal in order: RFC 8058 one-click POST, HTTP GET, unsubscribe email via Gmail API, open URL in browser tab. Falls back to a pre-filled Gmail compose window if no header is present.

---

### Automated Cleaning

- **Auto-clean scheduler** — Runs blocklist + VIP/OK scans on a configurable timer (start time + interval) while the app is running. Every scheduled run is written to `scan-log.json` with sender, label applied, count, and timestamp.

- **Daily email summary** — Sends a digest of the previous 24 hours of auto-clean activity to your configured address. Groups results by scan run (most recent first), shows each sender moved, label applied, and sample subjects. Also triggerable on demand from Settings.

- **Debug send mode** — A checkbox in Settings sends a test summary after every auto-clean scan. Auto-disables after 12 hours. The enabled timestamp is shown and updated live in the browser without polling; a client-side `setTimeout` unchecks the box at the exact expiry moment.

- **Manual scan** — "Run Auto-Clean Now" button in Settings triggers an immediate scan and writes results to the scan log so they appear in the next summary email.

---

### Label Lists

- **Unified Lists page** (`/lists`) — All three sender lists (Blocked, VIP, OK) in one page with filter chips and live search by name or email.

- **Sortable table view** — Click any column header (Name, Email, Date Added, Label) to sort; click again to reverse. Drag column headers to reorder them. Layout (column order, sort column/direction, active filter, search query) is persisted in `localStorage` and restored on every page load.

- **Compact view** — A denser single-line layout: badge, Name, email, date, remove button. Filter chips and search work identically in both modes. Switch between Table and Compact in Settings under Display.

- **Blocklist backup & restore** — "Create Backup" on the Lists page saves a numbered snapshot to `blocklist.backups.json`. Resetting the blocklist auto-saves a pre-reset backup to `blocklist.backup.json`. Both are managed in Settings with options to replace or merge into the current list.

- **Danger zone reset** — Resetting the blocklist requires typing `RESET` in a confirmation modal. A backup is always saved before the wipe.

---

### Claude AI and Calendar

- **Claude AI analysis** — Sends the full email body to Claude for: a plain-English summary, suggested action with reasoning, detection of local real-world events (filtered by your configured locations), extracted calendar events (title/date/time/location/description), and a suggested draft reply.

- **Google Calendar integration** — When Claude detects events in an email, extracted details appear in the Review queue. One click creates the event in your primary Google Calendar using your configured timezone.

- **Review queue** (`/review`) — Emails sent for Claude review are labeled `For_Review` in Gmail and queued here. Actions: Keep (adds to OK list), Archive, Junk (blocks sender), create Calendar events, send a draft reply, or Dismiss.

---

### UI and Settings

- **Persistent sidebar** — A Gmail-style sidebar is present on every page (Home, Triage, Stats, Review, Lists, Settings, Sender detail). Shows navigation with sender counts and total emails labeled per tier.

- **Stats dashboard** (`/stats`) — Per-action totals as large number cards, a 30-day stacked bar chart, an inbox size trend line, and recently-blocked senders.

- **Settings page** (`/settings`) — Locations of interest for Claude, timezone, auto-clean schedule, daily summary email configuration, display preferences (Table vs Compact for Lists), and blocklist backup management.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+, ES Modules |
| Web framework | Express 4.x |
| Email | Gmail API (OAuth2) |
| AI | Anthropic Claude API |
| Calendar | Google Calendar API |
| Container | Docker / Docker Compose |
| Storage | JSON files in `config/` — no database |

---

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (Desktop, Engine, or any Docker-compatible runtime)
- A [Google Cloud project](https://console.cloud.google.com/) with Gmail API and Google Calendar API enabled
- An [Anthropic API key](https://console.anthropic.com/)

### Step 1: Clone the repo

```bash
git clone <repo-url>
cd gmail-triage
```

### Step 2: Set up the config folder

```powershell
.\scripts\setup-config.ps1
```

Creates `config/`, prompts for your Anthropic API key, writes `config/.env`, and creates the placeholder files needed by Docker bind mounts. All other JSON data files are created automatically on first run.

**`config/credentials.json`** must be obtained manually from Google Cloud:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project, enable **Gmail API** and **Google Calendar API**
3. Go to **APIs & Services > Credentials**
4. Create an **OAuth 2.0 Client ID** (Desktop app type)
5. Download and save as `config/credentials.json`

### Step 3: Authorize Gmail access (first time only)

```bash
cd app
npm install
node auth.js
```

Follow the browser prompt and confirm `config/token.json` was saved.

### Step 4: Run with Docker

```bash
docker-compose up        # foreground
docker-compose up -d     # background
```

App at [http://localhost:3000](http://localhost:3000).

To get a shell inside the running container:

```bash
docker exec -it gmail-triage sh
```

---

## Gmail OAuth Scopes

| Scope | Purpose |
|-------|---------|
| `gmail.modify` | Read, label, and move emails |
| `gmail.labels` | Create and manage labels |
| `gmail.send` | Send unsubscribe requests and daily summaries |
| `gmail.settings.basic` | Read filter/settings info |

---

## Project Structure

```
gmail-triage/
├── app/
│   ├── triage.js          # Express routes (all HTTP handlers)
│   ├── auth.js            # One-time OAuth2 setup
│   └── lib/
│       ├── gmail.js       # Gmail API wrapper (scan, label, block, trash)
│       ├── scheduler.js   # Auto-clean scheduler + daily summary email
│       ├── pages.js       # Server-rendered HTML for all pages
│       ├── html.js        # Shell template, CSS, shared components
│       ├── blocklist.js   # Blocklist load/save/backup/restore
│       ├── viplist.js     # VIP and OK list logic
│       ├── stats.js       # Per-action stats tracking
│       ├── settings.js    # Settings load/save/helpers
│       ├── unsub.js       # Auto-unsubscribe logic
│       ├── keepClean.js   # OK & Clean action
│       ├── keptlist.js    # Kept senders list
│       ├── claude.js      # Anthropic Claude API integration
│       ├── calendar.js    # Google Calendar API integration
│       └── review.js      # Review queue persistence
├── config/                # NOT in git — created by setup script
│   ├── .env                     # ANTHROPIC_API_KEY
│   ├── credentials.json         # Google OAuth2 client credentials
│   ├── token.json               # OAuth2 token (auto-managed)
│   ├── settings.json            # App settings
│   ├── blocklist.json           # Blocked senders
│   ├── viplist.json             # VIP senders
│   ├── oklist.json              # OK senders
│   ├── stats.json               # Running stats
│   ├── scan-log.json            # Last 48h of auto-clean results
│   ├── blocklist.backup.json    # Pre-reset auto backup
│   └── blocklist.backups.json   # Named numbered backups
├── scripts/
│   ├── setup-config.ps1         # First-time config setup
│   └── cleanup-worktrees.ps1
├── Dockerfile
├── compose.yaml
└── deploy.ps1             # Sync to NAS via robocopy (optional)
```

---

## Configuration Reference

All settings persist to `config/settings.json` and are managed at `/settings`:

| Setting | Default | Description |
|---------|---------|-------------|
| `locations` | `[]` | Cities for Claude event detection. Empty = all locations |
| `timezone` | `America/Los_Angeles` | Used for Calendar events and scheduler display |
| `schedulerEnabled` | `true` | Enable/disable auto-clean timer |
| `schedulerStartHour` | `10` | Hour to start the first scan each day |
| `schedulerIntervalHours` | `2` | Hours between scans |
| `dailySummaryEnabled` | `false` | Enable daily summary email |
| `dailySummaryEmail` | `""` | Recipient address (blank = your Gmail account) |
| `listsViewMode` | `"table"` | Lists page layout: `"table"` or `"compact"` |

---

## Deployment (optional)

`deploy.ps1` syncs the app to a mapped network drive via robocopy. Edit the destination path in the script to match your setup. Config files are not overwritten by the sync.

```powershell
.\deploy.ps1          # deploy
.\deploy.ps1 -WhatIf  # dry run
```
