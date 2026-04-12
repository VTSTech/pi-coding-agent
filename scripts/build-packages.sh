#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# build-packages.sh — Build individual npm packages from the monorepo source.
#
# Compiles shared/*.ts and extensions/*.ts to JavaScript, rewrites relative
# imports ("../shared/xxx") to "@vtstech/pi-shared/xxx", and copies the
# output into npm-packages/<name>/ ready for `npm publish`.
#
# Usage:
#   ./scripts/build-packages.sh          # build all
#   ./scripts/build-packages.sh shared   # build only shared
#   ./scripts/build-packages.sh api      # build only api extension
#
# Requires: Node.js, npx (for esbuild)
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NPM_PKG_DIR="$REPO_ROOT/npm-packages"
SHARED_SRC="$REPO_ROOT/shared"
EXT_SRC="$REPO_ROOT/extensions"
BUILD_DIR="$REPO_ROOT/.build-npm"

VERSION="1.1.0"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[build]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC}  $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }

# ── Clean previous build ──────────────────────────────────────────────────
clean_build() {
  log "Cleaning previous build..."
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
}

# ── Build shared utilities ────────────────────────────────────────────────
build_shared() {
  local TARGET="$BUILD_DIR/shared"
  mkdir -p "$TARGET"

  log "Building @vtstech/pi-shared"
  info "Compiling shared/*.ts → JavaScript"

  for src_file in "$SHARED_SRC"/*.ts; do
    local basename
    basename="$(basename "$src_file" .ts)"
    local dest_file="$TARGET/$basename.js"

    # Compile TypeScript to JavaScript using esbuild (fast, no config needed)
    npx esbuild "$src_file" \
      --bundle \
      --outfile="$dest_file" \
      --format=esm \
      --platform=node \
      --target=es2020 \
      --external:@mariozechner/pi-coding-agent

    info "  $basename.ts → $basename.js"
  done

  # Copy package.json to build dir
  cp "$NPM_PKG_DIR/shared/package.json" "$TARGET/package.json"

  # Update version
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$TARGET/package.json"

  # Copy README stub if exists
  if [ -f "$NPM_PKG_DIR/shared/README.md" ]; then
    cp "$NPM_PKG_DIR/shared/README.md" "$TARGET/README.md"
  fi

  log "✅ @vtstech/pi-shared built → $TARGET"
}

# ── Build a single extension ──────────────────────────────────────────────
build_extension() {
  local ext_name="$1"
  local src_file="$EXT_SRC/${ext_name}.ts"
  local target_dir="$BUILD_DIR/$ext_name"

  if [ ! -f "$src_file" ]; then
    warn "Source not found: $src_file"
    return 1
  fi

  mkdir -p "$target_dir"

  log "Building @vtstech/pi-${ext_name}"

  # Rewrite imports BEFORE compilation since esbuild resolves them at build time.
  # Create a temp .ts file with rewritten import paths, then compile that.
  local temp_ts="$target_dir/${ext_name}.temp.ts"
  sed 's|from "../shared/\([^"]*\)"|from "@vtstech/pi-shared/\1"|g' "$src_file" > "$temp_ts"

  local dest_file="$target_dir/${ext_name}.js"

  npx esbuild "$temp_ts" \
    --bundle \
    --outfile="$dest_file" \
    --format=esm \
    --platform=node \
    --target=es2020 \
    --external:@mariozechner/pi-coding-agent \
    --external:@vtstech/pi-shared

  rm -f "$temp_ts"

  # Copy package.json to build dir
  local pkg_dir="$NPM_PKG_DIR/$ext_name"
  if [ -f "$pkg_dir/package.json" ]; then
    cp "$pkg_dir/package.json" "$target_dir/package.json"
  else
    warn "No package.json for $ext_name at $pkg_dir/package.json — skipping"
    return 1
  fi

  # Update version
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$target_dir/package.json"
  sed -i "s|\"@vtstech/pi-shared\": \"[^\"]*\"|\"@vtstech/pi-shared\": \"$VERSION\"|" "$target_dir/package.json"

  # Copy README stub if exists
  if [ -f "$pkg_dir/README.md" ]; then
    cp "$pkg_dir/README.md" "$target_dir/README.md"
  fi

  info "  ${ext_name}.ts → ${ext_name}.js (imports rewritten)"
  log "✅ @vtstech/pi-${ext_name} built → $target_dir"
}

# ── Build all extensions ──────────────────────────────────────────────────
build_all_extensions() {
  local extensions=("api" "diag" "model-test" "ollama-sync" "openrouter-sync" "react-fallback" "security" "status")
  for ext in "${extensions[@]}"; do
    build_extension "$ext"
  done
}

# ── Copy build artifacts back to npm-packages for review ──────────────────
sync_to_pkg_dir() {
  log "Syncing build output to npm-packages/..."

  # Sync shared
  cp "$BUILD_DIR/shared/"*.js "$NPM_PKG_DIR/shared/" 2>/dev/null || true

  # Sync each extension
  for ext_dir in "$BUILD_DIR"/*/; do
    local ext_name
    ext_name="$(basename "$ext_dir")"
    if [ "$ext_name" = "shared" ]; then continue; fi
    if [ -d "$NPM_PKG_DIR/$ext_name" ]; then
      cp "$ext_dir"*.js "$NPM_PKG_DIR/$ext_name/" 2>/dev/null || true
      cp "$ext_dir/package.json" "$NPM_PKG_DIR/$ext_name/" 2>/dev/null || true
    fi
  done

  log "✅ Synced to npm-packages/"
}

# ── Main ──────────────────────────────────────────────────────────────────
main() {
  local target="${1:-all}"

  echo ""
  echo "  ⚡ Pi Extensions — npm Package Builder"
  echo "  Version: $VERSION"
  echo ""

  clean_build

  case "$target" in
    shared)
      build_shared
      ;;
    all)
      build_shared
      echo ""
      build_all_extensions
      echo ""
      sync_to_pkg_dir
      ;;
    api|diag|model-test|ollama-sync|openrouter-sync|react-fallback|security|status)
      build_shared
      echo ""
      build_extension "$target"
      echo ""
      sync_to_pkg_dir
      ;;
    *)
      echo "Usage: $0 [shared|api|diag|model-test|ollama-sync|openrouter-sync|react-fallback|security|status|all]"
      echo ""
      echo "  all (default)      Build all packages"
      echo "  shared             Build only @vtstech/pi-shared"
      echo "  api                Build only @vtstech/pi-api"
      echo "  diag               Build only @vtstech/pi-diag"
      echo "  model-test         Build only @vtstech/pi-model-test"
      echo "  ollama-sync        Build only @vtstech/pi-ollama-sync"
      echo "  openrouter-sync    Build only @vtstech/pi-openrouter-sync"
      echo "  react-fallback     Build only @vtstech/pi-react-fallback"
      echo "  security           Build only @vtstech/pi-security"
      echo "  status             Build only @vtstech/pi-status"
      exit 1
      ;;
  esac

  echo ""
  log "Build complete! Output in: $BUILD_DIR"
  log "Packages ready for: npm publish (from each package directory)"
  echo ""
}

main "$@"
