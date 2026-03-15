import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import { config } from "./config.js";
import { x11Env, getWindowGeometry } from "./x11-helpers.js";

export type { WindowInfo } from "./x11-helpers.js";
export { listWindows } from "./x11-helpers.js";

export interface StreamOptions {
  width?: number;
  height?: number;
  fps?: number;
  quality?: number;
}

export interface StreamStatus {
  windowId: string;
  alive: boolean;
  frameCount: number;
  byteCount: number;
  fps: number;
  uptimeMs: number;
  restartCount: number;
  lastFrameAgoMs: number;
  avgFrameSizeKb: number;
  lastError: string | null;
  ffmpegPid: number | null;
  ffmpegStderr: string[];
}

const DEFAULT_OPTS: Required<StreamOptions> = {
  width: 1280,
  height: 720,
  fps: 5,
  quality: 10,
};

const MAX_RESTARTS = 3;
const RESTART_DELAYS = [1000, 2000, 4000];
const STATS_INTERVAL_MS = 5000;
const STDERR_MAX_LINES = 20;
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

function log(tag: string, msg: string, data?: Record<string, unknown>): void {
  const extra = data
    ? " " + Object.entries(data).map(([k, v]) => `${k}=${v}`).join(" ")
    : "";
  console.log(`[capture:${tag}] ${msg}${extra}`);
}

// --- jpeg frame parser ---

class JpegFrameParser {
  private buffer = Buffer.alloc(0);
  private frameStart = -1;

  push(chunk: Buffer): Buffer[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames: Buffer[] = [];
    let searchFrom = 0;

    while (searchFrom < this.buffer.length - 1) {
      if (this.frameStart === -1) {
        const soiIdx = this.findMarker(SOI, searchFrom);
        if (soiIdx === -1) break;
        this.frameStart = soiIdx;
        searchFrom = soiIdx + 2;
      } else {
        const eoiIdx = this.findMarker(EOI, searchFrom);
        if (eoiIdx === -1) break;
        frames.push(Buffer.from(this.buffer.subarray(this.frameStart, eoiIdx + 2)));
        searchFrom = eoiIdx + 2;
        this.frameStart = -1;
      }
    }

    if (this.frameStart === -1) {
      this.buffer = this.buffer.subarray(searchFrom);
    } else {
      this.buffer = this.buffer.subarray(this.frameStart);
      this.frameStart = 0;
    }

    return frames;
  }

  private findMarker(marker: Buffer, from: number): number {
    for (let i = from; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === marker[0] && this.buffer[i + 1] === marker[1]) return i;
    }
    return -1;
  }
}

// --- stream state ---

interface ActiveStream {
  process: ChildProcess;
  parser: JpegFrameParser;
  windowId: string;
  opts: Required<StreamOptions>;
  frameCount: number;
  byteCount: number;
  startedAt: number;
  lastFrameAt: number;
  restartCount: number;
  stderrLines: string[];
  stopping: boolean;
  lastError: string | null;
  statsTimer: ReturnType<typeof setInterval> | null;
}

// --- capture manager ---

export class CaptureManager extends EventEmitter {
  private streams = new Map<string, ActiveStream>();
  private pendingRestarts = new Set<string>();

