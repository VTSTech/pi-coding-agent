#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# build-tgz.sh — Build Pi package .tgz tarballs for individual packages.
#
# Uses esbuild to compile TypeScript → JavaScript.
#
# Strategy:
#   - Shared package:  transpile each .ts → .js individually (no bundle).
#                      Relative imports between shared modules are preserved
#                      since all .js files end up in the same package dir.
#   - Extensions:      bundle with esbuild.  All shared/* imports are inlined.
#                      Pi core packages (@mariozechner/*, typebox) are kept
#                      as externals — Pi provides them at runtime.
#
# This produces self-contained extension tgz files that work without any
# dependency on @vtstech/pi-shared, matching how the hand-built .js files
# in individual-packages/ already work.
#
# Usage:
#   ./scripts/build-tgz.sh            # build all packages
#   ./scripts/build-tgz.sh shared     # build only shared
#   ./scripts/build-tgz.sh security   # build only the security extension
#
# Output:
#   dist/  — one .tgz per Pi package
#
# Requires:  Node.js, esbuild
#   npm install -g esbuild            # or
#   npm install --save-dev esbuild    # (local, preferred)
# ---------------------------------------------------------------------------
set -euo pipefail

# ── Paths ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$REPO_ROOT/dist"
INDIVIDUAL_PKGS_DIR="$REPO_ROOT/individual-packages"
SHARED_SRC="$REPO_ROOT/shared"
EXT_SRC="$REPO_ROOT/extensions"

# ── Version ──────────────────────────────────────────────────────────────
if [ ! -f "$REPO_ROOT/VERSION" ]; then
  echo "ERROR: VERSION file not found at $REPO_ROOT/VERSION" >&2
  exit 1
fi
VERSION="$(tr -d '[:space:]' < "$REPO_ROOT/VERSION")"

# ── Colors (ANSI, disabled when stdout is not a terminal) ────────────────
if [ -t 1 ]; then
  GREEN='\033[0;32m'; CYAN='\033[0;36m'
  YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
else
  GREEN=''; CYAN=''; YELLOW=''; RED=''; NC=''
fi

log()  { printf "${GREEN}[build]${NC} %s\n" "$*"; }
info() { printf "${CYAN}[info]${NC}  %s\n" "$*"; }
warn() { printf "${YELLOW}[warn]${NC}  %s\n" "$*" >&2; }
err()  { printf "${RED}[error]${NC} %s\n" "$*" >&2; }

# ── Locate esbuild ───────────────────────────────────────────────────────
ESBUILD=""
find_esbuild() {
  # 1) local install (preferred)
  if [ -x "$REPO_ROOT/node_modules/.bin/esbuild" ]; then
    ESBUILD="$REPO_ROOT/node_modules/.bin/esbuild"
    return
  fi
  # 2) global install
  if command -v esbuild &>/dev/null; then
    ESBUILD="$(command -v esbuild)"
    return
  fi
  # 3) npx (downloads on first use)
  if command -v npx &>/dev/null; then
    ESBUILD="npx --yes esbuild"
    return
  fi
  err "esbuild not found."
  echo "" >&2
  echo "Install with one of:" >&2
  echo "  npm install --save-dev esbuild   # in repo root (recommended)" >&2
  echo "  npm install -g esbuild            # global" >&2
  echo "" >&2
  exit 1
}

# ── Pre-flight ───────────────────────────────────────────────────────────
preflight() {
  if ! command -v node &>/dev/null; then
    err "Node.js not found. Please install Node.js >= 18."
    exit 1
  fi
  local node_ver
  node_ver="$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')"
  if [ "$node_ver" -lt 18 ] 2>/dev/null; then
    err "Node.js 18+ required (found ${node_ver})."
    exit 1
  fi
  find_esbuild
}

# ── Clean ────────────────────────────────────────────────────────────────
_BUMP_HELPER=""

clean_build() {
  log "Cleaning previous build..."
  rm -rf "$BUILD_DIR"
  mkdir -p "$BUILD_DIR"

  # Write a tiny helper script that fixes package.json files.
  # Using a real file instead of heredoc/eval avoids ALL bash↔JS quoting
  # issues (dollar signs, backticks, regex, trailing commas in source JSON).
  _BUMP_HELPER="$BUILD_DIR/_fix_pkg.cjs"
  cat > "$_BUMP_HELPER" <<'HELPER_EOF'
const fs = require("fs");
const [, , srcDir, version, outPath, stripShared] = process.argv;
let raw = fs.readFileSync(srcDir + "/package.json", "utf8");
// Strip trailing commas — many editors leave them in hand-maintained JSON
raw = raw.replace(/,\s*([\]}])/g, "$1");
const p = JSON.parse(raw);
p.version = version;
if (stripShared === "true" && p.dependencies && p.dependencies["@vtstech/pi-shared"]) {
  delete p.dependencies["@vtstech/pi-shared"];
  if (Object.keys(p.dependencies).length === 0) delete p.dependencies;
}
fs.writeFileSync(outPath, JSON.stringify(p, null, 2) + "\n");
HELPER_EOF
}

