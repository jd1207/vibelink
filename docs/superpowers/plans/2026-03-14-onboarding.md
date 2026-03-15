# VibeLink Onboarding Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make onboarding so simple that a non-technical user goes from a GitHub link to chatting on their phone with two QR code scans and a Tailscale install.

**Architecture:** Fix setup.sh (cross-platform, non-interactive mode, QR output), add QR scanner + deep link handler to mobile app, restructure README as the primary onboarding document that Claude can follow autonomously.

**Tech Stack:** Node.js (qrcode-terminal), React Native (expo-camera, expo-linking), Bash, PowerShell

**Spec:** `docs/superpowers/specs/2026-03-14-onboarding-design.md`

---

## File Structure

### New files:
- `setup.ps1` — Windows PowerShell setup script (WSL2-based bridge)
- `scripts/show-qr.js` — standalone Node.js script to generate terminal QR code

### Modified files:
- `setup.sh` — fix hook registration, add `--auto` flag, QR output, ASCII banner
- `mobile/app/setup.tsx` — add QR scanner button, deep link auto-fill
- `mobile/app/_layout.tsx` — deep link handler with init queue
- `mobile/app/index.tsx` — add disconnect/reconfigure option
- `mobile/app.json` — add expo-camera plugin
- `mobile/package.json` — add expo-camera dependency
- `README.md` — full restructure with three install paths
- `CLAUDE.md` — fix MCP entry point path

### Not modified (confirmed no conflicts with workspace-tab branch):
- `bridge/src/server.ts`
- `bridge/src/config.ts`
- `hooks/permission-hook.js`
- `mobile/src/store/` (workspace branch touches this)
- `mobile/src/components/` (workspace branch adds new components)
- `mobile/src/hooks/` (workspace branch touches this)

---

## Chunk 1: Setup Script Fixes

### Task 1: Fix setup.sh hook registration

**Files:**
- Modify: `setup.sh:31-54`

The current setup.sh registers `PermissionRequest` (wrong event) instead of `PreToolUse`.

- [ ] **Step 1: Fix the hook event name in setup.sh**

Replace every occurrence of `PermissionRequest` with `PreToolUse` in setup.sh.

In the jq merge (line 34-36):
```bash
jq --arg cmd "$HOOK_CMD" '
  .hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"type": "command", "command": $cmd}] | unique_by(.command))
' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
```

In the fresh settings file creation (lines 44-52):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "$HOOK_CMD"
      }
    ]
  }
}
```

- [ ] **Step 2: Verify the fix**

Read the modified setup.sh and confirm no remaining references to `PermissionRequest`.

- [ ] **Step 3: Commit**

```bash
git add setup.sh
git commit -m "fix: setup.sh registers PreToolUse hook (not PermissionRequest)"
```

### Task 2: Add --auto flag and ASCII banner to setup.sh

**Files:**
- Modify: `setup.sh`

- [ ] **Step 1: Add AUTO_MODE flag parsing at the top**

After `set -e`, add:
```bash
AUTO_MODE=false
if [[ "${1:-}" == "--auto" ]]; then
  AUTO_MODE=true
fi
```

- [ ] **Step 2: Add ASCII art banner**

Replace the `echo "=== VibeLink Setup ==="` block with:
```bash
echo ""
echo "  _    _ ___ ___  ___ _    ___ _  _ _  __"
echo " | |  / |_ _| _ )| __| |  |_ _| \\| | |/ /"
echo " | \\/|  || || _ \\| _|| |__ | ||    |   < "
echo "  \\_/\\_/|___|___/|___|____|___|_|\\_|_|\\_\\"
echo ""
```

- [ ] **Step 3: Make interactive prompts respect AUTO_MODE**

Replace the systemd service prompt (lines 67-88).
In auto mode, use user-level systemd (no sudo needed) or skip service
install if systemd user units aren't available:
```bash
if [[ "$AUTO_MODE" == true ]]; then
  install_svc="n"  # skip service in auto mode (avoid sudo prompt)
