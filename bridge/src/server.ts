import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";
import { SessionManager } from "./session-manager.js";
import { ProjectScanner } from "./project-scanner.js";
import { WsClientTracker } from "./ws-client.js";
import { IpcServer } from "./ipc-server.js";
import { ShutdownManager } from "./shutdown.js";
import type { BufferedEvent } from "./event-buffer.js";

interface AppOptions {
  port?: number;
  claudeCommand?: string;
  claudeArgs?: string[];
  scanRoots?: string[];
}

interface AppInstance {
  app: http.Server;
  close: () => Promise<void>;
}

const startTime = Date.now();

export async function createApp(options: AppOptions = {}): Promise<AppInstance> {
  const port = options.port ?? config.port;

  const sessionManager = new SessionManager({
    claudeCommand: options.claudeCommand,
    claudeArgs: options.claudeArgs,
  });

  const scanner = new ProjectScanner({
    roots: options.scanRoots ?? config.scanRoots,
    maxDepth: config.scanMaxDepth,
    cacheTtlMs: config.scanCacheTtlMs,
  });

  const wsTracker = new WsClientTracker();
  wsTracker.start();

  const ipcServer = new IpcServer();
  await ipcServer.start(config.ipcSocketPath).catch(() => {
    // ipc socket failure is non-fatal in test/dev
  });

  const expressApp = express();
  expressApp.use(express.json());

  expressApp.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  expressApp.get("/projects", async (_req, res) => {
    const projects = await scanner.scan();
    res.json(projects);
  });

  expressApp.get("/sessions", (_req, res) => {
    res.json(sessionManager.list());
  });

  expressApp.post("/sessions", (req, res) => {
    const { projectPath, resumeSessionId } = req.body as { projectPath?: string; resumeSessionId?: string };
    if (!projectPath) {
      res.status(400).json({ error: "projectPath required" });
      return;
    }
    const session = sessionManager.create(projectPath, resumeSessionId);
    const wsUrl = `ws://localhost:${port}/ws/${session.id}`;
    res.status(201).json({ sessionId: session.id, wsUrl });
  });

  expressApp.delete("/sessions/:id", (req, res) => {
    sessionManager.delete(req.params.id);
    res.status(204).send();
  });

  expressApp.get("/debug", (_req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    const sessions = sessionManager.list();
    const clientCounts: Record<string, number> = {};
    for (const s of sessions) {
      clientCounts[s.id] = wsTracker.getSessionClients(s.id);
    }
    res.json({
      sessions,
      ipcConnected: false,
      uptime: `${uptimeSeconds}s`,
      clientCounts,
    });
  });

  const server = http.createServer(expressApp);
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket, req) => {
    const url = req.url ?? "";
    const match = url.match(/^\/ws\/([^/?]+)/);
    if (!match) {
      ws.close(1008, "missing session id");
      return;
    }

    const sessionId = match[1];
    const session = sessionManager.get(sessionId);
    if (!session) {
      ws.close(1008, "unknown session");
      return;
    }

    wsTracker.add(ws, sessionId);

    ws.on("message", (data) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === "reconnect") {
        const lastEventId = typeof msg.lastEventId === "number" ? msg.lastEventId : 0;
        const missed = session.buffer.getAfter(lastEventId);
        for (const e of missed) {
          ws.send(JSON.stringify(e));
        }
        return;
      }

      if (msg.type === "user_message" && typeof msg.content === "string") {
        sessionManager.sendMessage(sessionId, msg.content);
        return;
      }

      if (msg.type === "ui_interaction" || msg.type === "input_response") {
        ipcServer.sendToSession(sessionId, msg);
      }
    });
  });

  sessionManager.on("event", (sessionId: string, buffered: BufferedEvent) => {
    wsTracker.broadcastToSession(sessionId, buffered);
  });

  ipcServer.on("message", (sessionId: string, msg: unknown) => {
    const session = sessionManager.get(sessionId);
    if (!session) return;
    const buffered = session.buffer.push(msg);
    wsTracker.broadcastToSession(sessionId, buffered);
  });

  const shutdown = new ShutdownManager();
  shutdown.register("ws tracker", async () => wsTracker.stop());
  shutdown.register("session manager", async () => sessionManager.shutdownAll());
  shutdown.register("ipc server", async () => ipcServer.stop());
  shutdown.register("http server", () => new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  }));

  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  const close = async (): Promise<void> => {
    wsTracker.stop();
    sessionManager.shutdownAll();
    ipcServer.stop();
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return { app: server, close };
}

// only start when run directly
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  createApp().then(({ app }) => {
    const addr = app.address();
    const port = addr && typeof addr === "object" ? addr.port : config.port;
    console.log(`bridge server listening on port ${port}`);
  });
}
