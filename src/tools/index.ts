/**
 * MCP Tools - Tool definitions and implementations
 */

import { z } from 'zod';
import { SessionManager } from '../session-manager';
import { ToolExecutionResult } from '../types';

/**
 * Tool: execute_task
 * Basic Claude Code task execution
 */
export const executeTaskTool = {
  name: 'execute_task',
  description: 'Execute a task using Claude Code CLI with full subagent capabilities. Claude Code will analyze the task and use appropriate subagents (Explore, Plan, etc.) to complete it.',
  inputSchema: z.object({
    prompt: z.string().describe('The task for Claude Code to execute'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 120000)'),
    stream_progress: z.boolean().optional().describe('Stream progress updates in real-time (default: true)'),
    verbose: z.boolean().optional().describe('Include detailed diagnostic information in the response (default: false)'),
  }),
};

export async function executeTask(
  sessionManager: SessionManager,
  params: z.infer<typeof executeTaskTool.inputSchema>
): Promise<ToolExecutionResult> {
  try {
    const { sessionId, result } = await sessionManager.createSession({
      prompt: params.prompt,
      timeout: params.timeout || 120000,
      streamProgress: params.stream_progress !== false,
      // Always use dangerouslySkipPermissions for execute_task
      // This allows orchestrator to read config files without prompts
      dangerouslySkipPermissions: true,
    });

    const response: any = {
      success: true,
      sessionId,
      result: result.result,
      cost: result.total_cost_usd,
      duration: result.duration_ms,
      usage: result.usage,
    };

    // Note: verbose diagnostics feature removed in favor of simpler implementation

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Tool: execute_with_tools
 * Execute with specific tool allow/deny lists
 */
export const executeWithToolsTool = {
  name: 'execute_with_tools',
  description: 'Execute a Claude Code task with fine-grained control over which tools Claude Code can use. Useful for security and safety.',
  inputSchema: z.object({
    prompt: z.string().describe('The task for Claude Code to execute'),
    allowed_tools: z.array(z.string()).optional().describe('List of allowed tool patterns (e.g., ["Bash(git:*)", "Edit", "Read"])'),
    disallowed_tools: z.array(z.string()).optional().describe('List of disallowed tool patterns (e.g., ["Bash(rm:*)", "Write"])'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 120000)'),
  }),
};

export async function executeWithTools(
  sessionManager: SessionManager,
  params: z.infer<typeof executeWithToolsTool.inputSchema>
): Promise<ToolExecutionResult> {
  try {
    const { sessionId, result } = await sessionManager.createSession({
      prompt: params.prompt,
      allowedTools: params.allowed_tools,
      disallowedTools: params.disallowed_tools,
      timeout: params.timeout || 120000,
      streamProgress: true,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            sessionId,
            result: result.result,
            cost: result.total_cost_usd,
            duration: result.duration_ms,
            toolsUsed: params.allowed_tools || 'all',
            toolsBlocked: params.disallowed_tools || 'none',
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Tool: execute_with_permission_mode
 * Execute with specific permission mode (plan, acceptEdits, default, bypassPermissions)
 */
export const executeWithPermissionTool = {
  name: 'execute_with_permission_mode',
  description: 'Execute a Claude Code task with a specific permission mode and optional MCP configuration. Use "plan" for safe analysis without execution, "acceptEdits" to auto-accept file changes, "bypassPermissions" to allow MCP tool usage, or "default" for normal behavior. Set skip_all_permissions to true to bypass ALL permissions including file reads. Provide mcpConfigPath to use specific MCP servers.',
  inputSchema: z.object({
    prompt: z.string().describe('The task for Claude Code to execute'),
    permission_mode: z.enum(['plan', 'acceptEdits', 'default', 'bypassPermissions']).describe('Permission mode: "plan" = analyze only, "acceptEdits" = auto-accept changes, "bypassPermissions" = allow MCP tools, "default" = normal'),
    mcp_config_path: z.string().optional().describe('Path to MCP configuration file with specific MCP servers to use'),
    skip_all_permissions: z.boolean().optional().describe('Dangerously skip ALL permissions including file reads (default: false)'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default: 120000)'),
  }),
};

export async function executeWithPermission(
  sessionManager: SessionManager,
  params: z.infer<typeof executeWithPermissionTool.inputSchema>
): Promise<ToolExecutionResult> {
  try {
    const { sessionId, result } = await sessionManager.createSession({
      prompt: params.prompt,
      permissionMode: params.permission_mode,
      mcpConfigPath: params.mcp_config_path,
      dangerouslySkipPermissions: params.skip_all_permissions,
      timeout: params.timeout || 120000,
      streamProgress: true,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            sessionId,
            result: result.result,
            cost: result.total_cost_usd,
            duration: result.duration_ms,
            permissionMode: params.permission_mode,
            permissionDenials: result.permission_denials,
          }, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Tool: get_session_info
 * Get information about Claude Code sessions
 */
export const getSessionInfoTool = {
  name: 'get_session_info',
  description: 'Get information about active or completed Claude Code sessions, including status, duration, and resource usage.',
  inputSchema: z.object({
    session_id: z.string().optional().describe('Specific session ID to query (omit to get all sessions)'),
  }),
};

export async function getSessionInfo(
  sessionManager: SessionManager,
  params: z.infer<typeof getSessionInfoTool.inputSchema>
): Promise<ToolExecutionResult> {
  try {
    if (params.session_id) {
      const session = sessionManager.getSession(params.session_id);
      if (!session) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: `Session ${params.session_id} not found`,
              }, null, 2),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              session,
            }, null, 2),
          },
        ],
      };
    } else {
      const sessions = sessionManager.getAllSessions();
      const counts = sessionManager.getSessionCount();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              counts,
              sessions: sessions.map((s) => ({
                id: s.id,
                status: s.status,
                createdAt: new Date(s.createdAt).toISOString(),
                duration: Date.now() - s.createdAt,
                prompt: s.prompt?.substring(0, 100) + (s.prompt && s.prompt.length > 100 ? '...' : ''),
              })),
            }, null, 2),
          },
        ],
      };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
}
