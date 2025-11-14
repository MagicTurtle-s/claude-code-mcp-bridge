/**
 * Delegation Tools - MCP tools for delegating tasks to specialized Code instances
 *
 * These tools allow the orchestrator Code instance (with 0 MCPs) to delegate
 * tasks to specialized Code instances with specific MCP contexts.
 */

import { z } from 'zod';
import { SessionManager } from '../session-manager';
import { ToolExecutionResult } from '../types';
import { getMCPContext, getAvailableContexts } from '../config';
import {
  generateMCPConfig,
  generateMultiMCPConfig,
  getProjectPath,
  validateContexts,
} from '../utils/mcp-config-generator';

/**
 * Tool: delegate_hubspot_task
 */
export const delegateHubSpotTaskTool = {
  name: 'delegate_hubspot_task',
  description:
    'Delegate a task to a specialized Code instance with HubSpot MCP context. ' +
    'Use this when the task requires HubSpot CRM operations (companies, contacts, deals, leads, etc.). ' +
    'The delegated Code instance will have access to all 116 HubSpot MCP tools and will execute in ' +
    'the HubSpot project directory context.',
  inputSchema: z.object({
    prompt: z.string().describe('The task prompt to execute with HubSpot context'),
    permissionMode: z
      .enum(['plan', 'acceptEdits', 'default', 'bypassPermissions'])
      .optional()
      .describe('Permission mode for the delegated execution (default: acceptEdits)'),
    timeout: z
      .number()
      .optional()
      .describe('Timeout in milliseconds (default: 300000 = 5 minutes)'),
  }),
};

