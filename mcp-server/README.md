# VibeLink MCP Server

Gives Claude tools to push rich UI to your phone. Tables, forms, charts, code viewers, tabs, input prompts, and notifications -- all rendered natively on the mobile app.

## Architecture

```
Claude Code CLI <-- stdio (JSON-RPC) --> [MCP Server]
                                              |
                                         [Tool Handlers]
                                         - render_ui / update_ui
                                         - create_tab / update_tab
                                         - request_input (blocking)
                                         - send_notification
                                              |
                                         [IPC Client] --> Bridge (TCP 127.0.0.1:3401)
                                              |
                                         (NDJSON over TCP)
```

The MCP server is a standalone process using the `@modelcontextprotocol/sdk` with stdio transport. Claude Code auto-launches it on every session. It reads `VIBELINK_SESSION_ID` from the environment to identify itself to the Bridge via IPC handshake.

## Tools

| Tool | Description | Parameters | Blocks? |
|---|---|---|---|
| `render_ui` | Push a UI component to the phone | `id`, `type`, `title?`, `data?` | No |
| `update_ui` | Modify an existing component by ID | `componentId`, `updates` | No |
| `create_tab` | Create a named tab in the app | `id`, `name`, `content?` | No |
| `update_tab` | Update content in an existing tab | `tabId`, `updates` | No |
| `request_input` | Ask user for input and wait for response | `prompt`, `options?` | Yes (5 min timeout) |
| `send_notification` | Push a notification to the app | `message`, `level` | No |
| `render_html` | Render HTML artifact in workspace canvas | `html`, `title?` | No |
| `set_preview_url` | Show localhost URL in workspace canvas | `url`, `title?` | No |
| `clear_workspace` | Clear the workspace canvas | — | No |
| `list_windows` | List capturable desktop windows | — | No |
| `stream_window` | Start MJPEG stream of a desktop window | `windowId`, `fps?` | No |
| `stop_stream` | Stop an active screen mirror stream | `streamId` | No |
| `stream_status` | Get status of active streams | — | No |
| `browse_files` | Browse project directory listing | `path?` | No |
| `view_file` | View file contents with syntax highlighting | `path` | No |

When the Bridge is unavailable, all tools return an error message: "Bridge unavailable, UI tools temporarily disabled". Claude can then decide how to proceed.

## Component Types

Used with `render_ui`'s `type` parameter:

| Type | Renders |
|---|---|
| `decision_table` | Rows + columns, optionally selectable |
| `form` | Input fields, dropdowns, checkboxes |
| `code_viewer` | Syntax-highlighted code with diff support |
| `chart` | Bar, line, or pie chart |
| `markdown` | Rich rendered markdown |
| `image_gallery` | Grid of images |
| `progress` | Progress bar or spinner |
| `tree_view` | File/folder tree |

## Data Flow

### render_ui (non-blocking)

```
1. Claude calls render_ui({ id: "deps", type: "decision_table", data: {...} })
2. Claude Code sends tool_use to MCP server via stdio
3. MCP server writes ui_update JSON to Bridge via TCP
4. Bridge receives on IPC, wraps with eventId, broadcasts via WebSocket
5. Phone renders the component natively
6. MCP server returns { success: true } to Claude immediately
```

### request_input (blocking)

```
1. Claude calls request_input({ prompt: "Which option?", options: ["A", "B", "C"] })
2. MCP server sends input_request to Bridge via IPC (includes a unique requestId)
3. Bridge forwards to phone via WebSocket
4. Phone shows selection UI, user taps an option
5. Phone sends input_response via WebSocket --> Bridge --> IPC --> MCP server
6. MCP server resolves the pending promise, returns the selection to Claude
```

If the user doesn't respond within 5 minutes, the tool returns a timeout error and Claude can decide how to proceed.

## Registration

Register once, works for all future sessions:

```bash
claude mcp add vibelink --scope user -- node /path/to/vibelink/mcp-server/dist/server.js
```

The MCP server connects to the Bridge IPC socket on startup. If the Bridge isn't running yet, it retries with exponential backoff (500ms, 1s, 2s, 5s max).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `VIBELINK_SESSION_ID` | (required) | Set by Bridge when spawning Claude. Identifies this session on IPC handshake. |
| `VIBELINK_IPC_SOCKET` | `tcp:3401` | Bridge IPC transport — `tcp:PORT` for TCP or a file path for Unix socket |

The MCP server exits immediately if `VIBELINK_SESSION_ID` is not set.

## File Map

| File | Description |
|---|---|
| `src/index.ts` | MCP server setup, stdio transport, tool registration |
| `src/ipc-client.ts` | TCP/IPC client with auto-reconnect and exponential backoff |
| `src/types.ts` | Component type definitions, IPC message interface |
| `src/tools/render-ui.ts` | `render_ui` and `update_ui` tool handlers |
| `src/tools/tabs.ts` | `create_tab` and `update_tab` tool handlers |
| `src/tools/input.ts` | `request_input` tool handler (blocking with timeout) |
| `src/tools/notify.ts` | `send_notification` tool handler |
| `src/tools/workspace.ts` | `render_html`, `set_preview_url`, `clear_workspace` tool handlers |
| `src/tools/screen-mirror.ts` | `list_windows`, `stream_window`, `stop_stream`, `stream_status` tool handlers |
| `src/tools/file-browser.ts` | `browse_files`, `view_file` tool handlers |

## Development

```bash
npm install
npm run dev          # run with tsx (requires VIBELINK_SESSION_ID to be set)
npm run build        # compile TypeScript to dist/
npm start            # run compiled output
```

For development without a live Bridge, you can set the env vars manually:

```bash
VIBELINK_SESSION_ID=test-session VIBELINK_IPC_SOCKET=/tmp/vibelink.sock npm run dev
```

## Testing

```bash
npm test             # run all tests (vitest)
npm run test:watch   # watch mode
```

Tests cover:
- `ipc-client.test.ts` -- connection, handshake, reconnect with backoff, message parsing
