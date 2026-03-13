# cleanup-worktrees.ps1
# Removes all Claude worktrees except the current one, and their session data.
# Also cleans up orphaned session directories with no corresponding worktree.
# Usage: .\scripts\cleanup-worktrees.ps1 [-WhatIf]

param([switch]$WhatIf)

$RepoRoot = Split-Path $PSScriptRoot -Parent

# ── Parse git worktree list ───────────────────────────────────────────────────
$lines = git -C $RepoRoot worktree list --porcelain 2>$null
$worktrees = @()
$cur = $null
foreach ($line in $lines) {
    if ($line -match '^worktree (.+)$') { $cur = $Matches[1].Trim() }
    elseif ($line -eq '' -and $cur)     { $worktrees += $cur; $cur = $null }
}
if ($cur) { $worktrees += $cur }

$claudeWTs = $worktrees | Where-Object { $_ -like '*/.claude/worktrees/*' }

# ── Determine which worktree to keep ─────────────────────────────────────────
$runningIn = (git rev-parse --show-toplevel 2>$null).Trim() -replace '\\', '/'
$keep = $claudeWTs | Where-Object { ($_ -replace '\\', '/') -eq $runningIn } | Select-Object -First 1

if (-not $keep -and $claudeWTs.Count -gt 0) {
    $keep = $claudeWTs |
        Sort-Object { (Get-Item ($_ -replace '/', '\') -ErrorAction SilentlyContinue).LastWriteTime } -Descending |
        Select-Object -First 1
    Write-Host "Not running inside a worktree. Keeping most recent: $(Split-Path $keep -Leaf)" -ForegroundColor Yellow
} elseif ($keep) {
    Write-Host "Current worktree : $(Split-Path $keep -Leaf)" -ForegroundColor Cyan
}

$keepName = if ($keep) { Split-Path $keep -Leaf } else { $null }

# ── Collect worktrees to remove ───────────────────────────────────────────────
$toRemove = $claudeWTs | Where-Object { $_ -ne $keep }

# ── Collect orphaned session dirs (no matching git worktree) ─────────────────
$projectsDir = Join-Path $env:USERPROFILE '.claude\projects'
$repoKey = ($RepoRoot -replace '\\','/' -replace ':','' -replace '/','--').TrimStart('-')

$orphanedSessions = @()
if (Test-Path $projectsDir) {
    Get-ChildItem $projectsDir -Directory | Where-Object {
        $_.Name -match '--claude-worktrees-(.+)$'
    } | ForEach-Object {
        $sessionName = $Matches[1]
        $hasWorktree = $claudeWTs | Where-Object { (Split-Path $_ -Leaf) -eq $sessionName }
        if (-not $hasWorktree -and $sessionName -ne $keepName) {
            $orphanedSessions += $_
        }
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────
if ($toRemove.Count -eq 0 -and $orphanedSessions.Count -eq 0) {
    Write-Host 'Nothing to remove — already clean.' -ForegroundColor Green
    exit 0
}

if ($toRemove.Count -gt 0) {
    Write-Host ''
    Write-Host 'Worktrees to remove:' -ForegroundColor White
    foreach ($wt in $toRemove) {
        Write-Host "  $(Split-Path $wt -Leaf)  ($wt)" -ForegroundColor Gray
    }
}

if ($orphanedSessions.Count -gt 0) {
    Write-Host ''
    Write-Host 'Orphaned session dirs to remove:' -ForegroundColor White
    foreach ($sd in $orphanedSessions) {
        Write-Host "  $($sd.Name)" -ForegroundColor Gray
    }
}

Write-Host ''

# ── Remove worktrees ──────────────────────────────────────────────────────────
foreach ($wt in $toRemove) {
    $name  = Split-Path $wt -Leaf
    $wtFwd = $wt -replace '\\', '/'

    if ($WhatIf) {
        Write-Host "[WhatIf] git worktree remove --force $wtFwd" -ForegroundColor Yellow
        Write-Host "[WhatIf] git branch -D claude/$name" -ForegroundColor Yellow
    } else {
        Write-Host "Removing worktree: $name ..." -ForegroundColor White
        git -C $RepoRoot worktree remove --force $wtFwd 2>&1 | Out-Null
        git -C $RepoRoot branch -D "claude/$name" 2>&1 | Out-Null
    }

    # Also remove its session dir if present
    $sessionKey = $wtFwd -replace ':', '' -replace '/', '--'
    $sessionDir = Join-Path $projectsDir $sessionKey
    if (Test-Path $sessionDir) {
        if ($WhatIf) {
            Write-Host "[WhatIf] Remove session data: $sessionDir" -ForegroundColor Yellow
        } else {
            Write-Host "  Removing session data: $(Split-Path $sessionDir -Leaf)" -ForegroundColor Gray
            Remove-Item -Recurse -Force $sessionDir
        }
    }
}

# ── Remove orphaned session dirs ──────────────────────────────────────────────
foreach ($sd in $orphanedSessions) {
    $sessionName = if ($sd.Name -match '--claude-worktrees-(.+)$') { $Matches[1] } else { $null }
    $wtDir = if ($sessionName) { Join-Path $RepoRoot ".claude\worktrees\$sessionName" } else { $null }

    if ($WhatIf) {
        Write-Host "[WhatIf] Remove orphaned session: $($sd.Name)" -ForegroundColor Yellow
        if ($wtDir -and (Test-Path $wtDir)) {
            Write-Host "[WhatIf] Remove orphaned worktree dir: $wtDir" -ForegroundColor Yellow
        }
    } else {
        Write-Host "Removing orphaned session: $($sd.Name)" -ForegroundColor White
        Remove-Item -Recurse -Force $sd.FullName
        if ($wtDir -and (Test-Path $wtDir)) {
            Write-Host "  Removing orphaned worktree dir: $sessionName" -ForegroundColor Gray
            Remove-Item -Recurse -Force $wtDir
        }
    }
}

Write-Host ''
if ($WhatIf) {
    Write-Host 'Dry run complete. Re-run without -WhatIf to apply.' -ForegroundColor Yellow
} else {
    Write-Host 'Done.' -ForegroundColor Green
}
