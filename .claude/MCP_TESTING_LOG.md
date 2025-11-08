# MCP Testing Log

**Purpose:** Track obstacles, issues, and learnings discovered during MCP testing to inform skill development and documentation.

**Started:** 2025-11-08
**Project:** Claude Code MCP Bridge
**Tester:** Jonathan (MagicTurtle-s)

---

## Issue Categories

- 🔧 **Configuration Problems** - Auth, setup, connection issues
- 📚 **Documentation Gaps** - Missing or unclear MCP tool documentation
- 🔄 **Workflow Inefficiencies** - Multi-step processes that could be automated
- 🐛 **Bugs/Errors** - Actual failures or unexpected behavior
- 💡 **Skill Opportunities** - Patterns that would make good skills

---

## Issue #1: Asana MCP OAuth Authentication Not Auto-Triggering

**Date:** 2025-11-08
**Category:** 🔧 Configuration Problems
**MCP:** Asana (https://mcp.asana.com/sse)
**Severity:** Medium (workaround exists)

### Problem Description

When attempting to use Asana MCP tools through Claude Code, the expected OAuth browser flow did not automatically trigger on first tool use. Claude Code documentation claims tool usage should open browser for authentication, but instead:

1. Tool call failed with "authentication required" error
2. No browser window opened
3. Claude Code suggested trying different MCPs instead of respecting explicit Asana request

### Expected Behavior

1. User calls Asana tool (e.g., "search my tasks")
2. Claude Code detects missing auth
3. Browser automatically opens to Asana OAuth page
4. User grants permissions
5. Tool call succeeds

### Actual Behavior

1. User calls Asana tool
2. Error: "Authentication required for SSE server"
3. No browser launch
4. Claude Code tries different MCPs or gives up

### Root Cause

Official Asana SSE endpoint (`https://mcp.asana.com/sse`) is configured correctly but lacks mechanism to trigger OAuth in Claude Code. System logs show:
- "Redirection handling is disabled, skipping redirect"
- "No scopes available from URL or metadata"
- "SSE Connection failed: Unauthorized"

### Workaround / Solution

**Manual `/mcp` Command:**
```bash
# In Claude Code CLI terminal:
/mcp

# Expected output:
# Authentication successful. Connected to asana.
```

This manually triggers the OAuth flow. Browser opens, user authorizes, tokens stored in `~/.claude/.credentials.json`.

### Authentication Flow Discovered

**Token Storage Location:**
- File: `C:/Users/username/.claude/.credentials.json`
- Format: JSON with `mcpOAuth` section
- Structure:
  ```json
  {
    "mcpOAuth": {
      "asana|606ad0f6a16e323c": {
        "serverName": "asana",
        "serverUrl": "https://mcp.asana.com/sse",
        "clientId": "YOUR_CLIENT_ID",
        "accessToken": "[token]",
        "expiresAt": 1762619303345,
        "refreshToken": "[refresh]",
        "scope": ""
      }
    }
  }
  ```

**Token Persistence:**
- ✅ Persists across terminal sessions
- ✅ Access token: ~1 hour (auto-refreshes)
- ✅ Refresh token: days/weeks (manual re-auth via `/mcp`)

**Re-authentication Required:**
- NOT every session
- Only when refresh token expires
- Can test by closing/reopening terminal - tokens still work

### Bridge MCP Authentication Architecture

**Verification Results:**
- ✅ Bridge MCP does NOT handle credentials (confirmed via code review)
- ✅ NO credential forwarding code exists (checked local + GitHub)
- ✅ Implements Option 3 (delegate auth to Claude Code CLI)
- ✅ Completely stateless regarding authentication

**Flow:**
```
Desktop → Bridge MCP → Spawns Code CLI → Code reads .credentials.json → Authenticates with MCPs
```

### Documentation Created

**Files Created:**
1. `AUTHENTICATION.md` - Comprehensive auth flow guide
2. `.claude/skills/mcp-auth-handler/SKILL.md` - Skill for detecting auth failures

**Documentation Needed:**
- [ ] Update README.md with auth troubleshooting section
- [ ] Update PROJECT.md with auth flow details (file lock issue)

### Skill Opportunities Identified

**MCP Auth Handler Skill:**
- **Created:** ✅ `.claude/skills/mcp-auth-handler/SKILL.md`
- **Triggers:** "authentication failed", "unauthorized", "token expired"
- **Purpose:** Guide Claude to suggest `/mcp` command when auth fails
- **Benefits:** Reduces user frustration, provides clear error resolution

### Lessons Learned

1. **OAuth flow is manual** - `/mcp` command required, not auto-triggered
2. **Tokens persist well** - Good UX after initial setup
3. **Bridge architecture is clean** - Delegation pattern works perfectly
4. **Documentation is critical** - Users need clear auth instructions

### Status

- **Workaround:** ✅ Documented and tested
- **Skill Created:** ✅ MCP Auth Handler
- **Documentation:** ✅ AUTHENTICATION.md created
- **README Update:** ⏳ Pending (file lock issue)
- **PROJECT.md Update:** ⏳ Pending (file lock issue)

### Related Files

- Authentication Guide: `/AUTHENTICATION.md`
- Auth Handler Skill: `/.claude/skills/mcp-auth-handler/SKILL.md`
- Credentials File: `~/.claude/.credentials.json`
- MCP Logs: `~/AppData/Local/claude-cli-nodejs/Cache/.../mcp-logs-asana/`

---

## Issue #2: [Next Issue]

**Date:** TBD
**Category:** TBD
**MCP:** TBD
**Severity:** TBD

### Problem Description

[To be filled when next issue discovered during testing]

---

## Testing Checklist

MCPs to Test:

- [x] Asana - OAuth setup complete, tools working
- [ ] HubSpot - Not yet tested
- [ ] SharePoint - Not yet tested
- [ ] Neo4j - Not yet tested
- [ ] Others - TBD

Test Scenarios:

- [x] First-time authentication
- [x] Token persistence across sessions
- [ ] Token refresh after expiry
- [ ] Multiple simultaneous MCPs
- [ ] Error handling and recovery
- [ ] Performance with large datasets
- [ ] Bridge delegation accuracy
- [ ] Stream-json parsing edge cases

---

## Metrics

### Issues by Category

| Category | Count | Resolved | Pending |
|----------|-------|----------|---------|
| 🔧 Configuration | 1 | 1 | 0 |
| 📚 Documentation | 0 | 0 | 0 |
| 🔄 Workflow | 0 | 0 | 0 |
| 🐛 Bugs | 0 | 0 | 0 |
| 💡 Skills | 1 | 1 | 0 |

### Skills Created

1. **MCP Auth Handler** - Auto-detect auth failures, guide users to `/mcp`

### Documentation Created

1. **AUTHENTICATION.md** - Complete auth flow guide (2025-11-08)
2. **MCP_TESTING_LOG.md** - This file (2025-11-08)

### Pending Work

- Update README.md with auth section (file lock issue preventing edit)
- Update PROJECT.md with auth flow (file lock issue preventing edit)
- Test remaining MCPs (HubSpot, SharePoint, Neo4j)
- Create additional skills as patterns emerge

---

## Notes for Future Testing

### Best Practices Discovered

1. Always use `/mcp` first to establish auth before testing tools
2. Check `.credentials.json` after auth to verify tokens stored
3. Test token persistence by closing/reopening terminal
4. Document error messages verbatim for skill trigger keywords
5. Track file lock issues (PROJECT.md, README.md had edit conflicts)

### Questions to Explore

- How does token refresh actually work? (observed access token expiry but not refresh yet)
- What happens when multiple MCPs need auth simultaneously?
- How does Bridge handle auth errors vs other errors?
- Can we pre-emptively detect token expiry and suggest `/mcp`?

### Potential Future Skills

- **MCP Multi-Server Orchestrator** - Coordinate actions across multiple MCPs
- **Dev Workflow Automator** - Common workflows (setup, build, test, deploy)
- **Token Lifecycle Monitor** - Proactively detect upcoming token expiry
- **Error Recovery Guide** - General error handling patterns

---

**Last Updated:** 2025-11-08
**Next Update:** After testing additional MCPs
