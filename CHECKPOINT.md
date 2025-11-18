# MCP Orchestrator Development Checkpoint

**Date**: 2025-11-17
**Version**: 2.2.0
**Status**: Permission issue blocking subprocess execution

---

## Problem Statement

User wants to query "Give me the most recent deal from Adult Teen Challenge, and tell me whether there are any tasks pending or due?" from Claude Desktop.

**Expected Flow**:
1. Desktop delegates to Code with bridge MCP
2. Code orchestrator spawns HubSpot subprocess (for deals)
3. Code orchestrator spawns Asana subprocess (for tasks)
4. Results combined and returned to user

**Current Blocker**: Subprocesses are asking for file read permissions on MCP config files, even with `skip_all_permissions: true` parameter.

---

## Architecture

### Bridge v2.2.0 Components

```
Desktop (--permission-mode bypassPermissions)
  └─> Code orchestrator (bridge MCP available)
      ├─> HubSpot subprocess (skip_all_permissions: true)
      └─> Asana subprocess (skip_all_permissions: true)
```

### MCP Configurations

1. **HubSpot**: `C:\Users\jonat\hubspot-mcp-railway\.mcp-config.json`
   - Type: HTTP
   - URL: https://hubspot-mcp-railway-production-6079.up.railway.app/mcp
   - Tools: 116 (deals, contacts, companies)

2. **Asana**: `C:\Users\jonat\asana-mcp-railway\.mcp-config.json`
   - Type: SSE
   - URL: https://asana-mcp-railway-production.up.railway.app
   - Tools: 42 (tasks, projects, goals)

3. **SharePoint**: `C:\Users\jonat\sharepoint-mcp-railway\.mcp-config.json`
   - Type: HTTP
   - URL: https://sharepoint-mcp-railway-production.up.railway.app/mcp
   - Tools: documents, files

### Bridge MCP Config

Desktop loads bridge via:
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

---

## Timeline of Fixes

### v2.1.0 - Recursive Bridge Access
- Added `getBridgeConfig()` to inject bridge into subprocess configs
- Added `createMergedConfig()` to merge user + bridge configs
- **Problem**: Version hardcoded, schema validation errors

### v2.1.1 - Schema Validation Fix
- Made server.ts read version from package.json dynamically
- **Problem**: Path corruption on Windows

### v2.1.2 - Permission Timeout Fix
- Wrapped configs in `{ mcpServers: {...} }` structure
- Normalized paths to forward slashes
- Added orchestrator instructions via `appendSystemPrompt`
- **Problem**: Code orchestrator used `execute_task()` without bypass

### v2.1.3 - Enforce execute_with_permission_mode
- Updated orchestrator to REQUIRE `execute_with_permission_mode()`
- Added `bypassPermissions` to instructions
- **Problem**: Forgot `mcpConfigPath` parameter

### v2.1.4 - Add mcpConfigPath Parameter
- Rewrote orchestrator with explicit step-by-step workflows
- Added JSON examples showing all required parameters
- **Problem**: Subprocess asked for file read permissions

### v2.2.0 - Add skip_all_permissions (CURRENT)
- Added `dangerouslySkipPermissions` flag to executor
- Maps to `--dangerously-skip-permissions` CLI flag
- Added `skip_all_permissions` parameter to `execute_with_permission_mode` tool
- Updated orchestrator to require 4 parameters: prompt, mcpConfigPath, permission_mode, skip_all_permissions
- **STILL BLOCKED**: Subprocesses still asking for config file permissions

---

## Current Issue Analysis

**What's Happening**:
Code subprocess is calling `execute_with_permission_mode` with correct parameters:
```json
{
  "prompt": "Use HubSpot MCP to find deals...",
  "mcpConfigPath": "/tmp/hubspot-1234.json",
  "permission_mode": "bypassPermissions",
  "skip_all_permissions": true
}
```

But the HubSpot/Asana subprocess launched by the bridge is STILL asking:
> "I need your permission to read the MCP configuration files"

**Hypothesis**: The `dangerouslySkipPermissions` flag may not be getting passed through correctly, OR Claude Code CLI's `--dangerously-skip-permissions` flag doesn't actually bypass file read permissions for `--mcp-config` files.

---

## Key Files

### Bridge Implementation

1. **`src/session-manager.ts`** (Lines 134-177)
   - Orchestrator system prompt
   - Creates merged MCP config
   - Executes Code subprocess

2. **`src/executor.ts`** (Lines 186-204)
   - Builds CLI arguments
   - Passes `--dangerously-skip-permissions` flag

3. **`src/types.ts`** (Lines 15-51)
   - `ClaudeCodeExecutionOptions` interface
   - `dangerouslySkipPermissions` flag definition

