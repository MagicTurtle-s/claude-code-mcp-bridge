# Claude Code MCP Bridge - Claude Context

This file contains Claude-specific context, patterns, and gotchas for working on this project.

## Architecture Overview

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

### 1. Process Spawning on Windows
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

---

**Last Updated**: 2025-10-30
**For**: Claude Code and future developers
