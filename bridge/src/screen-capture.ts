import { spawn, execSync, ChildProcess } from "child_process";
import { EventEmitter } from "events";

// --- types ---

export interface WindowInfo {
  id: string;
  title: string;
  className: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StreamOptions {
  width?: number;
  height?: number;
  fps?: number;
  quality?: number;
}

const DEFAULT_OPTS: Required<StreamOptions> = {
  width: 1280,
  height: 720,
  fps: 5,
  quality: 10,
};

const MAX_CONCURRENT_STREAMS = 3;

// jpeg markers
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

// --- window discovery ---

function parseGeometry(output: string): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const vals: Record<string, number> = {};
  for (const line of output.split("\n")) {
    const [key, val] = line.split("=");
    if (key && val) vals[key.trim()] = parseInt(val.trim(), 10);
  }
  return {
    x: vals["X"] ?? 0,
    y: vals["Y"] ?? 0,
    width: vals["WIDTH"] ?? 0,
    height: vals["HEIGHT"] ?? 0,
  };
}

export function listWindows(): WindowInfo[] {
  let ids: string[];
  try {
    const raw = execSync("xdotool search --onlyvisible --name ''", {
      encoding: "utf-8",
      timeout: 5000,
    });
    ids = raw.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }

  const windows: WindowInfo[] = [];

  for (const decId of ids) {
    // store as hex without 0x prefix (matches binary header format)
    const hexId = parseInt(decId, 10).toString(16);
    try {
      const title = execSync(`xdotool getwindowname ${decId}`, {
        encoding: "utf-8",
        timeout: 2000,
      }).trim();

      // skip desktop, panels, and unnamed windows
      if (!title || title === "Desktop" || title === "Plasma") continue;

      const geoRaw = execSync(`xdotool getwindowgeometry --shell ${decId}`, {
        encoding: "utf-8",
        timeout: 2000,
      });
      const geo = parseGeometry(geoRaw);

      // skip tiny windows (panels, tooltips, etc)
      if (geo.width < 100 || geo.height < 100) continue;

      let className = "";
      try {
        // xprop returns WM_CLASS(STRING) = "instance", "class"
        const xprop = execSync(
          `xprop -id ${decId} WM_CLASS 2>/dev/null`,
          { encoding: "utf-8", timeout: 2000 }
        );
        const match = xprop.match(/"([^"]+)",\s*"([^"]+)"/);
        if (match) className = match[2];
      } catch {
        // xprop may not be available
      }

      windows.push({ id: hexId, title, className, ...geo });
    } catch {
      // window may have closed between search and query
      continue;
    }
  }

  return windows;
}

// --- jpeg frame parser ---

class JpegFrameParser {
  private buffer = Buffer.alloc(0);
  private frameStart = -1;

  // returns complete jpeg frames extracted from chunk
  push(chunk: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames: Buffer[] = [];

    let searchFrom = 0;

    while (searchFrom < this.buffer.length - 1) {
      if (this.frameStart === -1) {
        // look for SOI marker
        const soiIdx = this.findMarker(this.buffer, SOI, searchFrom);
        if (soiIdx === -1) break;
        this.frameStart = soiIdx;
        searchFrom = soiIdx + 2;
      } else {
        // look for EOI marker
        const eoiIdx = this.findMarker(this.buffer, EOI, searchFrom);
        if (eoiIdx === -1) break;

        // extract complete frame (SOI through EOI inclusive)
        const frame = this.buffer.subarray(this.frameStart, eoiIdx + 2);
        frames.push(Buffer.from(frame));

        searchFrom = eoiIdx + 2;
        this.frameStart = -1;
      }
    }

    // trim consumed data
    if (this.frameStart === -1) {
      // no partial frame — keep only unscanned tail
      this.buffer = this.buffer.subarray(searchFrom);
    } else {
      // partial frame in progress — keep from frameStart
      this.buffer = this.buffer.subarray(this.frameStart);
      this.frameStart = 0;
    }

    return frames;
  }

  private findMarker(buf: Buffer, marker: Buffer, from: number): number {
    for (let i = from; i < buf.length - 1; i++) {
      if (buf[i] === marker[0] && buf[i + 1] === marker[1]) return i;
    }
    return -1;
  }
}

// --- stream manager ---

interface ActiveStream {
  process: ChildProcess;
  parser: JpegFrameParser;
  windowId: string;
  frameCount: number;
}

export class CaptureManager extends EventEmitter {
  private streams = new Map<string, ActiveStream>();