else
  read -p "install as background service? [y/N] " install_svc
fi
```

Remove the APK build prompt entirely (lines 90-105). APK building is a
separate step documented in the README, not part of server setup.

- [ ] **Step 4: Add OS detection for service installation**

Replace the systemd-only service install with OS detection:
```bash
if [[ "$install_svc" =~ ^[Yy]$ ]]; then
  case "$(uname)" in
    Linux)
      # existing systemd code
      ;;
    Darwin)
      cat > ~/Library/LaunchAgents/com.vibelink.bridge.plist <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.vibelink.bridge</string>
  <key>ProgramArguments</key><array>
    <string>$(which node)</string>
    <string>$SCRIPT_DIR/bridge/dist/server.js</string>
  </array>
  <key>WorkingDirectory</key><string>$SCRIPT_DIR/bridge</string>
  <key>EnvironmentVariables</key><dict>
    <key>AUTH_TOKEN</key><string>$TOKEN</string>
    <key>PORT</key><string>3400</string>
  </dict>
  <key>KeepAlive</key><true/>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
PLISTEOF
      launchctl load ~/Library/LaunchAgents/com.vibelink.bridge.plist
      echo "vibelink launchd service installed and started"
      ;;
    *)
      echo "warning: unsupported OS for service install, start manually with: node bridge/dist/server.js"
      ;;
  esac
fi
```

- [ ] **Step 5: Verify setup.sh runs without errors**

```bash
bash -n setup.sh  # syntax check
```

- [ ] **Step 6: Commit**

```bash
git add setup.sh
git commit -m "feat: setup.sh --auto flag, ASCII banner, macOS launchd, remove APK prompt"
```

### Task 3: QR code generation script

**Files:**
- Create: `scripts/show-qr.js`
- Modify: `setup.sh` (add QR output at end)

- [ ] **Step 1: Install qrcode-terminal as a bridge dependency**

```bash
cd /home/deck/vibelink/bridge && npm install qrcode-terminal
```

This keeps the dependency with bridge (which already has `qrcode` installed).
The `show-qr.js` script resolves from bridge's node_modules.
Also create the scripts directory:
```bash
mkdir -p /home/deck/vibelink/scripts
```

- [ ] **Step 2: Create scripts/show-qr.js**

```javascript
#!/usr/bin/env node
// generates a terminal QR code for vibelink connection
const path = require('path');
const qrcode = require(path.join(__dirname, '..', 'bridge', 'node_modules', 'qrcode-terminal'));

const host = process.argv[2];
const port = process.argv[3] || '3400';
const token = process.argv[4] || '';

if (!host) {
  console.error('usage: show-qr.js <host> [port] [token]');
  process.exit(1);
}

const uri = `vibelink://connect?host=${host}&port=${port}&token=${token}`;

console.log('');
console.log('  scan this QR code with the VibeLink app to connect:');
console.log('');
qrcode.generate(uri, { small: true }, (code) => {
  // indent each line for nicer formatting
  const indented = code.split('\n').map(l => '  ' + l).join('\n');
  console.log(indented);
});

console.log('');
console.log('  or enter manually in the app:');
console.log(`    bridge: ${host}:${port}`);
if (token) {
  console.log(`    token:  ${token}`);
}
console.log('');
```

- [ ] **Step 3: Add QR output to end of setup.sh**

Replace the summary block at the end of setup.sh (lines 108-127) with:
```bash
# detect connection info
if command -v tailscale >/dev/null; then
  IP=$(tailscale ip -4 2>/dev/null || echo "")
fi
IP="${IP:-localhost}"

TOKEN=""
if [ -f "$SCRIPT_DIR/bridge/.env" ]; then
  TOKEN=$(grep AUTH_TOKEN "$SCRIPT_DIR/bridge/.env" | cut -d= -f2)
fi

PORT=3400

echo ""
echo "=================================="
echo "  VibeLink setup complete"
echo "=================================="

