# Railway SSE MCP Debugging Guide

⚠️ **DEPRECATED - SEE CORRECTED VERSION**: `RAILWAY-SSE-DEBUGGING-CORRECTED.md`

**This document contains incorrect conclusions. The issue was incomplete server deployment, NOT Claude Code SSE bugs.**

---

## TL;DR

**Problem:** Railway-deployed MCP servers show as "failed" in Claude Code despite being healthy.

**Root Cause (CORRECTED):** Railway servers were missing SSE endpoint implementation (returned 404).

**Solution for Production:** Add proper SSE endpoints to Railway servers. SSE works perfectly in Claude Code v2.0.45.

---

## Table of Contents

1. [Quick Diagnosis](#quick-diagnosis)
2. [The Debugging Mistake](#the-debugging-mistake)
3. [Railway Health Checks](#railway-health-checks)
4. [Claude Code SSE Bugs](#claude-code-sse-bugs)
5. [Transport Decision Matrix](#transport-decision-matrix)
6. [Proxy Workaround (Not Recommended)](#proxy-workaround-not-recommended)
7. [Production Recommendations](#production-recommendations)

---

## Quick Diagnosis

### Step 1: Test Railway Endpoint Directly

**Before debugging bridge code**, verify Railway server is healthy:

```bash
# Test health endpoint
curl https://hubspot-mcp-railway-production-386b.up.railway.app/health

# ✅ Expected: {"status":"ok","server":"HubSpot MCP","tools":116}
# ❌ If 404: Server is down - check Railway dashboard
```

### Step 2: Test MCP Handshake

```bash
curl -X POST https://hubspot-mcp-railway-production-386b.up.railway.app/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {"name": "test", "version": "1.0.0"}
    },
    "id": 1
  }'

# ✅ Expected: SSE stream starting with "event: message"
# ❌ If 406 Not Acceptable: Missing Accept headers (Claude Code bug)
# ❌ If 404: Wrong HTTP method or endpoint
```

###Step 3: Check Railway Logs

```bash
# Via Railway CLI
cd /path/to/hubspot-mcp-railway
railway logs --service=hubspot-mcp

# Or via Railway Dashboard
# https://railway.app/dashboard → Select project → Deployments tab → View logs

# Look for:
# ✅ "New MCP request from: ::ffff:X.X.X.X" - Connection received
# ✅ "✅ MCP Server listening on port 3000" - Server started
# ❌ "Request closed" immediately after connection - Handshake failed
# ❌ Error messages about missing tokens, permissions, etc.
```

### Decision Tree

```
Is Railway health endpoint responding?
├─ NO → Railway deployment is down
│   └─ Fix: Check Railway dashboard, redeploy if needed
│
└─ YES → Is MCP handshake (curl) working?
    ├─ NO → Server-side issue
    │   ├─ 406 error → Missing Accept headers in request
    │   ├─ 404 error → Wrong endpoint or HTTP method
    │   └─ 500 error → Check Railway logs for server errors
    │
    └─ YES → Is Claude Code connecting?
        ├─ NO → Claude Code client bug (SSE transport)
        │   └─ Solution: Use stdio transport instead
        │
        └─ YES → Bridge configuration issue
            └─ Check bridge logs, verify config merging
```

---

## The Debugging Mistake

### What We Did Wrong

```
❌ WRONG Approach (wasted 4+ hours):
1. Saw "Failed to connect" in Claude Code
2. Assumed bridge file-coordination was broken
3. Spent hours debugging bridge code
4. Created complex proxy workarounds
5. Still couldn't connect

Result: Exhaustion, confusion, no progress
```

### What We Should Have Done

```
✅ RIGHT Approach (would have found issue in 10 minutes):
1. curl Railway health endpoint → ✅ Server healthy
2. curl MCP handshake → ✅ Handshake works
3. Test Claude Code connection → ❌ Fails despite server working
4. Conclusion: Claude Code client bug, not bridge issue
5. Switch to stdio transport → ✅ Works immediately

Result: Quick diagnosis, clear solution
```

### The Golden Rule

> **Before spending hours debugging bridge code:**
> 1. Test external dependencies FIRST (Railway, endpoints, logs)
> 2. Isolate the problem (bridge? Claude Code? server?)
> 3. Prove bridge works with stdio
> 4. Then investigate transport-specific issues

**This debugging methodology saves hours and prevents false assumptions.**

---

## Railway Health Checks

### Server is Running vs Client Can Connect

**Critical Distinction:**
- ✅ **Server Running**: Railway deployment is up, health endpoint responds
- ❌ **Client Connecting**: Claude Code can establish MCP connection

**You can have:** Server running ✅ + Client failing ❌ = Transport bug!

### Health Endpoint Testing

```bash
# Quick health check
curl https://your-mcp-server.up.railway.app/health

# Expected response
{
  "status": "ok",
  "server": "HubSpot MCP",
  "tools": 116
}

# If you get 404, check:
# 1. Railway deployment status (dashboard)
# 2. Server logs for startup errors
# 3. Environment variables (HUBSPOT_ACCESS_TOKEN, etc.)
```

### Railway Deployment Status

```bash
# Check deployment status via CLI
railway status

# Check recent deployments
railway logs --tail 100

# Look for:
# - Build successful
# - Server started on port
# - No runtime errors
```

### Common Railway Issues (Not Claude Code Bugs)

| Issue | Symptom | Fix |
|-------|---------|-----|
| Missing env vars | 500 errors, crashes | Set HUBSPOT_ACCESS_TOKEN in Railway dashboard |
| Build failure | Deployment fails | Check package.json, dependencies |
| Port binding | Server doesn't start | Use `process.env.PORT` (Railway sets automatically) |
| OOM errors | Crashes under load | Increase memory in Railway settings |

---

## Claude Code SSE Bugs

We discovered three critical bugs in Claude Code CLI v2.0.45's SSE client implementation:

### Bug #1: Missing Accept Headers

**Problem:**
Claude Code doesn't send `Accept: text/event-stream` header when connecting to SSE MCPs.

**Impact:**
```
StreamableHTTPServerTransport checks:
  if (!request.headers.accept?.includes('text/event-stream')) {
    return 406 Not Acceptable
  }

Result: Connection rejected before handshake
```

**Evidence:**
```bash
# What Claude Code sends:
GET /mcp HTTP/1.1
Accept: */*

# What server expects:
GET /mcp HTTP/1.1
Accept: application/json, text/event-stream
```

**Workaround:**
Proxy that adds headers (complex, see below)

### Bug #2: GET vs POST Confusion

**Problem:**
Claude Code sends GET requests for "health checks" but Railway MCP servers only accept POST for MCP endpoints.

**Impact:**
```javascript
// Server code
app.post('/mcp', async (req, res) => {
  // MCP handshake handler
});

// Claude Code sends:
GET /mcp  →  404 Not Found
```

**Evidence from Railway logs:**
```
[2025-11-19T00:17:14.403Z] GET /mcp
  Response status: 404
```

**Workaround:**
Server must handle both GET (health) and POST (MCP), or proxy converts GET→POST

### Bug #3: Response Parsing Failures

**Problem:**
Even when proxy provides HTTP 200 responses with proper SSE streams, Claude Code still marks connection as "failed".

**Impact:**
```bash
# Proxy logs show success:
[2025-11-19T01:44:37.771Z] GET /mcp
  Converting GET to POST with initialize request
  Response status: 200
  Response headers: { "content-type": "text/event-stream", ... }
  Request completed

# Claude Code still reports:
hubspot: http://localhost:3001/mcp (SSE) - ✗ Failed to connect
```

**Conclusion:**
Fundamental SSE stream parsing bug in Claude Code client. No simple workaround exists.

### Bug Summary Table

| Bug | Claude Code Behavior | Expected Behavior | Workaround |
|-----|---------------------|-------------------|------------|
| Missing headers | Sends `Accept: */*` | `Accept: application/json, text/event-stream` | Proxy adds headers |
| Wrong method | Sends `GET /mcp` | `POST /mcp` for handshake | Proxy converts or server handles both |
| Parsing failure | Marks 200 OK as failed | Parse SSE stream correctly | **None - use stdio** |

---

## Transport Decision Matrix

### For Client Rollouts (Your Use Case)

| Requirement | stdio | SSE | HTTP |
|-------------|-------|-----|------|
| **Reliability** | ✅ Proven stable | ❌ Buggy | ❓ Untested |
| **Works with Claude Code v2.0.45** | ✅ Yes | ❌ No | ❓ Unknown |
| **Requires local install** | ✅ Yes | ❌ No | ❌ No |
| **Remote deployment** | ❌ No | ✅ Yes | ✅ Yes |
| **Client rollout ready** | ✅ **YES** | ⚠️ Wait for fix | ⚠️ TBD |

**Recommendation:** Use **stdio** for production client deployments.

### When to Use Each Transport

#### Use stdio When:
- ✅ Deploying to client environments (most reliable)
- ✅ You control the deployment machine
- ✅ MCP server can run locally
- ✅ Production stability is critical
- ✅ You want proven, well-tested transport

**Example Config:**
```json
{
  "mcpServers": {
    "hubspot": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/path/to/hubspot-mcp/dist/index.js"],
      "env": {
        "HUBSPOT_ACCESS_TOKEN": "your-token-here"
      }
    }
  }
}
```

#### Use SSE When:
- ⚠️ Claude Code team fixes SSE bugs (future)
- ⚠️ You need remote-only deployment
- ⚠️ You can't run MCP locally
- ⚠️ You're willing to maintain proxy infrastructure
- ⚠️ You've verified it works with your Claude Code version

**Example Config:**
```json
{
  "mcpServers": {
    "hubspot": {
      "type": "sse",
      "url": "https://hubspot-mcp-railway-production.up.railway.app/mcp"
    }
  }
}
```

#### Use HTTP When:
- ❓ After testing with your Claude Code version
- ❓ SSE fixes don't apply to HTTP (untested assumption)

---

## Proxy Workaround (Not Recommended)

### The Proxy Approach

We attempted creating a proxy to fix Claude Code's missing headers:

```javascript
// mcp-proxy.cjs
const http = require('http');
const https = require('https');
const url = require('url');

const PROXY_PORT = 3001;
const TARGET_URL = 'https://hubspot-mcp-railway-production.up.railway.app/mcp';

const server = http.createServer((req, res) => {
  // Handle GET health checks (return simple 200)
  if (req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ status: 'ok', server: 'hubspot-mcp-proxy' }));
    return;
  }

  // Forward POST requests with proper headers
  const targetUrl = url.parse(TARGET_URL);
  let body = [];

  req.on('data', chunk => body.push(chunk));
  req.on('end', () => {
    const bodyBuffer = Buffer.concat(body);

    const headers = {
      ...req.headers,
      host: targetUrl.host,
      // FIX: Add missing Accept header
      'accept': 'application/json, text/event-stream',
      'content-type': 'application/json',
      'content-length': bodyBuffer.length
    };

    const options = {
      hostname: targetUrl.hostname,
      port: 443,
      path: targetUrl.path,
      method: 'POST',
      headers: headers
    };

    const proxyReq = https.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (error) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Proxy error', message: error.message }));
    });

    if (bodyBuffer.length > 0) {
      proxyReq.write(bodyBuffer);
    }
    proxyReq.end();
  });
});

server.listen(PROXY_PORT);
```

### Why We Don't Recommend This

| Issue | Impact |
|-------|--------|
| **Doesn't fix all bugs** | Response parsing still fails in Claude Code |
| **Adds complexity** | Another service to maintain, monitor, debug |
| **Another failure point** | Proxy crashes? All MCPs offline |
| **Client deployment burden** | Must deploy proxy + MCP server |
| **stdio is simpler** | One local process vs proxy + Railway |

### Proxy Results

```
✅ Health endpoint responds
✅ Adds missing Accept headers
✅ Converts GET to POST
✅ Railway server returns HTTP 200
❌ Claude Code STILL marks as "failed"

Conclusion: Proxy fixes server-side issues but can't fix Claude Code's
            broken SSE stream parsing. Not worth the complexity.
```

---

## Production Recommendations

### For Client Rollouts

**Recommended Architecture:**

```
Desktop → Bridge → Code Subprocess
                     ↓
              Stdio Transport
                     ↓
         Local MCP Servers (HubSpot, Asana, SharePoint)
```

**Why:**
- ✅ Proven stable with Claude Code v2.0.45
- ✅ No transport bugs
- ✅ Simple deployment (just node processes)
- ✅ Fast local communication
- ✅ Easy to debug and monitor

**Config Example:**
```json
{
  "mcpServers": {
    "claude-code-bridge": {
      "type": "stdio",
      "command": "node",
      "args": ["C:/Users/client/claude-code-mcp-bridge/build/index.js"],
      "env": {
        "DEBUG": "false",
        "HUBSPOT_PROJECT_PATH": "C:/Users/client/hubspot-mcp",
        "ASANA_PROJECT_PATH": "C:/Users/client/asana-mcp"
      }
    }
  }
}
```

### When Railway Will Be Viable

**Wait for:**
1. Claude Code team fixes SSE transport bugs
2. Verify with new Claude Code version:
   ```bash
   claude --version  # Check version
   # Test SSE connection works
   claude --mcp-config sse-test-config.json --print "test"
   ```
3. Update documentation with working version number
4. Then switch clients to Railway deployment

**Until then:** stdio is the production-ready choice.

### Monitoring Railway (For Future)

When SSE bugs are fixed, monitor Railway deployments:

```bash
# Check deployment health
railway status

# Monitor logs for errors
railway logs --tail 100 --follow

# Test endpoint health periodically
curl https://your-mcp.up.railway.app/health

# Alert on:
# - Health endpoint 404/500
# - Repeated "Request closed" in logs
# - MCP handshake failures
```

---

## Checklist for Railway MCP Issues

When a Railway MCP fails to connect, follow this checklist:

### Phase 1: Server Health
- [ ] curl health endpoint → 200 OK?
- [ ] Railway dashboard shows "Running"?
- [ ] Railway logs show server started?
- [ ] Environment variables set correctly?

### Phase 2: MCP Protocol
- [ ] curl MCP handshake → SSE stream?
- [ ] Proper Accept headers sent?
- [ ] POST method used (not GET)?
- [ ] JSON-RPC format correct?

### Phase 3: Claude Code Client
- [ ] Check Claude Code version (`claude --version`)
- [ ] Known SSE bugs in this version?
- [ ] Test with stdio to isolate transport issue?
- [ ] Bridge logs show config being passed correctly?

### Phase 4: Decision
- [ ] If server healthy + client broken = Claude Code bug → Use stdio
- [ ] If server broken = Fix Railway deployment
- [ ] If bridge broken = Debug bridge code
- [ ] Document findings for future reference

---

## Related Documentation

- **Main debugging guide:** `~/.claude/skills/mcp-bridge-debugger/skill.md`
- **Production migration:** `PRODUCTION-MIGRATION.md`
- **Bridge architecture:** `README.md`
- **File coordination:** `src/coordination/file-coordinator.ts`

---

## Version Information

- **Claude Code version tested:** v2.0.45
- **SSE bugs discovered:** 2025-11-18
- **Recommendation:** stdio transport until bugs fixed
- **Last updated:** 2025-11-18

---

**Key Takeaway:** Always test external dependencies FIRST. Don't assume bridge is broken when the issue might be Claude Code's SSE client or Railway deployment. Quick curl tests save hours of debugging!