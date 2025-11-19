# Railway SSE MCP Debugging Guide - CORRECTED

**Date**: November 19, 2025
**Status**: ✅ SSE transport works correctly in Claude Code v2.0.45

---

## ⚠️ CORRECTION TO PREVIOUS VERSION

The previous version of this document incorrectly stated that "Claude Code CLI v2.0.45 has multiple bugs with SSE transport."

**This was wrong.**

The actual issue was **incomplete Railway MCP server deployment** - the SSE endpoint was not implemented.

---

## TL;DR

**Problem**: Railway-deployed MCP servers showed as "failed" in Claude Code.

**Root Cause**: Railway servers were missing the `/sse` endpoint implementation (returned 404).

**Solution**: Add proper SSE transport endpoints to Railway servers.

**Result**: ✅ SSE works perfectly in Claude Code v2.0.45 once servers are properly configured.

---

## Quick Diagnosis (Updated)

### Step 1: Test Railway Endpoint Health

```bash
curl https://your-mcp-server.up.railway.app/health

# ✅ Expected: {"status":"ok",...}
# ❌ If 404: Server is down - check Railway dashboard
```

### Step 2: Test SSE Endpoint Specifically

```bash
curl -N https://your-mcp-server.up.railway.app/sse \
  -H "Accept: text/event-stream" --max-time 3

# ✅ Expected:
# event: endpoint
# data: /messages/?session_id=...

# ❌ If 404: SSE endpoint not implemented
# ❌ If "Not Found": Wrong URL or route not mounted
```

### Step 3: Check Server Code

**Look for:**
```python
from mcp.server.sse import SseServerTransport

sse = SseServerTransport("/messages/")

async def handle_sse(request):
    async with sse.connect_sse(...) as streams:
        await mcp_server.run(...)
    return Response()

routes=[
    Route("/sse", endpoint=handle_sse, methods=["GET"]),
    Mount("/messages/", app=sse.handle_post_message),
]
```

**If missing**: That's your issue! Not a Claude Code bug.

---

## Decision Tree (Corrected)

```
Is Railway health endpoint responding?
├─ NO → Railway deployment is down
│   └─ Fix: Check Railway dashboard, redeploy if needed
│
└─ YES → Is /sse endpoint responding (not 404)?
    ├─ NO → SSE endpoint not implemented
    │   ├─ Check: server_http.py has SseServerTransport?
    │   ├─ Check: Routes mounted for /sse and /messages/?
    │   └─ Fix: Add SSE endpoint implementation (see below)
    │
    └─ YES → Is SSE handshake returning session_id?
        ├─ NO → SSE endpoint exists but not working correctly
        │   └─ Check: Proper async context manager?
        │
        └─ YES → Is Claude Code connecting?
            ├─ NO → Check config file URL
            │   └─ Fix: Ensure URL ends with /sse
            │
            └─ YES → ✅ Everything working!
```

---

## The Real Issue (What We Found Nov 19)

### Asana Railway MCP Analysis

**Health endpoint**: ✅ Working
```bash
$ curl https://asana-mcp-railway-production.up.railway.app/health
{"status":"ok","service":"asana-mcp","version":"0.1.0",...}
```

**SSE endpoint**: ❌ 404 Not Found
```bash
$ curl https://asana-mcp-railway-production.up.railway.app/sse
Not Found
```

**Why?** Checked `server_http.py`:
```python
# Line 560 (before fix):
# MCP endpoint will be added via SSE transport

# Routes (before fix):
routes=[
    Route("/health", health_check, methods=["GET"]),
    Route("/oauth/start", oauth_start, methods=["GET"]),
    # ... other routes
    # NO /sse ROUTE!
]
```

**The endpoint literally didn't exist.**

---

## How to Add SSE Endpoint (The Fix)

### Step 1: Import SSE Transport

```python
from mcp.server.sse import SseServerTransport
```

### Step 2: Initialize SSE Transport

```python
# After your MCP server is created
mcp_server = Server("your-mcp-name")

# Initialize SSE transport
sse = SseServerTransport("/messages/")
```

### Step 3: Create SSE Handler

```python
async def handle_sse(request: Request) -> Response:
    """Handle SSE connections for MCP protocol."""
    async with sse.connect_sse(
        request.scope, request.receive, request._send
    ) as streams:
        await mcp_server.run(
            streams[0],
            streams[1],
            mcp_server.create_initialization_options()
        )
    return Response()
```

### Step 4: Add Routes

```python
from starlette.routing import Route, Mount

app = Starlette(
    routes=[
        # Your existing routes
        Route("/health", health_check, methods=["GET"]),

        # Add SSE routes
        Route("/sse", endpoint=handle_sse, methods=["GET"]),
        Mount("/messages/", app=sse.handle_post_message),
    ]
)
```

