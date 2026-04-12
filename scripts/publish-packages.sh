#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# publish-packages.sh — Publish npm packages to the registry.
#
# Publishes in dependency order: @vtstech/pi-shared first, then each extension.
# Requires: `npm login` already completed.
#
# Usage:
#   ./scripts/publish-packages.sh          # publish all
#   ./scripts/publish-packages.sh shared   # publish only shared
#   ./scripts/publish-packages.sh api      # publish only api
#
# Options:
#   --dry-run    Show what would be published without actually publishing
#   --tag <tag>  Publish with a custom dist-tag (default: latest)
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$REPO_ROOT/.build-npm"

VERSION="1.1.3-dev"
DRY_RUN=false
DIST_TAG="latest"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[publish]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC}  $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()  { echo -e "${RED}[error]${NC} $*"; }

# ── Parse args ────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --tag)
      DIST_TAG="$2"
      shift 2
      ;;
    shared|api|diag|model-test|ollama-sync|openrouter-sync|react-fallback|security|status|all)
      TARGET="$1"
      shift
      ;;
    *)
      echo "Usage: $0 [--dry-run] [--tag <tag>] [shared|api|diag|model-test|ollama-sync|react-fallback|security|status|all]"
      exit 1
      ;;
  esac
done

TARGET="${TARGET:-all}"

# ── Publish a single package ──────────────────────────────────────────────
publish_one() {
  local pkg_name="$1"
  local pkg_dir="$BUILD_DIR/$pkg_name"

  if [ ! -d "$pkg_dir" ]; then
    err "Package not found: $pkg_dir"
    err "Run ./scripts/build-packages.sh first!"
    return 1
  fi

  if [ ! -f "$pkg_dir/package.json" ]; then
    err "No package.json in: $pkg_dir"
    return 1
  fi

  local pkg_version
  pkg_version="$(node -e "console.log(require('$pkg_dir/package.json').version)")"

  if [ "$DRY_RUN" = true ]; then
    warn "[DRY RUN] Would publish: $pkg_name@$pkg_version (tag: $DIST_TAG)"
    return 0
  fi

  log "Publishing $pkg_name@$pkg_version (tag: $DIST_TAG)..."
  npm publish "$pkg_dir" --access public --tag "$DIST_TAG"

  if [ $? -eq 0 ]; then
    log "✅ Published: $pkg_name@$pkg_version"
  else
    err "❌ Failed to publish: $pkg_name"
    return 1
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────
echo ""
echo "  ⚡ Pi Extensions — npm Publisher"
echo "  Version: $VERSION"
echo "  Tag: $DIST_TAG"
if [ "$DRY_RUN" = true ]; then echo "  Mode: DRY RUN"; fi
echo ""

case "$TARGET" in
  shared)
    publish_one "shared"
    ;;
  all)
    # Shared must be published first — all extensions depend on it
    publish_one "shared"
    echo ""
    for ext in api diag model-test ollama-sync openrouter-sync react-fallback security status; do
      publish_one "$ext"
      echo ""
    done
    ;;
  api|diag|model-test|ollama-sync|openrouter-sync|react-fallback|security|status)
    # Ensure shared is published first
    publish_one "shared"
    echo ""
    publish_one "$TARGET"
    ;;
  *)
    echo "Usage: $0 [--dry-run] [--tag <tag>] [shared|api|diag|model-test|ollama-sync|react-fallback|security|status|all]"
    exit 1
    ;;
esac

echo ""
log "Done!"
echo ""
