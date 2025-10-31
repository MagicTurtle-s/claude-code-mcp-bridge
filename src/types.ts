/**
 * TypeScript type definitions for Claude Code MCP Bridge
 */

import { ChildProcess } from 'child_process';

/**
 * Permission modes for Claude Code execution
 */
export type PermissionMode = 'plan' | 'acceptEdits' | 'default' | 'bypassPermissions';

/**
 * Options for executing Claude Code CLI
 */
export interface ClaudeCodeExecutionOptions {
  /** The task/prompt to execute */
  prompt: string;

  /** Permission mode to use */
  permissionMode?: PermissionMode;

  /** List of allowed tool patterns (e.g., ["Bash(git:*)", "Edit"]) */
  allowedTools?: string[];

  /** List of disallowed tool patterns */
  disallowedTools?: string[];

  /** Timeout in milliseconds */
  timeout?: number;

  /** Whether to include partial message chunks in streaming */
  includePartial?: boolean;

  /** Whether to stream progress updates */
  streamProgress?: boolean;

  /** Additional system prompt to append */
  appendSystemPrompt?: string;

  /** Model to use (sonnet, opus, haiku) */
  model?: 'sonnet' | 'opus' | 'haiku';
}

/**
 * Claude Code CLI JSON output format
 */
export interface ClaudeCodeResult {
  type: 'result';
  subtype: 'success' | 'error';
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  result: string;
  session_id: string;
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
    server_tool_use?: {
      web_search_requests: number;
    };
    service_tier: string;
    cache_creation?: {
      ephemeral_1h_input_tokens: number;
      ephemeral_5m_input_tokens: number;
    };
  };
  modelUsage: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
    webSearchRequests: number;
    costUSD: number;
    contextWindow: number;
  }>;
  permission_denials: Array<any>;
  uuid: string;
}

/**
 * Streaming message from Claude Code CLI
 */
export interface ClaudeCodeStreamMessage {
  type: 'partial' | 'complete' | 'tool_use' | 'error' | 'progress';
  content?: any;
  timestamp?: string;
}

/**
 * Session information
 */
export interface SessionInfo {
  id: string;
  process: ChildProcess | null;
  createdAt: number;
  lastActivity: number;
  status: 'active' | 'completed' | 'failed' | 'timeout';
  messageCount: number;
  prompt?: string;
  result?: ClaudeCodeResult;
}

/**
 * Event emitted by ClaudeCodeExecutor
 */
export type ExecutorEvent =
  | { type: 'start'; sessionId: string }
  | { type: 'partial'; data: ClaudeCodeStreamMessage }
  | { type: 'complete'; data: ClaudeCodeResult }
  | { type: 'error'; error: Error }
  | { type: 'timeout'; sessionId: string }
  | { type: 'progress'; message: string; percentage?: number };

/**
 * Configuration for the MCP server
 */
export interface MCPServerConfig {
  /** Path to Claude Code CLI executable */
  claudeCodePath: string;

  /** Default timeout for executions (ms) */
  defaultTimeout: number;

  /** Maximum concurrent executions */
  maxConcurrentExecutions: number;

  /** Session idle timeout (ms) */
  sessionIdleTimeout: number;

  /** Whether to enable debug logging */
  debug: boolean;
}

/**
 * MCP tool execution result
 */
export interface ToolExecutionResult {
  content: Array<{
    type: 'text';
    text: string;
  }>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}
