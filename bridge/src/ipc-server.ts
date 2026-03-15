import { EventEmitter } from "events";
import net from "net";
import { unlink } from "fs/promises";

// parses "tcp:3401" → { port: 3401 } or "/path/to/sock" → { path: "/path/to/sock" }
function parseListenTarget(target: string): { port: number } | { path: string } {
  if (target.startsWith("tcp:")) {
    return { port: parseInt(target.slice(4), 10) };
  }
  return { path: target };
}

export class IpcServer extends EventEmitter {
  private server: net.Server | null = null;
  private sockets = new Map<string, net.Socket>();

  async start(socketPath: string): Promise<void> {
    const target = parseListenTarget(socketPath);

    // remove stale socket file if using unix socket
    if ("path" in target) {
      try {
        await unlink(target.path);
      } catch {
        // file didn't exist — fine
      }
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
      this.server!.once("error", reject);
      if ("port" in target) {
        this.server!.listen(target.port, "127.0.0.1", resolve);
      } else {
        this.server!.listen(target.path, resolve);
      }
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
