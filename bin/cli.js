#!/usr/bin/env node

/**
 * Claude Code MCP Bridge CLI
 */

const { program } = require('commander');
const path = require('path');
const { execSync } = require('child_process');

program
  .name('claude-code-mcp')
  .description('MCP Bridge for Claude Code CLI')
  .version('1.0.0');

program
  .command('setup')
  .description('Run interactive setup wizard')
  .action(() => {
    require('../scripts/setup.js');
  });

program
  .command('start')
  .description('Start the MCP server')
  .option('--debug', 'Enable debug logging')
  .action((options) => {
    const serverPath = path.join(__dirname, '..', 'build', 'index.js');
    const args = options.debug ? ['--debug'] : [];

    console.log('🚀 Starting Claude Code MCP Bridge...');
    try {
      execSync(`node "${serverPath}" ${args.join(' ')}`, {
        stdio: 'inherit',
      });
    } catch (error) {
      console.error('❌ Failed to start server:', error.message);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate setup and configuration')
  .action(() => {
    require('../scripts/validate.js');
  });

program
  .command('configure')
  .description('Configure Claude Desktop integration')
  .action(() => {
    require('../scripts/configure-claude.js');
  });

program
  .command('doctor')
  .description('Diagnose common issues')
  .action(() => {
    console.log('🔍 Running diagnostics...\n');

    // Check Node.js version
    const nodeVersion = process.version;
    console.log(`✓ Node.js version: ${nodeVersion}`);

    // Check if build directory exists
    const fs = require('fs');
    const buildPath = path.join(__dirname, '..', 'build');
    if (fs.existsSync(buildPath)) {
      console.log('✓ Build directory exists');
    } else {
      console.log('❌ Build directory missing. Run: npm run build');
    }

    // Check Claude Code CLI
    try {
      execSync('claude --version', { stdio: 'pipe' });
      console.log('✓ Claude Code CLI found');
    } catch (error) {
      console.log('❌ Claude Code CLI not found in PATH');
    }

    // Check Claude Desktop config
    const configPath = path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json');
    if (fs.existsSync(configPath)) {
      console.log('✓ Claude Desktop config found');

      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const hasMCPServer = config.mcpServers && config.mcpServers['claude-code-bridge'];
        if (hasMCPServer) {
          console.log('✓ MCP server configured in Claude Desktop');
        } else {
          console.log('⚠️  MCP server not configured. Run: claude-code-mcp configure');
        }
      } catch (error) {
        console.log('❌ Failed to parse Claude Desktop config');
      }
    } else {
      console.log('⚠️  Claude Desktop config not found');
    }

    console.log('\n✅ Diagnostics complete');
  });

program.parse();
