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
import { CaptureManager, listWindows, packFrame } from "./screen-capture.js";
import { JsonlWatcher } from "./jsonl-watcher.js";
import {
  scanClaudeSessions,
  deleteClaudeSession,
  readSessionHistory,
  findJsonlPath,
  loadActivePids,
  validatePid,
  isPidAlive,
} from "./session-scanner.js";
import { execSync } from "child_process";

// get tailscale IP for rewriting localhost URLs so phone can reach dev servers
function getTailscaleIp(): string | null {
  try {
    return execSync("tailscale ip -4", { timeout: 3000 }).toString().trim();
  } catch {
    return null;
  }
}

function rewriteLocalhostUrl(url: string, tailscaleIp: string): string {
  return url.replace(/\b(localhost|127\.0\.0\.1)\b/, tailscaleIp);
}

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

  // pending permission requests from Claude's PermissionRequest hook
  const pendingPermissions = new Map<string, {
    resolve: (result: { behavior: string; message?: string }) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();

  const ipcServer = new IpcServer();
  let ipcClientCount = 0;
  ipcServer.on("connected", (sid: string) => {
    ipcClientCount++;
    console.log(`[ipc] mcp server connected (session=${sid}), total=${ipcClientCount}`);
  });
  ipcServer.on("disconnected", (sid: string) => {
    ipcClientCount = Math.max(0, ipcClientCount - 1);
    console.log(`[ipc] mcp server disconnected (session=${sid}), total=${ipcClientCount}`);
  });
  await ipcServer.start(config.ipcSocketPath).catch((err) => {
    console.error(`[ipc] failed to start IPC server: ${err.message}`);
  });

  // watch session tracking — keyed by claudeSessionId for deduplication
  const activeWatchers = new Map<string, {
    watcher: JsonlWatcher;
    watchSessionIds: Set<string>;
  }>();

  function cleanupWatchSession(watchSessionId: string): void {
    const session = sessionManager.get(watchSessionId);
    if (!session?.isWatchSession) return;

    const csid = session.claudeSessionId;
    if (csid) {
      const entry = activeWatchers.get(csid);
      if (entry) {
        entry.watchSessionIds.delete(watchSessionId);
        if (entry.watchSessionIds.size === 0) {
          entry.watcher.stop();
          activeWatchers.delete(csid);
        }
      }
    }
    sessionManager.delete(watchSessionId);
  }

  // reaper: clean up watch sessions with no connected clients after grace period
  const watchReaperInterval = setInterval(() => {
    for (const s of sessionManager.list()) {
      const session = sessionManager.get(s.id);
      if (!session?.isWatchSession) continue;

      const clientCount = wsTracker.getSessionClients(s.id);
      if (clientCount > 0) {
        session.disconnectedAt = undefined;
        continue;
      }

      if (!session.disconnectedAt) {
        session.disconnectedAt = Date.now();
        continue;
      }

      if (Date.now() - session.disconnectedAt >= config.watchSessionGracePeriodMs) {
        console.log(`[reaper] cleaning up watch session ${s.id.slice(0, 8)} (no clients)`);
        cleanupWatchSession(s.id);
      }
    }
  }, config.watchSessionReaperIntervalMs);

  // kill a terminal Claude process by its claude session ID
  async function killTerminalPid(claudeSessionId: string): Promise<boolean> {
    const pids = await loadActivePids();
    const entry = pids.get(claudeSessionId);
    if (!entry) return true;

    if (!isPidAlive(entry.pid)) return true;
    const valid = await validatePid(entry.pid);
    if (!valid) return true;

    try { process.kill(entry.pid, "SIGTERM"); } catch { return true; }

    // poll for exit — 500ms intervals, 5 seconds max
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (!isPidAlive(entry.pid)) return true;
    }

    // re-validate before escalating to SIGKILL
    const stillValid = await validatePid(entry.pid);
    if (!stillValid) return true;

    try { process.kill(entry.pid, "SIGKILL"); } catch { /* already dead */ }
    return true;
  }

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

  // serve the latest APK for easy phone install — no auth, like dashboard
  expressApp.get("/apk", async (_req, res) => {
    const { resolve, join } = await import("path");
    const { existsSync } = await import("fs");
    const mobileRoot = resolve(join(new URL(import.meta.url).pathname, "..", "..", "..", "mobile"));
    const debugApk = join(mobileRoot, "android/app/build/outputs/apk/debug/app-debug.apk");
    const releaseApk = join(mobileRoot, "android/app/build/outputs/apk/release/app-release.apk");
    const apkPath = existsSync(releaseApk) ? releaseApk : existsSync(debugApk) ? debugApk : null;
    if (!apkPath) {
      res.status(404).json({ error: "no APK found — run the build first" });
      return;
    }
    res.download(apkPath, "vibelink.apk");
  });

  // restart endpoint — rebuilds and restarts the bridge process (localhost only, no auth)
  expressApp.post("/restart", (_req, res) => {
    res.json({ status: "restarting" });
    setTimeout(() => {
      process.exit(0);
    }, 200);
  });

  // diagnostics endpoint — shows bridge state, env, hook log
  expressApp.get("/diagnostics", async (_req, res) => {
    const { readFile } = await import("fs/promises");
    let hookLog = "";
    try { hookLog = await readFile("/tmp/vibelink-hook.log", "utf-8"); } catch { hookLog = "(no hook log)"; }
    const sessions = sessionManager.list();
    res.json({
      uptime: `${Math.floor((Date.now() - startTime) / 1000)}s`,
      port,
      nodeVersion: process.version,
      pid: process.pid,
      env: {
        PORT: process.env.PORT ?? "(unset)",
        AUTH_TOKEN: process.env.AUTH_TOKEN ? "(set)" : "(unset)",
        IPC_SOCKET_PATH: process.env.IPC_SOCKET_PATH ?? "/tmp/vibelink.sock",
      },
      sessions: sessions.map(s => ({
        id: s.id.slice(0, 8),
        project: s.projectPath.split("/").pop(),
        alive: s.alive,
      })),
      pendingPermissions: pendingPermissions.size,
      hookLog: hookLog.split("\n").slice(-20).join("\n"),
    });
  });

  // permission request endpoint — called by the PermissionRequest hook (localhost only, no auth)
  expressApp.post("/permissions/request", (req, res) => {
    const { sessionId, requestId, toolName, toolInput } = req.body as {
      sessionId?: string;
      requestId?: string;
      toolName?: string;
      toolInput?: unknown;
    };
    if (!sessionId || !requestId) {
      res.status(400).json({ error: "sessionId and requestId required" });
      return;
    }

    const timeout = setTimeout(() => {
      pendingPermissions.delete(requestId);
      res.json({ behavior: "deny", message: "Approval timed out" });
    }, 5 * 60 * 1000); // 5 minute timeout

    pendingPermissions.set(requestId, {
      resolve: (result) => {
        clearTimeout(timeout);
        pendingPermissions.delete(requestId);
        res.json(result);
      },
      timeout,
    });

    // broadcast to all WS clients for this session
    wsTracker.broadcastToSession(sessionId, {
      type: "permission_request",
      requestId,
      toolName: toolName || "unknown",
      toolInput: toolInput || {},
    });
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

  // watch a running Claude Code terminal session (read-only)
  expressApp.post("/sessions/watch", async (req, res) => {
    const { claudeSessionId } = req.body as { claudeSessionId?: string };
    if (!claudeSessionId) {
      res.status(400).json({ error: "claudeSessionId required" });
      return;
    }

    // enforce max watch sessions
    let watchCount = 0;
    for (const s of sessionManager.list()) {
      const sess = sessionManager.get(s.id);
      if (sess?.isWatchSession) watchCount++;
    }
    if (watchCount >= config.maxWatchSessions) {
      res.status(429).json({ error: "max watch sessions reached" });
      return;
    }

    const jsonlPath = await findJsonlPath(claudeSessionId);
    if (!jsonlPath) {
      res.status(404).json({ error: "session JSONL not found" });
      return;
    }

    const pids = await loadActivePids();
    const pidEntry = pids.get(claudeSessionId);
    if (!pidEntry || !isPidAlive(pidEntry.pid) || !(await validatePid(pidEntry.pid))) {
      res.status(404).json({ error: "session not running" });
      return;
    }

    const projectPath = pidEntry.cwd || "/";
    const watchSession = sessionManager.createWatchSession(claudeSessionId, projectPath);

    // reuse or create watcher for this claude session
    let entry = activeWatchers.get(claudeSessionId);
    if (!entry) {
      const watcher = new JsonlWatcher({ jsonlPath, pid: pidEntry.pid });

      watcher.on("events", (events: Array<Record<string, unknown>>) => {
        const watchEntry = activeWatchers.get(claudeSessionId);
        if (!watchEntry) return;
        for (const wsid of watchEntry.watchSessionIds) {
          for (const event of events) {
            const sess = sessionManager.get(wsid);
            if (!sess) continue;
            const buffered = sess.buffer.push({ type: "claude_event", event });
            wsTracker.broadcastToSession(wsid, {
              eventId: buffered.eventId,
              type: "claude_event",
              event,
            });
          }
        }
      });

      watcher.on("ended", (reason: string) => {
        const watchEntry = activeWatchers.get(claudeSessionId);
        if (!watchEntry) return;
        for (const wsid of watchEntry.watchSessionIds) {
          wsTracker.broadcastToSession(wsid, {
            type: "watch_ended",
            reason,
            claudeSessionId,
          });
        }
        // clean up all watch sessions for this claude session
        const ids = [...watchEntry.watchSessionIds];
        for (const wsid of ids) {
          cleanupWatchSession(wsid);
        }
      });

      entry = { watcher, watchSessionIds: new Set([watchSession.id]) };
      activeWatchers.set(claudeSessionId, entry);

      await watcher.loadHistory();
      watcher.startWatching();
    } else {
      entry.watchSessionIds.add(watchSession.id);
    }

    // send existing buffer to the new session (history loaded by watcher)
    const wsUrl = `ws://localhost:${port}/ws/${watchSession.id}`;
    res.status(201).json({ sessionId: watchSession.id, wsUrl });
  });

  // kill a running Claude Code terminal session
  expressApp.post("/sessions/end-terminal", async (req, res) => {
    const { claudeSessionId } = req.body as { claudeSessionId?: string };
    if (!claudeSessionId) {
      res.status(400).json({ error: "claudeSessionId required" });
      return;
    }
    await killTerminalPid(claudeSessionId);
    res.status(204).send();
  });

  // take over a watched session — kill terminal, spawn vibelink-managed process
  expressApp.post("/sessions/:id/take-over", async (req, res) => {
    const { claudeSessionId } = req.body as { claudeSessionId?: string };
    if (!claudeSessionId) {
      res.status(400).json({ error: "claudeSessionId required" });
      return;
    }

    // kill the terminal process
    await killTerminalPid(claudeSessionId);

    // notify other watchers and clean up
    const watchEntry = activeWatchers.get(claudeSessionId);
    if (watchEntry) {
      for (const wsid of watchEntry.watchSessionIds) {
        wsTracker.broadcastToSession(wsid, {
          type: "watch_ended",
          reason: "taken_over",
          claudeSessionId,
        });
      }
      watchEntry.watcher.stop();
      const ids = [...watchEntry.watchSessionIds];
      for (const wsid of ids) {
        sessionManager.delete(wsid);
      }
      activeWatchers.delete(claudeSessionId);
    }

    // determine project path from PID entry or fallback
    const pids = await loadActivePids();
    const pidEntry = pids.get(claudeSessionId);
    const projectPath = pidEntry?.cwd || "/";

    // create a new vibelink-managed session that resumes the claude session
    const newSession = sessionManager.create(projectPath, claudeSessionId, true);
    newSession.claudeSessionId = claudeSessionId;

    // hydrate from the watch session's buffer (more reliable than re-reading
    // JSONL, since the PID session ID may not match the JSONL filename)
    const watchSession = sessionManager.get(req.params.id);
    if (watchSession?.isWatchSession) {
      const watchEvents = watchSession.buffer.getAll();
      for (const e of watchEvents) {
        newSession.buffer.push(e.payload as Record<string, unknown>);
      }
      console.log(`[take-over] copied ${watchEvents.length} events from watch session`);
    } else {
      try {
        const history = await readSessionHistory(claudeSessionId);
        for (const msg of history) {
          newSession.buffer.push({ type: "claude_event", event: msg });
        }
        console.log(`[take-over] hydrated ${history.length} messages from JSONL`);
      } catch (err) {
        console.error("[take-over] failed to hydrate history:", err);
      }
    }

    // set up capture manager
    const captureManager = new CaptureManager();
    newSession.captureManager = captureManager;
    captureManager.on("frame", (windowId: string, jpeg: Buffer, seq: number) => {
      wsTracker.broadcastBinary(newSession.id, packFrame(windowId, jpeg, seq));
    });
    captureManager.on("error", (windowId: string, err: Error) => {
      wsTracker.broadcastToSession(newSession.id, { type: "stream_error", windowId, error: err.message });
    });
    captureManager.on("stopped", (windowId: string) => {
      wsTracker.broadcastToSession(newSession.id, { type: "stream_stopped", windowId });
    });

    const wsUrl = `ws://localhost:${port}/ws/${newSession.id}`;
    res.status(201).json({ sessionId: newSession.id, wsUrl });
  });

  // all claude code sessions on this machine (scans ~/.claude/projects/)
  expressApp.get("/claude-sessions", async (_req, res) => {
    try {
      const sessions = await scanClaudeSessions();

      // auto-clean stale bridge sessions: if a terminal CLI process is alive
      // for the same project as a bridge session, the user went back to terminal
      const bridgeSessions = sessionManager.list();
      for (const bs of bridgeSessions) {
        const full = sessionManager.get(bs.id);
        if (!full || full.isWatchSession) continue;
        const conflict = sessions.find(
          (cs) => cs.alive && cs.projectPath === bs.projectPath && full.process.alive
        );
        if (conflict) {
          const bridgePid = full.process.pid;
          const pids = await loadActivePids();
          const conflictPid = pids.get(conflict.sessionId)?.pid;
          if (conflictPid && conflictPid !== bridgePid) {
            console.log(`[sessions] auto-cleaning stale bridge session ${bs.id.slice(0, 8)} — terminal resumed in ${bs.projectPath}`);
            sessionManager.delete(bs.id);
          }
        }
      }

      res.json(sessions);
    } catch (err) {
      console.error("[claude-sessions] scan failed:", err);
      res.status(500).json({ error: "session scan failed" });
    }
  });

  // delete a claude code session's JSONL file
  expressApp.delete("/claude-sessions/:sessionId", async (req, res) => {
    try {
      const deleted = await deleteClaudeSession(req.params.sessionId);
      if (deleted) {
        res.status(204).send();
      } else {
        res.status(404).json({ error: "session not found" });
      }
    } catch (err) {
      console.error("[claude-sessions] delete failed:", err);
      res.status(500).json({ error: "delete failed" });
    }
  });

  expressApp.get("/projects", async (_req, res) => {
    const projects = await scanner.scan();
    res.json(projects);
  });

  expressApp.get("/sessions", (_req, res) => {
    res.json(sessionManager.list());
  });

  expressApp.post("/sessions", async (req, res) => {
    const { projectPath, resumeSessionId, skipPermissions } = req.body as {
      projectPath?: string;
      resumeSessionId?: string;
      skipPermissions?: boolean;
    };
    if (!projectPath) {
      res.status(400).json({ error: "projectPath required" });
      return;
    }
    const session = sessionManager.create(projectPath, resumeSessionId, skipPermissions);

    // hydrate the event buffer with historical messages so the phone
    // sees the conversation when connecting via WebSocket.
    // store in the same envelope format the phone expects:
    // { eventId, type: "claude_event", event: <jsonl entry> }
    if (resumeSessionId) {
      try {
        const history = await readSessionHistory(resumeSessionId);
        for (const msg of history) {
          session.buffer.push({
            type: "claude_event",
            event: msg,
          });
        }
        console.log(`[sessions] hydrated ${history.length} messages from ${resumeSessionId.slice(0, 8)}`);
      } catch (err) {
        console.error(`[sessions] failed to hydrate history:`, err);
      }
    }

    const captureManager = new CaptureManager();
    session.captureManager = captureManager;

    captureManager.on("frame", (windowId: string, jpeg: Buffer, seq: number) => {
      const packed = packFrame(windowId, jpeg, seq);
      wsTracker.broadcastBinary(session.id, packed);
    });

    captureManager.on("error", (windowId: string, err: Error) => {
      wsTracker.broadcastToSession(session.id, {
        type: "stream_error",
        windowId,
        error: err.message,
      });
    });

    captureManager.on("stopped", (windowId: string) => {
      wsTracker.broadcastToSession(session.id, {
        type: "stream_stopped",
        windowId,
      });
    });

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
      ipcConnected: ipcClientCount > 0,
      uptime: `${uptimeSeconds}s`,
      clientCounts,
    });
  });

  // file browser endpoints
  expressApp.get("/sessions/:id/files", async (req, res) => {
    const session = sessionManager.get(req.params.id);
    if (!session) { res.status(404).json({ error: "session not found" }); return; }

    const { readdir, stat } = await import("fs/promises");
    const { resolve, join, relative } = await import("path");
    const { execFileSync } = await import("child_process");

    const root = session.projectPath;
    const requestedPath = (req.query.path as string) || ".";
    const targetPath = resolve(root, requestedPath);

    if (!targetPath.startsWith(root)) {
      res.status(400).json({ error: "path outside project root" }); return;
    }

    try {
      const dirents = await readdir(targetPath, { withFileTypes: true });
      const names = dirents.map((d) => d.name);

      // batch gitignore check
      let ignored = new Set<string>();
      if (names.length > 0) {
        try {
          const paths = names.map((n) => join(targetPath, n));
          const result = execFileSync("git", ["check-ignore", ...paths], {
            encoding: "utf-8", timeout: 5000, cwd: targetPath,
          });
          for (const line of result.split("\n")) {
            const name = line.trim().split("/").pop();
            if (name) ignored.add(name);
          }
        } catch { /* exit 1 = nothing ignored */ }
      }

      const entries = [];
      for (const d of dirents) {
        if (d.name === ".git") continue;
        if (d.name.startsWith(".")) continue;
        if (ignored.has(d.name)) continue;
        if (entries.length >= 200) break;
        try {
          const s = await stat(join(targetPath, d.name));
          entries.push({
            name: d.name,
            type: d.isDirectory() ? "directory" : "file",
            size: s.size,
            modified: s.mtime.toISOString(),
          });
        } catch { /* skip unreadable */ }
      }

      entries.sort((a, b) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      res.json({ path: relative(root, targetPath) || ".", entries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  expressApp.get("/sessions/:id/files/view", async (req, res) => {
    const session = sessionManager.get(req.params.id);
    if (!session) { res.status(404).json({ error: "session not found" }); return; }

    const { readFile, stat } = await import("fs/promises");
    const { resolve, relative } = await import("path");

    const filePath = req.query.path as string;
    if (!filePath) { res.status(400).json({ error: "path required" }); return; }

    const root = session.projectPath;
    const targetPath = resolve(root, filePath);

    if (!targetPath.startsWith(root)) {
      res.status(400).json({ error: "path outside project root" }); return;
    }

    try {
      const s = await stat(targetPath);
      if (s.isDirectory()) {
        res.status(400).json({ error: "path is a directory" }); return;
      }

      const raw = await readFile(targetPath, "utf-8");
      const lines = raw.split("\n");
      const limit = 500;
      const truncated = lines.length > limit;
      const content = truncated ? lines.slice(0, limit).join("\n") : raw;

      res.json({
        path: relative(root, targetPath),
        lines: Math.min(lines.length, limit),
        totalLines: lines.length,
        truncated,
        content,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
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

    // auto-send any buffered events to new clients (e.g. hydrated history)
    // the phone only sends "reconnect" if it has a lastEventId, which it
    // won't for a brand new session — so push the buffer proactively
    const buffered = session.buffer.getAll();
    if (buffered.length > 0) {
      for (const e of buffered) {
        const payload = e.payload as Record<string, unknown>;
        ws.send(JSON.stringify({
          eventId: e.eventId,
          ...payload,
        }));
      }
    }

    ws.on("close", () => {
      const s = sessionManager.get(sessionId);
      if (s?.isWatchSession) {
        s.disconnectedAt = Date.now();
      }
    });

    ws.on("message", async (data) => {
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

      if (msg.type === "stop_watching") {
        cleanupWatchSession(sessionId);
        return;
      }

      if (msg.type === "take_over") {
        const csid = typeof msg.claudeSessionId === "string" ? msg.claudeSessionId : session.claudeSessionId;
        if (!csid) {
          ws.send(JSON.stringify({ type: "take_over_failed", error: "no claudeSessionId" }));
          return;
        }
        try {
          await killTerminalPid(csid);

          // notify other watchers and clean up
          const watchEntry = activeWatchers.get(csid);
          if (watchEntry) {
            for (const wsid of watchEntry.watchSessionIds) {
              if (wsid !== sessionId) {
                wsTracker.broadcastToSession(wsid, {
                  type: "watch_ended",
                  reason: "taken_over",
                  claudeSessionId: csid,
                });
              }
            }
            watchEntry.watcher.stop();
            const ids = [...watchEntry.watchSessionIds];
            for (const wsid of ids) {
              if (wsid !== sessionId) {
                sessionManager.delete(wsid);
              }
            }
            activeWatchers.delete(csid);
          }

          // respawn as a vibelink-managed session
          const pids = await loadActivePids();
          const pidEntry = pids.get(csid);
          const projectPath = pidEntry?.cwd || session.projectPath || "/";

          const newSession = sessionManager.create(projectPath, csid, true);
          newSession.claudeSessionId = csid;

          // copy watch session's buffer to new session (more reliable than
          // re-reading JSONL, since the session ID may not match the JSONL filename)
          if (session.isWatchSession) {
            const watchEvents = session.buffer.getAll();
            for (const e of watchEvents) {
              newSession.buffer.push(e.payload as Record<string, unknown>);
            }
          } else {
            try {
              const history = await readSessionHistory(csid);
              for (const m of history) {
                newSession.buffer.push({ type: "claude_event", event: m });
              }
            } catch { /* history hydration is best-effort */ }
          }

          const newCaptureManager = new CaptureManager();
          newSession.captureManager = newCaptureManager;
          newCaptureManager.on("frame", (windowId: string, jpeg: Buffer, seq: number) => {
            wsTracker.broadcastBinary(newSession.id, packFrame(windowId, jpeg, seq));
          });
          newCaptureManager.on("error", (windowId: string, err: Error) => {
            wsTracker.broadcastToSession(newSession.id, { type: "stream_error", windowId, error: err.message });
          });
          newCaptureManager.on("stopped", (windowId: string) => {
            wsTracker.broadcastToSession(newSession.id, { type: "stream_stopped", windowId });
          });

          // clean up the old watch session
          if (session.isWatchSession) {
            sessionManager.delete(sessionId);
          }

          const wsUrl = `ws://localhost:${port}/ws/${newSession.id}`;
          ws.send(JSON.stringify({
            type: "take_over_complete",
            sessionId: newSession.id,
            wsUrl,
          }));
        } catch (err: any) {
          ws.send(JSON.stringify({
            type: "take_over_failed",
            error: err.message || "take-over failed",
          }));
        }
        return;
      }

      if (msg.type === "user_message" && typeof msg.content === "string") {
        // auto-resume if process died
        if (!session.process.alive && !session.isWatchSession && !session.respawning) {
          console.log(`[auto-resume] process dead for ${sessionId.slice(0, 8)}, respawning`);
          const ok = await sessionManager.respawn(sessionId);
          if (!ok) {
            console.error(`[auto-resume] respawn failed for ${sessionId.slice(0, 8)}`);
            return;
          }
        }
        sessionManager.sendMessage(sessionId, msg.content);
        return;
      }

      if (msg.type === "permission_response") {
        const pending = pendingPermissions.get(String(msg.requestId));
        if (pending) {
          pending.resolve({
            behavior: String(msg.behavior || "deny"),
            message: typeof msg.message === "string" ? msg.message : undefined,
          });
        }
        return;
      }

      if (msg.type === "ui_interaction" || msg.type === "input_response") {
        ipcServer.sendToSession(sessionId, msg);
        return;
      }

      if (msg.type === "list_windows") {
        const windows = listWindows();
        wsTracker.broadcastToSession(sessionId, { type: "window_list", windows });
        return;
      }

      if (msg.type === "start_stream") {
        const { windowId, fps, quality } = msg as Record<string, unknown>;
        if (!windowId || typeof windowId !== "string") return;
        const cm = sessionManager.get(sessionId)?.captureManager;
        cm?.startStream(windowId, {
          fps: typeof fps === "number" ? fps : undefined,
          quality: typeof quality === "number" ? quality : undefined,
        });
        const title = listWindows().find((w) => w.id === windowId)?.title ?? windowId;
        wsTracker.broadcastToSession(sessionId, { type: "stream_started", windowId, title });
        return;
      }

      if (msg.type === "stop_stream") {
        const cm = sessionManager.get(sessionId)?.captureManager;
        if (msg.windowId) {
          cm?.stopStream(String(msg.windowId));
        } else {
          cm?.stopAll();
        }
        wsTracker.broadcastToSession(sessionId, {
          type: "stream_stopped",
          windowId: msg.windowId ?? "all",
        });
        return;
      }

      if (msg.type === "stream_confirm_response") {
        const cm = sessionManager.get(sessionId)?.captureManager;
        if (msg.accepted && msg.windowId) {
          cm?.startStream(String(msg.windowId), {
            fps: typeof msg.fps === "number" ? msg.fps : undefined,
            quality: typeof msg.quality === "number" ? msg.quality : undefined,
          });
          const title = listWindows().find((w) => w.id === String(msg.windowId))?.title ?? String(msg.windowId);
          wsTracker.broadcastToSession(sessionId, { type: "stream_started", windowId: String(msg.windowId), title });
        } else if (msg.windowId) {
          wsTracker.broadcastToSession(sessionId, { type: "stream_stopped", windowId: String(msg.windowId) });
        }
        return;
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

    // screen capture: list windows (request-response via IPC)
    if (msg.type === "list_windows" && msg.requestId) {
      const windows = listWindows();
      ipcServer.sendToSession(sessionId, {
        type: "response",
        requestId: msg.requestId,
        data: { windows },
      });
      return;
    }

    // screen capture: MCP tool requests streaming a window
    if (msg.type === "stream_window") {
      const windows = listWindows();
      const match = msg.windowId
        ? windows.find((w) => w.id === msg.windowId)
        : windows.find((w) => new RegExp(String(msg.title), "i").test(w.title));

      if (!match) {
        wsTracker.broadcastToSession(sessionId, {
          type: "stream_error",
          windowId: String(msg.windowId ?? "unknown"),
          error: `No window matching "${msg.title ?? msg.windowId}"`,
        });
        return;
      }

      wsTracker.broadcastToSession(sessionId, {
        type: "stream_confirm",
        windowId: match.id,
        windowTitle: match.title,
        fps: msg.fps,
        quality: msg.quality,
      });
      return;
    }

    // screen capture: stop stream via IPC
    if (msg.type === "stop_stream") {
      const cm = session.captureManager;
      if (msg.windowId) {
        cm?.stopStream(String(msg.windowId));
      } else {
        cm?.stopAll();
      }
      // fall through to broadcast so clients know the stream stopped
    }

    // rewrite localhost URLs in workspace_url events so phone can reach them over tailscale
    if (msg.type === "workspace_url" && typeof msg.url === "string") {
      const tsIp = getTailscaleIp();
      if (tsIp) {
        msg = { ...msg, url: rewriteLocalhostUrl(msg.url as string, tsIp) };
      }
    }

    const buffered = session.buffer.push(msg);
    wsTracker.broadcastToSession(sessionId, {
      eventId: buffered.eventId,
      ...msg,
    });
  });

  const shutdown = new ShutdownManager();
  shutdown.register("watch reaper", async () => {
    clearInterval(watchReaperInterval);
  });
  shutdown.register("active watchers", async () => {
    for (const [csid, entry] of activeWatchers) {
      entry.watcher.stop();
    }
    activeWatchers.clear();
  });
  shutdown.register("pending permissions", async () => {
    for (const [id, pending] of pendingPermissions) {
      clearTimeout(pending.timeout);
      pending.resolve({ behavior: "deny", message: "Server shutting down" });
    }
    pendingPermissions.clear();
  });
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
