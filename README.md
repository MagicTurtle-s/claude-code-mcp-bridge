# Claude Code MCP Bridge

**A pure message ferry between Claude Desktop and Claude Code CLI - MCP-agnostic and zero-overhead.**

This MCP (Model Context Protocol) server creates a transparent bridge that allows Claude Desktop to delegate tasks to Claude Code CLI with any MCP configuration, without the bridge needing to know about specific MCPs.

## Architecture: Pure Ferry Pattern

The bridge is a **simple message conduit** with zero knowledge of MCPs:

```
Claude Desktop/Code (Caller)
    ↓ Provides MCP config path
Bridge (Pure Ferry)
    ↓ Passes config transparently
Claude Code Subprocess
    ↓ Loads ANY MCP from config
Results flow back
```

**Key Principle:** The bridge never knows which MCPs exist. It simply:
1. Accepts execution requests with optional MCP config paths
2. Spawns Claude Code with that config
3. Returns results
4. Stays MCP-agnostic forever

## Features

- **Zero MCP Knowledge**: Bridge has no hardcoded MCP contexts
- **Unlimited Scalability**: Works with any MCP - present or future
- **Minimal Token Overhead**: Only 4 tools, regardless of MCP count
- **Simple Architecture**: Pure message passing, no orchestration logic
- **Full Claude Code Access**: All subagents, tools, and capabilities
- **Streaming Responses**: Real-time progress updates
- **Session Management**: Track and monitor active sessions
- **Session Persistence**: OAuth sessions persist across Desktop restarts
- **Auto-Authentication**: Seamless OAuth flow with browser auto-open
- **Rate Limit Protection**: Intelligent authentication caching prevents rate limits

## Quick Start

### Prerequisites

- **Node.js 18+**
- **Claude Code CLI** installed and in PATH
- **Claude Desktop** installed

### Installation

```bash
# Clone and setup
git clone https://github.com/MagicTurtle-s/claude-code-mcp-bridge.git
cd claude-code-mcp-bridge
npm install
npm run build
```

### Configure Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "claude-code-bridge": {
      "command": "node",
      "args": ["/path/to/claude-code-mcp-bridge/build/index.js"],
      "env": {
        "DEBUG": "false",
        "CLAUDE_CODE_PATH": "claude"
      }
    }
  }
}
```

### Verify Setup

Restart Claude Desktop. The bridge should start automatically and expose 4 tools.

## Available Tools

The bridge provides 4 generic, MCP-agnostic tools:

### 1. `execute_task`
Execute any task with Claude Code, optionally with MCP context.

**Parameters:**
- `prompt` (required): The task to execute
- `mcpConfigPath` (optional): Path to MCP configuration file (caller provides)
- `timeout` (optional): Timeout in milliseconds (default: 120000)
- `permissionMode` (optional): `plan` | `acceptEdits` | `default` | `bypassPermissions`
- `streamProgress` (optional): Enable streaming updates (default: true)

**Example:**
```typescript
execute_task({
  prompt: "Search codebase for authentication patterns",
  mcpConfigPath: "/tmp/my-mcp-config.json" // Optional
})
```

### 2. `execute_with_tools`
Execute with specific tool filtering.

**Parameters:**
- `prompt` (required): The task to execute
- `allowedTools` (optional): Array of allowed tool patterns
- `disallowedTools` (optional): Array of disallowed tool patterns
- `mcpConfigPath` (optional): Path to MCP config
- `timeout` (optional): Timeout in milliseconds

**Example:**
```typescript
execute_with_tools({
  prompt: "Analyze code structure",
  allowedTools: ["Read", "Grep", "Glob"],
  disallowedTools: ["Write", "Edit"]
})
```

### 3. `execute_with_permission_mode`
Execute with specific permission mode.

**Parameters:**
- `prompt` (required): The task to execute
- `permissionMode` (required): `plan` | `acceptEdits` | `default` | `bypassPermissions`
- `mcpConfigPath` (optional): Path to MCP config
- `timeout` (optional): Timeout in milliseconds

**Example:**
```typescript
execute_with_permission_mode({
  prompt: "Analyze what changes are needed",
  permissionMode: "plan"
})
```

### 4. `get_session_info`
Get information about a Claude Code session.

**Parameters:**
- `sessionId` (required): The session ID to query

## Using with MCPs

The bridge doesn't know about MCPs - **the caller manages MCP configurations**.

### Example: Using with Asana MCP

**Step 1: Create MCP config file**
```javascript
// Caller creates this file
const fs = require('fs');
const configPath = '/tmp/my-asana-config.json';

