/**
 * Session Manager - Manages lifecycle of Claude Code execution sessions
 */

import { EventEmitter } from 'events';
import { ClaudeCodeExecutor } from './executor';
import { FileCoordinator } from './coordination/file-coordinator';
import { MCPSessionManager } from './mcp-session-manager';
import {
  SessionInfo,
  ClaudeCodeExecutionOptions,
  ClaudeCodeResult,
  MCPServerConfig,
} from './types';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';

export class SessionManager extends EventEmitter {
  private sessions: Map<string, SessionInfo> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private executors: Map<string, ClaudeCodeExecutor> = new Map();
  private fileCoordinator: FileCoordinator;
  private mcpSessionManager: MCPSessionManager;

  constructor(private config: MCPServerConfig) {
    super();
    this.fileCoordinator = new FileCoordinator(config.debug);
    this.mcpSessionManager = new MCPSessionManager(config.debug);

    // Initialize coordinator
    this.fileCoordinator.initialize().catch((error) => {
      console.error('[SessionManager] Failed to initialize file coordinator:', error);
    });

    // Clean up old tasks periodically
    setInterval(() => {
      this.fileCoordinator.cleanupOldTasks();
    }, 60 * 60 * 1000); // Every hour
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
    let userServers = {};

    console.error('[SessionManager] createMergedConfig called with mcpConfigPath:', mcpConfigPath);

    // Read user-provided config if available
    if (mcpConfigPath) {
      console.error('[SessionManager] Reading user config from:', mcpConfigPath);
      const userConfigContent = await fs.readFile(mcpConfigPath, 'utf-8');
      const userConfigObj = JSON.parse(userConfigContent);

      // Extract mcpServers if it exists, otherwise assume the whole object is servers
      userServers = userConfigObj.mcpServers || userConfigObj;
      console.error('[SessionManager] User servers:', Object.keys(userServers).join(', '));

      // Check for MCPs that need session-based auth (like Asana)
      await this.ensureMCPSessions(userServers);
    } else {
      console.error('[SessionManager] No user config provided, using bridge only');
    }

    const bridgeConfig = this.getBridgeConfig();
    console.error('[SessionManager] Bridge config servers:', Object.keys(bridgeConfig).join(', '));

    // Merge bridge with user servers (bridge first, so user config takes precedence)
    const mergedServers = {
      ...bridgeConfig,
      ...userServers
    };

    console.error('[SessionManager] Merged servers:', Object.keys(mergedServers).join(', '));

    // Wrap in mcpServers object as required by Claude Code CLI schema
    const wrappedConfig = {
      mcpServers: mergedServers
    };

    // Write merged config to temp file
    const tempDir = os.tmpdir();
    const tempConfigPath = path.join(tempDir, `mcp-config-with-bridge-${Date.now()}.json`);

    const configJson = JSON.stringify(wrappedConfig, null, 2);

    console.error('[SessionManager] Writing merged config to:', tempConfigPath);
    console.error('[SessionManager] Config servers being written:', Object.keys(wrappedConfig.mcpServers).join(', '));
    console.error('[SessionManager] Full config JSON:', configJson);

    await fs.writeFile(tempConfigPath, configJson);

    console.error('[SessionManager] Config file written successfully');

    // Normalize path to forward slashes for cross-platform compatibility
    // Claude Code CLI has issues with backslashes on Windows
    const normalizedPath = tempConfigPath.replace(/\\/g, '/');
    console.error('[SessionManager] Returning path:', normalizedPath);
    return normalizedPath;
  }

