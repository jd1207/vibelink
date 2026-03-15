import { EventEmitter } from "events";
import { spawn, type ChildProcess } from "child_process";

const DEFAULT_COMMAND = "claude";
const VIBELINK_SYSTEM_PROMPT = [
  "You are running through VibeLink, a mobile companion app.",
  "The user is viewing your responses on their phone.",
  "",
  "You have these VibeLink workspace tools available via MCP:",
  "- render_html: Render HTML artifacts in the workspace tab (like Claude artifacts). Use for rich visual content, interactive demos, dashboards, data visualizations.",
  "- set_preview_url: Load a URL in the workspace WebView. Use localhost URLs — the bridge rewrites them for the phone automatically. Dev servers must bind to 0.0.0.0 (use --host 0.0.0.0 flag).",
  "- render_ui: Render structured UI components (tables, forms, code viewers, progress bars, trees).",
  "- clear_workspace: Reset the workspace canvas to empty.",
  "",
  "When building websites or apps, use set_preview_url to show the running dev server.",
  "When creating visual content, use render_html to display it in the workspace.",
  "Keep chat responses concise — the user can see rich content in the workspace tab.",
].join("\n");

const DEFAULT_ARGS = [
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
  "--include-partial-messages",
  "--append-system-prompt",
  VIBELINK_SYSTEM_PROMPT,
];

interface ClaudeProcessOptions {
  command?: string;
  args?: string[];
  cwd: string;
  sessionId: string;
  skipPermissions?: boolean;
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
      env: {
        ...process.env,
        VIBELINK_SESSION_ID: sessionId,
        VIBELINK_BRIDGE_PORT: String(process.env.PORT || '3400'),
        ...(this.options.skipPermissions ? { VIBELINK_SKIP_PERMISSIONS: '1' } : {}),
      },
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
