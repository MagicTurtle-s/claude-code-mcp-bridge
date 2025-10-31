# Claude Code MCP Bridge

**Enable Claude Desktop to delegate tasks to Claude Code CLI and its powerful subagents.**

This MCP (Model Context Protocol) server creates a bridge between Claude Desktop and Claude Code CLI, allowing Claude Desktop to execute complex coding tasks by delegating to Claude Code's specialized subagents (Explore, Plan, etc.).

## Features

- **Seamless Integration**: Claude Desktop can delegate tasks to Claude Code with a single command
- **Full Subagent Access**: Leverage Claude Code's Explore, Plan, and other specialized agents
- **Streaming Responses**: Real-time progress updates as Claude Code works
- **Tool Control**: Fine-grained control over which tools Claude Code can use
- **Permission Modes**: Choose between plan-only, auto-accept edits, or default behavior
- **Session Management**: Track and monitor active Claude Code sessions
- **One-Command Setup**: Get up and running in under 60 seconds

## Quick Start

### Installation

```bash
# Install via NPM (coming soon)
npm install -g @magicturtle-s/claude-code-mcp

# Or clone and setup locally
git clone https://github.com/MagicTurtle-s/claude-code-mcp-bridge.git
cd claude-code-mcp-bridge
npm install
npm run build
claude-code-mcp setup
```

### Prerequisites

- **Node.js 18+**
- **Claude Code CLI** installed and in PATH
- **Claude Desktop** installed

### Setup

```bash
# Run the setup wizard
claude-code-mcp setup

# Or manually configure
claude-code-mcp configure
```

### Verification

```bash
# Validate your setup
claude-code-mcp validate

# Run diagnostics
claude-code-mcp doctor
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

### MCP server not showing in Claude Desktop

1. Run `claude-code-mcp doctor` to diagnose
2. Verify Claude Desktop config: `claude-code-mcp validate`
3. Check Claude Desktop logs for errors
4. Restart Claude Desktop

### Claude Code CLI not found

1. Verify Claude Code is installed: `claude --version`
2. Add Claude Code to your PATH
3. Set `CLAUDE_CODE_PATH` environment variable in config

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
