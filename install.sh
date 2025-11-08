#!/usr/bin/env bash
# install.sh - Smart one-command installer for Claude Code MCP Bridge
# Handles Claude Desktop, Claude Code CLI, and bridge installation

set -e

echo "🚀 Claude Code MCP Bridge - Automated Installer"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect OS
OS_TYPE=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS_TYPE="mac"
    CONFIG_PATH="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
    CLAUDE_DESKTOP_APP="/Applications/Claude.app"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS_TYPE="linux"
    CONFIG_PATH="$HOME/.config/Claude/claude_desktop_config.json"
    CLAUDE_DESKTOP_APP=""
else
    echo -e "${RED}❌ Unsupported OS: $OSTYPE${NC}"
    echo "This script supports macOS and Linux. For Windows, use install.ps1"
    exit 1
fi

echo "Detected OS: $OS_TYPE"
echo ""

# ============================================
# Step 1: Check Node.js
# ============================================
echo "📦 Step 1: Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js not found${NC}"
    echo ""
    echo "Node.js 18+ is required. Install it from:"
    echo "  https://nodejs.org/"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Node.js version too old: $(node -v)${NC}"
    echo "Need Node.js 18+. Please upgrade from: https://nodejs.org/"
    exit 1
fi

echo -e "${GREEN}✅ Node.js $(node -v)${NC}"
echo ""

# ============================================
# Step 2: Check/Install Claude Desktop
# ============================================
echo "🖥️  Step 2: Checking Claude Desktop..."

CLAUDE_DESKTOP_INSTALLED=false

if [ "$OS_TYPE" == "mac" ]; then
    if [ -d "$CLAUDE_DESKTOP_APP" ]; then
        echo -e "${GREEN}✅ Claude Desktop already installed${NC}"
        CLAUDE_DESKTOP_INSTALLED=true
    else
        echo -e "${YELLOW}⚠️  Claude Desktop not found${NC}"
        echo ""
        echo "Claude Desktop is required for this bridge."
        echo ""
        read -p "Would you like to download and install it now? (y/n) " -n 1 -r
        echo ""

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo "📥 Downloading Claude Desktop for Mac..."
            TEMP_PKG="/tmp/claude-desktop.pkg"

            # Try to download (URL may need updating based on latest release)
            if curl -L "https://storage.googleapis.com/osprey-downloads-c02f6a0d-347c-492b-a752-3e0651722e97/nest-win-x64/Claude-Setup-x64.exe" -o "$TEMP_PKG" 2>/dev/null; then
                echo "📦 Installing Claude Desktop..."
                sudo installer -pkg "$TEMP_PKG" -target /
                rm "$TEMP_PKG"
                echo -e "${GREEN}✅ Claude Desktop installed${NC}"
                CLAUDE_DESKTOP_INSTALLED=true
            else
                echo -e "${YELLOW}⚠️  Automatic download failed${NC}"
                echo ""
                echo "Please manually download and install Claude Desktop:"
                echo "  1. Visit: https://claude.com/download"
                echo "  2. Download and install Claude Desktop"
                echo "  3. Re-run this script"
                echo ""
                exit 1
            fi
        else
            echo ""
            echo "Please install Claude Desktop manually:"
            echo "  1. Visit: https://claude.com/download"
            echo "  2. Download and install Claude Desktop for Mac"
            echo "  3. Re-run this script"
            echo ""
            exit 1
        fi
    fi
elif [ "$OS_TYPE" == "linux" ]; then
    echo -e "${YELLOW}⚠️  Claude Desktop for Linux${NC}"
    echo ""
    echo "Note: Claude Desktop doesn't have an official Linux version."
    echo "You can:"
    echo "  1. Use Windows version with Wine"
    echo "  2. Use web version at claude.ai (limited MCP support)"
    echo "  3. Continue and configure manually later"
    echo ""
    read -p "Continue without Claude Desktop? (y/n) " -n 1 -r
    echo ""

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""

# ============================================
# Step 3: Check/Install Claude Code CLI
# ============================================
echo "💻 Step 3: Checking Claude Code CLI..."

