# MCP Orchestrator Development Checkpoint - Session 2

**Date**: 2025-11-18
**Version**: 2.2.0
**Status**: Code subprocess times out after creating temp config files - never calls bridge MCP tools

---

## Current Issue

Code orchestrator successfully:
1. ✅ Reads `.mcp-config.json` files
2. ✅ Creates temp config files with proper `mcpServers` wrapper
3. ❌ **HANGS** - Never calls `mcp__claude-code-bridge__execute_with_permission_mode`

**Test output shows:**
```
[Code] Tool use: Write (creates hubspot-temp.json)
[Code] Tool use: Write (creates asana-temp.json)
[Code] Tool use: Bash (creates config files)
<TIMEOUT - no bridge tool calls>
```

## Progress Made This Session

### Issue 1: Missing `--dangerously-skip-permissions` Flag
**Problem**: Flag wasn't being passed to subprocess
**Fix**: Made `execute_task` tool always pass `dangerouslySkipPermissions: true`
**Status**: ✅ FIXED - Logs confirm flag is now passed

### Issue 2: Missing `mcpServers` Wrapper
**Problem**: Orchestrator told Code to unwrap configs, but CLI requires wrapper
**Fix**: Updated instructions to keep `{"mcpServers": {...}}` wrapper
**Status**: ✅ FIXED - Test shows Code creates correct format

### Issue 3: Missing `mcp_config_path` Parameter
**Problem**: Tool schema didn't have `mcp_config_path` parameter at all!
**Fix**: Added `mcp_config_path: z.string().optional()` to schema
**Status**: ✅ FIXED - Schema confirmed in logs (17:47:31 timestamp)

### Issue 4: Code Never Calls Bridge Tools (CURRENT)
**Problem**: After creating temp files, Code hangs and never calls bridge
**Possible Causes**:
1. Bridge MCP not available in Code subprocess
2. Code doesn't see the bridge tools in MCP list
3. Some other blocking issue preventing tool calls

---

## Test Script Created

`test-orchestrator.js` - Simulates Desktop calling bridge without restarting
- Runs with 30s timeout
- Shows Code's tool calls
- Confirms temp file creation works
- **Result**: Code stops after file creation, never calls bridge

---

## Key Files Modified

### `src/tools/index.ts`
- Added `mcp_config_path` parameter to `execute_with_permission_mode` tool
- Made `execute_task` always pass `dangerouslySkipPermissions: true`

### `src/session-manager.ts`
- Auto-enables `dangerouslySkipPermissions` for `bypassPermissions` mode
- Updated orchestrator instructions with `mcp_config_path` examples

### `src/executor.ts`
- Added debug logging to show full CLI command
- Shows `dangerouslySkipPermissions` flag status

---

## Debugging Steps Completed

1. ✅ Manual CLI test confirmed `--dangerously-skip-permissions` works
2. ✅ Verified schema includes `mcp_config_path` parameter
3. ✅ Confirmed Desktop receives updated tool schema
4. ✅ Created test script to reproduce issue quickly
5. ❌ Code subprocess doesn't call bridge tools after creating files

---

## Next Steps to Try

### 1. Verify Bridge MCP is Available to Subprocess
Check if Code subprocess actually has bridge MCP loaded:
```bash
# Add to orchestrator prompt:
"FIRST: Use the Bash tool to run 'claude mcp list' to show available MCPs"
```

### 2. Check if MCP Tools Are Visible
The subprocess might not see `mcp__claude-code-bridge__*` tools at all.
Possible issue: Merged config not being created/passed correctly.

### 3. Inspect Merged Config File
When bridge creates merged config, verify it contains bridge MCP:
```bash
cat C:/Users/jonat/AppData/Local/Temp/mcp-config-with-bridge-*.json
```

### 4. Test Bridge MCP Directly
Test if bridge works when called directly (not via orchestrator):
```bash
claude --mcp-config <bridge-config> \
  "Use mcp__claude-code-bridge__execute_task to run 'echo hello'"
```

### 5. Simplify Orchestrator Task
Instead of complex multi-step workflow, test if Code can call bridge at all:
```
"Use the claude-code-bridge MCP to execute a simple task: 'echo hello world'"
```

---

## Architecture Reminder

```
Desktop (bypass mode)
  └─> Code orchestrator (--dangerously-skip-permissions)
      └─> Should call: bridge.execute_with_permission_mode()
          └─> HubSpot/Asana subprocesses
```

**Current bottleneck**: Step 2→3 transition never happens

---

## Latest Commits

- `f63896e` - Add mcp_config_path parameter to tool schema
- `75b22af` - Auto-enable dangerouslySkipPermissions in execute_task
- `8b2785e` - Fix orchestrator to keep mcpServers wrapper
- `3725c57` - Add explicit mcpConfigPath examples

---

## Resume Instructions

1. **First**, verify bridge MCP is actually available in subprocess:
   - Check merged config file contents
   - See if Code subprocess lists bridge in available MCPs

2. **Then**, test if Code can call bridge tools at all:
   - Simplify to single bridge call (no HubSpot/Asana)
   - Test with minimal prompt

3. **If bridge not available**, debug merged config creation:
   - session-manager.ts:106 creates merged config
   - Verify file exists and has correct structure

4. **If bridge IS available**, figure out why Code doesn't use it:
   - Maybe prompt is too complex?
   - Maybe Code doesn't understand how to use bridge?
   - Maybe there's a permission issue we haven't found?

The core mystery: **Why does Code stop after creating temp files instead of calling the bridge MCP tools?**