fs.writeFileSync(configPath, JSON.stringify({
  mcpServers: {
    asana: {
      type: "sse",
      url: "https://asana-mcp-railway-production.up.railway.app"
    }
  }
}));
```

**Step 2: Call bridge with config path**
```typescript
execute_task({
  prompt: "Search Asana for tasks assigned to Butch",
  mcpConfigPath: configPath
})
```

**Step 3: Bridge spawns Code with that config**
```bash
# Bridge runs this internally:
claude --mcp-config /tmp/my-asana-config.json --print "Search Asana for tasks..."
```

**Result:** Code loads Asana MCP and executes the task. Bridge never knew what "Asana" was.

### Benefits of This Approach

✅ **Add new MCPs without code changes** - Just create different config files
✅ **Zero token overhead growth** - Bridge always has 4 tools
✅ **Full flexibility** - Mix and match any MCPs in your configs
✅ **True separation of concerns** - Bridge ferries messages, caller manages MCPs

## Migration from v1.x

v2.0.0 removed MCP-specific delegation tools to restore the pure ferry architecture.

### What Changed

**Removed:**
- `delegate_hubspot_task`
- `delegate_asana_task`
- `delegate_sharepoint_task`
- `delegate_batch_tasks`

**Reason:** These tools created coupling between bridge and MCPs, defeating the token-saving purpose.

### How to Migrate

**Before (v1.x):**
```typescript
delegate_asana_task({
  prompt: "Search for tasks"
})
```

**After (v2.0):**
```typescript
// You manage the MCP config
const configPath = "/tmp/asana-config.json";
fs.writeFileSync(configPath, JSON.stringify({
  mcpServers: { asana: { type: "sse", url: "..." } }
}));

// Use generic tool
execute_task({
  prompt: "Search for tasks",
  mcpConfigPath: configPath
})
```

## Architecture Details

### Why "Ferry" Instead of "Orchestrator"?

**Ferry Pattern (v2.0):**
- Bridge has no MCP knowledge
- Caller provides configs
- Scales infinitely
- Simple codebase

**Orchestrator Pattern (v1.x - removed):**
- Bridge had hardcoded MCP contexts
- Generated configs internally
- Required code changes for new MCPs
- Violated single responsibility

### Data Flow

```
1. Caller creates MCP config file (if needed)
2. Caller calls execute_task with mcpConfigPath
3. Bridge receives request
4. Bridge spawns: claude --mcp-config <path> --print "<prompt>"
5. Code subprocess loads MCPs from config
6. Code executes task with MCP tools
7. Results stream back through bridge
8. Bridge returns results to caller
9. Bridge never inspected the config
```

### Code Structure

**Minimal, focused codebase:**
```
src/
├── index.ts              # Entry point
├── server.ts             # MCP server (4 tools)
├── executor.ts           # Code subprocess spawner
├── session-manager.ts    # Session lifecycle
├── types.ts              # Type definitions
└── tools/
    └── index.ts          # 4 generic tools
```

**No MCP-specific code anywhere!**

## Development

### Build
```bash
npm run build
```

### Development Mode
```bash
npm run dev  # Watch mode
```

### Testing
```bash
# Test basic execution
node test-executor.js

