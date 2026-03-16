# Session Browser v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unified session experience — watch live terminal sessions from the phone, take them over, auto-resume vibelink sessions, clean session list with three states.

**Architecture:** Bridge gains a JSONL file watcher that streams terminal session events to the phone via WebSocket. Watch sessions are lightweight bridge sessions with no Claude subprocess. Take-over kills the terminal process and resumes via `--resume`. Auto-resume transparently respawns Claude when a vibelink session's process exits.

**Tech Stack:** Node.js (bridge), TypeScript, fs.watch/fs.watchFile, React Native (mobile), Zustand, Expo Router

**Spec:** `docs/superpowers/specs/2026-03-16-session-browser-v2-design.md`

---

## File Structure

### New files
- `bridge/src/jsonl-watcher.ts` — JSONL file watcher class (fs.watch + fs.watchFile fallback, stat-based delta reads, PID validation, event parsing)

### Modified files
- `bridge/src/session-scanner.ts` — export `loadActivePids()`, add `validatePid()`, add `name` field to `ClaudeSession`, add `findJsonlPath()`
- `bridge/src/session-manager.ts` — add `createWatchSession()`, `respawn()` with locking, per-session message queue
- `bridge/src/server.ts` — new REST endpoints (POST /sessions/watch, POST /sessions/end-terminal, POST /sessions/:id/take-over), WS handlers (stop_watching, take_over), watch session cleanup reaper, ws.on('close') for watch sessions
- `bridge/src/config.ts` — add `maxWatchSessions` config
- `mobile/src/store/sessions.ts` — session type tracking (terminal/vibelink/idle), watch state, resumeSessionId
- `mobile/src/services/bridge-api.ts` — add watchSession(), takeOver(), endTerminalSession(), update createSession() with resumeSessionId
- `mobile/app/index.tsx` — redesigned session list (active/other split, new indicators, swipe actions, empty states, accessibility labels)
- `mobile/app/session/[id].tsx` — watch mode (banner with last-update, no input bar, "Claude is responding..." indicator), take-over flow with message merge, session-ended separator, error/retry states

---

## Chunk 1: Bridge Foundation — Scanner Updates + JSONL Watcher

### Task 1: Update session-scanner.ts exports and types

**Files:**
- Modify: `bridge/src/session-scanner.ts`

- [ ] **Step 1: Export `loadActivePids`, `isPidAlive`, and `PidEntry`**

Change from private to exported:

```typescript
export interface PidEntry {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
}

export function isPidAlive(pid: number): boolean {
  // existing implementation unchanged
}

export async function loadActivePids(): Promise<Map<string, PidEntry>> {
  // existing implementation unchanged
}
```

- [ ] **Step 2: Add `validatePid` helper**

```typescript
export async function validatePid(pid: number): Promise<boolean> {
  try {
    const cmdline = await readFile(`/proc/${pid}/cmdline`, "utf-8");
    return cmdline.includes("claude");
  } catch {
    return false;
  }
}
```

- [ ] **Step 3: Add `name` field to ClaudeSession**

Update interface and `parseSessionJsonl()`:

```typescript
export interface ClaudeSession {
  sessionId: string;
  projectPath: string;
  projectName: string;
  lastActivity: string;
  model: string | null;
  gitBranch: string | null;
  alive: boolean;
  recentMessages: RecentMessage[];
  name: string | null;  // from --name flag
}
```

In `parseSessionJsonl()`, add `name` to `ParsedSession`, extract from JSONL:
```typescript
if (!name && entry.name && typeof entry.name === "string") {
  name = entry.name as string;
}
```

Set `name: parsed.name` in `scanClaudeSessions()`.

- [ ] **Step 4: Add `findJsonlPath` helper**

```typescript
export async function findJsonlPath(sessionId: string): Promise<string | null> {
  const projectsDir = join(homedir(), ".claude", "projects");
  let projectDirs: string[];
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return null;
  }
  for (const dirName of projectDirs) {
    const jsonlPath = join(projectsDir, dirName, `${sessionId}.jsonl`);
    try {
      await stat(jsonlPath);
      return jsonlPath;
    } catch {
      continue;
    }
  }
  return null;
}
```

Refactor `readSessionHistory` and `deleteClaudeSession` to use `findJsonlPath`.

- [ ] **Step 5: Build and verify**

Run: `cd bridge && npm run build`

- [ ] **Step 6: Commit**

```bash
git add bridge/src/session-scanner.ts
git commit -m "feat: export scanner helpers, add validatePid, name field, findJsonlPath"
```

### Task 2: Create JSONL watcher

**Files:**
- Create: `bridge/src/jsonl-watcher.ts`

- [ ] **Step 1: Create JsonlWatcher class with constructor and types**

```typescript
import { EventEmitter } from "events";
import { watch, watchFile, unwatchFile } from "fs";
import { open, stat as fsStat } from "fs/promises";
import { isPidAlive, validatePid } from "./session-scanner.js";

interface JsonlWatcherOptions {
  jsonlPath: string;
  pid: number;
  pidPollIntervalMs?: number;
  watchFileFallbackMs?: number;
}

export class JsonlWatcher extends EventEmitter {
  private readonly jsonlPath: string;
  private readonly pid: number;
  private fileOffset = 0;
  private watcher: ReturnType<typeof watch> | null = null;
  private pidInterval: ReturnType<typeof setInterval> | null = null;
  private fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
  private usingFallback = false;
  private lastWatchEvent = 0;
  private stopped = false;
  private readonly pidPollIntervalMs: number;
  private readonly watchFileFallbackMs: number;

  constructor(options: JsonlWatcherOptions) {
    super();
    this.jsonlPath = options.jsonlPath;
    this.pid = options.pid;
    this.pidPollIntervalMs = options.pidPollIntervalMs ?? 2000;
    this.watchFileFallbackMs = options.watchFileFallbackMs ?? 10000;
  }
}
```

