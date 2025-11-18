# Production Readiness Assessment: claude-code-bridge v2.3.0

## Executive Summary

**Status**: ❌ **NOT PRODUCTION READY** - Recursive orchestration fails due to instruction following issue

**Root Cause Identified**: Code orchestrator subprocess receives bridge MCP tools and orchestrator instructions but does not execute the workflow as directed. Instead of calling the bridge to spawn HubSpot subprocess, Code times out after 90 seconds of planning/thinking.

**Evidence Source**: diagnostic-stderr.log from clean isolated test

## Problem Statement

### Expected Behavior
```
Desktop → Bridge.execute_task("Find HubSpot deal")
  ↓
  Bridge spawns Code Orchestrator (has bridge MCP + instructions)
  ↓
  Code reads C:\Users\jonat\hubspot-mcp-railway\.mcp-config.json
  Code extracts hubspot server config
  Code writes temp config: {"mcpServers":{"hubspot":{...}}}
  Code calls bridge.execute_with_permission_mode(mcp_config_path=temp)
  ↓
  Bridge spawns Code Subprocess (has ONLY hubspot MCP)
  ↓
  Code Subprocess uses hubspot MCP to query deals
  ↓
  Returns result → Bridge → Code Orchestrator → Desktop
```

### Actual Behavior
```
Desktop → Bridge.execute_task("Find HubSpot deal")
  ↓
  Bridge spawns Code Orchestrator (has bridge MCP + instructions)
  ↓
  Code receives:
    ✅ Bridge MCP tools (execute_task, execute_with_permission_mode, etc.)
    ✅ Orchestrator system prompt (3097 characters of detailed instructions)
    ✅ Original prompt: "Find the most recent deal from Adult Teen Challenge"
  ↓
  Code generates multiple assistant/user messages (planning/thinking)
  ↓
  90 seconds elapse
  ↓
  Code TIMES OUT without calling any bridge tools
  ↓
  Error: Execution timeout after 90000ms
```

## Diagnostic Evidence

### Test Setup
- **Test**: test-diagnostic.js
- **Environment**: Clean isolated bridge instance
- **Config**: Bridge-only (no other MCPs)
- **Prompt**: "Find the most recent deal from company 'Adult Teen Challenge' in HubSpot"
- **Timeout**: 90 seconds

### Key Findings from diagnostic-stderr.log

#### 1. Config Creation (CORRECT)
```
[SessionManager] createMergedConfig called with mcpConfigPath: undefined
[SessionManager] No user config provided, using bridge only
[SessionManager] Bridge config servers: claude-code-bridge
[SessionManager] Merged servers: claude-code-bridge
[SessionManager] Config servers being written: claude-code-bridge
```
✅ Config contains ONLY bridge MCP (as expected for orchestrator mode)

#### 2. Orchestrator Instructions (CORRECT)
```
[SessionManager] appendSystemPrompt length: 3097
```
Full system prompt includes:
- Available MCP configs (HubSpot, Asana, SharePoint)
- Critical requirements (4 parameters for execute_with_permission_mode)
- Detailed workflow with example JSON
- File paths with correct escaping

#### 3. Code Subprocess Startup (CORRECT)
```
[ClaudeCodeExecutor] System init - MCP servers:
  - 0: status=connected, tools=0
```
Note: The logging code incorrectly interprets the mcp_servers array, but system-init-debug.json confirms:
```json
{
  "tools": [
    "mcp__claude-code-bridge__execute_task",
    "mcp__claude-code-bridge__execute_with_tools",
    "mcp__claude-code-bridge__execute_with_permission_mode",
    "mcp__claude-code-bridge__get_session_info"
  ],
  "mcp_servers": [
    {
      "name": "claude-code-bridge",
      "status": "connected"
    }
  ]
}
```
✅ Code has access to all 4 bridge MCP tools

#### 4. Code Behavior (PROBLEM)
```
[ClaudeCodeExecutor] Received JSON: assistant
[ClaudeCodeExecutor] Received JSON: assistant
[ClaudeCodeExecutor] Received JSON: user
[ClaudeCodeExecutor] Received JSON: assistant
[ClaudeCodeExecutor] Received JSON: user
[ClaudeCodeExecutor] Received JSON: assistant
[ClaudeCodeExecutor] Received JSON: user
[ClaudeCodeExecutor] Received JSON: assistant
```
❌ Code generates 8 assistant/user messages without any tool calls
❌ No bridge MCP tool calls detected in stderr
❌ Times out after 90 seconds

## Root Cause Analysis

