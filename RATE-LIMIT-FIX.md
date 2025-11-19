# Rate Limit Issue & Fix

**Date**: November 19, 2025
**Issue**: "rate_limited" error after repeated authentication attempts
**Status**: FIXED ✅

---

## What Happened

While testing the session persistence feature, the bridge was repeatedly opening the browser for OAuth authentication on every query, even within the same Desktop session. This triggered the server's rate limit circuit breaker:

```json
{
  "error": "rate_limited",
  "description": "Too many authentication attempts. Please wait before trying again.",
  "retry_after": 600
}
```

**Server Rate Limit**: 3 authentication attempts per 10-minute window

---

## Root Cause

The `checkAuthStatus()` method in `mcp-session-manager.ts` was **always calling the server** to check authentication status, even when the session was already marked as authenticated locally.

### Flow Before Fix

```
Query 1:
  ↓
checkAuthStatus() → Call server /oauth/status
  ↓
Server returns: authenticated = true
  ↓
Mark session.authenticated = true
  ↓
Query executes

Query 2 (same session):
  ↓
checkAuthStatus() → Call server /oauth/status AGAIN! ❌
  ↓
Server might return false temporarily (race condition)
  ↓
Open browser AGAIN ❌
  ↓
Increment rate limit counter
  ↓
After 3 queries → RATE LIMITED ❌
```

---

## The Fix

Added a fast-path check to trust the local `session.authenticated` flag before making server calls:

```typescript
// Before (mcp-session-manager.ts:221-253)
async checkAuthStatus(mcpUrl: string, desktopInstanceId: string = 'default'): Promise<boolean> {
  const session = mcpSessions.get(desktopInstanceId);
  if (!session) return false;

  // Always called server on every query ❌
  const response = await axios.get(`${baseUrl}/oauth/status`, {
    params: { session: session.sessionId }
  });

  return response.data.authenticated === true;
}

// After (with fix)
async checkAuthStatus(mcpUrl: string, desktopInstanceId: string = 'default'): Promise<boolean> {
  const session = mcpSessions.get(desktopInstanceId);
  if (!session) return false;

  // Check local flag first! ✅
  if (session.authenticated) {
    if (this.debug) {
      console.error(`[MCPSessionManager] Session ${session.sessionId} already authenticated (cached)`);
    }
    return true;
  }

  // Only call server if not cached
  const response = await axios.get(`${baseUrl}/oauth/status`, {
    params: { session: session.sessionId }
  });

  const isAuthenticated = response.data.authenticated === true;

  if (isAuthenticated) {
    this.markAuthenticated(mcpUrl, desktopInstanceId); // Cache it!
  }

  return isAuthenticated;
}
```

---

## Expected Behavior After Fix

**Same Desktop Session:**
1. **Query 1**: checkAuthStatus() → Server call → authenticated → Cache flag
2. **Query 2**: checkAuthStatus() → Local check ✅ → Skip server call
3. **Query 3**: checkAuthStatus() → Local check ✅ → Skip server call
4. **No rate limit!** ✅

**After Desktop Restart:**
1. Load session from file
2. Validate with server (one-time check)
3. All subsequent queries use cached flag

---

## How to Reset Rate Limit

If you hit the rate limit during testing:

### Option 1: Use Reset Script (Recommended)

```bash
cd /c/Users/jonat/claude-code-mcp-bridge
node reset-sessions.js
```

This script:
- Revokes sessions on server (clears rate limit)
- Deletes local session file
- Prepares for fresh authentication

### Option 2: Manual Reset

```bash
# Delete local session file
rm "%APPDATA%\Claude\.claude-mcp-sessions.json"

# Restart Claude Desktop
# (Right-click system tray icon → Quit → Reopen)
```

### Option 3: Wait 10 Minutes

The rate limit window automatically expires after 10 minutes.

---

## Server-Side Rate Limit Details

**Implementation**: `src/session_manager.py` (lines 18-29)

```python
class ReAuthAttempt:
    """Track re-authentication attempts for circuit breaker"""
    timestamp: float
    count: int = 1

    def should_allow(self, max_attempts: int = 3, window_seconds: int = 600) -> bool:
        """Check if re-auth should be allowed based on circuit breaker"""
        age = time.time() - self.timestamp
        if age > window_seconds:
            # Reset counter if outside window
            self.count = 0
            return True
        return self.count < max_attempts  # Max 3 attempts per 10 min
```

