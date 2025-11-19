# Session-Based Authentication Guide

**Date**: November 19, 2025
**Version**: 1.0.0
**Status**: Production Ready

---

## Overview

This guide explains how the claude-code-bridge handles session-based authentication for external MCP servers (like Asana MCP on Railway).

### What is Session-Based Auth?

Some MCP servers require **per-session authentication** instead of simple API keys:

1. **Client** requests a session from the MCP server
2. **Server** returns a `session_id` and OAuth URL
3. **User** visits OAuth URL to authorize
4. **Client** includes `session_id` in all subsequent tool calls
5. **Server** validates session and executes tools

This approach allows:
- Multiple Desktop instances with separate auth
- Fine-grained access control
- Token refresh without client changes
- Audit trails per session

---

## Architecture

### Components

```
Claude Desktop (User)
       ↓
claude-code-bridge MCP
       ↓
SessionManager
       ↓
MCPSessionManager ← Creates & manages sessions
       ↓
Code Subprocess (with session_id in prompt)
       ↓
External MCP Server (e.g., Asana Railway)
```

### Session Lifecycle

1. **Creation**: When bridge loads MCP config, it auto-creates session
2. **Storage**: Session ID stored in-memory (per Desktop instance)
3. **Injection**: Session ID injected into orchestrator prompt
4. **Usage**: Code subprocess includes `session_id` in tool calls
5. **Auth**: If not authenticated, user visits OAuth URL
6. **Reuse**: Subsequent calls use same session until Desktop restarts

---

## Implementation

### 1. MCPSessionManager Module

**File**: `src/mcp-session-manager.ts`

**Key Methods**:

```typescript
// Create or retrieve session
async getOrCreateSession(mcpUrl: string, desktopInstanceId: string): Promise<string>

// Get OAuth URL for authentication
getOAuthUrl(mcpUrl: string, desktopInstanceId: string): string | null

// Mark session as authenticated
markAuthenticated(mcpUrl: string, desktopInstanceId: string): void

// List unauthenticated sessions
getUnauthenticatedSessions(): Array<{ mcpUrl: string; oauthUrl: string }>
```

**Session Creation Flow**:

```typescript
// POST /session/create to MCP server
const response = await axios.post(`${baseUrl}/session/create`, {
  desktop_instance_id: desktopInstanceId
});

// Store session info
{
  sessionId: response.data.session_id,
  mcpUrl: baseUrl,
  desktopInstanceId: desktopInstanceId,
  createdAt: Date.now(),
  authenticated: false,
  oauthUrl: `${baseUrl}${response.data.oauth_url}`
}
```

### 2. SessionManager Integration

**File**: `src/session-manager.ts`

**Auto-Creation on Config Load**:

```typescript
// In createMergedConfig():
await this.ensureMCPSessions(userServers);

// Creates sessions for Asana MCPs
private async ensureMCPSessions(mcpServers: any): Promise<void> {
  for (const [mcpName, mcpConfig] of Object.entries(mcpServers)) {
    const isAsana = mcpName.toLowerCase().includes('asana') ||
                   (mcpUrl && mcpUrl.toLowerCase().includes('asana'));

    if (isAsana && mcpUrl) {
      await this.createMCPSession(mcpName, mcpUrl);
    }
  }
}
```

**Session ID in Orchestrator Prompt**:

```typescript
// Retrieve session ID
const asanaSessionId = this.mcpSessionManager.getExistingSessionId(
  'https://asana-mcp-railway-production.up.railway.app/sse',
  'default'
);

// Include in system prompt
const orchestratorSystemPrompt = `...
Available MCP configs:
- Asana: C:\\Users\\jonat\\asana-mcp-railway\\.mcp-config.json [Session: ${asanaSessionId}]
...

Workflow for Asana queries:
4. Call execute_with_permission_mode with:
   - prompt: "IMPORTANT: When calling Asana MCP tools, ALWAYS include
             session_id parameter: '${asanaSessionId}'.
             Example: asana_search_tasks({session_id: '${asanaSessionId}', ...})"
...`;
```

### 3. Code Subprocess Execution

**How It Works**:

1. Desktop calls: `mcp__claude-code-bridge__execute_task("Find Asana tasks")`
2. Bridge creates orchestrator prompt with session ID
3. Orchestrator spawns Code subprocess with:
   ```
   IMPORTANT: When calling Asana MCP tools, ALWAYS include session_id: 'abc123'
   Example: asana_search_tasks({session_id: 'abc123', query: 'tasks'})
   ```