  startStream(windowId: string, opts?: StreamOptions): void {
    if (this.streams.has(windowId)) {
      log(windowId, "already streaming, ignoring duplicate start");
      this.emit("error", windowId, new Error("already streaming this window"));
      return;
    }

    if (this.streams.size >= config.maxConcurrentStreams) {
      log(windowId, "max concurrent streams reached", { max: config.maxConcurrentStreams });
      this.emit("error", windowId, new Error(`max concurrent streams (${config.maxConcurrentStreams}) reached`));
      return;
    }

    // strip undefined values so they don't overwrite defaults
    // (server.ts passes {fps: undefined} when mobile doesn't specify)
    const defined = opts
      ? Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined))
      : {};
    const o = { ...DEFAULT_OPTS, ...defined } as Required<StreamOptions>;
    log(windowId, "starting stream", { size: `${o.width}x${o.height}`, fps: o.fps, quality: o.quality });
    this.spawnFfmpeg(windowId, o, 0);
  }

  private spawnFfmpeg(windowId: string, opts: Required<StreamOptions>, restartCount: number): void {
    const decId = parseInt(windowId, 16).toString(10);

    // capture at the window's actual size so we get the full content
    // (hardcoded 1280x720 would cut off taller windows)
    const geo = getWindowGeometry(windowId);
    let captureW: number;
    let captureH: number;
    if (geo) {
      captureW = geo.width;
      captureH = geo.height;
      log(windowId, "window geometry", { size: `${captureW}x${captureH}` });
    } else {
      captureW = opts.width;
      captureH = opts.height;
      log(windowId, "could not query window geometry, using requested size");
    }

    const args = [
      "-f", "x11grab",
      "-window_id", decId,
      "-video_size", `${captureW}x${captureH}`,
      "-framerate", String(opts.fps),
      "-i", `:0`,
      "-f", "mjpeg",
      "-q:v", String(opts.quality),
      "-an",
      "pipe:1",
    ];

    const ffmpeg = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: x11Env(),
    });

    log(windowId, "ffmpeg spawned", { pid: ffmpeg.pid ?? "unknown", restart: restartCount });

    const parser = new JpegFrameParser();
    const stream: ActiveStream = {
      process: ffmpeg,
      parser,
      windowId,
      opts,
      frameCount: 0,
      byteCount: 0,
      startedAt: Date.now(),
      lastFrameAt: 0,
      restartCount,
      stderrLines: [],
      stopping: false,
      lastError: null,
      statsTimer: null,
    };

    stream.statsTimer = setInterval(() => {
      const status = this.getStreamStatus(windowId);
      if (status) {
        log(windowId, "periodic-stats", {
          frames: status.frameCount,
          fps: status.fps.toFixed(1),
          totalKb: (status.byteCount / 1024).toFixed(0),
          avgFrameKb: status.avgFrameSizeKb.toFixed(1),
          uptime: `${(status.uptimeMs / 1000).toFixed(0)}s`,
          lastFrameAgo: status.lastFrameAgoMs >= 0 ? `${status.lastFrameAgoMs}ms` : "never",
        });
        this.emit("stats", windowId, status);
      }
    }, STATS_INTERVAL_MS);

    ffmpeg.stdout!.on("data", (chunk: Buffer) => {
      const frames = parser.push(chunk);
      for (const frame of frames) {
        stream.frameCount++;
        stream.byteCount += frame.length;
        stream.lastFrameAt = Date.now();

        if (stream.frameCount === 1) {
          log(windowId, "first frame received", { sizeKb: (frame.length / 1024).toFixed(1) });
        }

        this.emit("frame", windowId, frame, stream.frameCount);
      }
    });

    ffmpeg.stderr!.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        stream.stderrLines.push(line.trimEnd());
        if (stream.stderrLines.length > STDERR_MAX_LINES) {
          stream.stderrLines.shift();
        }
      }
    });

    ffmpeg.on("error", (err) => {
      log(windowId, "ffmpeg process error", { error: err.message });
      stream.lastError = err.message;
      this.cleanupStream(windowId);
      this.emit("error", windowId, err);
    });

    ffmpeg.on("close", (code) => {
      if (stream.stopping) {
        log(windowId, "stopped gracefully", { frames: stream.frameCount, bytes: stream.byteCount });
        this.cleanupStream(windowId);
        this.emit("stopped", windowId);
        return;
      }

      if (code !== 0 && code !== null) {
        const stderrTail = stream.stderrLines.slice(-5).join(" | ");
        log(windowId, "ffmpeg exited unexpectedly", {
          code,
          frames: stream.frameCount,
          stderr: stderrTail || "(empty)",
        });
        stream.lastError = `ffmpeg exited with code ${code}`;

        if (restartCount < MAX_RESTARTS) {
          const delay = RESTART_DELAYS[Math.min(restartCount, RESTART_DELAYS.length - 1)];
          log(windowId, "scheduling auto-restart", { attempt: restartCount + 1, delayMs: delay });
          this.cleanupStream(windowId);
          this.pendingRestarts.add(windowId);
          this.emit("restarting", windowId, restartCount + 1);
          setTimeout(() => {
            // bail if restart was cancelled by stopStream/stopAll
            if (!this.pendingRestarts.has(windowId)) return;
            this.pendingRestarts.delete(windowId);
            if (!this.streams.has(windowId)) {
              this.spawnFfmpeg(windowId, opts, restartCount + 1);
            }
          }, delay);
          return;
        }

        log(windowId, "max restarts exceeded, giving up", { maxRestarts: MAX_RESTARTS });
        this.emit("error", windowId, new Error(`ffmpeg crashed ${MAX_RESTARTS} times — giving up`));
      } else {
        log(windowId, "ffmpeg exited", { code: code ?? "null", frames: stream.frameCount });
      }

      this.cleanupStream(windowId);
      this.emit("stopped", windowId);
    });

    this.streams.set(windowId, stream);
  }

  private cleanupStream(windowId: string): void {
    const stream = this.streams.get(windowId);
    if (!stream) return;
    if (stream.statsTimer) clearInterval(stream.statsTimer);
    this.streams.delete(windowId);
  }

  stopStream(windowId: string): void {
    this.pendingRestarts.delete(windowId);
    const stream = this.streams.get(windowId);
    if (!stream) return;
    log(windowId, "stopping stream", { frames: stream.frameCount });
    stream.stopping = true;
    stream.process.kill("SIGTERM");
  }

  stopAll(): void {
    this.pendingRestarts.clear();
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

  getStreamStatus(windowId: string): StreamStatus | null {
    const s = this.streams.get(windowId);
    if (!s) return null;
    const now = Date.now();
    const uptimeMs = now - s.startedAt;
    const fps = uptimeMs > 0 ? (s.frameCount / (uptimeMs / 1000)) : 0;
    const avgKb = s.frameCount > 0 ? (s.byteCount / s.frameCount / 1024) : 0;
    return {
      windowId,
      alive: !s.process.killed && s.process.exitCode === null,
      frameCount: s.frameCount,
      byteCount: s.byteCount,
      fps,
      uptimeMs,
      restartCount: s.restartCount,
      lastFrameAgoMs: s.lastFrameAt > 0 ? now - s.lastFrameAt : -1,
      avgFrameSizeKb: avgKb,
      lastError: s.lastError,
      ffmpegPid: s.process.pid ?? null,
      ffmpegStderr: [...s.stderrLines],
    };
  }

  getAllStreamStatus(): StreamStatus[] {
    return [...this.streams.keys()]
      .map((id) => this.getStreamStatus(id))
      .filter((s): s is StreamStatus => s !== null);
  }
}

// --- binary frame header ---

const MAGIC = Buffer.from("VLSF");
const HEADER_SIZE = 20;

export function packFrame(windowId: string, jpegData: Buffer, seq: number): Buffer {
  const header = Buffer.alloc(HEADER_SIZE);
  MAGIC.copy(header, 0);
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
