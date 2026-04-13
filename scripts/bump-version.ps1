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
#   shared/ollama.ts          EXTENSION_VERSION constant (source of truth)
#   package.json              version field
#   shared/package.json       version field
#   README.md                 badge, pin-to-tag, snippet, header
#   CHANGELOG.md              new version entry prepended
#   VERSION                   single-line version file
#
# After updating files, stages everything and commits with the
# version as message, then creates an annotated git tag.
# ──────────────────────────────────────────────────────────────────

param(
    [Parameter(Mandatory)][string]$NewVersion,
    [string]$Message = ""
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
# If running from scripts/ dir, go up; if already at root, stay
if (Test-Path "$RepoRoot\shared\ollama.ts") { $PrevDir = "" } else { $RepoRoot = Get-Location }

# ── Read current version ─────────────────────────────────────────
$ollamaTs = "shared\ollama.ts"
if (-not (Test-Path $ollamaTs)) {
    Write-Host "ERROR: $ollamaTs not found. Run from the repo root." -ForegroundColor Red
    exit 1
}

$content = Get-Content $ollamaTs -Raw
if ($content -match 'EXTENSION_VERSION\s*=\s*"([^"]+)"') {
    $OldVersion = $Matches[1]
} else {
    Write-Host "ERROR: Could not parse EXTENSION_VERSION from $ollamaTs" -ForegroundColor Red
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

# ── Update shared/ollama.ts ──────────────────────────────────────
Write-Host ""
Write-Host " -- Updating files -------------------------------------------" -ForegroundColor DarkGray

Write-Host "  [1/6] shared\ollama.ts"
$content = $content -replace '(EXTENSION_VERSION\s*=\s*)"[^"]+"', "`$1`"$NewVersion`""
Set-Content -Path $ollamaTs -Value $content -NoNewline

# ── Update package.json (root) ───────────────────────────────────
Write-Host "  [2/6] package.json"
$c = Get-Content "package.json" -Raw
$c = $c.Replace("`"version`": `"$OldVersion`"", "`"version`": `"$NewVersion`"")
Set-Content -Path "package.json" -Value $c -NoNewline

# ── Update shared/package.json ───────────────────────────────────
Write-Host "  [3/6] shared\package.json"
$c = Get-Content "shared\package.json" -Raw
$c = $c.Replace("`"version`": `"$OldVersion`"", "`"version`": `"$NewVersion`"")
Set-Content -Path "shared\package.json" -Value $c -NoNewline

# ── Update README.md (4 references) ─────────────────────────────
Write-Host "  [4/6] README.md"
$c = Get-Content "README.md" -Raw
$c = $c.Replace("v$OldVersion", "v$NewVersion")
$c = $c.Replace("pi-coding-agent@v$OldVersion", "pi-coding-agent@v$NewVersion")
$c = $c.Replace("Benchmark v$OldVersion", "Benchmark v$NewVersion")
Set-Content -Path "README.md" -Value $c -NoNewline

# ── Update VERSION file ──────────────────────────────────────────
Write-Host "  [5/6] VERSION"
Set-Content -Path "VERSION" -Value $NewVersion -NoNewline

# ── Update CHANGELOG.md ──────────────────────────────────────────
Write-Host "  [6/6] CHANGELOG.md"
$date = Get-Date -Format "yyyy-MM-dd"

$entry = @"
## [$NewVersion] - $date

### Changed

- **Version bumped to $NewVersion** (all version touchpoints)
  - Source of truth: ``shared/ollama.ts`` (``EXTENSION_VERSION``), root ``package.json``, ``shared/package.json``.
  - Documentation: root ``README.md`` (4 references: version badge, pin-to-tag, package format snippet, benchmark header).

---

"@

$cl = Get-Content "CHANGELOG.md" -Raw
$idx = [regex]::Match($cl, '(?m)^## \[').Index
if ($idx -ge 0) {
    $cl = $cl.Insert($idx, $entry)
    Set-Content -Path "CHANGELOG.md" -Value $cl -NoNewline
}

# ── Git commit and tag ───────────────────────────────────────────
Write-Host ""
Write-Host " -- Git commit and tag ---------------------------------------" -ForegroundColor DarkGray

git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git add failed. Are you in the repo root?" -ForegroundColor Red
    exit 1
}

$commitMsg = if ($Message) { "$NewVersion : $Message" } else { $NewVersion }
git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git commit failed." -ForegroundColor Red
    exit 1
}

git tag -d "v$NewVersion" 2>$null
git tag -a "v$NewVersion" -m "v$NewVersion"

Write-Host ""
Write-Host " Done! $OldVersion -> $NewVersion" -ForegroundColor Green
Write-Host " Tag: v$NewVersion" -ForegroundColor Green
Write-Host ""
Write-Host " Note: npm-packages versions are NOT bumped -- they lag one release" -ForegroundColor DarkGray
Write-Host "       behind by design. Run build-packages.sh before publishing." -ForegroundColor DarkGray
Write-Host ""
