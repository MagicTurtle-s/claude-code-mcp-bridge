# Claude Code MCP Bridge - Project Overview

**Status**: 🔄 Active Development
**Version**: 1.0.0
**GitHub**: https://github.com/MagicTurtle-s/claude-code-mcp-bridge
**NPM**: @magicturtle-s/claude-code-mcp (pending publication)

## Quick Reference

### Purpose
MCP server that enables an **orchestrator pattern** where Claude Code acts as a conductor, delegating tasks to specialized Code instances with different MCP contexts. Eliminates global MCP token overhead while enabling parallel execution across HubSpot, SharePoint, and Asana systems.

### Key Innovation
**Zero-overhead orchestration**: Global Code starts with 0 MCP tokens, delegates to specialized subprocesses only when needed, executes delegations in parallel for maximum efficiency.

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
│   ├── server.ts            # MCP server with delegation tools
│   ├── config.ts            # Environment-based configuration
│   ├── executor.ts          # Claude Code CLI wrapper with cwd support
│   ├── session-manager.ts   # Session lifecycle + parallel execution
│   ├── types.ts             # Type definitions
│   ├── tools/               # MCP tool implementations
│   │   ├── index.ts        # Original execution tools
│   │   └── delegation.ts   # Orchestrator delegation tools
│   └── utils/
│       └── mcp-config-generator.ts  # Dynamic MCP config generation
├── scripts/                 # Setup and config scripts
├── bin/                     # CLI tool
├── build/                   # Compiled output (gitignored)
├── install-orchestrator.sh  # Multi-user installation script
└── .claude/                 # Claude Code context
    └── context.md
```

## Key Files

### Core Architecture Files
- **src/config.ts**: Environment-based configuration (project paths, MCP URLs)
- **src/utils/mcp-config-generator.ts**: Dynamic MCP config generation at runtime
- **src/types.ts**: Extended with `workingDirectory` and `mcpConfigPath` parameters

### Server & Execution Layer
- **src/index.ts**: Server entry point, starts MCP server with STDIO transport
- **src/server.ts**: MCP protocol handler with 8 tools (4 execution + 4 delegation)
- **src/executor.ts**: Spawns Claude Code CLI with cwd and --mcp-config support
- **src/session-manager.ts**: Manages sessions + parallel execution (`executeBatch()`)

### MCP Tools
- **src/tools/index.ts**: Original execution tools (execute_task, execute_with_tools, etc.)
- **src/tools/delegation.ts**: Orchestrator tools (delegate_hubspot_task, delegate_sharepoint_task, delegate_asana_task, delegate_batch_tasks)

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

## Orchestrator Architecture

### How It Works

1. **Global Code Instance** (0 MCP tokens)
   - Runs with no MCPs loaded in global context
   - Analyzes user requests to determine required MCP contexts
   - Delegates tasks to specialized subprocesses

2. **Delegation Process**
   - Creates temporary MCP config file with required context
   - Spawns Code subprocess with:
     - `--mcp-config /tmp/mcp-config-xyz.json`
     - `cwd` set to project directory (e.g., `~/hubspot-mcp-railway`)
   - Subprocess loads MCPs and executes task
   - Returns results to orchestrator
   - Cleans up temp config file

3. **Parallel Execution**
   - Multiple delegations run simultaneously via `Promise.all()`
   - Each subprocess is independent
   - Results aggregated and returned together

### Delegation Tools

**delegate_hubspot_task**
- Context: HubSpot MCP (116 CRM tools)
- Working Directory: `~/hubspot-mcp-railway`
- Use: CRM operations (companies, contacts, deals, leads)

**delegate_sharepoint_task**
- Context: SharePoint MCP
- Working Directory: `~/sharepoint-mcp-railway`
- Use: Document management, folder operations

**delegate_asana_task**
- Context: Asana MCP
- Working Directory: `~/asana-mcp-railway`
- Use: Project management (tasks, projects, goals)

**delegate_batch_tasks**
- Context: Multiple MCPs in parallel
- Executes array of tasks simultaneously
- Returns combined results

## Configuration

### Environment Variables (.env file)

**Project Paths** (customize for your installation)
- `HUBSPOT_PROJECT_PATH`: Default `~/hubspot-mcp-railway`
- `SHAREPOINT_PROJECT_PATH`: Default `~/sharepoint-mcp-railway`
- `ASANA_PROJECT_PATH`: Default `~/asana-mcp-railway`

**MCP Server URLs** (override for custom deployments)
- `HUBSPOT_MCP_URL`: Default Railway production URL
- `SHAREPOINT_MCP_URL`: Default Railway production URL
- `ASANA_MCP_URL`: Default Railway production URL (SSE)

**System Configuration**
- `CLAUDE_CODE_PATH`: Path to Claude Code CLI (default: `claude`)
- `DEBUG`: Enable debug logging (default: `false`)

### Claude Desktop Config (Auto-generated)
```json
{
  "mcpServers": {
    "claude-code-orchestrator": {
      "command": "node",
      "args": ["/path/to/build/index.js"],
      "env": {
        "HUBSPOT_PROJECT_PATH": "/Users/you/hubspot-mcp-railway",
        "SHAREPOINT_PROJECT_PATH": "/Users/you/sharepoint-mcp-railway",
        "ASANA_PROJECT_PATH": "/Users/you/asana-mcp-railway",
        "HUBSPOT_MCP_URL": "https://hubspot-mcp-railway-production-386b.up.railway.app/mcp",
        "SHAREPOINT_MCP_URL": "https://sharepoint-mcp-railway-production.up.railway.app/mcp",
        "ASANA_MCP_URL": "https://asana-mcp-railway-production.up.railway.app/sse"
      }
    }
  }
}
```

## Related Projects

### Required MCP Server Projects
- **HubSpot MCP Railway**: https://github.com/MagicTurtle-s/hubspot-mcp-railway
  - 116 HubSpot CRM tools (companies, contacts, deals, leads, etc.)
  - TypeScript + MCP SDK
  - HTTP transport

- **SharePoint MCP Railway**: https://github.com/MagicTurtle-s/sharepoint-mcp-railway
  - SharePoint document management tools
  - Python + FastMCP
  - HTTP transport

- **Asana MCP Railway**: https://github.com/MagicTurtle-s/asana-mcp-railway
  - Asana project management tools
  - TypeScript + MCP SDK
  - SSE transport

### Claude Platform
- **Claude Code CLI**: https://docs.claude.com/claude-code
- **Model Context Protocol**: https://github.com/anthropics/mcp

## Development Notes

### Architecture Decisions
- **Orchestrator Pattern**: Eliminates global MCP overhead (151.8k tokens → 0 tokens)
- **Parallel Execution**: `Promise.all()` for simultaneous delegations
- **Environment-Based Config**: Multi-user installation support via .env
- **Dynamic MCP Configs**: Runtime generation of temp config files
- **Project Directory Context**: Each delegation runs in appropriate project directory
- **TypeScript**: Type safety, better DX, fewer runtime errors
- **Zod for validation**: Type-safe schema validation at runtime

### Performance Characteristics
- **Global Session Startup**: 0 MCP tokens (instant)
- **Single Delegation**: ~2-5s overhead (subprocess spawn + MCP load)
- **Parallel Delegations**: Same ~2-5s overhead (run simultaneously)
- **Token Savings**: 151.8k tokens freed in global context

### Future Enhancements
- Additional MCP contexts (Neo4j, SuperMetrics, etc.)
- Resume/fork delegated sessions
- Cost tracking across delegations
- Delegation result caching
- HTTP/SSE transport for remote delegation

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
