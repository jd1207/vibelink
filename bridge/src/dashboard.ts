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
  .typing { color: #71717a; font-size: 13px; padding: 4px 16px; font-style: italic; }

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

  /* terminal view */
  .terminal-view { flex: 1; overflow-y: auto; padding: 12px 16px; font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace; font-size: 13px; line-height: 1.6; display: none; background: #0a0a0a; }
  .term-line { white-space: pre-wrap; word-break: break-all; }
  .term-system { color: #60a5fa; }
  .term-text { color: #e4e4e7; }
  .term-assistant { color: #34d399; }
  .term-user { color: #60a5fa; }
  .term-tool { color: #fb923c; }
  .term-tool-result { color: rgba(194, 129, 48, 0.5); }
  .term-result { color: #71717a; }

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
  <span class="uptime" id="uptime"></span>
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
        <button class="view-tab" id="tab-terminal" onclick="switchView('terminal')">terminal</button>
      </div>
      <div class="chat-placeholder" id="placeholder">select a session from the sidebar</div>
      <div class="messages" id="messages" style="display:none"></div>
      <div class="terminal-view" id="terminal-view"></div>
      <div class="typing" id="typing" style="display:none">claude is thinking...</div>
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
    <div class="console-toggle" onclick="toggleConsole()">console <span id="console-count"></span></div>
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
  document.getElementById('terminal-view').style.display = 'none';
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
    document.getElementById('terminal-view').style.display = 'none';
    document.getElementById('input-area').style.display = 'flex';
    const msgs = document.getElementById('messages');
    msgs.scrollTop = msgs.scrollHeight;
  } else {
    document.getElementById('messages').style.display = 'none';
    document.getElementById('terminal-view').style.display = 'block';
    document.getElementById('input-area').style.display = 'none';
    renderTerminal();
  }
}

function renderTerminal() {
  const el = document.getElementById('terminal-view');
  el.innerHTML = '';
  let textAccum = '';

  function flushText() {
    if (!textAccum) return;
    const line = document.createElement('div');
    line.className = 'term-line term-text';
    line.textContent = textAccum;
    el.appendChild(line);
    textAccum = '';
  }

  for (const evt of sessionEvents) {
    if (evt.type === 'system') {
      flushText();
      const line = document.createElement('div');
      line.className = 'term-line term-system';
      line.textContent = 'system: ' + evt.text;
      el.appendChild(line);
    } else if (evt.type === 'text_delta') {
      textAccum += evt.text;
    } else if (evt.type === 'assistant') {
      flushText();
      const line = document.createElement('div');
      line.className = 'term-line term-assistant';
      line.textContent = evt.text;
      el.appendChild(line);
    } else if (evt.type === 'user') {
      flushText();
      const line = document.createElement('div');
      line.className = 'term-line term-user';
      line.textContent = 'you: ' + evt.text;
      el.appendChild(line);
    } else if (evt.type === 'tool_use') {
      flushText();
      const line = document.createElement('div');
      line.className = 'term-line term-tool';
      line.textContent = '> ' + evt.text;
      el.appendChild(line);
    } else if (evt.type === 'tool_result') {
      flushText();
      const line = document.createElement('div');
      line.className = 'term-line term-tool-result';
      line.textContent = evt.text;
      el.appendChild(line);
    } else if (evt.type === 'result') {
      flushText();
      const line = document.createElement('div');
      line.className = 'term-line term-result';
      line.textContent = evt.text;
      el.appendChild(line);
    }
  }
  flushText();
  el.scrollTop = el.scrollHeight;
}

function appendTerminalEvent(evt) {
  sessionEvents.push(evt);
  if (currentView === 'terminal') renderTerminal();
}

// websocket
function selectSession(id) {
  if (id === activeSessionId) return;
  activeSessionId = id;
  sessionEvents = [];
  document.getElementById('messages').innerHTML = '';
  document.getElementById('terminal-view').innerHTML = '';
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
      finalizeStreamingMsg();
      isStreaming = false;
      document.getElementById('typing').style.display = 'none';

      // extract text content for terminal
      if (evt.message?.content) {
        for (const block of evt.message.content) {
          if (block.type === 'text' && block.text) {
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
    }
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

function approveAction() { /* todo: hook into permission flow */ }
function denyAction() { /* todo: hook into permission flow */ }

refreshStatus();
setInterval(refreshStatus, 2000);
</script></body></html>`;
}
