import { EventEmitter } from "events";
import net from "net";
import { unlink } from "fs/promises";

export class IpcServer extends EventEmitter {
  private server: net.Server | null = null;
  private sockets = new Map<string, net.Socket>();

  async start(socketPath: string): Promise<void> {
    // remove stale socket file if it exists
    try {
      await unlink(socketPath);
    } catch {
      // file didn't exist — fine
    }

    this.server = net.createServer((socket) => {
      let sessionId: string | null = null;
      let buffer = "";

      socket.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (!sessionId) {
            // first message must be a handshake
            if (parsed.type === "handshake" && typeof parsed.sessionId === "string") {
              sessionId = parsed.sessionId;
              this.sockets.set(sessionId, socket);
              this.emit("connected", sessionId);
            }
            continue;
          }

          this.emit("message", sessionId, parsed);
        }
      });

      socket.on("close", () => {
        if (sessionId) {
          this.sockets.delete(sessionId);
          this.emit("disconnected", sessionId);
        }
      });

      socket.on("error", () => {
        if (sessionId) {
          this.sockets.delete(sessionId);
          this.emit("disconnected", sessionId);
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server!.listen(socketPath, resolve);
      this.server!.once("error", reject);
    });
  }

  sendToSession(sessionId: string, message: unknown): void {
    const socket = this.sockets.get(sessionId);
    if (!socket || socket.destroyed) return;
    socket.write(JSON.stringify(message) + "\n");
  }

  stop(): void {
    for (const socket of this.sockets.values()) {
      socket.destroy();
    }
    this.sockets.clear();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
