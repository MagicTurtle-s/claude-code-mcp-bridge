---
name: mcp-auth-handler
description: Detect MCP authentication failures and guide users through OAuth setup. Triggers on "authentication failed", "unauthorized", "token expired", or "MCP not authenticated" errors. Provides step-by-step troubleshooting for OAuth token management.
---

# MCP Authentication Handler

## What This Skill Does

This skill helps Claude detect and resolve MCP server authentication failures when using the Claude Code MCP Bridge. It provides step-by-step guidance for OAuth authentication and token management.

## When to Use This Skill

Activate this skill when you encounter any of these scenarios:

### Error Messages
- "authentication failed"
- "unauthorized" (401/403 HTTP errors)
- "token expired"
- "MCP not authenticated"
- "Authentication required for SSE server"
- "Token expired without refresh token"
- "No scopes available from URL or metadata"

### User Requests
- "MCP isn't working"
- "Can't access Asana/HubSpot/SharePoint"
- "OAuth not working"
- "How do I authenticate with MCPs?"

### Symptoms
- MCP tools return auth errors instead of data
- First-time setup of new MCP server
- Re-authentication needed after token expiry

## How Authentication Works

### Bridge MCP Architecture

```
Claude Desktop → Bridge MCP → Claude Code CLI → .credentials.json → MCP Servers
```

**Key Points:**
1. Bridge MCP does NOT handle credentials
2. Claude Code CLI manages all authentication
3. Tokens stored in `~/.claude/.credentials.json`
4. OAuth flow triggered via `/mcp` command

### Token Lifecycle

| Token Type | Lifespan | Auto-Refresh? |
|------------|----------|---------------|
| Access Token | ~1 hour | ✅ Yes (via refresh token) |
| Refresh Token | Days/weeks | ❌ No (manual `/mcp`) |

## Step-by-Step Troubleshooting

### Step 1: Identify the Problem

**Check error message:**
- Does it mention "auth", "unauthorized", or "token"?
- Which MCP server is affected? (Asana, HubSpot, SharePoint, Neo4j)
- Is this first-time setup or re-authentication?

**Example Error:**
```
Error: The Asana MCP server needs authentication.
Authentication required for SSE server.
```

### Step 2: Run `/mcp` Command

**Action:**
```bash
# In Claude Code CLI terminal:
/mcp
```

**What Happens:**
1. Command detects which MCPs need authentication
2. Browser opens for OAuth authorization
3. User grants permissions
4. Tokens automatically saved to `.credentials.json`
5. Confirmation message appears

**Expected Output:**
```
Authentication successful. Connected to asana.
```

### Step 3: Verify Token Storage

**Location:**
- Windows: `C:/Users/username/.claude/.credentials.json`
- macOS/Linux: `~/.claude/.credentials.json`

**Check File:**
- File should contain `mcpOAuth` section
- Each MCP server has entry with `accessToken` and `refreshToken`
- `expiresAt` timestamp shows when token expires

**Example Structure:**
```json
{
  "mcpOAuth": {
    "asana|606ad0f6a16e323c": {
      "serverName": "asana",
      "accessToken": "...",
      "refreshToken": "...",
      "expiresAt": 1762619303345
    }
  }
}
```

### Step 4: Test Authentication

**Retry Original Request:**
- Close and reopen Claude Desktop (if using Bridge)
- Try the MCP tool again
- Should work without re-authentication

**If Still Failing:**
- Check token expiry timestamp
- Verify browser OAuth completed successfully
- Look for typos in MCP server name/URL
- Check MCP server configuration in Claude Code

## Common Scenarios

### Scenario 1: First-Time Setup

**User Request:** "Search my Asana tasks"
**Error:** "Authentication required for SSE server"

**Solution:**
1. Explain: "The Asana MCP needs OAuth authentication first"
2. Guide: "Run `/mcp` in your Claude Code terminal"
3. Wait: "Browser will open for authorization"
4. Confirm: "After granting access, try your request again"

### Scenario 2: Token Expired

**User Request:** "Get HubSpot contacts"
**Error:** "Token expired without refresh token"

**Solution:**
1. Explain: "Both access and refresh tokens have expired"
2. Guide: "Run `/mcp` to get new tokens"
3. Note: "This happens after days/weeks of inactivity"

### Scenario 3: Multiple MCPs Need Auth

**User Request:** "Search Asana and HubSpot"
**Error:** Multiple auth failures

**Solution:**
1. Run `/mcp` once (handles all MCPs)
2. Authenticate each MCP in browser (multiple tabs may open)
3. Grant permissions for all
4. Retry original request

### Scenario 4: OAuth Browser Doesn't Open

**User Request:** "Tried `/mcp` but browser didn't open"

**Solution:**
1. Check default browser settings
2. Look for OAuth URL in terminal output
3. Manually copy URL to browser
4. Check for popup blockers
5. Try different browser

## Error Handling

### If `/mcp` Fails

**Check:**
1. Claude Code CLI is up to date
2. Internet connection is working
3. MCP server URL is correct
4. MCP server is online (for custom deployments)

