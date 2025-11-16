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
  private debug: boolean = false;
  private allStdout: string[] = [];
  private allStderr: string[] = [];
  private allChunks: ClaudeCodeStreamMessage[] = [];

  constructor(private claudeCodePath: string = 'claude', debug: boolean = false) {
    super();
    this.debug = debug || process.env.DEBUG === 'true';
  }

  private log(...args: any[]): void {
    if (this.debug) {
      console.error('[ClaudeCodeExecutor]', ...args);
    }
  }

  /**
   * Execute a Claude Code task with streaming support
   */
  async execute(options: ClaudeCodeExecutionOptions): Promise<ClaudeCodeResult> {
    return new Promise((resolve, reject) => {
      const args = this.buildCommandArgs(options);

      this.log('Starting execution with args:', args);
      this.log('Prompt:', options.prompt);

      // Reset capture arrays
      this.allStdout = [];
      this.allStderr = [];
      this.allChunks = [];

      // Emit start event
      this.emit('executor:start', { type: 'start', sessionId: this.sessionId || 'unknown' } as ExecutorEvent);

      // Spawn Claude Code process
      this.log('Spawning process:', this.claudeCodePath);
      this.process = spawn(this.claudeCodePath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        cwd: options.workingDirectory || process.cwd(),
      });

      // Close stdin immediately - Claude Code doesn't need it for --print mode
      // and it waits for stdin to close before producing output
      this.process.stdin?.end();
      this.log('Stdin closed');

      const chunks: ClaudeCodeStreamMessage[] = [];
      let finalResult: ClaudeCodeResult | null = null;

      // Set up line-by-line streaming parser
      const rl = readline.createInterface({
        input: this.process.stdout!,
        crlfDelay: Infinity,
      });

      rl.on('line', (line: string) => {
        // Capture all stdout
        this.allStdout.push(line);

        try {
          const data = JSON.parse(line);

          this.log('Received JSON:', data.type, data.subtype || '');

          // Store in chunks
          chunks.push(data);
          this.allChunks.push(data);

          // Determine message type
          if (data.type === 'result') {
            finalResult = data as ClaudeCodeResult;
            this.sessionId = data.session_id;
            this.log('Final result received:', {
              sessionId: this.sessionId,
              subtype: finalResult.subtype,
              is_error: finalResult.is_error,
              resultLength: finalResult.result?.length || 0,
            });
            this.emit('executor:complete', { type: 'complete', data: finalResult } as ExecutorEvent);
          } else if (options.streamProgress) {
            // Emit partial updates if streaming is enabled
            this.emit('executor:partial', { type: 'partial', data } as ExecutorEvent);
          }
        } catch (parseError) {
          // Non-JSON line (may be debug output)
          this.log('Non-JSON stdout:', line);
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
        this.allStderr.push(errorMessage);
        this.log('stderr:', errorMessage);
        this.emit('executor:error', {
          type: 'error',
          error: new Error(`Claude Code stderr: ${errorMessage}`),
        } as ExecutorEvent);
      });

      // Handle process exit
      this.process.on('close', (code: number) => {
        this.cleanup();

        this.log('Process closed with code:', code);
        this.log('Total stdout lines:', this.allStdout.length);
        this.log('Total stderr lines:', this.allStderr.length);
        this.log('Total JSON chunks:', this.allChunks.length);
        this.log('Final result captured:', !!finalResult);

        if (code === 0 && finalResult) {
          this.log('Resolving with result');
          resolve(finalResult);
        } else if (code === 0) {
          const errorDetails = {
            message: 'Claude Code exited successfully but no result was captured',
            stdoutLines: this.allStdout.length,
            stderrLines: this.allStderr.length,
            chunksReceived: this.allChunks.length,
            lastStdout: this.allStdout.slice(-5),
            lastStderr: this.allStderr.slice(-5),
            chunks: this.allChunks.map(c => ({ type: c.type, hasContent: !!c.content })),
          };
          this.log('Error details:', errorDetails);
          reject(new Error(JSON.stringify(errorDetails, null, 2)));
        } else {
          const errorDetails = {
            message: `Claude Code exited with code ${code}`,
            stderr: this.allStderr.join('\n'),
            lastStdout: this.allStdout.slice(-10),
          };
          this.log('Exit error details:', errorDetails);
          reject(new Error(JSON.stringify(errorDetails, null, 2)));
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
      '--verbose', // Required for stream-json output format
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

  /**
   * Get all captured stdout lines
   */
  getAllStdout(): string[] {
    return [...this.allStdout];
  }

  /**
   * Get all captured stderr lines
   */
  getAllStderr(): string[] {
    return [...this.allStderr];
  }

  /**
   * Get all captured JSON chunks
   */
  getAllChunks(): ClaudeCodeStreamMessage[] {
    return [...this.allChunks];
  }

  /**
   * Get diagnostic information about the last execution
   */
  getDiagnostics(): {
    stdoutLines: number;
    stderrLines: number;
    chunksReceived: number;
    sessionId: string | null;
    lastStdout: string[];
    lastStderr: string[];
    chunkTypes: string[];
  } {
    return {
      stdoutLines: this.allStdout.length,
      stderrLines: this.allStderr.length,
      chunksReceived: this.allChunks.length,
      sessionId: this.sessionId,
      lastStdout: this.allStdout.slice(-10),
      lastStderr: this.allStderr.slice(-10),
      chunkTypes: this.allChunks.map(c => c.type),
    };
  }
}
