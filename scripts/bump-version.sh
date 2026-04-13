#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# bump-version.sh — Atomically bump the extension version across all locations.
#
# Updates the version in all files that reference it, ensuring consistency.
# Run this BEFORE building packages to avoid version skew.
#
# Usage:
#   ./scripts/bump-version.sh 2.0.0          # bump to 2.0.0
#   ./scripts/bump-version.sh 1.1.3-rc.1     # bump to prerelease
#
# Locations updated:
#   1. VERSION file            single source of truth (repo root)
#   2. shared/ollama.ts        EXTENSION_VERSION constant
#   3. package.json            root version field
#   4. shared/package.json     shared package version
#
# NOTE: scripts/build-packages.sh and scripts/publish-packages.sh derive
# the version from the VERSION file at runtime — they do NOT need updating.
# NOTE: npm-packages/*/package.json versions are auto-updated by
# build-packages.sh via sed — they do NOT need manual bumping.
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Parse args ────────────────────────────────────────────────────────────
if [ $# -lt 1 ]; then
  echo "Usage: $0 <new-version>"
  echo ""
  echo "Atomically bumps the extension version across all source files."
  echo ""
  echo "Example:"
  echo "  $0 2.0.0"
  echo "  $0 1.1.3-rc.1"
  exit 1
fi

NEW_VERSION="$1"

# Validate version format (semver-ish)
if ! echo "$NEW_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+([a-zA-Z0-9.+-]*)?$'; then
  echo "Error: Invalid version format '$NEW_VERSION'"
  echo "Expected: MAJOR.MINOR.PATCH (e.g., 1.2.3, 2.0.0-rc.1)"
  exit 1
fi

# ── Colors ────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[bump]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC}  $*"; }

echo ""
echo "  ⚡ Pi Extensions — Version Bumper"
echo ""

# ── Detect current version ────────────────────────────────────────────────
if [ ! -f "$REPO_ROOT/VERSION" ]; then
  echo "Error: VERSION file not found at $REPO_ROOT/VERSION"
  exit 1
fi
CURRENT_VERSION="$(cat "$REPO_ROOT/VERSION" | tr -d '[:space:]')"
if [ -z "$CURRENT_VERSION" ]; then
  echo "Error: VERSION file is empty at $REPO_ROOT/VERSION"
  exit 1
fi

info "Current version: $CURRENT_VERSION"
info "New version:     $NEW_VERSION"
echo ""

if [ "$CURRENT_VERSION" = "$NEW_VERSION" ]; then
  echo "Version is already $NEW_VERSION — nothing to do."
  exit 0
fi

# ── Update each location ─────────────────────────────────────────────────

# 1. VERSION file — single source of truth
log "Updating VERSION file"
echo "$NEW_VERSION" > "$REPO_ROOT/VERSION"

# 2. shared/ollama.ts — EXTENSION_VERSION constant
log "Updating shared/ollama.ts"
sed -i "s/export const EXTENSION_VERSION = \"[^\"]*\"/export const EXTENSION_VERSION = \"$NEW_VERSION\"/" \
  "$REPO_ROOT/shared/ollama.ts"

# 3. Root package.json — version field
log "Updating package.json"
sed -i "s/\"version\": \"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" \
  "$REPO_ROOT/package.json"

# 4. shared/package.json — version field
log "Updating shared/package.json"
sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" \
  "$REPO_ROOT/shared/package.json"

echo ""
log "✅ Version bumped: $CURRENT_VERSION → $NEW_VERSION"
info ""
info "Next steps:"
info "  1. Review changes: git diff"
info "  2. Run tests:    npm test"
info "  3. Build:        ./scripts/build-packages.sh"
info "  4. Commit:       git add -A && git commit -m \"v$NEW_VERSION\""
echo ""
