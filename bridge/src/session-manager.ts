import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import { ClaudeProcess } from "./claude-process.js";
import { EventBuffer, type BufferedEvent } from "./event-buffer.js";
import { config } from "./config.js";
import type { CaptureManager } from "./screen-capture.js";

const RESPAWN_READY_TIMEOUT_MS = 15_000;

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
  captureManager?: CaptureManager;
  isWatchSession?: boolean;
  claudeSessionId?: string;
  respawning?: boolean;
  messageQueue?: string[];
  disconnectedAt?: number;
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

  createWatchSession(claudeSessionId: string, projectPath: string): Session {
    const id = randomUUID();
    const buffer = new EventBuffer(config.eventBufferSize);
    const dummyProcess = new EventEmitter() as any;
    dummyProcess.alive = false;
    dummyProcess.pid = undefined;
    dummyProcess.resumeSessionId = claudeSessionId;
    dummyProcess.send = () => {};
    dummyProcess.kill = () => {};

    const session: Session = {
      id,
      projectPath,
      process: dummyProcess,
      buffer,
      createdAt: new Date(),
      lastEventAt: new Date(),
      isWatchSession: true,
      claudeSessionId,
    };
    this.sessions.set(id, session);
    return session;
  }

  async respawn(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (session.respawning) return false;

    session.respawning = true;
    session.messageQueue = [];

    const resumeId = session.process.resumeSessionId || session.claudeSessionId;

    const args = [
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--dangerously-skip-permissions",
    ];
    if (resumeId) {
      args.push("--resume", resumeId);
    }

    try {
      const proc = new ClaudeProcess({
        command: this.options.claudeCommand,
        args,
        cwd: session.projectPath,
        sessionId: session.id,
      });

      // wait for first event or timeout before flushing queue
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, RESPAWN_READY_TIMEOUT_MS);
        proc.once("event", () => {
          clearTimeout(timer);
          resolve();
        });
      });

      proc.on("event", (payload: unknown) => {
        session.lastEventAt = new Date();
        const buffered: BufferedEvent = session.buffer.push(payload);
        this.emit("event", session.id, buffered);
      });

      proc.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
        this.emit("session_exit", session.id, code, signal, proc.resumeSessionId);
      });

      session.process = proc;
      session.isWatchSession = false;
      session.respawning = false;

      const queued = session.messageQueue ?? [];
      session.messageQueue = undefined;
      for (const content of queued) {
        const message = { type: "user", message: { role: "user", content } };
        proc.send(message);
      }

      return true;
    } catch {
      session.respawning = false;
      session.messageQueue = undefined;
      return false;
    }
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
    session.captureManager?.stopAll();
    session.process.kill();
    this.sessions.delete(id);
  }

  sendMessage(sessionId: string, content: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.respawning && session.messageQueue) {
      session.messageQueue.push(content);
      return;
    }
    const message = { type: "user", message: { role: "user", content } };
    session.process.send(message);
  }

  shutdownAll(): void {
    for (const id of this.sessions.keys()) {
      this.delete(id);
    }
  }
}
