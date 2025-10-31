#!/usr/bin/env node

/**
 * Claude Code MCP Bridge - Entry Point
 *
 * This MCP server bridges Claude Desktop to Claude Code CLI,
 * enabling delegation to Claude Code subagents.
 */

import { ClaudeCodeMCPServer } from './server';

// Parse command line arguments
const args = process.argv.slice(2);
const debug = args.includes('--debug') || process.env.DEBUG === 'true';
const claudeCodePath = process.env.CLAUDE_CODE_PATH || 'claude';

// Create and start server
const server = new ClaudeCodeMCPServer({
  claudeCodePath,
  debug,
  defaultTimeout: 120000, // 2 minutes
  maxConcurrentExecutions: 5,
  sessionIdleTimeout: 30 * 60 * 1000, // 30 minutes
});

server.start().catch((error) => {
  console.error('Failed to start MCP server:', error);
  process.exit(1);
});
