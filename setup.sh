#!/bin/bash
set -e

echo "=== VibeLink Setup ==="
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

# generate auth token
if [ ! -f "$SCRIPT_DIR/bridge/.env" ]; then
  TOKEN=$(openssl rand -hex 32)
  echo "AUTH_TOKEN=$TOKEN" > "$SCRIPT_DIR/bridge/.env"
  echo "PORT=3400" >> "$SCRIPT_DIR/bridge/.env"
  echo "auth token generated"
else
  echo "bridge/.env already exists, keeping existing config"
fi

# systemd service (optional)
read -p "install as systemd service? [y/N] " install_svc
if [[ "$install_svc" =~ ^[Yy]$ ]]; then
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
  echo "vibelink service installed and started"
fi

# android apk (optional)
read -p "build android APK? [y/N] " build_apk
if [[ "$build_apk" =~ ^[Yy]$ ]]; then
  cd "$SCRIPT_DIR/mobile"
  npm install
  npx expo prebuild --platform android
  if [ ! -f android/app/vibelink.keystore ]; then
    keytool -genkeypair -v \
      -keystore android/app/vibelink.keystore \
      -alias vibelink -keyalg RSA -keysize 2048 \
      -validity 10000 -storepass vibelink \
      -dname "CN=VibeLink"
  fi
  cd android && ./gradlew assembleRelease && cd "$SCRIPT_DIR"
  echo "APK built: mobile/android/app/build/outputs/apk/release/app-release.apk"
fi

# print summary
echo ""
echo "=================================="
echo "  VibeLink setup complete"
echo "=================================="
echo ""
if command -v tailscale >/dev/null; then
  IP=$(tailscale ip -4 2>/dev/null || echo "<tailscale-ip>")
  echo "  bridge url: $IP:3400"
else
  echo "  bridge url: localhost:3400"
fi
if [ -f "$SCRIPT_DIR/bridge/.env" ]; then
  TOKEN=$(grep AUTH_TOKEN "$SCRIPT_DIR/bridge/.env" | cut -d= -f2)
  echo "  auth token: $TOKEN"
fi
echo ""
echo "  start:  ./vibelink start"
echo "  stop:   ./vibelink stop"
echo "  status: ./vibelink status"
echo "=================================="
