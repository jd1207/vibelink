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
import { dashboardHtml } from "./dashboard.js";

interface AppOptions {
  port?: number;
  claudeCommand?: string;
  claudeArgs?: string[];
  scanRoots?: string[];
  authToken?: string;
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

  const authToken = options.authToken ?? config.authToken;

  expressApp.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // dashboard — no auth required, localhost only
  expressApp.get("/dashboard", (_req, res) => {
    res.type("html").send(dashboardHtml(port));
  });

  // auth middleware — skip for /health and /dashboard (above), enforce on everything else
  if (authToken) {
    expressApp.use((req, res, next) => {
      const header = req.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice(7) : "";
      if (token !== authToken) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      next();
    });
  }

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
  const wss = new WebSocketServer({ noServer: true });

  // handle upgrade manually so /ws/<sessionId> paths work
  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? "";
    if (!url.startsWith("/ws/")) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  wss.on("connection", (ws: WebSocket, req) => {
    const url = req.url ?? "";

    // ws auth: check ?token= query parameter
    if (authToken) {
      const params = new URL(url, "http://localhost").searchParams;
      const wsToken = params.get("token") ?? "";
      if (wsToken !== authToken) {
        ws.close(4001, "unauthorized");
        return;
      }
    }

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

  // wrap claude events in the protocol envelope the app expects
  sessionManager.on("event", (sessionId: string, buffered: BufferedEvent) => {
    wsTracker.broadcastToSession(sessionId, {
      eventId: buffered.eventId,
      type: "claude_event",
      event: buffered.payload,
    });
  });

  // forward IPC messages (from MCP server) with their own type
  ipcServer.on("message", (sessionId: string, msg: Record<string, unknown>) => {
    const session = sessionManager.get(sessionId);
    if (!session) return;
    const buffered = session.buffer.push(msg);
    wsTracker.broadcastToSession(sessionId, {
      eventId: buffered.eventId,
      ...msg,
    });
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
