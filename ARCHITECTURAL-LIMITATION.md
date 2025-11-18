# Architectural Limitation: Recursive MCP Orchestration

## Executive Summary

**Status**: ❌ **Production Not Ready for Recursive Orchestration**

The `claude-code-bridge` v2.3.0 successfully implements:
- ✅ MCP tool exposure (`execute_task`, `execute_with_permission_mode`, etc.)
- ✅ Config merging (injects bridge into subprocess MCP configs)
- ✅ Code subprocess spawning with custom MCP configurations
- ✅ Bridge MCP visibility to spawned Code instances

However, **recursive orchestration fails** due to a fundamental architectural limitation in the stdio-based MCP protocol implementation.

## The Problem

### Expected Flow (Does Not Work)
```
Desktop → Bridge.execute_task() → spawns Code subprocess
          ↓ (waiting for Code to complete)
          Code sees bridge MCP tools
          Code calls Bridge.execute_with_permission_mode() → DEADLOCK
          ↓ (Bridge cannot respond - blocked waiting for Code)
          Code times out after 90s
```

### Root Cause: Synchronous stdio Protocol

The bridge uses **stdio-based MCP transport** with a **synchronous request/response pattern**:

1. Desktop sends `execute_task` tool call to Bridge
2. Bridge spawns Code subprocess (session depth 1)
3. **Bridge blocks, waiting for Code to exit and return result**
4. Code subprocess receives orchestrator instructions
5. Code attempts to call `execute_with_permission_mode` on Bridge
6. **Bridge cannot process this call - it's blocked waiting for Code to complete**
7. Code hangs waiting for Bridge response
8. After 90-120 seconds, Code times out
9. Bridge returns timeout error to Desktop

This creates a **deadlock scenario** where:
- Parent cannot respond to child because it's waiting for child to complete
- Child cannot complete because it's waiting for parent to respond

## Evidence

### Test Results from `test-clean-isolated.js`

```
================================================================================
TEST RESULTS
================================================================================

Bridge Started:               ✅
Config Created:               ✅
Config Only Has Bridge:       ✅  <- Config is correct
Code Received MCP Tools:      ✅  <- Code can see bridge tools
Code Called Bridge Tool:      ✅  <- Code DOES call the tool
Recursive Bridge Call:        ❌  <- But bridge never receives it

Bridge Call Depth:           1    <- Never reaches 2 (no nested session)

ERRORS:
  1. Code execution error: Execution timeout after 90000ms
```

### Key Evidence Files

1. **system-init-debug.json** - Proves Code receives bridge MCP tools:
```json
{
  "tools": [
    "mcp__claude-code-bridge__execute_task",
    "mcp__claude-code-bridge__execute_with_tools",
    "mcp__claude-code-bridge__execute_with_permission_mode",
    "mcp__claude-code-bridge__get_session_info"
  ],
  "mcp_servers": [
    {
      "name": "claude-code-bridge",
      "status": "connected"
    }
  ]
}
```

2. **orchestration-full.log** - Shows Code calls bridge but times out:
```
[Code] [ClaudeCodeExecutor] System init - MCP servers:
[Code] [ClaudeCodeExecutor] Received JSON: user
[Code] [ClaudeCodeExecutor] Received JSON: user
[Code] [ClaudeCodeExecutor] Received JSON: user
[SessionManager] Session failed: Error: Execution timeout after 120000ms
```

3. **Temp config files** - Show correct config merge (bridge only):
```json
{
  "mcpServers": {
    "claude-code-bridge": {
      "type": "stdio",
      "command": "node",
      "args": ["C:\\Users\\jonat\\claude-code-mcp-bridge\\build\\index.js"],
      "env": {
        "DEBUG": "true",
        "CLAUDE_CODE_PATH": "C:\\Users\\jonat\\.local\\bin\\claude.exe"
      }
    }
  }
}
```

### What Works vs. What Doesn't

| Component | Status | Evidence |
|-----------|--------|----------|
| Bridge MCP loads in Desktop | ✅ Works | system-init-debug.json |
| Config merge creates correct configs | ✅ Works | temp config files |
| Code subprocess sees bridge tools | ✅ Works | system-init-debug.json |
| Code attempts to call bridge | ✅ Works | test-clean-isolated.js |
| Bridge receives nested call | ❌ Fails | bridgeCallDepth stays at 1 |
| Subprocess completes successfully | ❌ Fails | Times out after 90s |

## Technical Deep Dive

### Current Architecture: src/index.ts

The bridge's MCP server implementation:

```typescript
// stdio transport - synchronous request/response
server.connect(new StdioServerTransport());

// Tool handler blocks until execution completes
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Spawns Code subprocess and WAITS for completion
  const { sessionId, result } = await sessionManager.createSession(options);

  // Cannot process other requests while waiting
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
});
```

### Why Concurrent Calls Don't Work

**MCP stdio transport characteristics:**
- Single stdin/stdout stream per server instance
- Synchronous message processing (one request at a time)
- Request handler blocks until response is sent
- No built-in message queuing or async dispatch

