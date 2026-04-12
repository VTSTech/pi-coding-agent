#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# build-packages.sh — Build individual npm packages from the monorepo source.
#
# Compiles shared/*.ts and extensions/*.ts to JavaScript, rewrites relative
# imports ("../shared/xxx") to "@vtstech/pi-shared/xxx", and copies the
# output into npm-packages/<name>/ ready for `npm publish`.
#
# Usage:
#   ./scripts/build-packages.sh          # build all + pack tarballs
#   ./scripts/build-packages.sh shared   # build only shared
#   ./scripts/build-packages.sh api      # build only api extension
#
# Output:
#   .build-npm/   — compiled packages (what gets published)
#   npm-packages/ — synced copies for review
#   dist/         — .tgz tarballs for offline testing (npm install ./dist/<pkg>.tgz)
#
# Requires: Node.js, npm (for esbuild — must be in devDependencies)
# ---------------------------------------------------------------------------
#
# Pre-Publish testing flow
#
## 1) Build all packages + tarballs
#./scripts/build-packages.sh all
#
## 2) Publish shared prerelease (when shared changes)
#npm publish .build-npm/shared --tag dev
#
## 3) Install + register extension
#pi install npm:/absolute/path/to/dist/<pkg>.tgz
#ln -s ~/.npm-global/lib/node_modules/@vtstech/pi-<name> ~/.pi/agent/extensions/pi-<name>
#
## 4) Test
#pi   # /diag, /model-test, etc.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NPM_PKG_DIR="$REPO_ROOT/npm-packages"
SHARED_SRC="$REPO_ROOT/shared"
EXT_SRC="$REPO_ROOT/extensions"
BUILD_DIR="$REPO_ROOT/.build-npm"

VERSION="1.1.4-dev"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[build]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC}  $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()  { echo -e "${RED}[error]${NC}  $*"; }

# ── Pre-flight checks ────────────────────────────────────────────────────
preflight() {
  # Ensure esbuild is available via devDependencies
  if ! npx --no esbuild --version &>/dev/null; then
    err "esbuild not found. Run 'npm install' in the repo root first."
    err "(esbuild is declared as a devDependency in package.json)"
    exit 1
  fi

  # Guard against stale .ts files in npm-packages/shared/ — the canonical
  # source of truth is shared/*.ts at the repo root.  TypeScript files must
  # NOT exist in npm-packages/shared/ because they are never kept in sync
  # by the build pipeline and will silently drift out of date.
  local stale_ts
  stale_ts=$(find "$NPM_PKG_DIR/shared" -name '*.ts' -type f 2>/dev/null || true)
  if [ -n "$stale_ts" ]; then
    err "Stale .ts source files found in npm-packages/shared/:"
    echo "$stale_ts" | while read -r f; do err "  $f"; done
    err ""
    err "These are NOT used by the build (which compiles from shared/*.ts)"
    err "and will drift out of sync. Delete them with:"
    err "  rm npm-packages/shared/*.ts"
    exit 1
  fi
}

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

  # Sync shared (JS + package.json with version)
  cp "$BUILD_DIR/shared/"*.js "$NPM_PKG_DIR/shared/" 2>/dev/null || true
  cp "$BUILD_DIR/shared/package.json" "$NPM_PKG_DIR/shared/" 2>/dev/null || true

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

# ── Pack tarballs for offline testing ─────────────────────────────────────
pack_tarballs() {
  log "Packing tarballs for offline testing..."

  local dist_dir="$REPO_ROOT/dist"
  mkdir -p "$dist_dir"
  rm -f "$dist_dir"/*.tgz 2>/dev/null || true

  for pkg_dir in "$BUILD_DIR"/*/; do
    local pkg_name
    pkg_name="$(basename "$pkg_dir")"
    local tgz_name

    # Run npm pack inside the package dir so the tarball lands there
    tgz_name="$(cd "$pkg_dir" && npm pack --quiet 2>/dev/null || true)"

    if [ -n "$tgz_name" ] && [ -f "$pkg_dir/$tgz_name" ]; then
      mv "$pkg_dir/$tgz_name" "$dist_dir/"
      info "  $tgz_name"
    fi
  done

  local count
  count="$(find "$dist_dir" -name '*.tgz' -type f | wc -l)"
  log "✅ $count tarball(s) packed → $dist_dir/"
  info "  Install locally: npm install $dist_dir/<pkg>.tgz"
}

# ── Main ──────────────────────────────────────────────────────────────────
main() {
  local target="${1:-all}"

  echo ""
  echo "  ⚡ Pi Extensions — npm Package Builder"
  echo "  Version: $VERSION"
  echo ""

  preflight
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
      echo ""
      pack_tarballs
      ;;
    api|diag|model-test|ollama-sync|openrouter-sync|react-fallback|security|status)
      build_shared
      echo ""
      build_extension "$target"
      echo ""
      sync_to_pkg_dir
      echo ""
      pack_tarballs
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
