# Authentication Section to Add to README.md

**Location:** Insert after line 243 (after "Restart Claude Desktop" in the "MCP server not showing" section)

```markdown
#### MCP Authentication Failures

If you see errors like "authentication failed", "unauthorized", or "token expired" when using MCP tools:

1. **Run the `/mcp` command** in your Claude Code terminal:
   ```
   /mcp
   ```

2. **Authorize in browser**: OAuth window opens automatically

3. **Grant permissions**: Allow access for the MCP server (Asana, HubSpot, etc.)

4. **Retry your request**: Tokens are now stored and will persist

**How Authentication Works:**
- Bridge MCP delegates all authentication to Claude Code CLI
- Tokens stored in `~/.claude/.credentials.json`
- Access tokens: ~1 hour (auto-refresh)
- Refresh tokens: days/weeks (manual `/mcp` re-auth when expired)
- No re-authentication needed every session

**For detailed authentication documentation, see [AUTHENTICATION.md](./AUTHENTICATION.md)**
```

---

**Note for manual insertion:**
Due to file lock issues preventing automated editing of README.md, this content should be manually inserted into the Troubleshooting section's Quick Fixes subsection.
