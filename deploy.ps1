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

# -- Bump APP_VERSION in pages.js -----------------------------------------------
if (-not $WhatIf) {
    $pagesFile = "$Source\app\lib\pages.js"
    $content = [System.IO.File]::ReadAllText($pagesFile)
    if ($content -match 'const APP_VERSION = "v(\d+)\.(\d+)\.(\d+)"') {
        $newVersion = "v$($Matches[1]).$($Matches[2]).$([int]$Matches[3] + 1)"
        $content = $content -replace 'const APP_VERSION = "v[\d.]+"', "const APP_VERSION = `"$newVersion`""
        [System.IO.File]::WriteAllText($pagesFile, $content)
        git -C $Source add "app\lib\pages.js"
        git -C $Source commit -m "Bump version to $newVersion"
        Write-Host "  Version: $newVersion" -ForegroundColor Cyan
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
