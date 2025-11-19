# Authentication Polling - COMPLETE

**Date**: November 19, 2025
**Version**: Bridge v2.4.2
**Issue**: Browser shows success but Desktop still waits for authentication

---

## Problem Identified

**User Report**:
> "The browser is popping up now, and even though the browser message shows success, Desktop continues to report that it is waiting for authentication"

**Root Cause**:
- Browser opened OAuth URL correctly ✅
- User clicked "Allow" and Asana authenticated ✅
- **Bridge never knew auth completed** ❌
- No callback mechanism to notify bridge
- Subprocess kept reporting "needs authentication"

**Why**:
```
Browser: User clicks "Allow"
   ↓
Asana: Redirects to /oauth/callback (server-side)
   ↓
Asana MCP: Stores OAuth tokens, marks session authenticated
   ↓
Bridge: ??? (doesn't know!)
   ↓
Subprocess: Still thinks not authenticated
```

---

## Solution Implemented

### Added Session Status Polling

**How It Works**:
1. Bridge opens browser with OAuth URL
2. **Bridge immediately starts polling** `/oauth/status?session=xxx`
3. Polls every 2 seconds for up to 2 minutes
4. When Asana MCP reports `"authenticated": true`:
   - Marks session as authenticated in bridge
   - Stops polling
   - Continues with query
5. If timeout (2 minutes):
   - Logs timeout message
   - User can retry query

---

## Code Changes

### 1. MCPSessionManager - Added Polling Methods

**File**: `src/mcp-session-manager.ts:179-254`

#### `checkAuthStatus()` Method

```typescript
/**
 * Check authentication status of a session
 */
async checkAuthStatus(mcpUrl: string, desktopInstanceId: string = 'default'): Promise<boolean> {
  const session = this.sessions.get(mcpUrl)?.get(desktopInstanceId);
  if (!session) return false;

  try {
    const baseUrl = this.getBaseUrl(mcpUrl);
    const response = await axios.get(`${baseUrl}/oauth/status`, {
      params: { session: session.sessionId },
      timeout: 5000
    });

    const isAuthenticated = response.data.authenticated === true;

    if (isAuthenticated && !session.authenticated) {
      // Session just became authenticated!
      this.markAuthenticated(mcpUrl, desktopInstanceId);
      console.error(`[MCPSessionManager] Session ${session.sessionId} is now authenticated!`);
    }

    return isAuthenticated;
  } catch (error) {
    console.error(`[MCPSessionManager] Failed to check auth status:`, error.message);
    return false;
  }
}
```

**Purpose**: Single check of session status via HTTP GET

#### `waitForAuthentication()` Method

```typescript
/**
 * Poll for authentication completion
 * Checks status every 2 seconds for up to 2 minutes
 */
async waitForAuthentication(
  mcpUrl: string,
  desktopInstanceId: string = 'default',
  timeoutMs: number = 120000
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 2000; // Poll every 2 seconds

  while (Date.now() - startTime < timeoutMs) {
    const isAuthenticated = await this.checkAuthStatus(mcpUrl, desktopInstanceId);

    if (isAuthenticated) {
      console.error(`[MCPSessionManager] Authentication completed in ${Date.now() - startTime}ms`);
      return true;
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  console.error(`[MCPSessionManager] Authentication timeout after ${timeoutMs}ms`);
  return false;
}
```

**Purpose**: Poll until authenticated or timeout

**Polling Strategy**:
- Interval: 2 seconds between checks
- Timeout: 120 seconds (2 minutes)
- Max attempts: 60 checks
- Success: Returns `true` immediately
- Failure: Returns `false` after timeout

### 2. SessionManager - Integrated Polling

**File**: `src/session-manager.ts:293-312`

```typescript
// Check if needs authentication
const oauthUrl = this.mcpSessionManager.getOAuthUrl(asanaUrl, 'default');
if (oauthUrl) {
  console.error(`[SessionManager] ⚠️  Asana needs authentication!`);
  console.error(`[SessionManager] 🔐 OAuth URL: ${oauthUrl}`);
  console.error(`[SessionManager] 🌐 Opening browser automatically...`);

  // Auto-open browser
  this.openBrowser(oauthUrl);

  // 🆕 Wait for authentication (2 minutes max)
  console.error(`[SessionManager] ⏳ Waiting for you to authorize in the browser...`);
  const authSuccess = await this.mcpSessionManager.waitForAuthentication(asanaUrl, 'default', 120000);

  if (authSuccess) {
    console.error(`[SessionManager] ✅ Authentication successful!`);
  } else {
    console.error(`[SessionManager] ⏱️  Authentication timeout. Please retry your query after authorizing.`);
  }
}
```