### Step 5: Update MCP Config

```json
{
  "mcpServers": {
    "your-mcp": {
      "type": "sse",
      "url": "https://your-server.up.railway.app/sse"
    }
  }
}
```

Note the `/sse` path in the URL!

---

## Testing After Fix

### 1. Test SSE Handshake
```bash
curl -N https://your-server.up.railway.app/sse \
  -H "Accept: text/event-stream"

# Should see:
# event: endpoint
# data: /messages/?session_id=xxxxx
```

### 2. Test with Claude Code
```bash
claude --mcp-config your-config.json -- task "test"
```

### 3. Test with Bridge
```bash
node test-your-mcp-coordination.js

# Should see:
# ✅✅✅ SSE TEST PASSED! ✅✅✅
```

---

## What Was NOT The Issue

### ❌ Claude Code SSE Bugs (DISPROVEN)

Previous report claimed:
1. Missing `Accept: text/event-stream` headers
2. GET vs POST confusion
3. SSE stream parsing failures

**All false.** Once the server endpoint was properly implemented, Claude Code connected immediately with no issues.

### ❌ Railway Deployment Health (RED HERRING)

Railway deployments were healthy the whole time. Health endpoint worked. The issue was simply that the MCP endpoint didn't exist.

---

## Lessons Learned

### 1. Always Check If Endpoint Exists First

```bash
# Don't assume endpoints exist
curl https://server.com/mcp       # Might be 404!
curl https://server.com/sse       # Check this too!
```

### 2. Read Server Code

If endpoint returns 404, check:
```python
# Does route exist?
routes=[
    Route("/your-endpoint", handler, methods=["GET"])
]

# Is handler implemented?
async def handler(request):
    # Code here?
    pass
```

### 3. Don't Blame The Client Prematurely

"Connection failed" could mean:
- ❌ Server endpoint doesn't exist (404)
- ❌ Server endpoint exists but broken (500)
- ❌ Client has bugs
- ❌ Network issues

**Always eliminate server issues first.**

---

## Current Status (Nov 19, 2025)

### Asana Railway MCP
- **Health**: ✅ Working
- **SSE Endpoint**: ✅ Working (added Nov 19)
- **Claude Code**: ✅ Connects successfully
- **Bridge**: ✅ File coordination works with SSE

### HubSpot Railway MCP
- **Status**: ⚠️ Check if SSE endpoint implemented
- **Action**: Apply same fix if needed

### SharePoint Railway MCP
- **Status**: ⚠️ Check if SSE endpoint implemented
- **Action**: Apply same fix if needed

---

## Quick Fix Checklist

When Railway MCP fails to connect:

- [ ] Health endpoint returns 200 OK?
- [ ] SSE endpoint exists (not 404)?
- [ ] SSE endpoint returns proper handshake?
- [ ] Config URL includes `/sse` path?
- [ ] Server code has `SseServerTransport`?
- [ ] Server code has `handle_sse()` function?
- [ ] Routes mounted for `/sse` and `/messages/`?
- [ ] Railway env vars set correctly?

If all checked: ✅ Should work!

---

## Production Recommendations (Updated)

### SSE Transport Is Production-Ready

**Use SSE when:**
- ✅ Remote deployment needed
- ✅ Bidirectional streaming desired
- ✅ Real-time updates important
- ✅ Event-driven architecture preferred

**Setup Requirements:**
1. Implement SSE endpoint on server
2. Mount routes for `/sse` and `/messages/`
3. Configure client URL with `/sse` path
4. Test with curl before deploying

**Expected Performance:**
- Connection: <1 second
- Handshake: ~100ms
- Streaming: Real-time
- Reliability: Excellent (when properly implemented)

---

## Reference Implementation

See working example:
- **Server**: `C:\Users\jonat\asana-mcp-railway\src\server_http.py`
- **Config**: `C:\Users\jonat\asana-mcp-railway\.mcp-config.json`
- **Test**: `C:\Users\jonat\claude-code-mcp-bridge\test-asana-coordination.js`

---

## Document History

| Date | Version | Changes |
|------|---------|---------|
| 2025-11-18 | 1.0 | Original (incorrect SSE bug conclusions) |
| 2025-11-19 | 2.0 | **CORRECTED**: Issue was deployment, not Code bugs |

---

**Key Takeaway**: Claude Code v2.0.45 has **NO SSE BUGS**. Railway MCPs work perfectly once SSE endpoints are properly implemented. The debugging mistake was assuming client bugs before verifying server implementation.
