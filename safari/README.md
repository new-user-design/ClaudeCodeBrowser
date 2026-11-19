# ClaudeCodeBrowser for Safari

Safari port of the Firefox extension. `prepare.py` generates `Extension/` from `../extension`, so the Firefox source stays unchanged.

- **Transport:** Safari can't launch the Python native host. `bridge.js` polls the MCP server over HTTP directly. The containing app's `SafariWebExtensionHandler` reads `~/.claudecodebrowser/api_token`.
- **Port:** 8767 (WebSocket 8768), separate from Firefox's 8765, so the two never steal each other's commands.
- **Manifest:** MV2 with a persistent background page, which macOS Safari still supports.

## Build and install
    ./build.sh        # → ~/Applications/ClaudeCodeBrowser.app
Then in Safari: Settings → Extensions → enable ClaudeCodeBrowser and allow it on all websites.

## Claude Code
    claude mcp add safari-browser -s user -e CLAUDE_BROWSER_HTTP_PORT=8767 -e CLAUDE_BROWSER_WS_PORT=8768 -- python3 <repo>/mcp-server/stdio_wrapper.py
