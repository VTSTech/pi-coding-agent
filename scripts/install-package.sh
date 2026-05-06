#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# install-package.sh — Install individual Pi packages via GitHub
#
# Downloads and installs a specific package from the VTSTech/pi-coding-agent
# repository without using npm.
#
# Usage:
#   ./scripts/install-package.sh <package-name> [version]
#
# Examples:
#   ./scripts/install-package.sh pi-soul
#   ./scripts/install-package.sh pi-diag v1.2.3
#   ./scripts/install-package.sh pi-api latest
#
# Supported packages:
#   pi-shared, pi-api, pi-diag, pi-model-test, pi-ollama-sync,
#   pi-openrouter-sync, pi-react-fallback, pi-security, pi-soul, pi-status
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Package configuration
PACKAGE_NAME="$1"
VERSION="${2:-latest}"
REPO_URL="https://github.com/VTSTech/pi-coding-agent"
TEMP_DIR="/tmp/pi-package-install"
INSTALL_DIR="$HOME/.pi/agent/extensions"

# Available packages
declare -A AVAILABLE_PACKAGES=(
    ["pi-shared"]="pi-shared"
    ["pi-api"]="pi-api"
    ["pi-diag"]="pi-diag"
    ["pi-model-test"]="pi-model-test"
    ["pi-ollama-sync"]="pi-ollama-sync"
    ["pi-openrouter-sync"]="pi-openrouter-sync"
    ["pi-react-fallback"]="pi-react-fallback"
    ["pi-security"]="pi-security"
    ["pi-soul"]="pi-soul"
    ["pi-status"]="pi-status"
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

# ── Validate package name ────────────────────────────────────────────────
if [[ -z "$PACKAGE_NAME" ]]; then
    err "Package name is required"
    echo "Usage: $0 <package-name> [version]"
    echo ""
    echo "Available packages:"
    for pkg in "${!AVAILABLE_PACKAGES[@]}"; do
        echo "  $pkg"
    done
    exit 1
fi

if [[ -z "${AVAILABLE_PACKAGES[$PACKAGE_NAME]}" ]]; then
    err "Unknown package: $PACKAGE_NAME"
    echo "Available packages:"
    for pkg in "${!AVAILABLE_PACKAGES[@]}"; do
        echo "  $pkg"
    done
    exit 1
fi

PACKAGE_DIR="${AVAILABLE_PACKAGES[$PACKAGE_NAME]}"
PACKAGE_PATH="$REPO_ROOT/individual-packages/$PACKAGE_DIR"

# ── Check if package exists locally ────────────────────────────────────────
if [[ ! -d "$PACKAGE_PATH" ]]; then
    err "Package not found locally: $PACKAGE_PATH"
    err "Make sure you're in the correct repository directory"
    exit 1
fi

# ── Create installation directory ────────────────────────────────────────
mkdir -p "$INSTALL_DIR"

# ── Install the package ───────────────────────────────────────────────────
log "Installing $PACKAGE_NAME (version: $VERSION)..."

# Remove existing installation if present
if [[ -d "$INSTALL_DIR/$PACKAGE_NAME" ]]; then
    warn "Removing existing installation: $INSTALL_DIR/$PACKAGE_NAME"
    rm -rf "$INSTALL_DIR/$PACKAGE_NAME"
fi

# Copy package files
cp -r "$PACKAGE_PATH" "$INSTALL_DIR/$PACKAGE_NAME"

# Fix package.json for Pi (remove npm-specific fields)
PACKAGE_JSON="$INSTALL_DIR/$PACKAGE_NAME/package.json"
if [[ -f "$PACKAGE_JSON" ]]; then
    # Remove npm-specific fields that Pi doesn't need
    sed -i '/"access":/d' "$PACKAGE_JSON"
    sed -i '/"npm"/d' "$PACKAGE_JSON"
    
    # Update pi.extensions to point to the correct file
    case "$PACKAGE_NAME" in
        "pi-shared")
            # Shared package doesn't have pi.extensions
            ;;
        "pi-soul")
            sed -i 's|"extensions": \["./dist/soul.js"\]|"extensions": ["./soul.js"]|' "$PACKAGE_JSON"
            ;;
        *)
            # For other packages, ensure the main file is correctly referenced
            MAIN_FILE=$(basename "$PACKAGE_DIR").js
            sed -i "s|\"main\": \"${MAIN_FILE}\"|\"main\": \"${MAIN_FILE}\"|" "$PACKAGE_JSON"
            sed -i "s|\"extensions\": \[\"\.\/${MAIN_FILE}\"\]|\"extensions\": [\"./${MAIN_FILE}\"]|" "$PACKAGE_JSON"
            ;;
    esac
fi

# ── Clean up ─────────────────────────────────────────────────────────────
log "✅ $PACKAGE_NAME installed successfully!"
log "Location: $INSTALL_DIR/$PACKAGE_NAME"
log ""
log "Restart Pi to load the extension"
log ""
log "To verify the extension is loaded:"
echo "  - Run \"/security-audit\" to see active extensions"
echo "  - Check for the extension's command (e.g., \"/souls\" for pi-soul)"
echo ""
log "To uninstall:"
echo "  rm -rf $INSTALL_DIR/$PACKAGE_NAME"