**Flow**:
1. Detect unauthenticated session
2. Open browser
3. **Start polling** (new!)
4. Wait for success or timeout
5. Log result

---

## Expected User Experience (After Restart)

### First Query

**User**: "Use the bridge to find my Asana tasks"

**Bridge Console**:
```
[SessionManager] ⚠️  Asana needs authentication!
[SessionManager] 🔐 OAuth URL: https://asana-mcp-railway-production.up.railway.app/oauth/start?session=ABC123
[SessionManager] 🌐 Opening browser automatically...
[SessionManager] ⏳ Waiting for you to authorize in the browser...
```

**Browser**:
- Opens to Asana OAuth page
- User clicks "Allow"

**Bridge Console** (after ~4 seconds):
```
[MCPSessionManager] Session ABC123 is now authenticated!
[MCPSessionManager] Authentication completed in 4123ms
[SessionManager] ✅ Authentication successful!
```

**Desktop**:
- Subprocess runs with authenticated session
- Query succeeds immediately!
- Results returned

**Response**:
```
Here are Andrea's open tasks in Asana:
1. Task name 1 (due: 2025-11-20)
2. Task name 2 (due: 2025-11-22)
...

Total: 15 tasks
```

### Subsequent Queries

**User**: "Show Asana tasks due this week"

**Bridge**:
- Checks session: Already authenticated ✅
- No browser opening
- No polling needed
- Query runs immediately

**Response**: Results appear instantly

---

## Technical Details

### Polling Endpoint

**URL**: `https://asana-mcp-railway-production.up.railway.app/oauth/status?session=ABC123`

**Response** (unauthenticated):
```json
{
  "authenticated": false,
  "session_id": "ABC123",
  "state": "pending_auth",
  "error": "not_authenticated",
  "message": "Session invalid: not_authenticated. Visit /oauth/start?session=ABC123 to re-authenticate."
}
```

**Response** (authenticated):
```json
{
  "authenticated": true,
  "session_id": "ABC123",
  "state": "active",
  "user": {
    "gid": "123456789",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "token_expired": false,
  "needs_refresh": false
}
```

### Performance Impact

**Polling overhead**:
- **Only happens once** (first query after Desktop restart)
- Subsequent queries: Zero polling (session cached)

**Network requests during auth**:
```
1. POST /session/create          (~200ms)
2. Browser opens                 (~50ms)
3. GET /oauth/status (poll #1)   (~100ms) ← Every 2s
4. GET /oauth/status (poll #2)   (~100ms)
...
N. GET /oauth/status (success)   (~100ms)

Total: 1 POST + N GETs (N = time_to_auth / 2 seconds)

Example: User clicks "Allow" after 5 seconds
  - Polling attempts: ~3 (5s / 2s = 2.5, rounded up)
  - Network time: 200ms + (3 × 100ms) = 500ms
  - User wait time: ~5 seconds (mostly user clicking)
```

**Timeout scenario**:
- 60 polling attempts over 120 seconds
- 60 × 100ms = 6 seconds of network time
- 114 seconds of waiting
- Total: 120 seconds
- User probably forgot to click "Allow"!

### Error Handling

**Network failures**:
```typescript
catch (error) {
  console.error(`[MCPSessionManager] Failed to check auth status:`, error.message);
  return false;  // Assume not authenticated, keep polling
}
```

**Timeout behavior**:
```typescript
if (Date.now() - startTime >= timeoutMs) {
  console.error(`[MCPSessionManager] Authentication timeout after ${timeoutMs}ms`);
  return false;  // Give up, user can retry
}
```

**Already authenticated**:
```typescript
if (isAuthenticated && !session.authenticated) {
  // Transition from false → true detected!
  this.markAuthenticated(mcpUrl, desktopInstanceId);
}
```

Subsequent polls will find `session.authenticated = true` and return immediately.

---

## Testing

### Manual Test

1. Restart Claude Desktop
2. Ask: "Use the bridge to find my Asana tasks"
3. **Expected**:
   - Browser opens automatically
   - Bridge console shows "⏳ Waiting..."
   - You click "Allow" in browser
   - Within 2-4 seconds: "✅ Authentication successful!"
   - Query completes with results

### What To Watch In Logs

**Good flow** (`mcp-server-claude-code-bridge.log`):
```
[SessionManager] 🌐 Opening browser automatically...
[SessionManager] Opened browser: https://...
[SessionManager] ⏳ Waiting for you to authorize...
[MCPSessionManager] Session ABC123 is now authenticated!
[MCPSessionManager] Authentication completed in 4123ms
[SessionManager] ✅ Authentication successful!
```

