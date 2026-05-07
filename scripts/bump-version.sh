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
#   5. individual-packages/*/package.json    all individual package versions
#   6. README.md               update version references
#   7. dist/*/package.json     built packages for npm publishing
#
# NOTE: This script is for git-based Pi packages, not npm.
# NOTE: scripts/build-tgz.sh derives the version from the VERSION file at runtime.
# NOTE: Update peer dependencies from @mariozechner to @earendil-works
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INDIVIDUAL_PKGS_DIR="$REPO_ROOT/individual-packages"

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
# Use a more flexible pattern that matches any version number
sed -i 's/"version": "[0-9]*\.[0-9]*\.[0-9]*[a-zA-Z0-9.+-]*"/"version": "'$NEW_VERSION'"/' \
  "$REPO_ROOT/package.json"

# 4. shared/package.json — version field
log "Updating shared/package.json"
sed -i 's/"version": "[0-9]*\.[0-9]*\.[0-9]*[a-zA-Z0-9.+-]*"/"version": "'$NEW_VERSION'"/' \
  "$REPO_ROOT/shared/package.json"

# 5. individual-packages/*/package.json — all individual package versions
log "Updating individual package manifests"
for pkg_dir in "$INDIVIDUAL_PKGS_DIR"/*/; do
  if [ -f "$pkg_dir/package.json" ]; then
    pkg_name="$(basename "$pkg_dir")"
    
    # Update version
    sed -i 's/"version": "[0-9]*\.[0-9]*\.[0-9]*[a-zA-Z0-9.+-]*"/"version": "'$NEW_VERSION'"/' "$pkg_dir/package.json"
    
    # Update shared dependency version if it exists
    if grep -q '"@vtstech/pi-shared"' "$pkg_dir/package.json"; then
      sed -i 's|"@vtstech/pi-shared": "[^"]*"|"@vtstech/pi-shared": "'$NEW_VERSION'"|' "$pkg_dir/package.json"
    fi
    
    # Update @mariozechner peer dependencies to @earendil-works
    sed -i 's|"@mariozechner/pi-coding-agent"|"@earendil-works/pi-coding-agent"|g' "$pkg_dir/package.json"
    
    info "  Updated $pkg_name/package.json"
  fi
done

# 6. README.md — update version references (if it exists and contains version)
if [ -f "$REPO_ROOT/README.md" ]; then
  log "Updating README.md"
  
  # Simple version replacements (avoid complex regex)
  sed -i "s/v$CURRENT_VERSION/v$NEW_VERSION/g" "$REPO_ROOT/README.md" 2>/dev/null || true
  sed -i "s/@vtstech/pi-[a-z]*-extensions@$CURRENT_VERSION/@vtstech/pi-coding-agent-extensions@$NEW_VERSION/g" "$REPO_ROOT/README.md" 2>/dev/null || true
  sed -i "s/version $CURRENT_VERSION/version $NEW_VERSION/g" "$REPO_ROOT/README.md" 2>/dev/null || true
  
  # Check if we made any changes to README.md
  if ! grep -q "$NEW_VERSION" "$REPO_ROOT/README.md"; then
    info "  No version references found in README.md"
  fi
fi

# 7. dist/*/package.json — built packages for npm publishing
if [ -d "$REPO_ROOT/dist" ]; then
  log "Updating dist packages"
  for pkg_dir in "$REPO_ROOT/dist"/*/; do
    if [ -f "$pkg_dir/package.json" ]; then
      pkg_name="$(basename "$pkg_dir")"
      
      # Update version
      sed -i 's/"version": "[0-9]*\.[0-9]*\.[0-9]*[a-zA-Z0-9.+-]*"/"version": "'$NEW_VERSION'"/' "$pkg_dir/package.json"
      
      # Update shared dependency version if it exists
      if grep -q '"@vtstech/pi-shared"' "$pkg_dir/package.json"; then
        sed -i 's|"@vtstech/pi-shared": "[^"]*"|"@vtstech/pi-shared": "'$NEW_VERSION'"|' "$pkg_dir/package.json"
      fi
      
      # Update @mariozechner peer dependencies to @earendil-works
      sed -i 's|"@mariozechner/pi-coding-agent"|"@earendil-works/pi-coding-agent"|g' "$pkg_dir/package.json"
      
      info "  Updated dist/$pkg_name/package.json"
    fi
  done
fi

echo ""
log "✅ Version bumped: $CURRENT_VERSION → $NEW_VERSION"
info ""
info "Next steps:"
info "  1. Review changes: git diff"
info "  2. Build:         ./scripts/build-tgz.sh"
info "  3. Commit:        git add -A && git commit -m \"v$NEW_VERSION\""
info "  4. Copy dist/ to Windows and run: cd dist && npm publish (for each package)"
info ""
info "Pi package installation:"
info "  pi install git:github.com/VTSTech/pi-coding-agent"
echo ""