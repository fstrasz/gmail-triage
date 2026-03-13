# Gmail Triage — Config Setup
# Run this once from the repo root to create the config/ folder and required files.

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$configDir = Join-Path $root "config"

Write-Host ""
Write-Host "Gmail Triage -- Config Setup" -ForegroundColor Cyan
Write-Host "  Target: $configDir"
Write-Host ""

# ── Create config/ directory ──────────────────────────────────────────────────
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir | Out-Null
    Write-Host "  Created config/" -ForegroundColor Green
} else {
    Write-Host "  config/ already exists" -ForegroundColor Yellow
}

# ── .env ──────────────────────────────────────────────────────────────────────
$envFile = Join-Path $configDir ".env"
if (-not (Test-Path $envFile)) {
    $apiKey = Read-Host "  Enter your Anthropic API key"
    if (-not $apiKey) {
        Write-Host "  WARNING: No API key entered. Edit config/.env before starting the app." -ForegroundColor Yellow
        $apiKey = "your-anthropic-api-key-here"
    }
    Set-Content -Path $envFile -Value "ANTHROPIC_API_KEY=$apiKey"
    Write-Host "  Created config/.env" -ForegroundColor Green
} else {
    Write-Host "  config/.env already exists — skipping" -ForegroundColor Yellow
}

# ── credentials.json ──────────────────────────────────────────────────────────
$credFile = Join-Path $configDir "credentials.json"
if (-not (Test-Path $credFile)) {
    Write-Host ""
    Write-Host "  ACTION REQUIRED: config/credentials.json is missing." -ForegroundColor Red
    Write-Host "  To obtain it:" -ForegroundColor White
    Write-Host "    1. Go to https://console.cloud.google.com/" -ForegroundColor White
    Write-Host "    2. Create a project and enable the Gmail API" -ForegroundColor White
    Write-Host "    3. Go to APIs & Services > Credentials" -ForegroundColor White
    Write-Host "    4. Create an OAuth 2.0 Client ID (Desktop app type)" -ForegroundColor White
    Write-Host "    5. Download the JSON and save it as config/credentials.json" -ForegroundColor White
} else {
    Write-Host "  config/credentials.json already exists" -ForegroundColor Green
}

# ── settings.json ─────────────────────────────────────────────────────────────
$settingsFile = Join-Path $configDir "settings.json"
if (-not (Test-Path $settingsFile)) {
    Set-Content -Path $settingsFile -Value '{"locations":["Las Vegas, NV","Temecula, CA"],"timezone":"America/Los_Angeles"}'
    Write-Host "  Created config/settings.json (default locations)" -ForegroundColor Green
} else {
    Write-Host "  config/settings.json already exists — skipping" -ForegroundColor Yellow
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ""
$missingCred  = -not (Test-Path $credFile)
$missingToken = -not (Test-Path (Join-Path $configDir "token.json"))

if ($missingCred) {
    Write-Host "  Setup incomplete. Place credentials.json then run:" -ForegroundColor Yellow
    Write-Host "    cd app && node auth.js" -ForegroundColor White
} elseif ($missingToken) {
    Write-Host "  credentials.json found. Next step — authorize Gmail access:" -ForegroundColor Cyan
    Write-Host "    cd app && node auth.js" -ForegroundColor White
} else {
    Write-Host "  Config complete. Start the app with:" -ForegroundColor Green
    Write-Host "    docker-compose up" -ForegroundColor White
}
Write-Host ""
