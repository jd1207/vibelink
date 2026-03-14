# VibeLink Phase 1 Design Spec

Open-source, self-hosted mobile companion for Claude Code. Phone app connects to your workstation over Tailscale, giving you a rich mobile interface to Claude Code with streaming chat, tool visibility, and dynamic UI components.

## Core Principles

- **Self-hosted**: everything runs on your machine and your Tailscale network. No cloud, no telemetry, no accounts beyond what you already have (Claude auth + Tailscale).
- **CLI-first**: Claude Code CLI is spawned as a subprocess. All existing config (CLAUDE.md, MCP servers, skills, hooks) works automatically. Zero configuration.
- **Phone-first UX**: the app IS the interface. Open it, pick a project, start chatting. No terminal required for daily use.
- **Privacy by design**: code and conversations never leave your network.

## System Architecture

Four processes, two on your workstation (Bridge + MCP Server), one launched by Claude (MCP Server via stdio), one on your phone (React Native app).

```
┌─────────────────┐     Tailscale      ┌──────────────────────────────┐
│  React Native    │◄── WebSocket ──►  │  Bridge Server (Node.js)     │
│  App (Android)   │                    │  - REST: /projects, /sessions│
│                  │◄── REST/HTTP ──►  │  - WS: per-session NDJSON    │
│  - Session list  │                    │  - IPC: Unix socket          │
│  - CLI tab       │                    │  - Event buffer per session  │
│  - GUI tab       │                    │  - Serves APK for QR install │
│  - Dynamic tabs  │                    │                              │
└─────────────────┘                    │  Spawns per session:         │
                                        │  └─ claude subprocess        │
                                        │     (bidirectional NDJSON)   │
                                        └──────────────────────────────┘
                                                     ▲
                                                     │ Unix socket IPC
                                        ┌──────────────────────────────┐
                                        │  VibeLink MCP Server         │
                                        │  (stdio, auto-launched)      │
                                        │  - render_ui, update_ui      │
                                        │  - create_tab, update_tab    │
                                        │  - request_input             │
                                        │  - send_notification         │
                                        └──────────────────────────────┘
```

Key decisions:
- Bridge runs as a **systemd service** (always-on, controllable via `vibelink start/stop/status`)
- **One Claude subprocess per session**, each tied to a project directory
- Bridge buffers **last 200 events per session** (with sequential IDs, configurable via `EVENT_BUFFER_SIZE`) for reconnection and tab switching
- MCP server communicates with Bridge via **Unix socket** at `/tmp/vibelink.sock` (50% lower latency than TCP loopback)
- Bridge binds to **Tailscale interface only** (or localhost, proxied via `tailscale serve`)
- Each session is independent: one crash doesn't affect others
- **MCP session identification**: Bridge sets `VIBELINK_SESSION_ID` env var on the Claude subprocess. Claude inherits this to the MCP server process. MCP server sends `{ type: "handshake", sessionId }` on IPC connect so Bridge can route messages to the correct session.

> **Note**: This Phase 1 spec is the authoritative source for implementation scope. The project CLAUDE.md describes the full multi-phase vision and may reference features, file structures, or tool lists that are out of scope for Phase 1. When in doubt, this spec takes precedence.

## Bridge Server

Node.js + TypeScript. Central hub that spawns Claude, pipes NDJSON, serves the REST API, and manages WebSocket connections.

### Responsibilities

