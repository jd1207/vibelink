# VibeLink Onboarding Design

> Goal: A non-technical user on Mac or Windows can go from a GitHub link to chatting with Claude on their phone in under 10 minutes, with 3 or fewer manual actions on the phone.

## The Golden Path

```
User tells their Claude: "Set up VibeLink from github.com/jd1207/vibelink"

Claude:
  1. Reads README
  2. Clones repo
  3. Detects OS (Mac/Windows/Linux)
  4. Runs setup script
  5. Bridge + MCP server built and running
  6. Prints: "Download the APK from [releases link], install it,
     then scan this QR code:"
  7. Renders QR code in terminal

User:
  1. Downloads APK, installs on phone
  2. Opens app, scans QR code
  3. Connected — sees projects, starts chatting
```

## Phone-Side: Three Install Options

### Option 1: Prebuilt APK (Android — recommended for non-technical users)

- Download `.apk` from GitHub Releases page on phone browser
- Tap to install (enable "install from unknown sources" if prompted)
- Open app → scan QR code from setup script → connected

The APK is a blank client — no hardcoded URLs, tokens, or server connections.
It connects to whatever bridge the user points it at. Same source code as
self-built. Users who want to verify can read the source or build from source
themselves.

**How to get APK onto phone:**
- Easiest: open GitHub Releases URL in phone browser, tap download
- Alternative: host locally with `python3 -m http.server 9090` in the APK
  directory, open `http://<ip>:9090/app-release.apk` on phone
- Alternative: `adb install app-release.apk` over USB

**iOS gap:** No prebuilt option until App Store publication. iOS users must
build from source on a Mac (Option 2) or wait for App Store availability.

### Option 2: Build from Source (developers, iOS users)

```bash
cd mobile && npm install
npx expo prebuild --platform android --clean
cd android && ./gradlew assembleRelease
```

APK output: `mobile/android/app/build/outputs/apk/release/app-release.apk`

**Prerequisites:** Node.js 22+, JDK 17+, Android SDK.
Environment variables must be set before Gradle:
```bash
export JAVA_HOME=/path/to/jdk-17
export ANDROID_HOME=/path/to/android-sdk
```

**iOS (requires Mac + Xcode):**
```bash
cd mobile && npm install
npx expo prebuild --platform ios --clean
npx expo run:ios --device --configuration Release
```

**Low-memory systems (e.g. Steam Deck, 16GB shared RAM):**
Gradle daemon crashes at default heap size. Add to `mobile/android/gradle.properties`:
```
org.gradle.jvmargs=-Xmx1536m
```
And build with `--no-daemon`:
```bash
./gradlew assembleRelease --no-daemon
```
Build takes ~12 minutes on Steam Deck.

### Option 3: Dev Client (contributors iterating on app code)

Same build step as Option 2, but debug instead of release:
```bash
cd android && ./gradlew assembleDebug
```

Install the debug APK, then run the dev server:
```bash
npx expo start --dev-client
```

Scan the Metro QR code — app connects to the dev server for hot-reload.
Code changes on the computer appear on the phone instantly without rebuilding.

`expo-dev-client` is already installed in the project.

**This option is only for people editing VibeLink's app code.** End users
should use Option 1 or 2.

### App Store / Play Store (Roadmap)

The simplest possible onboarding — download from store, scan QR, done.

- **Play Store:** $25 one-time, 1-3 day review. VibeLink is a clean fit
  (client app, no IAP, no dynamic code loading). Same pattern as Home
  Assistant companion.
- **App Store:** $99/year, ~24hr review. Solves the iOS distribution problem.
- **Precedent:** Home Assistant, Plex, Tailscale all follow this model.
- **Key requirements:** Privacy policy URL, data safety questionnaire,
  account deletion flow (Apple).

Not implementing now. Will revisit after core features stabilize.

## Computer-Side: Setup Scripts

### Current State