### What Works
1. ✅ Bridge MCP server starts and exposes tools correctly
2. ✅ Config merge creates correct orchestrator config (bridge only)
3. ✅ Code subprocess spawns successfully
4. ✅ Code subprocess receives bridge MCP tools
5. ✅ Code subprocess receives orchestrator instructions
6. ✅ CLI argument parsing works (-- separator fix from v2.2.0)

### What Fails
1. ❌ Code does not follow orchestrator workflow instructions
2. ❌ Code does not read HubSpot config file
3. ❌ Code does not create temp config file
4. ❌ Code does not call bridge MCP tools
5. ❌ Code times out without producing result

### Why It Fails

**Hypothesis 1: Instruction Complexity** ✅ LIKELY
The orchestrator system prompt is very detailed (3097 characters) with specific file paths, JSON examples, and multi-step workflows. Code may be overwhelmed by the complexity and unable to determine the correct action sequence.

**Hypothesis 2: Tool Visibility** ❌ RULED OUT
Code CAN see bridge tools in system init. This is not a visibility issue.

**Hypothesis 3: Permission Barriers** ❌ RULED OUT
Code runs with `--dangerously-skip-permissions`, so no permission prompts block execution.

**Hypothesis 4: Config File Access** ❌ RULED OUT
Code can read any file with bypass permissions enabled. The HubSpot config file exists and is accessible.

**Hypothesis 5: Instruction Format** ✅ POSSIBLE
The instructions use `--append-system-prompt` which may not be as effective as custom slash commands or skills for complex workflows.

**Hypothesis 6: Timeout Too Short** ❌ RULED OUT
90 seconds is MORE than enough for: read file (1s) + parse JSON (1s) + write file (1s) + call tool (1s). The issue is Code never attempts these actions.

**Hypothesis 7: Model Limitations** ✅ POSSIBLE
Claude Sonnet 4.5 may struggle with this type of meta-orchestration task (using MCP tools to spawn new Code instances with different MCP tools). The cognitive load of understanding the recursive architecture might be too high.

## Recommended Solutions

### Solution 1: Simplify Orchestrator Instructions (Quick Fix - 1 day)

**Problem**: 3097-character system prompt may be overwhelming Code with too much information.

**Approach**: Create minimal, focused instructions
```
You have access to claude-code-bridge MCP for spawning subprocesses.

For HubSpot queries:
1. Call mcp__claude-code-bridge__execute_with_permission_mode
2. Parameters:
   - prompt: "Use mcp__hubspot__ tools to find deals"
   - mcp_config_path: "C:\\Users\\jonat\\hubspot-mcp-railway\\.mcp-config.json"
   - permission_mode: "bypassPermissions"
   - skip_all_permissions: true

Do NOT read/parse configs. Pass config path directly to bridge.
```

**Changes needed**:
- session-manager.ts:166-228 (orchestrator system prompt)
- Remove complex multi-step workflow
- Remove JSON examples
- Remove file path escaping explanations

**Risk**: LOW - Instructions can be reverted if this doesn't work

**Success criteria**: Code calls bridge tool within 30 seconds

### Solution 2: Create Orchestrator Skill (Medium Fix - 2-3 days)

**Problem**: System prompts may not be effective for complex workflows.

**Approach**: Create a dedicated MCP orchestration skill with:
- Workflow state management
- Step-by-step guidance
- Tool call templates
- Error recovery

**File**: `.claude/skills/orchestrator.md`
```yaml
---
name: orchestrator
description: Orchestrate MCP subprocesses for multi-system queries
---

# MCP Orchestrator Skill

When user asks to query HubSpot, Asana, or SharePoint:

1. Identify which system(s) to query
2. For each system, call bridge with pre-configured path
3. Wait for results
4. Synthesize answer

## HubSpot
mcp__claude-code-bridge__execute_with_permission_mode({
  prompt: "Find deals using mcp__hubspot__ tools",
  mcp_config_path: "C:\\Users\\jonat\\hubspot-mcp-railway\\.mcp-config.json",
  permission_mode: "bypassPermissions",
  skip_all_permissions: true
})
```

**Changes needed**:
- Create new skill file
- Modify session-manager.ts to load skill instead of append-system-prompt
- Test with `/orchestrator` slash command

**Risk**: MEDIUM - Requires understanding skill system

**Success criteria**: Code follows skill workflow and calls bridge within 30 seconds

### Solution 3: Pre-process User Intent (Recommended - 1-2 days)

**Problem**: Code orchestrator doesn't understand that "HubSpot" query means "call bridge with HubSpot config".

**Approach**: Bridge pre-processes user prompt to detect intent and automatically construct bridge tool calls.