| Concern | Implementation |
|---|---|
| HTTP API | Express. `GET /projects` (scan for git repos/CLAUDE.md), `GET /sessions`, `POST /sessions`, `DELETE /sessions/:id`, `GET /debug` |
| WebSocket | `ws` library. One WS connection per client per session. Broadcasts to all clients on same session. |
| Claude process mgmt | `child_process.spawn()` per session. Crash detection (listen `error` + `exit`). Store `session_id` for `--resume`. |
| NDJSON parsing | `ndjson` npm on Claude stdout. Pipe parsed events to WS + event buffer. |
| Event buffer | Circular buffer, 200 events per session, sequential IDs. Sent to clients on connect/reconnect. |
| IPC socket | Unix socket server at `/tmp/vibelink.sock`. MCP server connects here. NDJSON over the socket. |
| Project discovery | Scan configurable roots (default: `~/`) for directories with `.git` or `CLAUDE.md`. |
| Static files | Serve APK at `/app.apk` for QR installs. |
| Heartbeat | WS ping every 30s, expect pong within 10s. Dead clients cleaned up. |
| Graceful shutdown | SIGTERM/SIGINT handler. Notify clients, kill Claude subprocesses, close IPC socket, exit. |

### Claude Subprocess Spawn

```ts
spawn('claude', [
  '--input-format', 'stream-json',
  '--output-format', 'stream-json',
  '--verbose',
  '--include-partial-messages',
], {
  cwd: projectPath,
  stdio: ['pipe', 'pipe', 'pipe'],
  env: { ...process.env, VIBELINK_SESSION_ID: sessionId },
})
```

`--verbose` is required (Claude silently exits with code 1 without it). `--include-partial-messages` enables token-by-token streaming. `VIBELINK_SESSION_ID` is inherited by the MCP server so it can identify itself to the Bridge on IPC connect.

### Session Lifecycle

1. Phone: `POST /sessions { projectPath }` → Bridge spawns Claude → returns `{ sessionId, wsUrl }`
2. Phone opens WebSocket to `wsUrl`
3. User messages flow: phone → WS → Bridge → Claude stdin
4. Claude responses flow: Claude stdout → Bridge NDJSON parser → WS broadcast → phone
5. MCP UI updates flow: Claude → MCP server (stdio) → IPC socket → Bridge → WS → phone
6. Session end: user closes chat → Bridge can keep subprocess alive (for resume) or kill it

### Reconnection

Client sends `{ type: "reconnect", sessionId, lastEventId }` on WS connect. Bridge replays events from buffer after that ID.

### File Structure

```
bridge/
├── src/
│   ├── server.ts           # Express + WS + IPC setup
│   ├── claude-process.ts   # Spawn/manage/restart Claude
│   ├── ndjson-parser.ts    # Parse stdout stream
│   ├── session-manager.ts  # Multi-session lifecycle
│   ├── project-scanner.ts  # Find git repos/CLAUDE.md
│   ├── ipc-server.ts       # Unix socket for MCP server
│   ├── event-buffer.ts     # Circular buffer with event IDs
│   ├── ws-client.ts        # Client tracking, heartbeat, reconnect
│   ├── shutdown.ts         # Graceful shutdown manager
│   └── config.ts           # Port, scan roots, socket path
├── package.json
└── tsconfig.json
```

~650 lines total. Each file single-responsibility, under ~120 lines.

## IPC Protocol (Bridge ↔ MCP Server)

NDJSON over Unix socket at `/tmp/vibelink.sock`. Each message is a single JSON line.

### MCP → Bridge Messages

```ts
// Handshake (sent on connect)
{ type: "handshake", sessionId: string }

// UI component push
{ type: "ui_update", sessionId: string, component: { id: string, type: string, ...props } }

// UI component modification
{ type: "ui_modify", sessionId: string, componentId: string, updates: object }

// Tab management
{ type: "tab_create", sessionId: string, tab: { id: string, name: string, content?: object } }
{ type: "tab_update", sessionId: string, tabId: string, updates: object }

// Input request (blocking — waits for response)
{ type: "input_request", sessionId: string, requestId: string, prompt: string, options?: string[] }

// Notification
{ type: "notification", sessionId: string, message: string, level: "info" | "success" | "error" }
```

### Bridge → MCP Messages

```ts
// Handshake acknowledgement
{ type: "handshake_ack", sessionId: string }

// Input response (unblocks request_input)
{ type: "input_response", requestId: string, value: string }
```

