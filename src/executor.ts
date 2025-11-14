/**
 * ClaudeCodeExecutor - Spawns and manages Claude Code CLI processes
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as readline from 'readline';
import {
  ClaudeCodeExecutionOptions,
  ClaudeCodeResult,
  ClaudeCodeStreamMessage,
  ExecutorEvent,
} from './types';

export class ClaudeCodeExecutor extends EventEmitter {
  private process: ChildProcess | null = null;
  private timeout: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;

  constructor(private claudeCodePath: string = 'claude') {
    super();
  }

  /**
   * Execute a Claude Code task with streaming support
   */
  async execute(options: ClaudeCodeExecutionOptions): Promise<ClaudeCodeResult> {
    return new Promise((resolve, reject) => {
      const args = this.buildCommandArgs(options);

      // Emit start event
      this.emit('executor:start', { type: 'start', sessionId: this.sessionId || 'unknown' } as ExecutorEvent);

      // Spawn Claude Code process
      this.process = spawn(this.claudeCodePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        cwd: options.workingDirectory || process.cwd(),
      });

      const chunks: ClaudeCodeStreamMessage[] = [];
      let finalResult: ClaudeCodeResult | null = null;

      // Set up line-by-line streaming parser
      const rl = readline.createInterface({
        input: this.process.stdout!,
        crlfDelay: Infinity,
      });

      rl.on('line', (line: string) => {
        try {
          const data = JSON.parse(line);

          // Store in chunks
          chunks.push(data);

          // Determine message type
          if (data.type === 'result') {
            finalResult = data as ClaudeCodeResult;
            this.sessionId = data.session_id;
            this.emit('executor:complete', { type: 'complete', data: finalResult } as ExecutorEvent);
          } else if (options.streamProgress) {
            // Emit partial updates if streaming is enabled
            this.emit('executor:partial', { type: 'partial', data } as ExecutorEvent);
          }
        } catch (parseError) {
          // Ignore non-JSON lines (may be debug output)
          if (options.streamProgress) {
            this.emit('executor:progress', {
              type: 'progress',
              message: line,
            } as ExecutorEvent);
          }
        }
      });

      // Handle stderr
      this.process.stderr?.on('data', (data: Buffer) => {
        const errorMessage = data.toString();
        this.emit('executor:error', {
          type: 'error',
          error: new Error(`Claude Code stderr: ${errorMessage}`),
        } as ExecutorEvent);
      });

      // Handle process exit
      this.process.on('close', (code: number) => {
        this.cleanup();

        if (code === 0 && finalResult) {
          resolve(finalResult);
        } else if (code === 0) {
          reject(new Error('Claude Code exited successfully but no result was captured'));
        } else {
          reject(new Error(`Claude Code exited with code ${code}`));
        }
      });

      // Handle process errors
      this.process.on('error', (error: Error) => {
        this.cleanup();
        this.emit('executor:error', { type: 'error', error } as ExecutorEvent);
        reject(error);
      });

      // Set up timeout
      if (options.timeout) {
        this.timeout = setTimeout(() => {
          this.kill();
          this.emit('executor:timeout', {
            type: 'timeout',
            sessionId: this.sessionId || 'unknown',
          } as ExecutorEvent);
          reject(new Error(`Execution timeout after ${options.timeout}ms`));
        }, options.timeout);
      }
    });
  }

  /**
   * Build command-line arguments for Claude Code CLI
   */
  private buildCommandArgs(options: ClaudeCodeExecutionOptions): string[] {
    const args: string[] = [
      '--print', // Non-interactive mode
      '--output-format', 'stream-json', // Streaming JSON output
    ];

    // Permission mode
    if (options.permissionMode) {
      args.push('--permission-mode', options.permissionMode);
    }

    // MCP configuration file
    if (options.mcpConfigPath) {
      args.push('--mcp-config', options.mcpConfigPath);
    }

    // Allowed tools
    if (options.allowedTools && options.allowedTools.length > 0) {
      args.push('--allowedTools', ...options.allowedTools);
    }

    // Disallowed tools
    if (options.disallowedTools && options.disallowedTools.length > 0) {
      args.push('--disallowedTools', ...options.disallowedTools);
    }

    // Include partial messages
    if (options.includePartial) {
      args.push('--include-partial-messages');
    }

    // Model selection
    if (options.model) {
      args.push('--model', options.model);
    }

    // Append system prompt
    if (options.appendSystemPrompt) {
      args.push('--append-system-prompt', options.appendSystemPrompt);
    }

    // The prompt must be last
    args.push(options.prompt);

    return args;
  }

  /**
   * Kill the running process
   */
  kill(): void {
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }

    this.cleanup();
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }

  /**
   * Get the session ID from the last execution
   */
  getSessionId(): string | null {
    return this.sessionId;
  }

  /**
   * Check if process is currently running
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }
}
