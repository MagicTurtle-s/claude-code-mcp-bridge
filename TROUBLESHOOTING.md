# Troubleshooting Guide - Claude Code MCP Bridge

This guide helps diagnose and fix common issues with output capture and task execution.

## Quick Diagnosis

### Is the bridge working at all?

1. **Check server connection**:
   - Open Claude Desktop
   - Look for "claude-code-bridge" in the MCP servers list
   - If not visible, run: `claude-code-mcp doctor`

2. **Test with a simple task**:
   ```
   Use execute_task with prompt: "What is 2+2? Keep your response very brief."
   ```
   - This should return quickly with a result
   - If it fails, see "Common Issues" below

### Enable Debug Mode

Debug mode provides detailed logging to help diagnose issues:

```bash
# In Claude Desktop config (claude_desktop_config.json)
{
  "mcpServers": {
    "claude-code-bridge": {
      "command": "node",
      "args": ["C:\\path\\to\\build\\index.js"],
      "env": {
        "DEBUG": "true"  // <-- Enable this
      }
    }
  }
}
```

After enabling, restart Claude Desktop and check the logs:
- **Windows**: `%APPDATA%\Claude\logs\`
- **macOS**: `~/Library/Logs/Claude/`
- **Linux**: `~/.config/Claude/logs/`

## Common Issues

### Issue 1: "No result was captured"

**Symptom**: Task executes successfully (exit code 0) but returns error:
```
"Claude Code exited successfully but no result was captured"
```

**Causes**:
1. Claude Code CLI didn't output expected JSON format
2. stdout parsing failed
3. Process terminated before final result

**Solutions**:

**A) Test Claude Code CLI directly**:
```bash
claude --print --output-format stream-json "What is 2+2?"
```

Expected output (newline-delimited JSON):
```json
{"type":"partial","content":"..."}
{"type":"result","subtype":"success","is_error":false,"result":"...","session_id":"..."}
```

If this doesn't work:
- Update Claude Code CLI: Check for updates
- Verify `--output-format stream-json` is supported: `claude --help`

**B) Use verbose mode in execute_task**:
```json
{
  "prompt": "Your task here",
  "verbose": true
}
```

This returns diagnostic information:
```json
{
  "success": true,
  "result": "...",
  "diagnostics": {
    "stdoutLines": 50,
    "stderrLines": 0,
    "chunksReceived": 45,
    "chunkTypes": ["partial", "partial", "result"],
    "lastStdout": ["...", "..."]
  }
}
```

**C) Check for errors in stderr**:
- Enable DEBUG mode
- Look for `[ClaudeCodeExecutor] stderr:` in logs
- Common stderr issues:
  - Authentication errors
  - Permission denied
  - Rate limiting

### Issue 2: Timeout Errors

**Symptom**: "Execution timeout after 120000ms"

**Causes**:
- Task is too complex for default timeout
- Claude Code is stuck/hanging
- Network issues (API calls)

**Solutions**:

**A) Increase timeout**:
```json
{
  "prompt": "Complex task here",
  "timeout": 300000  // 5 minutes instead of 2
}
```

**B) Use plan mode for analysis tasks**:
```json
{
  "prompt": "Analyze codebase architecture",
  "permission_mode": "plan"  // Doesn't execute, just plans
}
```

**C) Break down large tasks**:
Instead of:
```
"Refactor entire codebase and fix all bugs"
```

Use multiple calls:
```
1. "Search codebase for refactoring opportunities"
2. "Refactor the auth module"
3. "Run tests and fix failures"
```

### Issue 3: Empty or Incomplete Results

**Symptom**: Result field is empty, null, or truncated

**Causes**:
1. Claude Code task failed but returned success
2. Result was in a non-standard format
3. Streaming was interrupted

**Solutions**:

**A) Check result.is_error flag**:
```json
{
  "success": true,
  "result": "...",
  "is_error": false  // <-- Check this
}
```

**B) Use verbose mode to see all chunks**:
```json
{
  "prompt": "Your task",
  "verbose": true
}
```

Review `diagnostics.allChunks` to see all messages received.

**C) Check for permission denials**:
```json
{
  "permission_mode": "default",
  "verbose": true
}
```

Look for `permission_denials` in the response.

### Issue 4: Process Exits with Non-Zero Code

**Symptom**: "Claude Code exited with code 1"

**Causes**:
- Claude Code CLI error
- Invalid arguments
- Missing dependencies
- Authentication failure

**Solutions**:

**A) Test CLI directly**:
```bash
claude --version
claude --print "test"
```

**B) Check CLAUDE_CODE_PATH**:
```json
{
  "env": {
    "CLAUDE_CODE_PATH": "C:\\full\\path\\to\\claude.exe"
  }
}
```

**C) Review stderr in verbose mode**:
Enable DEBUG and check logs for stderr output.

### Issue 5: Tools Not Showing in Claude Desktop

**Symptom**: MCP server connects but no tools appear

**Causes**:
- Tool schema conversion failed
- Claude Desktop cache issue
- Server crashed during startup

**Solutions**:

**A) Restart Claude Desktop** (most common fix)

**B) Validate setup**:
```bash
claude-code-mcp validate
```

**C) Check server logs**:
Look for errors during tool registration in Claude Desktop logs.

**D) Test server manually**:
```bash
node build/index.js < test-input.json
```

Where test-input.json:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

## Debugging Workflow

### Step 1: Verify Basic Connectivity

```bash
# 1. Check Claude Code CLI
claude --version