**Limits:**
- Max attempts: 3
- Time window: 600 seconds (10 minutes)
- Per session tracking (not global)

**Purpose:**
- Prevent brute force OAuth attacks
- Protect against infinite auth loops
- Limit server load from misconfigured clients

---

## Testing After Fix

### Step 1: Reset Sessions

```bash
node reset-sessions.js
```

### Step 2: Restart Claude Desktop

Close and reopen to load the new bridge build.

### Step 3: First Query

```
Query: "Find Andrea's tasks in Asana"
Expected: Browser opens for OAuth
Action: Click "Allow"
Expected: Query executes successfully
```

### Step 4: Second Query (Critical Test)

```
Query: "Show Andrea's tasks due this week"
Expected: NO browser popup ✅
Expected: Query executes immediately
```

### Step 5: Third Query

```
Query: "How many tasks does Andrea have?"
Expected: NO browser popup ✅
Expected: Query executes immediately
```

**Success Criteria**: Browser opens only ONCE (first query), never again in the same session.

---

## Logs to Verify Fix

### Before Fix (Browser Spam)

```
[MCPSessionManager] Reusing existing session for ...: AV-ggIZ...
[SessionManager] ⚠️  Asana needs authentication!  ← WRONG!
[SessionManager] 🌐 Opening browser automatically...
[MCPSessionManager] Authentication completed in 190ms

[Query 2]
[MCPSessionManager] Reusing existing session for ...: AV-ggIZ...
[SessionManager] ⚠️  Asana needs authentication!  ← STILL WRONG!
[SessionManager] 🌐 Opening browser automatically...
```

### After Fix (Proper Caching)

```
[MCPSessionManager] Reusing existing session for ...: AV-ggIZ...
[MCPSessionManager] Session AV-ggIZ... already authenticated (cached)  ← CORRECT!
[SessionManager] ✅ Session already authenticated - reusing existing session

[Query 2]
[MCPSessionManager] Reusing existing session for ...: AV-ggIZ...
[MCPSessionManager] Session AV-ggIZ... already authenticated (cached)  ← CORRECT!
[SessionManager] ✅ Session already authenticated - reusing existing session
```

---

## Related Files

- **Fix applied**: `src/mcp-session-manager.ts` (lines 228-235)
- **Reset utility**: `reset-sessions.js`
- **Server rate limit**: `asana-mcp-railway/src/session_manager.py` (lines 18-29)
- **Session persistence**: `SESSION-PERSISTENCE.md`

---

## Production Implications

### For Multi-User Rollout

**Good News:**
- Fix prevents users from hitting rate limits during normal usage
- Session caching reduces server load
- Better performance (no server calls on every query)

**Monitoring Recommendations:**
- Track rate limit errors in production logs
- Alert if any user hits rate limit (indicates bug)
- Monitor session reuse rate (should be >95%)

### Admin Tools Needed

Consider adding:
- Admin endpoint to reset rate limits for specific users
- Dashboard showing rate limit status per session
- Automated session cleanup for departed users

---

## Troubleshooting

### User Reports: "Rate limited" Error

**Diagnosis:**
```bash
# Check session file
cat "%APPDATA%\Claude\.claude-mcp-sessions.json"

# Check if session is valid
curl -X POST https://asana-mcp-railway-production.up.railway.app/session/validate \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID_HERE"}'
```

**Resolution:**
1. Run `node reset-sessions.js`
2. Restart Claude Desktop
3. User authenticates once
4. Monitor for repeat issues

**If issue persists:**
- Check bridge logs for repeated "Opening browser" messages
- Verify fix is deployed (check line 228-235 in mcp-session-manager.ts)
- Check server logs for authentication pattern

---

## Version History

### v2.7.1 (November 19, 2025) - CURRENT

**Fixed:**
- ❌ Browser opening on every query (same session)
- ❌ Rate limit errors from repeated auth attempts
- ✅ Cached authentication check (skip server calls)

### v2.7.0 (November 19, 2025)

**Added:**
- Session persistence to filesystem
- Validation on startup
- But had browser spam bug ❌

---

**Implemented by**: Claude (Sonnet 4.5)
**Date**: November 19, 2025
**Build**: v2.7.1

**Browser now opens only once per session!** 🎯