if [[ "$AUTO_MODE" == true ]]; then
  # plain text output for Claude (can't render QR in stream-json)
  echo ""
  echo "  bridge url: $IP:$PORT"
  echo "  auth token: $TOKEN"
  echo ""
  echo "  Tell the user to:"
  echo "  1. Download the APK from the GitHub Releases page"
  echo "  2. Install Tailscale on their phone (same account as computer)"
  echo "  3. Open VibeLink app and enter:"
  echo "     Bridge: $IP:$PORT"
  echo "     Token:  $TOKEN"
else
  # interactive mode: show QR codes
  echo ""

  # QR 1: APK download link (if GitHub repo URL known)
  echo "  step 1: download the app"
  echo "  get the APK from GitHub Releases or scan:"
  # placeholder — replace with actual releases URL
  echo "  https://github.com/jd1207/vibelink/releases/latest"
  echo ""

  # QR 2: connection info
  if command -v node >/dev/null; then
    node "$SCRIPT_DIR/scripts/show-qr.js" "$IP" "$PORT" "$TOKEN"
  else
    echo "  bridge url: $IP:$PORT"
    echo "  auth token: $TOKEN"
  fi
fi

echo "  start:  ./vibelink start"
echo "  stop:   ./vibelink stop"
echo "  status: ./vibelink status"
echo "=================================="
```

- [ ] **Step 4: Test QR generation**

```bash
node scripts/show-qr.js 100.x.x.x 3400 testtoken123
```

Expected: QR code rendered in terminal encoding `vibelink://connect?host=100.x.x.x&port=3400&token=testtoken123`

- [ ] **Step 5: Commit**

```bash
git add scripts/show-qr.js setup.sh
git commit -m "feat: QR code output at end of setup (interactive + auto modes)"
```

---

## Chunk 2: Mobile App — QR Scanner + Deep Links

