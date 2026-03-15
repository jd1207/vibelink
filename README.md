<div align="center">

<img src="assets/banner.svg" alt="VibeLink" width="100%"/>

<br/>

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-22%2B-brightgreen.svg)](https://nodejs.org)
[![React Native](https://img.shields.io/badge/react_native-expo_54-blueviolet.svg)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)](https://www.typescriptlang.org)

[Quick Start](#quick-start) · [Roadmap](#roadmap) · [Dashboard](#dashboard) · [Contributing](#contributing)

</div>

---

## What is VibeLink

VibeLink turns your phone into a first-class interface for Claude Code. Instead of hunching over a terminal, you open an app, pick a project, and start chatting. Claude's responses stream to your phone in real time -- markdown, code blocks, tool activity, and dynamic UI components like tables, forms, charts, and file trees.

Everything runs on your machine and your Tailscale network. VibeLink spawns the real Claude Code CLI as a subprocess, so all your existing configuration -- CLAUDE.md files, MCP servers, skills, hooks, settings -- works automatically with zero setup. There's no cloud service, no accounts, no telemetry. Your code and conversations never leave your network.

The project is open source and designed for developers who already use Claude Code and want a mobile-friendly way to interact with it. The Android APK is built locally (no app store required), and the entire codebase is cross-platform TypeScript.

## How VibeLink Compares

| | **VibeLink** | Remote Control | OpenClaw |
|:--|:--:|:--:|:--:|
| Self-hosted | :white_check_mark: | | :white_check_mark: |
| Native mobile app | :white_check_mark: | :white_check_mark: | |
| Open source | :white_check_mark: | | :white_check_mark: |
| MIT license | :white_check_mark: | | |
| Dynamic UI (MCP) | :white_check_mark: | | |
| Free | :white_check_mark: | | :white_check_mark: |
| Permission control | :white_check_mark: | :white_check_mark: | |
| Multi-session | :white_check_mark: | :white_check_mark: | :white_check_mark: |
| Works offline | :white_check_mark: | | :white_check_mark: |

## Quick Start

### 1. Get the app on your phone

**Easiest (Android):** Download the latest APK from the
[Releases page](https://github.com/jd1207/vibelink/releases/latest)
and install it. Enable "install from unknown sources" if prompted.

**Build it yourself:** See [Building from Source](#building-from-source).

### 2. Set up your computer

The fastest way: tell your Claude Code to do it.

> Set up VibeLink from github.com/jd1207/vibelink

Claude will clone the repo, build the server, register the MCP tools and permission hook, and give you connection info.

Or set up manually:

```bash
git clone https://github.com/jd1207/vibelink && cd vibelink
./setup.sh          # Mac/Linux
# or
./setup.ps1         # Windows (requires WSL2 for bridge)
```

The setup script:
1. Checks prerequisites (claude, node, tailscale)
2. Builds Bridge Server and MCP Server
3. Registers the MCP server and permission hook with Claude Code
4. Generates auth token in `bridge/.env`
5. Optionally installs a background service (systemd on Linux, launchd on macOS)
6. Prints connection info and a QR code

### 3. Connect your phone

The setup script shows a QR code. Open VibeLink on your phone, tap
"scan qr code", point at the screen. Done.

**Manual entry:** If QR scanning doesn't work, type the bridge URL and
auth token shown by the setup script into the app's setup screen.

**Important:** Both your phone and computer need
[Tailscale](https://tailscale.com) installed and signed into the same
account. This creates a private encrypted connection between them.

## Setup Guide for Claude

> **If you are Claude and a user asked you to set up VibeLink, follow this.**

### What to tell the user upfront

"Here's the deal — I'm going to do all the heavy lifting on your computer.
You just need to do two things on your phone: download an app and scan a
QR code. Plus a one-time Tailscale install if you don't already have it.
That's it. Takes about 10 minutes, most of which is me building stuff."

### What YOU (Claude) do — silently, no user action needed

**1. Install prerequisites.** Check what's missing, install it yourself.

```bash
# node 22+
node --version
# Mac: brew install node
# Windows: winget install OpenJS.NodeJS
# Linux: curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs

# tailscale
tailscale --version
# Mac: brew install tailscale && sudo tailscale up
# Windows: winget install Tailscale.Tailscale
# Linux: curl -fsSL https://tailscale.com/install.sh | sh && sudo tailscale up
```

**2. Clone and run setup.** One command, non-interactive.

```bash
git clone https://github.com/jd1207/vibelink && cd vibelink
./setup.sh --auto
```

Builds everything, registers MCP + permission hook, generates auth token,
starts the bridge. Takes 2-3 minutes.

**3. Get connection info.**

```bash
tailscale ip -4                                    # bridge IP
grep AUTH_TOKEN bridge/.env | cut -d= -f2          # auth token
```

### What the USER does — only these things

**Tailscale on phone** (skip if they already have it):
Tell them to download Tailscale from the App Store / Play Store and sign in
with the same account as their computer. That's it — one-time setup.

**Get the app:**
Give them the APK download link: `https://github.com/jd1207/vibelink/releases/latest`
If no prebuilt APK exists, build it and serve it:
```bash
cd mobile && npm install && npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease && cd ..
python3 -m http.server 9090 -d android/app/build/outputs/apk/release
# tell user to open http://<tailscale-ip>:9090/app-release.apk on phone
```

**Connect — scan QR code:**
Show them the QR code:
```bash
node scripts/show-qr.js <tailscale-ip> 3400 <auth-token>
```
Tell them: "Open the app, tap 'scan qr code', point at the screen."
If QR doesn't render, give them the IP and token to type manually.

### Troubleshooting

- `tailscale status` — both devices connected?
- `curl http://localhost:3400/health` — bridge returning `{"status":"ok"}`?
- `tailscale ip -4` — correct IP?
- Phone can reach `http://<tailscale-ip>:3400/dashboard`?

## Daily Use

```bash
vibelink start      # start the bridge as a background service
vibelink stop       # graceful shutdown
vibelink status     # check running sessions and connected clients
```

Once the bridge is running, open the app on your phone. No terminal needed for daily use.

## Building from Source

### Android

**Prerequisites:** Node.js 22+, JDK 17+, Android SDK

```bash
cd mobile && npm install
npx expo prebuild --platform android --clean

export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=/path/to/android-sdk
cd android && ./gradlew assembleRelease
```

APK: `mobile/android/app/build/outputs/apk/release/app-release.apk`

Install via browser download, `adb install`, or local HTTP server.

### iOS (requires Mac + Xcode)

```bash
cd mobile && npm install
npx expo prebuild --platform ios --clean
npx expo run:ios --device --configuration Release
```

### Low-memory systems

If Gradle crashes (e.g., Steam Deck with 16GB shared RAM), add to
`mobile/android/gradle.properties`:

```
org.gradle.jvmargs=-Xmx1536m
```

And build with: `./gradlew assembleRelease --no-daemon`

## Architecture

```
Phone (React Native)
  |
  | WebSocket + REST
  | (over Tailscale)
  v
Bridge Server (Node.js)
  |               |
  | stdin/stdout   | Unix socket
  | NDJSON         | IPC
  v               v
Claude CLI     MCP Server
(subprocess)   (render_ui, tabs,
               request_input)
```

## Requirements

- **Node.js 22+** — bridge and MCP server
- **Claude Code CLI** — installed and authenticated
- **Tailscale** — on workstation + phone (same account)
- **Java 17+** — only for building Android APK

## Dashboard

Open **http://localhost:3400/dashboard** in your browser to see:
- Active sessions with process status
- Connected clients
- Embedded chat (synced with your phone)
- Terminal view of raw Claude events
- Session management (end sessions, end all)

## Security and Privacy

- **Self-hosted**: everything runs on your workstation
- **Tailscale**: E2E encrypted via WireGuard
- **Token auth**: 256-bit token on every request
- **No telemetry**: no analytics, no tracking, no external calls
- **Local APK**: built and signed on your machine

See [SECURITY.md](SECURITY.md) for details.

## Project Structure

```
vibelink/
  bridge/         Bridge Server (Node.js + TypeScript)
  mcp-server/     MCP Server for Claude Code
  mobile/         React Native App (Expo + TypeScript)
  hooks/          Claude Code permission hook
  scripts/        QR code generator, utilities
  setup.sh        Setup script (Mac/Linux)
  setup.ps1       Setup script (Windows)
  vibelink        CLI wrapper (start/stop/status)
```

See package READMEs for internals:
- [bridge/README.md](bridge/README.md)
- [mcp-server/README.md](mcp-server/README.md)
- [mobile/README.md](mobile/README.md)

## Roadmap

### Built

- [x] **Bridge Server** -- Node.js server that spawns Claude CLI subprocesses, manages sessions, streams NDJSON over WebSocket
- [x] **MCP Server** -- registered with Claude Code, provides render_ui, create_tab, update_ui, request_input, send_notification tools
- [x] **Mobile App** -- React Native (Expo) with session list, project picker, chat with streaming responses
- [x] **Chat View** -- messages rendered as markdown with code blocks, tool activity indicators, streaming text
- [x] **Workspace Tab** -- persistent canvas with session metadata, HTML rendering via MCP, and localhost preview
- [x] **Multi-Session** -- run multiple Claude sessions in different project directories simultaneously
- [x] **Project Discovery** -- auto-scans your filesystem for git repos and CLAUDE.md projects
- [x] **Dashboard** -- localhost web UI for managing sessions and debugging (http://localhost:3400/dashboard)
- [x] **Auth** -- token-based authentication for all connections
- [x] **Permission Control** -- PreToolUse hook gates every tool call, toggle to skip or approve individually
- [x] **Auto-Reconnect** -- WebSocket reconnects with event replay on disconnect
- [x] **QR Code Setup** -- scan a QR code from the setup script to connect instantly
- [x] **Deep Link Support** -- vibelink://connect URIs auto-fill connection info
- [x] **Cross-Platform Setup** -- setup.sh (Mac/Linux) and setup.ps1 (Windows/WSL2)
- [x] **Disconnect/Reconfigure** -- change bridge connection without reinstalling

### In Progress

- [ ] **Dynamic UI rendering** -- render_ui components (tables, forms, charts) displayed in workspace and chat
- [ ] **Setup script testing** -- end-to-end validation on fresh Mac and Windows installs

### Planned

- [ ] **App Store / Play Store** -- publish to stores for one-tap install (no sideloading)
- [ ] **Localhost preview** -- see your dev server running on your phone via stream_preview MCP tool
- [ ] **Auto-discovery** -- find the Bridge automatically via mDNS or Tailscale MagicDNS (no manual IP entry)
- [ ] **Voice input** -- talk to Claude from your phone (Whisper STT)
- [ ] **Camera/file uploads** -- send photos and files to Claude
- [ ] **Push notifications** -- get notified when Claude finishes a long task
- [ ] **GitHub integration** -- clone repos directly from the app
- [ ] **iOS build guide** -- contributor documentation for building on Mac
- [ ] **npx vibelink-setup** -- cross-platform setup wizard, no git clone needed

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for code style and contribution guidelines.

### Dev Client (hot-reload development)

Build a debug APK once, then iterate with live reload:

```bash
cd mobile && npm install
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleDebug
# install debug APK on phone, then:
npx expo start --dev-client
```

Code changes appear on the phone instantly without rebuilding.

## License

MIT