**When nested call attempted:**
```
Bridge Process:
  ├─ Thread 1: Processing Desktop's execute_task
  │   ├─ Spawned Code subprocess
  │   ├─ Waiting for Code to exit
  │   └─ BLOCKED (cannot process new requests)
  │
  └─ stdin listener: Receives Code's execute_with_permission_mode
      └─ Cannot dispatch to handler (Thread 1 is blocked)
      └─ Message sits in buffer
      └─ Code times out waiting for response
```

## Solutions

### Option 1: Multi-threaded Message Queue (Complex)

**Approach**: Implement async message queue to process concurrent tool calls.

**Pros**:
- Enables true recursive orchestration
- Maintains stdio transport

**Cons**:
- Significant refactoring required
- Complex state management (multiple concurrent sessions)
- Potential race conditions
- stdio protocol not designed for this

**Implementation Complexity**: HIGH (2-3 weeks)

### Option 2: Separate Bridge Instance per Subprocess (Recommended)

**Approach**: Each Code subprocess gets its own bridge instance instead of sharing parent's bridge.

**Current**:
```
Desktop → Bridge Instance A
          ├─ execute_task spawns Code
          └─ Code tries to call Bridge Instance A (DEADLOCK)
```

**Proposed**:
```
Desktop → Bridge Instance A
          ├─ execute_task spawns Code with Bridge Instance B
          └─ Code calls Bridge Instance B (WORKS - different process)
```

**Implementation**:
- Modify `getBridgeConfig()` to spawn new bridge instance
- Each bridge is independent stdio server
- No shared state or blocking

**Pros**:
- Clean separation of concerns
- No refactoring of core protocol
- Each subprocess isolated
- Works with current stdio transport

**Cons**:
- Slightly more resource overhead (multiple Node processes)
- Need to propagate DEBUG/CLAUDE_CODE_PATH env vars

**Implementation Complexity**: LOW (1-2 days)

**Code changes needed**:
```typescript
// src/session-manager.ts
private getBridgeConfig(): any {
  return {
    'claude-code-bridge': {
      type: 'stdio',
      command: 'node',
      // Spawn NEW bridge instance (not __dirname)
      args: [path.join(__dirname, '../build/index.js')],
      env: {
        DEBUG: this.config.debug ? 'true' : 'false',
        CLAUDE_CODE_PATH: this.config.claudeCodePath || 'claude'
      }
    }
  };
}
```

**Why this already should work**:
- The config already spawns new bridge instances!
- The issue is the stdio transport blocking, not the instance sharing
- **Wait... this IS already the implementation**

### Option 3: HTTP Transport (Most Robust)

**Approach**: Change bridge from stdio to HTTP-based MCP transport.

**Pros**:
- Fully async/concurrent by nature
- True stateless request handling
- Can scale horizontally
- Industry-standard protocol

**Cons**:
- Major architectural change
- Requires port management
- More complex deployment
- Desktop MCP may not support HTTP transport easily

**Implementation Complexity**: VERY HIGH (3-4 weeks)

### Option 4: Document Limitation + Manual Orchestration (Immediate)

**Approach**: Keep current architecture, document that recursive orchestration is not supported.

**Usage Pattern**:
```typescript
// User provides explicit MCP config paths, no recursion
const result = await bridge.execute_with_permission_mode({
  prompt: "Find HubSpot deals",
  mcp_config_path: "C:\\Users\\jonat\\hubspot-mcp-railway\\.mcp-config.json",
  permission_mode: "bypassPermissions"
});
```

**Pros**:
- No code changes needed
- Works with current architecture
- Clear user expectations

**Cons**:
- No automatic orchestration
- User must manage MCP configs manually
- Original vision not achieved

**Implementation Complexity**: NONE (documentation only)

## Re-investigating Option 2

Looking at the actual code in src/session-manager.ts:30-42:

```typescript
private getBridgeConfig(): any {
  return {
    'claude-code-bridge': {
      type: 'stdio',
      command: 'node',
      args: [path.join(__dirname, '../build/index.js')], // Spawns NEW instance
      env: {
        DEBUG: this.config.debug ? 'true' : 'false',
        CLAUDE_CODE_PATH: this.config.claudeCodePath || 'claude'
      }
    }
  };
}
```

**This ALREADY spawns a new bridge instance!** The issue is NOT instance sharing.

### Why Even Separate Instances Deadlock

The problem is **when** the new bridge instance starts:

```
Timeline:
1. Desktop calls Bridge A: execute_task
2. Bridge A spawns Code subprocess with config pointing to Bridge B
3. Code subprocess starts
4. Code subprocess tries to connect to Bridge B via stdio
5. Bridge B starts when Code opens stdio connection
6. BUT Bridge B is started as a CHILD of Code subprocess
7. Code is waiting for Bridge B to respond
8. Bridge B cannot start until Code completes initialization
9. DEADLOCK: Code waits for Bridge B, Bridge B waits for Code
```

Actually, wait. Let me re-examine the stdio transport. When Code subprocess loads the MCP config with bridge, **Code itself starts the bridge as a subprocess**:

