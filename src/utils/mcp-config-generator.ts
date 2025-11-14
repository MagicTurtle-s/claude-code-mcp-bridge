import { MCP_CONTEXTS, MCPContextConfig } from '../config';

/**
 * MCP Configuration Generator
 *
 * Dynamically generates MCP server configuration objects at runtime.
 * These configs are written to temporary files and used with the --mcp-config flag.
 */

export interface MCPServerConfig {
  type: 'http' | 'sse';
  url: string;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

/**
 * Generate MCP configuration for a single context
 *
 * @param context - The MCP context name (hubspot, sharepoint, or asana)
 * @returns MCP configuration object ready for JSON serialization
 *
 * @example
 * const config = generateMCPConfig('hubspot');
 * // Returns: { mcpServers: { hubspot: { type: 'http', url: '...' } } }
 */
export function generateMCPConfig(context: 'hubspot' | 'sharepoint' | 'asana'): MCPConfig {
  const config = MCP_CONTEXTS[context];
  if (!config) {
    throw new Error(`Unknown MCP context: ${context}. Available contexts: ${Object.keys(MCP_CONTEXTS).join(', ')}`);
  }

  return {
    mcpServers: {
      [context]: {
        type: config.type,
        url: config.mcpUrl
      }
    }
  };
}

/**
 * Generate MCP configuration for multiple contexts
 *
 * Used for batch delegations that need access to multiple MCP servers.
 *
 * @param contexts - Array of MCP context names
 * @returns MCP configuration object with all requested contexts
 *
 * @example
 * const config = generateMultiMCPConfig(['hubspot', 'sharepoint']);
 * // Returns: {
 * //   mcpServers: {
 * //     hubspot: { type: 'http', url: '...' },
 * //     sharepoint: { type: 'http', url: '...' }
 * //   }
 * // }
 */
export function generateMultiMCPConfig(contexts: string[]): MCPConfig {
  const mcpServers: Record<string, MCPServerConfig> = {};

  contexts.forEach(ctx => {
    const config = MCP_CONTEXTS[ctx];
    if (!config) {
      throw new Error(`Unknown MCP context: ${ctx}. Available contexts: ${Object.keys(MCP_CONTEXTS).join(', ')}`);
    }

    mcpServers[ctx] = {
      type: config.type,
      url: config.mcpUrl
    };
  });

  return { mcpServers };
}

/**
 * Get the project path for a given context
 *
 * Used to set the working directory when spawning delegated Code processes.
 *
 * @param context - The MCP context name
 * @returns Absolute path to the project directory
 *
 * @example
 * const projectPath = getProjectPath('hubspot');
 * // Returns: 'C:\\Users\\jonat\\hubspot-mcp-railway' (or env override)
 */
export function getProjectPath(context: string): string {
  const config = MCP_CONTEXTS[context];
  if (!config) {
    throw new Error(`Unknown MCP context: ${context}. Available contexts: ${Object.keys(MCP_CONTEXTS).join(', ')}`);
  }

  return config.projectPath;
}

/**
 * Validate that all required contexts exist
 *
 * @param contexts - Array of context names to validate
 * @throws Error if any context is unknown
 */
export function validateContexts(contexts: string[]): void {
  const availableContexts = Object.keys(MCP_CONTEXTS);
  const invalidContexts = contexts.filter(ctx => !availableContexts.includes(ctx));

  if (invalidContexts.length > 0) {
    throw new Error(
      `Unknown MCP contexts: ${invalidContexts.join(', ')}. ` +
      `Available contexts: ${availableContexts.join(', ')}`
    );
  }
}
