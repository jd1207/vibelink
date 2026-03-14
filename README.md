# VibeLink

Self-hosted mobile companion for Claude Code. Chat from your phone, get rich dynamic UI, all on your own network.

## What is VibeLink

VibeLink turns your phone into a first-class interface for Claude Code. Instead of hunching over a terminal, you open an app, pick a project, and start chatting. Claude's responses stream to your phone in real time -- markdown, code blocks, tool activity, and dynamic UI components like tables, forms, charts, and file trees.

Everything runs on your machine and your Tailscale network. VibeLink spawns the real Claude Code CLI as a subprocess, so all your existing configuration -- CLAUDE.md files, MCP servers, skills, hooks, settings -- works automatically with zero setup. There's no cloud service, no accounts, no telemetry. Your code and conversations never leave your network.

The project is open source and designed for developers who already use Claude Code and want a mobile-friendly way to interact with it. The Android APK is built locally (no app store required), and the entire codebase is cross-platform TypeScript.

## Architecture Overview

```
+-------------------+                         +------------------------------+
|                   |     Tailscale (E2E      |                              |
|  React Native     |     encrypted)          |  Bridge Server (Node.js)     |
|  App (Phone)      |<--- WebSocket --------->|                              |
|                   |<--- REST/HTTP --------->|  - REST API (/projects, etc) |
|  - Session list   |                         |  - WebSocket (per-session)   |
|  - CLI tab        |                         |  - Event buffer (200 events) |
|  - GUI tab        |                         |  - Project scanner           |
|  - Dynamic tabs   |                         |                              |
|                   |                         |  Spawns per session:         |
+-------------------+                         |  +- claude CLI subprocess    |
                                              |     (bidirectional NDJSON)   |
                                              +------------------------------+
                                                            ^
                                                            | Unix socket IPC
                                                            | (/tmp/vibelink.sock)
                                              +------------------------------+
                                              |                              |
                                              |  VibeLink MCP Server         |
                                              |  (stdio, auto-launched       |
                                              |   by Claude per session)     |
                                              |                              |
                                              |  Tools:                      |
                                              |  - render_ui, update_ui      |
                                              |  - create_tab, update_tab    |
                                              |  - request_input             |
                                              |  - send_notification         |
                                              +------------------------------+
```

**Data flows:**
- You type on your phone --> WebSocket --> Bridge --> Claude CLI stdin (NDJSON)
- Claude responds --> stdout NDJSON --> Bridge --> WebSocket --> your phone
- Claude calls MCP tools --> MCP Server --> IPC socket --> Bridge --> WebSocket --> your phone

## Requirements

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 22+ | Bridge and MCP server runtime |
| Claude Code CLI | Latest | Must be installed and authenticated |
| Tailscale | Any | On both workstation and phone, same account |
| Java | 17+ | Only needed for building Android APK (Gradle) |
| Mac + Xcode | Latest | Only needed for iOS builds |

## Quick Start

```bash
git clone https://github.com/user/vibelink && cd vibelink
./setup.sh
```

The setup script:
1. Checks prerequisites (claude, node, tailscale)
2. Builds Bridge Server and MCP Server
3. Registers the MCP server with Claude Code
4. Generates auth token in `bridge/.env`
5. Optionally installs a systemd service
6. Optionally builds the Android APK
7. Prints your Tailscale IP, a QR code, and connection instructions

## Android Setup

### Building the APK

```bash
cd mobile
npm install
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

The APK is output to `android/app/build/outputs/apk/release/`.

### Installing on your phone

| Method | How |
|---|---|
| QR over Tailscale | Bridge serves the APK at `http://<tailscale-ip>:3400/app.apk` |
| USB | `adb install path/to/app-release.apk` |
| File share | Send the APK directly to your phone |

On first launch, enter your Bridge URL (the Tailscale IP + port printed during setup). The app saves this permanently.

## iOS Setup

iOS builds require a Mac with Xcode and an Apple Developer account. The codebase is fully cross-platform -- the same TypeScript/React Native code runs on both platforms.

