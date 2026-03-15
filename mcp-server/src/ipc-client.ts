import { EventEmitter } from "events";
import net from "net";
import { randomUUID } from "crypto";
import type { IpcMessage } from "./types.js";

const BACKOFF_STEPS = [500, 1000, 2000, 5000];

interface IpcClientEvents {
  message: [msg: IpcMessage];
}

export class IpcClient extends EventEmitter<IpcClientEvents> {
  private socket: net.Socket | null = null;
  private buffer = "";
  private retryCount = 0;
  private closed = false;
  private pendingRequests = new Map<string, { resolve: (data: unknown) => void; timer: NodeJS.Timeout }>();

  constructor(
    private readonly socketPath: string,
    private readonly sessionId: string
  ) {
    super();
  }

  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  connect(): void {
    if (this.closed) return;
    if (this.socketPath.startsWith("tcp:")) {
      const port = parseInt(this.socketPath.slice(4), 10);
      this.socket = net.createConnection(port, "127.0.0.1");
    } else {
      this.socket = net.createConnection(this.socketPath);
    }

    this.socket.on("connect", () => {
      this.retryCount = 0;
      this.buffer = "";
      process.stderr.write(`[ipc] connected to ${this.socketPath}\n`);
      this.send({ type: "handshake", sessionId: this.sessionId });
    });

    this.socket.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const msg = JSON.parse(trimmed) as IpcMessage;
          if (msg.type === "response" && msg.requestId) {
            const pending = this.pendingRequests.get(msg.requestId as string);
            if (pending) {
              clearTimeout(pending.timer);
              this.pendingRequests.delete(msg.requestId as string);
              pending.resolve(msg.data);
              return;
            }
          }
          this.emit("message", msg);
        } catch {
          // skip malformed lines
        }
      }
    });

    this.socket.on("close", () => {
      this.socket = null;
      this.scheduleRetry();
    });

    this.socket.on("error", (err) => {
      process.stderr.write(`[ipc] connection error: ${(err as Error).message}\n`);
      this.socket?.destroy();
      this.socket = null;
      this.scheduleRetry();
    });
  }

  private scheduleRetry(): void {
    if (this.closed) return;
    const delay = BACKOFF_STEPS[Math.min(this.retryCount, BACKOFF_STEPS.length - 1)];
    this.retryCount++;
    setTimeout(() => this.connect(), delay);
  }

  send(message: unknown): void {
    if (!this.isConnected) return;
    this.socket!.write(JSON.stringify(message) + "\n");
  }

  async request(message: Record<string, unknown>, timeoutMs = 5000): Promise<unknown> {
    const requestId = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error("IPC request timeout"));
      }, timeoutMs);
      this.pendingRequests.set(requestId, { resolve, timer });
      this.send({ ...message, requestId });
    });
  }

  close(): void {
    this.closed = true;
    this.socket?.destroy();
    this.socket = null;
  }
}
