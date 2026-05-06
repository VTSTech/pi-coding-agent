#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# build-tgz.sh — Build Pi package .tgz tarballs for individual packages.
#
# Compiles TypeScript source to JavaScript and creates proper Pi-style .tgz files
# for offline installation using `pi install <path/to/pkg.tgz>`.
#
# Usage:
#   ./scripts/build-tgz.sh          # build all packages
#   ./scripts/build-tgz.sh shared   # build only shared
#   ./scripts/build-tgz.sh soul     # build only soul extension
#
# Output:
#   dist/ — .tgz tarballs for each Pi package
#
# Requires: Node.js (for TypeScript compilation)
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$REPO_ROOT/dist"
INDIVIDUAL_PKGS_DIR="$REPO_ROOT/individual-packages"
SHARED_SRC="$REPO_ROOT/shared"
EXT_SRC="$REPO_ROOT/extensions"

# Read version from the VERSION file (single source of truth)
if [ ! -f "$REPO_ROOT/VERSION" ]; then
  echo -e "\033[0;31m[error]\033[0m  VERSION file not found at $REPO_ROOT/VERSION"
  exit 1
fi
VERSION="$(cat "$REPO_ROOT/VERSION" | tr -d '[:space:]')"

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[build]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC}  $*"; }
warn() { echo -e "${YELLOW}[warn]\033[0m  $*"; }
err()  { echo -e "${RED}[error]\033[0m  $*"; }

# ── Pre-flight checks ────────────────────────────────────────────────────
preflight() {
  # Ensure Node.js is available
  if ! command -v node &>/dev/null; then
    err "Node.js not found. Please install Node.js first."
    exit 1
  fi

  # Check if we have TypeScript available
  if ! command -v tsc &>/dev/null; then
    warn "TypeScript compiler not found. Using built-in transpiler..."
  fi

  # Ensure VERSION file exists
  if [ ! -f "$REPO_ROOT/VERSION" ]; then
    err "VERSION file not found at $REPO_ROOT/VERSION"
    exit 1
  fi
}

# ── Clean previous build ──────────────────────────────────────────────────
clean_build() {
  log "Cleaning previous build..."
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"
  info "Clean output directory: $BUILD_DIR"
}

# ── Compile TypeScript to JavaScript ─────────────────────────────────────
compile_ts() {
  local src_file="$1"
  local dest_file="$2"
  
  if command -v tsc &>/dev/null; then
    # Use TypeScript compiler if available
    tsc --target es2020 --module esnext --outDir "$(dirname "$dest_file")" --moduleResolution node --skipLibCheck "$src_file"
  else
    # Use Node.js built-in transpiler
    node -e "
      const fs = require('fs');
      const path = require('path');
      const ts = require('typescript');
      const source = fs.readFileSync('$src_file', 'utf8');
      const result = ts.transpile(source, {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        esModuleInterop: true,
        skipLibCheck: true
      });
      fs.writeFileSync('$dest_file', result);
    "
  fi
}

