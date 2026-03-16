import { EventEmitter } from "events";
import { watch, watchFile, unwatchFile } from "fs";
import { open, stat as fsStat } from "fs/promises";
import { isPidAlive, validatePid } from "./session-scanner.js";

export interface JsonlWatcherOptions {
  jsonlPath: string;
  pid: number;
  pidPollIntervalMs?: number;
  watchFileFallbackMs?: number;
}

const ALLOWED_TYPES = new Set(["user", "assistant", "result"]);

export class JsonlWatcher extends EventEmitter {
  private readonly jsonlPath: string;
  private readonly pid: number;
  private readonly pidPollIntervalMs: number;
  private readonly watchFileFallbackMs: number;

  private offset = 0;
  private watcher: ReturnType<typeof watch> | null = null;
  private usingFallback = false;
  private pidInterval: ReturnType<typeof setInterval> | null = null;
  private fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(options: JsonlWatcherOptions) {
    super();
    this.jsonlPath = options.jsonlPath;
    this.pid = options.pid;
    this.pidPollIntervalMs = options.pidPollIntervalMs ?? 2000;
    this.watchFileFallbackMs = options.watchFileFallbackMs ?? 10000;
  }

  async loadHistory(tailBytes = 65536): Promise<void> {
    let content: string;
    try {
      const fileStat = await fsStat(this.jsonlPath);
      const size = fileStat.size;

      if (size <= tailBytes) {
        const fh = await open(this.jsonlPath, "r");
        try {
          const buf = Buffer.alloc(size);
          await fh.read(buf, 0, size, 0);
          content = buf.toString("utf-8");
          this.offset = size;
        } finally {
          await fh.close();
        }
      } else {
        const fh = await open(this.jsonlPath, "r");
        try {
          const buf = Buffer.alloc(tailBytes);
          await fh.read(buf, 0, tailBytes, size - tailBytes);
          content = buf.toString("utf-8");
          // trim partial first line
          const nl = content.indexOf("\n");
          if (nl >= 0) content = content.slice(nl + 1);
          this.offset = size;
        } finally {
          await fh.close();
        }
      }
    } catch {
      return;
    }

    const events = this.parseLines(content);
    if (events.length > 0) {
      this.emit("events", events);
    }
  }

  startWatching(): void {
    if (this.stopped) return;

    this.startFsWatch();
    this.startPidPolling();
    this.scheduleFallback();
  }

  stop(): void {
    this.stopped = true;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.usingFallback) {
      unwatchFile(this.jsonlPath);
      this.usingFallback = false;
    }

    if (this.pidInterval !== null) {
      clearInterval(this.pidInterval);
      this.pidInterval = null;
    }

    if (this.fallbackTimeout !== null) {
      clearTimeout(this.fallbackTimeout);
      this.fallbackTimeout = null;
    }

    this.removeAllListeners();
  }

  private startFsWatch(): void {
    try {
      this.watcher = watch(this.jsonlPath, (eventType) => {
        if (eventType === "rename") {
          this.emit("ended", "file_deleted");
          this.stop();
          return;
        }
        this.resetFallbackTimer();
        this.onFileChange().catch(() => {});
      });

      this.watcher.on("error", () => {
        this.emit("ended", "error");
        this.stop();
      });
    } catch {
      // fs.watch failed immediately — fall through to fallback
      this.switchToFallback();
    }
  }

  private startPidPolling(): void {
    this.pidInterval = setInterval(() => {
      this.checkPid().catch(() => {});
    }, this.pidPollIntervalMs);
  }

  private scheduleFallback(): void {
    this.fallbackTimeout = setTimeout(() => {
      if (!this.stopped && !this.usingFallback) {
        this.switchToFallback();
      }
    }, this.watchFileFallbackMs);
  }

  private resetFallbackTimer(): void {
    if (this.fallbackTimeout !== null) {
      clearTimeout(this.fallbackTimeout);
      this.fallbackTimeout = null;
    }
    // reschedule for next period of inactivity
    this.scheduleFallback();
  }

  private switchToFallback(): void {
    if (this.stopped || this.usingFallback) return;

    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    this.usingFallback = true;
    watchFile(this.jsonlPath, { interval: 2000 }, () => {
      if (!this.stopped) {
        this.onFileChange().catch(() => {});
      }
    });
  }

  private async onFileChange(): Promise<void> {
    if (this.stopped) return;

    let size: number;
    try {
      const s = await fsStat(this.jsonlPath);
      size = s.size;
    } catch {
      this.emit("ended", "file_deleted");
      this.stop();
      return;
    }

    if (size < this.offset) {
      // file was truncated — reset
      this.offset = 0;
    }

    if (size <= this.offset) return;

    const bytesToRead = size - this.offset;
    const fh = await open(this.jsonlPath, "r");
    let chunk: string;
    try {
      const buf = Buffer.alloc(bytesToRead);
      await fh.read(buf, 0, bytesToRead, this.offset);
      chunk = buf.toString("utf-8");
      this.offset = size;
    } finally {
      await fh.close();
    }

    const events = this.parseLines(chunk);
    if (events.length > 0) {
      this.emit("events", events);
    }
  }

  private async checkPid(): Promise<void> {
    if (this.stopped) return;

    const alive = isPidAlive(this.pid);
    if (!alive) {
      this.emit("ended", "process_exited");
      this.stop();
      return;
    }

    const valid = await validatePid(this.pid);
    if (!valid) {
      this.emit("ended", "process_exited");
      this.stop();
    }
  }

  private parseLines(chunk: string): Array<Record<string, unknown>> {
    const results: Array<Record<string, unknown>> = [];

    for (const line of chunk.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed) as Record<string, unknown>;
        if (ALLOWED_TYPES.has(entry.type as string)) {
          results.push(entry);
        }
      } catch {
        // skip malformed lines
      }
    }

    return results;
  }
}
