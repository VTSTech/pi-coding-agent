# ── bump-version.ps1 ──────────────────────────────────────────────
# Bump version across all pi-coding-agent version touchpoints.
#
# Usage:
#   .\scripts\bump-version.ps1 <new-version> [message]
#
# Examples:
#   .\scripts\bump-version.ps1 1.1.8
#   .\scripts\bump-version.ps1 1.2.0 "Major refactor"
#   .\scripts\bump-version.ps1 1.1.8-dev
#
# Files updated:
#   VERSION                   single source of truth (repo root)
#   shared/ollama.ts          EXTENSION_VERSION constant
#   package.json              root version field
#   shared/package.json       shared package version
#   README.md                 badge, pin-to-tag, snippet, header
#
# NOTE: scripts/build-packages.sh and scripts/publish-packages.sh derive
# the version from the VERSION file at runtime — they do NOT need updating.
# NOTE: npm-packages/*/package.json versions are auto-updated by
# build-packages.sh via sed — they do NOT need manual bumping.
# ──────────────────────────────────────────────────────────────────

param(
    [Parameter(Mandatory)][string]$NewVersion,
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"

# UTF-8 helpers — safe on both PowerShell 5 (no utf8NoBOM) and PowerShell 7
function Read-FileUtf8 {
    param([string]$Path)
    return [System.IO.File]::ReadAllText((Resolve-Path $Path).Path)
}

function Write-FileUtf8 {
    param([string]$Path, [string]$Content)
    [System.IO.File]::WriteAllText((Resolve-Path $Path).Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

# ── Read current version from VERSION file (source of truth) ──────
$versionFile = "VERSION"
if (-not (Test-Path $versionFile)) {
    Write-Host "ERROR: $versionFile not found. Run from the repo root." -ForegroundColor Red
    exit 1
}

$OldVersion = (Read-FileUtf8 $versionFile).Trim()
if (-not $OldVersion) {
    Write-Host "ERROR: VERSION file is empty." -ForegroundColor Red
    exit 1
}

# Validate version format (semver-ish)
if ($NewVersion -notmatch '^\d+\.\d+\.\d+([a-zA-Z0-9.+-]*)?$') {
    Write-Host "ERROR: Invalid version format '$NewVersion'" -ForegroundColor Red
    Write-Host "Expected: MAJOR.MINOR.PATCH (e.g., 1.2.3, 2.0.0-rc.1)" -ForegroundColor Red
    exit 1
}

if ($OldVersion -eq $NewVersion) {
    Write-Host " Version is already $NewVersion -- nothing to do." -ForegroundColor Yellow
    exit 0
}

# ── Show plan & confirm ──────────────────────────────────────────
Write-Host ""
Write-Host "  Current version: $OldVersion" -ForegroundColor Cyan
Write-Host "  New version:     $NewVersion" -ForegroundColor Green
Write-Host ""

$reply = Read-Host " Bump $OldVersion -> $NewVersion`? [y/N]"
if ($reply -notmatch '^[Yy]') {
    Write-Host " Aborted." -ForegroundColor Yellow
    exit 0
}

# ── Update VERSION file ─────────────────────────────────────────
Write-Host ""
Write-Host " -- Updating files -------------------------------------------" -ForegroundColor DarkGray

Write-Host "  [1/5] VERSION"
Write-FileUtf8 "VERSION" "$NewVersion`n"

# ── Update shared/ollama.ts ──────────────────────────────────────
Write-Host "  [2/5] shared\ollama.ts"
$ollamaTs = "shared\ollama.ts"
$content = Read-FileUtf8 $ollamaTs
$content = $content -replace '(EXTENSION_VERSION\s*=\s*)"[^"]+"', "`$1`"$NewVersion`""
Write-FileUtf8 $ollamaTs $content

# ── Update package.json (root) ───────────────────────────────────
Write-Host "  [3/5] package.json"
$c = Read-FileUtf8 "package.json"
$c = $c.Replace("`"version`": `"$OldVersion`"", "`"version`": `"$NewVersion`"")
Write-FileUtf8 "package.json" $c

# ── Update shared/package.json ───────────────────────────────────
Write-Host "  [4/5] shared\package.json"
$c = Read-FileUtf8 "shared\package.json"
$c = $c.Replace("`"version`": `"$OldVersion`"", "`"version`": `"$NewVersion`"")
Write-FileUtf8 "shared\package.json" $c

# ── Update README.md (3 references) ─────────────────────────────
Write-Host "  [5/5] README.md"
$c = Read-FileUtf8 "README.md"
$c = $c.Replace("v$OldVersion", "v$NewVersion")
$c = $c.Replace("pi-coding-agent@v$OldVersion", "pi-coding-agent@v$NewVersion")
$c = $c.Replace("Benchmark v$OldVersion", "Benchmark v$NewVersion")
Write-FileUtf8 "README.md" $c

Write-Host ""
Write-Host " Done! $OldVersion -> $NewVersion" -ForegroundColor Green
Write-Host " Tag: v$NewVersion" -ForegroundColor Green
Write-Host ""
Write-Host " Note: npm-packages versions are NOT bumped -- they lag one release" -ForegroundColor DarkGray
Write-Host "       behind by design. Run build-packages.sh before publishing." -ForegroundColor DarkGray
Write-Host ""
