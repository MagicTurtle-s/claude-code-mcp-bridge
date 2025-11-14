# Claude Code MCP Bridge - Claude Context

This file contains Claude-specific context, patterns, and gotchas for working on this project.

## Orchestrator Pattern (NEW)

### Overview
This bridge implements an **orchestrator pattern** where Claude Code acts as a conductor with 0 MCP token overhead, delegating tasks to specialized Code subprocesses that load specific MCP contexts on-demand.

### Problem Solved
- **Before**: Global MCPs loaded in every session = 151.8k token overhead (75.9% of 200k context)
- **After**: Global sessions start at 0 tokens, delegate only when needed

### Orchestrator Data Flow
```
Claude Code (Global, 0 MCPs)
  ↓ (analyzes task, determines needed context)
Bridge MCP Server (delegation tools)
  ↓ (generates temp MCP config)
Session Manager (executeDelegatedTask)
  ↓ (spawns subprocess)
Claude Code Subprocess
  ├─ --mcp-config /tmp/mcp-config-xyz.json
  ├─ cwd: ~/hubspot-mcp-railway (or sharepoint/asana)
  └─ Loads HubSpot MCP (116 tools)
  ↓ (executes task with MCP access)
Returns result to orchestrator
  ↓ (cleanup temp config)
Displays to user
```

### Key Implementation Files

**src/config.ts** - Environment-based configuration
```typescript
export const MCP_CONTEXTS = {
  hubspot: {
    projectPath: process.env.HUBSPOT_PROJECT_PATH || '~/hubspot-mcp-railway',
    mcpUrl: process.env.HUBSPOT_MCP_URL || 'https://...',
    type: 'http'
  },
  // sharepoint, asana...
};
```

**src/utils/mcp-config-generator.ts** - Dynamic config generation
```typescript
export function generateMCPConfig(context: 'hubspot' | 'sharepoint' | 'asana') {
  return {
    mcpServers: {
      [context]: {
        type: MCP_CONTEXTS[context].type,
        url: MCP_CONTEXTS[context].mcpUrl
      }
    }
  };
}
```

**src/session-manager.ts** - Parallel execution
```typescript
async executeDelegatedTask(options, mcpConfig, workingDirectory) {
  const tempConfigPath = writeToTempFile(mcpConfig);
  try {
    return await createSession({
      ...options,
      mcpConfigPath: tempConfigPath,
      workingDirectory
    });
  } finally {
    cleanupTempFile(tempConfigPath);
  }
}

async executeBatch(tasks) {
  return Promise.all(tasks.map(task => executeDelegatedTask(...)));
}
```

**src/tools/delegation.ts** - 4 delegation tools
- `delegate_hubspot_task`: HubSpot CRM operations
- `delegate_sharepoint_task`: SharePoint document management
- `delegate_asana_task`: Asana project management
- `delegate_batch_tasks`: Parallel execution across contexts

### Usage Pattern
```typescript
// In Claude Code global session (0 MCP tokens loaded)
User: "Create a new company in HubSpot called Acme Corp"

Code: // Determines HubSpot context needed
      // Calls delegate_hubspot_task tool via Bridge MCP

Bridge: // generateMCPConfig('hubspot')
        // executeDelegatedTask(
        //   { prompt: "Create company Acme Corp" },
        //   hubspotMcpConfig,
        //   '~/hubspot-mcp-railway'
        // )

Subprocess: // claude --mcp-config /tmp/config.json --print "..."
            // Loads HubSpot MCP (116 tools)
            // Executes: mcp__hubspot__crm_create_company

Result: Company created, returns to global Code session
```

### Parallel Execution Example
```typescript
// Execute 3 tasks simultaneously
delegate_batch_tasks({
  tasks: [
    { context: 'hubspot', prompt: 'List all companies' },
    { context: 'sharepoint', prompt: 'List documents in Sales folder' },
    { context: 'asana', prompt: 'Get Q1 goals' }
  ]
});

// All 3 run in parallel via Promise.all()
// Total time ~= single delegation time (not 3x)
```

## Architecture Overview (Original)

### Data Flow
```
Claude Desktop
  ↓ (MCP protocol: ListTools, CallTool)
MCP Server (server.ts)
  ↓ (creates session)
Session Manager (session-manager.ts)
  ↓ (creates executor)
Claude Code Executor (executor.ts)
  ↓ (spawns process)
claude --print --output-format stream-json "..."
  ↓ (streams JSON lines)
Executor (parses, emits events)
  ↓ (result)
Session Manager (stores, cleans up)
  ↓ (returns to MCP client)
Claude Desktop (displays to user)
```