4. Code subprocess calls: `asana_search_tasks({session_id: 'abc123', query: 'my tasks'})`
5. Asana MCP validates session and returns results

---

## Configuration

### Desktop Config

**File**: `C:\Users\jonat\AppData\Roaming\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "claude-code-bridge": {
      "command": "node",
      "args": ["C:\\Users\\jonat\\claude-code-mcp-bridge\\build\\index.js"],
      "env": {
        "DEBUG": "true",
        "ASANA_MCP_URL": "https://asana-mcp-railway-production.up.railway.app/sse",
        "ASANA_PROJECT_PATH": "C:\\Users\\jonat\\asana-mcp-railway"
      }
    }
  }
}
```

### MCP Config

**File**: `C:\Users\jonat\asana-mcp-railway\.mcp-config.json`

```json
{
  "mcpServers": {
    "asana": {
      "type": "sse",
      "url": "https://asana-mcp-railway-production.up.railway.app/sse"
    }
  }
}
```

**Important**: No credentials in config! Authentication happens via OAuth.

---

## Testing

### Unit Test

```bash
cd C:\Users\jonat\claude-code-mcp-bridge
node test-session-integration.js
```

**Expected Output**:

```
✅ Session created: fMU5_1jQFcobdgacH1qAiQldEEBkvU2UZHfrY-gGSHc
🔐 OAuth URL: https://asana-mcp-railway-production.up.railway.app/oauth/start?session=...
✅✅✅ SESSION INTEGRATION TEST PASSED! ✅✅✅
```

### Integration Test

**In Claude Desktop**:

1. Restart Desktop (quit completely, wait 10s, reopen)
2. Ask: `Use the bridge to find my Asana tasks`
3. **First time (unauthenticated)**:
   - Response: "Authentication required. Visit: https://..."
   - Click OAuth URL, authorize Asana
4. **Retry same query**:
   - Response: "Here are your tasks: [list of tasks]"
5. **Subsequent queries**:
   - No auth needed (session persists until Desktop restart)

---

## Troubleshooting

### Issue: "session_id required but not provided"

**Cause**: Subprocess didn't receive session_id in prompt

**Fix**:
1. Check bridge debug logs for session creation
2. Verify `ensureMCPSessions()` ran during config load
3. Confirm orchestrator prompt includes session_id

**Debug**:
```bash
# Enable debug in Desktop config
"DEBUG": "true"

# Check logs
cat C:\Users\jonat\AppData\Roaming\Claude\logs\mcp-server-claude-code-bridge.log
```

### Issue: "Authentication required" every time

**Cause**: Session not marked as authenticated

**Fix**:
1. Verify you completed OAuth flow
2. Check Asana MCP logs for auth success
3. Bridge should call `markAuthenticated()` after successful tool call

### Issue: "Session expired"

**Cause**: Railway server restarted or session TTL exceeded

**Fix**:
1. Restart Claude Desktop (creates new session)
2. Complete OAuth flow again
3. Sessions are ephemeral - this is expected

### Issue: Multiple Desktop instances conflict

**Cause**: All using `desktop_instance_id: 'default'`

**Fix**: Pass unique ID per Desktop instance
```typescript
// Future enhancement: get Desktop ID from env var
const desktopId = process.env.DESKTOP_INSTANCE_ID || 'default';
await mcpSessionManager.getOrCreateSession(mcpUrl, desktopId);
```

---

## Security Considerations

### Session Storage

- **Current**: In-memory only (lost on restart)
- **Pro**: No secrets on disk
- **Con**: Re-auth needed after restart

### Session Isolation

- Sessions tied to `desktop_instance_id`
- Default: all Desktop instances share 'default'
- Multi-user: set unique `DESKTOP_INSTANCE_ID` env var

### OAuth Security

- State parameter prevents CSRF
- Session ID not exposed to client
- Server validates OAuth callback

### Token Storage

- MCP server stores OAuth tokens (not bridge)
- Bridge only knows session_id (opaque identifier)
- Tokens never sent to Desktop

---

## Future Enhancements

### 1. Session Persistence

**Option A**: File-based storage
```typescript
// Save to ~/.claude/bridge-sessions.json
{
  "asana": {
    "default": {
      "sessionId": "abc123",
      "createdAt": 1699999999,
      "authenticated": true
    }
  }
}
```

**Option B**: Desktop-managed storage
- Desktop provides storage API
- Bridge requests/saves sessions via Desktop

### 2. Multi-Desktop Support