`setup.sh` is bash-only, uses systemd (Linux-only), has interactive prompts,
and registers the wrong hook event name (`PermissionRequest` instead of
`PreToolUse`).

### Proposed Changes

#### setup.sh (Mac + Linux)

- Add `--auto` flag for non-interactive mode (Claude runs this)
- Detect OS: macOS vs Linux
- Fix hook registration to use `PreToolUse` (not `PermissionRequest`)
- Replace systemd prompt with OS-appropriate service:
  - Linux: systemd (existing)
  - macOS: launchd plist
- Add QR code output at end (see QR Code section below)
- Remove APK build prompt (that's a separate step, not part of server setup)
- Add ASCII art banner

#### setup.ps1 (Windows) — New

PowerShell equivalent of setup.sh. Implementation details TBD — use setup.sh
as the reference and translate to PowerShell idioms.

- Same prereq checks: `Get-Command claude`, `Get-Command node`, `Get-Command tailscale`
- Same build steps (npm install, npm run build)
- Same MCP registration (claude mcp add)
- Hook registration via `ConvertFrom-Json` / `ConvertTo-Json` (no jq dependency)
- Token generation via `[System.Security.Cryptography.RandomNumberGenerator]`
- Background service: Windows Task Scheduler (`schtasks`) or startup shortcut
- QR code output at end

**Windows IPC limitation:** The Bridge uses a Unix domain socket at
`/tmp/vibelink.sock` for MCP server IPC. This does not work on native Windows.
Windows users must either:
- Run the bridge inside WSL2 (recommended — setup.ps1 detects and uses WSL)
- Wait for a future PR that adds named pipe support (`\\.\pipe\vibelink`)

The setup.ps1 script should detect whether WSL2 is available and guide the
user accordingly. Native Windows bridge support is deferred to a future PR.

#### Common behavior (both scripts)

1. Check prerequisites: `claude`, `node` (22+), `tailscale` (warn if missing)
2. Build bridge: `cd bridge && npm install && npm run build`
3. Build MCP server: `cd mcp-server && npm install && npm run build`
4. Register MCP: `claude mcp add vibelink --scope user -- node <path>/mcp-server/dist/index.js`
5. Register PreToolUse hook in `~/.claude/settings.json`
6. Generate auth token in `bridge/.env` (if not exists)
7. Detect Tailscale IP (if available)
8. Output connection info + QR code

#### Non-interactive mode (`--auto`)

When Claude runs setup, it passes `--auto`:
- Skips all prompts
- Installs background service (OS-appropriate)
- Outputs plain text connection info (not QR — Claude's stream-json can't
  render terminal QR blocks)
- Exits cleanly

This is the mode Claude uses. Claude then relays the connection info to the
user: "Your bridge is at 100.x.x.x:3400, token is abc123. Download the APK
from [releases link] and enter these in the app."

Humans who run `./setup.sh` without flags get the interactive experience
with prompts and a rendered QR code in the terminal.

## QR Code Connection

### Setup-side (terminal output)

At the end of setup, render a QR code in the terminal using the
`qrcode-terminal` npm package (added as a bridge dependency or standalone
script).

The QR encodes a URI:
```
vibelink://connect?host=100.85.13.101&port=3400&token=a1b2c3d4e5f6...
```

Fallback for terminals that can't render QR:
```
Or enter manually in the app:
  Bridge: 100.85.13.101:3400
  Token:  a1b2c3d4e5f6...
```

### App-side changes

1. **QR Scanner on setup screen:** Add a "Scan QR Code" button below the
   manual entry fields. Uses `expo-camera` for scanning. On scan, parse the
   `vibelink://` URI and auto-fill host + token fields.

2. **Deep link handler:** `vibelink://` scheme is already registered in
   `app.json` (`"scheme": "vibelink"`). When the app receives
   `vibelink://connect?host=X&port=Y&token=Z`, navigate to setup screen
   with fields pre-filled, auto-connect. **Init race condition:** deep links
   may arrive before the app finishes its async SecureStore read in
   `_layout.tsx`. The handler must queue incoming deep links and process
   them after the `ready` state is set.

   **Invalid QR handling:** If the scanned QR is not a valid `vibelink://`
   URI, show a toast: "Not a VibeLink QR code. Try scanning the code from
   your setup script." Manual entry still works as fallback.

3. **Setup screen layout (revised):**
   ```
   ┌─────────────────────────┐
   │       vibelink          │
   │                         │
   │  [  Scan QR Code    ]   │
   │                         │
   │  ── or enter manually ──│
   │                         │
   │  Bridge URL             │
   │  [ 100.64.0.1:3400   ] │
   │                         │
   │  Auth Token             │
   │  [ ••••••••••••••••   ] │
   │                         │
   │  [     Connect      ]   │
   └─────────────────────────┘
   ```

4. **Camera permission:** Only requested when user taps "Scan QR Code."
   If denied, manual entry still works.

5. **Reconfiguration:** Add a "Disconnect" option accessible from the
   sessions list screen (e.g., long-press header or settings icon). This
   clears stored credentials from SecureStore and returns to the setup
   screen. Needed when the bridge URL or token changes.

6. **Tailscale prerequisite:** The setup screen should note below the URL
   field: "Both your phone and computer need Tailscale on the same account."
   If the bridge is unreachable, the error message should suggest checking
   Tailscale connectivity.

## README Restructure

### Current structure

Single "Quick Start" section with `./setup.sh`. Android/iOS setup buried
further down. No guidance for Claude-assisted setup.

### Proposed structure

```markdown
## Quick Start

### 1. Get the app on your phone

**Easiest:** Download the latest APK from
[Releases](github.com/.../releases) and install it.

**Build it yourself:** See [Building from Source](#building-from-source).

### 2. Set up your computer

Tell your Claude Code:
> "Set up VibeLink from github.com/jd1207/vibelink"

Or run manually:
  git clone ... && cd vibelink && ./setup.sh

### 3. Connect

Scan the QR code shown by the setup script. Done.

## Building from Source

### Android
  [prerequisites, build commands, APK location]

### iOS (requires Mac)
  [prerequisites, build commands]

### Low-memory systems
  [Gradle heap settings, --no-daemon]

## Contributing

### Dev Client (hot-reload development)
  [debug build + expo start --dev-client]

## Roadmap

### App Store / Play Store
  [brief note, link to tracking issue]
```

### Key changes:
- Lead with the prebuilt APK (easiest path)
- "Tell your Claude" as the primary setup instruction
- QR code is the connection method, manual entry is fallback
- Dev Client moved to Contributing section
- Platform-specific gotchas in their own sections

## Implementation Scope

### Must build (this PR):
1. Fix `setup.sh` — `PreToolUse` hook, `--auto` flag, QR code output,
   remove APK build prompt, add ASCII art banner
2. Create `setup.ps1` — Windows equivalent (WSL2-based for bridge runtime)
3. Add QR code generation (small Node.js script using `qrcode-terminal`)
4. App: QR scanner on setup screen (`expo-camera` — new native dependency,
   requires fresh `expo prebuild`)
5. App: `vibelink://` deep link handler with init race condition handling
6. App: "Disconnect" / reconfigure option on sessions screen
7. README restructure with three install paths + Claude-assisted setup
8. Fix CLAUDE.md — MCP entry point is `dist/index.js` (not `dist/server.js`)

### Roadmap (future PRs):
- GitHub Actions workflow for automated APK builds on tagged releases
- App Store / Play Store publication
- `npx vibelink-setup` wizard (Approach B from brainstorming)
- Auto-discovery via mDNS / Tailscale MagicDNS
- iOS build guide for contributors
- Native Windows bridge support (named pipes instead of Unix socket)
