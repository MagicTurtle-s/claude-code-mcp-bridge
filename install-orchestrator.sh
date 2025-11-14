#!/bin/bash

# Claude Code MCP Orchestrator - Multi-User Installation Script
#
# This script installs the Claude Code Orchestrator pattern with delegation tools
# for HubSpot, SharePoint, and Asana MCPs.
#
# Usage:
#   ./install-orchestrator.sh                    # Install to default paths
#   INSTALL_DIR=~/custom ./install-orchestrator.sh   # Install to custom directory
#

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Configuration
DEFAULT_INSTALL_DIR="$HOME"
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"

# Project repositories
BRIDGE_REPO="https://github.com/MagicTurtle-s/claude-code-mcp-bridge.git"
HUBSPOT_REPO="https://github.com/MagicTurtle-s/hubspot-mcp-railway.git"
SHAREPOINT_REPO="https://github.com/MagicTurtle-s/sharepoint-mcp-railway.git"
ASANA_REPO="https://github.com/MagicTurtle-s/asana-mcp-railway.git"

# Installation paths
BRIDGE_DIR="${BRIDGE_PROJECT_PATH:-$INSTALL_DIR/claude-code-mcp-bridge}"
HUBSPOT_DIR="${HUBSPOT_PROJECT_PATH:-$INSTALL_DIR/hubspot-mcp-railway}"
SHAREPOINT_DIR="${SHAREPOINT_PROJECT_PATH:-$INSTALL_DIR/sharepoint-mcp-railway}"
ASANA_DIR="${ASANA_PROJECT_PATH:-$INSTALL_DIR/asana-mcp-railway}"

# MCP Server URLs (can be overridden)
HUBSPOT_URL="${HUBSPOT_MCP_URL:-https://hubspot-mcp-railway-production-386b.up.railway.app/mcp}"
SHAREPOINT_URL="${SHAREPOINT_MCP_URL:-https://sharepoint-mcp-railway-production.up.railway.app/mcp}"
ASANA_URL="${ASANA_MCP_URL:-https://asana-mcp-railway-production.up.railway.app/sse}"

echo ""
info "========================================="
info "Claude Code MCP Orchestrator Installation"
info "========================================="
echo ""
info "Installation directory: $INSTALL_DIR"
echo ""

# Check prerequisites
info "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    error "Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    error "Node.js version must be 18 or higher. Current version: $(node --version)"
    exit 1
fi
success "Node.js $(node --version) detected"

if ! command -v npm &> /dev/null; then
    error "npm is not installed. Please install npm and try again."
    exit 1
fi
success "npm $(npm --version) detected"

if ! command -v git &> /dev/null; then
    error "git is not installed. Please install git and try again."
    exit 1
fi
success "git $(git --version) detected"

if ! command -v claude &> /dev/null; then
    warning "Claude Code CLI not found in PATH"
    warning "Please install Claude Code from https://docs.claude.com/en/docs/claude-code"
else
    success "Claude Code CLI detected"
fi

echo ""
info "Installing MCP server projects..."
echo ""

# Clone/update HubSpot MCP
if [ -d "$HUBSPOT_DIR" ]; then
    warning "HubSpot MCP directory already exists: $HUBSPOT_DIR"
    read -p "Update existing installation? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "Updating HubSpot MCP..."
        cd "$HUBSPOT_DIR"
        git pull
    fi
else
    info "Cloning HubSpot MCP to $HUBSPOT_DIR..."
    git clone "$HUBSPOT_REPO" "$HUBSPOT_DIR"
fi
success "HubSpot MCP repository ready"

# Clone/update SharePoint MCP
if [ -d "$SHAREPOINT_DIR" ]; then
    warning "SharePoint MCP directory already exists: $SHAREPOINT_DIR"
    read -p "Update existing installation? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "Updating SharePoint MCP..."
        cd "$SHAREPOINT_DIR"
        git pull
    fi
else
    info "Cloning SharePoint MCP to $SHAREPOINT_DIR..."
    git clone "$SHAREPOINT_REPO" "$SHAREPOINT_DIR"
fi
success "SharePoint MCP repository ready"

# Clone/update Asana MCP
if [ -d "$ASANA_DIR" ]; then
    warning "Asana MCP directory already exists: $ASANA_DIR"
    read -p "Update existing installation? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "Updating Asana MCP..."
        cd "$ASANA_DIR"
        git pull
    fi
else
    info "Cloning Asana MCP to $ASANA_DIR..."
    git clone "$ASANA_REPO" "$ASANA_DIR"
fi
success "Asana MCP repository ready"

# Clone/update Bridge
if [ -d "$BRIDGE_DIR" ]; then
    warning "Bridge directory already exists: $BRIDGE_DIR"
    read -p "Update existing installation? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        info "Updating Bridge..."
        cd "$BRIDGE_DIR"
        git pull
    fi
else
    info "Cloning Claude Code MCP Bridge to $BRIDGE_DIR..."
    git clone "$BRIDGE_REPO" "$BRIDGE_DIR"
fi
success "Bridge repository ready"

echo ""
info "Building Bridge MCP server..."
cd "$BRIDGE_DIR"
npm install
npm run build
success "Bridge built successfully"

echo ""
info "Generating environment configuration..."

# Create .env file
cat > "$BRIDGE_DIR/.env" << EOF
# Claude Code MCP Orchestrator Environment Configuration
# Generated on $(date)

# Project Paths (customize for your installation)
HUBSPOT_PROJECT_PATH=$HUBSPOT_DIR
SHAREPOINT_PROJECT_PATH=$SHAREPOINT_DIR
ASANA_PROJECT_PATH=$ASANA_DIR