- [ ] **Step 2: Add `loadHistory()` method**

```typescript
async loadHistory(tailBytes = 65536): Promise<void> {
  try {
    const fileStat = await fsStat(this.jsonlPath);
    this.fileOffset = fileStat.size;
    const readStart = Math.max(0, fileStat.size - tailBytes);
    const fh = await open(this.jsonlPath, "r");
    try {
      const buf = Buffer.alloc(fileStat.size - readStart);
      await fh.read(buf, 0, buf.length, readStart);
      let content = buf.toString("utf-8");
      if (readStart > 0) {
        const nl = content.indexOf("\n");
        if (nl >= 0) content = content.slice(nl + 1);
      }
      const events = this.parseLines(content);
      if (events.length > 0) this.emit("events", events);
    } finally {
      await fh.close();
    }
  } catch (err) {
    this.emit("error", err);
  }
}
```

- [ ] **Step 3: Add `parseLines()` helper**

```typescript
private parseLines(content: string): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry && typeof entry === "object") {
        const type = entry.type as string;
        if (type === "user" || type === "assistant" || type === "result") {
          events.push(entry);
        }
      }
    } catch { /* skip */ }
  }
  return events;
}
```

- [ ] **Step 4: Add `startWatching()`, `onFileChange()`, PID check, fallback, `stop()`**

```typescript
async startWatching(): Promise<void> {
  if (this.stopped) return;
  try {
    this.watcher = watch(this.jsonlPath, () => {
      this.lastWatchEvent = Date.now();
      this.onFileChange();
    });
    this.watcher.on("error", (err) => {
      this.emit("ended", "error", String(err));
      this.stop();
    });
  } catch (err) {
    this.emit("ended", "error", String(err));
    return;
  }
  this.pidInterval = setInterval(() => this.checkPid(), this.pidPollIntervalMs);
  this.scheduleFallbackCheck();
}

private async onFileChange(): Promise<void> {
  if (this.stopped) return;
  try {
    const fileStat = await fsStat(this.jsonlPath);
    if (fileStat.size < this.fileOffset) this.fileOffset = 0;
    if (fileStat.size <= this.fileOffset) return;
    const fh = await open(this.jsonlPath, "r");
    try {
      const delta = fileStat.size - this.fileOffset;
      const buf = Buffer.alloc(delta);
      await fh.read(buf, 0, delta, this.fileOffset);
      this.fileOffset = fileStat.size;
      const events = this.parseLines(buf.toString("utf-8"));
      if (events.length > 0) this.emit("events", events);
    } finally {
      await fh.close();
    }
    await this.checkPid();
  } catch (err: any) {
    if (err.code === "ENOENT") {
      this.emit("ended", "file_deleted");
      this.stop();
    }
  }
}

private async checkPid(): Promise<void> {
  if (this.stopped) return;
  if (!isPidAlive(this.pid) || !(await validatePid(this.pid))) {
    this.emit("ended", "process_exited");
    this.stop();
  }
}

private scheduleFallbackCheck(): void {
  this.fallbackTimeout = setTimeout(() => {
    if (this.stopped) return;
    if (Date.now() - this.lastWatchEvent >= this.watchFileFallbackMs && isPidAlive(this.pid)) {
      this.watcher?.close();
      this.watcher = null;
      this.usingFallback = true;
      watchFile(this.jsonlPath, { interval: 2000 }, () => this.onFileChange());
    }
    if (!this.stopped) this.scheduleFallbackCheck();
  }, this.watchFileFallbackMs);
}

stop(): void {
  if (this.stopped) return;
  this.stopped = true;
  this.watcher?.close();
  if (this.usingFallback) unwatchFile(this.jsonlPath);
  if (this.pidInterval) clearInterval(this.pidInterval);
  if (this.fallbackTimeout) clearTimeout(this.fallbackTimeout);
  this.removeAllListeners();
}
```

- [ ] **Step 5: Build and verify**

Run: `cd bridge && npm run build`

- [ ] **Step 6: Commit**

```bash
git add bridge/src/jsonl-watcher.ts
git commit -m "feat: add JSONL file watcher with PID validation and fallback"
```

---

## Chunk 2: Bridge — Config, Session Manager, Server

### Task 3: Update config

**Files:**
- Modify: `bridge/src/config.ts`

- [ ] **Step 1: Add watch config values**

```typescript
maxWatchSessions: parseInt(process.env.MAX_WATCH_SESSIONS ?? "5", 10),
watchSessionReaperIntervalMs: 10000,
watchSessionGracePeriodMs: 5000,
```

- [ ] **Step 2: Commit**

```bash
git add bridge/src/config.ts
git commit -m "feat: add watch session config values"
```

### Task 4: Update session-manager.ts

