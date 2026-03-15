// dashboard html served at /dashboard
// includes: status overview, session list with end buttons,
// embedded chat (synced with phone), and console log panel

export function dashboardHtml(port: number): string {
  return `<!DOCTYPE html>
<html><head><title>vibelink dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #fafafa; font-family: -apple-system, system-ui, sans-serif; }

  /* layout */
  .header { padding: 16px 20px; border-bottom: 1px solid #27272a; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 18px; color: #3b82f6; }
  .header .uptime { color: #52525b; font-size: 12px; }
  .main { display: flex; height: calc(100vh - 53px); }
  .sidebar { width: 280px; border-right: 1px solid #27272a; overflow-y: auto; flex-shrink: 0; }
  .content { flex: 1; display: flex; flex-direction: column; }

  /* sidebar */
  .stats { display: flex; gap: 1px; background: #27272a; }
  .stat-box { flex: 1; background: #18181b; padding: 12px; text-align: center; }
  .stat-num { font-size: 20px; font-weight: 700; }
  .stat-label { font-size: 10px; color: #71717a; text-transform: uppercase; margin-top: 2px; }
  .session-item { padding: 12px 16px; border-bottom: 1px solid #27272a; cursor: pointer; transition: background 0.1s; }
  .session-item:hover { background: #18181b; }
  .session-item.active { background: #1e293b; border-left: 3px solid #3b82f6; }
  .session-name { font-size: 14px; font-weight: 600; }
  .session-path { font-size: 11px; color: #52525b; margin-top: 2px; }
  .session-meta { font-size: 10px; color: #71717a; margin-top: 4px; display: flex; gap: 8px; align-items: center; }
  .dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
  .dot-alive { background: #34d399; }
  .dot-dead { background: #52525b; }
  .end-btn { background: #7f1d1d; color: #fca5a5; border: none; padding: 3px 8px; border-radius: 4px; font-size: 10px; cursor: pointer; }
  .end-btn:hover { background: #991b1b; }
  .sidebar-empty { padding: 40px 16px; text-align: center; color: #52525b; font-size: 13px; }

  /* chat area */
  .chat-area { flex: 1; display: flex; flex-direction: column; }
  .chat-placeholder { flex: 1; display: flex; align-items: center; justify-content: center; color: #52525b; font-size: 14px; }
  .messages { flex: 1; overflow-y: auto; padding: 16px; }
  .msg { margin-bottom: 12px; max-width: 80%; }
  .msg-user { margin-left: auto; }
  .msg-assistant { margin-right: auto; }
  .msg-bubble { padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
  .msg-user .msg-bubble { background: #3b82f6; color: white; border-bottom-right-radius: 4px; }
  .msg-assistant .msg-bubble { background: #18181b; border: 1px solid #27272a; border-bottom-left-radius: 4px; }
  .msg-tool { font-size: 12px; color: #fb923c; padding: 4px 12px; font-family: monospace; }
  .msg-system { font-size: 11px; color: #52525b; text-align: center; padding: 4px; }
  .msg-label { font-size: 10px; color: #71717a; margin-bottom: 2px; }
  .typing { color: #71717a; font-size: 13px; padding: 4px 16px; font-style: italic; display: none; }
  .typing-dots { display: inline-flex; gap: 3px; margin-left: 6px; vertical-align: middle; }
  .typing-dots span { width: 4px; height: 4px; border-radius: 50%; background: #3b82f6; opacity: 0.6; animation: bounce 0.6s ease-in-out infinite; }
  .typing-dots span:nth-child(2) { animation-delay: 0.15s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.3s; }
  @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }

  /* input */
  .input-area { padding: 12px 16px; border-top: 1px solid #27272a; display: flex; gap: 8px; }
  .input-area input { flex: 1; background: #18181b; border: 1px solid #27272a; border-radius: 10px; padding: 10px 14px; color: #fafafa; font-size: 14px; outline: none; }
  .input-area input:focus { border-color: #3b82f6; }
  .input-area button { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 10px; font-weight: 600; cursor: pointer; font-size: 14px; }
  .input-area button:hover { opacity: 0.9; }
  .input-area button:disabled { background: #27272a; color: #52525b; cursor: default; }

  /* approval bar */
  .approval { padding: 12px 16px; background: #1c1917; border-top: 1px solid #f59e0b33; display: flex; gap: 8px; align-items: center; }
  .approval-text { flex: 1; font-size: 13px; color: #fbbf24; }
  .approval .approve-btn { background: #16a34a; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; }
  .approval .deny-btn { background: #dc2626; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; }

  /* view toggle */
  .view-toggle { display: none; padding: 0 16px; border-bottom: 1px solid #27272a; background: #0a0a0a; }
  .view-toggle.visible { display: flex; }
  .view-tab { background: none; border: none; color: #71717a; font-size: 13px; font-weight: 600; padding: 10px 16px; cursor: pointer; border-bottom: 2px solid transparent; transition: color 0.15s, border-color 0.15s; }
  .view-tab:hover { color: #a1a1aa; }
  .view-tab.active { color: #3b82f6; border-bottom-color: #3b82f6; }

  /* workspace view */
  .workspace-view { flex: 1; display: none; flex-direction: column; background: #0a0a0a; overflow: hidden; }
  .workspace-meta { border-bottom: 1px solid #27272a; }
  .workspace-meta-inner { padding: 12px 16px; }
  .workspace-meta-inner.collapsed { padding: 8px 16px; }
  .meta-row { display: flex; align-items: center; gap: 8px; }
  .meta-model { background: #1e293b; color: #60a5fa; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 4px; }
  .meta-cwd { color: #52525b; font-size: 11px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meta-toggle { color: #3b82f6; font-size: 10px; cursor: pointer; user-select: none; }
  .meta-toggle:hover { opacity: 0.8; }
  .meta-details { margin-top: 8px; }
  .meta-label { color: #71717a; font-size: 10px; }
  .context-bar-wrap { margin-bottom: 8px; }
  .context-bar { height: 6px; background: #27272a; border-radius: 3px; overflow: hidden; }
  .context-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
  .meta-stats { display: flex; gap: 16px; }
  .meta-stat-val { color: #fafafa; font-size: 12px; font-weight: 600; }
  .meta-stat-label { color: #52525b; font-size: 10px; }
  .meta-mcp { margin-top: 8px; }
  .meta-mcp-label { color: #71717a; font-size: 10px; margin-bottom: 4px; }
  .meta-mcp-list { display: flex; flex-wrap: wrap; gap: 4px; }
  .meta-mcp-tag { background: #18181b; color: #a1a1aa; font-size: 10px; padding: 2px 8px; border-radius: 4px; }
  .workspace-canvas { flex: 1; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .workspace-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .workspace-empty-title { color: #1e293b; font-size: 40px; font-weight: 300; margin-bottom: 8px; }
  .workspace-empty-sub { color: #27272a; font-size: 13px; }
  .workspace-frame-wrap { flex: 1; display: none; flex-direction: column; }
  .workspace-title { padding: 6px 16px; border-bottom: 1px solid #27272a; color: #71717a; font-size: 10px; }
  .workspace-iframe { flex: 1; border: none; background: #0a0a0a; width: 100%; }

  /* diagnostics */
  .diag-panel { display: none; padding: 12px 16px; background: #111; border-top: 1px solid #27272a; font-family: monospace; font-size: 11px; max-height: 300px; overflow-y: auto; }
  .diag-panel.open { display: block; }
  .diag-row { display: flex; gap: 12px; margin-bottom: 4px; }
  .diag-label { color: #71717a; min-width: 120px; }
  .diag-value { color: #a1a1aa; }
  .diag-section { color: #3b82f6; font-weight: 600; margin-top: 8px; margin-bottom: 4px; }
  .diag-log { color: #71717a; white-space: pre-wrap; word-break: break-all; margin-top: 8px; padding: 8px; background: #0a0a0a; border-radius: 4px; max-height: 150px; overflow-y: auto; }

  /* console */
  .console-toggle { padding: 4px 16px; background: #18181b; border-top: 1px solid #27272a; cursor: pointer; font-size: 11px; color: #71717a; user-select: none; }
  .console-toggle:hover { color: #a1a1aa; }
  .console { height: 200px; overflow-y: auto; background: #111; border-top: 1px solid #27272a; padding: 8px 12px; font-family: monospace; font-size: 11px; display: none; }
  .console.open { display: block; }
  .console-line { color: #71717a; line-height: 1.4; white-space: pre-wrap; word-break: break-all; }
  .console-line.event { color: #a1a1aa; }
  .console-line.error { color: #f87171; }
  .console-line.ws { color: #60a5fa; }
</style></head><body>

<div class="header">
  <h1>vibelink</h1>
  <div style="display:flex;gap:8px;align-items:center">
    <span class="uptime" id="uptime"></span>
    <button onclick="restartBridge()" style="background:#f59e0b;color:#000;border:none;padding:4px 12px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">rebuild &amp; restart</button>
  </div>
</div>

<div class="main">
  <div class="sidebar">
    <div class="stats" id="stats"></div>
    <div id="sessions"></div>
  </div>
  <div class="content">
    <div class="chat-area" id="chat-area">
      <div class="view-toggle" id="view-toggle">
        <button class="view-tab active" id="tab-chat" onclick="switchView('chat')">chat</button>
        <button class="view-tab" id="tab-terminal" onclick="switchView('terminal')">workspace</button>
      </div>
      <div class="chat-placeholder" id="placeholder">select a session from the sidebar</div>
      <div class="messages" id="messages" style="display:none"></div>
      <div class="workspace-view" id="workspace-view">
        <div class="workspace-meta" id="workspace-meta" style="display:none"></div>
        <div class="workspace-canvas" id="workspace-canvas">
          <div class="workspace-empty" id="workspace-empty">
            <div class="workspace-empty-title">workspace</div>
            <div class="workspace-empty-sub">claude can render artifacts and previews here</div>
          </div>
          <div class="workspace-frame-wrap" id="workspace-frame-wrap">
            <div class="workspace-title" id="workspace-title" style="display:none"></div>
            <iframe id="workspace-iframe" class="workspace-iframe" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
          </div>
        </div>
      </div>
      <div class="typing" id="typing">claude is thinking<span class="typing-dots"><span></span><span></span><span></span></span></div>
      <div class="approval" id="approval" style="display:none">
        <span class="approval-text" id="approval-text"></span>
        <button class="approve-btn" onclick="approveAction()">approve</button>
        <button class="deny-btn" onclick="denyAction()">deny</button>
      </div>
      <div class="input-area" id="input-area" style="display:none">
        <input type="text" id="msg-input" placeholder="message claude..." onkeydown="if(event.key==='Enter'){sendMsg();}" />
        <button onclick="sendMsg()" id="send-btn">send</button>
      </div>
    </div>
    <div style="display:flex;border-top:1px solid #27272a">
      <div class="console-toggle" style="flex:1;border-top:none" onclick="toggleConsole()">console <span id="console-count"></span></div>
      <div class="console-toggle" style="flex:1;border-top:none;border-left:1px solid #27272a" onclick="toggleDiagnostics()">diagnostics</div>
    </div>
    <div class="diag-panel" id="diag-panel"></div>
    <div class="console" id="console"></div>
  </div>
</div>

<script>
const TOKEN = new URLSearchParams(location.search).get('token') || '';
const AUTH = TOKEN ? { 'Authorization': 'Bearer ' + TOKEN } : {};
const HEADERS = { 'Content-Type': 'application/json', ...AUTH };

let activeSessionId = null;
let ws = null;
let consoleOpen = false;
let consoleLines = 0;
let isStreaming = false;
let streamBuffer = '';
let currentView = 'chat';
let sessionEvents = [];
let sessionMeta = {};
let workspaceCanvas = null;
let metaCollapsed = false;

function log(text, cls = '') {
  const el = document.getElementById('console');
  const line = document.createElement('div');
  line.className = 'console-line ' + cls;
  line.textContent = new Date().toLocaleTimeString() + ' ' + text;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
  consoleLines++;
  document.getElementById('console-count').textContent = '(' + consoleLines + ')';
}

function toggleConsole() {
  consoleOpen = !consoleOpen;
  document.getElementById('console').className = consoleOpen ? 'console open' : 'console';
}

// status refresh
async function refreshStatus() {
  try {
    const res = await fetch('/debug', { headers: AUTH });
    const d = await res.json();
    document.getElementById('uptime').textContent = 'up ' + d.uptime;

    const alive = d.sessions.filter(s => s.alive).length;
    const clients = Object.values(d.clientCounts || {}).reduce((a,b) => a+b, 0);
    document.getElementById('stats').innerHTML =
      '<div class="stat-box"><div class="stat-num">' + d.sessions.length + '</div><div class="stat-label">sessions</div></div>' +
      '<div class="stat-box"><div class="stat-num" style="color:#34d399">' + alive + '</div><div class="stat-label">alive</div></div>' +
      '<div class="stat-box"><div class="stat-num" style="color:#60a5fa">' + clients + '</div><div class="stat-label">clients</div></div>';

    let html = '';
    if (d.sessions.length === 0) {
      html = '<div class="sidebar-empty">no active sessions<br><small>start one from the app</small></div>';
    }
    for (const s of d.sessions) {
      const name = s.projectPath.split('/').pop() || s.projectPath;
      const isActive = s.id === activeSessionId;
      html += '<div class="session-item' + (isActive ? ' active' : '') + '" onclick="selectSession(\\'' + s.id + '\\')">';
      html += '<div class="session-name">' + name + '</div>';
      html += '<div class="session-path">' + s.projectPath + '</div>';
      html += '<div class="session-meta"><span class="dot ' + (s.alive ? 'dot-alive' : 'dot-dead') + '"></span> ' + (d.clientCounts[s.id]||0) + ' clients';
      html += ' <button class="end-btn" onclick="event.stopPropagation();endSession(\\'' + s.id + '\\')">end</button></div>';
      html += '</div>';
    }
    document.getElementById('sessions').innerHTML = html;
  } catch(e) { log('refresh failed: ' + e.message, 'error'); }
}

async function endSession(id) {
  await fetch('/sessions/' + id, { method: 'DELETE', headers: AUTH });
  if (id === activeSessionId) { activeSessionId = null; disconnectWs(); showPlaceholder(); }
  refreshStatus();
}

function showPlaceholder() {
  document.getElementById('placeholder').style.display = 'flex';
  document.getElementById('messages').style.display = 'none';
  document.getElementById('workspace-view').style.display = 'none';
  document.getElementById('view-toggle').className = 'view-toggle';
  document.getElementById('input-area').style.display = 'none';
  document.getElementById('typing').style.display = 'none';
  document.getElementById('approval').style.display = 'none';
}

function showChat() {
  document.getElementById('placeholder').style.display = 'none';
  document.getElementById('messages').style.display = 'block';
  document.getElementById('input-area').style.display = 'flex';
  document.getElementById('msg-input').focus();
}

function addMessage(role, text) {
  const el = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg msg-' + role;
  div.innerHTML = '<div class="msg-bubble">' + escapeHtml(text) + '</div>';
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function addToolMsg(text) {
  const el = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = 'msg-tool';
  div.textContent = text;
  el.appendChild(div);
  el.scrollTop = el.scrollHeight;
}

function updateStreamingMsg(text) {
  const el = document.getElementById('messages');
  let existing = el.querySelector('.streaming-msg');
  if (!existing) {
    const div = document.createElement('div');
    div.className = 'msg msg-assistant';
    div.innerHTML = '<div class="msg-bubble streaming-msg"></div>';
    el.appendChild(div);
    existing = div.querySelector('.streaming-msg');
  }
  existing.textContent = text;
  el.scrollTop = el.scrollHeight;
}

function finalizeStreamingMsg() {
  const el = document.getElementById('messages');
  const existing = el.querySelector('.streaming-msg');
  if (existing) existing.classList.remove('streaming-msg');
  streamBuffer = '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function switchView(view) {
  currentView = view;
  document.getElementById('tab-chat').className = 'view-tab' + (view === 'chat' ? ' active' : '');
  document.getElementById('tab-terminal').className = 'view-tab' + (view === 'terminal' ? ' active' : '');

  if (view === 'chat') {
    document.getElementById('messages').style.display = 'block';
    document.getElementById('workspace-view').style.display = 'none';
    document.getElementById('input-area').style.display = 'flex';
    const msgs = document.getElementById('messages');
    msgs.scrollTop = msgs.scrollHeight;
  } else {
    document.getElementById('messages').style.display = 'none';
    document.getElementById('workspace-view').style.display = 'flex';
    document.getElementById('input-area').style.display = 'none';
    renderWorkspaceMeta();
    renderWorkspaceCanvas();
  }
}

function appendTerminalEvent(evt) {
  sessionEvents.push(evt);
}

function formatTokens(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function toggleMeta() {
  metaCollapsed = !metaCollapsed;
  renderWorkspaceMeta();
}

function renderWorkspaceMeta() {
  var el = document.getElementById('workspace-meta');
  if (!sessionMeta.model && !sessionMeta.cwd) { el.style.display = 'none'; return; }
  el.style.display = 'block';

  var totalTokens = (sessionMeta.inputTokens || 0) + (sessionMeta.outputTokens || 0);
  var contextMax = (sessionMeta.model && sessionMeta.model.includes('opus') && sessionMeta.model.includes('1m')) ? 1000000 : 200000;
  var contextPercent = totalTokens > 0 ? Math.min((totalTokens / contextMax) * 100, 100) : 0;
  var barColor = contextPercent > 80 ? '#ef4444' : contextPercent > 50 ? '#f59e0b' : '#3b82f6';

  if (metaCollapsed) {
    var h = '<div class="workspace-meta-inner collapsed"><div class="meta-row">';
    if (sessionMeta.model) h += '<span class="meta-model">' + escapeHtml(sessionMeta.model) + '</span>';
    if (totalTokens > 0) h += '<span style="color:#52525b;font-size:10px">' + formatTokens(totalTokens) + '</span>';
    if (sessionMeta.costUsd != null) h += '<span style="color:#52525b;font-size:10px">$' + sessionMeta.costUsd.toFixed(3) + '</span>';
    h += '<span style="flex:1"></span><span class="meta-toggle" onclick="toggleMeta()">expand</span>';
    h += '</div></div>';
    el.innerHTML = h;
    return;
  }

  var html = '<div class="workspace-meta-inner"><div class="meta-row">';
  if (sessionMeta.model) html += '<span class="meta-model">' + escapeHtml(sessionMeta.model) + '</span>';
  if (sessionMeta.cwd) {
    var shortCwd = sessionMeta.cwd.split('/').slice(-2).join('/');
    html += '<span class="meta-cwd">' + escapeHtml(shortCwd) + '</span>';
  }
  html += '<span class="meta-toggle" onclick="toggleMeta()">collapse</span></div>';
  html += '<div class="meta-details">';

  if (totalTokens > 0) {
    html += '<div class="context-bar-wrap">';
    html += '<div class="meta-row" style="justify-content:space-between;margin-bottom:4px">';
    html += '<span class="meta-label">context window</span>';
    html += '<span class="meta-label">' + formatTokens(totalTokens) + ' / ' + formatTokens(contextMax) + '</span>';
    html += '</div>';
    html += '<div class="context-bar"><div class="context-fill" style="width:' + contextPercent + '%;background:' + barColor + '"></div></div>';
    html += '</div>';
  }

  html += '<div class="meta-stats">';
  if (sessionMeta.numTurns != null) html += '<div><div class="meta-stat-val">' + sessionMeta.numTurns + '</div><div class="meta-stat-label">turns</div></div>';
  if (sessionMeta.costUsd != null) html += '<div><div class="meta-stat-val">$' + sessionMeta.costUsd.toFixed(3) + '</div><div class="meta-stat-label">cost</div></div>';
  if (sessionMeta.cacheReadTokens > 0) html += '<div><div class="meta-stat-val">' + formatTokens(sessionMeta.cacheReadTokens) + '</div><div class="meta-stat-label">cache read</div></div>';
  html += '</div>';

  if (sessionMeta.mcpServers && sessionMeta.mcpServers.length > 0) {
    html += '<div class="meta-mcp"><div class="meta-mcp-label">mcp servers</div><div class="meta-mcp-list">';
    for (var i = 0; i < sessionMeta.mcpServers.length; i++) {
      html += '<span class="meta-mcp-tag">' + escapeHtml(sessionMeta.mcpServers[i]) + '</span>';
    }
    html += '</div></div>';
  }

  html += '</div></div>';
  el.innerHTML = html;
}

function renderWorkspaceCanvas() {
  var empty = document.getElementById('workspace-empty');
  var wrap = document.getElementById('workspace-frame-wrap');
  var iframe = document.getElementById('workspace-iframe');
  var titleEl = document.getElementById('workspace-title');

  if (!workspaceCanvas) {
    empty.style.display = 'flex';
    wrap.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  wrap.style.display = 'flex';

  if (workspaceCanvas.title) {
    titleEl.style.display = 'block';
    titleEl.textContent = workspaceCanvas.title;
  } else {
    titleEl.style.display = 'none';
  }

  if (workspaceCanvas.mode === 'html') {
    iframe.srcdoc = workspaceCanvas.html;
    iframe.removeAttribute('src');
  } else {
    iframe.removeAttribute('srcdoc');
    iframe.src = workspaceCanvas.url;
  }
}

// websocket
function selectSession(id) {
  if (id === activeSessionId) return;
  activeSessionId = id;
  sessionEvents = [];
  sessionMeta = {};
  workspaceCanvas = null;
  metaCollapsed = false;
  document.getElementById('messages').innerHTML = '';
  document.getElementById('view-toggle').className = 'view-toggle visible';
  showChat();
  if (currentView === 'terminal') switchView('terminal');
  connectWs(id);
  refreshStatus();
  log('selected session ' + id.slice(0,8), 'ws');
}

function connectWs(sessionId) {
  disconnectWs();
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const url = proto + '//' + location.host + '/ws/' + sessionId + '?token=' + TOKEN;
  log('connecting: ' + url, 'ws');
  ws = new WebSocket(url);

  ws.onopen = () => { log('websocket connected', 'ws'); };
  ws.onclose = (e) => { log('websocket closed: ' + e.code, 'ws'); };
  ws.onerror = () => { log('websocket error', 'error'); };

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    log(JSON.stringify(data).substring(0, 150), 'event');
    handleEvent(data);
  };
}

function disconnectWs() {
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
}

function handleEvent(data) {
  if (data.type === 'claude_event' && data.event) {
    const evt = data.event;

    // skip events not worth showing in terminal
    const skip = ['hook', 'rate_limit'];
    if (skip.includes(evt.type)) return;

    if (evt.type === 'system') {
      appendTerminalEvent({ type: 'system', text: evt.message || JSON.stringify(evt) });
      if (evt.subtype === 'init') {
        sessionMeta.model = evt.model;
        sessionMeta.cwd = evt.cwd;
        sessionMeta.sessionId = evt.session_id;
        sessionMeta.mcpServers = Array.isArray(evt.mcp_servers)
          ? evt.mcp_servers.map(function(s) { return typeof s === 'string' ? s : (s.name || String(s)); })
          : [];
        renderWorkspaceMeta();
      }
    }

    if (evt.type === 'stream_event') {
      const delta = evt.event?.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        streamBuffer += delta.text;
        updateStreamingMsg(streamBuffer);
        document.getElementById('typing').style.display = 'none';
        isStreaming = true;
        appendTerminalEvent({ type: 'text_delta', text: delta.text });
      }
      // skip signature_delta, thinking_delta
    }

    if (evt.type === 'assistant') {
      const hadStreamedText = streamBuffer.length > 0;
      finalizeStreamingMsg();
      isStreaming = false;
      document.getElementById('typing').style.display = 'none';

      if (evt.message?.content) {
        for (const block of evt.message.content) {
          // only add text to terminal if we didn't already stream it
          if (block.type === 'text' && block.text && !hadStreamedText) {
            appendTerminalEvent({ type: 'assistant', text: block.text });
          }
          if (block.type === 'tool_use') {
            addToolMsg('> ' + block.name + '(' + JSON.stringify(block.input || {}).substring(0, 100) + ')');
            const inputStr = JSON.stringify(block.input || {}).substring(0, 120);
            appendTerminalEvent({ type: 'tool_use', text: block.name + '(' + inputStr + ')' });
          }
        }
      }
    }

    if (evt.type === 'user') {
      if (Array.isArray(evt.message?.content)) {
        for (const block of evt.message.content) {
          if (block.type === 'text') {
            addMessage('user', block.text);
            appendTerminalEvent({ type: 'user', text: block.text });
          }
          if (block.type === 'tool_result') {
            const out = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
            addToolMsg('result: ' + out.substring(0, 200));
            appendTerminalEvent({ type: 'tool_result', text: 'result: ' + out.substring(0, 200) });
          }
        }
      }
    }

    if (evt.type === 'result') {
      finalizeStreamingMsg();
      isStreaming = false;
      document.getElementById('typing').style.display = 'none';
      const duration = evt.duration_ms ? ('done in ' + evt.duration_ms + 'ms') : 'done';
      appendTerminalEvent({ type: 'result', text: duration });
      if (evt.usage) {
        sessionMeta.inputTokens = evt.usage.input_tokens || 0;
        sessionMeta.outputTokens = evt.usage.output_tokens || 0;
        sessionMeta.cacheReadTokens = evt.usage.cache_read_input_tokens || 0;
      }
      if (evt.cost_usd != null) sessionMeta.costUsd = evt.cost_usd;
      if (evt.duration_ms != null) sessionMeta.durationMs = evt.duration_ms;
      if (evt.num_turns != null) sessionMeta.numTurns = evt.num_turns;
      renderWorkspaceMeta();
    }
  }

  if (data.type === 'permission_request') {
    const tool = data.toolName || 'unknown';
    const input = JSON.stringify(data.toolInput || {}).substring(0, 150);
    document.getElementById('approval-text').textContent = tool + ': ' + input;
    document.getElementById('approval').style.display = 'flex';
    document.getElementById('approval').dataset.requestId = data.requestId || '';
    log('permission request: ' + tool, 'event');
  }

  if (data.type === 'workspace_html') {
    workspaceCanvas = { mode: 'html', html: data.html, title: data.title };
    renderWorkspaceCanvas();
    log('workspace: html rendered' + (data.title ? ' (' + data.title + ')' : ''), 'event');
  }
  if (data.type === 'workspace_url') {
    workspaceCanvas = { mode: 'url', url: data.url, title: data.title };
    renderWorkspaceCanvas();
    log('workspace: url ' + data.url, 'event');
  }
  if (data.type === 'workspace_clear') {
    workspaceCanvas = null;
    renderWorkspaceCanvas();
    log('workspace: cleared', 'event');
  }
}

function sendMsg() {
  const input = document.getElementById('msg-input');
  const text = input.value.trim();
  if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;

  addMessage('user', text);
  appendTerminalEvent({ type: 'user', text: text });
  ws.send(JSON.stringify({ type: 'user_message', content: text }));
  input.value = '';
  document.getElementById('typing').style.display = 'block';
  isStreaming = true;
  input.focus();
}

function approveAction() {
  const requestId = document.getElementById('approval').dataset.requestId;
  if (ws && requestId) {
    ws.send(JSON.stringify({ type: 'permission_response', requestId: requestId, behavior: 'allow' }));
  }
  document.getElementById('approval').style.display = 'none';
}
function denyAction() {
  const requestId = document.getElementById('approval').dataset.requestId;
  if (ws && requestId) {
    ws.send(JSON.stringify({ type: 'permission_response', requestId: requestId, behavior: 'deny' }));
  }
  document.getElementById('approval').style.display = 'none';
}

let diagOpen = false;
async function toggleDiagnostics() {
  diagOpen = !diagOpen;
  const panel = document.getElementById('diag-panel');
  if (!diagOpen) { panel.className = 'diag-panel'; return; }
  panel.className = 'diag-panel open';
  panel.innerHTML = '<div style="color:#71717a">loading...</div>';
  try {
    const res = await fetch('/diagnostics');
    const d = await res.json();
    let html = '<div class="diag-section">bridge</div>';
    html += '<div class="diag-row"><span class="diag-label">pid</span><span class="diag-value">' + d.pid + '</span></div>';
    html += '<div class="diag-row"><span class="diag-label">uptime</span><span class="diag-value">' + d.uptime + '</span></div>';
    html += '<div class="diag-row"><span class="diag-label">port</span><span class="diag-value">' + d.port + '</span></div>';
    html += '<div class="diag-row"><span class="diag-label">node</span><span class="diag-value">' + d.nodeVersion + '</span></div>';
    html += '<div class="diag-row"><span class="diag-label">pending perms</span><span class="diag-value">' + d.pendingPermissions + '</span></div>';
    html += '<div class="diag-section">env</div>';
    for (const [k,v] of Object.entries(d.env)) {
      html += '<div class="diag-row"><span class="diag-label">' + k + '</span><span class="diag-value">' + v + '</span></div>';
    }
    html += '<div class="diag-section">sessions</div>';
    if (d.sessions.length === 0) html += '<div class="diag-value">none</div>';
    for (const s of d.sessions) {
      html += '<div class="diag-row"><span class="diag-label">' + s.id + '</span><span class="diag-value">' + s.project + ' (' + (s.alive ? '<span style="color:#34d399">alive</span>' : 'dead') + ')</span></div>';
    }
    html += '<div class="diag-section">permission hook log (last 20 lines)</div>';
    html += '<div class="diag-log">' + escapeHtml(d.hookLog) + '</div>';
    panel.innerHTML = html;
  } catch(e) { panel.innerHTML = '<div style="color:#f87171">failed: ' + e.message + '</div>'; }
}

async function restartBridge() {
  if (!confirm('Rebuild and restart the bridge?')) return;
  log('rebuilding bridge...', 'ws');
  try {
    await fetch('/restart', { method: 'POST' });
  } catch {}
  // poll until it comes back
  let attempts = 0;
  const poll = setInterval(async () => {
    attempts++;
    try {
      const r = await fetch('/health');
      if (r.ok) {
        clearInterval(poll);
        log('bridge restarted', 'ws');
        location.reload();
      }
    } catch {}
    if (attempts > 30) { clearInterval(poll); log('restart timed out', 'error'); }
  }, 1000);
}

refreshStatus();
setInterval(refreshStatus, 2000);
</script></body></html>`;
}