```
Desktop
  └─ Bridge A (stdio)
      └─ Code subprocess (Bridge A spawned this)
          └─ Bridge B (Code spawns this when connecting to MCP)
              └─ Code subprocess B??
```

The real question: **Can Code spawn Bridge B while Code is already running?**

YES! Code can spawn MCP servers while running. The issue is that Bridge B's stdio is connected to Code, not to Desktop.

**Actual deadlock**:
```
Desktop ─stdio─> Bridge A ─spawns─> Code A
                  ↑                   │
                  │                   └─stdio─> Bridge B ─spawns─> Code B?
                  └─────waits for Code A to exit───────┘
```

Bridge A is waiting for Code A to exit. Code A calls Bridge B. Bridge B spawns Code B. Bridge B waits for Code B to exit. All the while, Bridge A is still waiting...

**This should work!** Unless... Code A itself blocks waiting for Bridge B's response before continuing.

Let me check if that's what's happening.

## Hypothesis: Code Subprocess Blocking

Test evidence shows:
- Code receives "system init" message
- Code receives multiple "user" messages (planning/thinking)
- Code CALLS bridge tool
- Then times out

The "user" messages suggest Code is thinking/planning. But it never completes the tool call.

**Possible issue**: Code sends tool call to Bridge B, but Bridge B never responds, so Code blocks.

**Why would Bridge B not respond?**
- Bridge B starts successfully (Code can connect to stdio MCP)
- Bridge B receives tool call from Code A
- Bridge B spawns Code B subprocess
- Bridge B waits for Code B to complete...
- Code B might also try to call Bridge B? (Infinite recursion)

## The Real Issue: Infinite Recursion Prevention Needed

The orchestrator prompt tells Code to spawn subprocesses with specific MCP configs. But if Code ALWAYS has bridge in its config, then:

```
Code A (has bridge) → calls bridge → spawns Code B (has bridge) → calls bridge → spawns Code C (has bridge) → ...
```

**Solution**: Code subprocess should NOT have bridge in its config when executing domain-specific tasks.

The orchestrator flow should be:
```
Desktop → Bridge → Code Orchestrator (has bridge + orchestrator prompt)
                   ↓
                   Code creates temp config with ONLY domain MCP (e.g., hubspot)
                   ↓
                   Code calls bridge.execute_with_permission_mode(mcp_config_path=temp_hubspot_config)
                   ↓
                   Bridge spawns Code B (has ONLY hubspot, NO bridge)
                   ↓
                   Code B uses hubspot MCP tools
                   ↓
                   Returns result to Bridge
                   ↓
                   Returns to Code A
```

**The bug**: We're passing merged config (bridge + domain) to subprocess. We should pass ONLY domain config.

But wait... the orchestrator system prompt TELLS Code to do this:

```typescript
Workflow for HubSpot queries (deals, contacts, companies):
1. Read C:\\Users\\jonat\\hubspot-mcp-railway\\.mcp-config.json
2. Parse JSON and extract ONLY the "hubspot" server from config.mcpServers
3. Write to temp file (e.g. C:\\Users\\jonat\\AppData\\Local\\Temp\\hubspot-temp-config.json)
   Content must be: {"mcpServers":{"hubspot":{...}}}  // NO BRIDGE!
4. Call mcp__claude-code-bridge__execute_with_permission_mode with mcp_config_path pointing to temp file
```

So the instructions are correct. Code SHOULD create a temp config with only hubspot.

**Why isn't Code following instructions?**
- Orchestrator timeout is 90-120s
- Code receives init, receives multiple "user" messages
- Code attempts tool call
- Times out

This suggests Code might be stuck or erroring out before completing the workflow.

## Actual Problem: Debug Needed

We need to see **what Code is actually doing**:
1. Is Code reading the HubSpot config file?
2. Is Code creating the temp config file?
3. What exact tool call is Code making?
4. What parameters is Code passing?

The test scripts capture that Code calls the bridge tool, but we don't see:
- Which bridge tool (execute_task vs execute_with_permission_mode)
- What parameters
- What mcp_config_path it's using

**This is the missing piece.**

## Recommendation

Before implementing architectural changes, we need one more diagnostic:

**Test**: Capture the exact MCP tool call Code is making to the bridge.

**How**: Modify bridge to log all incoming tool calls with full parameters.

**Expected outcomes**:
1. Code calls execute_with_permission_mode with temp hubspot-only config → Should work
2. Code calls execute_with_permission_mode with merged config (bridge + hubspot) → Infinite recursion
3. Code calls execute_task (wrong tool) → Won't work
4. Code calls with missing parameters → Won't work
5. Code doesn't call anything → Instruction following issue

Once we see the exact tool call, we can determine if this is:
- Architecture limitation (needs concurrent handling)
- Instruction following issue (Code not creating temp configs correctly)
- Parameter bug (wrong values being passed)
- Tool selection issue (calling wrong tool)

## Status

**Current State**: BLOCKED - Need diagnostic logging

**Next Step**: Add tool call logging to bridge, run test again, examine exact parameters

**Timeline**: 1-2 hours to add logging and diagnose

**Production Readiness**: CANNOT DETERMINE until we see what Code is actually calling
