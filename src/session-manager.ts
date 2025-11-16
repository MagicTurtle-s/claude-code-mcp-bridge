/**
 * Session Manager - Manages lifecycle of Claude Code execution sessions
 */

import { EventEmitter } from 'events';
import { ClaudeCodeExecutor } from './executor';
import {
  SessionInfo,
  ClaudeCodeExecutionOptions,
  ClaudeCodeResult,
  MCPServerConfig,
} from './types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private executors: Map<string, ClaudeCodeExecutor> = new Map();

  constructor(private config: MCPServerConfig) {
    super();
  }

  /**
   * Create and execute a new session
   */
  async createSession(
    options: ClaudeCodeExecutionOptions
  ): Promise<{ sessionId: string; result: ClaudeCodeResult; executor?: ClaudeCodeExecutor }> {
    const sessionId = this.generateSessionId();

    // Create session info
    const session: SessionInfo = {
      id: sessionId,
      process: null,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      status: 'active',
      messageCount: 0,
      prompt: options.prompt,
    };

    this.sessions.set(sessionId, session);
    this.emit('session:created', sessionId);

    // Create executor with debug flag
    const executor = new ClaudeCodeExecutor(this.config.claudeCodePath, this.config.debug);
    this.executors.set(sessionId, executor);

    // Forward executor events
    executor.on('executor:start', () => {
      this.updateSessionActivity(sessionId);
      this.emit('session:started', sessionId);
    });

    executor.on('executor:partial', (event) => {
      this.updateSessionActivity(sessionId);
      this.emit('session:partial', { sessionId, data: event.data });
    });

    executor.on('executor:progress', (event) => {
      this.updateSessionActivity(sessionId);
      this.emit('session:progress', { sessionId, message: event.message });
    });

    executor.on('executor:error', (event) => {
      this.updateSessionStatus(sessionId, 'failed');
      this.emit('session:error', { sessionId, error: event.error });
    });

    try {
      // Execute the task
      const result = await executor.execute({
        ...options,
        timeout: options.timeout || this.config.defaultTimeout,
      });

      // Update session with result
      session.result = result;
      session.status = 'completed';
      this.updateSessionActivity(sessionId);
      this.emit('session:completed', { sessionId, result });

      // Schedule cleanup
      this.scheduleSessionCleanup(sessionId);

      return { sessionId, result, executor };
    } catch (error) {
      // Update session status
      session.status = 'failed';
      this.updateSessionActivity(sessionId);
      this.emit('session:failed', { sessionId, error });

      // Schedule cleanup
      this.scheduleSessionCleanup(sessionId);

      throw error;
    }
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): SessionInfo[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.status === 'active'
    );
  }

  /**
   * Get all sessions
   */
  getAllSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Kill a running session
   */
  killSession(sessionId: string): boolean {
    const executor = this.executors.get(sessionId);
    if (executor && executor.isRunning()) {
      executor.kill();
      this.updateSessionStatus(sessionId, 'failed');
      this.cleanupSession(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Clean up a session immediately
   */
  cleanupSession(sessionId: string): void {
    // Clear timeout
    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }

    // Kill executor if running
    const executor = this.executors.get(sessionId);
    if (executor) {
      if (executor.isRunning()) {
        executor.kill();
      }
      executor.removeAllListeners();
      this.executors.delete(sessionId);
    }

    // Remove session
    this.sessions.delete(sessionId);
    this.emit('session:cleaned', sessionId);

    if (this.config.debug) {
      console.log(`[SessionManager] Session ${sessionId} cleaned up`);
    }
  }

  /**
   * Schedule automatic session cleanup after idle timeout
   */
  private scheduleSessionCleanup(sessionId: string): void {
    // Clear existing timeout
    const existingTimeout = this.sessionTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.cleanupSession(sessionId);
    }, this.config.sessionIdleTimeout);

    this.sessionTimeouts.set(sessionId, timeout);
  }

  /**
   * Update session activity timestamp
   */
  private updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
      session.messageCount++;
    }
  }

  /**
   * Update session status
   */
  private updateSessionStatus(
    sessionId: string,
    status: SessionInfo['status']
  ): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      this.updateSessionActivity(sessionId);
    }
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `sess_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Get session count
   */
  getSessionCount(): { total: number; active: number; completed: number; failed: number } {
    const sessions = Array.from(this.sessions.values());
    return {
      total: sessions.length,
      active: sessions.filter((s) => s.status === 'active').length,
      completed: sessions.filter((s) => s.status === 'completed').length,
      failed: sessions.filter((s) => s.status === 'failed').length,
    };
  }

  /**
   * Clean up all sessions
   */
  cleanupAll(): void {
    const sessionIds = Array.from(this.sessions.keys());
    sessionIds.forEach((id) => this.cleanupSession(id));
    this.emit('all:cleaned');

    if (this.config.debug) {
      console.log('[SessionManager] All sessions cleaned up');
    }
  }

  /**
   * Execute a delegated task with MCP context
   *
   * Creates a temporary MCP config file and spawns a Code process
   * in the specified working directory with that MCP context.
   *
   * @param options - Standard execution options
   * @param mcpConfig - MCP configuration object to use
   * @param workingDirectory - Working directory for the spawned process
   * @returns Session result with cleanup of temporary config file
   */
  async executeDelegatedTask(
    options: ClaudeCodeExecutionOptions,
    mcpConfig: any,
    workingDirectory: string
  ): Promise<{ sessionId: string; result: ClaudeCodeResult }> {
    // Create temporary MCP config file
    const tempDir = os.tmpdir();
    const tempConfigPath = path.join(
      tempDir,
      `mcp-config-${Date.now()}-${Math.random().toString(36).substring(7)}.json`
    );

    try {
      // Write MCP config to temp file
      await fs.writeFile(tempConfigPath, JSON.stringify(mcpConfig, null, 2), 'utf-8');

      if (this.config.debug) {
        console.log(`[SessionManager] Created temp MCP config: ${tempConfigPath}`);
        console.log(`[SessionManager] Working directory: ${workingDirectory}`);
      }

      // Execute with the temp config and working directory
      const result = await this.createSession({
        ...options,
        mcpConfigPath: tempConfigPath,
        workingDirectory,
      });

      return result;
    } finally {
      // Clean up temp config file
      try {
        await fs.unlink(tempConfigPath);
        if (this.config.debug) {
          console.log(`[SessionManager] Cleaned up temp MCP config: ${tempConfigPath}`);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
        if (this.config.debug) {
          console.warn(`[SessionManager] Failed to cleanup temp config: ${cleanupError}`);
        }
      }
    }
  }

  /**
   * Execute multiple delegated tasks in parallel
   *
   * Uses Promise.all() to run multiple Code processes simultaneously,
   * each with their own MCP context and working directory.
   *
   * @param tasks - Array of task configurations
   * @returns Array of results in the same order as tasks
   *
   * @example
   * const results = await sessionManager.executeBatch([
   *   { options: {...}, mcpConfig: {...}, workingDirectory: '...' },
   *   { options: {...}, mcpConfig: {...}, workingDirectory: '...' }
   * ]);
   */
  async executeBatch(
    tasks: Array<{
      options: ClaudeCodeExecutionOptions;
      mcpConfig: any;
      workingDirectory: string;
    }>
  ): Promise<Array<{ sessionId: string; result: ClaudeCodeResult }>> {
    if (this.config.debug) {
      console.log(`[SessionManager] Executing ${tasks.length} tasks in parallel`);
    }

    const startTime = Date.now();

    // Execute all tasks in parallel
    const results = await Promise.all(
      tasks.map((task) =>
        this.executeDelegatedTask(task.options, task.mcpConfig, task.workingDirectory)
      )
    );

    const duration = Date.now() - startTime;

    if (this.config.debug) {
      console.log(`[SessionManager] Batch completed in ${duration}ms`);
    }

    this.emit('batch:completed', { count: tasks.length, duration });

    return results;
  }
}