Session routing: MCP server sends `sessionId` in every message. Bridge looks up the session and broadcasts to the correct WS clients. The MCP server gets its `sessionId` from the `VIBELINK_SESSION_ID` environment variable set by Bridge when spawning Claude.

## WebSocket Protocol (Bridge ↔ Phone)

### Phone → Bridge Messages

```ts
// User prompt
{ type: "user_message", content: string }

// Reconnect (sent as first message on WS connect)
{ type: "reconnect", sessionId: string, lastEventId: number }

// UI interaction (user taps something in a render_ui component)
{ type: "ui_interaction", componentId: string, action: string, value: any }

// Input response (for request_input)
{ type: "input_response", requestId: string, value: string }
```

### Bridge → Phone Messages

Each message includes an `eventId: number` for reconnection replay.

```ts
// Claude NDJSON events (forwarded from stdout, wrapped with eventId)
{ eventId: number, type: "claude_event", event: object }
// event.type is one of: "system", "stream_event", "assistant", "user" (tool_result), "result"

// UI updates from MCP server
{ eventId: number, type: "ui_update", component: object }
{ eventId: number, type: "ui_modify", componentId: string, updates: object }
{ eventId: number, type: "tab_create", tab: object }
{ eventId: number, type: "tab_update", tabId: string, updates: object }

// Input request
{ eventId: number, type: "input_request", requestId: string, prompt: string, options?: string[] }

// Notification
{ eventId: number, type: "notification", message: string, level: string }

// Session state changes
{ type: "session_error", error: string, resumable: boolean, sessionId?: string }
{ type: "session_ended", reason: "user_closed" | "crashed" | "timeout" }
```

## Auth & Pairing

Phase 1 uses a simple token-based auth. No user accounts, no passwords.

### Pairing Flow

1. `setup.sh` generates a random 256-bit token, stores in `bridge/.env` as `AUTH_TOKEN`
2. When Bridge starts, it prints a QR code containing: `vibelink://<tailscale-ip>:3400?token=<AUTH_TOKEN>`
3. Phone app scans QR (or user manually enters URL + token on first launch)
4. Phone stores the URL and token in secure storage (`expo-secure-store`)
5. Every REST request sends `Authorization: Bearer <token>` header
6. Every WebSocket connection sends token as query param: `ws://<ip>:3400/ws/<sessionId>?token=<token>`
7. Bridge validates token on every connection. Invalid token → 401 / WS close with code 4001.

No expiration, no refresh. The token is static until the user regenerates it (`vibelink regenerate-token`). This is appropriate for a self-hosted, Tailscale-only service.

## Error Handling

### Claude Subprocess Crash

1. Bridge detects via `exit` or `error` event on the child process
2. Bridge stores the last known `session_id` from Claude's `result` events
3. Bridge sends `{ type: "session_error", error: "Claude process exited unexpectedly", resumable: true, sessionId }` to all connected clients
4. Phone shows error banner with "Resume" button
5. If user taps Resume, phone sends `POST /sessions { projectPath, resumeSessionId }` → Bridge spawns Claude with `--resume <sessionId>`

### IPC Disconnect (MCP Server ↔ Bridge)

MCP server retries connection with exponential backoff (500ms → 1s → 2s → 5s max). If Bridge restarts, MCP server reconnects automatically. During disconnect, MCP tool calls return error results to Claude: `{ error: "Bridge unavailable, UI tools temporarily disabled" }`.

### WebSocket Disconnect During Streaming

Phone auto-reconnects with `lastEventId`. Bridge replays missed events from buffer. If buffer has been exceeded (client was gone too long), Bridge sends `{ type: "session_error", error: "Event buffer exceeded, some messages may be missing" }`. The conversation continues — this is not fatal.

### request_input Timeout

If the user doesn't respond to a `request_input` within 5 minutes, the MCP server returns a timeout error to Claude: `{ error: "User did not respond within timeout" }`. Claude can then decide how to proceed (ask again, use a default, etc.).