```bash
cd mobile
npm install
npx expo prebuild --platform ios
npx expo run:ios --device --configuration Release
```

Contributor guide for iOS builds is planned. If you have a Mac and want to help, contributions are welcome.

## Daily Use

```bash
vibelink start      # start the bridge as a background service
vibelink stop       # graceful shutdown (notifies clients, kills subprocesses)
vibelink status     # check if running, active sessions, connected clients
```

These are wrappers around `systemctl`. Once the bridge is running, just open the app on your phone:

1. **Session list** -- see active and recent sessions
2. **New Chat** -- pick a project directory, start a session
3. **Chat** -- type messages, see streaming responses, interact with dynamic UI

No terminal required for daily use.

## Security and Privacy

- **Self-hosted**: everything runs on your workstation. No cloud, no third-party servers.
- **Tailscale**: all traffic between phone and workstation is end-to-end encrypted via WireGuard.
- **Token auth**: a 256-bit token generated during setup. Sent as a Bearer token on every request.
- **No telemetry**: no analytics, no tracking, no external API calls (beyond Claude's own API usage).
- **Local APK**: the Android app is built and signed on your machine with your own keystore.
- **No data leaves your network**: code and conversations stay between your phone and workstation.

## How It Works

VibeLink takes a **CLI-first** approach. The Bridge Server spawns the real Claude Code CLI binary as a subprocess with bidirectional NDJSON streaming. This means all your existing Claude Code configuration -- project CLAUDE.md files, globally registered MCP servers, skills, hooks, and settings -- works automatically.

The MCP server is a separate process that gives Claude tools to push rich UI to your phone (`render_ui`, `create_tab`, `request_input`, etc.). It's registered once with `claude mcp add` and auto-launched by Claude on every session. The MCP server communicates with the Bridge over a Unix socket, and the Bridge forwards everything to your phone over WebSocket.

Claude gets no special system prompt from VibeLink. It runs as the normal CLI in the chosen project directory. The only addition is the VibeLink MCP tools.

## Project Structure

```
vibelink/
+-- bridge/                    Bridge Server (Node.js + TypeScript)
|   +-- src/                   ~650 lines across 10 source files
|   +-- package.json
|   +-- tsconfig.json
+-- mcp-server/                VibeLink MCP Server (Node.js + TypeScript)
|   +-- src/                   ~310 lines across 7 source files
|   +-- package.json
|   +-- tsconfig.json
+-- mobile/                    React Native App (Expo + TypeScript)
|   +-- app/                   Expo Router screens
|   +-- src/                   Components, hooks, stores, services
|   +-- package.json
|   +-- app.json
+-- docs/                      Design specs and documentation
+-- setup.sh                   One-command setup script
+-- CLAUDE.md                  Project-level Claude Code config
```

See individual package READMEs for detailed architecture:
- [bridge/README.md](bridge/README.md) -- Bridge Server internals, REST API, WebSocket protocol
- [mcp-server/README.md](mcp-server/README.md) -- MCP tools, IPC protocol, registration
- [mobile/README.md](mobile/README.md) -- App screens, design system, state management

## Contributing

### Building each package

```bash
# bridge
cd bridge && npm install && npm run build
npm run dev          # development with hot reload
npm test             # run tests

# mcp server
cd mcp-server && npm install && npm run build
npm run dev          # development
npm test             # run tests

# mobile
cd mobile && npm install
npx expo start       # development server (Expo Go or dev client)
```

### Registering the MCP server

```bash
claude mcp add vibelink --scope user -- node /path/to/vibelink/mcp-server/dist/server.js
```

### Debug workflow

```bash
# bridge logs
journalctl -u vibelink -f

# bridge state dump
curl http://localhost:3400/debug

# claude + mcp debug
claude --debug "api,mcp"
```

### Phase 1 scope

The current implementation covers the full stack: Bridge Server, MCP Server (render_ui, tabs, input, notification tools), React Native app (session list, project picker, CLI + GUI tabs), setup script, and debug workflow.

See the [Phase 1 design spec](docs/superpowers/specs/2026-03-14-vibelink-phase1-design.md) for the full specification.

## License

MIT
