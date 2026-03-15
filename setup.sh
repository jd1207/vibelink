#!/bin/bash
set -e

AUTO_MODE=false
if [[ "${1:-}" == "--auto" ]]; then
  AUTO_MODE=true
fi

echo ""
echo "  _    _ ___ ___  ___ _    ___ _  _ _  __"
echo " | |  / |_ _| _ )| __| |  |_ _| \\| | |/ /"
echo " | \\/|  || || _ \\| _|| |__ | ||    |   < "
echo "  \\_/\\_/|___|___/|___|____|___|_|\\_|_|\\_\\"
echo ""

# check prerequisites
command -v claude >/dev/null || { echo "error: claude CLI not found"; exit 1; }
command -v node >/dev/null || { echo "error: node not found (need 22+)"; exit 1; }
command -v tailscale >/dev/null || echo "warning: tailscale not found, remote access won't work"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# build bridge
echo "building bridge server..."
cd "$SCRIPT_DIR/bridge" && npm install && npm run build && cd "$SCRIPT_DIR"

# build mcp server
echo "building mcp server..."
cd "$SCRIPT_DIR/mcp-server" && npm install && npm run build && cd "$SCRIPT_DIR"

# register mcp with claude
echo "registering vibelink mcp server..."
claude mcp add vibelink --scope user -- node "$SCRIPT_DIR/mcp-server/dist/index.js"

# register permission hook
echo "registering permission approval hook..."
SETTINGS_FILE="$HOME/.claude/settings.json"
HOOK_CMD="node $SCRIPT_DIR/hooks/permission-hook.js"

if [ -f "$SETTINGS_FILE" ]; then
  if command -v jq >/dev/null; then
    # merge hook into existing settings
    jq --arg cmd "$HOOK_CMD" '
      .hooks.PreToolUse = ((.hooks.PreToolUse // []) + [{"type": "command", "command": $cmd}] | unique_by(.command))
    ' "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  else
    echo "warning: jq not found, add permission hook manually to $SETTINGS_FILE"
  fi
else
  mkdir -p "$HOME/.claude"
  cat > "$SETTINGS_FILE" <<HOOKEOF
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
HOOKEOF
fi

# generate auth token
if [ ! -f "$SCRIPT_DIR/bridge/.env" ]; then
  TOKEN=$(openssl rand -hex 32)
  echo "AUTH_TOKEN=$TOKEN" > "$SCRIPT_DIR/bridge/.env"
  echo "PORT=3400" >> "$SCRIPT_DIR/bridge/.env"
  echo "auth token generated"
else
  echo "bridge/.env already exists, keeping existing config"
fi

# background service (optional)
if [[ "$AUTO_MODE" == true ]]; then
  install_svc="n"
else
  read -p "install as background service? [y/N] " install_svc
fi

if [[ "$install_svc" =~ ^[Yy]$ ]]; then
  case "$(uname)" in
    Linux)
      sudo tee /etc/systemd/system/vibelink.service > /dev/null <<SVCEOF
[Unit]
Description=VibeLink Bridge Server
After=network.target tailscaled.service

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=$SCRIPT_DIR/bridge
ExecStart=$(which node) dist/server.js
Restart=always
EnvironmentFile=$SCRIPT_DIR/bridge/.env

[Install]
WantedBy=multi-user.target
SVCEOF
      sudo systemctl daemon-reload
      sudo systemctl enable --now vibelink
      echo "vibelink systemd service installed and started"
      ;;
    Darwin)
      TOKEN=""
      if [ -f "$SCRIPT_DIR/bridge/.env" ]; then
        TOKEN=$(grep AUTH_TOKEN "$SCRIPT_DIR/bridge/.env" | cut -d= -f2)
      fi
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
