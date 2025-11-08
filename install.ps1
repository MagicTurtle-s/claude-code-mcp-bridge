# install.ps1 - Windows PowerShell installer for Claude Code MCP Bridge
# Run with: powershell -ExecutionPolicy Bypass -File install.ps1

$ErrorActionPreference = "Stop"

Write-Host "🚀 Claude Code MCP Bridge - Automated Installer" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================
# Step 1: Check Node.js
# ============================================
Write-Host "📦 Step 1: Checking Node.js..." -ForegroundColor Yellow

try {
    $nodeVersion = node --version
    $majorVersion = [int]($nodeVersion -replace 'v(\d+).*', '$1')

    if ($majorVersion -lt 18) {
        Write-Host "❌ Node.js version too old: $nodeVersion" -ForegroundColor Red
        Write-Host "Need Node.js 18+. Download from: https://nodejs.org/" -ForegroundColor Red
        exit 1
    }

    Write-Host "✅ Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "Node.js 18+ is required. Install from: https://nodejs.org/"
    Write-Host ""
    exit 1
}

Write-Host ""

# ============================================
# Step 2: Check/Install Claude Desktop
# ============================================
Write-Host "🖥️  Step 2: Checking Claude Desktop..." -ForegroundColor Yellow

$claudeDesktopPath = "$env:LOCALAPPDATA\Programs\Claude\Claude.exe"
$claudeDesktopInstalled = $false

if (Test-Path $claudeDesktopPath) {
    Write-Host "✅ Claude Desktop already installed" -ForegroundColor Green
    $claudeDesktopInstalled = $true
} else {
    Write-Host "⚠️  Claude Desktop not found" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Claude Desktop is required for this bridge."
    Write-Host ""

    $response = Read-Host "Would you like to open the download page? (y/n)"

    if ($response -match '^[Yy]$') {
        Write-Host "🌐 Opening download page..."
        Start-Process "https://claude.com/download"
        Write-Host ""
        Write-Host "Please:"
        Write-Host "  1. Download and install Claude Desktop"
        Write-Host "  2. Re-run this script"
        Write-Host ""
        exit 0
    } else {
        Write-Host ""
        Write-Host "Please install Claude Desktop manually:"
        Write-Host "  1. Visit: https://claude.com/download"
        Write-Host "  2. Download and install Claude Desktop for Windows"
        Write-Host "  3. Re-run this script"
        Write-Host ""
        exit 1
    }
}

Write-Host ""

# ============================================
# Step 3: Check/Install Claude Code CLI
# ============================================
Write-Host "💻 Step 3: Checking Claude Code CLI..." -ForegroundColor Yellow

try {
    $claudeVersion = claude --version 2>&1
    Write-Host "✅ Claude Code CLI already installed: $claudeVersion" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Claude Code CLI not found" -ForegroundColor Yellow
    Write-Host ""

    $response = Read-Host "Would you like to install it now via npm? (y/n)"

    if ($response -match '^[Yy]$') {
        Write-Host "📥 Installing Claude Code CLI globally..."

        try {
            npm install -g @anthropic-ai/claude-code
            Write-Host "✅ Claude Code CLI installed" -ForegroundColor Green
            Write-Host ""
            Write-Host "⚠️  IMPORTANT: You need to authenticate Claude Code on first use:" -ForegroundColor Yellow
            Write-Host "   Run: claude --print 'test'"
            Write-Host "   This will open a browser for authentication."
            Write-Host ""
        } catch {
            Write-Host "❌ Failed to install Claude Code CLI" -ForegroundColor Red
            Write-Host ""
            Write-Host "Please install manually:"
            Write-Host "  npm install -g @anthropic-ai/claude-code"
            Write-Host ""
            exit 1
        }
    } else {
        Write-Host ""
        Write-Host "Please install Claude Code CLI manually:"
        Write-Host "  npm install -g @anthropic-ai/claude-code"
        Write-Host ""
        Write-Host "Then authenticate:"
        Write-Host "  claude --print 'test'"
        Write-Host ""
        exit 1
    }
}

Write-Host ""

# ============================================
# Step 4: Clone/Update Repository
# ============================================
Write-Host "📂 Step 4: Setting up MCP Bridge repository..." -ForegroundColor Yellow

# Check if we're already in the repo
if ((Test-Path "package.json") -and (Select-String -Path "package.json" -Pattern "claude-code-mcp" -Quiet)) {
    Write-Host "📁 Already inside repository"
    $repoDir = Get-Location
} else {
    if (Test-Path "claude-code-mcp-bridge") {
        Write-Host "📦 Repository exists, updating..."
        Set-Location claude-code-mcp-bridge
        try {
            git pull origin main 2>$null
        } catch {
            Write-Host "⚠️  Could not update, continuing with existing code" -ForegroundColor Yellow
        }
        $repoDir = Get-Location
    } else {
        Write-Host "📥 Cloning repository..."
        git clone https://github.com/MagicTurtle-s/claude-code-mcp-bridge.git
        Set-Location claude-code-mcp-bridge
        $repoDir = Get-Location
    }
}

Write-Host "✅ Repository ready at: $repoDir" -ForegroundColor Green
Write-Host ""

# ============================================
# Step 5: Check if Already Configured
# ============================================
Write-Host "🔍 Step 5: Checking existing configuration..." -ForegroundColor Yellow

$configPath = "$env:APPDATA\Claude\claude_desktop_config.json"
$alreadyConfigured = $false

if (Test-Path $configPath) {
    $configContent = Get-Content $configPath -Raw
    if ($configContent -match "claude-code-bridge") {
        Write-Host "✅ Claude Desktop already configured with MCP bridge" -ForegroundColor Green
        $alreadyConfigured = $true
    }
}

Write-Host ""

# ============================================
# Step 6: Install Dependencies and Build
# ============================================
Write-Host "📦 Step 6: Installing dependencies..." -ForegroundColor Yellow

try {
    npm install
    Write-Host "✅ Dependencies installed" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🔨 Step 7: Building project..." -ForegroundColor Yellow

if ($alreadyConfigured) {
    # Skip interactive setup, just build
    if (-not (Test-Path "build")) {
        npm run build
    } else {
        Write-Host "✅ Build already exists" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "🔧 Updating configuration..." -ForegroundColor Yellow
    # Force reconfigure to update paths
    node scripts/configure-claude.js
} else {
    # Run full setup (builds and configures)
    if ($alreadyConfigured) {
        $env:SKIP_INTERACTIVE = "true"
    }
    npm run setup
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "🎉 Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# ============================================
# Final Instructions
# ============================================

if ($alreadyConfigured) {
    Write-Host "📝 Configuration updated successfully!"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "  1. Restart Claude Desktop"
    Write-Host "  2. The MCP bridge is ready to use"
} else {
    Write-Host "📝 Next steps:"
    Write-Host "  1. Restart Claude Desktop"
    Write-Host "  2. Try: 'Use Claude Code to analyze my project'"
}

Write-Host ""
Write-Host "🔧 Useful commands:"
Write-Host "  claude-code-mcp validate   # Verify setup"
Write-Host "  claude-code-mcp doctor     # Diagnose issues"
Write-Host "  claude-code-mcp configure  # Reconfigure"
Write-Host ""

try {
    claude --version | Out-Null
} catch {
    Write-Host "⚠️  Don't forget to authenticate Claude Code CLI:" -ForegroundColor Yellow
    Write-Host "   claude --print 'test'"
    Write-Host ""
}

Write-Host "✅ All done! Enjoy using Claude Code with Claude Desktop!" -ForegroundColor Green
Write-Host ""