### Key Patterns

#### 1. Streaming JSON Parser
**Location**: `src/executor.ts:45-70`

Claude Code CLI outputs newline-delimited JSON. Each line is a separate JSON object:
```typescript
const rl = readline.createInterface({ input: process.stdout });
rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    // Handle different message types
  } catch (e) {
    // Ignore non-JSON lines (debug output)
  }
});
```

**Gotcha**: Not all stdout is JSON. Debug messages and errors may be plain text. Always wrap `JSON.parse()` in try-catch.

#### 2. Event-Driven Architecture
**Location**: `src/executor.ts`, `src/session-manager.ts`

Both Executor and SessionManager extend EventEmitter:
```typescript
// Executor events
executor.on('executor:start', handler);
executor.on('executor:partial', handler);
executor.on('executor:complete', handler);
executor.on('executor:error', handler);

// SessionManager forwards to MCP client
sessionManager.on('session:created', handler);
sessionManager.on('session:completed', handler);
```

**Pattern**: Events bubble up: Executor → SessionManager → MCP Server → Claude Desktop

#### 3. Session Cleanup
**Location**: `src/session-manager.ts:120-180`

Sessions are cleaned up via:
- Automatic timeout (30 min idle)
- Manual cleanup (`killSession`)
- Graceful shutdown (SIGINT/SIGTERM)

**Gotcha**: Always cleanup executors:
```typescript
// Kill process if running
if (executor.isRunning()) {
  executor.kill(); // Sends SIGTERM, then SIGKILL after 5s
}
executor.removeAllListeners(); // Prevent memory leaks
```

#### 4. Tool Parameter Validation
**Location**: `src/tools/index.ts`

All tools use Zod schemas:
```typescript
export const executeTaskTool = {
  name: 'execute_task',
  inputSchema: z.object({
    prompt: z.string().describe('...'),
    timeout: z.number().optional(),
  }),
};

// In handler
const params = executeTaskTool.inputSchema.parse(args); // Throws if invalid
```

**Pattern**: Zod provides both TypeScript types and runtime validation.

## Common Tasks

### Adding a New MCP Tool

1. **Define schema** in `src/tools/index.ts`:
```typescript
export const myNewTool = {
  name: 'my_new_tool',
  description: 'What it does',
  inputSchema: z.object({
    param1: z.string(),
    param2: z.number().optional(),
  }),
};
```

2. **Implement handler** in `src/tools/index.ts`:
```typescript
export async function handleMyNewTool(
  sessionManager: SessionManager,
  params: z.infer<typeof myNewTool.inputSchema>
): Promise<ToolExecutionResult> {
  // Implementation
}
```

3. **Register in server** (`src/server.ts:40-60`):
```typescript
// In ListToolsRequestSchema handler
tools: [
  // ... existing tools
  {
    name: myNewTool.name,
    description: myNewTool.description,
    inputSchema: myNewTool.inputSchema.shape,
  },
]

// In CallToolRequestSchema handler
case 'my_new_tool': {
  const params = myNewTool.inputSchema.parse(args);
  return await handleMyNewTool(this.sessionManager, params);
}
```

4. **Build and test**:
```bash
npm run build
claude-code-mcp start --debug
```

### Modifying Claude Code CLI Arguments

**Location**: `src/executor.ts:90-125`

Add new arguments to `buildCommandArgs()`:
```typescript
// Example: Add model selection
if (options.model) {
  args.push('--model', options.model);
}
```

**Update types** in `src/types.ts`:
```typescript
export interface ClaudeCodeExecutionOptions {
  // ... existing options
  model?: 'sonnet' | 'opus' | 'haiku'; // Add new option
}
```

### Debugging Streaming Issues

**Enable debug logging**:
```bash
claude-code-mcp start --debug
# or
DEBUG=true node build/index.js
```

**Check what Claude Code CLI outputs**:
```bash
claude --print --output-format stream-json "test task"
```

**Common issues**:
- **Empty output**: Check process.stdout piping
- **Parse errors**: Wrap JSON.parse in try-catch
- **Missing final result**: Ensure process 'close' event waits for all data
- **Process hangs**: Add timeout handling