  /**
   * Create and execute a new session using FILE COORDINATION
   * This avoids recursive MCP calls by using shared file system
   */
  async createSessionWithFileCoordination(
    options: ClaudeCodeExecutionOptions
  ): Promise<{ sessionId: string; result: ClaudeCodeResult }> {
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

    if (this.config.debug) {
      console.error('[SessionManager] Using FILE COORDINATION (no recursive MCP)');
      console.error('[SessionManager] Session:', sessionId);
      console.error('[SessionManager] Prompt:', options.prompt);
      console.error('[SessionManager] MCP Config:', options.mcpConfigPath || 'none');
    }

    try {
      // If this is an Asana query, inject session_id into the prompt
      let finalPrompt = options.prompt;
      if (options.mcpConfigPath?.includes('asana')) {
        const asanaUrl = 'https://asana-mcp-railway-production.up.railway.app/sse';

        // Try to validate any saved session first
        const hasSavedSession = await this.mcpSessionManager.validateSavedSession(asanaUrl, 'default');

        if (hasSavedSession) {
          if (this.config.debug) {
            console.error(`[SessionManager] ✅ Reusing validated saved session`);
          }
        }

        // Get or create session (will reuse if validation succeeded)
        const asanaSessionId = await this.mcpSessionManager.getOrCreateSession(asanaUrl, 'default');

        if (this.config.debug) {
          console.error(`[SessionManager] 🔐 Asana session ID: ${asanaSessionId}`);
        }

        // Check if session is already authenticated (skip if we just validated from file)
        let isAuthenticated = hasSavedSession;

        if (!isAuthenticated) {
          isAuthenticated = await this.mcpSessionManager.checkAuthStatus(asanaUrl, 'default');
        }

        if (!isAuthenticated) {
          // Session needs authentication - get OAuth URL and open browser
          const oauthUrl = this.mcpSessionManager.getOAuthUrl(asanaUrl, 'default');
          if (oauthUrl) {
            console.error(`[SessionManager] ⚠️  Asana needs authentication!`);
            console.error(`[SessionManager] 🔐 OAuth URL: ${oauthUrl}`);
            console.error(`[SessionManager] 🌐 Opening browser automatically...`);

            // Auto-open browser
            this.openBrowser(oauthUrl);

            // Wait for authentication
            console.error(`[SessionManager] ⏳ Waiting for you to authorize in the browser...`);
            const authSuccess = await this.mcpSessionManager.waitForAuthentication(asanaUrl, 'default', 120000);

            if (authSuccess) {
              console.error(`[SessionManager] ✅ Authentication successful!`);
              isAuthenticated = true; // Mark as authenticated to skip future checks
            } else {
              console.error(`[SessionManager] ⏱️  Authentication timeout. Please retry your query after authorizing.`);
            }
          }
        } else {
          if (this.config.debug) {
            console.error(`[SessionManager] ✅ Session already authenticated - reusing existing session`);
          }
        }

        // Inject session_id into prompt
        finalPrompt = `IMPORTANT: When calling Asana MCP tools, ALWAYS include session_id parameter: '${asanaSessionId}'. Example: asana_search_tasks({session_id: '${asanaSessionId}', assignee: 'me', workspace: '1200071410465472'}). Now: ${options.prompt}`;

        if (this.config.debug) {
          console.error(`[SessionManager] 📝 Injected session_id into prompt`);
        }
      }

      // Use file coordinator to execute task
      const taskResult = await this.fileCoordinator.executeTask(
        finalPrompt,
        options.mcpConfigPath,
        {
          permissionMode: options.permissionMode as 'ask' | 'bypassPermissions' | 'allowAll' | undefined,
          dangerouslySkipPermissions: options.dangerouslySkipPermissions,
          timeout: options.timeout || this.config.defaultTimeout,
          claudeCodePath: this.config.claudeCodePath,
        }
      );

      // Convert task result to Claude Code result
      const result: ClaudeCodeResult = {
        type: 'result',
        subtype: taskResult.success ? 'success' : 'error',
        result: (taskResult.success ? taskResult.result : taskResult.error) || 'No result',
        session_id: sessionId,
        is_error: !taskResult.success,
        duration_ms: taskResult.executionTime,
        duration_api_ms: 0,
        num_turns: 0,
        total_cost_usd: 0,
        usage: {
          input_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
          output_tokens: 0,
          service_tier: 'standard',
        },
        modelUsage: {},
        permission_denials: [],
        uuid: sessionId,
      };

      // Update session
      session.result = result;
      session.status = 'completed';
      this.updateSessionActivity(sessionId);
      this.emit('session:completed', { sessionId, result });

      // Schedule cleanup
      this.scheduleSessionCleanup(sessionId);

      return { sessionId, result };
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
   * Create and execute a new session
   */
  async createSession(
    options: ClaudeCodeExecutionOptions
  ): Promise<{ sessionId: string; result: ClaudeCodeResult; executor?: ClaudeCodeExecutor }> {
    // AUTO-DETECT: Analyze prompt to determine if this is a domain-specific query
    // If detected, automatically use file coordination with the appropriate MCP config
    if (!options.mcpConfigPath) {
      const prompt = options.prompt.toLowerCase();

      // Check for Asana queries
      if (prompt.includes('asana') || prompt.includes('task') && prompt.includes('andrea')) {
        const asanaConfigPath = 'C:\\Users\\jonat\\asana-mcp-railway\\.mcp-config.json';
        if (this.config.debug) {
          console.error('[SessionManager] 🎯 Asana query detected - auto-routing to Asana MCP');
        }
        options.mcpConfigPath = asanaConfigPath;

        // Auto-enable bypass permissions for domain MCPs
        if (!options.permissionMode) {
          options.permissionMode = 'bypassPermissions';
        }
        if (options.dangerouslySkipPermissions === undefined) {
          options.dangerouslySkipPermissions = true;
        }
      }
      // Check for HubSpot queries
      else if (prompt.includes('hubspot') || prompt.includes('crm') || prompt.includes('contact')) {
        const hubspotConfigPath = 'C:\\Users\\jonat\\hubspot-mcp-railway\\.mcp-config.json';
        if (this.config.debug) {
          console.error('[SessionManager] 🎯 HubSpot query detected - auto-routing to HubSpot MCP');
        }
        options.mcpConfigPath = hubspotConfigPath;

        if (!options.permissionMode) {
          options.permissionMode = 'bypassPermissions';
        }
        if (options.dangerouslySkipPermissions === undefined) {
          options.dangerouslySkipPermissions = true;
        }
      }
      // Check for SharePoint queries
      else if (prompt.includes('sharepoint') || prompt.includes('document') || prompt.includes('file')) {
        const sharepointConfigPath = 'C:\\Users\\jonat\\sharepoint-mcp-railway\\.mcp-config.json';
        if (this.config.debug) {
          console.error('[SessionManager] 🎯 SharePoint query detected - auto-routing to SharePoint MCP');
        }
        options.mcpConfigPath = sharepointConfigPath;

        if (!options.permissionMode) {
          options.permissionMode = 'bypassPermissions';
        }
        if (options.dangerouslySkipPermissions === undefined) {
          options.dangerouslySkipPermissions = true;
        }
      }
    }

    // DECISION: If mcpConfigPath is provided (either manually or auto-detected), use file coordination
    // Otherwise use traditional executor (for backward compatibility)
    if (options.mcpConfigPath) {
      if (this.config.debug) {
        console.error('[SessionManager] MCP config provided - using file coordination');
      }
      return await this.createSessionWithFileCoordination(options);
    }

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

    // CRITICAL: If running in bypassPermissions mode, enable dangerouslySkipPermissions
    // This allows subprocesses to read MCP config files without permission prompts
    if (options.permissionMode === 'bypassPermissions' && !options.dangerouslySkipPermissions) {
      options.dangerouslySkipPermissions = true;
      if (this.config.debug) {
        console.error('[SessionManager] Auto-enabled dangerouslySkipPermissions for bypassPermissions mode');
      }
    }

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
      // Ensure Asana MCP session exists (create if needed)
      let asanaSessionId: string | null = null;
      try {
        const asanaUrl = 'https://asana-mcp-railway-production.up.railway.app/sse';
        asanaSessionId = await this.mcpSessionManager.getOrCreateSession(asanaUrl, 'default');

        if (this.config.debug) {
          console.error(`[SessionManager] Asana session created/retrieved: ${asanaSessionId}`);
        }

        // Check if needs authentication
        const oauthUrl = this.mcpSessionManager.getOAuthUrl(asanaUrl, 'default');
        if (oauthUrl) {
          console.error(`[SessionManager] ⚠️  Asana needs authentication!`);
          console.error(`[SessionManager] 🔐 OAuth URL: ${oauthUrl}`);
          console.error(`[SessionManager] 🌐 Opening browser automatically...`);

          // Auto-open browser for better UX
          this.openBrowser(oauthUrl);

          // Wait for authentication (2 minutes max)
          console.error(`[SessionManager] ⏳ Waiting for you to authorize in the browser...`);
          const authSuccess = await this.mcpSessionManager.waitForAuthentication(asanaUrl, 'default', 120000);

          if (authSuccess) {
            console.error(`[SessionManager] ✅ Authentication successful!`);
          } else {
            console.error(`[SessionManager] ⏱️  Authentication timeout. Please retry your query after authorizing.`);
          }
        }
      } catch (error: any) {
        console.error(`[SessionManager] Failed to create Asana session:`, error.message);
        // Continue without session ID
      }

      // Create orchestrator system prompt
      const orchestratorSystemPrompt = `You have access to the claude-code-bridge MCP which allows you to spawn Code subprocesses with specific MCP configurations.

Available MCP configs in project directories:
- HubSpot: C:\\Users\\jonat\\hubspot-mcp-railway\\.mcp-config.json (deals, contacts, companies)
- Asana: C:\\Users\\jonat\\asana-mcp-railway\\.mcp-config.json (tasks, projects, goals)${asanaSessionId ? ` [Session: ${asanaSessionId}]` : ''}
- SharePoint: C:\\Users\\jonat\\sharepoint-mcp-railway\\.mcp-config.json (documents, files)

CRITICAL REQUIREMENTS for spawning subprocesses:
1. MUST use spawn_code_subprocess_direct() - NOT execute_with_permission_mode() or execute_task()
2. MUST include permission_mode: "bypassPermissions" parameter
3. MUST include skip_all_permissions: true parameter (default, can omit)
4. MUST include mcp_config_path parameter pointing to the temp config file
5. This tool uses file coordination (not MCP recursion) to avoid stdio deadlock

Workflow for HubSpot queries (deals, contacts, companies):
1. Read C:\\Users\\jonat\\hubspot-mcp-railway\\.mcp-config.json
2. Parse JSON and extract ONLY the "hubspot" server from config.mcpServers
3. Write to temp file (e.g. C:\\Users\\jonat\\AppData\\Local\\Temp\\hubspot-temp-config.json)
   Content must be: {"mcpServers":{"hubspot":{...}}}
4. Call mcp__claude-code-bridge__spawn_code_subprocess_direct with these EXACT parameters:
   - prompt: (your HubSpot task description)
   - mcp_config_path: "C:\\Users\\jonat\\AppData\\Local\\Temp\\hubspot-temp-config.json"
   - permission_mode: "bypassPermissions"

   Example tool call JSON:
   {
     "name": "mcp__claude-code-bridge__spawn_code_subprocess_direct",
     "input": {
       "prompt": "Use HubSpot MCP to find deals",
       "mcp_config_path": "C:\\Users\\jonat\\AppData\\Local\\Temp\\hubspot-temp-config.json",
       "permission_mode": "bypassPermissions"
     }
   }
5. Clean up temp file

Workflow for Asana queries (tasks, projects, goals):
1. Read C:\\Users\\jonat\\asana-mcp-railway\\.mcp-config.json
2. Parse JSON and extract ONLY the "asana" server from config.mcpServers
3. Write to temp file (e.g. C:\\Users\\jonat\\AppData\\Local\\Temp\\asana-temp-config.json)
   Content must be: {"mcpServers":{"asana":{...}}}
4. Call mcp__claude-code-bridge__spawn_code_subprocess_direct with these EXACT parameters:
   - prompt: "IMPORTANT: When calling Asana MCP tools, ALWAYS include session_id parameter: '${asanaSessionId || 'MISSING_SESSION'}'. Example: asana_search_tasks({session_id: '${asanaSessionId || 'MISSING_SESSION'}', ...other_params}). Now: (your Asana task description)"
   - mcp_config_path: "C:\\Users\\jonat\\AppData\\Local\\Temp\\asana-temp-config.json"
   - permission_mode: "bypassPermissions"

   Example tool call JSON:
   {
     "name": "mcp__claude-code-bridge__spawn_code_subprocess_direct",
     "input": {
       "prompt": "IMPORTANT: When calling Asana MCP tools, ALWAYS include session_id parameter: '${asanaSessionId || 'MISSING_SESSION'}'. Example: asana_search_tasks({session_id: '${asanaSessionId || 'MISSING_SESSION'}', ...other_params}). Now: Use Asana MCP to find tasks",
       "mcp_config_path": "C:\\Users\\jonat\\AppData\\Local\\Temp\\asana-temp-config.json",
       "permission_mode": "bypassPermissions"
     }
   }
5. Clean up temp file

For parallel queries (e.g. HubSpot + Asana), spawn both calls simultaneously with their respective configs.

IMPORTANT: Use spawn_code_subprocess_direct() NOT execute_with_permission_mode() to avoid stdio deadlock! The new tool uses file coordination which is safe for recursive calls.`;

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
        // Pass through dangerouslySkipPermissions to subprocesses
        dangerouslySkipPermissions: options.dangerouslySkipPermissions,
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

  /**
   * Ensure MCP sessions exist for session-based MCPs (like Asana)
   * Creates sessions if they don't exist and returns OAuth URLs if needed
   */
  private async ensureMCPSessions(mcpServers: any): Promise<void> {
    const sessionPromises: Promise<void>[] = [];

    for (const [mcpName, mcpConfig] of Object.entries(mcpServers)) {
      if (!mcpConfig || typeof mcpConfig !== 'object') continue;

      const config = mcpConfig as any;
      const mcpUrl = config.url;

      // Check if this is an Asana MCP (contains "asana" in name or URL)
      const isAsana = mcpName.toLowerCase().includes('asana') ||
                     (mcpUrl && mcpUrl.toLowerCase().includes('asana'));

      if (isAsana && mcpUrl) {
        const promise = this.createMCPSession(mcpName, mcpUrl);
        sessionPromises.push(promise);
      }
    }

    // Wait for all session creations
    await Promise.all(sessionPromises);
  }

  /**
   * Create or get MCP session for a specific MCP server
   */
  private async createMCPSession(mcpName: string, mcpUrl: string): Promise<void> {
    try {
      const sessionId = await this.mcpSessionManager.getOrCreateSession(mcpUrl, 'default');

      if (this.config.debug) {
        console.error(`[SessionManager] MCP session for ${mcpName}: ${sessionId}`);
      }

      // Check if session needs authentication
      const oauthUrl = this.mcpSessionManager.getOAuthUrl(mcpUrl, 'default');
      if (oauthUrl) {
        console.error(`[SessionManager] ⚠️  ${mcpName} needs authentication!`);
        console.error(`[SessionManager] Visit: ${oauthUrl}`);
      }
    } catch (error: any) {
      console.error(`[SessionManager] Failed to create MCP session for ${mcpName}:`, error.message);
      // Don't throw - continue with other MCPs
    }
  }

  /**
   * Get session ID for an MCP server (if it uses session-based auth)
   */
  getMCPSessionId(mcpUrl: string): string | null {
    return this.mcpSessionManager.getExistingSessionId(mcpUrl, 'default');
  }

  /**
   * Get all unauthenticated MCP sessions
   */
  getUnauthenticatedMCPs(): Array<{ mcpUrl: string; oauthUrl: string }> {
    return this.mcpSessionManager.getUnauthenticatedSessions();
  }

  /**
   * Open URL in default browser
   * Cross-platform: Windows, macOS, Linux
   */
  private openBrowser(url: string): void {
    const platform = os.platform();
    let command: string;

    switch (platform) {
      case 'win32':
        command = `start "" "${url}"`;
        break;
      case 'darwin':
        command = `open "${url}"`;
        break;
      case 'linux':
        command = `xdg-open "${url}"`;
        break;
      default:
        console.error(`[SessionManager] Unsupported platform for auto-opening: ${platform}`);
        return;
    }

    exec(command, (error) => {
      if (error) {
        console.error(`[SessionManager] Failed to open browser:`, error.message);
      } else {
        if (this.config.debug) {
          console.error(`[SessionManager] Opened browser: ${url}`);
        }
      }
    });
  }
}
