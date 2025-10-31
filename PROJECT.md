# Claude Code MCP Bridge - Project Overview

**Status**: 🔄 Active Development
**Version**: 1.0.0
**GitHub**: https://github.com/MagicTurtle-s/claude-code-mcp-bridge
**NPM**: @magicturtle-s/claude-code-mcp (pending publication)

## Quick Reference

### Purpose
MCP server that bridges Claude Desktop to Claude Code CLI, enabling delegation to Claude Code subagents (Explore, Plan, etc.) for complex coding tasks.

### Key Innovation
One-command setup: `npx @magicturtle-s/claude-code-mcp` → Fully configured in 60 seconds

## Tech Stack

- **Language**: TypeScript 5.3+
- **Runtime**: Node.js 18+
- **Protocol**: Model Context Protocol (MCP) via STDIO
- **Dependencies**:
  - `@modelcontextprotocol/sdk` - MCP server framework
  - `commander` - CLI tool framework
  - `zod` - Schema validation
- **Build**: TypeScript compiler (tsc)

## Project Structure

```
claude-code-mcp-bridge/
├── src/                      # TypeScript source
│   ├── index.ts             # Entry point
│   ├── server.ts            # MCP server
│   ├── executor.ts          # Claude Code CLI wrapper
│   ├── session-manager.ts   # Session lifecycle
│   ├── types.ts             # Type definitions
│   └── tools/               # MCP tool implementations
├── scripts/                 # Setup and config scripts
│   ├── setup.js            # Setup wizard
│   ├── configure-claude.js # Claude Desktop config
│   └── validate.js         # Setup validation
├── bin/                     # CLI tool
│   └── cli.js
├── build/                   # Compiled output (gitignored)
└── .claude/                 # Claude Code context
    └── context.md
```

## Key Files

### Source Files
- **src/index.ts**: Server entry point, starts MCP server with STDIO transport
- **src/server.ts**: MCP protocol handler, tool routing
- **src/executor.ts**: Spawns Claude Code CLI, parses streaming JSON
- **src/session-manager.ts**: Manages concurrent executions, cleanup
- **src/tools/index.ts**: 4 MCP tools (execute_task, execute_with_tools, etc.)

### Scripts
- **scripts/setup.js**: Interactive setup wizard (validates, builds, configures)
- **scripts/configure-claude.js**: Auto-adds MCP server to Claude Desktop config
- **scripts/validate.js**: Comprehensive setup validation

### CLI
- **bin/cli.js**: Command-line interface (setup, start, validate, doctor, configure)

## External Services & Credentials

### Claude Code CLI
- **Path**: `claude` (in PATH) or custom via `CLAUDE_CODE_PATH`
- **Version**: Latest (uses `--output-format stream-json`)
- **Authentication**: Inherits from Claude Code CLI session

### Claude Desktop
- **Config Path**: `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
- **Integration**: Auto-configured via `configure-claude.js`
- **Restart Required**: After initial setup

## Setup Instructions

### Quick Setup
```bash
npm install
npm run build
claude-code-mcp setup
```

### Manual Setup
```bash
npm install
npm run build
claude-code-mcp configure  # Configure Claude Desktop
claude-code-mcp validate   # Verify setup
```

### For New Users (Future NPM Package)
```bash
npx @magicturtle-s/claude-code-mcp
```

## Common Tasks

### Development
```bash
npm run build          # Build TypeScript
npm run dev            # Watch mode
```

### Testing
```bash
claude-code-mcp doctor     # Run diagnostics
claude-code-mcp validate   # Validate setup
claude-code-mcp start --debug  # Test with logging
```

### Deployment
```bash
npm run build          # Build for production
npm publish            # Publish to NPM (maintainer only)
```

## Configuration

### Environment Variables
- `CLAUDE_CODE_PATH`: Path to Claude Code CLI (default: `claude`)
- `DEBUG`: Enable debug logging (default: `false`)
- `CI`: Skip interactive setup in CI environments

### Claude Desktop Config
```json
{
  "mcpServers": {
    "claude-code-bridge": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "DEBUG": "false",
        "CLAUDE_CODE_PATH": "claude"
      }
    }
  }
}
```

## Related Projects

- **Claude Code CLI**: https://docs.claude.com/claude-code
- **Model Context Protocol**: https://github.com/anthropics/mcp
- **Other MCP Servers**:
  - SharePoint MCP Railway (Python + FastMCP)
  - HubSpot MCP Railway (TypeScript + MCP SDK)
  - Neo4j MCP Railway v2 (Python + FastMCP)

## Development Notes

### Architecture Decisions
- **TypeScript over JavaScript**: Type safety, better DX, fewer runtime errors
- **STDIO over HTTP**: Simpler for local Claude Desktop connection
- **Commander for CLI**: Industry standard, well-documented
- **Zod for validation**: Type-safe schema validation at runtime

### Future Enhancements
- HTTP/SSE transport for Railway deployment
- Web dashboard for monitoring
- Advanced session management (resume, fork)
- Cost tracking and analytics
- Automated testing suite

## Troubleshooting

### Common Issues
1. **Build errors**: Ensure TypeScript 5.3+ installed
2. **Claude Code not found**: Add to PATH or set `CLAUDE_CODE_PATH`
3. **MCP server not loading**: Run `claude-code-mcp doctor`
4. **Timeout errors**: Increase timeout in tool parameters

### Debug Mode
```bash
claude-code-mcp start --debug
# or
DEBUG=true node build/index.js
```

## Maintenance

### Regular Updates
- Keep dependencies updated: `npm update`
- Check Claude Code CLI compatibility
- Monitor MCP SDK updates

### Version Management
- Follow semantic versioning
- Update CHANGELOG.md for releases
- Tag releases in GitHub

---

**Last Updated**: 2025-10-30
**Maintainer**: MagicTurtle-s
**Status**: Ready for testing and NPM publication
