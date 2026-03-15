<div align="center">

<img src="assets/banner.svg" alt="VibeLink" width="100%"/>

<br/>

<img src="assets/demo.gif" alt="VibeLink demo — chat, streaming, workspace" width="300"/>

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

### Step 0: Ask the user two questions

Before doing anything, ask:

1. **"Are you on Android or iOS?"**
   - **Android** — proceed with APK build and install
   - **iOS** — TestFlight distribution is not built yet. Tell the user: "iOS support requires a Mac with Xcode to build locally. TestFlight distribution is on the roadmap but not available yet. If you have a Mac, I can guide you through building it with `npx expo run:ios --device`."

2. **"Do you want to use the dev client (hot-reload for development) or a release APK (daily use)?"**
   - **Release APK** — user gets **2 QR codes** (download APK + connect to bridge)
   - **Dev client** — user gets **3 QR codes** (download APK + connect to Metro dev server + connect to bridge)

### What to tell the user upfront

"Here's the deal — I'm going to do all the heavy lifting on your computer.
You just need to scan a couple QR codes with your phone. Plus a one-time
Tailscale install if you don't already have it. Takes about 10 minutes,
most of which is me building stuff."

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

**3. Build the APK.**

For **release** (daily use):
```bash
cd mobile && npm install && npx expo prebuild --platform android --clean
export JAVA_HOME=/path/to/jdk-17 && export ANDROID_HOME=/path/to/android-sdk
cd android && ./gradlew assembleRelease --no-daemon
```

For **dev client** (hot-reload development):
```bash
cd mobile && npm install && npx expo prebuild --platform android --clean
export JAVA_HOME=/path/to/jdk-17 && export ANDROID_HOME=/path/to/android-sdk
cd android && ./gradlew assembleDebug --no-daemon
```

**4. Start the bridge** (if not already running).

```bash
./vibelink start
# or: cd bridge && node dist/server.js &
```

The bridge serves the APK at `http://<tailscale-ip>:3400/apk`
(auto-detects release vs debug APK).

**5. Get connection info.**

```bash
tailscale ip -4                                    # bridge IP
grep AUTH_TOKEN bridge/.env | cut -d= -f2          # auth token
```

### What the USER does — QR codes

**Tailscale on phone** (skip if they already have it):
Tell them to download Tailscale from the App Store / Play Store and sign in
with the same account as their computer. One-time setup.

Then generate and display the QR codes. Label each one clearly.

**QR code 1 — download the app (Android only):**
The bridge serves the built APK directly. Generate a QR code for it:
```bash
node scripts/show-qr.js http://<tailscale-ip>:3400/apk
```
Tell them: "Scan this with your phone camera to download VibeLink.
Install the APK — you may need to allow 'install from unknown sources'."

**QR code 2 — connect to Metro dev server (dev client only, skip for release):**
Only needed if the user chose dev client mode. Start the dev server first:
```bash
cd mobile && npx expo start --dev-client --lan
```
Then generate the QR:
```bash
node scripts/show-qr.js http://<tailscale-ip>:<metro-port>
```
Tell them: "Open the app. It will show the dev client screen.
Scan this QR to connect to the development server."
The Metro port is shown in the `npx expo start` output (usually 8081).

**QR code 3 (or 2 for release) — connect to the bridge:**
This QR is the same regardless of platform or dev/release mode:
```bash
node scripts/show-qr.js <tailscale-ip> 3400 <auth-token>
```
Tell them: "You should see the setup screen now. Tap 'scan qr code'
and point at the screen."
If QR scanning doesn't work, give them the IP and token to type manually.

### Summary of QR codes

| Mode | QR 1 | QR 2 | QR 3 |
|:--|:--|:--|:--|
| **Release APK** | Download APK | Connect to bridge | — |
| **Dev client** | Download APK | Connect to Metro | Connect to bridge |

The bridge connection QR is always the last one scanned, inside the app's
setup screen. It's the same QR regardless of release or dev mode.

### Troubleshooting

- `tailscale status` — both devices connected?
- `curl http://localhost:3400/health` — bridge returning `{"status":"ok"}`?
- `tailscale ip -4` — correct IP?
- Phone can reach `http://<tailscale-ip>:3400/dashboard`?
- APK download not working? Try `curl http://localhost:3400/apk -o /dev/null -w "%{http_code}"` — should return 200

## Daily Use

From the vibelink directory:

```bash
./vibelink start      # start the bridge in the background
./vibelink stop       # graceful shutdown
./vibelink status     # check if running + connected clients
```

Works with or without systemd — falls back to running node directly.
Once the bridge is running, open the app on your phone.

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

### Planned (Phase 2/3)

- [ ] **Settings screen** -- quality config, disconnect, app preferences, and user-configurable stream resolution
- [ ] **Voice control mode** -- volume buttons to record and send text queries (Phase 4)
- [ ] **WebRTC transport upgrade** -- lower latency interactive streaming with better codec support (Phase 5)
- [ ] **App Store / Play Store** -- publish to stores for one-tap install (no sideloading)
- [ ] **Auto-discovery** -- find the Bridge automatically via mDNS or Tailscale MagicDNS (no manual IP entry)
- [ ] **Voice input** -- talk to Claude from your phone (Whisper STT)
- [ ] **Camera/file uploads** -- send photos and files to Claude
- [ ] **Push notifications** -- get notified when Claude finishes a long task
- [ ] **GitHub integration** -- clone repos directly from the app
- [ ] **iOS build guide** -- contributor documentation for building on Mac
- [ ] **npx vibelink-setup** -- cross-platform setup wizard, no git clone needed

### Built in Phase 3

- [x] **Screen mirroring** -- MJPEG/WebSocket streaming with window picker, 720p monitoring, and stream tabs in workspace

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
