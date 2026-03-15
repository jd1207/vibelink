// standalone test mode for screen capture
// run with: cd bridge && npx tsx src/screen-capture-test.ts
// opens a websocket server on port 3402 that streams frames
// and serves a test html page on port 3403

import { createServer } from "http";
import { WebSocketServer } from "ws";
import { CaptureManager, listWindows, packFrame } from "./screen-capture.js";

const TEST_WS_PORT = 3402;
const TEST_HTTP_PORT = 3403;

const testPage = `<!DOCTYPE html>
<html>
<head>
  <title>VibeLink Screen Mirror Test</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0f172a; color: #e2e8f0; font-family: system-ui; }
    .header { padding: 16px 24px; background: #1e293b; border-bottom: 1px solid #334155;
              display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 16px; color: #60a5fa; }
    .stats { font-size: 12px; color: #94a3b8; font-family: monospace; }
    .controls { padding: 16px 24px; background: #1e293b; border-bottom: 1px solid #334155;
                display: flex; gap: 8px; flex-wrap: wrap; }
    .controls button { background: #2563eb; color: white; border: none; padding: 8px 16px;
                       border-radius: 4px; cursor: pointer; font-size: 13px; }
    .controls button:hover { background: #3b82f6; }
    .controls button.stop { background: #dc2626; }
    .controls button.stop:hover { background: #ef4444; }
    .window-list { padding: 16px 24px; }
    .window-item { background: #1e293b; border: 1px solid #334155; border-radius: 4px;
                   padding: 10px 16px; margin-bottom: 4px; cursor: pointer;
                   display: flex; justify-content: space-between; font-size: 13px; }
    .window-item:hover { border-color: #2563eb; }
    .window-item .dim { color: #64748b; }
    .stream-area { padding: 16px 24px; display: flex; justify-content: center; }
    .stream-area img { max-width: 100%; border: 1px solid #334155; border-radius: 4px; }
    .no-stream { color: #475569; text-align: center; padding: 60px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>VibeLink Screen Mirror — Test</h1>
    <div class="stats" id="stats">not connected</div>
  </div>
  <div class="controls">
    <button onclick="listWindows()">List Windows</button>
    <button class="stop" onclick="stopStream()">Stop Stream</button>
  </div>
  <div class="window-list" id="windowList"></div>
  <div class="stream-area">
    <img id="frame" style="display:none" />
    <div class="no-stream" id="placeholder">select a window to stream</div>
  </div>

  <script>
    const ws = new WebSocket('ws://localhost:${TEST_WS_PORT}');
    const frame = document.getElementById('frame');
    const placeholder = document.getElementById('placeholder');
    const stats = document.getElementById('stats');
    const windowList = document.getElementById('windowList');

    let frameCount = 0;
    let lastFrameTime = 0;
    let fps = 0;
    let prevBlobUrl = null;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => { stats.textContent = 'connected'; };
    ws.onclose = () => { stats.textContent = 'disconnected'; };

    ws.onmessage = (e) => {
      if (typeof e.data === 'string') {
        const msg = JSON.parse(e.data);
        if (msg.type === 'window_list') {
          renderWindowList(msg.windows);
        }
        return;
      }

      // binary frame — skip 20-byte VLSF header
      const buf = new Uint8Array(e.data);
      const jpeg = buf.slice(20);
      const blob = new Blob([jpeg], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);

      if (prevBlobUrl) URL.revokeObjectURL(prevBlobUrl);
      prevBlobUrl = url;

      frame.src = url;
      frame.style.display = 'block';
      placeholder.style.display = 'none';

      frameCount++;
      const now = performance.now();
      if (lastFrameTime > 0) {
        const dt = now - lastFrameTime;
        fps = 0.9 * fps + 0.1 * (1000 / dt);
      }
      lastFrameTime = now;
      stats.textContent =
        'frames: ' + frameCount +
        ' | fps: ' + fps.toFixed(1) +
        ' | size: ' + (jpeg.length / 1024).toFixed(0) + ' KB';
    };

    function renderWindowList(windows) {
      windowList.innerHTML = windows.map(w =>
        '<div class="window-item" onclick="startStream(\\'' + w.id + '\\')">' +
          '<span>' + escHtml(w.title) + '</span>' +
          '<span class="dim">' + w.width + 'x' + w.height + '</span>' +
        '</div>'
      ).join('');
    }

    function listWindows() {
      ws.send(JSON.stringify({ type: 'list_windows' }));
    }

    function startStream(windowId) {
      ws.send(JSON.stringify({ type: 'start_stream', windowId }));
      windowList.innerHTML = '';
    }

    function stopStream() {
      ws.send(JSON.stringify({ type: 'stop_stream' }));
      frame.style.display = 'none';
      placeholder.style.display = 'block';
      frameCount = 0;
      fps = 0;
      stats.textContent = 'connected';
    }

    function escHtml(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }
  </script>
</body>
</html>`;

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(testPage);
});

const wss = new WebSocketServer({ port: TEST_WS_PORT });
const capture = new CaptureManager();

wss.on("connection", (client) => {
  console.log("[test] client connected");

  client.on("message", (raw: Buffer | string) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === "list_windows") {
      const windows = listWindows();
      client.send(JSON.stringify({ type: "window_list", windows }));
      console.log(`[test] found ${windows.length} windows`);
    }

    if (msg.type === "start_stream") {
      // stop any existing streams before starting a new one
      // prevents flickering from multiple streams emitting frames
      capture.stopAll();
      console.log(`[test] starting stream for ${msg.windowId}`);
      capture.startStream(msg.windowId);
    }

    if (msg.type === "stop_stream") {
      capture.stopAll();
      console.log("[test] streams stopped");
    }
  });

  const onFrame = (windowId: string, jpeg: Buffer, seq: number) => {
    if (client.readyState === 1) {
      client.send(packFrame(windowId, jpeg, seq));
    }
  };

  capture.on("frame", onFrame);

  client.on("close", () => {
    capture.removeListener("frame", onFrame);
    capture.stopAll();
    console.log("[test] client disconnected, streams stopped");
  });
});

capture.on("error", (windowId: string, err: Error) => {
  console.error(`[test] stream error [${windowId}]: ${err.message}`);
});

capture.on("stopped", (windowId: string) => {
  console.log(`[test] stream stopped [${windowId}]`);
});

capture.on("restarting", (windowId: string, attempt: number) => {
  console.log(`[test] stream restarting [${windowId}] attempt=${attempt}`);
});

httpServer.listen(TEST_HTTP_PORT, () => {
  console.log(`\nVibeLink Screen Mirror — Test Mode`);
  console.log(`  test page:  http://localhost:${TEST_HTTP_PORT}`);
  console.log(`  websocket:  ws://localhost:${TEST_WS_PORT}`);
  console.log(`\nopen the test page, click "List Windows", then click a window to stream.\n`);
});
