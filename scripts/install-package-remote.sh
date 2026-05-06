#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# install-package-remote.sh — Install individual Pi packages from GitHub
#
# Downloads and installs a specific package from the remote GitHub repository
# without cloning the entire repo.
#
# Usage:
#   ./scripts/install-package-remote.sh <package-name> [version]
#
# Examples:
#   ./scripts/install-package-remote.sh pi-soul
#   ./scripts/install-package-remote.sh pi-diag v1.2.3
#   ./scripts/install-package-remote.sh pi-api latest
#
# Supported packages:
#   pi-shared, pi-api, pi-diag, pi-model-test, pi-ollama-sync,
#   pi-openrouter-sync, pi-react-fallback, pi-security, pi-soul, pi-status
# ---------------------------------------------------------------------------
set -euo pipefail

PACKAGE_NAME="$1"
VERSION="${2:-latest}"
REPO_URL="https://github.com/VTSTech/pi-coding-agent"
TEMP_DIR="/tmp/pi-package-install"
INSTALL_DIR="$HOME/.pi/agent/extensions"

# Available packages
declare -A AVAILABLE_PACKAGES=(
    ["pi-shared"]="shared"
    ["pi-api"]="api"
    ["pi-diag"]="diag"
    ["pi-model-test"]="model-test"
    ["pi-ollama-sync"]="ollama-sync"
    ["pi-openrouter-sync"]="openrouter-sync"
    ["pi-react-fallback"]="react-fallback"
    ["pi-security"]="security"
    ["pi-soul"]="soul"
    ["pi-status"]="status"
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
PACKAGE_URL="$REPO_URL/raw/main/individual-packages/$PACKAGE_DIR"

# ── Create installation directory ──────────────────────────────────────────
mkdir -p "$INSTALL_DIR"

# ── Download and install the package ──────────────────────────────────────
log "Installing $PACKAGE_NAME (version: $VERSION)..."

# Remove existing installation if present
if [[ -d "$INSTALL_DIR/$PACKAGE_NAME" ]]; then
    warn "Removing existing installation: $INSTALL_DIR/$PACKAGE_NAME"
    rm -rf "$INSTALL_DIR/$PACKAGE_NAME"
fi

# Create temporary directory
mkdir -p "$TEMP_DIR"

# Download package files
if [[ "$VERSION" == "latest" ]]; then
    info "Downloading from main branch..."
    curl -s "$PACKAGE_URL/package.json" -o "$TEMP_DIR/package.json"
    
    # Download the main JavaScript file
    MAIN_FILE=$(grep -o '"main": *"[^"]*"' "$TEMP_DIR/package.json" | cut -d'"' -f4)
    if [[ -n "$MAIN_FILE" ]]; then
        curl -s "$PACKAGE_URL/$MAIN_FILE" -o "$TEMP_DIR/$MAIN_FILE"
    fi
    
    # Download other files
    for file in $(curl -s "$PACKAGE_URL/" | grep -o 'href="[^"]*"' | cut -d'"' -f2 | grep -v '/' | grep -v 'package.json'); do
        curl -s "$PACKAGE_URL/$file" -o "$TEMP_DIR/$file"
    done
else
    info "Downloading from version $VERSION..."
    # For specific versions, we'd need to use the GitHub API
    # This is a simplified version - in practice, you'd need to handle versioning
    err "Version-specific downloads not implemented yet"
    exit 1
fi

# Copy files to installation directory
cp -r "$TEMP_DIR"/* "$INSTALL_DIR/$PACKAGE_NAME/"

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
rm -rf "$TEMP_DIR"

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