**Files:**
- Modify: `bridge/src/session-manager.ts`

- [ ] **Step 1: Extend Session interface**

```typescript
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
  disconnectedAt?: number;  // for watch session reaper grace period
}
```

- [ ] **Step 2: Add `createWatchSession()`**

```typescript
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
```

- [ ] **Step 3: Add `respawn()` with locking and ready-wait**

```typescript
async respawn(sessionId: string): Promise<boolean> {
  const session = this.sessions.get(sessionId);
  if (!session || session.isWatchSession || session.respawning) return false;

  const resumeId = session.process.resumeSessionId || session.claudeSessionId;
  if (!resumeId) return false;

  session.respawning = true;
  session.messageQueue = [];

  try {
    const args = [
      "--input-format", "stream-json",
      "--output-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--dangerously-skip-permissions",
      "--resume", resumeId,
    ];

    const proc = new ClaudeProcess({
      command: this.options.claudeCommand,
      args,
      cwd: session.projectPath,
      sessionId: session.id,
      skipPermissions: true,
    });

    // wait for first event (process ready) before flushing queue
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("respawn timeout")), 15000);
      proc.once("event", () => { clearTimeout(timeout); resolve(); });
      proc.once("error", (err) => { clearTimeout(timeout); reject(err); });
      proc.once("exit", () => { clearTimeout(timeout); reject(new Error("process exited")); });
    });

    proc.on("event", (payload: unknown) => {
      session.lastEventAt = new Date();
      const buffered = session.buffer.push(payload);
      this.emit("event", session.id, buffered);
    });

    proc.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      this.emit("session_exit", session.id, code, signal, proc.resumeSessionId);
    });

    session.process = proc;
    session.claudeSessionId = resumeId;
    session.respawning = false;

    const queued = session.messageQueue || [];
    session.messageQueue = undefined;
    for (const content of queued) {
      this.sendMessage(session.id, content);
    }
    return true;
  } catch {
    session.respawning = false;
    session.messageQueue = undefined;
    return false;
  }
}
```

- [ ] **Step 4: Update `sendMessage()` to queue during respawn**

```typescript
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
```

- [ ] **Step 5: Build and verify**

Run: `cd bridge && npm run build`

- [ ] **Step 6: Commit**

```bash
git add bridge/src/session-manager.ts
git commit -m "feat: add watch sessions, respawn with locking and ready-wait"
```

### Task 5: Update server.ts — all bridge endpoints and handlers

**Files:**
- Modify: `bridge/src/server.ts`

- [ ] **Step 1: Add imports**

```typescript
import { JsonlWatcher } from "./jsonl-watcher.js";
import {
  findJsonlPath,
  loadActivePids,
  validatePid,
  isPidAlive,
  readSessionHistory,
} from "./session-scanner.js";
```

- [ ] **Step 2: Add watch session tracking and reaper with grace period**

After IPC server setup:

```typescript
const activeWatchers = new Map<string, {
  watcher: JsonlWatcher;
  watchSessionIds: Set<string>;
}>();

function cleanupWatchSession(watchSessionId: string): void {
  const session = sessionManager.get(watchSessionId);
  if (!session?.isWatchSession) return;
  const cid = session.claudeSessionId;
  if (cid) {
    const entry = activeWatchers.get(cid);
    if (entry) {
      entry.watchSessionIds.delete(watchSessionId);
      if (entry.watchSessionIds.size === 0) {
        entry.watcher.stop();
        activeWatchers.delete(cid);
      }
    }
  }
  sessionManager.delete(watchSessionId);
}

// reaper with grace period
const watchReaper = setInterval(() => {
  for (const s of sessionManager.list()) {
    const session = sessionManager.get(s.id);
    if (!session?.isWatchSession) continue;
    const clients = wsTracker.getSessionClients(s.id);
    if (clients === 0) {
      if (!session.disconnectedAt) {
        session.disconnectedAt = Date.now();
      } else if (Date.now() - session.disconnectedAt > config.watchSessionGracePeriodMs) {
        cleanupWatchSession(s.id);
      }
    } else {
      session.disconnectedAt = undefined;
    }
  }
}, config.watchSessionReaperIntervalMs);
```

- [ ] **Step 3: Add helper to kill a terminal PID safely**

```typescript
async function killTerminalPid(claudeSessionId: string): Promise<boolean> {
  const pids = await loadActivePids();
  const entry = pids.get(claudeSessionId);
  if (!entry || !isPidAlive(entry.pid)) return true; // already dead
  if (!(await validatePid(entry.pid))) return true; // not claude

  try { process.kill(entry.pid, "SIGTERM"); } catch { return false; }

  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (!isPidAlive(entry.pid)) return true;
  }

  if (await validatePid(entry.pid)) {
    try { process.kill(entry.pid, "SIGKILL"); } catch {}
  }
  return true;
}
```

- [ ] **Step 4: Add `POST /sessions/watch` endpoint**

After auth middleware, before the WebSocket setup:

