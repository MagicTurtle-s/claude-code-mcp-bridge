import * as path from 'path';
import * as os from 'os';

/**
 * MCP Context Configuration
 *
 * Environment-based configuration for MCP server contexts.
 * Allows multi-user installation with sensible defaults.
 */

export interface MCPContextConfig {
  projectPath: string;
  mcpUrl: string;
  type: 'http' | 'sse';
}

export const MCP_CONTEXTS: Record<string, MCPContextConfig> = {
  hubspot: {
    projectPath: process.env.HUBSPOT_PROJECT_PATH ||
                 path.join(os.homedir(), 'hubspot-mcp-railway'),
    mcpUrl: process.env.HUBSPOT_MCP_URL ||
            'https://hubspot-mcp-railway-production-386b.up.railway.app/mcp',
    type: 'http'
  },
  sharepoint: {
    projectPath: process.env.SHAREPOINT_PROJECT_PATH ||
                 path.join(os.homedir(), 'sharepoint-mcp-railway'),
    mcpUrl: process.env.SHAREPOINT_MCP_URL ||
            'https://sharepoint-mcp-railway-production.up.railway.app/mcp',
    type: 'http'
  },
  asana: {
    projectPath: process.env.ASANA_PROJECT_PATH ||
                 path.join(os.homedir(), 'asana-mcp-railway'),
    mcpUrl: process.env.ASANA_MCP_URL ||
            'https://asana-mcp-railway-production.up.railway.app/sse',
    type: 'sse'
  }
};

/**
 * Get MCP context configuration by name
 */
export function getMCPContext(context: string): MCPContextConfig {
  const config = MCP_CONTEXTS[context];
  if (!config) {
    throw new Error(`Unknown MCP context: ${context}. Available contexts: ${Object.keys(MCP_CONTEXTS).join(', ')}`);
  }
  return config;
}

/**
 * Get all available MCP context names
 */
export function getAvailableContexts(): string[] {
  return Object.keys(MCP_CONTEXTS);
}
