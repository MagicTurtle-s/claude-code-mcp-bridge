/**
 * Reset all sessions - useful when rate limited or for testing
 *
 * This script:
 * 1. Deletes local session file
 * 2. Optionally revokes sessions on server
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

async function resetSessions() {
  console.log('=== Resetting All Sessions ===\n');

  // Determine session file path
  const appDataDir = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const sessionFilePath = path.join(appDataDir, 'Claude', '.claude-mcp-sessions.json');

  console.log(`Session file: ${sessionFilePath}\n`);

  // Load and revoke sessions on server
  if (fs.existsSync(sessionFilePath)) {
    try {
      const fileContent = fs.readFileSync(sessionFilePath, 'utf-8');
      const data = JSON.parse(fileContent);

      console.log('Found sessions to revoke:');

      for (const [mcpUrl, mcpSessions] of Object.entries(data.sessions)) {
        console.log(`\nMCP: ${mcpUrl}`);

        for (const [desktopId, session] of Object.entries(mcpSessions)) {
          console.log(`  Desktop ID: ${desktopId}`);
          console.log(`  Session ID: ${session.sessionId}`);

          // Try to revoke on server
          try {
            const baseUrl = mcpUrl.replace(/\/(sse|mcp|messages).*$/, '');
            const response = await axios.post(`${baseUrl}/session/revoke`, {
              session_id: session.sessionId
            }, {
              timeout: 5000,
              headers: {
                'Content-Type': 'application/json'
              }
            });

            if (response.data.status === 'success') {
              console.log(`  ✅ Revoked on server`);
            } else {
              console.log(`  ⚠️  Server response: ${JSON.stringify(response.data)}`);
            }
          } catch (error) {
            console.log(`  ⚠️  Could not revoke on server: ${error.message}`);
          }
        }
      }
    } catch (error) {
      console.log(`⚠️  Could not parse session file: ${error.message}`);
    }

    // Delete local session file
    console.log(`\nDeleting local session file...`);
    fs.unlinkSync(sessionFilePath);
    console.log('✅ Local session file deleted');
  } else {
    console.log('No session file found - nothing to reset');
  }

  console.log('\n=== Sessions Reset Complete ===');
  console.log('\nNext steps:');
  console.log('1. Restart Claude Desktop');
  console.log('2. Make an Asana query');
  console.log('3. Browser should open for fresh authentication');
  console.log('4. After authentication, subsequent queries should NOT open browser');
}

resetSessions().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