export async function delegateHubSpotTask(
  sessionManager: SessionManager,
  params: z.infer<typeof delegateHubSpotTaskTool.inputSchema>
): Promise<ToolExecutionResult> {
  try {
    const mcpConfig = generateMCPConfig('hubspot');
    const workingDirectory = getProjectPath('hubspot');

    const result = await sessionManager.executeDelegatedTask(
      {
        prompt: params.prompt,
        permissionMode: params.permissionMode || 'acceptEdits',
        timeout: params.timeout || 300000,
        streamProgress: true,
      },
      mcpConfig,
      workingDirectory
    );

    return {
      content: [
        {
          type: 'text',
          text: formatDelegationResult('hubspot', result),
        },
      ],
      _meta: {
        sessionId: result.sessionId,
        context: 'hubspot',
        usage: result.result.usage,
        duration_ms: result.result.duration_ms,
      },
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error delegating HubSpot task: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Tool: delegate_sharepoint_task
 */
export const delegateSharePointTaskTool = {
  name: 'delegate_sharepoint_task',
  description:
    'Delegate a task to a specialized Code instance with SharePoint MCP context. ' +
    'Use this when the task requires SharePoint operations (document management, folder operations, ' +
    'site access, etc.). The delegated Code instance will have access to all SharePoint MCP tools ' +
    'and will execute in the SharePoint project directory context.',
  inputSchema: z.object({
    prompt: z.string().describe('The task prompt to execute with SharePoint context'),
    permissionMode: z
      .enum(['plan', 'acceptEdits', 'default', 'bypassPermissions'])
      .optional()
      .describe('Permission mode for the delegated execution (default: acceptEdits)'),
    timeout: z
      .number()
      .optional()
      .describe('Timeout in milliseconds (default: 300000 = 5 minutes)'),
  }),
};

export async function delegateSharePointTask(
  sessionManager: SessionManager,
  params: z.infer<typeof delegateSharePointTaskTool.inputSchema>
): Promise<ToolExecutionResult> {
  try {
    const mcpConfig = generateMCPConfig('sharepoint');
    const workingDirectory = getProjectPath('sharepoint');

    const result = await sessionManager.executeDelegatedTask(
      {
        prompt: params.prompt,
        permissionMode: params.permissionMode || 'acceptEdits',
        timeout: params.timeout || 300000,
        streamProgress: true,
      },
      mcpConfig,
      workingDirectory
    );

    return {
      content: [
        {
          type: 'text',
          text: formatDelegationResult('sharepoint', result),
        },
      ],
      _meta: {
        sessionId: result.sessionId,
        context: 'sharepoint',
        usage: result.result.usage,
        duration_ms: result.result.duration_ms,
      },
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error delegating SharePoint task: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Tool: delegate_asana_task
 */
export const delegateAsanaTaskTool = {
  name: 'delegate_asana_task',
  description:
    'Delegate a task to a specialized Code instance with Asana MCP context. ' +
    'Use this when the task requires Asana project management operations (tasks, projects, goals, ' +
    'portfolios, etc.). The delegated Code instance will have access to all Asana MCP tools and ' +
    'will execute in the Asana project directory context.',
  inputSchema: z.object({
    prompt: z.string().describe('The task prompt to execute with Asana context'),
    permissionMode: z
      .enum(['plan', 'acceptEdits', 'default', 'bypassPermissions'])
      .optional()
      .describe('Permission mode for the delegated execution (default: acceptEdits)'),
    timeout: z
      .number()
      .optional()
      .describe('Timeout in milliseconds (default: 300000 = 5 minutes)'),
  }),
};

export async function delegateAsanaTask(
  sessionManager: SessionManager,
  params: z.infer<typeof delegateAsanaTaskTool.inputSchema>
): Promise<ToolExecutionResult> {
  try {
    const mcpConfig = generateMCPConfig('asana');
    const workingDirectory = getProjectPath('asana');

    const result = await sessionManager.executeDelegatedTask(
      {
        prompt: params.prompt,
        permissionMode: params.permissionMode || 'acceptEdits',
        timeout: params.timeout || 300000,
        streamProgress: true,
      },
      mcpConfig,
      workingDirectory
    );

    return {
      content: [
        {
          type: 'text',
          text: formatDelegationResult('asana', result),
        },
      ],
      _meta: {
        sessionId: result.sessionId,
        context: 'asana',
        usage: result.result.usage,
        duration_ms: result.result.duration_ms,
      },
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error delegating Asana task: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Tool: delegate_batch_tasks
 */
export const delegateBatchTasksTool = {
  name: 'delegate_batch_tasks',
  description:
    'Execute multiple delegated tasks in parallel across different MCP contexts. ' +
    'Use this when you need to perform operations across multiple systems simultaneously. ' +
    'All tasks run in parallel using Promise.all() for maximum efficiency. ' +
    'Each task can specify its own context (hubspot, sharepoint, asana) and prompt.',
  inputSchema: z.object({
    tasks: z
      .array(
        z.object({
          context: z
            .enum(['hubspot', 'sharepoint', 'asana'])
            .describe('The MCP context to use for this task'),
          prompt: z.string().describe('The task prompt to execute'),
          permissionMode: z
            .enum(['plan', 'acceptEdits', 'default', 'bypassPermissions'])
            .optional()
            .describe('Permission mode (default: acceptEdits)'),
        })
      )
      .describe('Array of tasks to execute in parallel'),
    timeout: z
      .number()
      .optional()
      .describe('Timeout in milliseconds for each task (default: 300000 = 5 minutes)'),
  }),
};

export async function delegateBatchTasks(
  sessionManager: SessionManager,
  params: z.infer<typeof delegateBatchTasksTool.inputSchema>
): Promise<ToolExecutionResult> {
  try {
    // Validate all contexts
    const contexts = params.tasks.map((t) => t.context);
    validateContexts(contexts);

    // Build task array for parallel execution
    const tasks = params.tasks.map((task) => {
      const mcpConfig = generateMCPConfig(task.context);
      const workingDirectory = getProjectPath(task.context);

      return {
        options: {
          prompt: task.prompt,
          permissionMode: task.permissionMode || 'acceptEdits',
          timeout: params.timeout || 300000,
          streamProgress: true,
        },
        mcpConfig,
        workingDirectory,
      };
    });

    // Execute in parallel
    const results = await sessionManager.executeBatch(tasks);

    // Format combined results
    const combinedText = results
      .map((result, index) => {
        const context = params.tasks[index].context;
        return formatDelegationResult(context, result);
      })
      .join('\n\n---\n\n');

    // Calculate aggregate metrics
    const totalDuration = Math.max(...results.map((r) => r.result.duration_ms));
    const totalCost = results.reduce((sum, r) => sum + r.result.total_cost_usd, 0);
    const totalTokens = results.reduce(
      (sum, r) =>
        sum + r.result.usage.input_tokens + r.result.usage.output_tokens,
      0
    );

    return {
      content: [
        {
          type: 'text',
          text: combinedText,
        },
      ],
      _meta: {
        batchSize: results.length,
        sessionIds: results.map((r) => r.sessionId),
        contexts: contexts,
        totalDuration_ms: totalDuration,
        totalCost_usd: totalCost,
        totalTokens,
      },
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing batch tasks: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Format delegation result for display
 */
function formatDelegationResult(
  context: string,
  result: { sessionId: string; result: any }
): string {
  const { sessionId, result: claudeResult } = result;

  const lines = [
    `# Delegated ${context.toUpperCase()} Task Result`,
    ``,
    `**Session ID:** ${sessionId}`,
    `**Status:** ${claudeResult.is_error ? 'ERROR' : 'SUCCESS'}`,
    `**Duration:** ${claudeResult.duration_ms}ms (API: ${claudeResult.duration_api_ms}ms)`,
    `**Turns:** ${claudeResult.num_turns}`,
    `**Cost:** $${claudeResult.total_cost_usd.toFixed(6)}`,
    ``,
    `**Token Usage:**`,
    `- Input: ${claudeResult.usage.input_tokens.toLocaleString()}`,
    `- Output: ${claudeResult.usage.output_tokens.toLocaleString()}`,
    `- Cache Read: ${claudeResult.usage.cache_read_input_tokens.toLocaleString()}`,
    `- Cache Creation: ${claudeResult.usage.cache_creation_input_tokens.toLocaleString()}`,
    ``,
    `## Result`,
    ``,
    claudeResult.result,
  ];

  return lines.join('\n');
}
