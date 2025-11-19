/**
 * MCP Session Manager
 *
 * Manages sessions with external MCP servers that require session-based authentication.
 * Currently supports Asana MCP's session-based OAuth flow.
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface MCPSessionInfo {
  sessionId: string;
  mcpUrl: string;
  desktopInstanceId: string;
  createdAt: number;
  authenticated: boolean;
  oauthUrl?: string;
  lastValidated?: number;
}

interface SessionFileData {
  version: string;
  sessions: {
    [mcpUrl: string]: {
      [desktopInstanceId: string]: MCPSessionInfo;
    };
  };
}

export class MCPSessionManager {
  private sessions: Map<string, Map<string, MCPSessionInfo>> = new Map();
  private sessionFilePath: string;
  private readonly SESSION_FILE_VERSION = '1.0.0';

  constructor(private debug: boolean = false) {
    // Session file location: %APPDATA%/Claude/.claude-mcp-sessions.json
    const appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const claudeDir = path.join(appDataDir, 'Claude');
    this.sessionFilePath = path.join(claudeDir, '.claude-mcp-sessions.json');

    // Ensure directory exists
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    // Load sessions from file on startup
    this.loadSessionsFromFile();
  }

  /**
   * Get or create a session for an MCP server
   *
   * @param mcpUrl - Base URL of the MCP server (e.g., https://asana-mcp.railway.app)
   * @param desktopInstanceId - Unique ID for the Desktop instance (default: 'default')
   * @returns Session ID to use when calling MCP tools
   */
  async getOrCreateSession(mcpUrl: string, desktopInstanceId: string = 'default'): Promise<string> {
    // Check if we already have a session for this MCP + Desktop combo
    if (!this.sessions.has(mcpUrl)) {
      this.sessions.set(mcpUrl, new Map());
    }

    const mcpSessions = this.sessions.get(mcpUrl)!;

    if (mcpSessions.has(desktopInstanceId)) {
      const existing = mcpSessions.get(desktopInstanceId)!;
      if (this.debug) {
        console.error(`[MCPSessionManager] Reusing existing session for ${mcpUrl}: ${existing.sessionId}`);
      }
      return existing.sessionId;
    }

    // Create new session via MCP's /session/create endpoint
    if (this.debug) {
      console.error(`[MCPSessionManager] Creating new session for ${mcpUrl}, desktop: ${desktopInstanceId}`);
    }

    try {
      const baseUrl = this.getBaseUrl(mcpUrl);
      const response = await axios.post(`${baseUrl}/session/create`, {
        desktop_instance_id: desktopInstanceId
      }, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.data.status === 'success') {
        const sessionId = response.data.session_id;
        const oauthUrl = response.data.oauth_url;

        const sessionInfo: MCPSessionInfo = {
          sessionId,
          mcpUrl,
          desktopInstanceId,
          createdAt: Date.now(),
          authenticated: false,
          oauthUrl: `${baseUrl}${oauthUrl}`
        };

        mcpSessions.set(desktopInstanceId, sessionInfo);

        // Save to file
        this.saveSessionsToFile();

        if (this.debug) {
          console.error(`[MCPSessionManager] Created session ${sessionId}`);
          console.error(`[MCPSessionManager] OAuth URL: ${sessionInfo.oauthUrl}`);
        }

        return sessionId;
      } else {
        throw new Error(`Failed to create session: ${JSON.stringify(response.data)}`);
      }
    } catch (error: any) {
      if (this.debug) {
        console.error(`[MCPSessionManager] Error creating session:`, error.message);
      }
      throw new Error(`Failed to create MCP session for ${mcpUrl}: ${error.message}`);
    }
  }

  /**
   * Get OAuth URL for a session
   * Returns the URL the user should visit to authenticate
   */
  getOAuthUrl(mcpUrl: string, desktopInstanceId: string = 'default'): string | null {
    const mcpSessions = this.sessions.get(mcpUrl);
    if (!mcpSessions) return null;

    const session = mcpSessions.get(desktopInstanceId);
    return session?.oauthUrl || null;
  }

  /**
   * Mark a session as authenticated
   */
  markAuthenticated(mcpUrl: string, desktopInstanceId: string = 'default'): void {
    const mcpSessions = this.sessions.get(mcpUrl);
    if (mcpSessions) {
      const session = mcpSessions.get(desktopInstanceId);
      if (session) {
        session.authenticated = true;
        session.lastValidated = Date.now();

        // Save to file
        this.saveSessionsToFile();
      }
    }
  }

  /**
   * Get all unauthenticated sessions with their OAuth URLs
   * Useful for showing user what they need to authenticate
   */
  getUnauthenticatedSessions(): Array<{ mcpUrl: string; oauthUrl: string; desktopInstanceId: string }> {
    const result: Array<{ mcpUrl: string; oauthUrl: string; desktopInstanceId: string }> = [];

    for (const [mcpUrl, mcpSessions] of this.sessions.entries()) {
      for (const [desktopInstanceId, session] of mcpSessions.entries()) {
        if (!session.authenticated && session.oauthUrl) {
          result.push({
            mcpUrl,
            oauthUrl: session.oauthUrl,
            desktopInstanceId
          });
        }
      }
    }

    return result;
  }

  /**
   * Extract base URL from MCP URL (remove /sse or /mcp path)
   */
  private getBaseUrl(mcpUrl: string): string {
    // Remove /sse, /mcp, or other endpoint paths to get base URL
    return mcpUrl.replace(/\/(sse|mcp|messages).*$/, '');
  }

  /**
   * Get existing session ID if available
   */
  getExistingSessionId(mcpUrl: string, desktopInstanceId: string = 'default'): string | null {
    const mcpSessions = this.sessions.get(mcpUrl);
    if (!mcpSessions) return null;

    const session = mcpSessions.get(desktopInstanceId);
    return session?.sessionId || null;
  }

  /**
   * Check if MCP server supports sessions (has /session/create endpoint)
   *
   * @param mcpUrl - MCP server URL
   * @returns true if server supports sessions
   */
  async supportsSessionAuth(mcpUrl: string): Promise<boolean> {
    try {
      const baseUrl = this.getBaseUrl(mcpUrl);
      // Try to access /session/create endpoint
      await axios.options(`${baseUrl}/session/create`, { timeout: 5000 });
      return true;
    } catch (error) {
      // If endpoint doesn't exist or server doesn't support it, return false
      return false;
    }
  }

  /**
   * Check authentication status of a session
   *
   * @param mcpUrl - MCP server URL
   * @param desktopInstanceId - Desktop instance ID
   * @returns true if authenticated, false otherwise
   */
  async checkAuthStatus(mcpUrl: string, desktopInstanceId: string = 'default'): Promise<boolean> {
    const mcpSessions = this.sessions.get(mcpUrl);
    if (!mcpSessions) return false;

    const session = mcpSessions.get(desktopInstanceId);
    if (!session) return false;

    // If we already marked this session as authenticated locally, trust it
    // This avoids unnecessary server calls on every query
    if (session.authenticated) {
      if (this.debug) {
        console.error(`[MCPSessionManager] Session ${session.sessionId} already authenticated (cached)`);
      }
      return true;
    }

    // Otherwise, check with server
    try {
      const baseUrl = this.getBaseUrl(mcpUrl);
      const response = await axios.get(`${baseUrl}/oauth/status`, {
        params: { session: session.sessionId },
        timeout: 5000
      });

      const isAuthenticated = response.data.authenticated === true;

      if (isAuthenticated && !session.authenticated) {
        // Session just became authenticated
        this.markAuthenticated(mcpUrl, desktopInstanceId);

        if (this.debug) {
          console.error(`[MCPSessionManager] Session ${session.sessionId} is now authenticated!`);
        }
      }

      return isAuthenticated;
    } catch (error) {
      if (this.debug) {
        console.error(`[MCPSessionManager] Failed to check auth status:`, (error as any).message);
      }
      return false;
    }
  }

  /**
   * Poll for authentication completion
   * Checks status every 2 seconds for up to 2 minutes
   *
   * @param mcpUrl - MCP server URL
   * @param desktopInstanceId - Desktop instance ID
   * @returns Promise that resolves when authenticated or times out
   */
  async waitForAuthentication(
    mcpUrl: string,
    desktopInstanceId: string = 'default',
    timeoutMs: number = 120000
  ): Promise<boolean> {
    const startTime = Date.now();
    const pollInterval = 2000; // Poll every 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      const isAuthenticated = await this.checkAuthStatus(mcpUrl, desktopInstanceId);

      if (isAuthenticated) {
        if (this.debug) {
          console.error(`[MCPSessionManager] Authentication completed in ${Date.now() - startTime}ms`);
        }
        return true;
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    if (this.debug) {
      console.error(`[MCPSessionManager] Authentication timeout after ${timeoutMs}ms`);
    }
    return false;
  }

  /**
   * Load sessions from persistent file storage
   */
  private loadSessionsFromFile(): void {
    try {
      if (!fs.existsSync(this.sessionFilePath)) {
        if (this.debug) {
          console.error(`[MCPSessionManager] No session file found at ${this.sessionFilePath}`);
        }
        return;
      }

      const fileContent = fs.readFileSync(this.sessionFilePath, 'utf-8');
      const data: SessionFileData = JSON.parse(fileContent);

      // Validate version
      if (data.version !== this.SESSION_FILE_VERSION) {
        if (this.debug) {
          console.error(`[MCPSessionManager] Session file version mismatch. Expected ${this.SESSION_FILE_VERSION}, got ${data.version}`);
        }
        return;
      }

      // Load sessions into memory
      for (const [mcpUrl, mcpSessions] of Object.entries(data.sessions)) {
        const sessionMap = new Map<string, MCPSessionInfo>();
        for (const [desktopId, sessionInfo] of Object.entries(mcpSessions)) {
          sessionMap.set(desktopId, sessionInfo);
        }
        this.sessions.set(mcpUrl, sessionMap);
      }

      if (this.debug) {
        const totalSessions = Object.values(data.sessions).reduce(
          (sum, mcpSessions) => sum + Object.keys(mcpSessions).length,
          0
        );
        console.error(`[MCPSessionManager] Loaded ${totalSessions} session(s) from file`);
      }
    } catch (error: any) {
      if (this.debug) {
        console.error(`[MCPSessionManager] Failed to load sessions from file:`, error.message);
      }
      // Don't throw - gracefully continue with empty sessions
    }
  }

  /**
   * Save sessions to persistent file storage
   */
  private saveSessionsToFile(): void {
    try {
      const data: SessionFileData = {
        version: this.SESSION_FILE_VERSION,
        sessions: {}
      };

      // Convert Map to plain object for JSON serialization
      for (const [mcpUrl, mcpSessions] of this.sessions.entries()) {
        data.sessions[mcpUrl] = {};
        for (const [desktopId, sessionInfo] of mcpSessions.entries()) {
          data.sessions[mcpUrl][desktopId] = sessionInfo;
        }
      }

      // Write to temporary file first (atomic write pattern)
      const tempPath = `${this.sessionFilePath}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), { mode: 0o600 });

      // Rename to final path (atomic on POSIX, near-atomic on Windows)
      fs.renameSync(tempPath, this.sessionFilePath);

      if (this.debug) {
        const totalSessions = Object.values(data.sessions).reduce(
          (sum, mcpSessions) => sum + Object.keys(mcpSessions).length,
          0
        );
        console.error(`[MCPSessionManager] Saved ${totalSessions} session(s) to file`);
      }
    } catch (error: any) {
      if (this.debug) {
        console.error(`[MCPSessionManager] Failed to save sessions to file:`, error.message);
      }
      // Don't throw - session will be recreated on next request
    }
  }

  /**
   * Validate a saved session with the MCP server
   * Returns true if session is still valid, false otherwise
   */
  async validateSavedSession(mcpUrl: string, desktopInstanceId: string = 'default'): Promise<boolean> {
    const mcpSessions = this.sessions.get(mcpUrl);
    if (!mcpSessions) return false;

    const session = mcpSessions.get(desktopInstanceId);
    if (!session) return false;

    try {
      const baseUrl = this.getBaseUrl(mcpUrl);
      const response = await axios.post(`${baseUrl}/session/validate`, {
        session_id: session.sessionId
      }, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const isValid = response.data.valid === true;

      if (isValid) {
        // Mark as authenticated and update last validated timestamp
        session.authenticated = true;
        session.lastValidated = Date.now();
        this.saveSessionsToFile();

        if (this.debug) {
          console.error(`[MCPSessionManager] Validated saved session ${session.sessionId}`);
        }
      } else {
        // Session is invalid - remove it
        if (this.debug) {
          console.error(`[MCPSessionManager] Saved session ${session.sessionId} is no longer valid: ${response.data.error || 'unknown reason'}`);
        }
        mcpSessions.delete(desktopInstanceId);
        this.saveSessionsToFile();
      }

      return isValid;
    } catch (error: any) {
      if (this.debug) {
        console.error(`[MCPSessionManager] Failed to validate saved session:`, error.message);
      }
      // Remove invalid session
      mcpSessions.delete(desktopInstanceId);
      this.saveSessionsToFile();
      return false;
    }
  }
}
