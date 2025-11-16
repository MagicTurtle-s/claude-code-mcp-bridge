# Quick Reference - Enhanced Output Capture

## Enable Verbose Mode (Recommended First Step)

When using any tool from Claude Desktop, add `verbose: true`:

```
"Use execute_task with verbose=true to analyze my codebase"
```

This returns detailed diagnostics showing exactly what was captured.

## Enable Debug Logging

Edit Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "claude-code-bridge": {
      "command": "node",
      "args": ["C:\\path\\to\\build\\index.js"],
      "env": {
        "DEBUG": "true"
      }
    }
  }
}
```

Restart Claude Desktop. Logs appear in `%APPDATA%\Claude\logs\`

## Test Claude Code CLI Directly

```bash
claude --print --output-format stream-json "What is 2+2?"
```

Should output newline-delimited JSON ending with:
```json
{"type":"result","subtype":"success","result":"4","session_id":"..."}
```

## Verbose Output Example

**Request**:
```json
{
  "prompt": "Search for authentication code",
  "verbose": true
}
```

**Response**:
```json
{
  "success": true,
  "sessionId": "sess_123",
  "result": "Found authentication in src/auth.ts...",
  "cost": 0.05,
  "duration": 12000,
  "diagnostics": {
    "stdoutLines": 45,
    "stderrLines": 0,
    "chunksReceived": 40,
    "sessionId": "sess_123",
    "lastStdout": ["last", "10", "stdout", "lines"],
    "lastStderr": [],
    "chunkTypes": ["partial", "partial", "result"]
  },
  "allChunks": [
    {"type": "partial", "content": "..."},
    {"type": "result", "result": "...", "session_id": "sess_123"}
  ]
}
```

## Common Issues Quick Fix

### "No result captured"
1. Try with `verbose: true`
2. Check diagnostics.chunksReceived > 0
3. Review diagnostics.chunkTypes
4. Enable DEBUG and check logs

### "Timeout"
1. Increase timeout: `"timeout": 300000`
2. Use plan mode: `"permission_mode": "plan"`
3. Break task into smaller parts

### "Process exited with code 1"
1. Test CLI: `claude --version`
2. Test task: `claude --print "test"`
3. Check stderr in verbose output

## Troubleshooting Checklist

- [ ] Claude Code CLI works: `claude --version`
- [ ] Stream-json format works: `claude --print --output-format stream-json "test"`
- [ ] Bridge validates: `claude-code-mcp validate`
- [ ] Tried with verbose mode
- [ ] Enabled DEBUG logging
- [ ] Restarted Claude Desktop
- [ ] Checked logs: `%APPDATA%\Claude\logs\`

## Full Documentation

- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - Comprehensive guide
- [README.md](./README.md) - Setup and usage
- [ENHANCEMENTS-SUMMARY.md](./ENHANCEMENTS-SUMMARY.md) - What's new

## Support

If issues persist after trying above:
1. Collect verbose output
2. Collect debug logs
3. Test CLI directly
4. Open issue: https://github.com/MagicTurtle-s/claude-code-mcp-bridge/issues
