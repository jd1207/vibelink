# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Phase 1 spec is authoritative**: See `docs/superpowers/specs/2026-03-14-vibelink-phase1-design.md` for the detailed implementation spec. This file describes the full multi-phase vision. When they conflict, the Phase 1 spec takes precedence for current work.

## What Is VibeLink

A private, self-hosted mobile companion for Claude Code. Users build a React Native app locally (no app store), connect their phone to their workstation over Tailscale, and interact with Claude Code through rich dynamic UI — tables, forms, charts, code viewers, live localhost previews.

**CLI-first architecture (v2):** The Claude Code CLI binary is spawned as a subprocess with bidirectional `stream-json`. All existing Claude Code config (CLAUDE.md, MCP servers, skills, hooks, settings) works automatically — zero configuration. Custom tools are delivered via a standalone MCP server. This is NOT the Agent SDK approach (v1) — that was abandoned because it silently ignores CLI settings.

## Architecture

Four components, two Node.js processes:

```
Phone (React Native) ←WebSocket/Tailscale→ Bridge Server (Node.js)
                                              ├─ stdin/stdout (NDJSON) → Claude Code CLI (subprocess)
                                              └─ IPC (Unix socket) ← VibeLink MCP Server (stdio, launched by Claude)
```

**Bridge Server** (`bridge/`): Central hub. Spawns Claude subprocess with `VIBELINK_SESSION_ID` env var, pipes NDJSON between CLI and mobile clients over WebSocket, runs support services, token-based auth.

**VibeLink MCP Server** (`mcp-server/`): Standalone MCP server registered with `claude mcp add`. Auto-launched by Claude on every session. Reads `VIBELINK_SESSION_ID` from env to identify itself on IPC handshake. Talks to Bridge over Unix socket at `/tmp/vibelink.sock`.

Phase 1 MCP tools: `render_ui`, `update_ui`, `create_tab`, `update_tab`, `request_input`, `send_notification`.
Future tools (Phase 3+): `capture_screenshot`, `stream_preview`.

**Claude Code CLI**: Spawned with `--input-format stream-json --output-format stream-json --verbose --include-partial-messages`. The `--verbose` flag is **required** — without it stream-json silently exits with code 1. Process stays alive for multi-turn; use `--resume` with `session_id` if restarted.

**React Native App** (`mobile/`): Expo-based, NativeWind styling.
Phase 1 tabs: CLI (raw event stream), GUI (rich markdown + dynamic components), Dynamic Tabs (created by Claude via MCP).
Future tabs (Phase 3+): Preview (WebView proxying localhost).

## Project Structure (Phase 1)

```
vibelink/
├── bridge/                    # Bridge Server (Node.js + TypeScript)
│   └── src/
│       ├── server.ts          # Express + WS + IPC setup
│       ├── claude-process.ts  # Spawn/manage Claude subprocess
│       ├── ndjson-parser.ts   # Parse NDJSON stream from stdout
│       ├── session-manager.ts # Multi-session lifecycle
│       ├── project-scanner.ts # Find git repos/CLAUDE.md dirs
│       ├── ipc-server.ts      # Unix socket for MCP server
│       ├── event-buffer.ts    # Circular buffer with event IDs
│       ├── ws-client.ts       # Client tracking, heartbeat, reconnect
│       ├── shutdown.ts        # Graceful shutdown manager
│       └── config.ts          # Port, scan roots, socket path
├── mcp-server/                # VibeLink MCP Server (Node.js + TypeScript)
│   └── src/
│       ├── index.ts           # MCP server setup + stdio transport
│       ├── tools/             # Tool handlers (render-ui, tabs, input, notify)
│       ├── ipc-client.ts      # Connect to Bridge's IPC socket
│       └── types.ts           # Component type definitions
├── mobile/                    # React Native app (Expo + TypeScript)
│   ├── app/                   # Expo Router (index, projects, session/[id])
│   └── src/
│       ├── components/        # MessageBubble, CliRenderer, DynamicRenderer, etc.
│       ├── hooks/             # useWebSocket, useStreaming, useStickyScroll, etc.
│       ├── store/             # Zustand (sessions, messages, connection)
│       ├── services/          # Bridge REST client
│       └── constants/         # Theme tokens
├── setup.sh                   # One-command setup script
└── docs/superpowers/specs/    # Design specs
```

## Build & Run Commands

```bash
# bridge server
cd bridge && npm install && npm run build
npm start                           # runs the bridge

# mcp server
cd mcp-server && npm install && npm run build
claude mcp add vibelink --scope user -- node $(pwd)/mcp-server/dist/server.js

# mobile app (android)
cd mobile && npm install
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease    # APK at app/build/outputs/apk/release/

# mobile app (ios — requires mac + xcode)
npx expo prebuild --platform ios
npx expo run:ios --device --configuration Release

# full setup
./setup.sh                          # interactive: builds everything, registers MCP, optional APK build

# daily use
vibelink start                    # start bridge as background service
vibelink stop                     # graceful shutdown
vibelink status                   # running? sessions? clients?
```

## CLI Subprocess Protocol

Sending a message to Claude (Bridge writes to subprocess stdin):
```json
{"type":"user","message":{"role":"user","content":[{"type":"text","text":"Fix the auth bug"}]}}
```

Stdout NDJSON event types to handle: `system` (init), `stream_event` (text_delta for real-time streaming), `assistant` (full message with content blocks including `tool_use`), `user` (tool_result), `result` (final with session_id, cost, usage).

## Key Gotchas

- `--verbose` is **required** when using `stream-json` — Claude silently exits with code 1 without it
- `--print` mode is one-shot (exits after response) and skips session hooks — use bidirectional `stream-json` instead
- `--append-system-prompt` is ephemeral (not preserved on `--resume`) — use CLAUDE.md for persistent instructions
- Claude Code must be restarted to pick up MCP config changes after `claude mcp add`
- MCP tool output over 10,000 tokens triggers a warning — keep `render_ui` results concise
- Stream backpressure: Claude emits tokens faster than phones render — buffer in Bridge, batch WebSocket sends at ~60fps
- MCP server is spawned by Claude (not Bridge) — session identification via `VIBELINK_SESSION_ID` env var

## Implementation Phases

1. **Phase 1** (current): Full stack — Bridge, MCP server (render_ui, tabs, input), React Native app (CLI + GUI tabs), setup script, debug workflow
2. **Phase 2**: GitHub integration (clone repos from app), additional render_ui components
3. **Phase 3**: `capture_screenshot`, `stream_preview` (localhost proxy to phone), Preview tab
4. **Phase 4**: Voice input (Whisper STT), camera/gallery uploads, file picker
5. **Phase 5**: Push notifications, session history browser, offline queuing

## Tech Stack

- **Bridge**: Node.js, TypeScript, Express, ws (WebSocket)
- **MCP Server**: Node.js, TypeScript, @modelcontextprotocol/sdk, stdio transport
- **Mobile**: React Native, Expo, TypeScript, NativeWind, Zustand, FlashList, react-native-keyboard-controller
- **Networking**: Tailscale (WireGuard mesh VPN, E2E encrypted)
- **Build**: Android APK via Gradle (no Play Store), iOS via Xcode (contributor-provided)
- **Service**: systemd (background service)
