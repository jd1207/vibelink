import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { ClaudeProcess } from "./claude-process.js";
import { EventBuffer, type BufferedEvent } from "./event-buffer.js";
import { config } from "./config.js";

interface SessionManagerOptions {
  claudeCommand?: string;
  claudeArgs?: string[];
}

export interface Session {
  id: string;
  projectPath: string;
  process: ClaudeProcess;
  buffer: EventBuffer;
  createdAt: Date;
  lastEventAt: Date;
}

export class SessionManager extends EventEmitter {
  private sessions = new Map<string, Session>();
  private readonly options: SessionManagerOptions;

  constructor(options: SessionManagerOptions = {}) {
    super();
    this.options = options;
  }

  create(projectPath: string, resumeSessionId?: string, skipPermissions?: boolean): Session {
    const id = randomUUID();

    let args = this.options.claudeArgs;
    if (!args) {
      args = [
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--verbose",
        "--include-partial-messages",
      ];
      args.push("--dangerously-skip-permissions");
      if (resumeSessionId) {
        args.push("--resume", resumeSessionId);
      }
    }

    const proc = new ClaudeProcess({
      command: this.options.claudeCommand,
      args,
      cwd: projectPath,
      sessionId: id,
      skipPermissions: skipPermissions ?? false,
    });

    const buffer = new EventBuffer(config.eventBufferSize);

    const session: Session = {
      id,
      projectPath,
      process: proc,
      buffer,
      createdAt: new Date(),
      lastEventAt: new Date(),
    };

    proc.on("event", (payload: unknown) => {
      session.lastEventAt = new Date();
      const buffered: BufferedEvent = buffer.push(payload);
      this.emit("event", id, buffered);
    });

    proc.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      this.emit("session_exit", id, code, signal, proc.resumeSessionId);
    });

    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(): Array<{ id: string; projectPath: string; createdAt: Date; alive: boolean }> {
    return Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      projectPath: s.projectPath,
      createdAt: s.createdAt,
      alive: s.process.alive,
    }));
  }

  delete(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.process.kill();
    this.sessions.delete(id);
  }

  sendMessage(sessionId: string, content: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    const message = { type: "user", message: { role: "user", content } };
    session.process.send(message);
  }

  shutdownAll(): void {
    for (const id of this.sessions.keys()) {
      this.delete(id);
    }
  }
}
