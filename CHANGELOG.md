# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
