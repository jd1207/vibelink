# Bridge Server

Central hub between your phone and Claude Code. Spawns Claude CLI subprocesses, pipes NDJSON between them and mobile clients over WebSocket, manages sessions, and runs IPC for the MCP server.

## Architecture

```
Phone <-- WebSocket --> [WS Client Tracker]
                              |
                        [Session Manager] --> [Claude Process] --> claude CLI (stdin/stdout)
                              |
                        [Event Buffer] (200 events, sequential IDs)
                              |
MCP Server <-- IPC --> [IPC Server] (TCP 127.0.0.1:3401)
                              |
                        [Project Scanner] (finds .git / CLAUDE.md directories)
                              |
                        [Shutdown Manager] (SIGTERM/SIGINT graceful cleanup)
```

**Express** serves the REST API. **ws** handles WebSocket connections. **net.Server** runs TCP IPC (default `127.0.0.1:3401`). All wired together in `server.ts`.

## File Map

| File | Description | Lines |
|---|---|---|
| `server.ts` | Express + WebSocket + IPC setup, route handlers, event wiring | ~185 |
| `session-manager.ts` | Session lifecycle: create, list, delete, message routing | ~100 |
| `claude-process.ts` | Spawn/manage Claude CLI subprocess, parse stdout NDJSON | ~100 |
| `event-buffer.ts` | Circular buffer with sequential event IDs for reconnection | ~40 |
| `ws-client.ts` | WebSocket client tracking, heartbeat ping/pong, broadcast | ~75 |
| `ipc-server.ts` | TCP/IPC server for MCP server communication | ~90 |
| `ndjson-parser.ts` | Generic NDJSON stream parser (used for testing/utilities) | ~45 |
| `project-scanner.ts` | Scan directories for .git/CLAUDE.md, with caching | ~95 |
| `shutdown.ts` | Graceful shutdown manager (ordered cleanup on SIGTERM/SIGINT) | ~40 |
| `config.ts` | Environment variable configuration with defaults | ~17 |

## REST API

### GET /health

Health check.

```
Response: { "status": "ok" }
```

### GET /projects

Scan configured roots for project directories.

```
Response:
[
  {
    "path": "/home/user/myproject",
    "name": "myproject",
    "hasGit": true,
    "hasClaudeMd": true
  }
]
```

### GET /sessions

List all active sessions.

```
Response:
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "projectPath": "/home/user/myproject",
    "createdAt": "2026-03-14T10:30:00.000Z",
    "alive": true
  }
]
```

### POST /sessions

Create a new session. Spawns a Claude CLI subprocess in the given project directory.

```
Request:  { "projectPath": "/home/user/myproject" }
Response: { "sessionId": "550e8400-...", "wsUrl": "ws://localhost:3400/ws/550e8400-..." }
```

To resume a crashed session:

```
Request:  { "projectPath": "/home/user/myproject", "resumeSessionId": "prev-session-id" }
```

### DELETE /sessions/:id

Kill the Claude subprocess and remove the session.

```
Response: 204 No Content
```

### GET /debug

State dump for debugging.

```
Response:
{
  "sessions": [...],
  "ipcConnected": false,
  "uptime": "3600s",
  "clientCounts": { "session-id-1": 2 }
}
```

## WebSocket Protocol

Connect to `ws://<host>:3400/ws/<sessionId>` (optionally with `?token=<AUTH_TOKEN>`).

### Phone --> Bridge

| Type | Fields | Description |
|---|---|---|
| `user_message` | `content: string` | Send a chat message to Claude |
| `reconnect` | `sessionId: string`, `lastEventId: number` | Replay missed events from buffer |
| `ui_interaction` | `componentId: string`, `action: string`, `value: any` | User interacted with a render_ui component |
| `input_response` | `requestId: string`, `value: string` | Response to a request_input prompt |

### Bridge --> Phone

Each message includes `eventId: number` for reconnection tracking.

