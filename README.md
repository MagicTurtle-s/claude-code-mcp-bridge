# Claude Orchestrator

**Zero-overhead orchestration pattern for Claude Code with on-demand MCP delegation.**

This package enables Claude Code to act as an orchestrator, delegating tasks to specialized Code instances with specific MCP contexts (HubSpot, SharePoint, Asana) only when needed. Eliminates global MCP token overhead (151.8k tokens → 0 tokens) while enabling parallel execution.

## Features

### Orchestrator Pattern
- **Zero Token Overhead**: Global Code sessions start with 0 MCP tokens loaded
- **On-Demand Delegation**: Load MCPs only when tasks require them
- **Parallel Execution**: Run multiple delegations simultaneously via `Promise.all()`
- **Working Directory Context**: Each delegation runs in the appropriate project directory

### MCP Bridge Capabilities
- **Desktop → Code Delegation**: Claude Desktop can spawn Code CLI sessions
- **Streaming Responses**: Real-time progress updates during execution
- **Tool Control**: Fine-grained control over which tools are allowed
- **Permission Modes**: Choose plan-only, auto-accept edits, or default behavior
- **Session Management**: Track and monitor active sessions

### Supported MCP Contexts
- **HubSpot**: 116 CRM tools (companies, contacts, deals, leads)
- **SharePoint**: Document management and folder operations
- **Asana**: Project management (tasks, projects, goals, portfolios)

## Installation

### Via NPM (Recommended)

```bash
npm install @magicturtle/claude-orchestrator
```

### Configure GitHub Packages Authentication

Since this is published to GitHub Packages, you need to authenticate:

1. Create a Personal Access Token (PAT) with `read:packages` scope at https://github.com/settings/tokens

2. Add to your `~/.npmrc`:
```
@magicturtle:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=YOUR_GITHUB_PAT
```

## Quick Start (60 Seconds)

### One-Command Installation

The installer will automatically:
- ✅ Check/install Claude Desktop
- ✅ Check/install Claude Code CLI
- ✅ Install the MCP bridge
- ✅ Configure Claude Desktop

**Mac/Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/MagicTurtle-s/claude-code-mcp-bridge/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/MagicTurtle-s/claude-code-mcp-bridge/main/install.ps1 | iex
```

**That's it!** Just restart Claude Desktop and start using it.

---

### Alternative: Manual Installation

If you prefer manual control or are installing on air-gapped systems:

#### Prerequisites
- **Node.js 18+** - [Download](https://nodejs.org/)
- **Claude Desktop** - [Download](https://claude.com/download)
- **Claude Code CLI** - Install with: `npm install -g @anthropic-ai/claude-code`

#### Steps

```bash
# Clone the repository
git clone https://github.com/MagicTurtle-s/claude-code-mcp-bridge.git
cd claude-code-mcp-bridge

# Install and setup (automatically builds and configures)
npm install

# Verify setup
npx claude-code-mcp validate
```

**Note:** `npm install` automatically runs the setup wizard via the `postinstall` script. If already configured, it will skip setup.

### Verification

```bash
# Validate your setup
npx claude-code-mcp validate

# Run diagnostics
npx claude-code-mcp doctor

# Reconfigure if needed
npx claude-code-mcp configure
```

## Usage

Once configured, the MCP server starts automatically with Claude Desktop. No manual server management needed!

### Available Tools in Claude Desktop

The MCP bridge exposes 4 powerful tools to Claude Desktop:

#### 1. `execute_task` - Basic Task Execution
Execute any Claude Code task with full subagent capabilities.

**Example prompts for Claude Desktop:**
- "Use Claude Code to search my codebase for authentication patterns"
- "Have Claude Code analyze the performance of my React components"
- "Ask Claude Code to explain how the database schema works"

**Parameters:**
- `prompt` (required): The task for Claude Code to execute
- `timeout` (optional): Timeout in milliseconds (default: 120000)
- `stream_progress` (optional): Stream progress updates (default: true)

#### 2. `execute_with_tools` - Controlled Tool Access
Execute with fine-grained control over which tools Claude Code can use.

**Example prompts:**
- "Use Claude Code to search files, but don't allow any file modifications"
- "Have Claude Code analyze code using only Read and Grep tools"

**Parameters:**
- `prompt` (required): The task to execute
- `allowed_tools` (optional): List of allowed tool patterns (e.g., `["Bash(git:*)", "Read", "Grep"]`)
- `disallowed_tools` (optional): List of disallowed tool patterns (e.g., `["Write", "Edit"]`)
- `timeout` (optional): Timeout in milliseconds

#### 3. `execute_with_permission_mode` - Safety Controls
Execute with specific permission mode for safety.

**Example prompts:**
- "Use Claude Code in plan mode to analyze what changes are needed"
- "Have Claude Code fix the bug with auto-accept for edits"

**Parameters:**
- `prompt` (required): The task to execute
- `permission_mode` (required): One of:
  - `plan`: Analyze only, no execution
  - `acceptEdits`: Auto-accept all file changes
  - `default`: Normal interactive behavior
- `timeout` (optional): Timeout in milliseconds

#### 4. `get_session_info` - Session Monitoring
Get information about active or completed Claude Code sessions.

**Example prompts:**
- "Show me all active Claude Code sessions"
- "Get details about session sess_12345"

**Parameters:**
- `session_id` (optional): Specific session ID to query

## Architecture

```
┌────────────────────────────────────────┐
│     Claude Desktop (MCP Client)        │
│  - User asks questions                 │
│  - Receives tool suggestions           │
│  - Displays results                    │
└────────────────┬───────────────────────┘
                 │ STDIO (MCP Protocol)
                 ▼