### Project Scanner

Scans directories for `.git` or `CLAUDE.md`. To avoid being slow on large filesystems:
- Max depth: 3 levels from each scan root
- Excluded dirs: `node_modules`, `.git`, `.cache`, `Library`, `.local`, `.npm`, `dist`, `build`
- Results cached for 60 seconds (re-scanned on next request after cache expires)
- Scan runs async, doesn't block server startup
- Default scan roots: `~/` (configurable via `SCAN_ROOTS` in `.env`, comma-separated)

## VibeLink MCP Server

Standalone MCP server, stdio transport. Registered once via `claude mcp add`. Auto-launched by Claude on every session. Provides tools for rich mobile UI. Talks to Bridge over Unix socket IPC.

### Tools

| Tool | Purpose | Blocks? |
|---|---|---|
| `render_ui` | Push JSON component to phone (table, form, code, chart, markdown) | No |
| `update_ui` | Modify existing component by ID | No |
| `create_tab` | Create a named tab in the app | No |
| `update_tab` | Update content in an existing tab | No |
| `request_input` | Ask user for input (text, selection). Blocks until response. | Yes |
| `send_notification` | Push notification to app | No |

### render_ui Component Types

| Type | Renders |
|---|---|
| `decision_table` | Rows + columns, optionally selectable |
| `form` | Input fields, dropdowns, checkboxes |
| `code_viewer` | Syntax-highlighted code with diff support |
| `chart` | Bar, line, pie |
| `markdown` | Rich markdown |
| `image_gallery` | Grid of images |
| `progress` | Progress bar / spinner |
| `tree_view` | File/folder tree |

### Data Flow: render_ui

```
Claude calls render_ui({ id, type, ... })
→ CLI sends tool_use to MCP server via stdio
→ MCP server writes component JSON to /tmp/vibelink.sock
→ Bridge receives on IPC, broadcasts ui_update via WS
→ Phone renders component
→ MCP server returns { success: true } to Claude
```

### Data Flow: request_input (blocking)

```
Claude calls request_input({ prompt, options })
→ MCP server sends request to Bridge via IPC
→ Bridge sends input_request to phone via WS
→ Phone shows selection UI, user taps option
→ Phone sends selection via WS → Bridge → IPC → MCP server
→ MCP server returns selection to Claude as tool result
```

### Registration

```bash
claude mcp add vibelink --scope user -- node /path/to/vibelink/mcp-server/dist/server.js
```

MCP server connects to Bridge IPC on startup. Retries with backoff if Bridge isn't ready.

### File Structure

```
mcp-server/
├── src/
│   ├── index.ts           # MCP server setup + stdio transport
│   ├── tools/
│   │   ├── render-ui.ts   # render_ui + update_ui
│   │   ├── tabs.ts        # create_tab + update_tab
│   │   ├── input.ts       # request_input (blocking)
│   │   └── notify.ts      # send_notification
│   ├── ipc-client.ts      # Connect to Bridge Unix socket
│   └── types.ts           # Component type definitions
├── package.json
└── tsconfig.json
```

~310 lines total.

## React Native Mobile App

Expo + TypeScript + NativeWind. Android-first (APK built locally). iOS support via same codebase when a Mac is available.

### Screen Flow

```
App Launch
  └→ First time: enter Bridge URL (saved permanently)
  └→ Session List (home)
       ├→ "New Chat" → Project Picker → Chat Screen
       └→ Tap existing session → Chat Screen
                                    ├── CLI tab
                                    └── GUI tab
                                    └── Dynamic tabs (created by Claude)
```

### Session List Screen

- Active/recent sessions with project name, last message preview, timestamp
- "New Chat" button → project picker
- Swipe to close/kill session
- Connection badge (green = connected, red = disconnected)

### Project Picker