### Testing Setup Scripts

**Location**: `scripts/setup.js`, `scripts/validate.js`

Test in automated mode (skip interactive prompts):
```bash
CI=true node scripts/setup.js
```

Test validation:
```bash
node scripts/validate.js
```

Test Claude Desktop config:
```bash
node scripts/configure-claude.js
```

## Gotchas

### 1. Zod Schema to JSON Schema Conversion (CRITICAL)
**Issue**: Tools not showing up in Claude Desktop despite server connecting successfully.

**Root Cause**: Zod's `.shape` property returns internal Zod objects, NOT the JSON Schema format that MCP protocol expects.

**WRONG**:
```typescript
this.server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [{
      name: 'tool_name',
      description: 'Description',
      inputSchema: myZodSchema.shape  // ❌ WRONG! Returns Zod internals
    }]
  };
});
```

**CORRECT**:
```typescript
import { zodToJsonSchema } from 'zod-to-json-schema';

this.server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [{
      name: 'tool_name',
      description: 'Description',
      inputSchema: zodToJsonSchema(myZodSchema)  // ✅ Correct!
    }]
  };
});
```

**Symptoms**:
- MCP server connects successfully
- Claude Desktop shows the connector
- No tools appear in the tools list
- No errors in logs

**Fix**: Use `zod-to-json-schema` package to convert Zod schemas to JSON Schema

**Related**: Similar to SharePoint MCP Railway's `.parameters` vs `.inputSchema` issue with FastMCP, but TypeScript equivalent.

**Fixed in**: Commit `a71de21`

### 2. Process Spawning on Windows
**Issue**: Windows handles process spawning differently than Unix.

**Solution**: Always use `shell: false` and avoid shell-specific syntax:
```typescript
spawn('claude', args, { shell: false }); // Good
spawn('claude --flag "arg"', [], { shell: true }); // Bad (security risk)
```

### 2. JSON Parsing Errors
**Issue**: Claude Code CLI may output non-JSON lines mixed with JSON.

**Solution**: Always wrap JSON.parse() in try-catch:
```typescript
rl.on('line', (line) => {
  try {
    const data = JSON.parse(line);
    // Handle JSON
  } catch (e) {
    // Ignore or log non-JSON lines
  }
});
```

### 3. Session Cleanup Memory Leaks
**Issue**: EventEmitter listeners accumulate if not removed.

**Solution**: Always call `removeAllListeners()` during cleanup:
```typescript
executor.removeAllListeners();
this.executors.delete(sessionId);
```

### 4. Claude Desktop Config Path
**Issue**: Config path varies by platform.

**Solution**: Use environment variables:
```typescript
// Windows
path.join(process.env.APPDATA, 'Claude', 'claude_desktop_config.json')

// macOS
path.join(process.env.HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')

// Linux
path.join(process.env.HOME, '.config', 'Claude', 'claude_desktop_config.json')
```

### 5. TypeScript Build Errors
**Issue**: MCP SDK types can be strict.

**Solution**: Match exact type signatures:
```typescript
// Tool result must have exact shape
return {
  content: [{ type: 'text', text: '...' }],
  isError?: boolean,
  _meta?: Record<string, unknown>,
};
```

### 6. Timeout Handling
**Issue**: Long-running Claude Code tasks can timeout.

**Solution**: Make timeout configurable and use proper cleanup:
```typescript
const timeout = setTimeout(() => {
  process.kill('SIGTERM');
  reject(new Error('Timeout'));
}, options.timeout || 120000);

process.on('exit', () => clearTimeout(timeout));
```

## Testing Checklist

Before pushing changes:

- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] CLI commands work (`claude-code-mcp doctor`)
- [ ] Setup wizard completes (`node scripts/setup.js`)
- [ ] Validation passes (`node scripts/validate.js`)
- [ ] MCP server starts without errors
- [ ] Test with Claude Desktop (if available)
- [ ] Check for memory leaks (long-running sessions)
- [ ] Verify cleanup on SIGINT/SIGTERM

## Deployment Notes

### NPM Publication
```bash
npm run build
npm test  # When tests exist
npm publish
```

### GitHub Release
```bash
git tag v1.0.0
git push origin v1.0.0
# Create release on GitHub with CHANGELOG
```

### Future Railway Deployment
When adding HTTP/SSE transport:
- Add Express server
- Add SSE endpoint
- Update Procfile for Railway
- Add health check endpoint
- Update README with Railway deployment instructions