┌────────────────────────────────────────┐
│  Claude Code MCP Bridge (This Server)  │
│  - Receives tool calls from Desktop    │
│  - Spawns Claude Code CLI processes    │
│  - Streams output back to Desktop      │
│  - Manages session lifecycle           │
└────────────────┬───────────────────────┘
                 │ Process Spawning
                 ▼
┌────────────────────────────────────────┐
│    Claude Code CLI (with Subagents)    │
│  - Executes tasks using subagents      │
│  - Explore: Search and understand code │
│  - Plan: Plan implementation steps     │
│  - Returns structured JSON results     │
└────────────────────────────────────────┘
```

## Configuration

### Manual Configuration

The setup wizard automatically configures Claude Desktop, but you can also do it manually:

1. Open Claude Desktop config: `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
2. Add the MCP server:

```json
{
  "mcpServers": {
    "claude-code-bridge": {
      "command": "node",
      "args": ["C:\\Users\\YourUser\\claude-code-mcp-bridge\\build\\index.js"],
      "env": {
        "DEBUG": "false",
        "CLAUDE_CODE_PATH": "claude"
      }
    }
  }
}
```

3. Restart Claude Desktop

### Environment Variables

- `CLAUDE_CODE_PATH`: Path to Claude Code CLI executable (default: `claude`)
- `DEBUG`: Enable debug logging (default: `false`)

## CLI Commands

```bash
# Setup and configuration
claude-code-mcp setup          # Run setup wizard
claude-code-mcp configure      # Configure Claude Desktop integration
claude-code-mcp validate       # Validate setup
claude-code-mcp doctor         # Run diagnostics

# Server management
claude-code-mcp start          # Start MCP server manually
claude-code-mcp start --debug  # Start with debug logging
```

## Development

### Project Structure

```
claude-code-mcp-bridge/
├── src/
│   ├── index.ts              # Server entry point
│   ├── server.ts             # MCP server implementation
│   ├── executor.ts           # Claude Code CLI executor
│   ├── session-manager.ts    # Session lifecycle management
│   ├── types.ts              # TypeScript interfaces
│   └── tools/                # MCP tool implementations
│       └── index.ts
├── scripts/
│   ├── setup.js              # Setup wizard
│   ├── configure-claude.js   # Claude Desktop config automation
│   └── validate.js           # Setup validation
├── bin/
│   └── cli.js                # CLI tool
└── build/                    # Compiled JavaScript (generated)
```

### Building from Source

```bash
git clone https://github.com/MagicTurtle-s/claude-code-mcp-bridge.git
cd claude-code-mcp-bridge
npm install
npm run build
```

### Running Tests

```bash
npm test  # Coming soon
```

## Troubleshooting

### Installation Issues

**One-liner install fails:**
1. Ensure you have permission to install global npm packages
2. Try manual installation instead
3. Check your internet connection
4. For Windows, ensure PowerShell execution policy allows scripts

**Claude Desktop not detected:**
- The installer will prompt you to download it manually
- Visit [claude.com/download](https://claude.com/download)
- Re-run the installer after installing Claude Desktop

### MCP server not showing in Claude Desktop

1. Run `npx claude-code-mcp doctor` to diagnose
2. Verify Claude Desktop config: `npx claude-code-mcp validate`
3. Check Claude Desktop logs for errors
4. Restart Claude Desktop
5. Try reconfiguring: `npx claude-code-mcp configure`

### Claude Code CLI not found

1. Verify Claude Code is installed: `claude --version`
2. Install manually: `npm install -g @anthropic-ai/claude-code`
3. Authenticate: `claude --print 'test'`
4. Add Claude Code to your PATH
5. Set `CLAUDE_CODE_PATH` environment variable in config

### Timeout errors

1. Increase timeout in tool parameters
2. Check if Claude Code is responding: `claude --print "test"`
3. Review debug logs: `claude-code-mcp start --debug`

### Permission denied errors

1. On Linux/Mac, make scripts executable: `chmod +x bin/cli.js scripts/*.js`
2. Verify file permissions in build directory

## Use Cases

### Code Analysis
"Use Claude Code to search my entire codebase for SQL injection vulnerabilities"

### Architecture Understanding
"Have Claude Code explore and explain the microservices architecture"

### Refactoring
"Use Claude Code to identify all duplicate code patterns and suggest refactorings"

### Testing
"Ask Claude Code to analyze test coverage and suggest missing test cases"

### Documentation
"Have Claude Code generate documentation for all API endpoints"

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- **Issues**: https://github.com/MagicTurtle-s/claude-code-mcp-bridge/issues
- **Documentation**: https://github.com/MagicTurtle-s/claude-code-mcp-bridge
- **Claude Code Docs**: https://docs.claude.com/claude-code

## Roadmap

- [x] Basic MCP server implementation
- [x] STDIO transport
- [x] Streaming support
- [x] Session management
- [x] Tool filtering
- [x] Permission modes
- [x] One-command setup
- [ ] NPM package publication
- [ ] HTTP/SSE transport (for Railway deployment)
- [ ] Web dashboard
- [ ] Session resume/fork capabilities
- [ ] Advanced progress tracking
- [ ] Cost tracking and analytics

## Credits

Built by **MagicTurtle-s** with ❤️ for the Claude community.

Powered by:
- **Claude Code CLI** by Anthropic
- **Model Context Protocol (MCP)** by Anthropic
- **TypeScript** for type safety
- **Node.js** for runtime
