#!/usr/bin/env node

/**
 * Validate Claude Code MCP Bridge setup
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 Validating Claude Code MCP Bridge setup...\n');

let passed = 0;
let failed = 0;
let warnings = 0;

function check(name, test, fix) {
  try {
    if (test()) {
      console.log(`✅ ${name}`);
      passed++;
      return true;
    } else {
      console.log(`❌ ${name}`);
      if (fix) console.log(`   Fix: ${fix}`);
      failed++;
      return false;
    }
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
    if (fix) console.log(`   Fix: ${fix}`);
    failed++;
    return false;
  }
}

function warn(name, message) {
  console.log(`⚠️  ${name}: ${message}`);
  warnings++;
}

// Check Node.js version
check(
  'Node.js version >= 18',
  () => {
    const version = process.version.match(/v(\d+)/)[1];
    return parseInt(version) >= 18;
  },
  'Install Node.js 18 or higher'
);

// Check if build directory exists
check(
  'Build directory exists',
  () => fs.existsSync(path.join(__dirname, '..', 'build')),
  'Run: npm run build'
);

// Check if main entry point exists
check(
  'Main entry point exists',
  () => fs.existsSync(path.join(__dirname, '..', 'build', 'index.js')),
  'Run: npm run build'
);

// Check Claude Code CLI
check(
  'Claude Code CLI is accessible',
  () => {
    try {
      execSync('claude --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  },
  'Install Claude Code CLI or add to PATH'
);

// Check if Claude Code works with JSON output
check(
  'Claude Code JSON output works',
  () => {
    try {
      const output = execSync('claude --print --output-format json "What is 2+2?"', {
        stdio: 'pipe',
        timeout: 30000,
      });
      const result = JSON.parse(output.toString());
      return result.type === 'result';
    } catch {
      return false;
    }
  },
  'Verify Claude Code CLI is properly installed'
);

// Check Claude Desktop config
const configPath = path.join(
  process.env.APPDATA || process.env.HOME || '',
  'Claude',
  'claude_desktop_config.json'
);

check(
  'Claude Desktop config exists',
  () => fs.existsSync(configPath),
  'Claude Desktop may not be installed'
);

if (fs.existsSync(configPath)) {
  check(
    'Claude Desktop config is valid JSON',
    () => {
      JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return true;
    },
    'Fix malformed JSON in config file'
  );

  check(
    'MCP server is configured in Claude Desktop',
    () => {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.mcpServers && config.mcpServers['claude-code-bridge'];
    },
    'Run: claude-code-mcp configure'
  );
}

// Check permissions on bin/cli.js
if (process.platform !== 'win32') {
  const cliPath = path.join(__dirname, '..', 'bin', 'cli.js');
  check(
    'CLI script is executable',
    () => {
      const stats = fs.statSync(cliPath);
      return (stats.mode & 0o111) !== 0;
    },
    `Run: chmod +x ${cliPath}`
  );
}

// Summary
console.log('\n' + '='.repeat(50));
console.log(`Validation complete:`);
console.log(`  ✅ Passed: ${passed}`);
console.log(`  ❌ Failed: ${failed}`);
console.log(`  ⚠️  Warnings: ${warnings}`);
console.log('='.repeat(50) + '\n');

if (failed === 0) {
  console.log('🎉 All checks passed! Ready to use.\n');
  console.log('Next steps:');
  console.log('  1. Restart Claude Desktop');
  console.log('  2. Ask Claude Desktop to use Claude Code via MCP\n');
  process.exit(0);
} else {
  console.log('❌ Some checks failed. Please fix the issues above.\n');
  process.exit(1);
}
