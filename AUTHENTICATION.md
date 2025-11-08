# Authentication & Credential Flow

## Overview

The Bridge MCP implements a **delegation pattern** for authentication - it does NOT handle credentials directly. This document explains how authentication works when using the Bridge to access MCP servers like Asana, HubSpot, SharePoint, and Neo4j.

## Architecture

### Flow Diagram

```
Claude Desktop
    ↓ (calls execute_task tool)
Bridge MCP Server
    ↓ (spawns subprocess)
Claude Code CLI
    ↓ (reads credentials)
~/.claude/.credentials.json
    ↓ (authenticates)
MCP Servers (Asana, HubSpot, etc.)
    ↓ (returns results)
Claude Code CLI
    ↓ (stream-json output)
Bridge MCP Server
    ↓ (forwards results)
Claude Desktop
```

### How It Works

1. **Bridge Spawns Code CLI**
   - Bridge MCP spawns Claude Code CLI as a subprocess
   - No credentials are passed as arguments or environment variables
   - Code CLI inherits the user's environment (HOME, PATH, etc.)

2. **Code CLI Reads Credentials**
   - Code reads its own credential file: `~/.claude/.credentials.json`
   - This file contains OAuth tokens for all configured MCP servers
   - Tokens are organized under the `mcpOAuth` section

3. **Code Authenticates with MCPs**
   - Code uses stored tokens to authenticate with MCP servers
   - If token is expired, Code automatically refreshes using refresh token
   - All MCP interactions happen within the Code CLI process

4. **Results Flow Back**
   - Code formats results as streaming JSON (`--output-format stream-json`)
   - Bridge parses the JSON stream and forwards to Desktop
   - Desktop displays results to user

## Benefits of This Approach

### ✅ Security

- **No credential duplication** - Single source of truth in `.credentials.json`
- **No token forwarding** - Bridge never sees or touches sensitive tokens
- **No authentication code in Bridge** - Reduces attack surface

### ✅ Simplicity

- **Stateless bridge** - No credential storage or management logic
- **Leverages existing auth** - Code CLI's OAuth flow already works
- **Zero config** - Users authenticate once with `/mcp` command

### ✅ Reliability

- **Auto token refresh** - Code's built-in refresh logic works unchanged
- **Persistent tokens** - Credentials survive terminal/Desktop restarts
- **Standard OAuth 2.0** - Uses industry-standard authentication

## Credential Storage

### File Location

**Windows:**
```
C:/Users/username/.claude/.credentials.json
```

**macOS/Linux:**
```
~/.claude/.credentials.json
```

### File Format

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1762644393549,
    "scopes": ["user:inference", "user:profile"],
    "subscriptionType": "max"
  },
  "mcpOAuth": {
    "asana|606ad0f6a16e323c": {
      "serverName": "asana",
      "serverUrl": "https://mcp.asana.com/sse",
      "clientId": "YOUR_CLIENT_ID",
      "accessToken": "YOUR_USER_ID:YOUR_TOKEN_PREFIX:[token]",
      "expiresAt": 1762619303345,
      "refreshToken": "YOUR_USER_ID:YOUR_TOKEN_PREFIX:[refresh]",
      "scope": ""
    },
    "hubspot|...": { ... },
    "sharepoint|...": { ... }
  }
}
```

### Token Lifecycle

| Token Type | Lifespan | Auto-Refresh? | Re-auth Required? |
|------------|----------|---------------|-------------------|
| Access Token | ~1 hour | Yes (via refresh token) | Only if refresh token expires |
| Refresh Token | Days/weeks | No | Yes, via `/mcp` command |
| Claude AI Token | ~8 hours | Yes | Yes, via browser OAuth |

## Authentication Workflow

### Initial Setup (First Time)

1. User installs Bridge MCP in Claude Desktop
2. User tries to use an MCP tool (e.g., "Search my Asana tasks")
3. Code CLI detects missing authentication
4. User runs `/mcp` command in Claude Code terminal
5. Browser opens for OAuth authorization
6. User grants permissions
7. Code stores tokens in `.credentials.json`
8. Future requests work automatically

### Subsequent Usage

1. User makes request through Bridge MCP
2. Code CLI reads stored tokens
3. If token is valid → use it immediately
4. If token is expired → auto-refresh using refresh token
5. If refresh token is expired → return auth error (user must run `/mcp`)

## Troubleshooting

### Problem: "Authentication failed" or "Unauthorized" Error

**Symptoms:**
- MCP tools return 401/403 errors
- Code CLI reports "Token expired without refresh token"
- Error: "Authentication required for SSE server"

**Solution:**
```bash
# In Claude Code CLI terminal:
/mcp

