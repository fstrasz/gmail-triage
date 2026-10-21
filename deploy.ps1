# deploy.ps1 -- Sync gmail-triage project to network live location
# Usage: .\deploy.ps1 [-WhatIf] [-Redeploy]
#   -Redeploy  allow deploying the version that is already live (a re-sync)

param(
    [switch]$WhatIf,
    [switch]$Redeploy
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

# -- Deploy exactly what is committed -----------------------------------------
# The deploy builds and copies the working tree. On 2026-10-20 it shipped another
# session's uncommitted edits from this shared checkout, so refuse to run with
# tracked changes outstanding.
$dirty = git -C $Source status --porcelain --untracked-files=no
if ($dirty) {
    Write-Host "UNCOMMITTED CHANGES -- these would be deployed:" -ForegroundColor Red
    $dirty | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host "Commit or discard them (or deploy from a clean worktree of main)." -ForegroundColor Yellow
    exit 1
}

# -- Version is bumped in the PR, not here ------------------------------------
# This script used to bump APP_VERSION and commit it on local main after the
# merge, which needed a separate release PR per deploy. Now the feature PR bumps
# it (npm run bump), and deploying a version that is already live is refused
# unless -Redeploy says the re-sync is intentional.
$pagesContent = Get-Content "$Source\app\lib\pages.js" -Raw
if ($pagesContent -notmatch 'const APP_VERSION = "(v[^"]+)"') {
    Write-Host "ERROR: Could not find APP_VERSION in app\lib\pages.js." -ForegroundColor Red
    exit 1
}
$localVersion = $Matches[1]
$liveVersion = $null
try {
    $liveVersion = (Invoke-RestMethod "http://192.168.20.10:3000/health" -TimeoutSec 15).version
} catch {
    Write-Host "  WARNING: could not read the live version ($_). Continuing." -ForegroundColor Yellow
}
Write-Host "  Version: $localVersion (live: $(if ($liveVersion) { $liveVersion } else { 'unknown' }))" -ForegroundColor Cyan
if ($liveVersion -eq $localVersion -and -not $Redeploy) {
    Write-Host "$localVersion is already live. Bump APP_VERSION in the PR (npm run bump)," -ForegroundColor Red
    Write-Host "or pass -Redeploy to re-sync the same version on purpose." -ForegroundColor Red
    exit 1
}
Write-Host ""

# -- Run test suite before deploying ------------------------------------------
Write-Host "Running test suite..." -ForegroundColor Cyan
if ($WhatIf) {
    Write-Host "  (skipped in dry run)" -ForegroundColor Yellow
} else {
    & node "$Source\scripts\test-events.mjs"
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "TESTS FAILED (exit $LASTEXITCODE). Aborting deploy." -ForegroundColor Red
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
    # Skip the slow 'npm ci' (wipes + reinstalls web/node_modules, 2-5 min) when the
    # lockfile is unchanged since the last successful install. The hash marker lives inside
    # node_modules, so deleting node_modules (or npm ci itself) invalidates it automatically.
    $webDir     = "$Source\web"
    $webModules = "$webDir\node_modules"
    $lockMarker = "$webModules\.deploy-lockhash"
    $lockHash   = (Get-FileHash "$webDir\package-lock.json" -Algorithm SHA256).Hash

    $needCi = $true
    if ((Test-Path $webModules) -and (Test-Path $lockMarker)) {
        if ((Get-Content $lockMarker -Raw).Trim() -eq $lockHash) {
            $needCi = $false
        }
    }

    if ($needCi) {
        & npm --prefix $webDir ci
        if ($LASTEXITCODE -ne 0) {
            Write-Host "WEB DEPS FAILED (npm ci). Aborting." -ForegroundColor Red
            exit 1
        }
        Set-Content $lockMarker $lockHash -NoNewline
    } else {
        Write-Host "  web deps unchanged (lockfile hash match) -- skipping npm ci." -ForegroundColor Gray
    }

    & npm --prefix $webDir run test
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


# config-robin is excluded so /MIR never purges Robin's state on the NAS.
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
    "/XD", "node_modules", "config", "config-robin", ".git", ".claude",
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
    # Robin's instance starts only once its config is seeded (see compose.yaml).
    $robinActive = Test-Path (Join-Path $Dest "config-robin\token.json")
    $profileArg = if ($robinActive) { " --profile robin" } else { "" }
    Write-Host ("  Robin instance: " + $(if ($robinActive) { "active" } else { "not seeded - skipped" }))
    # Synology's Docker refuses to start a container whose bind-mount source
    # directory is missing (it does not create it), so make the queue dirs first.
    $sshCmd = "cd /volume1/docker/gmail-triage && mkdir -p config/queue config-robin/queue && sudo /usr/local/bin/docker compose$profileArg up -d --force-recreate"
    ssh -i $sshKey fstrasz_admin@192.168.20.10 $sshCmd
    if ($LASTEXITCODE -ne 0) {
        Write-Host "CONTAINER RECREATE FAILED (ssh exit $LASTEXITCODE). Check NAS manually." -ForegroundColor Red
        exit $LASTEXITCODE
    }
    Write-Host "  Container recreated." -ForegroundColor Green

    # Give the container a moment to start serving before probing.
    Start-Sleep -Seconds 5

    # The first probe after a recreate has twice (2026-10-15, 2026-10-20) hit the
    # containers mid-start and failed with "The underlying connection was closed",
    # while a manual re-probe seconds later was healthy. Retry connection-level
    # failures only; a 200 with the wrong content still fails at once.
    Write-Host "Probing /app/..." -ForegroundColor Cyan
    $probe = $null
    for ($attempt = 1; $attempt -le 6; $attempt++) {
        try {
            $probe = Invoke-WebRequest -UseBasicParsing "http://192.168.20.10:3000/app/" -TimeoutSec 15 -ErrorAction Stop
            break
        } catch {
            if ($attempt -eq 6) {
                Write-Host "PROBE FAILED after $attempt attempts: $_" -ForegroundColor Red
                exit 1
            }
            Write-Host "  /app/ not answering yet (attempt $attempt): $_ - retrying in 5s" -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
    }
    if ($probe.StatusCode -eq 200 -and $probe.Content -match 'Triage') {
        Write-Host "  /app/ probe OK (HTTP $($probe.StatusCode), content contains 'Triage')." -ForegroundColor Green
    } else {
        Write-Host "PROBE FAILED: status=$($probe.StatusCode), content did not contain 'Triage'." -ForegroundColor Red
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

    if ($robinActive) {
        Write-Host "Probing Robin /health..." -ForegroundColor Cyan
        try {
            $robinHealth = Invoke-WebRequest -UseBasicParsing "http://192.168.20.10:3001/health" -TimeoutSec 15 -ErrorAction Stop
            if ($robinHealth.StatusCode -eq 200) {
                Write-Host "  Robin /health probe OK (HTTP 200 - healthy)." -ForegroundColor Green
            } elseif ($robinHealth.StatusCode -eq 503) {
                Write-Host "  Robin /health probe WARN (HTTP 503 - degraded; deploy continues)." -ForegroundColor Yellow
            } else {
                Write-Host "ROBIN HEALTH PROBE FAILED: unexpected status $($robinHealth.StatusCode)." -ForegroundColor Red
                exit 1
            }
        } catch {
            $sc = $_.Exception.Response.StatusCode.value__
            if ($sc -eq 503) {
                Write-Host "  Robin /health probe WARN (HTTP 503 - degraded; deploy continues)." -ForegroundColor Yellow
            } else {
                Write-Host "ROBIN HEALTH PROBE FAILED: $_" -ForegroundColor Red
                exit 1
            }
        }
    }

    # Uses HttpWebRequest with AllowAutoRedirect disabled rather than
    # Invoke-WebRequest -MaximumRedirection 0. Under Windows PowerShell 5.1 that
    # switch THROWS on a redirect and the exception carries a null .Response, so
    # a correct 302 read back as status="" and failed the deploy - and its exit 1
    # fired before the /legacy and /api/labeled probes below ever ran. Note also
    # that WebHeaderCollection in 5.1 has no .Location property; index it by name.
    Write-Host "Probing / redirect..." -ForegroundColor Cyan
    $sc = 0
    $loc = ""
    try {
        $req = [System.Net.HttpWebRequest]::Create("http://192.168.20.10:3000/")
        $req.AllowAutoRedirect = $false
        $req.Timeout = 15000
        $resp = $req.GetResponse()
        $sc = [int]$resp.StatusCode
        $loc = $resp.Headers["Location"]
        $resp.Close()
    } catch {
        Write-Host "ROOT REDIRECT PROBE FAILED: request error: $_" -ForegroundColor Red
        exit 1
    }
    if ($sc -eq 302 -and $loc -eq "/app/") {
        Write-Host "  / redirect probe OK (HTTP 302, Location: /app/)." -ForegroundColor Green
    } else {
        Write-Host "ROOT REDIRECT PROBE FAILED: status=$sc, Location=$loc (expected 302, /app/)." -ForegroundColor Red
        exit 1
    }

    Write-Host "Probing /legacy..." -ForegroundColor Cyan
    try {
        # Measured 16.4s on a healthy page - /legacy renders the old server-rendered
        # home, which makes live Gmail API calls. Do not trim this back to 15.
        $legacyProbe = Invoke-WebRequest -UseBasicParsing "http://192.168.20.10:3000/legacy" -TimeoutSec 45 -ErrorAction Stop
        if ($legacyProbe.StatusCode -eq 200 -and $legacyProbe.Content -match 'Gmail Triage') {
            Write-Host "  /legacy probe OK (HTTP $($legacyProbe.StatusCode), content contains 'Gmail Triage')." -ForegroundColor Green
        } else {
            Write-Host "LEGACY PROBE FAILED: status=$($legacyProbe.StatusCode), content did not contain 'Gmail Triage'." -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "LEGACY PROBE FAILED: $_" -ForegroundColor Red
        exit 1
    }

    Write-Host "Probing /api/labeled..." -ForegroundColor Cyan
    try {
        # /api/labeled can issue up to 200 messages.get calls to Gmail, so 15s is
        # too tight - raised to 60s. Do not trim this back down.
        $labeledProbe = Invoke-WebRequest -UseBasicParsing "http://192.168.20.10:3000/api/labeled?label=..VIP" -TimeoutSec 60 -ErrorAction Stop
        if ($labeledProbe.StatusCode -eq 200 -and $labeledProbe.Content -match '"ok":true') {
            Write-Host "  /api/labeled probe OK (HTTP $($labeledProbe.StatusCode), content contains '`"ok`":true')." -ForegroundColor Green
        } else {
            Write-Host "LABELED PROBE FAILED: status=$($labeledProbe.StatusCode), content did not contain '`"ok`":true'." -ForegroundColor Red
            exit 1
        }
    } catch {
        Write-Host "LABELED PROBE FAILED: $_" -ForegroundColor Red
        exit 1
    }
}