## Critical Bug Fixes (2025-11-02)

### FIXED: Output Capture Not Working ⚠️ CRITICAL

**Status**: ✅ RESOLVED

Two critical bugs prevented ANY output from being captured:

#### Bug #1: Missing --verbose Flag
**Issue**: Claude Code CLI requires `--verbose` when using `--output-format stream-json`

**Fix** (executor.ts:183):
```typescript
const args: string[] = [
  '--print',
  '--verbose',  // ADDED - Required!
  '--output-format', 'stream-json',
];
```

#### Bug #2: stdin Not Closed
**Issue**: Claude Code waits for stdin to close before producing output in `--print` mode

**Fix** (executor.ts:60-63):
```typescript
this.process = spawn(this.claudeCodePath, args, {...});

// Close stdin immediately
this.process.stdin?.end();  // ADDED - Critical!
```

**Impact**:
- Before: 0% functional - all tasks timed out
- After: 100% functional - all tasks work perfectly

**Testing**:
```bash
node test-executor.js
# ✅ SUCCESS! Result captured
# Result: 4
# Chunks received: 3
```

See [BUGFIX-CRITICAL.md](../BUGFIX-CRITICAL.md) for complete details.

## Recent Enhancements (2025-11-02)

### Enhanced Output Capture and Debugging

#### New Features Added:

1. **Comprehensive Logging System** (executor.ts:19-33):
   - Debug mode enabled via constructor parameter or DEBUG env var
   - Captures all stdout, stderr, and JSON chunks
   - Detailed logging at every stage of execution
   - Log method: `this.log('message', data)`

2. **Output Capture Arrays** (executor.ts:20-22):
   - `allStdout`: Captures every stdout line (JSON and non-JSON)
   - `allStderr`: Captures all error output
   - `allChunks`: Stores all parsed JSON messages

3. **Diagnostic Methods** (executor.ts:264-306):
   - `getAllStdout()`: Returns all captured stdout
   - `getAllStderr()`: Returns all error output
   - `getAllChunks()`: Returns parsed JSON messages
   - `getDiagnostics()`: Returns comprehensive diagnostic object

4. **Verbose Mode in Tools** (tools/index.ts:20, 45-48):
   - New `verbose` parameter in execute_task
   - Returns diagnostics and allChunks when enabled
   - Helps debug "no result captured" issues

5. **Enhanced Error Messages** (executor.ts:133-153):
   - Detailed error information when result not captured
   - Includes stdout/stderr context
   - Shows chunk types received
   - Helps identify parsing or protocol issues

#### Usage Examples:

**Enable verbose mode from Claude Desktop:**
```json
{
  "prompt": "Your task here",
  "verbose": true
}
```

**Returns:**
```json
{
  "success": true,
  "result": "...",
  "diagnostics": {
    "stdoutLines": 45,
    "stderrLines": 0,
    "chunksReceived": 40,
    "sessionId": "sess_123",
    "lastStdout": ["...", "..."],
    "chunkTypes": ["partial", "partial", "result"]
  },
  "allChunks": [...]
}
```

#### Debugging Workflow:

1. **Enable DEBUG in server**:
   - Set DEBUG=true in Claude Desktop config env
   - Logs appear in stderr (captured in Claude Desktop logs)

2. **Use verbose mode in tools**:
   - Add `"verbose": true` to tool parameters
   - Review diagnostics in response

3. **Check logs**:
   - Windows: %APPDATA%\Claude\logs\
   - Look for [ClaudeCodeExecutor] prefixed lines

4. **Test CLI directly**:
   ```bash
   claude --print --output-format stream-json "test"
   ```

#### Common Issues Resolved:

1. **"No result captured" errors**: Now includes full diagnostic context
2. **Silent failures**: Debug logs show every step
3. **Partial results**: allChunks shows what was actually received
4. **stderr issues**: Now captured and logged

#### Files Modified:

- `src/executor.ts`: Added logging, capture arrays, diagnostic methods
- `src/tools/index.ts`: Added verbose parameter, diagnostics in response
- `src/session-manager.ts`: Returns executor reference, passes debug flag
- `README.md`: Added verbose mode documentation
- `TROUBLESHOOTING.md`: Comprehensive troubleshooting guide (NEW)

---

**Last Updated**: 2025-11-02
**For**: Claude Code and future developers