```typescript
// Get Desktop ID from environment
const DESKTOP_ID = process.env.CLAUDE_DESKTOP_ID || 'default';

// Create session per Desktop
await mcpSessionManager.getOrCreateSession(mcpUrl, DESKTOP_ID);
```

### 3. Auto-Authentication Flow

```typescript
// Open OAuth URL in browser automatically
import { exec } from 'child_process';

const oauthUrl = mcpSessionManager.getOAuthUrl(mcpUrl);
if (oauthUrl && !isAuthenticated) {
  exec(`start ${oauthUrl}`); // Windows
  // exec(`open ${oauthUrl}`); // macOS
  // exec(`xdg-open ${oauthUrl}`); // Linux
}
```

### 4. Session Health Monitoring

```typescript
// Ping session periodically
setInterval(async () => {
  const isValid = await mcpSessionManager.validateSession(sessionId);
  if (!isValid) {
    // Re-create session
    await mcpSessionManager.refreshSession(mcpUrl);
  }
}, 60000); // Check every minute
```

---

## API Reference

### MCPSessionManager

#### `getOrCreateSession(mcpUrl, desktopInstanceId)`

**Parameters**:
- `mcpUrl` (string): Base URL of MCP server
- `desktopInstanceId` (string): Unique Desktop ID (default: 'default')

**Returns**: `Promise<string>` - Session ID

**Throws**: Error if session creation fails

#### `getOAuthUrl(mcpUrl, desktopInstanceId)`

**Parameters**: Same as above

**Returns**: `string | null` - OAuth URL or null if not found

#### `markAuthenticated(mcpUrl, desktopInstanceId)`

**Parameters**: Same as above

**Returns**: `void`

**Effect**: Marks session as authenticated

#### `getUnauthenticatedSessions()`

**Returns**: Array of unauthenticated sessions:
```typescript
[
  {
    mcpUrl: "https://asana-mcp-railway-production.up.railway.app/sse",
    oauthUrl: "https://...oauth/start?session=...",
    desktopInstanceId: "default"
  }
]
```

### SessionManager

#### `getMCPSessionId(mcpUrl)`

**Parameters**:
- `mcpUrl` (string): MCP server URL

**Returns**: `string | null` - Session ID or null

#### `getUnauthenticatedMCPs()`

**Returns**: Same as `MCPSessionManager.getUnauthenticatedSessions()`

---

## Examples

### Example 1: Manual Session Creation

```javascript
const { MCPSessionManager } = require('./build/mcp-session-manager.js');

const manager = new MCPSessionManager(true); // debug mode

async function main() {
  const sessionId = await manager.getOrCreateSession(
    'https://asana-mcp-railway-production.up.railway.app/sse',
    'my-desktop'
  );

  console.log('Session ID:', sessionId);

  const oauthUrl = manager.getOAuthUrl(
    'https://asana-mcp-railway-production.up.railway.app/sse',
    'my-desktop'
  );

  console.log('Visit to authenticate:', oauthUrl);
}

main();
```

### Example 2: Tool Call with Session

```javascript
// In Code subprocess (auto-generated by orchestrator)

// Asana MCP tool call
const result = await asana_search_tasks({
  session_id: 'abc123',  // ← Auto-injected by orchestrator
  query: 'my tasks',
  workspace: 'default'
});

console.log('Tasks:', result);
```

### Example 3: Check Auth Status

```javascript
const { SessionManager } = require('./build/session-manager.js');

const sessionManager = new SessionManager({
  debug: true,
  claudePath: 'claude.exe',
  mcpConfigs: { /* ... */ }
});

// Check unauthenticated MCPs
const unauth = sessionManager.getUnauthenticatedMCPs();

if (unauth.length > 0) {
  console.log('Need authentication for:');
  unauth.forEach(({ mcpUrl, oauthUrl }) => {
    console.log(`  ${mcpUrl}`);
    console.log(`  Visit: ${oauthUrl}`);
  });
}
```

---

## Changelog

### v1.0.0 (November 19, 2025)

- ✅ Initial implementation
- ✅ MCPSessionManager module created
- ✅ SessionManager integration
- ✅ Orchestrator prompt injection
- ✅ Asana MCP support
- ✅ Unit tests
- ✅ Documentation

---

## Related Documentation

- **Bridge Architecture**: `README.md`
- **SSE Transport**: `SSE-INVESTIGATION-SUMMARY.md`
- **Production Setup**: `PRODUCTION-SETUP-CHECKLIST.md`
- **Asana MCP**: `asana-mcp-railway/PROJECT.md`

---

**Status**: ✅ Ready for Production Testing

**Last Updated**: November 19, 2025