  startStream(windowId: string, opts?: StreamOptions): void {
    if (this.streams.has(windowId)) {
      this.emit("error", windowId, new Error("already streaming this window"));
      return;
    }

    if (this.streams.size >= MAX_CONCURRENT_STREAMS) {
      this.emit(
        "error",
        windowId,
        new Error(`max concurrent streams (${MAX_CONCURRENT_STREAMS}) reached`)
      );
      return;
    }

    const o = { ...DEFAULT_OPTS, ...opts };

    // convert hex window id to decimal for ffmpeg
    const decId = parseInt(windowId, 16).toString(10);

    const ffmpeg = spawn(
      "ffmpeg",
      [
        "-f", "x11grab",
        "-window_id", decId,
        "-video_size", `${o.width}x${o.height}`,
        "-framerate", String(o.fps),
        "-i", `:0`,
        "-f", "mjpeg",
        "-q:v", String(o.quality),
        "-an",
        "pipe:1",
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    const parser = new JpegFrameParser();
    const stream: ActiveStream = {
      process: ffmpeg,
      parser,
      windowId,
      frameCount: 0,
    };

    ffmpeg.stdout!.on("data", (chunk: Buffer) => {
      const frames = parser.push(chunk);
      for (const frame of frames) {
        stream.frameCount++;
        this.emit("frame", windowId, frame, stream.frameCount);
      }
    });

    ffmpeg.stderr!.on("data", () => {
      // ffmpeg writes progress to stderr — ignore
    });

    ffmpeg.on("error", (err) => {
      this.streams.delete(windowId);
      this.emit("error", windowId, err);
    });

    ffmpeg.on("close", (code) => {
      this.streams.delete(windowId);
      if (code !== 0 && code !== null) {
        this.emit(
          "error",
          windowId,
          new Error(`ffmpeg exited with code ${code}`)
        );
      }
      this.emit("stopped", windowId);
    });

    this.streams.set(windowId, stream);
  }

  stopStream(windowId: string): void {
    const stream = this.streams.get(windowId);
    if (!stream) return;
    stream.process.kill("SIGTERM");
    this.streams.delete(windowId);
  }

  stopAll(): void {
    for (const [id] of this.streams) {
      this.stopStream(id);
    }
  }

  isStreaming(windowId: string): boolean {
    return this.streams.has(windowId);
  }

  activeStreams(): string[] {
    return [...this.streams.keys()];
  }
}

// --- binary frame header ---
// used when sending frames over websocket to identify which stream
// the frame belongs to (for multi-stream routing on the phone)

const MAGIC = Buffer.from("VLSF"); // vibelink stream frame
const HEADER_SIZE = 20;

export function packFrame(
  windowId: string,
  jpegData: Buffer,
  seq: number
): Buffer {
  const header = Buffer.alloc(HEADER_SIZE);
  MAGIC.copy(header, 0);
  // window id as 12-byte zero-padded hex (no 0x prefix)
  const hexId = windowId.replace("0x", "").padStart(12, "0").slice(0, 12);
  header.write(hexId, 4, 12, "ascii");
  header.writeUInt32BE(seq, 16);
  return Buffer.concat([header, jpegData]);
}

export function unpackFrame(data: Buffer): {
  windowId: string;
  seq: number;
  jpeg: Buffer;
} | null {
  if (data.length < HEADER_SIZE) return null;
  if (data.subarray(0, 4).toString() !== "VLSF") return null;
  const windowId = data.subarray(4, 16).toString("ascii").replace(/^0+/, "");
  const seq = data.readUInt32BE(16);
  const jpeg = data.subarray(HEADER_SIZE);
  return { windowId, seq, jpeg };
}

// --- standalone test mode ---
// run with: cd bridge && npx tsx src/screen-capture.ts
// opens a websocket server on port 3402 that streams frames
// and serves a test html page on port 3403

const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("screen-capture.ts");

if (isMain) {
  const { createServer } = await import("http");
  const { WebSocketServer } = await import("ws");

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

      // binary frame
      const buf = new Uint8Array(e.data);
      // skip 20-byte header (VLSF magic + 12-byte window ID + 4-byte seq)
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

  // http server for test page
  const httpServer = createServer(
    (_req: any, res: { writeHead: Function; end: Function }) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(testPage);
    }
  );

  // websocket server for streaming
  const wss = new WebSocketServer({ port: TEST_WS_PORT });
  const capture = new CaptureManager();

  wss.on("connection", (client: any) => {
    console.log("client connected");

    client.on("message", (raw: Buffer | string) => {
      const msg = JSON.parse(raw.toString());

      if (msg.type === "list_windows") {
        const windows = listWindows();
        client.send(JSON.stringify({ type: "window_list", windows }));
        console.log(`found ${windows.length} windows`);
      }

      if (msg.type === "start_stream") {
        console.log(`starting stream for ${msg.windowId}`);
        capture.startStream(msg.windowId);
      }

      if (msg.type === "stop_stream") {
        capture.stopAll();
        console.log("streams stopped");
      }
    });

    // forward frames to this client
    const onFrame = (windowId: string, jpeg: Buffer, seq: number) => {
      if (client.readyState === 1) {
        const packed = packFrame(windowId, jpeg, seq);
        client.send(packed);
      }
    };

    capture.on("frame", onFrame);

    client.on("close", () => {
      capture.removeListener("frame", onFrame);
      capture.stopAll();
      console.log("client disconnected, streams stopped");
    });
  });

  capture.on("error", (windowId: string, err: Error) => {
    console.error(`stream error [${windowId}]:`, err.message);
  });

  capture.on("stopped", (windowId: string) => {
    console.log(`stream stopped [${windowId}]`);
  });

  httpServer.listen(TEST_HTTP_PORT, () => {
    console.log(`\nVibeLink Screen Mirror — Test Mode`);
    console.log(`  test page:  http://localhost:${TEST_HTTP_PORT}`);
    console.log(`  websocket:  ws://localhost:${TEST_WS_PORT}`);
    console.log(`\nopen the test page, click "List Windows", then click a window to stream.\n`);
  });
}