**Implementation**:
```typescript
// src/session-manager.ts
async createSession(options: ClaudeCodeExecutionOptions): Promise<...> {
  // Detect intent from prompt
  const hubspotIntent = /hubspot|deals|contacts|companies/i.test(options.prompt);
  const asanaIntent = /asana|tasks|projects|goals/i.test(options.prompt);

  if (hubspotIntent || asanaIntent) {
    // Don't spawn orchestrator Code
    // Directly spawn domain-specific Code with correct config
    const configPath = hubspotIntent
      ? 'C:\\Users\\jonat\\hubspot-mcp-railway\\.mcp-config.json'
      : 'C:\\Users\\jonat\\asana-mcp-railway\\.mcp-config.json';

    return await this.spawnDomainCode(options.prompt, configPath);
  }

  // Otherwise use orchestrator mode
  return await this.spawnOrchestratorCode(options);
}
```

**Pros**:
- No reliance on Code following complex instructions
- Deterministic behavior
- Fast (no orchestrator thinking time)
- Works with current architecture

**Cons**:
- Hard-coded intent detection (not scalable)
- Loses flexibility of dynamic orchestration
- Requires maintaining keyword mappings

**Risk**: LOW - Can coexist with orchestrator mode as fallback

**Success criteria**: HubSpot queries execute in <10 seconds with correct results

### Solution 4: HTTP Bridge with Explicit Routing (Long-term - 1 week)

**Problem**: Recursive stdio orchestration is too complex for Code to understand.

**Approach**: Convert bridge to HTTP service with explicit routing endpoints.

**Architecture**:
```
Desktop → Bridge (HTTP localhost:8000)
          ↓
          POST /orchestrate
          {
            "query": "Find HubSpot deals",
            "systems": ["hubspot"]
          }
          ↓
          Bridge determines intent
          Bridge spawns Code with hubspot config
          Bridge waits for result
          Bridge returns to Desktop
```

**Changes needed**:
- Complete rewrite of MCP transport layer
- New HTTP server implementation
- Desktop MCP config change to HTTP transport
- Port management and process lifecycle

**Risk**: VERY HIGH - Major architectural change

**Success criteria**: All orchestration scenarios work with deterministic behavior

## Production Readiness Checklist

| Requirement | Status | Blocker |
|-------------|--------|---------|
| Bridge MCP loads in Desktop | ✅ Pass | N/A |
| Config merge works correctly | ✅ Pass | N/A |
| Code subprocess spawns | ✅ Pass | N/A |
| Code receives MCP tools | ✅ Pass | N/A |
| Code follows orchestrator instructions | ❌ FAIL | **YES** |
| Recursive tool calls work | ❌ FAIL | **YES** |
| End-to-end HubSpot query succeeds | ❌ FAIL | **YES** |
| Error handling and timeouts | ✅ Pass | N/A |
| Documentation complete | ⚠️  Partial | Minor |

**Overall Status**: ❌ **BLOCKED** - Cannot ship without functional orchestration

## Immediate Next Steps

1. **Implement Solution 3 (Pre-process Intent)** - 1-2 days
   - Fastest path to working orchestration
   - Low risk, can be tested immediately
   - Provides baseline functionality while exploring other solutions

2. **Simplify Orchestrator Instructions (Solution 1)** - 1 day
   - Test if Code can follow simpler workflow
   - Gather data on instruction-following limits
   - May unlock true orchestration if successful

3. **Create Orchestrator Skill (Solution 2)** - 2-3 days
   - If Solution 1 shows promise, formalize as skill
   - Provides reusable orchestration pattern
   - Can be shared with community

4. **Long-term: HTTP Bridge (Solution 4)** - 1 week
   - Only if Solutions 1-3 all fail
   - Provides most robust, scalable solution
   - Significant investment but future-proof

## Conclusion

The `claude-code-bridge` v2.3.0 is architecturally sound - all components work correctly up to the point where Code must execute the orchestrator workflow. The failure is in **instruction following**, not in architecture, configuration, or tool exposure.

**Recommended path forward**: Implement Solution 3 (Pre-process Intent) for immediate production deployment, while simultaneously testing Solution 1 (Simplified Instructions) to determine if true dynamic orchestration is achievable with the current stdio architecture.

**Timeline to production**: 1-2 days with Solution 3, potentially same day if Solution 1 succeeds.

---

**Assessment Date**: 2025-11-18
**Bridge Version**: 2.3.0
**Code Version**: 2.0.45
**Test Environment**: Windows 10, Node.js, Clean isolated test
**Assessor**: Claude (Sonnet 4.5) via diagnostic testing