4. **`src/tools/index.ts`** (Lines 134-156)
   - `execute_with_permission_mode` tool
   - `skip_all_permissions` parameter

### Orchestrator Instructions (session-manager.ts:142-177)

```
CRITICAL REQUIREMENTS for spawning subprocesses:
1. MUST use execute_with_permission_mode() - never execute_task()
2. MUST include permission_mode: "bypassPermissions" parameter
3. MUST include skip_all_permissions: true parameter
4. MUST include mcpConfigPath parameter pointing to temp config file
5. Subprocesses will timeout without all FOUR requirements above
```

### Skills Created

- **MCP Orchestrator**: `C:\Users\jonat\.claude\skills\user\mcp-orchestrator\SKILL.md`
- **MCP Config Validator**: `C:\Users\jonat\.claude\skills\user\mcp-config-validator\SKILL.md`
- Plus 14 supporting files (references, templates, scripts)

---

## Debugging Steps Already Tried

1. ✅ Schema validation - Fixed by wrapping in `mcpServers`
2. ✅ Path normalization - Fixed with forward slashes
3. ✅ Version checking - Made dynamic from package.json
4. ✅ Permission mode - Changed from `execute_task` to `execute_with_permission_mode`
5. ✅ MCP config path - Added explicit `mcpConfigPath` parameter
6. ✅ Skip permissions flag - Added `dangerouslySkipPermissions`
7. ❌ **STILL FAILING** - File read permissions still being requested

---

## Next Steps to Try

### Option 1: Verify CLI Flag is Being Passed
Check if `--dangerously-skip-permissions` is actually in the spawned command:
```bash
# Add debug logging in executor.ts to print full command
console.error('[ClaudeCodeExecutor] Full command:', this.claudeCodePath, args.join(' '));
```

### Option 2: Test CLI Flag Directly
Manually test if the flag works:
```bash
claude --print --dangerously-skip-permissions --mcp-config /tmp/test.json "test prompt"
```

### Option 3: Alternative Permission Approach
Instead of relying on `--dangerously-skip-permissions`, pre-approve the config files in Desktop's project settings OR pass config directly via stdin instead of file path.

### Option 4: Inline Config Instead of File
Instead of writing temp config files and passing `--mcp-config`, embed the MCP server config directly in the bridge and pass it via environment variables or modify Code CLI to accept inline JSON.

### Option 5: Use acceptEdits Mode
Try using `--permission-mode acceptEdits` which might auto-approve file reads (though this is usually for writes).

### Option 6: Check Claude Code Version
Verify `--dangerously-skip-permissions` flag exists in user's Claude Code version:
```bash
claude --help | grep dangerously
```

---

## Environment Details

- **OS**: Windows (path separators causing issues)
- **Claude Code Path**: `C:\Users\jonat\.local\bin\claude.exe`
- **Working Directory**: `C:\Users\jonat\.local\bin`
- **Desktop Version**: Loads bridge v2.2.0 successfully
- **Node Version**: v22.18.0
- **Bridge Debug**: Enabled (`DEBUG: "true"`)

---

## Logs Location

Desktop logs: `C:\Users\jonat\AppData\Roaming\Claude\logs\mcp-server-claude-code-bridge.log`

Check for:
- `[ClaudeCodeExecutor] Starting execution with args:` - See actual CLI args
- `[SessionManager] Executing with:` - See config paths and prompts
- Session timeout errors after 120 seconds
- Permission request messages in subprocess output

---

## Testing Query

```
Give me the most recent deal from Adult Teen Challenge, and tell me whether there are any tasks pending or due?
```

Expected behavior:
1. Orchestrator reads both config files
2. Spawns 2 parallel subprocesses (HubSpot + Asana)
3. Each subprocess uses bridge-provided MCP config
4. Results returned and combined
5. Total time: ~10-20 seconds

Actual behavior:
1. ✅ Orchestrator reads config files
2. ✅ Writes temp configs correctly
3. ✅ Calls `execute_with_permission_mode` with all 4 parameters
4. ❌ Subprocess asks for file read permission
5. ❌ Hangs until 120s timeout

---

## Repository

- **GitHub**: https://github.com/MagicTurtle-s/claude-code-mcp-bridge
- **Branch**: master
- **Last Commit**: 4b51d60 - "Bump version to 2.2.0"
- **Private**: Yes

---

## Resume Instructions

When resuming work:

1. **Restart Desktop** to load latest bridge v2.2.0
2. **Add debug logging** to see if `--dangerously-skip-permissions` is in CLI args
3. **Test CLI flag manually** to verify it works standalone
4. **Check Claude Code version** and flag availability
5. **Consider alternative approaches** (Options 3-5 above)

The core issue is: **How to make subprocess Code instances read MCP config files without permission prompts?**
