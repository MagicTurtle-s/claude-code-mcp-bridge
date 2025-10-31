#!/usr/bin/env node

/**
 * Configure Claude Desktop to use the MCP Bridge
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Configuring Claude Desktop MCP integration...\n');

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

console.log(`📁 Config path: ${configPath}\n`);

// Check if config file exists
if (!fs.existsSync(configPath)) {
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    console.log('📁 Creating Claude config directory...');
    fs.mkdirSync(configDir, { recursive: true });
  }
}

// Read existing config or create new
let config = {};
if (fs.existsSync(configPath)) {
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    console.log('✅ Existing config loaded\n');
  } catch (error) {
    console.log('⚠️  Failed to parse existing config, creating new one\n');
  }
}

// Backup existing config
if (fs.existsSync(configPath)) {
  const backupPath = `${configPath}.backup.${Date.now()}`;
  fs.copyFileSync(configPath, backupPath);
  console.log(`💾 Backup created: ${backupPath}\n`);
}

// Add MCP server configuration
config.mcpServers = config.mcpServers || {};

const serverPath = path.join(__dirname, '..', 'build', 'index.js');

config.mcpServers['claude-code-bridge'] = {
  command: 'node',
  args: [serverPath],
  env: {
    DEBUG: 'false',
    CLAUDE_CODE_PATH: 'claude',
  },
};

// Write updated config
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log('✅ Claude Desktop configuration updated!\n');
console.log('MCP Server added:');
console.log('  Name: claude-code-bridge');
console.log(`  Path: ${serverPath}\n`);
console.log('📝 Next steps:');
console.log('  1. Restart Claude Desktop to load the MCP server');
console.log('  2. The server will start automatically when Claude Desktop launches');
console.log('  3. Try asking Claude Desktop: "Use Claude Code to search my files"\n');
console.log('🎉 Setup complete!');