- Calls `GET /projects` → shows directories with `.git` or `CLAUDE.md`
- Project name, path, last used date
- Search/filter
- Tap → `POST /sessions` → navigate to Chat Screen

### Chat Screen — CLI Tab

- Inverted FlashList (messages bottom-up, most recent at bottom)
- Streamed text with typewriter effect
- Tool use inline: `Reading src/auth.ts...`, `Editing line 47...`
- Tool results as collapsible blocks
- Input bar with autofocus, always above keyboard

### Chat Screen — GUI Tab

- Same conversation, rendered richly
- Claude text → markdown (headings, code blocks, lists)
- Tool activity → compact status chips
- `render_ui` components → rendered natively inline
- `create_tab` → adds new tab alongside CLI/GUI

### Shared Between Tabs

- Same WebSocket, same event stream
- Switching tabs preserves state (no reconnect)
- Shared input bar
- Unread indicator on inactive tab
- Input draft saved per session

### UX Patterns

- **Keyboard**: `react-native-keyboard-controller` with `KeyboardAvoidingView` behavior="padding". Interactive keyboard dismiss on drag. `maintainVisibleContentPosition` on message list.
- **Auto-scroll**: stick to bottom during streaming. Stop if user scrolls up. "Jump to bottom" pill when detached.
- **Streaming indicator**: pulsing dot before first token arrives (submitted but not yet streaming)
- **Code blocks**: tap to copy. Syntax highlighting.
- **Haptic feedback**: subtle vibration on send, tool completion
- **Safe areas**: `useSafeAreaInsets()` everywhere

### Design System

Dark-first, minimalist, developer-focused. NativeWind (Tailwind for React Native).

| Token | Value |
|---|---|
| Background | `#0a0a0a` (near-black, OLED friendly) |
| Surface | `#18181b` (zinc-900) |
| Border | `#27272a` (zinc-800) |
| Text primary | `#fafafa` (zinc-50) |
| Text secondary | `#a1a1aa` (zinc-400) |
| Accent | `#3b82f6` (blue-500) |
| Body text | 16px min, system font |
| Code text | 14px monospace |
| Spacing | 4px grid |
| Radius | 12px cards, 8px inputs, 20px bubbles |

### Performance

- FlashList (not FlatList) for message list
- `React.memo()` on message components
- `removeClippedSubviews` on Android
- WebSocket → state updates throttled to 16ms (~60fps)

### State (Zustand)

```
SessionStore: sessions map, activeSessionId
MessageStore (per session): events[], messages[], components map, tabs[], isStreaming
ConnectionStore: bridgeUrl, isConnected, wsConnections map
```

### WebSocket Client

- Auto-reconnect: exponential backoff 1s → 30s max
- Reconnect with `lastEventId` → Bridge replays missed events
- Respond to Bridge ping/pong heartbeat
- Message queue: buffer sends while disconnected, flush on reconnect

### File Structure

```
mobile/
├── app/                        # Expo Router
│   ├── index.tsx               # Session list
│   ├── projects.tsx            # Project picker
│   └── session/[id].tsx        # Chat screen
├── src/
│   ├── components/
│   │   ├── MessageBubble.tsx
│   │   ├── CliRenderer.tsx
│   │   ├── ToolActivity.tsx
│   │   ├── DynamicRenderer.tsx
│   │   ├── DecisionTable.tsx
│   │   ├── CodeViewer.tsx
│   │   ├── FormRenderer.tsx
│   │   ├── ChartView.tsx
│   │   ├── TreeView.tsx
│   │   ├── InputBar.tsx
│   │   └── ConnectionBadge.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── useStreaming.ts
│   │   ├── useProjects.ts
│   │   ├── useStickyScroll.ts
│   │   └── useDraft.ts
│   ├── store/
│   │   ├── sessions.ts
│   │   ├── messages.ts
│   │   └── connection.ts
│   ├── services/
│   │   └── bridge-api.ts
│   └── constants/
│       └── theme.ts
├── app.json
├── eas.json
├── tailwind.config.js
├── global.css
└── .gitignore                  # includes /android, /ios
```

