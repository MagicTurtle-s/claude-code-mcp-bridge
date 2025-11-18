# Rollback Procedure

## Current State (Safe Checkpoint)

**Branch**: `master` (commit `feb041f`)
**Status**: Diagnostic work complete, production assessment documented
**Code**: v2.3.0 with enhanced logging

### What Works in This State
- ✅ Bridge MCP loads in Desktop
- ✅ Config merging works correctly
- ✅ Code subprocess spawning works
- ✅ Enhanced diagnostic logging
- ✅ Comprehensive documentation

### What Doesn't Work
- ❌ Recursive orchestration (by design - stdio limitation)
- ❌ End-to-end multi-system queries

## Experimental Branch

**Branch**: `feature/shared-state-coordination`
**Purpose**: Implement file-based coordination pattern (headless-pm style)
**Risk**: New architecture may not work as expected

## How to Rollback

### If Experimental Branch Fails

1. **Switch back to master**:
   ```bash
   cd C:\Users\jonat\claude-code-mcp-bridge
   git checkout master
   ```

2. **Rebuild from master**:
   ```bash
   npm run build
   ```

3. **Verify working state**:
   ```bash
   node build/index.js --help
   ```

### If You Need to Keep Experimental Changes

**Save your work**:
```bash
git checkout feature/shared-state-coordination
git add .
git commit -m "WIP: Shared-state coordination experiment"
git checkout master
```

**Later, review or cherry-pick**:
```bash
git log feature/shared-state-coordination
git cherry-pick <commit-hash>  # if you want specific changes
```

### If Master Branch Gets Corrupted

**Reset to known good commit**:
```bash
git checkout master
git reset --hard feb041f
npm run build
```

**Warning**: This discards ALL uncommitted changes on master!

## Branch Strategy

```
master (feb041f) ← SAFE, WORKING DIAGNOSTIC STATE
  │
  └─ feature/shared-state-coordination ← EXPERIMENTAL
```

### Rules
1. **Never commit broken code to master**
2. **Master should always build successfully**
3. **Feature branch is disposable** - can delete if it doesn't work
4. **Merge to master only when fully tested**

## Testing Before Merge

Before merging feature branch to master, verify:

1. ✅ Bridge MCP starts without errors
2. ✅ Desktop can connect to bridge
3. ✅ execute_task completes successfully
4. ✅ HubSpot query returns actual results
5. ✅ No regressions in existing functionality
6. ✅ All tests pass

## Quick Rollback Commands

```bash
# Rollback and clean everything
git checkout master
git reset --hard feb041f
git clean -fd  # Remove untracked files
npm run build

# Verify bridge works
node build/index.js --help
```

## Current Commit Reference

**Last Known Good State**:
- Commit: `feb041f`
- Message: "Add diagnostic logging and production readiness assessment"
- Date: 2025-11-18
- Files Changed:
  - src/executor.ts (CLI argument fixes)
  - src/server.ts (enhanced logging)
  - src/session-manager.ts (orchestrator instructions)
  - ARCHITECTURAL-LIMITATION.md (created)
  - PRODUCTION-READINESS-ASSESSMENT.md (created)
  - SOLUTION-SHARED-STATE.md (created)

## Emergency Contact

If something breaks badly:
1. Rollback to `feb041f`
2. Review `PRODUCTION-READINESS-ASSESSMENT.md` for context
3. Review `SOLUTION-SHARED-STATE.md` for architecture guidance

---

**Remember**: Experimental work is on `feature/shared-state-coordination` branch.
**Master is your safety net** - keep it clean and working!