# Test with MCP config
# (Create a test config first, then run)
```

## Troubleshooting

### Bridge Not Starting
- Check Claude Desktop logs: `%APPDATA%\Claude\logs\`
- Verify Node.js version: `node --version` (needs 18+)
- Check Claude Code path: `claude --version`

### No Output from Tasks
- Ensure `--verbose` flag is used in executor (built-in since v1.0.1)
- Check executor closes stdin (built-in since v1.0.1)
- Enable debug mode: Set `DEBUG: "true"` in config

### MCP Config Not Loading
- Verify config file exists at the path you provided
- Check JSON syntax in config file
- Ensure MCP URLs are accessible
- Remember: Bridge doesn't validate configs - Code does

### Railway MCP Connection Issues
- See comprehensive guide: [docs/RAILWAY-SSE-DEBUGGING.md](./docs/RAILWAY-SSE-DEBUGGING.md)
- Quick check: `curl https://your-mcp.railway.app/health`
- **Known Issue**: Claude Code v2.0.45 has SSE transport bugs - use stdio for production

## MCP Transport Compatibility

The bridge supports all MCP transport types, but Claude Code CLI has varying compatibility:

| Transport | Claude Code v2.0.45 | Production Ready | Recommended For |
|-----------|---------------------|------------------|-----------------|
| **stdio** | ✅ Works perfectly  | ✅ Yes           | ✅ **Client deployments** |
| **SSE**   | ❌ Broken (3 bugs)  | ❌ No            | ⚠️ Wait for Claude Code fix |
| **HTTP**  | ❓ Untested         | ❓ Unknown       | ❓ TBD |

### Transport Recommendations

**For Production Client Deployments:**
```json
{
  "mcpServers": {
    "hubspot": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/path/to/hubspot-mcp/dist/index.js"],
      "env": {
        "HUBSPOT_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

**Avoid SSE Until Fixed (Claude Code v2.0.45 bugs):**
- Missing `Accept: text/event-stream` headers
- GET vs POST confusion for handshakes
- SSE stream parsing failures

See [PRODUCTION-MIGRATION.md](./PRODUCTION-MIGRATION.md) for detailed transport compatibility information.

## Use Cases

### 1. Desktop Delegates to Code
Claude Desktop uses the bridge to leverage Code's powerful subagents.

### 2. Code Delegates to Code with MCPs
Global Code instance (with bridge) delegates to subprocess with specific MCP context.

### 3. Automated Workflows
Scripts call bridge tools programmatically with various MCP configs.

## Technical Details

### Session Management
- **Session Persistence**: MCP OAuth sessions saved to `%APPDATA%\Claude\.claude-mcp-sessions.json`
- **Smart Validation**: Saved sessions validated on startup, reused if still valid
- **Auto-Cleanup**: Invalid sessions automatically purged
- **Rate Limit Protection**: Local authentication caching prevents repeated OAuth prompts
- **Graceful Shutdown**: Clean shutdown on SIGINT/SIGTERM
- **Event-Driven**: Lifecycle hooks for monitoring
- **Security**: Per-user file isolation with restrictive permissions

### Streaming
- Real-time progress updates via streaming JSON
- Parses Claude Code's `--output-format stream-json`
- Non-blocking, async I/O

### Error Handling
- Timeout protection (configurable)
- Process cleanup on errors
- Detailed error messages with context

## Contributing

Contributions welcome! The architecture is intentionally simple:

**Core Principle:** The bridge must NEVER know about specific MCPs.

If a PR adds MCP-specific code, it will be rejected. The caller should manage MCP configurations.

## License

MIT

## Links

- **GitHub**: https://github.com/MagicTurtle-s/claude-code-mcp-bridge
- **NPM**: @magicturtle/claude-orchestrator (GitHub Packages)
- **Claude Code Docs**: https://docs.claude.com/claude-code
- **MCP Specification**: https://github.com/anthropics/mcp

## Version

Current: **2.0.0** (Pure Ferry Architecture)

See [CHANGELOG.md](./CHANGELOG.md) for version history.