| Type | Fields | Description |
|---|---|---|
| `claude_event` | `eventId`, `event: object` | Forwarded Claude NDJSON event (system, stream_event, assistant, user, result) |
| `ui_update` | `eventId`, `component: object` | New UI component from MCP server |
| `ui_modify` | `eventId`, `componentId`, `updates` | Update to existing component |
| `tab_create` | `eventId`, `tab: object` | New tab created by Claude |
| `tab_update` | `eventId`, `tabId`, `updates` | Tab content updated |
| `input_request` | `eventId`, `requestId`, `prompt`, `options?` | Claude is asking the user for input |
| `notification` | `eventId`, `message`, `level` | Notification from Claude |
| `session_error` | `error`, `resumable`, `sessionId?` | Claude subprocess crashed or error occurred |
| `session_ended` | `reason` | Session closed (user_closed, crashed, timeout) |

### Reconnection

When a WebSocket reconnects, the client sends `{ type: "reconnect", sessionId, lastEventId }` as its first message. The Bridge replays all buffered events after that ID. If the buffer has been exceeded (client was disconnected too long), the Bridge sends a `session_error` with a warning -- the conversation continues, but some messages may be missing.

## IPC Protocol (Bridge <--> MCP Server)

NDJSON over TCP at `127.0.0.1:3401` (configurable via `IPC_SOCKET_PATH`). Each line is a complete JSON object.

### MCP Server --> Bridge

| Type | Key Fields | Description |
|---|---|---|
| `handshake` | `sessionId` | First message after connect -- identifies which session this MCP server belongs to |
| `ui_update` | `sessionId`, `component` | Push a new UI component to the phone |
| `ui_modify` | `sessionId`, `componentId`, `updates` | Modify an existing component |
| `tab_create` | `sessionId`, `tab` | Create a new tab |
| `tab_update` | `sessionId`, `tabId`, `updates` | Update a tab |
| `input_request` | `sessionId`, `requestId`, `prompt`, `options?` | Ask user for input (blocking) |
| `notification` | `sessionId`, `message`, `level` | Send notification |

### Bridge --> MCP Server

| Type | Key Fields | Description |
|---|---|---|
| `handshake_ack` | `sessionId` | Acknowledge handshake |
| `input_response` | `requestId`, `value` | User's response to an input request |

### Session routing

The MCP server reads `VIBELINK_SESSION_ID` from its environment (set by the Bridge when spawning Claude). It sends this ID in the handshake message. The Bridge maps the IPC socket to the correct session and routes all subsequent messages accordingly.

## Configuration

All configuration is via environment variables, loaded in `config.ts`.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3400` | HTTP + WebSocket server port |
| `AUTH_TOKEN` | (empty) | Bearer token for authentication |
| `IPC_SOCKET_PATH` | `tcp:3401` | IPC transport — `tcp:PORT` for TCP or a file path for Unix socket |
| `SCAN_ROOTS` | `~/` | Comma-separated list of directories to scan for projects |
| `SCAN_MAX_DEPTH` | `3` | Maximum directory depth for project scanning |
| `SCAN_CACHE_TTL_MS` | `60000` | How long to cache project scan results (ms) |
| `EVENT_BUFFER_SIZE` | `200` | Number of events to buffer per session for reconnection |
| `WS_HEARTBEAT_INTERVAL_MS` | `30000` | WebSocket ping interval |
| `WS_HEARTBEAT_TIMEOUT_MS` | `10000` | Time to wait for pong before disconnecting client |
| `REQUEST_INPUT_TIMEOUT_MS` | `300000` | Timeout for request_input (5 minutes) |

## Development

```bash
npm install
npm run dev          # start with tsx watch (hot reload)
npm run build        # compile TypeScript to dist/
npm start            # run compiled output
```

## Testing

```bash
npm test             # run all tests (vitest)
npm run test:watch   # watch mode
```

Tests cover:
- `event-buffer.test.ts` -- circular buffer push, getAfter, overflow
- `ndjson-parser.test.ts` -- stream parsing, partial lines, malformed JSON
- `claude-process.test.ts` -- subprocess spawn, event emission, session ID extraction
- `project-scanner.test.ts` -- directory scanning, caching, exclusion rules
- `session-manager.test.ts` -- session lifecycle, message routing, shutdown
- `server.test.ts` -- REST API endpoints, WebSocket connection, event broadcast
