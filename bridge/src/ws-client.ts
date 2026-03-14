import type { WebSocket } from "ws";
import { config } from "./config.js";

interface TrackedClient {
  ws: WebSocket;
  sessionId: string;
  isAlive: boolean;
}

export class WsClientTracker {
  private clients = new Set<TrackedClient>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        if (!client.isAlive) {
          client.ws.terminate();
          this.clients.delete(client);
          continue;
        }
        client.isAlive = false;
        client.ws.ping();
      }
    }, config.wsHeartbeatIntervalMs);
  }

  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const client of this.clients) {
      client.ws.close();
    }
    this.clients.clear();
  }

  add(ws: WebSocket, sessionId: string): void {
    const client: TrackedClient = { ws, sessionId, isAlive: true };

    ws.on("pong", () => {
      client.isAlive = true;
    });

    const cleanup = () => {
      this.clients.delete(client);
    };

    ws.on("close", cleanup);
    ws.on("error", cleanup);

    this.clients.add(client);
  }

  broadcastToSession(sessionId: string, message: unknown): void {
    const data = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.sessionId !== sessionId) continue;
      if (client.ws.readyState !== 1 /* OPEN */) continue;
      client.ws.send(data);
    }
  }

  getSessionClients(sessionId: string): number {
    let count = 0;
    for (const client of this.clients) {
      if (client.sessionId === sessionId) count++;
    }
    return count;
  }
}
