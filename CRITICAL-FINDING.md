# CRITICAL FINDING - UI Launching Despite --print Flag

## The Smoking Gun

**Your stderr output:**
```
[27036:1102/124859.264:ERROR:net\\disk_cache\\cache_util_win.cc:20] Unable to move the cache
[27036:1102/124859.274:ERROR:gpu\\ipc\\host\\gpu_disk_cache.cc:723] Gpu Cache Creation failed
```

These are **Chromium/Electron errors**. This means:
- Claude Code's **UI/Electron app is launching**
- NOT running in headless `--print` mode
- The `--print` flag is either not being passed or not working

## Why This Breaks Everything

**UI mode vs CLI mode:**
- UI mode: Electron app, no stdout JSON
- CLI mode (`--print`): Headless, outputs JSON to stdout

**Bridge expects:** JSON on stdout
**UI mode gives:** Chromium initialization, no JSON
**Result:** 0 chunks captured

## Why --print Isn't Working

**Possible causes:**

### 1. Arguments Not Being Passed Correctly

The bridge builds: `['--print', '--verbose', '--output-format', 'stream-json', 'prompt']`

But `spawn('claude', args)` might fail if:
- `claude` resolves to wrong executable
- Windows quoting issues
- Args concatenated incorrectly

### 2. claude.exe Ignores --print in Some Contexts

The 135MB `claude.exe` is likely the full Electron app.

It might:
- Check if spawned from certain contexts
- Require specific environment to enable `--print`
- Have a bug where `--print` doesn't work when spawned from Node.js

### 3. PATH Resolution Issue

When Claude Desktop spawns Node, it might:
- Have different PATH
- Resolve `claude` to different executable
- Not find `claude` at all, falling back to UI

## The Fix

### Solution 1: Use Full Path (DONE)

Updated config to:
```json
{
  "CLAUDE_CODE_PATH": "C:\\Users\\jonat\\.local\\bin\\claude.exe"
}
```

This ensures we're calling the right executable.

### Solution 2: Check If --print Actually Works

Test if the exe respects --print:
```bash
"C:\Users\jonat\.local\bin\claude.exe" --print --verbose --output-format stream-json "test"
```

If this launches UI anyway, then `claude.exe` has a bug.

### Solution 3: Alternative Executable

Check if there's a separate CLI binary:
- `claude-cli.exe`
- `claude-headless.exe`
- Or need to use Node wrapper instead

## Why Our Tests Worked

**In our tests:**
- We run from bash/terminal
- PATH is fully set up
- `claude` resolves correctly
- Environment is complete

**From Claude Desktop:**
- Limited PATH
- Limited environment
- Different working directory
- Electron security restrictions

## Immediate Action for Claude Desktop

**Tell Claude Desktop:**

1. **Restart after config change**
   - Full path now specified
   - Should resolve to correct exe

2. **Check if UI still appears**
   - If yes: `claude.exe` not respecting `--print`
   - If no: Check for different errors

3. **Test executable directly**
   ```bash
   "C:\Users\jonat\.local\bin\claude.exe" --print --verbose --output-format stream-json "test"
   ```
   - Does this launch UI or output JSON?
   - If UI: The executable itself has an issue
   - If JSON: Path resolution was the problem

## Next Debug Step

**If UI still appears after using full path:**

The problem is `claude.exe` itself not respecting `--print` when spawned from Node.js/Desktop.

**Possible fixes:**
1. Find alternative CLI executable
2. Add more environment variables claude.exe might need
3. Check Claude Code documentation for spawning requirements
4. File bug with Claude Code team

## Summary

✅ **Found root cause:** UI launching instead of CLI mode
✅ **Applied fix:** Full path in config
⏳ **Waiting:** For Claude Desktop to restart and test

**Expected after restart:**
- No Chromium errors
- `[ClaudeCodeExecutor]` debug logs appear
- JSON chunks received
- Result captured

**If still fails:**
- Issue is with `claude.exe` itself
- Need alternative approach

---

**Status**: Waiting for Claude Desktop to test with full path configuration