# MCP Server URLs (use defaults or override for custom deployments)
HUBSPOT_MCP_URL=$HUBSPOT_URL
SHAREPOINT_MCP_URL=$SHAREPOINT_URL
ASANA_MCP_URL=$ASANA_URL

# Claude Code CLI Path (override if not in PATH)
# CLAUDE_CODE_PATH=/path/to/claude

# Debug mode (set to true for verbose logging)
# DEBUG=false
EOF

success "Environment configuration created: $BRIDGE_DIR/.env"

echo ""
info "Configuring Claude Desktop integration..."

# Determine Claude config path based on OS
if [[ "$OSTYPE" == "darwin"* ]]; then
    CLAUDE_CONFIG_DIR="$HOME/Library/Application Support/Claude"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    CLAUDE_CONFIG_DIR="$HOME/.config/Claude"
elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
    # Git Bash on Windows
    CLAUDE_CONFIG_DIR="$(cygpath -u "$APPDATA")/Claude"
else
    warning "Unknown OS type: $OSTYPE"
    CLAUDE_CONFIG_DIR="$HOME/.config/Claude"
fi

CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/claude_desktop_config.json"

info "Claude Desktop config location: $CLAUDE_CONFIG_FILE"

if [ ! -f "$CLAUDE_CONFIG_FILE" ]; then
    warning "Claude Desktop config not found, creating new config..."
    mkdir -p "$CLAUDE_CONFIG_DIR"
    echo '{"mcpServers":{}}' > "$CLAUDE_CONFIG_FILE"
fi

# Backup existing config
BACKUP_FILE="$CLAUDE_CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
cp "$CLAUDE_CONFIG_FILE" "$BACKUP_FILE"
success "Backed up existing config to: $BACKUP_FILE"

# Add Bridge MCP server to config using Python
info "Adding orchestrator Bridge MCP server to Claude Desktop..."

if command -v python3 &> /dev/null; then
    python3 << EOF
import json
import sys

config_file = "$CLAUDE_CONFIG_FILE"
bridge_dir = "$BRIDGE_DIR"

try:
    with open(config_file, 'r') as f:
        config = json.load(f)
except:
    config = {"mcpServers": {}}

if "mcpServers" not in config:
    config["mcpServers"] = {}

config["mcpServers"]["claude-code-orchestrator"] = {
    "command": "node",
    "args": [f"{bridge_dir}/dist/index.js"],
    "env": {
        "HUBSPOT_PROJECT_PATH": "$HUBSPOT_DIR",
        "SHAREPOINT_PROJECT_PATH": "$SHAREPOINT_DIR",
        "ASANA_PROJECT_PATH": "$ASANA_DIR",
        "HUBSPOT_MCP_URL": "$HUBSPOT_URL",
        "SHAREPOINT_MCP_URL": "$SHAREPOINT_URL",
        "ASANA_MCP_URL": "$ASANA_URL"
    }
}

with open(config_file, 'w') as f:
    json.dump(config, f, indent=2)

print("SUCCESS")
EOF

    if [ $? -eq 0 ]; then
        success "Orchestrator Bridge MCP server added to Claude Desktop"
    else
        error "Failed to update Claude Desktop config"
        exit 1
    fi
else
    error "Python 3 not found. Please manually add Bridge MCP server to Claude Desktop config."
    echo ""
    echo "Add this to your $CLAUDE_CONFIG_FILE:"
    echo ""
    cat << EOF
{
  "mcpServers": {
    "claude-code-orchestrator": {
      "command": "node",
      "args": ["$BRIDGE_DIR/dist/index.js"],
      "env": {
        "HUBSPOT_PROJECT_PATH": "$HUBSPOT_DIR",
        "SHAREPOINT_PROJECT_PATH": "$SHAREPOINT_DIR",
        "ASANA_PROJECT_PATH": "$ASANA_DIR",
        "HUBSPOT_MCP_URL": "$HUBSPOT_URL",
        "SHAREPOINT_MCP_URL": "$SHAREPOINT_URL",
        "ASANA_MCP_URL": "$ASANA_URL"
      }
    }
  }
}
EOF
fi

echo ""
success "========================================="
success "Installation Complete!"
success "========================================="
echo ""
info "Next steps:"
echo "  1. Restart Claude Desktop to load the orchestrator"
echo "  2. In Claude Code, use delegation tools:"
echo "     - delegate_hubspot_task: Delegate tasks requiring HubSpot CRM access"
echo "     - delegate_sharepoint_task: Delegate tasks requiring SharePoint access"
echo "     - delegate_asana_task: Delegate tasks requiring Asana project management"
echo "     - delegate_batch_tasks: Run multiple delegations in parallel"
echo ""
info "How it works:"
echo "  - Global Code starts with 0 MCP token overhead"
echo "  - When you need MCP access, Code delegates to specialized subprocesses"
echo "  - Each subprocess runs in the project directory with the appropriate MCP context"
echo "  - Parallel execution saves time when working across multiple systems"
echo ""
info "Environment configuration:"
echo "  Location: $BRIDGE_DIR/.env"
echo "  Customize paths and URLs as needed"
echo ""
info "Installed components:"
echo "  - Orchestrator Bridge: $BRIDGE_DIR"
echo "  - HubSpot MCP Project: $HUBSPOT_DIR"
echo "  - SharePoint MCP Project: $SHAREPOINT_DIR"
echo "  - Asana MCP Project: $ASANA_DIR"
echo ""
info "Documentation:"
echo "  - Architecture: $BRIDGE_DIR/PROJECT.md"
echo "  - Usage guide: $BRIDGE_DIR/.claude/context.md"
echo ""