# Helper: fix up a package.json (version bump, optional shared dep removal)
# Usage: _fix_pkg_json <src_pkg_dir> <out_json_path> <strip_shared:true|false>
_fix_pkg_json() {
  node "$_BUMP_HELPER" "$1" "$VERSION" "$2" "$3"
}

# ═══════════════════════════════════════════════════════════════════════════
#  Shared package  (transpile — no bundle)
# ═══════════════════════════════════════════════════════════════════════════
#
# Each shared/*.ts is compiled to its own .js file.  Inter-module imports
# like `import { debugLog } from "./debug"` become `from "./debug.js"`
# and resolve correctly because every .js lives in the same directory.
#
# types.ts is pure TypeScript type definitions — after stripping types the
# output is empty.  We emit a tiny placeholder so the exports map still
# resolves without warnings.

build_shared() {
  local TARGET="$BUILD_DIR/shared"
  local PKG_DIR="$INDIVIDUAL_PKGS_DIR/pi-shared"
  local TFILE="pi-shared-${VERSION}.tgz"

  mkdir -p "$TARGET"

  log "Building @vtstech/pi-shared v${VERSION}"
  info "Transpiling shared/*.ts (relative imports preserved)"

  local compiled=0
  for src_file in "$SHARED_SRC"/*.ts; do
    local base
    base="$(basename "$src_file" .ts)"
    local dest="$TARGET/${base}.js"

    # types.ts is type-only — produce a placeholder
    if [ "$base" = "types" ]; then
      info "  ${base}.ts -> placeholder (type-only definitions)"
      printf '// %s — type definitions are erased at compile time\n' "$base" > "$dest"
      compiled=$((compiled + 1))
      continue
    fi

    # Transpile single file (no bundling).  esbuild with --platform=node
    # automatically treats node:* specifiers as external.
    $ESBUILD "$src_file" \
      --format=esm \
      --target=es2020 \
      --platform=node \
      --outfile="$dest"

    info "  ${base}.ts -> ${base}.js"
    compiled=$((compiled + 1))
  done

  # ── package.json (version bump) ──────────────────────────────────────
  if [ -f "$PKG_DIR/package.json" ]; then
    _fix_pkg_json "$PKG_DIR" "$TARGET/package.json" "false"
  else
    err "Missing $PKG_DIR/package.json"
    return 1
  fi

  # ── README ───────────────────────────────────────────────────────────
  [ -f "$PKG_DIR/README.md" ] && cp "$PKG_DIR/README.md" "$TARGET/README.md"

  # ── tarball ──────────────────────────────────────────────────────────
  # Use * instead of . to avoid a leading "./" entry that npm rejects
  (cd "$TARGET" && tar -czf "$BUILD_DIR/$TFILE" *)

  log "  $compiled files transpiled"
  log "ok @vtstech/pi-shared v${VERSION} -> $BUILD_DIR/$TFILE"
}

# ═══════════════════════════════════════════════════════════════════════════
#  Single extension  (bundle — shared code inlined)
# ═══════════════════════════════════════════════════════════════════════════
#
# esbuild --bundle follows every import starting from the extension entry
# point and inlines everything *except* the externals we list.  This means
# the output .js is self-contained: no dependency on @vtstech/pi-shared.
#
# Externals (provided by Pi at runtime):
#   @mariozechner/*  — pi-coding-agent, pi-ai, pi-tui, pi-agent-core
#   typebox          — schema definitions for tool parameters

build_extension() {
  local ext_name="$1"
  local src_file="$EXT_SRC/${ext_name}.ts"
  local pkg_name="pi-${ext_name}"
  local PKG_DIR="$INDIVIDUAL_PKGS_DIR/${pkg_name}"
  local TARGET="$BUILD_DIR/${ext_name}"
  local TFILE="${pkg_name}-${VERSION}.tgz"

  # Validate inputs
  if [ ! -f "$src_file" ]; then
    warn "Source not found: $src_file — skipping"
    return 1
  fi
  if [ ! -f "$PKG_DIR/package.json" ]; then
    warn "No package.json at $PKG_DIR/package.json — skipping"
    return 1
  fi

  mkdir -p "$TARGET"

  log "Building @vtstech/${pkg_name} v${VERSION}"
  info "Bundling extensions/${ext_name}.ts (shared inlined, Pi core external)"

  # ── Bundle ───────────────────────────────────────────────────────────
  $ESBUILD "$src_file" \
    --bundle \
    --format=esm \
    --target=es2020 \
    --platform=node \
    --external:@mariozechner/* \
    --external:typebox \
    --outfile="$TARGET/${ext_name}.js"

  local js_size
  js_size="$(wc -c < "$TARGET/${ext_name}.js")"
  info "  ${ext_name}.ts -> ${ext_name}.js  ($(numfmt --to=iec "$js_size" 2>/dev/null || echo "${js_size}B"))"

  # ── package.json (version bump + remove shared dep) ─────────────────
  # Shared code is bundled into the extension, so @vtstech/pi-shared is
  # removed from dependencies (it's not on npm and would break install).
  _fix_pkg_json "$PKG_DIR" "$TARGET/package.json" "true"

  # ── README ───────────────────────────────────────────────────────────
  [ -f "$PKG_DIR/README.md" ] && cp "$PKG_DIR/README.md" "$TARGET/README.md"

  # ── tarball ──────────────────────────────────────────────────────────
  # Use * instead of . to avoid a leading "./" entry that npm rejects
  (cd "$TARGET" && tar -czf "$BUILD_DIR/$TFILE" *)

  log "ok @vtstech/${pkg_name} v${VERSION} -> $BUILD_DIR/$TFILE"
}

# ── Build all extensions ────────────────────────────────────────────────
ALL_EXTENSIONS=("api" "diag" "long-term-memory" "model-test" "ollama-sync" "openrouter-sync" "react-fallback" "security" "status" "soul")

build_all_extensions() {
  local failures=0
  for ext in "${ALL_EXTENSIONS[@]}"; do
    build_extension "$ext" || failures=$((failures + 1))
  done
  if [ "$failures" -gt 0 ]; then
    warn "${failures} extension(s) failed to build"
  fi
}

# ═══════════════════════════════════════════════════════════════════════════
#  Main
# ═══════════════════════════════════════════════════════════════════════════
main() {
  local target="${1:-all}"

  echo ""
  echo "  Pi Extensions  —  esbuild Package Builder"
  echo "  Version: ${VERSION}"
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
    api|diag|long-term-memory|model-test|ollama-sync|openrouter-sync|react-fallback|security|soul|status)
      build_shared
      echo ""
      build_extension "$target"
      ;;
    *)
      cat >&2 <<EOF
Usage: $0 [TARGET]

Targets:
  all              Build all packages (default)
  shared           Build only @vtstech/pi-shared
  api              Build only @vtstech/pi-api
  diag             Build only @vtstech/pi-diag
  long-term-memory Build only @vtstech/pi-long-term-memory
  model-test       Build only @vtstech/pi-model-test
  ollama-sync      Build only @vtstech/pi-ollama-sync
  openrouter-sync  Build only @vtstech/pi-openrouter-sync
  react-fallback   Build only @vtstech/pi-react-fallback
  security         Build only @vtstech/pi-security
  soul             Build only @vtstech/pi-soul
  status           Build only @vtstech/pi-status
EOF
      exit 1
      ;;
  esac

  # ── Summary ──────────────────────────────────────────────────────────
  echo ""
  log "Build complete!"
  echo ""
  echo "  Output directory: $BUILD_DIR/"
  echo ""

  if [ -d "$BUILD_DIR" ]; then
    local count
    count="$(find "$BUILD_DIR" -maxdepth 1 -name '*.tgz' | wc -l | tr -d ' ')"
    if [ "$count" -gt 0 ]; then
      echo "  Packages built (${count}):"
      echo "  ─────────────────────────────────────────────"
      for tgz in "$BUILD_DIR"/*.tgz; do
        local size
        size="$(wc -c < "$tgz")"
        local name
        name="$(basename "$tgz")"
        printf "    %-40s %s\n" "$name" "$(numfmt --to=iec "$size" 2>/dev/null || echo "${size}B")"
      done
      echo ""
    fi
  fi

  info "Install:"
  info "  pi install $BUILD_DIR/<pkg>.tgz"
  echo ""
}

main "$@"