/**
 * MCP Server Implementation
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { SessionManager } from './session-manager';
import { MCPServerConfig } from './types';
import {
  executeTaskTool,
  executeTask,
  executeWithToolsTool,
  executeWithTools,
  executeWithPermissionTool,
  executeWithPermission,
  getSessionInfoTool,
  getSessionInfo,
} from './tools';
import { readFileSync } from 'fs';
import { join } from 'path';

// Read version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '../package.json'), 'utf-8')
);
const VERSION = packageJson.version;

export class ClaudeCodeMCPServer {
  private server: Server;
  private sessionManager: SessionManager;
  private config: MCPServerConfig;

  constructor(config: Partial<MCPServerConfig> = {}) {
    // Merge with defaults
    this.config = {
      claudeCodePath: config.claudeCodePath || 'claude',
      defaultTimeout: config.defaultTimeout || 120000,
      maxConcurrentExecutions: config.maxConcurrentExecutions || 5,
      sessionIdleTimeout: config.sessionIdleTimeout || 30 * 60 * 1000, // 30 minutes
      debug: config.debug || false,
    };

    // Initialize session manager
    this.sessionManager = new SessionManager(this.config);

    // Initialize MCP server
    this.server = new Server(
      {
        name: 'claude-code-mcp-bridge',
        version: VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    this.setupSessionManagerEvents();
  }

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: executeTaskTool.name,
            description: executeTaskTool.description,
            inputSchema: zodToJsonSchema(executeTaskTool.inputSchema),
          },
          {
            name: executeWithToolsTool.name,
            description: executeWithToolsTool.description,
            inputSchema: zodToJsonSchema(executeWithToolsTool.inputSchema),
          },
          {
            name: executeWithPermissionTool.name,
            description: executeWithPermissionTool.description,
            inputSchema: zodToJsonSchema(executeWithPermissionTool.inputSchema),
          },
          {
            name: getSessionInfoTool.name,
            description: getSessionInfoTool.description,
            inputSchema: zodToJsonSchema(getSessionInfoTool.inputSchema),
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (this.config.debug) {
        console.error(`[MCP Server] Tool call: ${name}`);
        console.error(`[MCP Server] Full arguments:`, JSON.stringify(args, null, 2));

        // Highlight critical parameters for debugging orchestration
        if (args && typeof args === 'object') {
          if ('mcp_config_path' in args) {
            console.error(`[MCP Server] ⚠️  mcp_config_path: ${args.mcp_config_path}`);
          }
          if ('permission_mode' in args) {
            console.error(`[MCP Server] ⚠️  permission_mode: ${args.permission_mode}`);
          }
          if ('skip_all_permissions' in args) {
            console.error(`[MCP Server] ⚠️  skip_all_permissions: ${args.skip_all_permissions}`);
          }
        }
      }

      try {
        switch (name) {
          case 'execute_task': {
            const params = executeTaskTool.inputSchema.parse(args);
            return await executeTask(this.sessionManager, params);
          }

          case 'execute_with_tools': {
            const params = executeWithToolsTool.inputSchema.parse(args);
            return await executeWithTools(this.sessionManager, params);
          }

          case 'execute_with_permission_mode': {
            const params = executeWithPermissionTool.inputSchema.parse(args);
            return await executeWithPermission(this.sessionManager, params);
          }

          case 'get_session_info': {
            const params = getSessionInfoTool.inputSchema.parse(args);
            return await getSessionInfo(this.sessionManager, params);
          }

          default:
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: `Unknown tool: ${name}`,
                  }),
                },
              ],
              isError: true,
            };
        }
      } catch (error) {
        if (this.config.debug) {
          console.error(`[MCP Server] Error executing tool ${name}:`, error);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
              }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Set up session manager event logging
   */
  private setupSessionManagerEvents(): void {
    if (!this.config.debug) return;

    this.sessionManager.on('session:created', (sessionId) => {
      console.error(`[SessionManager] Session created: ${sessionId}`);
    });

    this.sessionManager.on('session:started', (sessionId) => {
      console.error(`[SessionManager] Session started: ${sessionId}`);
    });

    this.sessionManager.on('session:completed', ({ sessionId }) => {
      console.error(`[SessionManager] Session completed: ${sessionId}`);
    });

    this.sessionManager.on('session:failed', ({ sessionId, error }) => {
      console.error(`[SessionManager] Session failed: ${sessionId}`, error);
    });

    this.sessionManager.on('session:cleaned', (sessionId) => {
      console.error(`[SessionManager] Session cleaned: ${sessionId}`);
    });
  }

  /**
   * Start the MCP server with STDIO transport
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    if (this.config.debug) {
      console.error('[MCP Server] Claude Code MCP Bridge started');
      console.error(`[MCP Server] Claude Code path: ${this.config.claudeCodePath}`);
      console.error(`[MCP Server] Default timeout: ${this.config.defaultTimeout}ms`);
    }

    // Handle graceful shutdown
    process.on('SIGINT', () => this.shutdown());
    process.on('SIGTERM', () => this.shutdown());
  }

  /**
   * Graceful shutdown
   */
  private async shutdown(): Promise<void> {
    if (this.config.debug) {
      console.error('[MCP Server] Shutting down...');
    }

    // Clean up all sessions
    this.sessionManager.cleanupAll();

    // Close server
    await this.server.close();

    if (this.config.debug) {
      console.error('[MCP Server] Shutdown complete');
    }

    process.exit(0);
  }

  /**
   * Get session manager (for testing/debugging)
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }
}
