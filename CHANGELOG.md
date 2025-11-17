# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-11-17

### Added
- **Recursive bridge access**: Bridge now injects itself into subprocess MCP configs
  - Enables orchestrator pattern: Code subprocess can spawn further Code subprocesses
  - Maintains MCP-agnostic architecture while enabling multi-level delegation
  - New `getBridgeConfig()` method returns bridge's own MCP configuration
  - New `createMergedConfig()` method merges user config with bridge config

### Changed
- `SessionManager.createSession()` now creates merged config combining:
  - User-provided MCP configuration (from `mcpConfigPath`)
  - Bridge's own configuration (for recursive calls)
- Merged config is automatically cleaned up after session completes
- Subprocess now has access to bridge tools for further delegation

### Benefits
- **Zero-overhead orchestration**: Global Code session has no MCPs, orchestrator spawns subprocesses as needed
- **Parallel delegation**: Orchestrator can spawn multiple MCP subprocesses simultaneously
- **AI-based intent analysis**: Orchestrator determines which MCPs needed for each query
- **Recursive support**: Any depth of subprocess delegation now possible

### Migration
No breaking changes - existing code continues to work. Subprocesses now automatically get bridge access.

## [2.0.0] - 2025-11-16

### BREAKING CHANGES
- **Removed MCP-specific delegation tools** to restore pure ferry architecture
  - Removed: `delegate_hubspot_task`, `delegate_asana_task`, `delegate_sharepoint_task`, `delegate_batch_tasks`
  - Removed: MCP context configuration system (`src/config.ts`)
  - Removed: MCP config generator utility (`src/utils/mcp-config-generator.ts`)
  - Removed: `executeDelegatedTask()` and `executeBatch()` methods from SessionManager

### Architecture
- Reverted to **pure "ferry" architecture** where bridge has no knowledge of specific MCPs
- Bridge now expects caller to provide MCP configuration via `mcpConfigPath` parameter
- Maintains only 4 generic tools that work with any MCP configuration:
  - `execute_task`
  - `execute_with_tools`
  - `execute_with_permission_mode`
  - `get_session_info`

### Rationale
- Eliminates coupling between bridge and MCP implementations
- Prevents token overhead from growing with each new MCP added
- Aligns with original design vision of MCP-agnostic message conduit
- Simplifies codebase and reduces maintenance burden
- Scales to unlimited MCPs without code changes

### Migration Guide
If you were using delegation tools in v1.x:

**Before (v1.x):**
```typescript
delegate_asana_task({
  prompt: "Search for tasks assigned to Butch"
})
```

**After (v2.0):**
```typescript
// Caller creates and manages MCP config
const configPath = "/tmp/my-asana-config.json";
writeFileSync(configPath, JSON.stringify({
  mcpServers: {
    asana: {
      type: "sse",
      url: "https://asana-mcp-railway-production.up.railway.app"
    }
  }
}));

// Use generic execute_task with mcpConfigPath
execute_task({
  prompt: "Search for tasks assigned to Butch",
  mcpConfigPath: configPath
})
```

## [1.0.1] - 2025-10-30

### Fixed
- **CRITICAL**: Tools not showing up in Claude Desktop
  - Root cause: Using Zod's `.shape` property instead of converting to JSON Schema
  - Solution: Added `zod-to-json-schema` dependency and converted all Zod schemas using `zodToJsonSchema()`
  - Tools now properly appear in Claude Desktop's tool list

### Changed
- Updated .claude/context.md with critical Zod to JSON Schema gotcha
- Added comprehensive documentation of symptoms and fix

## [1.0.0] - 2025-10-30

### Added
- Initial release of Claude Code MCP Bridge
- MCP server with STDIO transport
- ClaudeCodeExecutor for spawning and managing Claude Code CLI processes
- SessionManager for lifecycle management
- Four MCP tools:
  - `execute_task`: Basic task execution
  - `execute_with_tools`: Execute with tool filtering
  - `execute_with_permission_mode`: Execute with permission controls
  - `get_session_info`: Query session information
- Streaming JSON parser for real-time progress updates
- Session cleanup with automatic timeout (30 min idle)
- CLI tool with commands: setup, start, validate, doctor, configure
- Interactive setup wizard
- Automatic Claude Desktop configuration
- Comprehensive validation and diagnostics
- TypeScript implementation with full type safety
- Event-driven architecture with EventEmitter
- Graceful shutdown handling (SIGINT/SIGTERM)
- Debug logging support
- Timeout handling with configurable limits
- Error retry logic with exponential backoff
- Comprehensive documentation (README, PROJECT.md, .claude/context.md)

### Features
- One-command setup for new users
- Auto-detection of Claude Code CLI path
- Auto-configuration of Claude Desktop
- Real-time streaming responses
- Fine-grained tool control
- Permission mode selection
- Session monitoring and management
- Resource cleanup and leak prevention

### Developer Experience
- TypeScript with strict mode
- Zod schema validation
- Commander CLI framework
- MCP SDK integration
- Comprehensive error messages
- Debug mode for troubleshooting
- Health check and validation tools

## [Unreleased]

### Planned Features
- NPM package publication
- HTTP/SSE transport for Railway deployment
- Web dashboard for monitoring
- Advanced session management (resume, fork)
- Cost tracking and analytics
- Automated testing suite
- GitHub Actions CI/CD
- Performance optimizations
- Enhanced error recovery
- Session persistence