if command -v claude &> /dev/null; then
    CLAUDE_VERSION=$(claude --version 2>&1 || echo "unknown")
    echo -e "${GREEN}✅ Claude Code CLI already installed: $CLAUDE_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  Claude Code CLI not found${NC}"
    echo ""
    read -p "Would you like to install it now via npm? (y/n) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "📥 Installing Claude Code CLI globally..."
        if npm install -g @anthropic-ai/claude-code; then
            echo -e "${GREEN}✅ Claude Code CLI installed${NC}"
            echo ""
            echo "⚠️  IMPORTANT: You need to authenticate Claude Code on first use:"
            echo "   Run: claude --print 'test'"
            echo "   This will open a browser for authentication."
            echo ""
        else
            echo -e "${RED}❌ Failed to install Claude Code CLI${NC}"
            echo ""
            echo "Please install manually:"
            echo "  npm install -g @anthropic-ai/claude-code"
            echo ""
            exit 1
        fi
    else
        echo ""
        echo "Please install Claude Code CLI manually:"
        echo "  npm install -g @anthropic-ai/claude-code"
        echo ""
        echo "Then authenticate:"
        echo "  claude --print 'test'"
        echo ""
        exit 1
    fi
fi

echo ""

# ============================================
# Step 4: Clone/Update Repository
# ============================================
echo "📂 Step 4: Setting up MCP Bridge repository..."

# Detect if we're already inside the repo
if [ -f "package.json" ] && grep -q "claude-code-mcp" package.json 2>/dev/null; then
    echo "📁 Already inside repository"
    REPO_DIR=$(pwd)
else
    if [ -d "claude-code-mcp-bridge" ]; then
        echo "📦 Repository exists, updating..."
        cd claude-code-mcp-bridge
        git pull origin main 2>/dev/null || echo -e "${YELLOW}⚠️  Could not update, continuing with existing code${NC}"
        REPO_DIR=$(pwd)
    else
        echo "📥 Cloning repository..."
        git clone https://github.com/MagicTurtle-s/claude-code-mcp-bridge.git
        cd claude-code-mcp-bridge
        REPO_DIR=$(pwd)
    fi
fi

echo -e "${GREEN}✅ Repository ready at: $REPO_DIR${NC}"
echo ""

# ============================================
# Step 5: Check if Already Configured
# ============================================
echo "🔍 Step 5: Checking existing configuration..."

ALREADY_CONFIGURED=false
if [ -f "$CONFIG_PATH" ]; then
    if grep -q "claude-code-bridge" "$CONFIG_PATH" 2>/dev/null; then
        echo -e "${GREEN}✅ Claude Desktop already configured with MCP bridge${NC}"
        ALREADY_CONFIGURED=true
    fi
fi

echo ""

# ============================================
# Step 6: Install Dependencies and Build
# ============================================
echo "📦 Step 6: Installing dependencies..."

if npm install; then
    echo -e "${GREEN}✅ Dependencies installed${NC}"
else
    echo -e "${RED}❌ Failed to install dependencies${NC}"
    exit 1
fi

echo ""
echo "🔨 Step 7: Building project..."

if [ "$ALREADY_CONFIGURED" = true ]; then
    # Skip interactive setup, just build
    if [ ! -d "build" ]; then
        npm run build
    else
        echo -e "${GREEN}✅ Build already exists${NC}"
    fi

    echo ""
    echo "🔧 Updating configuration..."
    # Force reconfigure to update paths
    node scripts/configure-claude.js
else
    # Run full setup (builds and configures)
    # Set env var to indicate automated mode for updates
    if [ "$ALREADY_CONFIGURED" = true ]; then
        export SKIP_INTERACTIVE=true
    fi
    npm run setup
fi

echo ""
echo "========================================"
echo "🎉 Installation Complete!"
echo "========================================"
echo ""

# ============================================
# Final Instructions
# ============================================

if [ "$ALREADY_CONFIGURED" = true ]; then
    echo "📝 Configuration updated successfully!"
    echo ""
    echo "Next steps:"
    echo "  1. Restart Claude Desktop"
    echo "  2. The MCP bridge is ready to use"
else
    echo "📝 Next steps:"
    echo "  1. Restart Claude Desktop"
    echo "  2. Try: 'Use Claude Code to analyze my project'"
fi

echo ""
echo "🔧 Useful commands:"
echo "  claude-code-mcp validate   # Verify setup"
echo "  claude-code-mcp doctor     # Diagnose issues"
echo "  claude-code-mcp configure  # Reconfigure"
echo ""

if ! command -v claude &> /dev/null; then
    echo -e "${YELLOW}⚠️  Don't forget to authenticate Claude Code CLI:${NC}"
    echo "   claude --print 'test'"
    echo ""
fi

echo "✅ All done! Enjoy using Claude Code with Claude Desktop!"
echo ""
