#!/usr/bin/env node

/**
 * Setup wizard for Claude Code MCP Bridge
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('\n🚀 Claude Code MCP Bridge - Setup Wizard\n');
console.log('This wizard will configure the MCP bridge between');
console.log('Claude Desktop and Claude Code CLI.\n');

// Check if running in CI/automated environment
const isAutomated = process.env.CI || process.env.AUTOMATED_SETUP;

if (isAutomated) {
  console.log('✅ Automated setup mode detected\n');
  console.log('📝 To configure manually later, run: claude-code-mcp setup\n');
  process.exit(0);
}

// Determine Claude Desktop config path based on OS
let configPath;
if (process.platform === 'darwin') {
  configPath = path.join(process.env.HOME, 'Library/Application Support/Claude/claude_desktop_config.json');
} else if (process.platform === 'win32') {
  configPath = path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
} else {
  // Linux
  configPath = path.join(process.env.HOME || '', '.config/Claude/claude_desktop_config.json');
}

// Check if already configured (skip in interactive mode)
if (fs.existsSync(configPath)) {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config.mcpServers && config.mcpServers['claude-code-bridge']) {
      console.log('✅ Claude Desktop already configured with MCP bridge!\n');
      console.log('Configuration found at:', configPath);
      console.log('\n📝 To reconfigure, run: claude-code-mcp configure');
      console.log('📝 To validate setup, run: claude-code-mcp validate\n');

      // Still ensure build exists
      const buildPath = path.join(__dirname, '..', 'build');
      if (!fs.existsSync(buildPath)) {
        console.log('🔨 Building project...');
        execSync('npm run build', {
          cwd: path.join(__dirname, '..'),
          stdio: 'inherit',
        });
        console.log('  ✅ Build complete\n');
      }

      process.exit(0);
    }
  } catch (error) {
    // Continue with setup if can't parse config
    console.log('⚠️  Could not parse existing config, continuing with setup...\n');
  }
}

// Step 1: Check Node.js version
console.log('Step 1: Checking Node.js version...');
const nodeVersion = process.version.match(/v(\d+)/)[1];
if (parseInt(nodeVersion) >= 18) {
  console.log(`  ✅ Node.js ${process.version}\n`);
} else {
  console.log(`  ❌ Node.js ${process.version} (need >=18)`);
  console.log('  Please upgrade Node.js to version 18 or higher\n');
  process.exit(1);
}

// Step 2: Build the project
console.log('Step 2: Building TypeScript project...');
const buildPath = path.join(__dirname, '..', 'build');
if (!fs.existsSync(buildPath)) {
  try {
    execSync('npm run build', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
    });
    console.log('  ✅ Build complete\n');
  } catch (error) {
    console.log('  ❌ Build failed');
    console.log('  Please run: npm run build\n');
    process.exit(1);
  }
} else {
  console.log('  ✅ Build directory exists\n');
}

// Step 3: Check Claude Code CLI
console.log('Step 3: Checking Claude Code CLI...');
try {
  const claudeVersion = execSync('claude --version', { stdio: 'pipe' }).toString().trim();
  console.log(`  ✅ Claude Code found: ${claudeVersion}\n`);
} catch (error) {
  console.log('  ❌ Claude Code CLI not found');
  console.log('  Please install Claude Code CLI and add to PATH');
  console.log('  Visit: https://docs.claude.com/claude-code\n');
  process.exit(1);
}

// Step 4: Test Claude Code JSON output
console.log('Step 4: Testing Claude Code JSON output...');
try {
  const testOutput = execSync('claude --print --output-format json "test"', {
    stdio: 'pipe',
    timeout: 15000,
  }).toString();
  JSON.parse(testOutput); // Verify it's valid JSON
  console.log('  ✅ Claude Code JSON output works\n');
} catch (error) {
  console.log('  ⚠️  Could not verify Claude Code JSON output');
  console.log('  This may cause issues, but continuing...\n');
}

// Step 5: Configure Claude Desktop
console.log('Step 5: Configuring Claude Desktop...');
try {
  require('./configure-claude.js');
} catch (error) {
  console.log('  ⚠️  Could not auto-configure Claude Desktop');
  console.log('  You can run manually: claude-code-mcp configure\n');
}

console.log('\n' + '='.repeat(60));
console.log('🎉 Setup Complete!');
console.log('='.repeat(60) + '\n');

console.log('What you can do now:\n');
console.log('  📋 Validate setup:');
console.log('     claude-code-mcp validate\n');
console.log('  🏥 Run diagnostics:');
console.log('     claude-code-mcp doctor\n');
console.log('  🚀 Start server manually:');
console.log('     claude-code-mcp start\n');
console.log('  🔧 Reconfigure Claude Desktop:');
console.log('     claude-code-mcp configure\n');

console.log('Next steps:\n');
console.log('  1. Restart Claude Desktop');
console.log('  2. The MCP server will start automatically');
console.log('  3. Try: "Use Claude Code to analyze my project"\n');

console.log('📚 Documentation:');
console.log('  README.md - Quick start guide');
console.log('  PROJECT.md - Project overview\n');