# ── Build shared utilities ────────────────────────────────────────────────
build_shared() {
  local TARGET="$BUILD_DIR/shared"
  local PKG_DIR="$INDIVIDUAL_PKGS_DIR/shared"
  local PKG_NAME="pi-shared"
  local TFILE="${PKG_NAME}-${VERSION}.tgz"
  
  mkdir -p "$TARGET"

  log "Building @vtstech/pi-shared v$VERSION"
  info "Compiling shared/*.ts → JavaScript"

  # Compile TypeScript to JavaScript
  for src_file in "$SHARED_SRC"/*.ts; do
    local basename
    basename="$(basename "$src_file" .ts)"
    local dest_file="$TARGET/$basename.js"

    compile_ts "$src_file" "$dest_file"
    info "  $basename.ts → $basename.js"
  done

  # Copy package.json to build dir
  cp "$PKG_DIR/package.json" "$TARGET/package.json"

  # Update version
  sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$TARGET/package.json"

  # Copy README stub if exists
  if [ -f "$PKG_DIR/README.md" ]; then
    cp "$PKG_DIR/README.md" "$TARGET/README.md"
  fi

  # Create Pi package structure according to Pi documentation
  # Pi expects files at the root of the tarball
  cp "$TARGET"/*.js "$TARGET/"
  cp "$TARGET/package.json" "$TARGET/"
  cp "$TARGET/README.md" "$TARGET/" 2>/dev/null || true

  # Create .tgz file using tar
  cd "$TARGET"
  tar -czf "$TFILE" .
  mv "$TFILE" "$BUILD_DIR/"
  cd "$REPO_ROOT"

  log "✅ @vtstech/pi-shared v$VERSION built → $BUILD_DIR/$TFILE"
}

# ── Build a single extension ──────────────────────────────────────────────
build_extension() {
  local ext_name="$1"
  local src_file="$EXT_SRC/${ext_name}.ts"
  local PKG_DIR="$INDIVIDUAL_PKGS_DIR/$ext_name"
  local TARGET="$BUILD_DIR/$ext_name"
  local PKG_NAME="pi-${ext_name}"
  local TFILE="${PKG_NAME}-${VERSION}.tgz"

  if [ ! -f "$src_file" ]; then
    warn "Source not found: $src_file"
    return 1
  fi

  mkdir -p "$TARGET"

  log "Building @vtstech/pi-${ext_name} v$VERSION"

  # Compile TypeScript to JavaScript
  local dest_file="$TARGET/${ext_name}.js"
  compile_ts "$src_file" "$dest_file"
  info "  ${ext_name}.ts → ${ext_name}.js"

  # Copy package.json to build dir
  if [ -f "$PKG_DIR/package.json" ]; then
    cp "$PKG_DIR/package.json" "$TARGET/package.json"
    
    # Update version
    sed -i "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" "$TARGET/package.json"
    
    # Update shared dependency version
    sed -i "s|\"@vtstech/pi-shared\": \"[^\"]*\"|\"@vtstech/pi-shared\": \"$VERSION\"|" "$TARGET/package.json"
  else
    warn "No package.json for $ext_name at $PKG_DIR/package.json — skipping"
    return 1
  fi

  # Copy README stub if exists
  if [ -f "$PKG_DIR/README.md" ]; then
    cp "$PKG_DIR/README.md" "$TARGET/README.md"
  fi

  # Create Pi package structure according to Pi documentation
  # Pi expects files at the root of the tarball
  cp "$TARGET"/*.js "$TARGET/"
  cp "$TARGET/package.json" "$TARGET/"
  cp "$TARGET/README.md" "$TARGET/" 2>/dev/null || true

  # Create .tgz file using tar
  cd "$TARGET"
  tar -czf "$TFILE" .
  mv "$TFILE" "$BUILD_DIR/"
  cd "$REPO_ROOT"

  info "  ${ext_name}.js → ${ext_name}.js (compiled)"
  log "✅ @vtstech/pi-${ext_name} v$VERSION built → $BUILD_DIR/$TFILE"
}

# ── Build all extensions ──────────────────────────────────────────────────
build_all_extensions() {
  local extensions=("api" "diag" "model-test" "ollama-sync" "openrouter-sync" "react-fallback" "security" "status" "soul")
  for ext in "${extensions[@]}"; do
    build_extension "$ext"
  done
}

# ── Main ──────────────────────────────────────────────────────────────────
main() {
  local target="${1:-all}"

  echo ""
  echo "  ⚡ Pi Extensions — Pi Package Builder"
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
      ;;
    api|diag|model-test|ollama-sync|openrouter-sync|react-fallback|security|soul|status)
      build_shared
      echo ""
      build_extension "$target"
      ;;
    *)
      echo "Usage: $0 [shared|api|diag|model-test|ollama-sync|openrouter-sync|react-fallback|security|status|soul|all]"
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
      echo "  soul               Build only @vtstech/pi-soul"
      echo "  status             Build only @vtstech/pi-status"
      exit 1
      ;;
  esac

  echo ""
  log "Build complete! Pi package .tgz files in: $BUILD_DIR"
  info ""
  info "Install locally with:"
  info "  pi install $BUILD_DIR/<pkg>.tgz"
  echo ""
}

main "$@"