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
   * Get bridge's own MCP config for recursive access
   * This allows spawned Code subprocesses to use the bridge themselves
   */
  private getBridgeConfig(): any {
    return {
      'claude-code-bridge': {
        type: 'stdio',
        command: 'node',
        args: [path.join(__dirname, '../build/index.js')],
        env: {
          DEBUG: this.config.debug ? 'true' : 'false',
          CLAUDE_CODE_PATH: this.config.claudeCodePath || 'claude'
        }
      }
    };
  }

  /**
   * Merge user-provided MCP config with bridge config for recursive access
   * Always creates a config with at least the bridge, even if no user config provided
   */
  private async createMergedConfig(mcpConfigPath?: string): Promise<string> {
    let userConfig = {};

    // Read user-provided config if available
    if (mcpConfigPath) {
      const userConfigContent = await fs.readFile(mcpConfigPath, 'utf-8');
      userConfig = JSON.parse(userConfigContent);
    }

    // Always merge with bridge config (bridge first, so user config takes precedence)
    const mergedConfig = {
      ...this.getBridgeConfig(),
      ...userConfig
    };

    // Write merged config to temp file
    const tempDir = os.tmpdir();
    const tempConfigPath = path.join(tempDir, `mcp-config-with-bridge-${Date.now()}.json`);
    await fs.writeFile(tempConfigPath, JSON.stringify(mergedConfig, null, 2));

    // Normalize path to forward slashes for cross-platform compatibility
    // Claude Code CLI has issues with backslashes on Windows
    return tempConfigPath.replace(/\\/g, '/');
  }

  /**
   * Create and execute a new session
   */
  async createSession(
    options: ClaudeCodeExecutionOptions
  ): Promise<{ sessionId: string; result: ClaudeCodeResult; executor?: ClaudeCodeExecutor }> {
    const sessionId = this.generateSessionId();
    let mergedConfigPath: string | undefined;

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

    // Always create merged config (user config + bridge) for recursive access
    // Even if no user config, Code gets bridge + orchestrator instructions
    mergedConfigPath = await this.createMergedConfig(options.mcpConfigPath);

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
      // Create orchestrator system prompt
      const orchestratorSystemPrompt = `You have access to the claude-code-bridge MCP which allows you to spawn Code subprocesses with specific MCP configurations.

Available MCP configs in project directories:
- HubSpot: C:\\Users\\jonat\\hubspot-mcp-railway\\.mcp-config.json (deals, contacts, companies)
- Asana: C:\\Users\\jonat\\asana-mcp-railway\\.mcp-config.json (tasks, projects, goals)
- SharePoint: C:\\Users\\jonat\\sharepoint-mcp-railway\\.mcp-config.json (documents, files)

IMPORTANT: These .mcp-config.json files contain a "mcpServers" wrapper. When calling bridge.execute_task():
1. Read the config file
2. Parse JSON and extract ONLY the "mcpServers" object
3. Write just that object to a temp file
4. Pass the temp file path to bridge.execute_task({ mcpConfigPath: tempPath, ... })

Example workflow for "deals from Company X":
1. Read C:\\Users\\jonat\\hubspot-mcp-railway\\.mcp-config.json
2. Extract: config.mcpServers (just the { "hubspot": { "type": "http", ... } } part)
3. Write to /tmp/hubspot-temp-\${Date.now()}.json
4. Call bridge.execute_task({ prompt: "Find deals for Company X", mcpConfigPath: tempPath })
5. Clean up temp file when done

For parallel queries, spawn multiple bridge.execute_task() calls simultaneously.`;

      // Debug logging
      if (this.config.debug) {
        console.error('[SessionManager] Executing with:');
        console.error('[SessionManager]   mcpConfigPath:', mergedConfigPath);
        console.error('[SessionManager]   appendSystemPrompt length:', orchestratorSystemPrompt.length);
        console.error('[SessionManager]   original prompt:', options.prompt);
      }

      // Execute the task with merged config and orchestrator system prompt
      const result = await executor.execute({
        ...options,
        mcpConfigPath: mergedConfigPath,
        appendSystemPrompt: orchestratorSystemPrompt,
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
    } finally {
      // Clean up merged config file
      if (mergedConfigPath) {
        try {
          await fs.unlink(mergedConfigPath);
        } catch (err) {
          // Ignore cleanup errors
        }
      }
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
}
