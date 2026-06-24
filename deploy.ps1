# deploy.ps1 -- Sync gmail-triage project to network live location
# Usage: .\deploy.ps1 [-WhatIf]

param(
    [switch]$WhatIf
)

$Source = $PSScriptRoot
$Dest   = "Y:\gmail-triage"
$Log    = "$PSScriptRoot\deploy.log"

Write-Host ""
Write-Host "Gmail Triage -- Deploy" -ForegroundColor Cyan
Write-Host "  Source : $Source" -ForegroundColor Gray
Write-Host "  Dest   : $Dest" -ForegroundColor Gray
if ($WhatIf) {
    Write-Host "  Mode   : DRY RUN (no files will be copied)" -ForegroundColor Yellow
}
Write-Host ""

if (-not (Test-Path $Dest)) {
    Write-Host "ERROR: Destination not reachable: $Dest" -ForegroundColor Red
    Write-Host "Make sure Y: is mapped and the network share is online." -ForegroundColor Yellow
    exit 1
}

# -- Run test suite before deploying ------------------------------------------
Write-Host "Running test suite..." -ForegroundColor Cyan
if ($WhatIf) {
    Write-Host "  (skipped in dry run)" -ForegroundColor Yellow
} else {
    & node "$Source\scripts\test-events.mjs"
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "TESTS FAILED (exit $LASTEXITCODE). Aborting deploy before version bump." -ForegroundColor Red
        Write-Host "Run 'npm test' to see failures and fix before retrying." -ForegroundColor Yellow
        exit $LASTEXITCODE
    }
    Write-Host "  Tests passed." -ForegroundColor Green
    Write-Host ""
}

# -- Run web test suite before building ---------------------------------------
Write-Host "Running web test suite..." -ForegroundColor Cyan
if ($WhatIf) {
    Write-Host "  (skipped in dry run)" -ForegroundColor Yellow
    Write-Host ""
} else {
    & npm --prefix "$Source\web" ci
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WEB DEPS FAILED (npm ci). Aborting." -ForegroundColor Red
        exit 1
    }
    & npm --prefix "$Source\web" run test
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "WEB TESTS FAILED. Aborting." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "  Web tests passed." -ForegroundColor Green
    Write-Host ""
}

# -- Build React web app -------------------------------------------------------
Write-Host "Building web app..." -ForegroundColor Cyan
if ($WhatIf) {
    Write-Host "  (skipped in dry run)" -ForegroundColor Yellow
    Write-Host ""
} else {
    & npm --prefix "$Source\web" run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "WEB BUILD FAILED (vite build). Aborting." -ForegroundColor Red
        exit 1
    }
    Write-Host "  Web build complete." -ForegroundColor Green
    Write-Host ""
}