# Browser will open for OAuth authorization
# Grant permissions
# Tokens are automatically saved
```

**Why this happens:**
- Initial setup: No tokens exist yet
- Token expiration: Both access and refresh tokens expired
- Revoked access: User revoked app permissions in MCP provider settings

### Problem: OAuth Browser Doesn't Open

**Symptoms:**
- `/mcp` command runs but browser doesn't launch
- Stuck at "Waiting for OAuth authorization..."

**Solution:**
1. Check if browser is set as default application
2. Manually navigate to OAuth URL (if provided in terminal)
3. Ensure no popup blockers are interfering
4. Try different browser

### Problem: Multiple Users / Workspaces

**Symptoms:**
- Tokens don't work across different machines
- Different workspaces need separate authentication

**Explanation:**
- `.credentials.json` is local to each machine
- Each user/machine needs independent OAuth flow
- Tokens are not synced across devices

**Solution:**
- Run `/mcp` on each machine independently
- Consider using Railway-deployed MCPs with session-based auth for multi-user scenarios

## Security Considerations

### What the Bridge CAN Do

✅ Spawn Claude Code CLI subprocess
✅ Pass prompts and tool parameters
✅ Receive and forward results
✅ Monitor subprocess lifecycle

### What the Bridge CANNOT Do

❌ Read `.credentials.json`
❌ Access OAuth tokens
❌ Forward authentication headers
❌ Modify or store credentials
❌ Intercept MCP communications

### Best Practices

1. **Keep Bridge Updated** - Security fixes are distributed via NPM
2. **Protect `.credentials.json`** - File contains sensitive tokens
3. **Use HTTPS** - All MCP servers should use secure connections
4. **Revoke Access** - If compromised, revoke app access in MCP provider settings
5. **Monitor Logs** - Check Bridge and Code logs for suspicious activity

## Advanced: Session-Based Authentication

For production deployments or multi-user scenarios, consider using session-based authentication with Railway-deployed MCP servers:

### Asana MCP Railway Example

```
Desktop → Bridge → Code CLI → Asana MCP Railway (HTTP)
                               ↓
                          Session-based auth
                               ↓
                          Per-user tokens stored in Redis
```

**Advantages:**
- Multi-user support
- Centralized token management
- Circuit breaker prevents auth loops
- Better observability and monitoring

**See:** `/path/to/your/asana-mcp-railway/SESSION-AUTH.md`

## FAQ

**Q: Do I need to authenticate every session?**
A: No. Tokens persist across terminal/Desktop restarts until they expire.

**Q: How long do tokens last?**
A: Access tokens: ~1 hour (auto-refresh). Refresh tokens: days/weeks (manual `/mcp` re-auth).

**Q: Can I share tokens across machines?**
A: Not recommended for security. Each machine should run `/mcp` independently.

**Q: Does Bridge store any credentials?**
A: No. Bridge is completely stateless regarding authentication.

**Q: What if I revoke access in Asana/HubSpot?**
A: Run `/mcp` to re-authorize and get new tokens.

**Q: Can I use custom OAuth apps?**
A: Yes, if your MCP server supports custom client IDs/secrets (e.g., Railway deployments).

## Related Documentation

- **Bridge MCP Setup**: `README.md`
- **Project Overview**: `PROJECT.md`
- **Troubleshooting**: `TROUBLESHOOTING.md`
- **Session-Based Auth**: `asana-mcp-railway/SESSION-AUTH.md`

## References

- [Claude Code CLI Docs](https://docs.claude.com/claude-code)
- [MCP Protocol Spec](https://github.com/anthropics/mcp)
- [OAuth 2.0 RFC](https://datatracker.ietf.org/doc/html/rfc6749)

---

**Last Updated**: 2025-11-08
**Version**: 1.0.0
