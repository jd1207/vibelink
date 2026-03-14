import { EventEmitter } from "events";
import { spawn, type ChildProcess } from "child_process";

const DEFAULT_COMMAND = "claude";
const DEFAULT_ARGS = [
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-partial-messages",
];

interface ClaudeProcessOptions {
  command?: string;
  args?: string[];
  cwd: string;
  sessionId: string;
}

export class ClaudeProcess extends EventEmitter {
  private child: ChildProcess | null = null;
  private _alive = false;
  private _resumeSessionId: string | undefined;
  private readonly options: ClaudeProcessOptions;

  constructor(options: ClaudeProcessOptions) {
    super();
    this.options = options;
    this.spawn();
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  get alive(): boolean {
    return this._alive;
  }

  get resumeSessionId(): string | undefined {
    return this._resumeSessionId;
  }

  private spawn(): void {
    const { command = DEFAULT_COMMAND, args = DEFAULT_ARGS, cwd, sessionId } = this.options;

    const child = spawn(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, VIBELINK_SESSION_ID: sessionId, VIBELINK_BRIDGE_PORT: String(process.env.PORT || '3400') },
    });

    this.child = child;
    this._alive = true;

    child.on("error", (err) => {
      this._alive = false;
      this.emit("error", err);
    });

    child.on("exit", (code, signal) => {
      this._alive = false;
      this.emit("exit", code, signal);
    });

    let buffer = "";
    child.stdout!.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          if (parsed && typeof parsed === "object" && parsed.type === "result" && parsed.session_id) {
            this._resumeSessionId = parsed.session_id;
          }
          this.emit("event", parsed);
        } catch {
          // skip unparseable lines silently
        }
      }
    });

    // drain stderr silently to avoid blocking
    child.stderr!.resume();
  }

  send(message: unknown): void {
    if (!this.child?.stdin?.writable) return;
    this.child.stdin.write(JSON.stringify(message) + "\n");
  }

  kill(): void {
    if (this.child && this._alive) {
      this.child.kill("SIGTERM");
    }
  }
}
