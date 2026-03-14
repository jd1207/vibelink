import { useState } from "react";

const COLORS = {
  bg: "#0a0e1a",
  surface: "#111827",
  border: "#1e293b",
  accent: "#3b82f6",
  accentGlow: "rgba(59, 130, 246, 0.15)",
  green: "#10b981",
  greenGlow: "rgba(16, 185, 129, 0.15)",
  orange: "#f59e0b",
  orangeGlow: "rgba(245, 158, 11, 0.12)",
  purple: "#a78bfa",
  purpleGlow: "rgba(167, 139, 250, 0.12)",
  pink: "#f472b6",
  pinkGlow: "rgba(244, 114, 182, 0.12)",
  cyan: "#22d3ee",
  cyanGlow: "rgba(34, 211, 238, 0.12)",
  text: "#e2e8f0",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  pipe: "#334155",
};

const tabs = ["architecture", "setup", "dataflow"];

const sections = {
  phone: {
    title: "React Native App",
    subtitle: "iOS + Android",
    color: COLORS.purple,
    glow: COLORS.purpleGlow,
    desc: "Cross-platform mobile client built with Expo. Renders Claude's output as rich interactive UI. Connects to Bridge Server over Tailscale. Built locally as an APK (Android) or via Xcode (iOS) — no app store, no cloud build service.",
    details: [
      { label: "Chat Tab", text: "Streamed markdown + inline dynamic UI. Text, voice, camera, and file input." },
      { label: "Canvas Tab", text: "Full-screen surface for complex components (decision tables, charts, forms)." },
      { label: "Preview Tab", text: "WebView showing proxied localhost dev servers with hot reload." },
      { label: "Terminal Tab", text: "Raw NDJSON event stream with ANSI colors." },
      { label: "Dynamic Tabs", text: "Claude creates additional named tabs via create_tab MCP tool." },
      { label: "Build", text: "npx expo prebuild → npx expo run:android --variant release. APK at android/app/build/outputs/apk/release/. Install via adb or QR download." },
    ],
  },
  bridge: {
    title: "Bridge Server",
    subtitle: "Node.js · Your Linux Machine",
    color: COLORS.accent,
    glow: COLORS.accentGlow,
    desc: "Central hub on your workstation. Spawns the Claude CLI subprocess, pipes NDJSON between Claude and mobile clients, runs support services. Starts with npm start. Runs as systemd service for always-on access.",
    details: [
      { label: "Claude Process Manager", text: "Spawns claude with --input-format stream-json --output-format stream-json --verbose --include-partial-messages. Manages lifecycle and crash recovery." },
      { label: "NDJSON Parser", text: "Parses stdout into typed events: stream_event, assistant, tool_use, tool_result, result." },
      { label: "WebSocket Server", text: "Express + ws. Accepts mobile connections over Tailscale." },
      { label: "IPC Socket", text: "Unix socket for MCP server ↔ Bridge communication." },
      { label: "Services", text: "Screenshot (scrot + Puppeteer), preview proxy, Whisper STT, file uploads." },
      { label: "Auth", text: "JWT with QR code pairing. Admin/Operator/Viewer roles." },
    ],
  },
  cli: {
    title: "Claude Code CLI",
    subtitle: "Subprocess · Bidirectional stream-json",
    color: COLORS.green,
    glow: COLORS.greenGlow,
    desc: "The actual Claude Code binary you already have installed. Spawned as a child process. ALL your existing config works automatically — CLAUDE.md, settings, MCP servers, skills, hooks, commands, agents. Zero configuration.",
    details: [
      { label: "Zero Config", text: "CLAUDE.md, .claude/settings.json, .mcp.json, skills, hooks, slash commands, agents — all automatic." },
      { label: "stdin", text: "NDJSON user messages from Bridge. Text + image content blocks." },
      { label: "stdout", text: "NDJSON events: text deltas, tool calls, tool results, final results with cost/usage." },
      { label: "Sessions", text: "Process stays alive for multi-turn. --resume with session_id if restarted." },
      { label: "Project Context", text: "cwd set to chosen project dir. CLAUDE.md hierarchy loaded from there." },
    ],
  },
  mcp: {
    title: "VibeLink MCP Server",
    subtitle: "Standalone Node.js · stdio transport",
    color: COLORS.orange,
    glow: COLORS.orangeGlow,
    desc: "Standard MCP server registered once with claude mcp add. Auto-launched by Claude on every session. Provides custom tools for rich mobile UI. Talks to Bridge over local IPC socket.",
    details: [
      { label: "render_ui", text: "Push JSON component definitions to mobile (tables, forms, charts, code)." },
      { label: "update_ui", text: "Modify existing components by ID in real time." },
      { label: "create_tab / update_tab", text: "Manage named tabs in the mobile app." },
      { label: "capture_screenshot", text: "Desktop/browser screenshot → Claude + mobile." },
      { label: "stream_preview", text: "Proxy localhost URL to mobile Preview tab." },
      { label: "request_input", text: "Ask mobile user for file, photo, voice. Blocks until response." },
    ],
  },
  tailscale: {
    title: "Tailscale",
    subtitle: "WireGuard Mesh VPN",
    color: COLORS.pink,
    glow: COLORS.pinkGlow,
    desc: "Zero-config encrypted networking. Workstation + phone join same tailnet. Stable IPs, accessible anywhere, all traffic E2E encrypted. No port forwarding, no public exposure.",
    details: [
      { label: "Setup", text: "Install on workstation + phone. Auth with same account. Done." },
      { label: "Security", text: "Bridge binds to Tailscale interface only." },
    ],
  },
};

