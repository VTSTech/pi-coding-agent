#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# install-all-packages.sh — Install all Pi packages via GitHub
#
# Downloads and installs all packages from the VTSTech/pi-coding-agent
# repository without using npm.
#
# Usage:
#   ./scripts/install-all-packages.sh [version]
#
# Examples:
#   ./scripts/install-all-packages.sh
#   ./scripts/install-all-packages.sh v1.2.3
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

VERSION="${1:-latest}"
INSTALL_DIR="$HOME/.pi/agent/extensions"

# Available packages
PACKAGES=(
    "pi-shared"
    "pi-api"
    "pi-diag"
    "pi-model-test"
    "pi-ollama-sync"
    "pi-openrouter-sync"
    "pi-react-fallback"
    "pi-security"
    "pi-soul"
    "pi-status"
)

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[install]${NC} $*"; }
info() { echo -e "${CYAN}[info]${NC}  $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
err()  { echo -e "${RED}[error]${NC}  $*"; }

# ── Create installation directory ──────────────────────────────────────────
log "Installing all Pi packages (version: $VERSION)..."
mkdir -p "$INSTALL_DIR"

# ── Install each package ─────────────────────────────────────────────────
for package in "${PACKAGES[@]}"; do
    log "Installing $package..."
    
    # Remove existing installation if present
    if [[ -d "$INSTALL_DIR/$package" ]]; then
        warn "Removing existing installation: $INSTALL_DIR/$package"
        rm -rf "$INSTALL_DIR/$package"
    fi
    
    # Copy package files
    PACKAGE_DIR="${package#pi-}"
    if [[ -d "$REPO_ROOT/individual-packages/$PACKAGE_DIR" ]]; then
        cp -r "$REPO_ROOT/individual-packages/$PACKAGE_DIR" "$INSTALL_DIR/$package"
        
        # Fix package.json for Pi
        PACKAGE_JSON="$INSTALL_DIR/$package/package.json"
        if [[ -f "$PACKAGE_JSON" ]]; then
            sed -i '/"access":/d' "$PACKAGE_JSON"
            sed -i '/"npm"/d' "$PACKAGE_JSON"
            
            # Update pi.extensions to point to the correct file
            case "$package" in
                "pi-shared")
                    # Shared package doesn't have pi.extensions
                    ;;
                "pi-soul")
                    sed -i 's|"extensions": \["./dist/soul.js"\]|"extensions": ["./soul.js"]|' "$PACKAGE_JSON"
                    ;;
                *)
                    MAIN_FILE="${PACKAGE_DIR}.js"
                    sed -i "s|\"main\": \"${MAIN_FILE}\"|\"main\": \"${MAIN_FILE}\"|" "$PACKAGE_JSON"
                    sed -i "s|\"extensions\": \[\"\.\/${MAIN_FILE}\"\]|\"extensions\": [\"./${MAIN_FILE}\"]|" "$PACKAGE_JSON"
                    ;;
            esac
        fi
        
        log "✅ $package installed"
    else
        err "Package not found: $package"
    fi
    
    echo ""
done

# ── Clean up ─────────────────────────────────────────────────────────────
log "✅ All packages installed successfully!"
log "Location: $INSTALL_DIR"
log ""
log "Restart Pi to load all extensions"
log ""
log "To verify the extensions are loaded:"
echo "  - Run \"/security-audit\" to see active extensions"
echo "  - Check for commands like \"/diag\", \"/souls\", etc."
echo ""
log "To uninstall all packages:"
echo "  rm -rf $INSTALL_DIR/pi-*"