# 2. Test bridge server
claude-code-mcp validate

# 3. Check Claude Desktop logs
# Windows: %APPDATA%\Claude\logs\mcp*.log
```

### Step 2: Enable Verbose Logging

1. Enable DEBUG in Claude Desktop config
2. Restart Claude Desktop
3. Try a simple task with `verbose: true`
4. Review logs for detailed execution trace

### Step 3: Isolate the Problem

Test each layer independently:

**Layer 1 - Claude Code CLI**:
```bash
claude --print --output-format stream-json "Test task"
```

**Layer 2 - Bridge Server**:
```bash
# Start server
DEBUG=true node build/index.js

# Send test request via STDIO
```

**Layer 3 - Claude Desktop**:
- Use execute_task with verbose mode
- Check MCP server status

### Step 4: Collect Diagnostic Information

When reporting issues, include:

1. **Version info**:
   ```bash
   claude --version
   node --version
   claude-code-mcp --version
   ```

2. **Verbose output** from execute_task with `verbose: true`

3. **Debug logs** from:
   - Bridge server (stderr when DEBUG=true)
   - Claude Desktop MCP logs

4. **Test results** from CLI:
   ```bash
   claude --print --output-format stream-json "What is 2+2?"
   ```

## Output Format Reference

### Successful Execution

```json
{
  "success": true,
  "sessionId": "sess_1234567890_abc123",
  "result": "The actual text response from Claude Code...",
  "cost": 0.05,
  "duration": 12000,
  "usage": {
    "input_tokens": 1000,
    "output_tokens": 500,
    "cache_read_input_tokens": 5000
  }
}
```

### With Verbose Diagnostics

```json
{
  "success": true,
  "result": "...",
  "diagnostics": {
    "stdoutLines": 45,
    "stderrLines": 0,
    "chunksReceived": 40,
    "sessionId": "sess_1234567890_abc123",
    "lastStdout": ["last", "10", "lines", "..."],
    "lastStderr": [],
    "chunkTypes": ["partial", "partial", "result"]
  },
  "allChunks": [
    {"type": "partial", "content": "..."},
    {"type": "result", "result": "...", "session_id": "..."}
  ]
}
```

### Failed Execution

```json
{
  "success": false,
  "error": "Detailed error message with context"
}
```

When exit code is 0 but no result:
```json
{
  "success": false,
  "error": {
    "message": "Claude Code exited successfully but no result was captured",
    "stdoutLines": 10,
    "stderrLines": 2,
    "chunksReceived": 8,
    "lastStdout": ["..."],
    "lastStderr": ["..."],
    "chunks": [{"type": "partial", "hasContent": true}]
  }
}
```

## FAQ

### Q: Why is the result field empty even though success is true?

The `result` field contains Claude Code's final text output. If it's empty:
1. Use `verbose: true` to see diagnostics
2. Check if `is_error: true` in the response
3. Review `permission_denials` - task may have been blocked

### Q: Can the bridge capture file outputs?

**No, the bridge captures text output only.** If Claude Code writes files:
- Files are written to disk
- The text summary/response is returned
- To access files, use Read tool after execution

### Q: How do I see real-time progress?

Set `stream_progress: true` (default):
```json
{
  "prompt": "Long running task",
  "stream_progress": true
}
```

Progress events are emitted but not currently surfaced to Claude Desktop. This is a feature for future versions.

### Q: What's the difference between result.result and result.subtype?

- `result.result`: The actual text output from Claude Code
- `result.subtype`: Success status ("success" or "error")
- `result.is_error`: Boolean flag for error state

### Q: Can I resume a failed session?

Not currently supported. Each tool call creates a new session. Future versions may support session resumption.

## Getting Help

If you've tried all troubleshooting steps:

1. **Collect diagnostic info** (see "Step 4" above)
2. **Create an issue**: https://github.com/MagicTurtle-s/claude-code-mcp-bridge/issues
3. **Include**:
   - Your setup (OS, Node version, Claude Code version)
   - Verbose output from a failed task
   - Debug logs
   - Steps to reproduce

## Related Documentation

- [README.md](./README.md) - Setup and usage
- [PROJECT.md](./PROJECT.md) - Project overview
- [.claude/context.md](./.claude/context.md) - Architecture details
- [Claude Code Docs](https://docs.claude.com/claude-code) - CLI documentation