### Task 4: Add expo-camera dependency

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/app.json`

- [ ] **Step 1: Install expo-camera**

```bash
cd /home/deck/vibelink/mobile && npx expo install expo-camera
```

- [ ] **Step 2: Add expo-camera to app.json plugins**

In `mobile/app.json`, add to the plugins array:
```json
"plugins": [
  "expo-router",
  "expo-secure-store",
  ["expo-camera", { "cameraPermission": "VibeLink uses your camera to scan QR codes for quick setup." }]
]
```

- [ ] **Step 3: Commit**

```bash
git add mobile/package.json mobile/app.json
git commit -m "feat: add expo-camera for QR code scanning"
```

**Note:** After this change, existing APK builds must be rebuilt with
`npx expo prebuild --platform android --clean` to include the camera native
module.

### Task 5: QR scanner on setup screen

**Files:**
- Modify: `mobile/app/setup.tsx`

- [ ] **Step 1: Read current setup.tsx**

Read `mobile/app/setup.tsx` to get the exact current implementation.

- [ ] **Step 2: Add QR scanner state and imports**

At the top of setup.tsx, add imports:
```typescript
import { CameraView, useCameraPermissions } from 'expo-camera';
```

Add state for scanner visibility:
```typescript
const [scanning, setScanning] = useState(false);
const [permission, requestPermission] = useCameraPermissions();
```

- [ ] **Step 3: Add parseVibelinkUri helper**

```typescript
function parseVibelinkUri(uri: string): { host: string; port: string; token: string } | null {
  try {
    // handle vibelink://connect?host=X&port=Y&token=Z
    if (!uri.startsWith('vibelink://connect')) return null;
    const url = new URL(uri);
    const host = url.searchParams.get('host');
    const port = url.searchParams.get('port') || '3400';
    const token = url.searchParams.get('token') || '';
    if (!host) return null;
    return { host, port, token };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Add QR scan handler**

**Important:** Read setup.tsx first to get the exact state variable names.
The existing code uses `bridgeUrl`/`setBridgeUrl` and `authToken`/`setAuthToken`
(not `url`/`token`). Match the actual names:

```typescript
const handleQrScanned = ({ data }: { data: string }) => {
  setScanning(false);
  const parsed = parseVibelinkUri(data);
  if (parsed) {
    const fullUrl = `${parsed.host}:${parsed.port}`;
    setBridgeUrl(fullUrl);
    setAuthToken(parsed.token);
    handleConnect(fullUrl, parsed.token);
  } else {
    setError('not a vibelink qr code. try the one from your setup script.');
  }
};
```

Modify the existing `handleConnect` to accept optional params so it can be
called from the QR handler:
```typescript
const handleConnect = async (overrideUrl?: string, overrideToken?: string) => {
  const connectUrl = overrideUrl || bridgeUrl;
  const connectToken = overrideToken ?? authToken;
  // ... rest of existing connect logic using connectUrl/connectToken
};
```

- [ ] **Step 5: Add scanner UI**

When `scanning` is true, show a full-screen camera view:
```tsx
{scanning ? (
  <View style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}>
    <CameraView
      style={{ flex: 1 }}
      facing="back"
      barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
      onBarcodeScanned={handleQrScanned}
    />
    <Pressable
      onPress={() => setScanning(false)}
      style={{ position: 'absolute', top: 60, right: 20, padding: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8 }}
    >
      <Text style={{ color: '#fff', fontSize: 16 }}>cancel</Text>
    </Pressable>
  </View>
) : null}
```

Add the "Scan QR Code" button above the manual entry fields.
**Important:** The app uses NativeWind/Tailwind classes, not React Native
style objects. Match the existing styling pattern in setup.tsx:

```tsx
<Pressable
  onPress={async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setScanning(true);
  }}
  className="bg-[#3b82f6] p-4 rounded-xl items-center mb-6 active:opacity-80"
>
  <Text className="text-[#fafafa] text-base font-semibold">
    scan qr code
  </Text>
</Pressable>

<Text className="text-[#a1a1aa] text-center mb-4">
  or enter manually
</Text>
```

- [ ] **Step 6: Add Tailscale hint and improve error messages**

After the URL input, add:
```tsx
<Text className="text-[#a1a1aa] text-xs mt-1 mb-2">
  both your phone and computer need tailscale on the same account
</Text>
```

Also update the error message in the catch block of `handleConnect` to
suggest checking Tailscale when the bridge is unreachable:
```typescript
setError('could not connect. check that tailscale is running on both devices.');
```

- [ ] **Step 7: Commit**

```bash
git add mobile/app/setup.tsx
git commit -m "feat: QR scanner on setup screen with auto-connect"
```

### Task 6: Deep link handler in _layout.tsx

**Files:**
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Read current _layout.tsx**

Read `mobile/app/_layout.tsx` to get the exact current implementation.

- [ ] **Step 2: Add deep link handling imports**

```typescript
import * as Linking from 'expo-linking';
import { useRef } from 'react';
```

- [ ] **Step 3: Add deep link queue and handler**

After the `ready` state, add:
```typescript
const pendingDeepLink = useRef<string | null>(null);
const initialUrlChecked = useRef(false);

// check for initial deep link (app launched via URI) — runs once
useEffect(() => {
  if (initialUrlChecked.current) return;
  initialUrlChecked.current = true;
  Linking.getInitialURL().then((url) => {
    if (url) {
      if (ready) {
        handleDeepLink(url);
      } else {
        pendingDeepLink.current = url;
      }
    }
  });
}, []);

// listen for deep links while app is running
useEffect(() => {
  const sub = Linking.addEventListener('url', ({ url }) => {
    if (ready) {
      handleDeepLink(url);
    } else {
      pendingDeepLink.current = url;
    }
  });
  return () => sub.remove();
}, [ready]);

// process queued deep link after init completes
useEffect(() => {
  if (ready && pendingDeepLink.current) {
    handleDeepLink(pendingDeepLink.current);
    pendingDeepLink.current = null;
  }
}, [ready]);

function handleDeepLink(url: string) {
  if (!url.startsWith('vibelink://connect')) return;
  try {
    const parsed = new URL(url);
    const host = parsed.searchParams.get('host');
    const port = parsed.searchParams.get('port') || '3400';
    const token = parsed.searchParams.get('token') || '';
    if (host) {
      // store connection params and navigate to setup with pre-fill
      router.replace({
        pathname: '/setup',
        params: { host, port, token },
      });
    }
  } catch {}
}
```

- [ ] **Step 4: Update setup.tsx to read route params**

In setup.tsx, read pre-filled params from deep link. Use the actual state
setter names from the file (read setup.tsx first to confirm):
```typescript
import { useLocalSearchParams } from 'expo-router';

// inside the component:
const params = useLocalSearchParams<{ host?: string; port?: string; token?: string }>();

useEffect(() => {
  if (params.host) {
    const prefillUrl = `${params.host}:${params.port || '3400'}`;
    setBridgeUrl(prefillUrl);
    if (params.token) setAuthToken(params.token);
    handleConnect(prefillUrl, params.token || '');
  }
}, [params.host]);
```

- [ ] **Step 5: Commit**

```bash
git add mobile/app/_layout.tsx mobile/app/setup.tsx
git commit -m "feat: deep link handler for vibelink://connect URIs"
```

### Task 7: Disconnect/reconfigure option

**Files:**
- Modify: `mobile/app/index.tsx`

- [ ] **Step 1: Read current index.tsx**

Read `mobile/app/index.tsx` to get the exact current implementation.

- [ ] **Step 2: Add disconnect handler**

Import SecureStore and router:
```typescript
import * as SecureStore from 'expo-secure-store';
```

Add handler. Note: also set `isConnected` to false so any active WebSocket
hook detects the disconnect and closes its connection:
```typescript
const handleDisconnect = async () => {
  await SecureStore.deleteItemAsync('vibelink_bridge_url');
  await SecureStore.deleteItemAsync('vibelink_auth_token');
  useConnectionStore.getState().setBridgeUrl('');
  useConnectionStore.getState().setAuthToken('');
  useConnectionStore.getState().setConnected(false);
  router.replace('/setup');
};
```

- [ ] **Step 3: Add disconnect button to header**

Add a settings/disconnect button in the header area (top-right):
```tsx
<Pressable
  onPress={handleDisconnect}
  style={{ padding: spacing.sm }}
>
  <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
    disconnect
  </Text>
</Pressable>
```

Place this in the header bar, right-aligned next to the connection badge.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/index.tsx
git commit -m "feat: disconnect button to reconfigure bridge connection"
```

---

## Chunk 3: README + CLAUDE.md Updates

### Task 8: Restructure README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README.md**

Read `README.md` for the full current content.

- [ ] **Step 2: Rewrite Quick Start section**

Replace the current Quick Start with three clear sections following this structure:

```markdown
## Quick Start

### 1. Get the app on your phone

**Easiest (Android):** Download the latest APK from the
[Releases page](https://github.com/jd1207/vibelink/releases/latest)
and install it. Enable "install from unknown sources" if prompted.

**Build it yourself:** See [Building from Source](#building-from-source).

### 2. Set up your computer

The fastest way: tell your Claude Code to do it.

> Set up VibeLink from github.com/jd1207/vibelink

Claude will clone the repo, build the server, and give you connection info.

Or set up manually:

```bash
git clone https://github.com/jd1207/vibelink && cd vibelink
./setup.sh          # Mac/Linux
# or
./setup.ps1         # Windows (requires WSL2 for bridge)
```

### 3. Connect your phone

The setup script shows a QR code. Open VibeLink on your phone, tap
"scan qr code", point at the screen. Done.

**Manual entry:** If QR scanning doesn't work, type the bridge URL and
auth token shown by the setup script into the app's setup screen.

**Important:** Both your phone and computer need
[Tailscale](https://tailscale.com) installed and signed into the same
account. This creates a private encrypted connection between them.
```

- [ ] **Step 3: Add Building from Source section**

```markdown
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
```

- [ ] **Step 4: Move Dev Client to Contributing section**

```markdown
## Contributing

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
```

- [ ] **Step 5: Update Roadmap with App Store / Play Store**

Add to the Planned section:
```markdown
- [ ] **App Store / Play Store** -- publish to stores for one-tap install (no sideloading)
- [ ] **npx vibelink-setup** -- cross-platform setup wizard, no git clone needed
```

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: restructure README — three install paths, Claude-assisted setup, QR connection"
```

### Task 9: Fix CLAUDE.md MCP entry point

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Read CLAUDE.md**

Read `CLAUDE.md` and find the incorrect MCP server path reference.

- [ ] **Step 2: Fix the path**

The Build & Run section says:
```
claude mcp add vibelink --scope user -- node $(pwd)/mcp-server/dist/server.js
```

Should be:
```
claude mcp add vibelink --scope user -- node $(pwd)/mcp-server/dist/index.js
```

Replace `dist/server.js` with `dist/index.js` for the MCP server path.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "fix: CLAUDE.md MCP entry point is dist/index.js not dist/server.js"
```

---

## Chunk 4: Windows Setup Script

### Task 10: Create setup.ps1

**Files:**
- Create: `setup.ps1`

- [ ] **Step 1: Create the PowerShell setup script**

```powershell
# VibeLink Setup (Windows)
# Requires: Node.js 22+, Claude Code CLI, WSL2 (for bridge runtime)
param(
    [switch]$Auto
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  _    _ ___ ___  ___ _    ___ _  _ _  __"
Write-Host " | |  / |_ _| _ )| __| |  |_ _| \| | |/ /"
Write-Host " | \/|  || || _ \| _|| |__ | ||    |   < "
Write-Host "  \_/\_/|___|___/|___|____|___|_|\_|_|\_\"
Write-Host ""

# check prerequisites
$missing = @()
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) { $missing += "claude" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { $missing += "node" }
if ($missing.Count -gt 0) {
    Write-Host "error: missing prerequisites: $($missing -join ', ')" -ForegroundColor Red
    exit 1
}

if (-not (Get-Command tailscale -ErrorAction SilentlyContinue)) {
    Write-Host "warning: tailscale not found, remote access won't work" -ForegroundColor Yellow
}

# check WSL2
$wslAvailable = $false
try {
    wsl --status 2>$null | Out-Null
    $wslAvailable = $true
} catch {}

if (-not $wslAvailable) {
    Write-Host "warning: WSL2 not found. the bridge server requires WSL2 on Windows." -ForegroundColor Yellow
    Write-Host "         install WSL2: wsl --install" -ForegroundColor Yellow
}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# build bridge
Write-Host "building bridge server..."
Push-Location "$ScriptDir\bridge"
npm install
npm run build
Pop-Location

# build mcp server
Write-Host "building mcp server..."
Push-Location "$ScriptDir\mcp-server"
npm install
npm run build
Pop-Location

# register mcp with claude
Write-Host "registering vibelink mcp server..."
$mcpPath = Resolve-Path "$ScriptDir\mcp-server\dist\index.js"
claude mcp add vibelink --scope user -- node $mcpPath

# register permission hook
Write-Host "registering permission approval hook..."
$settingsFile = Join-Path $env:USERPROFILE ".claude\settings.json"
$hookCmd = "node $ScriptDir\hooks\permission-hook.js"

if (Test-Path $settingsFile) {
    $settings = Get-Content $settingsFile -Raw | ConvertFrom-Json
    if (-not $settings.hooks) {
        $settings | Add-Member -NotePropertyName "hooks" -NotePropertyValue @{}
    }
    $hookEntry = @{ type = "command"; command = $hookCmd }
    $existing = $settings.hooks.PreToolUse
    if (-not $existing) {
        $settings.hooks | Add-Member -NotePropertyName "PreToolUse" -NotePropertyValue @($hookEntry)
    } elseif ($existing.command -notcontains $hookCmd) {
        $settings.hooks.PreToolUse += $hookEntry
    }
    $settings | ConvertTo-Json -Depth 10 | Set-Content $settingsFile
} else {
    $dir = Split-Path $settingsFile
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
    @{
        hooks = @{
            PreToolUse = @(
                @{ type = "command"; command = $hookCmd }
            )
        }
    } | ConvertTo-Json -Depth 10 | Set-Content $settingsFile
}

# generate auth token
$envFile = Join-Path $ScriptDir "bridge\.env"
if (-not (Test-Path $envFile)) {
    $bytes = New-Object byte[] 32
    [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
    $token = [BitConverter]::ToString($bytes) -replace '-', '' | ForEach-Object { $_.ToLower() }
    "AUTH_TOKEN=$token" | Set-Content $envFile
    "PORT=3400" | Add-Content $envFile
    Write-Host "auth token generated"
} else {
    Write-Host "bridge\.env already exists, keeping existing config"
    $token = (Get-Content $envFile | Select-String "AUTH_TOKEN=(.*)").Matches.Groups[1].Value
}

# detect tailscale IP
$ip = "localhost"
if (Get-Command tailscale -ErrorAction SilentlyContinue) {
    try { $ip = (tailscale ip -4 2>$null).Trim() } catch {}
}

$port = "3400"

# output
Write-Host ""
Write-Host "=================================="
Write-Host "  VibeLink setup complete"
Write-Host "=================================="

if ($Auto) {
    Write-Host ""
    Write-Host "  bridge url: ${ip}:${port}"
    Write-Host "  auth token: $token"
    Write-Host ""
    Write-Host "  Tell the user to:"
    Write-Host "  1. Download the APK from the GitHub Releases page"
    Write-Host "  2. Install Tailscale on their phone (same account as computer)"
    Write-Host "  3. Open VibeLink app and enter:"
    Write-Host "     Bridge: ${ip}:${port}"
    Write-Host "     Token:  $token"
} else {
    Write-Host ""
    Write-Host "  step 1: download the app"
    Write-Host "  get the APK from GitHub Releases:"
    Write-Host "  https://github.com/jd1207/vibelink/releases/latest"
    Write-Host ""
    try {
        node "$ScriptDir\scripts\show-qr.js" $ip $port $token
    } catch {
        Write-Host "  bridge url: ${ip}:${port}"
        Write-Host "  auth token: $token"
    }
}

$wslPath = $ScriptDir -replace '\\', '/' -replace '^([A-Z]):', '/mnt/$1'.ToLower()
Write-Host ""
Write-Host "  note: run the bridge server in WSL2:"
Write-Host "  wsl -- bash -c 'cd $wslPath/bridge && node dist/server.js'"
Write-Host "=================================="
```

- [ ] **Step 2: Verify PowerShell syntax**

If on a system with PowerShell:
```powershell
powershell -Command "Get-Content setup.ps1 | Out-Null"
```

Otherwise, visually verify the script is well-formed.

- [ ] **Step 3: Commit**

```bash
git add setup.ps1
git commit -m "feat: setup.ps1 — Windows setup script (WSL2-based bridge)"
```

---

## Dependency Graph

```
Parallel Group A (setup scripts):
  Task 1+2 (fix hook + --auto + banner) → Task 3 (QR script)

Parallel Group B (mobile app):
  Task 4 (expo-camera) → Task 5 (QR scanner) → Task 6 step 4 (setup.tsx params)
  Task 6 steps 1-3 (_layout.tsx deep links) — independent of Task 5

Fully independent (run in parallel with everything):
  Task 7 (disconnect)
  Task 8 (README)
  Task 9 (CLAUDE.md fix)
  Task 10 (setup.ps1)
```

Groups A and B can run simultaneously. Tasks 7-10 can all start immediately.
Tasks 1 and 2 both edit setup.sh — merge into a single task or do
sequentially to avoid conflicts.