# -- Auto-increment version in pages.js and commit locally (no push) -----------
$pagesFile = "$Source\app\lib\pages.js"
$content = Get-Content $pagesFile -Raw
if ($content -match 'const APP_VERSION = "v(\d+)\.(\d+)\.(\d+)"') {
    $major = $Matches[1]
    $minor = $Matches[2]
    $patch = [int]$Matches[3] + 1
    $newVersion = "v${major}.${minor}.$( '{0:D2}' -f $patch )"

    if (-not $WhatIf) {
        $newContent = $content -replace 'const APP_VERSION = "v[^"]+"', "const APP_VERSION = `"$newVersion`""
        Set-Content $pagesFile $newContent -NoNewline

        $commitMsg = "Bump version to $newVersion`n`nCo-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
        git -C $Source add app/lib/pages.js | Out-Null
        git -C $Source commit -m $commitMsg | Out-Null

        Write-Host "  Version: $newVersion" -ForegroundColor Cyan

        if ($patch % 10 -eq 0) {
            Write-Host ""
            Write-Host "  REMINDER: $newVersion is a milestone -- consider tagging a stable GitHub release." -ForegroundColor Yellow
        }
    } else {
        Write-Host "  Version: would bump to $newVersion (dry run)" -ForegroundColor Yellow
    }
    Write-Host ""
} else {
    Write-Host "  WARNING: Could not find APP_VERSION in pages.js -- skipping version bump." -ForegroundColor Yellow
    Write-Host ""
}

$robocopyArgs = @(
    $Source, $Dest,
    "/MIR",
    "/FFT",
    "/IS",
    "/IT",
    "/Z",
    "/NP",
    "/TEE",
    "/LOG+:$Log",
    "/XD", "node_modules", "config", ".git", ".claude",
    "/XF", "*.env", "*.json.bak", "deploy.*"
)

if ($WhatIf) {
    $robocopyArgs += "/L"
}

robocopy @robocopyArgs

$rc = $LASTEXITCODE

if ($rc -ge 8) {
    Write-Host ""
    Write-Host "SYNC FAILED (robocopy exit code $rc). Check deploy.log for details." -ForegroundColor Red
    exit $rc
}

# -- Sync data JSON files from config/ (never credentials or token) ------------
$configArgs = @(
    "$Source\config", "$Dest\config",
    "*.json",
    "/FFT", "/Z", "/NP", "/TEE", "/LOG+:$Log",
    "/XO",                              # never overwrite a NAS file that is newer than local
    "/XF", "credentials.json", "token.json"
)
if ($WhatIf) { $configArgs += "/L" }

robocopy @configArgs
$rcConfig = $LASTEXITCODE

if ($rcConfig -ge 8) {
    Write-Host ""
    Write-Host "CONFIG SYNC FAILED (robocopy exit code $rcConfig). Check deploy.log for details." -ForegroundColor Red
    exit $rcConfig
}

if ($rc -eq 0 -and $rcConfig -eq 0) {
    Write-Host ""
    Write-Host "No changes -- destination is already up to date." -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "Sync complete." -ForegroundColor Green
}

Write-Host "Log saved to: $Log" -ForegroundColor Gray

# -- Recreate container + probe /app (skip in dry run) -------------------------
if (-not $WhatIf) {
    Write-Host ""
    Write-Host "Recreating container on NAS..." -ForegroundColor Cyan
    $sshKey = "$env:USERPROFILE\.ssh\id_ed25519"
    $sshCmd = 'cd /volume1/docker/gmail-triage && sudo /usr/local/bin/docker compose up -d --force-recreate'
    ssh -i $sshKey fstrasz_admin@192.168.20.10 $sshCmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "CONTAINER RECREATE FAILED (ssh exit $LASTEXITCODE). Check NAS manually." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "  Container recreated." -ForegroundColor Green

    # Give the container a moment to start serving before probing.
    Start-Sleep -Seconds 5

    Write-Host "Probing /app/..." -ForegroundColor Cyan
    try {
        $probe = Invoke-WebRequest -UseBasicParsing "http://192.168.20.10:3000/app/" -TimeoutSec 15 -ErrorAction Stop
        if ($probe.StatusCode -eq 200 -and $probe.Content -match 'Triage') {
            Write-Host "  /app/ probe OK (HTTP $($probe.StatusCode), content contains 'Triage')." -ForegroundColor Green
        } else {
            Write-Host "PROBE FAILED: status=$($probe.StatusCode), content did not contain 'Triage'." -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "PROBE FAILED: $_" -ForegroundColor Red
        exit 1
    }

    Write-Host "Probing /health..." -ForegroundColor Cyan
    try {
        $health = Invoke-WebRequest -UseBasicParsing "http://192.168.20.10:3000/health" -TimeoutSec 15 -ErrorAction Stop
        if ($health.StatusCode -eq 200) {
            Write-Host "  /health probe OK (HTTP 200 - healthy)." -ForegroundColor Green
        } elseif ($health.StatusCode -eq 503) {
            Write-Host "  /health probe WARN (HTTP 503 - degraded; deploy continues)." -ForegroundColor Yellow
        } else {
            Write-Host "HEALTH PROBE FAILED: unexpected status $($health.StatusCode)." -ForegroundColor Red
            exit 1
        }
    } catch {
        $sc = $_.Exception.Response.StatusCode.value__
        if ($sc -eq 503) {
            Write-Host "  /health probe WARN (HTTP 503 - degraded; deploy continues)." -ForegroundColor Yellow
        } else {
            Write-Host "HEALTH PROBE FAILED: $_" -ForegroundColor Red
            exit 1
        }
    }
}
