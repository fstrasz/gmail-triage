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

# -- Auto-increment version in pages.js and commit locally (no push) -----------
if (-not $WhatIf) {
    $pagesFile = "$Source\app\lib\pages.js"
    $content = Get-Content $pagesFile -Raw
    if ($content -match 'const APP_VERSION = "v(\d+)\.(\d+)\.(\d+)"') {
        $major = $Matches[1]
        $minor = $Matches[2]
        $patch = [int]$Matches[3] + 1
        $newVersion = "v${major}.${minor}.$( '{0:D2}' -f $patch )"
        $newContent = $content -replace 'const APP_VERSION = "v[^"]+"', "const APP_VERSION = `"$newVersion`""
        Set-Content $pagesFile $newContent -NoNewline

        $commitMsg = "Bump version to $newVersion`n`nCo-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
        git -C $Source add app/lib/pages.js | Out-Null
        git -C $Source commit -m $commitMsg | Out-Null

        Write-Host "  Version: $newVersion" -ForegroundColor Cyan

        if ($patch % 10 -eq 0) {
            Write-Host ""
            Write-Host "  REMINDER: $newVersion is a milestone -- consider tagging a stable GitHub release." -ForegroundColor Yellow
        }
        Write-Host ""
    } else {
        Write-Host "  WARNING: Could not find APP_VERSION in pages.js -- skipping version bump." -ForegroundColor Yellow
        Write-Host ""
    }
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
