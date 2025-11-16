# Debug Next Steps - For Claude Desktop

## Current Status

**Your report:**
- Process 27036 spawns
- 1 stdout line (empty)
- 6 stderr lines (cache/GPU errors)
- 0 chunks received
- Exit: Success

**This tells us:** Claude Code is running but producing NO JSON output to the bridge.

## Critical Question

**What are those 6 stderr lines?**

The stderr lines are KEY to understanding what's happening. They should contain:
1. `[ClaudeCodeExecutor]` debug logs from the bridge
2. Or actual errors from Claude Code

With DEBUG=true enabled, stderr should show:
```
[ClaudeCodeExecutor] Starting execution with args: ['--print', '--verbose', '--output-format', 'stream-json', ...]
[ClaudeCodeExecutor] Prompt: ...
[ClaudeCodeExecutor] Spawning process: claude
[ClaudeCodeExecutor] Stdin closed
[ClaudeCodeExecutor] Received JSON: system init
[ClaudeCodeExecutor] Received JSON: assistant
[ClaudeCodeExecutor] Received JSON: result success
```

If you're seeing "cache/GPU errors" instead, those might be:
- From Claude Code initialization
- Harmless warnings
- OR blocking actual execution

## What We Need

### 1. The Actual Stderr Content

Please share ALL 6 stderr lines. Example format:
```
[Line 1]: ...
[Line 2]: ...
[Line 3]: ...
etc.
```

### 2. The Actual Stdout Content

You said "1 line, empty". Is it:
- Literally empty string: `""`
- A newline: `"\n"`
- A space: `" "`
- Something else?

### 3. Check MCP Logs

Location: `%APPDATA%\Claude\logs\`

Look for the most recent log file and search for:
- `[MCP Server]`
- `[ClaudeCodeExecutor]`
- `[SessionManager]`

Share any lines containing these prefixes.

## Test Scenarios

### Scenario A: DEBUG logs NOT appearing in stderr

**Means:** Claude Desktop's environment variables aren't being passed correctly.

**Check:**
1. Is DEBUG=true actually in the config?
2. Restart Claude Desktop completely
3. Verify config file saved correctly

### Scenario B: DEBUG logs appear, show "Spawning process: claude"

**Then stops before "Stdin closed"**

**Means:** Process spawn is failing.

**Solutions:**
- Check CLAUDE_CODE_PATH points to correct executable
- Try full path: `C:\Users\jonat\.local\bin\claude.exe`

### Scenario C: DEBUG logs show "Stdin closed" but no "Received JSON"

**Means:** Claude Code is running but producing no output.

**This is the "0 chunks" problem you're seeing.**

**Possible causes:**
1. Claude Code seeing different working directory
2. Claude Code needs specific environment variable
3. Claude Code failing silently
4. Output buffering issue

## Immediate Actions

### 1. Share the stderr lines

This is the most important piece of information.

### 2. Try with full path

Update config:
```json
{
  "env": {
    "DEBUG": "true",
    "CLAUDE_CODE_PATH": "C:\\Users\\jonat\\.local\\bin\\claude.exe"
  }
}
```

Restart Claude Desktop and try again.

### 3. Check if process actually runs

When you see the UI flicker (process 27036), quickly check:
```bash
tasklist | findstr 27036
```

Is it `claude.exe` or `node.exe` or something else?

## Our Test vs Desktop

**Our test:**
- Works perfectly
- Gets 3 JSON chunks
- Result captured successfully

**Desktop:**
- Process spawns
- Gets 0 JSON chunks
- "Empty" stdout line

**Key difference:** Environment or how process is spawned.

## Most Likely Cause

Based on "1 stdout line, empty" - I suspect:
1. Process starts
2. Writes one character/newline
3. Then hangs or exits without writing JSON
4. Bridge sees empty line, waits for JSON
5. Times out

**OR**

1. Process starts
2. Stderr errors prevent JSON output
3. Process exits successfully but silently
4. Bridge sees no output

## Next Step

**Share the 6 stderr lines.** That will tell us exactly what's happening.

---

**Files to check:**
- Config: `%APPDATA%\Claude\claude_desktop_config.json`
- Logs: `%APPDATA%\Claude\logs\` (latest file)
- Bridge build: `C:\Users\jonat\claude-code-mcp-bridge\build\index.js`

**Current config (should be):**
```json
{
  "claude-code-bridge": {
    "command": "node",
    "args": ["C:\\Users\\jonat\\claude-code-mcp-bridge\\build\\index.js"],
    "env": {
      "DEBUG": "true",
      "CLAUDE_CODE_PATH": "claude"
    }
  }
}
```

Ready to debug once we see those stderr lines!