```typescript
expressApp.post("/sessions/watch", async (req, res) => {
  const { claudeSessionId } = req.body as { claudeSessionId?: string };
  if (!claudeSessionId) {
    res.status(400).json({ error: "claudeSessionId required" });
    return;
  }

  let watchCount = 0;
  for (const s of sessionManager.list()) {
    if (sessionManager.get(s.id)?.isWatchSession) watchCount++;
  }
  if (watchCount >= config.maxWatchSessions) {
    res.status(429).json({ error: "too many watch sessions" });
    return;
  }

  const jsonlPath = await findJsonlPath(claudeSessionId);
  if (!jsonlPath) {
    res.status(404).json({ error: "JSONL file not found" });
    return;
  }

  const pids = await loadActivePids();
  const pidEntry = pids.get(claudeSessionId);
  if (!pidEntry || !isPidAlive(pidEntry.pid) || !(await validatePid(pidEntry.pid))) {
    res.status(404).json({ error: "terminal session not running" });
    return;
  }

  const session = sessionManager.createWatchSession(claudeSessionId, pidEntry.cwd);

  let watcherEntry = activeWatchers.get(claudeSessionId);
  if (!watcherEntry) {
    const watcher = new JsonlWatcher({ jsonlPath, pid: pidEntry.pid });

    watcher.on("events", (events: Array<Record<string, unknown>>) => {
      const e = activeWatchers.get(claudeSessionId);
      if (!e) return;
      for (const wsId of e.watchSessionIds) {
        const ws = sessionManager.get(wsId);
        if (!ws) continue;
        for (const event of events) {
          const buffered = ws.buffer.push({ type: "claude_event", event });
          wsTracker.broadcastToSession(wsId, {
            eventId: buffered.eventId,
            type: "claude_event",
            event,
          });
        }
      }
    });

    watcher.on("ended", (reason: string, message?: string) => {
      const e = activeWatchers.get(claudeSessionId);
      if (!e) return;
      for (const wsId of e.watchSessionIds) {
        wsTracker.broadcastToSession(wsId, { type: "watch_ended", reason, message });
      }
      for (const wsId of [...e.watchSessionIds]) {
        cleanupWatchSession(wsId);
      }
      activeWatchers.delete(claudeSessionId);
    });

    await watcher.loadHistory();
    await watcher.startWatching();
    watcherEntry = { watcher, watchSessionIds: new Set() };
    activeWatchers.set(claudeSessionId, watcherEntry);
  }

  watcherEntry.watchSessionIds.add(session.id);
  const wsUrl = `ws://localhost:${port}/ws/${session.id}`;
  res.status(201).json({ sessionId: session.id, wsUrl });
});
```

- [ ] **Step 5: Add `POST /sessions/end-terminal` endpoint**

```typescript
expressApp.post("/sessions/end-terminal", async (req, res) => {
  const { claudeSessionId } = req.body as { claudeSessionId?: string };
  if (!claudeSessionId) {
    res.status(400).json({ error: "claudeSessionId required" });
    return;
  }
  const killed = await killTerminalPid(claudeSessionId);
  if (!killed) {
    res.status(500).json({ error: "failed to kill terminal session" });
    return;
  }
  res.status(204).send();
});
```

- [ ] **Step 6: Add `POST /sessions/:id/take-over` REST endpoint**

```typescript
expressApp.post("/sessions/:id/take-over", async (req, res) => {
  const { claudeSessionId } = req.body as { claudeSessionId?: string };
  if (!claudeSessionId) {
    res.status(400).json({ error: "claudeSessionId required" });
    return;
  }

  await killTerminalPid(claudeSessionId);

  // notify other watchers
  const watcherEntry = activeWatchers.get(claudeSessionId);
  if (watcherEntry) {
    const requestingSession = req.params.id;
    for (const wsId of watcherEntry.watchSessionIds) {
      if (wsId === requestingSession) continue;
      wsTracker.broadcastToSession(wsId, { type: "watch_ended", reason: "taken_over" });
    }
    watcherEntry.watcher.stop();
    for (const wsId of [...watcherEntry.watchSessionIds]) {
      cleanupWatchSession(wsId);
    }
    activeWatchers.delete(claudeSessionId);
  }

  // find project path from PID data
  const pids = await loadActivePids();
  const pidEntry = pids.get(claudeSessionId);
  const projectPath = pidEntry?.cwd || "/tmp";

  try {
    const newSession = sessionManager.create(projectPath, claudeSessionId, true);
    newSession.claudeSessionId = claudeSessionId;
    const history = await readSessionHistory(claudeSessionId);
    for (const msg of history) {
      newSession.buffer.push({ type: "claude_event", event: msg });
    }
    const wsUrl = `ws://localhost:${port}/ws/${newSession.id}`;
    res.status(201).json({ sessionId: newSession.id, wsUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Resume failed" });
  }
});
```

- [ ] **Step 7: Add WS handlers for watch sessions**

Inside the `ws.on("message")` handler:

```typescript
if (msg.type === "stop_watching") {
  cleanupWatchSession(sessionId);
  return;
}

if (msg.type === "take_over" && typeof msg.claudeSessionId === "string") {
  const claudeSid = msg.claudeSessionId;
  await killTerminalPid(claudeSid);

  const watcherEntry = activeWatchers.get(claudeSid);
  if (watcherEntry) {
    for (const wsId of watcherEntry.watchSessionIds) {
      if (wsId === sessionId) continue;
      wsTracker.broadcastToSession(wsId, { type: "watch_ended", reason: "taken_over" });
    }
    watcherEntry.watcher.stop();
    for (const wsId of [...watcherEntry.watchSessionIds]) {
      if (wsId !== sessionId) cleanupWatchSession(wsId);
    }
    activeWatchers.delete(claudeSid);
  }

  cleanupWatchSession(sessionId);

  const pids = await loadActivePids();
  const pidEntry = pids.get(claudeSid);
  try {
    const newSession = sessionManager.create(pidEntry?.cwd || "/tmp", claudeSid, true);
    newSession.claudeSessionId = claudeSid;
    const history = await readSessionHistory(claudeSid);
    for (const histMsg of history) {
      newSession.buffer.push({ type: "claude_event", event: histMsg });
    }
    const newWsUrl = `ws://localhost:${port}/ws/${newSession.id}`;
    ws.send(JSON.stringify({ type: "take_over_complete", sessionId: newSession.id, wsUrl: newWsUrl }));
  } catch (err: any) {
    ws.send(JSON.stringify({ type: "take_over_failed", message: err.message || "Resume failed" }));
  }
  return;
}
```

- [ ] **Step 8: Add auto-resume to `user_message` handler**

Replace existing `user_message` block:

```typescript
if (msg.type === "user_message" && typeof msg.content === "string") {
  const s = sessionManager.get(sessionId);
  if (!s) return;
  if (!s.process.alive && !s.isWatchSession && !s.respawning) {
    const success = await sessionManager.respawn(sessionId);
    if (!success) return; // client will timeout and show retry
  }
  sessionManager.sendMessage(sessionId, msg.content);
  return;
}
```

- [ ] **Step 9: Add ws.on('close') for watch session grace period**

Inside the `wss.on("connection")` handler, after `wsTracker.add(ws, sessionId)`:

```typescript
ws.on("close", () => {
  const s = sessionManager.get(sessionId);
  if (s?.isWatchSession) {
    s.disconnectedAt = Date.now();
  }
});
```

- [ ] **Step 10: Register cleanup in shutdown**

```typescript
shutdown.register("watch reaper", async () => clearInterval(watchReaper));
shutdown.register("jsonl watchers", async () => {
  for (const [, entry] of activeWatchers) entry.watcher.stop();
  activeWatchers.clear();
});
```

- [ ] **Step 11: Build and verify**

Run: `cd bridge && npm run build`

- [ ] **Step 12: Commit**

```bash
git add bridge/src/server.ts bridge/src/config.ts
git commit -m "feat: add watch/take-over/end-terminal endpoints, reaper, auto-resume"
```

---

## Chunk 3: Mobile — Store, API, Session List

### Task 6: Update mobile store and API

**Files:**
- Modify: `mobile/src/store/sessions.ts`
- Modify: `mobile/src/services/bridge-api.ts`

- [ ] **Step 1: Update session store types**

```typescript
export type SessionType = "terminal" | "vibelink" | "idle";

export interface Session {
  id: string;
  projectPath: string;
  projectName: string;
  createdAt: string;
  alive: boolean;
  lastMessage?: string;
  sessionType: SessionType;
  claudeSessionId?: string;
  watchSessionId?: string;
  model?: string | null;
  gitBranch?: string | null;
  name?: string | null;
}
```

Add actions:
```typescript
setSessionType: (id: string, type: SessionType) => void,
setWatchSessionId: (id: string, watchSessionId: string | null) => void,
```

- [ ] **Step 2: Update bridge-api.ts using existing apiFetch pattern**

Add to the existing API functions (follow the existing `apiFetch` pattern in the file):

```typescript
export async function watchSession(claudeSessionId: string): Promise<{
  sessionId: string;
  wsUrl: string;
}> {
  return apiFetch("/sessions/watch", {
    method: "POST",
    body: JSON.stringify({ claudeSessionId }),
  });
}

export async function endTerminalSession(claudeSessionId: string): Promise<void> {
  await apiFetch("/sessions/end-terminal", {
    method: "POST",
    body: JSON.stringify({ claudeSessionId }),
  });
}

export async function getClaudeSessions(): Promise<any[]> {
  return apiFetch("/claude-sessions");
}
```

Update existing `createSession` to accept `resumeSessionId`:

```typescript
export async function createSession(
  projectPath: string,
  resumeSessionId?: string,
  skipPermissions?: boolean,
): Promise<{ sessionId: string; wsUrl: string }> {
  return apiFetch("/sessions", {
    method: "POST",
    body: JSON.stringify({ projectPath, resumeSessionId, skipPermissions }),
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add mobile/src/store/sessions.ts mobile/src/services/bridge-api.ts
git commit -m "feat: add session types, watch/end-terminal API, update createSession"
```

### Task 7: Redesign session list (index.tsx)

**Files:**
- Modify: `mobile/app/index.tsx`

- [ ] **Step 1: Rewrite session classification**

Replace the current section-based filtering. In the component body:

```typescript
const activeSessions = useMemo(() => {
  const sessions: Session[] = [];

  for (const cs of claudeSessions) {
    if (!cs.alive) continue;
    const isOwned = vibelinkSessions.some((vs) => vs.claudeSessionId === cs.sessionId);
    if (isOwned) continue;
    sessions.push({
      id: cs.sessionId,
      projectPath: cs.projectPath,
      projectName: cs.name || cs.projectName,
      createdAt: cs.lastActivity,
      alive: true,
      lastMessage: cs.recentMessages[cs.recentMessages.length - 1]?.text,
      sessionType: "terminal",
      claudeSessionId: cs.sessionId,
      model: cs.model,
      gitBranch: cs.gitBranch,
      name: cs.name,
    });
  }

  for (const vs of vibelinkSessions) {
    sessions.push({ ...vs, sessionType: "vibelink" });
  }

  sessions.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sessions;
}, [claudeSessions, vibelinkSessions]);

const idleSessions = useMemo(() => {
  return claudeSessions
    .filter((cs) => !cs.alive)
    .map((cs) => ({
      id: cs.sessionId,
      projectPath: cs.projectPath,
      projectName: cs.name || cs.projectName,
      createdAt: cs.lastActivity,
      alive: false,
      lastMessage: cs.recentMessages[cs.recentMessages.length - 1]?.text,
      sessionType: "idle" as SessionType,
      claudeSessionId: cs.sessionId,
      model: cs.model,
      gitBranch: cs.gitBranch,
      name: cs.name,
    }))
    .slice(0, 20);
}, [claudeSessions]);
```

- [ ] **Step 2: Rewrite session row with accessible indicators**

Session row component with shape+color indicators and accessibility labels:

```typescript
function SessionRow({ session, onPress, onEnd, onDelete }: {
  session: Session;
  onPress: () => void;
  onEnd?: () => void;
  onDelete?: () => void;
}) {
  const indicator = session.sessionType === "terminal"
    ? { width: 10, height: 10, borderRadius: 5, backgroundColor: "#4ade80" }  // filled green
    : session.sessionType === "vibelink"
    ? { width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: "#60a5fa", backgroundColor: "transparent" } // hollow blue ring
    : { width: 8, height: 2, borderRadius: 1, backgroundColor: "#475569" }; // gray dash

  const label = `${session.projectName}, ${session.sessionType}, ${session.lastMessage || "no messages"}, ${formatRelativeTime(session.createdAt)}`;

  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityRole="button"
      style={[styles.sessionRow, session.sessionType === "idle" && { opacity: 0.7 }]}
    >
      <View style={[styles.indicator, indicator]} />
      <View style={styles.sessionInfo}>
        <View style={styles.sessionHeader}>
          <Text style={styles.projectName}>{session.name || session.projectName}</Text>
          <Text style={styles.timeAgo}>{formatRelativeTime(session.createdAt)}</Text>
        </View>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {session.lastMessage || session.projectPath}
        </Text>
        <View style={styles.badges}>
          {session.sessionType === "terminal" && (
            <View style={[styles.badge, styles.terminalBadge]}>
              <Text style={styles.terminalBadgeText}>terminal</Text>
            </View>
          )}
          {session.sessionType === "vibelink" && (
            <View style={[styles.badge, styles.vibelinkBadge]}>
              <Text style={styles.vibelinkBadgeText}>vibelink</Text>
            </View>
          )}
          {session.sessionType === "idle" && (
            <Text style={styles.resumeLabel}>resume</Text>
          )}
          {session.gitBranch && (
            <View style={[styles.badge, styles.branchBadge]}>
              <Text style={styles.branchBadgeText}>{session.gitBranch}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}
```

- [ ] **Step 3: Add collapsible "Other sessions" with auto-expand and empty states**

```typescript
const [otherExpanded, setOtherExpanded] = useState(false);

// auto-expand when no active sessions
useEffect(() => {
  if (activeSessions.length === 0 && idleSessions.length > 0) {
    setOtherExpanded(true);
  }
}, [activeSessions.length, idleSessions.length]);
```

Render logic:
```typescript
{activeSessions.length === 0 && idleSessions.length === 0 && (
  <View style={styles.emptyState}>
    <Text style={styles.emptyTitle}>No sessions yet</Text>
    <Text style={styles.emptySubtitle}>
      Start Claude in your terminal to see sessions here, or tap + to create one.
    </Text>
  </View>
)}

{activeSessions.length === 0 && idleSessions.length > 0 && (
  <Text style={styles.emptyActiveText}>
    No active sessions. Tap one below to resume, or start new.
  </Text>
)}

{activeSessions.map((s) => (
  <SessionRow key={s.id} session={s} onPress={() => handleSessionPress(s)}
    onEnd={() => handleEndSession(s)} />
))}

{idleSessions.length > 0 && (
  <>
    <TouchableOpacity style={styles.otherHeader} onPress={() => setOtherExpanded(!otherExpanded)}>
      <Text style={styles.otherHeaderText}>Other sessions</Text>
      <Text style={styles.otherHeaderCount}>{idleSessions.length} {otherExpanded ? "▴" : "▾"}</Text>
    </TouchableOpacity>
    {otherExpanded && idleSessions.map((s) => (
      <SessionRow key={s.id} session={s} onPress={() => handleSessionPress(s)}
        onDelete={() => handleDeleteSession(s)} />
    ))}
  </>
)}
```

- [ ] **Step 4: Implement press handlers with swipe and confirmations**

```typescript
const handleSessionPress = useCallback(async (session: Session) => {
  if (session.sessionType === "terminal") {
    try {
      const result = await watchSession(session.claudeSessionId!);
      router.push(`/session/${result.sessionId}?watch=true&claudeSessionId=${session.claudeSessionId}&projectPath=${encodeURIComponent(session.projectPath)}`);
    } catch (err: any) {
      Alert.alert("Watch failed", err.message);
    }
  } else if (session.sessionType === "idle") {
    try {
      const result = await createSession(session.projectPath, session.claudeSessionId);
      router.push(`/session/${result.sessionId}`);
    } catch (err: any) {
      Alert.alert("Resume failed", err.message);
    }
  } else {
    setActiveSession(session.id);
    router.push(`/session/${session.id}`);
  }
}, []);

const handleEndSession = useCallback(async (session: Session) => {
  const title = session.sessionType === "terminal"
    ? "End Terminal Session"
    : "End Session";
  const message = session.sessionType === "terminal"
    ? "This will kill the Claude process running in your terminal. Continue?"
    : "End this session?";

  Alert.alert(title, message, [
    { text: "Cancel", style: "cancel" },
    {
      text: "End",
      style: "destructive",
      onPress: async () => {
        if (session.sessionType === "terminal") {
          await endTerminalSession(session.claudeSessionId!);
        } else {
          await deleteSession(session.id);
        }
        loadSessions(); // refresh list
      },
    },
  ]);
}, []);

const handleDeleteSession = useCallback(async (session: Session) => {
  Alert.alert("Delete Session", "This permanently deletes the conversation. Continue?", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Delete",
      style: "destructive",
      onPress: async () => {
        await deleteClaudeSession(session.claudeSessionId!);
        loadSessions();
      },
    },
  ]);
}, []);
```

- [ ] **Step 5: Build and verify**

Run: `cd mobile && npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add mobile/app/index.tsx
git commit -m "feat: redesign session list — active/idle split, indicators, swipe actions"
```

---

## Chunk 4: Mobile — Watch Mode + Take-Over

### Task 8: Add watch mode to session detail

**Files:**
- Modify: `mobile/app/session/[id].tsx`

- [ ] **Step 1: Add watch mode state from route params**

```typescript
const params = useLocalSearchParams<{
  id: string;
  watch?: string;
  claudeSessionId?: string;
  projectPath?: string;
}>();
const isWatchMode = params.watch === "true";
const claudeSessionId = params.claudeSessionId;
const projectPath = params.projectPath ? decodeURIComponent(params.projectPath) : undefined;

const [watchState, setWatchState] = useState<
  "watching" | "taking_over" | "ended" | "error" | null
>(isWatchMode ? "watching" : null);
const [watchError, setWatchError] = useState<string | null>(null);
const [lastWatchUpdate, setLastWatchUpdate] = useState<Date>(new Date());
```

- [ ] **Step 2: Handle watch-specific WebSocket events**

In the WebSocket message handler:

```typescript
if (parsed.type === "watch_ended") {
  const reason = parsed.reason as string;
  if (reason === "taken_over") {
    setWatchState("ended");
    setWatchError("Session taken over by another device");
  } else if (reason === "process_exited") {
    setWatchState("ended");
    // inject separator into message list
    addEvent(sessionId, {
      type: "separator",
      text: "Terminal session ended",
      timestamp: new Date().toISOString(),
    });
  } else {
    setWatchState("error");
    setWatchError(parsed.message as string || "Watch ended");
  }
  return;
}

if (parsed.type === "take_over_complete") {
  const newSessionId = parsed.sessionId as string;
  // in-place session swap — merge messages, don't navigate
  // update store to point to new session
  setActiveSession(newSessionId);
  setWatchState(null);
  // reconnect WS to new session
  reconnectToSession(newSessionId);
  return;
}

if (parsed.type === "take_over_failed") {
  setWatchState("error");
  setWatchError(parsed.message as string || "Take-over failed — session saved");
  return;
}

// track last update time for watch mode
if (parsed.type === "claude_event" && isWatchMode) {
  setLastWatchUpdate(new Date());
}
```

- [ ] **Step 3: Add "Claude is responding..." indicator**

In the message list rendering, after the last message:

```typescript
// detect if Claude is responding (last event is user message with no assistant follow-up)
const lastEvent = events[events.length - 1];
const isClaudeResponding = watchState === "watching" &&
  lastEvent?.type === "user" &&
  !events.some((e, i) => i > events.indexOf(lastEvent) && e.type === "assistant");

{isClaudeResponding && (
  <View style={styles.respondingIndicator}>
    <ActivityIndicator size="small" color="#94a3b8" />
    <Text style={styles.respondingText}>Claude is responding...</Text>
  </View>
)}
```

- [ ] **Step 4: Add WatchBanner component with last-update timestamp**

```typescript
function WatchBanner({
  state,
  error,
  lastUpdate,
  onTakeOver,
  onResume,
}: {
  state: "watching" | "taking_over" | "ended" | "error";
  error?: string | null;
  lastUpdate: Date;
  onTakeOver: () => void;
  onResume: () => void;
}) {
  const timeAgo = formatRelativeTime(lastUpdate.toISOString());

  if (state === "watching") {
    return (
      <View style={styles.watchBanner}>
        <View style={styles.watchBannerLeft}>
          <View style={styles.liveDot} />
          <View>
            <Text style={styles.watchBannerText}>Live from terminal</Text>
            <Text style={styles.watchBannerTime}>Last update: {timeAgo}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.takeOverButton} onPress={onTakeOver}>
          <Text style={styles.takeOverText}>Take Over</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === "taking_over") {
    return (
      <View style={styles.watchBanner}>
        <Text style={styles.watchBannerText}>Taking over...</Text>
        <ActivityIndicator size="small" color="#60a5fa" />
      </View>
    );
  }

  if (state === "ended") {
    return (
      <View style={styles.watchBanner}>
        <Text style={styles.watchBannerText}>{error || "Session ended"}</Text>
        {!error?.includes("another device") && (
          <TouchableOpacity style={styles.resumeButton} onPress={onResume}>
            <Text style={styles.resumeText}>Resume</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.watchBannerError}>
      <Text style={styles.watchBannerText}>{error || "Watch error"}</Text>
    </View>
  );
}
```

- [ ] **Step 5: Integrate banner, hide input in watch mode**

Replace the input bar section:

```typescript
{watchState ? (
  <WatchBanner
    state={watchState}
    error={watchError}
    lastUpdate={lastWatchUpdate}
    onTakeOver={handleTakeOver}
    onResume={handleResume}
  />
) : (
  // existing input bar
)}
```

- [ ] **Step 6: Implement take-over and resume handlers**

```typescript
const handleTakeOver = useCallback(() => {
  if (!claudeSessionId) return;
  Alert.alert("Take Over", "This will end the terminal session. Continue?", [
    { text: "Cancel", style: "cancel" },
    {
      text: "Take Over",
      style: "destructive",
      onPress: () => {
        setWatchState("taking_over");
        sendWsMessage({ type: "take_over", claudeSessionId });
      },
    },
  ]);
}, [claudeSessionId]);

const handleResume = useCallback(async () => {
  if (!claudeSessionId || !projectPath) return;
  try {
    const result = await createSession(projectPath, claudeSessionId);
    router.replace(`/session/${result.sessionId}`);
  } catch (err: any) {
    Alert.alert("Resume failed", err.message);
  }
}, [claudeSessionId, projectPath]);
```

- [ ] **Step 7: Add watch mode styles**

```typescript
watchBanner: {
  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  paddingHorizontal: 16, paddingVertical: 12,
  backgroundColor: "#1a2332", borderTopWidth: 1, borderTopColor: "#2a3a4a",
},
watchBannerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#4ade80" },
watchBannerText: { color: "#94a3b8", fontSize: 14 },
watchBannerTime: { color: "#64748b", fontSize: 11, marginTop: 1 },
takeOverButton: { backgroundColor: "#1e3a5f", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
takeOverText: { color: "#60a5fa", fontWeight: "600", fontSize: 14 },
resumeButton: { backgroundColor: "#1e3a5f", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
resumeText: { color: "#60a5fa", fontWeight: "600", fontSize: 14 },
watchBannerError: {
  flexDirection: "row", alignItems: "center", justifyContent: "center",
  paddingHorizontal: 16, paddingVertical: 12,
  backgroundColor: "#2a1a1a", borderTopWidth: 1, borderTopColor: "#4a2a2a",
},
respondingIndicator: {
  flexDirection: "row", alignItems: "center", gap: 8,
  padding: 12, marginHorizontal: 16,
},
respondingText: { color: "#64748b", fontSize: 13 },
```

- [ ] **Step 8: Build and verify**

Run: `cd mobile && npx tsc --noEmit`

- [ ] **Step 9: Commit**

```bash
git add mobile/app/session/[id].tsx
git commit -m "feat: add watch mode, take-over, responding indicator, session-ended separator"
```

### Task 9: End-to-end verification

- [ ] **Step 1: Build bridge**

```bash
cd bridge && npm run build
```

- [ ] **Step 2: Start bridge and test watch endpoint**

```bash
node dist/server.js &
curl -s http://localhost:3400/claude-sessions | python3 -c "
import sys, json
sessions = json.load(sys.stdin)
alive = [s for s in sessions if s['alive']]
print(f'{len(alive)} alive, {len(sessions)} total')
for s in alive[:3]: print(f'  {s[\"sessionId\"][:8]}... {s[\"projectName\"]} ({s.get(\"name\",\"\")})')
"
```

- [ ] **Step 3: Test watch session creation**

```bash
curl -X POST http://localhost:3400/sessions/watch \
  -H "Content-Type: application/json" \
  -d '{"claudeSessionId":"<LIVE_SESSION_ID>"}' | python3 -m json.tool
```

- [ ] **Step 4: Test end-terminal endpoint**

```bash
curl -X POST http://localhost:3400/sessions/end-terminal \
  -H "Content-Type: application/json" \
  -d '{"claudeSessionId":"<SESSION_TO_END>"}'
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: session browser v2 complete — watch, take-over, auto-resume"
```

---

## Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | Bridge scanner | Export helpers, validatePid, name field, findJsonlPath |
| 2 | Bridge watcher | JsonlWatcher with fs.watch, fallback, PID validation |
| 3 | Bridge config | maxWatchSessions, reaper config |
| 4 | Bridge session-manager | Watch sessions, respawn with locking + ready-wait |
| 5 | Bridge server | REST endpoints, WS handlers, reaper with grace period, auto-resume |
| 6 | Mobile store + API | Session types, watch/end API, createSession with resumeSessionId |
| 7 | Mobile session list | Active/idle split, accessible indicators, swipe actions, empty states |
| 8 | Mobile session detail | Watch banner, take-over with merge, responding indicator, separator |
| 9 | Integration | Build, verify endpoints, test watch flow |