`/android` and `/ios` gitignored. Generated via `npx expo prebuild`.

## Setup & Installation

### Prerequisites

- Linux workstation (or any OS with Node.js)
- Claude Code CLI installed and authenticated
- Node.js 22+
- Tailscale on workstation + phone (same account)
- For Android APK: Java 17+ (for Gradle)
- For iOS: Mac with Xcode + Apple Developer account

### One-Command Setup

```bash
git clone https://github.com/user/vibelink && cd vibelink
./setup.sh
```

The script:
1. Checks prerequisites (claude, node, tailscale)
2. Builds Bridge Server (`npm install && npm run build`)
3. Builds MCP Server, registers via `claude mcp add vibelink --scope user`
4. Generates JWT secret + config in `bridge/.env`
5. Optionally installs systemd service
6. Optionally builds Android APK (generates keystore, Gradle build)
7. Prints Tailscale IP, QR code, instructions

### Daily Use

```bash
vibelink start     # start bridge service
vibelink stop      # stop bridge + graceful shutdown
vibelink status    # running? sessions? clients?
```

These are wrappers around `systemctl`. When stopped, the app shows "Bridge offline."

When running: open app → pick project → chat. No terminal needed.

### Updating

```bash
cd vibelink && git pull
./setup.sh --update    # rebuild + restart service
```

### APK Distribution

| Method | How |
|---|---|
| QR over Tailscale | Bridge serves at `http://<tailscale-ip>:3400/app.apk` |
| USB | `adb install` the APK |
| Share | Send file directly |
| GitHub Releases | Future: CI-built APKs on release tags |

## Debug Workflow

### Level 1: Phone

- GUI tab shows rich output; CLI tab shows raw events
- Connection badge with tap-for-details
- If stuck, CLI tab shows exactly what Claude is doing

### Level 2: Bridge

```bash
journalctl -u vibelink -f          # live logs
curl http://localhost:3400/debug   # state dump (sessions, PIDs, clients)
```

### Level 3: Claude + MCP

```bash
claude --debug "api,mcp"    # see MCP tool calls and responses
# MCP server stderr captured by Claude debug output
```

### Common Failures

| Symptom | Cause | Fix |
|---|---|---|
| App: "Disconnected" | Bridge not running / Tailscale down | `vibelink status`, check Tailscale |
| Blank chat | Claude subprocess crashed | Bridge auto-detects, offers resume. Check logs. |
| render_ui not working | MCP ↔ Bridge IPC disconnected | Check `/tmp/vibelink.sock`. Restart bridge. |
| No projects in picker | Can't find git repos | Check scan paths in config |
| Keyboard covers input | Bug in keyboard handling | File issue (should never happen) |

## What Claude Sees

Claude gets no special system prompt from VibeLink. It runs as the normal CLI in the chosen project directory. The only addition is the VibeLink MCP tools (registered globally). Tool descriptions tell Claude what `render_ui` etc. do. If users want Claude to know about VibeLink, they add it to their own CLAUDE.md.

## Security Model

- Bridge accessible only on Tailscale network (binds to Tailscale interface)
- All traffic E2E encrypted by WireGuard (Tailscale)
- JWT auth for WebSocket connections (token from QR pairing)
- No data leaves the user's network
- No telemetry, no analytics, no external API calls (beyond Claude's own API usage)
- APK built locally, signed with user's own keystore

## Out of Scope (Future Phases)

- Voice input (Whisper STT) — Phase 4
- Camera/file uploads — Phase 4
- GitHub integration (clone repos from app) — Phase 2
- `capture_screenshot` MCP tool — Phase 3
- `stream_preview` (localhost proxy to phone) — Phase 3
- Push notifications — Phase 5
- iOS build automation — contributor docs only for now
- Web interface — possible future