const setupSteps = [
  { num: "1", title: "Clone the repo", cmd: "git clone https://github.com/you/vibelink && cd vibelink", note: "Open source. MIT license.", color: COLORS.text },
  { num: "2", title: "Run setup", cmd: "./setup.sh", note: "Installs deps, builds bridge + MCP server, registers MCP with Claude Code, generates signing key, optionally builds APK.", color: COLORS.accent },
  { num: "3", title: "Start bridge", cmd: "vibelink start", note: "Starts Bridge Server as a background service. Prints QR code + Tailscale IP.", color: COLORS.green },
  { num: "4", title: "Install app", cmd: "# Scan QR to download APK over Tailscale\n# — or —\nadb install ./mobile/android/app/build/outputs/apk/release/app-release.apk", note: "Bridge serves the APK over HTTP on your tailnet. Scan from any Android phone to install.", color: COLORS.purple },
  { num: "5", title: "Connect", cmd: "# Open app → scan pairing QR → done", note: "App auto-discovers bridge on tailnet. Scan QR for auth token. Start chatting.", color: COLORS.orange },
];

const setupScript = [
  "#!/bin/bash",
  "set -e",
  "",
  '# ── Prerequisites check ─────────────────────────',
  'command -v claude >/dev/null || { echo "❌ Claude Code CLI not found. Install: curl -fsSL https://cli.claude.com/install.sh | sh"; exit 1; }',
  'command -v node >/dev/null || { echo "❌ Node.js not found. Install Node 22+"; exit 1; }',
  'command -v tailscale >/dev/null || { echo "⚠️  Tailscale not found. Install for remote access."; }',
  "",
  '# ── Build bridge server ─────────────────────────',
  "cd bridge && npm install && npm run build && cd ..",
  "",
  '# ── Build & register MCP server ────────────────',
  "cd mcp-server && npm install && npm run build && cd ..",
  "claude mcp add vibelink --scope user -- node $(pwd)/mcp-server/dist/server.js",
  "",
  '# ── Generate JWT secret ────────────────────────',
  'echo "JWT_SECRET=$(openssl rand -hex 32)" > bridge/.env',
  'echo "PORT=3400" >> bridge/.env',
  "",
  '# ── Build Android APK (optional) ───────────────',
  'read -p "Build Android APK now? [y/N] " build_apk',
  'if [[ "$build_apk" =~ ^[Yy]$ ]]; then',
  "  cd mobile",
  "  npm install",
  "  npx expo prebuild --platform android",
  "",
  "  # Generate signing key if not exists",
  "  if [ ! -f android/app/vibelink.keystore ]; then",
  '    keytool -genkeypair -v \\',
  "      -keystore android/app/vibelink.keystore \\",
  "      -alias vibelink -keyalg RSA -keysize 2048 \\",
  '      -validity 10000 -storepass vibelink \\',
  '      -dname "CN=VibeLink"',
  "  fi",
  "",
  "  # Build release APK",
  "  cd android && ./gradlew assembleRelease && cd ../..",
  '  echo "✅ APK built: mobile/android/app/build/outputs/apk/release/app-release.apk"',
  "else",
  "  cd ..",
  "fi",
  "",
  '# ── Install systemd service ────────────────────',
  'read -p "Install as systemd service? [y/N] " install_service',
  'if [[ "$install_service" =~ ^[Yy]$ ]]; then',
  "  sudo tee /etc/systemd/system/vibelink.service > /dev/null <<EOF",
  "[Unit]",
  "Description=VibeLink Bridge Server",
  "After=network.target tailscaled.service",
  "[Service]",
  "Type=simple",
  "User=$(whoami)",
  "WorkingDirectory=$(pwd)/bridge",
  "ExecStart=$(which node) dist/server.js",
  "Restart=always",
  "EnvironmentFile=$(pwd)/bridge/.env",
  "[Install]",
  "WantedBy=multi-user.target",
  "EOF",
  "  sudo systemctl enable --now vibelink",
  "fi",
  "",
  'echo ""',
  'echo "╔══════════════════════════════════════════╗"',
  'echo "║  ✅ VibeLink installed successfully     ║"',
  'echo "║                                          ║"',
  'echo "║  Start:   vibelink start               ║"',
  'echo "║  Stop:    vibelink stop                ║"',
  'echo "║  Status:  vibelink status              ║"',
  'echo "╚══════════════════════════════════════════╝"',
];