**Debug:**
```bash
# Enable debug mode
DEBUG=true claude

# Check MCP configuration
claude mcp list

# Verify specific MCP
claude mcp inspect asana
```

### If Tokens Don't Persist

**Check:**
1. `.credentials.json` file permissions (should be user-writable)
2. Disk space available
3. No file system errors
4. Not running in read-only environment

**Fix:**
```bash
# Check file exists and is writable
ls -la ~/.claude/.credentials.json

# Ensure correct permissions (Unix)
chmod 600 ~/.claude/.credentials.json
```

### If OAuth Keeps Failing

**Common Causes:**
1. App permissions revoked in MCP provider settings
2. MCP server configuration changed
3. Client ID/secret mismatch (custom deployments)
4. Network/firewall blocking OAuth redirects

**Solutions:**
1. Check MCP provider console (Asana, HubSpot, etc.)
2. Verify app is authorized
3. Re-create OAuth app if needed (custom deployments)
4. Check firewall/proxy settings

## Key Talking Points

When guiding users, emphasize:

### Security & Privacy
- "Bridge MCP never sees your credentials - they're managed by Claude Code CLI"
- "Tokens are stored locally in your `.credentials.json` file"
- "Each OAuth app only gets permissions you explicitly grant"

### Token Management
- "Access tokens auto-refresh for about an hour"
- "Refresh tokens last days/weeks before needing re-auth"
- "You only need to run `/mcp` when tokens fully expire"

### Best Practices
- "Authenticate once per machine (tokens don't sync across devices)"
- "If you revoke access, run `/mcp` again to re-authorize"
- "Keep Claude Code CLI updated for latest OAuth improvements"

## Advanced: Railway-Deployed MCPs

For production or multi-user scenarios, mention session-based authentication:

**Benefits:**
- Per-user token isolation
- Centralized credential management
- Circuit breaker prevents auth loops
- Better monitoring and observability

**Example:**
"For team environments, consider deploying MCPs to Railway with session-based auth. See `asana-mcp-railway/SESSION-AUTH.md` for details."

## Quick Reference

### Authentication Flow Checklist

- [ ] User encounters auth error
- [ ] Explain OAuth is needed
- [ ] Guide user to run `/mcp`
- [ ] Wait for browser OAuth completion
- [ ] Verify token stored in `.credentials.json`
- [ ] Retry original request
- [ ] Confirm success

### Commands to Know

```bash
# Authenticate with MCPs
/mcp

# List configured MCPs
claude mcp list

# Check specific MCP details
claude mcp inspect [mcp-name]

# Debug mode
DEBUG=true claude

# Check credentials file
cat ~/.claude/.credentials.json
```

### File Locations

**Windows:**
- Credentials: `C:/Users/username/.claude/.credentials.json`
- Config: `%APPDATA%\Claude\claude_desktop_config.json`

**macOS/Linux:**
- Credentials: `~/.claude/.credentials.json`
- Config: `~/.config/Claude/claude_desktop_config.json`

## Related Documentation

- **Authentication Guide**: `../../../AUTHENTICATION.md`
- **Bridge Setup**: `../../../README.md`
- **Project Overview**: `../../../PROJECT.md`
- **Session Auth**: `~/asana-mcp-railway/SESSION-AUTH.md`

## Examples

### Example 1: First-Time Asana Setup

**User:** "Can you search my Asana tasks for project Alpha?"

**Claude (detecting auth error):**
"I see the Asana MCP needs authentication first. Here's what to do:

1. Run this command in your Claude Code terminal:
   ```
   /mcp
   ```

2. Your browser will open for Asana OAuth authorization

3. Grant the requested permissions

4. Once you see 'Authentication successful', I can search your tasks

Try the command now, and let me know when you've completed the authorization!"

### Example 2: Token Expired

**User:** "Why isn't HubSpot working anymore? It worked yesterday."

**Claude (detecting expired token):**
"It looks like your HubSpot OAuth token has expired. This happens after about a week of inactivity.

To fix it:
1. Run `/mcp` in Claude Code
2. Re-authorize HubSpot in the browser
3. Try your HubSpot request again

Your previous data and settings are safe - this is just a security refresh. Let me know once you've re-authenticated!"

### Example 3: Multiple MCPs

**User:** "I need data from both Asana and SharePoint."

**Claude (detecting multiple auth needs):**
"I'll need OAuth authorization for both Asana and SharePoint. Here's the process:

1. Run `/mcp` - this handles both at once
2. Your browser may open multiple tabs (one per service)
3. Grant permissions for both
4. Wait for confirmation messages

Once authenticated, I can access both services seamlessly. Ready to authenticate?"

## Notes for Claude

- Always check error messages for auth-related keywords before using complex solutions
- Prefer `/mcp` command over manual token management
- Explain the delegation pattern (Bridge → Code → MCPs) when users ask about security
- Don't attempt to read or modify `.credentials.json` directly
- If `/mcp` fails repeatedly, escalate to checking MCP server configuration
- Remember: authentication is per-machine, not per-Claude-Desktop-session

---

**Skill Version**: 1.0.0
**Last Updated**: 2025-11-08
**Maintainer**: MagicTurtle-s