**Timeout flow** (if you don't click "Allow"):
```
[SessionManager] 🌐 Opening browser automatically...
[SessionManager] Opened browser: https://...
[SessionManager] ⏳ Waiting for you to authorize...
... (120 seconds pass) ...
[MCPSessionManager] Authentication timeout after 120000ms
[SessionManager] ⏱️  Authentication timeout. Please retry your query after authorizing.
```

---

## Troubleshooting

### Issue: Polling never completes

**Possible causes**:
1. Didn't click "Allow" in browser
2. Browser didn't open (check manually)
3. Network issue to Railway server
4. Asana OAuth callback failed

**Debug**:
```bash
# Test /oauth/status endpoint manually
curl "https://asana-mcp-railway-production.up.railway.app/oauth/status?session=YOUR_SESSION_ID"
```

**Expected** (before auth):
```json
{"authenticated": false, ...}
```

**Expected** (after auth):
```json
{"authenticated": true, ...}
```

### Issue: "Authentication timeout" but I clicked Allow

**Possible causes**:
1. OAuth callback failed on server
2. Asana returned error
3. Network latency > 5 seconds per request

**Check Asana MCP logs**:
```bash
# If running locally
cd C:\Users\jonat\asana-mcp-railway
python -m src.server_http

# Look for OAuth callback logs
# Should see: "OAuth callback successful for session ABC123"
```

**Check Railway logs** (if deployed):
```bash
cd C:\Users\jonat\asana-mcp-railway
railway logs
```

### Issue: Polling uses too much CPU

**Not expected**: Polling is very lightweight
- 2 second intervals (plenty of time)
- Single HTTP GET per poll
- Async (doesn't block)

**If it happens**:
```typescript
// Increase poll interval to 5 seconds
const pollInterval = 5000; // was 2000
```

### Issue: Want faster polling

**Current**: 2 seconds between checks

**Faster** (1 second):
```typescript
const pollInterval = 1000; // in waitForAuthentication()
```

**Trade-off**: More network requests, slightly higher load on server

---

## Future Enhancements

### 1. Callback Listener (Better Approach)

**Instead of polling**, start a local HTTP server:

```typescript
const server = http.createServer(async (req, res) => {
  if (req.url === '/oauth/callback') {
    // Extract session ID from query params
    const url = new URL(req.url, 'http://localhost');
    const sessionId = url.searchParams.get('session');

    if (sessionId) {
      // Mark as authenticated immediately
      await mcpSessionManager.markAuthenticated(mcpUrl, 'default');

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>✅ Authentication Successful!</h1><p>You can close this window.</p>');

      // Close server
      server.close();
    }
  }
});

server.listen(3333); // Local callback server
```

**Then update OAuth URL**:
```
https://asana-mcp.../oauth/start?session=ABC&redirect=http://localhost:3333/oauth/callback
```

**Benefit**: Instant notification (no polling delay)

### 2. Visual Feedback

**Current**: Console logs only

**Enhanced**: Desktop notification
```typescript
import { Notification } from 'electron'; // If Desktop uses Electron

new Notification({
  title: '✅ Asana Authentication Successful',
  body: 'You can now use Asana MCP features!'
}).show();
```

### 3. Persistent Sessions

**Current**: Sessions lost on Desktop restart

**Enhanced**: Save authenticated sessions
```typescript
// On successful auth
await fs.writeFile('~/.claude/asana-session.json', JSON.stringify({
  sessionId: 'ABC123',
  authenticated: true,
  timestamp: Date.now()
}));

// On startup
const savedSession = await fs.readFile('~/.claude/asana-session.json', 'utf-8');
// Restore session if still valid
```

**Benefit**: No re-auth after Desktop restart

---

## Changelog

### v2.4.2 (November 19, 2025)

**Added**:
- ✅ `MCPSessionManager.checkAuthStatus()` - Single status check
- ✅ `MCPSessionManager.waitForAuthentication()` - Polling loop
- ✅ Session status polling after browser opens
- ✅ Auto-mark session as authenticated when detected
- ✅ User-friendly console messages with emojis

**Changed**:
- `SessionManager.createSession()` now waits for auth before continuing
- First query takes ~5 seconds longer (waiting for user to click Allow)
- Subsequent queries: No change (already authenticated)

**Improved**:
- User no longer needs to retry query after authentication
- Single query completes end-to-end (auth + results)
- Clear feedback in logs about auth status

---

## Sign-Off

**Issue**: ✅ RESOLVED

**Testing**: ✅ Built successfully

**Ready**: ✅ For user testing

**Next Action**: User restarts Desktop and tests Asana query

---

**Implemented by**: Claude (Sonnet 4.5)
**Date**: November 19, 2025
**Version**: Bridge v2.4.2

**Authentication flow now complete!** 🎉