const flowSteps = [
  { num: "1", text: "User types/speaks on phone", from: "phone", color: COLORS.purple },
  { num: "2", text: "WebSocket over Tailscale → Bridge", from: "tailscale", color: COLORS.pink },
  { num: "3", text: "Bridge writes NDJSON to Claude stdin", from: "bridge", color: COLORS.accent },
  { num: "4", text: "Claude thinks, calls tools, streams on stdout", from: "cli", color: COLORS.green },
  { num: "5", text: "Claude calls render_ui MCP tool for rich UI", from: "mcp", color: COLORS.orange },
  { num: "6", text: "MCP → IPC → Bridge → WebSocket → phone renders", from: "phone", color: COLORS.purple },
  { num: "7", text: "User taps selection in dynamic UI", from: "phone", color: COLORS.purple },
  { num: "8", text: "Selection → Bridge → Claude stdin as context", from: "bridge", color: COLORS.accent },
];

export default function VibeLinkArchitecture() {
  const [activeTab, setActiveTab] = useState("architecture");
  const [selected, setSelected] = useState("bridge");
  const active = sections[selected];

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", padding: "20px 16px" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: "-0.5px" }}>
          <span style={{ color: COLORS.accent }}>VibeLink</span>
          <span style={{ color: COLORS.textDim, fontWeight: 400 }}> v2</span>
        </h1>
        <p style={{ color: COLORS.textMuted, fontSize: 13, margin: "4px 0 0" }}>
          Open source · Clone → Setup → Chat from your phone
        </p>
      </div>

      {/* Tab Switcher */}
      <div style={{ display: "flex", justifyContent: "center", gap: 4, marginBottom: 24, maxWidth: 480, margin: "0 auto 24px" }}>
        {[
          { id: "architecture", label: "Architecture" },
          { id: "setup", label: "Setup & Deploy" },
          { id: "dataflow", label: "Data Flow" },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1,
              padding: "8px 12px",
              background: activeTab === t.id ? `${COLORS.accent}22` : "transparent",
              border: `1px solid ${activeTab === t.id ? COLORS.accent : COLORS.border}`,
              borderRadius: 8,
              color: activeTab === t.id ? COLORS.accent : COLORS.textDim,
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ ARCHITECTURE TAB ═══ */}
      {activeTab === "architecture" && (
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {/* Diagram */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
              <ArchBox id="phone" label="📱 React Native App" sub="iOS + Android" color={COLORS.purple} selected={selected} onClick={setSelected} />
            </div>
            <Arrow label="WebSocket" sub="Tailscale" color={COLORS.pink} />
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 6 }}>
              <ArchBox id="bridge" label="🖥 Bridge Server" sub="Node.js · WebSocket + IPC" color={COLORS.accent} selected={selected} onClick={setSelected} wide />
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 100 }}>
              <Arrow label="stdin/stdout" sub="NDJSON" color={COLORS.green} small />
              <Arrow label="IPC" sub="Unix socket" color={COLORS.orange} small />
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginBottom: 6 }}>
              <ArchBox id="cli" label="⚡ Claude Code CLI" sub="stream-json subprocess" color={COLORS.green} selected={selected} onClick={setSelected} />
              <ArchBox id="mcp" label="🔧 VibeLink MCP" sub="Custom tools" color={COLORS.orange} selected={selected} onClick={setSelected} />
            </div>
            <div style={{ marginTop: 14 }}>
              <div onClick={() => setSelected("tailscale")} style={{
                background: selected === "tailscale" ? COLORS.pinkGlow : "transparent",
                border: `1px dashed ${selected === "tailscale" ? COLORS.pink : COLORS.pipe}`,
                borderRadius: 8, padding: "6px 12px", textAlign: "center", cursor: "pointer", transition: "all 0.2s",
              }}>
                <span style={{ color: COLORS.pink, fontSize: 11, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                  🔒 Tailscale · E2E Encrypted · Zero Config
                </span>
              </div>
            </div>
          </div>

          {/* Detail Panel */}
          <div style={{
            background: COLORS.surface, border: `1px solid ${active.color}33`, borderRadius: 12, overflow: "hidden",
            boxShadow: `0 0 30px ${active.glow}`, transition: "box-shadow 0.3s",
          }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: active.color, boxShadow: `0 0 6px ${active.color}` }} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{active.title}</div>
                <div style={{ fontSize: 11, color: COLORS.textDim, fontFamily: "'IBM Plex Mono', monospace" }}>{active.subtitle}</div>
              </div>
            </div>
            <div style={{ padding: "10px 16px", borderBottom: `1px solid ${COLORS.border}` }}>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: COLORS.textMuted }}>{active.desc}</p>
            </div>
            <div style={{ padding: "8px 16px 12px" }}>
              {active.details.map((d, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: i < active.details.length - 1 ? `1px solid ${COLORS.border}` : "none" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: active.color }}>{d.label}: </span>
                  <span style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>{d.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ SETUP TAB ═══ */}
      {activeTab === "setup" && (
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          {/* Steps */}
          <div style={{ marginBottom: 28 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: COLORS.cyan, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              5 Commands to Your Own Private Claude Phone App
            </h3>
            {setupSteps.map((step, i) => (
              <div key={i} style={{
                display: "flex", gap: 12, marginBottom: 12, padding: "10px 14px",
                background: COLORS.surface, borderRadius: 10, border: `1px solid ${COLORS.border}`,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%", background: `${step.color}18`, border: `1.5px solid ${step.color}44`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: step.color, flexShrink: 0, marginTop: 2,
                }}>{step.num}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>{step.title}</div>
                  <pre style={{
                    margin: "0 0 4px", padding: "6px 10px", background: "#0d1117", borderRadius: 6, fontSize: 12,
                    fontFamily: "'IBM Plex Mono', monospace", color: COLORS.green, whiteSpace: "pre-wrap", lineHeight: 1.5,
                    border: `1px solid ${COLORS.border}`, overflowX: "auto",
                  }}>{step.cmd}</pre>
                  <div style={{ fontSize: 11, color: COLORS.textDim }}>{step.note}</div>
                </div>
              </div>
            ))}
          </div>

          {/* What setup.sh does */}
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: COLORS.accent, margin: "0 0 10px" }}>
              What setup.sh Does
            </h3>
            <div style={{
              background: "#0d1117", borderRadius: 10, padding: "14px 16px", border: `1px solid ${COLORS.border}`,
              maxHeight: 360, overflowY: "auto",
            }}>
              {setupScript.map((line, i) => (
                <div key={i} style={{
                  fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, lineHeight: 1.6,
                  color: line.startsWith("#") || line.startsWith("'#") ? COLORS.textDim
                    : line.startsWith("echo") || line.startsWith("'echo") ? COLORS.cyan
                    : line.includes("read -p") ? COLORS.orange
                    : line === "" ? "transparent"
                    : COLORS.green,
                  whiteSpace: "pre-wrap",
                  minHeight: line === "" ? 10 : undefined,
                }}>
                  {line || " "}
                </div>
              ))}
            </div>
          </div>

          {/* APK distribution */}
          <div style={{
            background: `${COLORS.purple}08`, border: `1px solid ${COLORS.purple}22`, borderRadius: 10, padding: "12px 16px", marginBottom: 16,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.purple, marginBottom: 6 }}>📱 APK Distribution Options</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6 }}>
              <strong style={{ color: COLORS.text }}>USB:</strong> adb install app-release.apk — instant install over cable.<br />
              <strong style={{ color: COLORS.text }}>QR Download:</strong> Bridge serves the APK at http://{'<tailscale-ip>'}:3400/app.apk. Scan QR from phone to download and install.<br />
              <strong style={{ color: COLORS.text }}>Share:</strong> Send the APK file directly to your team member. They install, scan pairing QR, done.<br />
              <strong style={{ color: COLORS.text }}>iOS:</strong> npx expo run:ios --device --configuration Release (requires Mac + Xcode + Apple Developer account).
            </div>
          </div>

          <div style={{
            background: `${COLORS.green}08`, border: `1px solid ${COLORS.green}22`, borderRadius: 10, padding: "12px 16px",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.green, marginBottom: 4 }}>🔒 Privacy by Design</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6 }}>
              Nothing leaves your network. No cloud builds, no telemetry, no hosted services. The bridge runs on YOUR machine, traffic goes through YOUR Tailscale mesh, the APK is built on YOUR computer. Your code and conversations stay private.
            </div>
          </div>
        </div>
      )}

      {/* ═══ DATA FLOW TAB ═══ */}
      {activeTab === "dataflow" && (
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 0 16px" }}>
            Full Round-Trip: Prompt → Dynamic UI → User Selection
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {flowSteps.map((step, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px",
                background: COLORS.surface, borderRadius: 10, border: `1px solid ${COLORS.border}`,
                borderLeft: `3px solid ${step.color}`,
              }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%", background: `${step.color}22`,
                  border: `1.5px solid ${step.color}`, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700, color: step.color, flexShrink: 0,
                }}>{step.num}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, color: COLORS.text, fontWeight: 500 }}>{step.text}</div>
                  <div style={{ fontSize: 11, color: step.color, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>{step.from}</div>
                </div>
                {i < flowSteps.length - 1 && (
                  <div style={{ color: COLORS.pipe, fontSize: 16, marginTop: 2 }}>↓</div>
                )}
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 20, background: `${COLORS.orange}08`, border: `1px solid ${COLORS.orange}22`, borderRadius: 10, padding: "12px 16px",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.orange, marginBottom: 4 }}>🔁 The Self-Reprogramming Loop</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6 }}>
              Steps 5–8 are the magic. Claude calls render_ui to create interactive components on your phone, you interact with them, and your selection flows back to Claude as context. Claude can then update the UI again — creating a real-time feedback loop where the interface evolves with the conversation. Claude is effectively reprogramming the app you're looking at.
            </div>
          </div>

          <div style={{
            marginTop: 12, background: `${COLORS.accent}08`, border: `1px solid ${COLORS.accent}22`, borderRadius: 10, padding: "12px 16px",
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.accent, marginBottom: 4 }}>💡 Why CLI-First</div>
            <div style={{ fontSize: 12, color: COLORS.textMuted, lineHeight: 1.6 }}>
              The Claude CLI subprocess IS Claude Code. CLAUDE.md, MCP servers, skills, hooks, settings — all automatic. No SDK configuration, no settingSources, no drift. Custom tools (render_ui etc.) live in a standalone MCP server registered once. The bridge just pipes NDJSON. ~800 lines of code.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArchBox({ id, label, sub, color, selected, onClick, wide }) {
  const isActive = selected === id;
  return (
    <div onClick={() => onClick(id)} style={{
      background: isActive ? `${color}11` : COLORS.surface,
      border: `1.5px solid ${isActive ? color : COLORS.border}`,
      borderRadius: 10, padding: "10px 18px", cursor: "pointer", transition: "all 0.2s",
      textAlign: "center", minWidth: wide ? 300 : 180,
      boxShadow: isActive ? `0 0 20px ${color}15` : "none",
    }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? color : COLORS.text }}>{label}</div>
      <div style={{ fontSize: 10, color: COLORS.textDim, fontFamily: "'IBM Plex Mono', monospace", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Arrow({ label, sub, color, small }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: small ? "2px 0" : "3px 0" }}>
      <div style={{ width: 1.5, height: small ? 12 : 18, background: `${color}55` }} />
      <div style={{ fontSize: 9, color, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>{label}</div>
      {sub && <div style={{ fontSize: 8, color: COLORS.textDim }}>{sub}</div>}
      <div style={{ width: 1.5, height: small ? 6 : 10, background: `${color}55` }} />
      <div style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: `5px solid ${color}77` }} />
    </div>
  );
}
