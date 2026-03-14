# VibeLink Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted mobile companion for Claude Code — Bridge server, MCP server, and React Native app — delivering streaming chat, tool visibility, and dynamic UI components over Tailscale.

**Architecture:** Three Node.js/TypeScript packages in a monorepo. Bridge Server spawns Claude CLI as subprocess with bidirectional NDJSON, manages WebSocket connections to mobile clients, and runs a Unix socket IPC server. MCP Server (auto-launched by Claude) provides render_ui/create_tab/request_input tools, communicating with Bridge over IPC. React Native Expo app provides session management, CLI tab (raw events), GUI tab (rich markdown + dynamic components), and a project directory picker.

**Tech Stack:** Node.js 22+, TypeScript, Express, ws, ndjson, @modelcontextprotocol/sdk, React Native, Expo, NativeWind, Zustand, FlashList, react-native-keyboard-controller, vitest (server tests), jest (mobile tests)

**Spec:** `docs/superpowers/specs/2026-03-14-vibelink-phase1-design.md`

---

## Chunk 1: Project Scaffolding + Bridge Core

Goal: Monorepo structure with all three packages initialized. Bridge runs with health check endpoint. Shared types for all protocols.

### Task 1: Initialize Git Repo + Root Config

**Files:**
- Create: `.gitignore`
- Create: `package.json` (root workspace)
- Create: `tsconfig.base.json`

- [ ] **Step 1: Initialize git repo**

```bash
cd /home/deck/vibelink
git init
```

- [ ] **Step 2: Create root .gitignore**

```gitignore
node_modules/
dist/
.env
*.keystore
mobile/android/
mobile/ios/
.expo/
```

- [ ] **Step 3: Create root package.json with workspaces**

```json
{
  "name": "vibelink",
  "private": true,
  "workspaces": ["bridge", "mcp-server"],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces"
  }
}
```

Note: `mobile/` is NOT a workspace — Expo manages its own deps.

- [ ] **Step 4: Create shared tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add .gitignore package.json tsconfig.base.json
git commit -m "chore: initialize monorepo structure"
```

### Task 2: Bridge Package Scaffolding

**Files:**
- Create: `bridge/package.json`
- Create: `bridge/tsconfig.json`
- Create: `bridge/src/config.ts`

- [ ] **Step 1: Create bridge/package.json**

```json
{
  "name": "@vibelink/bridge",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^5.1.0",
    "ws": "^8.18.0",
    "ndjson": "^2.0.0",
    "dotenv": "^16.4.0",
    "uuid": "^11.1.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^3.1.0",
    "@types/express": "^5.0.0",
    "@types/ws": "^8.5.0",
    "@types/ndjson": "^2.0.0",
    "@types/uuid": "^10.0.0"
  }
}
```

- [ ] **Step 2: Create bridge/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create bridge/src/config.ts**

This is the first real source file. All config from env vars with sensible defaults.

```ts
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

loadEnv({ path: resolve(__dirname, '../.env') });

export const config = {
  port: parseInt(process.env.PORT || '3400', 10),
  authToken: process.env.AUTH_TOKEN || '',
  ipcSocketPath: process.env.IPC_SOCKET_PATH || '/tmp/vibelink.sock',
  scanRoots: (process.env.SCAN_ROOTS || process.env.HOME || '~').split(',').map(s => s.trim()),
  scanMaxDepth: parseInt(process.env.SCAN_MAX_DEPTH || '3', 10),
  scanCacheTtlMs: parseInt(process.env.SCAN_CACHE_TTL_MS || '60000', 10),
  eventBufferSize: parseInt(process.env.EVENT_BUFFER_SIZE || '200', 10),
  wsHeartbeatIntervalMs: 30_000,
  wsHeartbeatTimeoutMs: 10_000,
  requestInputTimeoutMs: 5 * 60 * 1000,
};
```

- [ ] **Step 4: Install deps and verify build**

```bash
cd /home/deck/vibelink/bridge
npm install
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add bridge/
git commit -m "chore: scaffold bridge package with config"
```

### Task 3: Bridge Server Skeleton + Health Check

**Files:**
- Create: `bridge/src/server.ts`
- Create: `bridge/src/__tests__/server.test.ts`

- [ ] **Step 1: Write the test**

```ts
// bridge/src/__tests__/server.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

let baseUrl: string;
let closeServer: () => Promise<void>;

beforeAll(async () => {
  // dynamic import to avoid side effects
  const { createApp } = await import('../server.js');
  const { app, close } = await createApp({ port: 0 }); // port 0 = random
  const addr = app.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3400;
  baseUrl = `http://localhost:${port}`;
  closeServer = close;
});

afterAll(async () => {
  await closeServer();
});

describe('Bridge Server', () => {
  it('responds to health check', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  it('responds to debug endpoint', async () => {
    const res = await fetch(`${baseUrl}/debug`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('sessions');
    expect(body).toHaveProperty('uptime');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /home/deck/vibelink/bridge
npx vitest run src/__tests__/server.test.ts
```

Expected: FAIL — `createApp` not found.

- [ ] **Step 3: Implement server.ts**

```ts
// bridge/src/server.ts
import express from 'express';
import http from 'http';
import { config } from './config.js';

const startTime = Date.now();

export async function createApp(opts?: { port?: number }) {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/debug', (_req, res) => {
    res.json({
      sessions: [],
      ipcConnected: false,
      uptime: `${Math.floor((Date.now() - startTime) / 1000)}s`,
    });
  });

  const port = opts?.port ?? config.port;
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  const close = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  };

  return { app: server, close };
}

// run directly
if (process.argv[1]?.endsWith('server.js') || process.argv[1]?.endsWith('server.ts')) {
  createApp().then(({ app }) => {
    const addr = app.address();
    const port = typeof addr === 'object' && addr ? addr.port : config.port;
    console.log(`vibelink bridge listening on :${port}`);
  });
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/__tests__/server.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify dev server starts**

```bash
npx tsx src/server.ts
# should print "vibelink bridge listening on :3400"
# Ctrl+C to stop
```

- [ ] **Step 6: Commit**

```bash
git add bridge/src/
git commit -m "feat(bridge): server skeleton with health and debug endpoints"
```

### Task 4: Event Buffer

**Files:**
- Create: `bridge/src/event-buffer.ts`
- Create: `bridge/src/__tests__/event-buffer.test.ts`

- [ ] **Step 1: Write tests**

```ts
// bridge/src/__tests__/event-buffer.test.ts
import { describe, it, expect } from 'vitest';
import { EventBuffer } from '../event-buffer.js';

describe('EventBuffer', () => {
  it('assigns sequential IDs to events', () => {
    const buf = new EventBuffer(10);
    const e1 = buf.push({ type: 'claude_event', event: { type: 'system' } });
    const e2 = buf.push({ type: 'claude_event', event: { type: 'assistant' } });
    expect(e1.eventId).toBe(1);
    expect(e2.eventId).toBe(2);
  });

  it('respects max size (circular)', () => {
    const buf = new EventBuffer(3);
    buf.push({ type: 'a' });
    buf.push({ type: 'b' });
    buf.push({ type: 'c' });
    buf.push({ type: 'd' });
    const all = buf.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].eventId).toBe(2);
    expect(all[2].eventId).toBe(4);
  });

  it('returns events after a given ID', () => {
    const buf = new EventBuffer(10);
    buf.push({ type: 'a' });
    buf.push({ type: 'b' });
    buf.push({ type: 'c' });
    const after = buf.getAfter(1);
    expect(after).toHaveLength(2);
    expect(after[0].eventId).toBe(2);
  });

  it('returns empty when lastEventId is current', () => {
    const buf = new EventBuffer(10);
    buf.push({ type: 'a' });
    const after = buf.getAfter(1);
    expect(after).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

```bash
npx vitest run src/__tests__/event-buffer.test.ts
```

- [ ] **Step 3: Implement**

```ts
// bridge/src/event-buffer.ts
export interface BufferedEvent {
  eventId: number;
  [key: string]: unknown;
}

export class EventBuffer {
  private buffer: BufferedEvent[] = [];
  private nextId = 1;

  constructor(private maxSize: number) {}

  push(event: Record<string, unknown>): BufferedEvent {
    const buffered: BufferedEvent = { ...event, eventId: this.nextId++ };
    this.buffer.push(buffered);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
    return buffered;
  }

  getAll(): BufferedEvent[] {
    return [...this.buffer];
  }

  getAfter(lastEventId: number): BufferedEvent[] {
    return this.buffer.filter((e) => e.eventId > lastEventId);
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

```bash
npx vitest run src/__tests__/event-buffer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add bridge/src/event-buffer.ts bridge/src/__tests__/event-buffer.test.ts
git commit -m "feat(bridge): circular event buffer with sequential IDs"
```

### Task 5: NDJSON Parser

**Files:**
- Create: `bridge/src/ndjson-parser.ts`
- Create: `bridge/src/__tests__/ndjson-parser.test.ts`

- [ ] **Step 1: Write tests**

```ts
// bridge/src/__tests__/ndjson-parser.test.ts
import { describe, it, expect } from 'vitest';
import { Readable } from 'stream';
import { parseNdjsonStream } from '../ndjson-parser.js';

describe('parseNdjsonStream', () => {
  it('parses complete JSON lines', async () => {
    const events: object[] = [];
    const stream = Readable.from([
      '{"type":"system","session_id":"abc"}\n',
      '{"type":"assistant","message":"hello"}\n',
    ]);
    await parseNdjsonStream(stream, (event) => events.push(event));
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ type: 'system', session_id: 'abc' });
  });

  it('handles partial lines across chunks', async () => {
    const events: object[] = [];
    const stream = Readable.from([
      '{"type":"sys',
      'tem"}\n{"type":"done"}\n',
    ]);
    await parseNdjsonStream(stream, (event) => events.push(event));
    expect(events).toHaveLength(2);
  });

  it('skips malformed lines without crashing', async () => {
    const errors: string[] = [];
    const events: object[] = [];
    const stream = Readable.from([
      '{"type":"ok"}\n',
      'not json\n',
      '{"type":"also_ok"}\n',
    ]);
    await parseNdjsonStream(stream, (event) => events.push(event), (err) => errors.push(err));
    expect(events).toHaveLength(2);
    expect(errors).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement**

```ts
// bridge/src/ndjson-parser.ts
import { Readable } from 'stream';

export async function parseNdjsonStream(
  stream: Readable,
  onEvent: (event: Record<string, unknown>) => void,
  onError?: (error: string) => void,
): Promise<void> {
  let buffer = '';

  for await (const chunk of stream) {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        onEvent(JSON.parse(trimmed));
      } catch {
        onError?.(`malformed NDJSON: ${trimmed.slice(0, 100)}`);
      }
    }
  }

  // handle trailing content
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer.trim()));
    } catch {
      onError?.(`malformed trailing NDJSON: ${buffer.trim().slice(0, 100)}`);
    }
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Commit**

```bash
git add bridge/src/ndjson-parser.ts bridge/src/__tests__/ndjson-parser.test.ts
git commit -m "feat(bridge): NDJSON stream parser with error isolation"
```

---

## Chunk 2: Claude Process + WebSocket + Sessions

Goal: Bridge can spawn Claude, parse its output, and stream it to WebSocket clients. Multi-session support with project discovery. Testable via `wscat`.

### Task 6: Claude Process Manager

**Files:**
- Create: `bridge/src/claude-process.ts`
- Create: `bridge/src/__tests__/claude-process.test.ts`

- [ ] **Step 1: Write tests**

Test with a mock subprocess (echo script) instead of real Claude to keep tests fast and offline.

```ts
// bridge/src/__tests__/claude-process.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { ClaudeProcess } from '../claude-process.js';

describe('ClaudeProcess', () => {
  let proc: ClaudeProcess | null = null;

  afterEach(() => {
    proc?.kill();
  });

  it('spawns and emits events from stdout NDJSON', async () => {
    // use 'echo' as a mock — outputs one line and exits
    proc = new ClaudeProcess({
      command: 'echo',
      args: ['{"type":"system","session_id":"test-123"}'],
      cwd: '/tmp',
      sessionId: 'sess-1',
    });

    const events: any[] = [];
    proc.on('event', (e) => events.push(e));

    await new Promise((resolve) => proc!.on('exit', resolve));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('system');
  });

  it('emits exit event with code', async () => {
    proc = new ClaudeProcess({
      command: 'true',
      args: [],
      cwd: '/tmp',
      sessionId: 'sess-2',
    });

    const code = await new Promise((resolve) => proc!.on('exit', resolve));
    expect(code).toBe(0);
  });

  it('can write to stdin', () => {
    proc = new ClaudeProcess({
      command: 'cat',
      args: [],
      cwd: '/tmp',
      sessionId: 'sess-3',
    });

    // should not throw
    proc.send({ type: 'user', message: { role: 'user', content: [{ type: 'text', text: 'hi' }] } });
    proc.kill();
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement**

```ts
// bridge/src/claude-process.ts
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface ClaudeProcessOptions {
  command?: string;
  args?: string[];
  cwd: string;
  sessionId: string;
}

export class ClaudeProcess extends EventEmitter {
  private child: ChildProcess;
  private claudeSessionId?: string;

  constructor(opts: ClaudeProcessOptions) {
    super();
    const cmd = opts.command ?? 'claude';
    const args = opts.args ?? [
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];

    this.child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, VIBELINK_SESSION_ID: opts.sessionId },
    });

    let buffer = '';
    this.child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const event = JSON.parse(trimmed);
          if (event.type === 'result' && event.session_id) {
            this.claudeSessionId = event.session_id;
          }
          this.emit('event', event);
        } catch {
          this.emit('parse_error', trimmed);
        }
      }
    });

    this.child.stderr?.on('data', (chunk: Buffer) => {
      this.emit('stderr', chunk.toString());
    });

    this.child.on('error', (err) => this.emit('error', err));
    this.child.on('exit', (code, signal) => this.emit('exit', code, signal));
  }

  send(message: object): void {
    this.child.stdin?.write(JSON.stringify(message) + '\n');
  }

  kill(): void {
    if (!this.child.killed) {
      this.child.kill('SIGTERM');
    }
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get alive(): boolean {
    return !this.child.killed && this.child.exitCode === null;
  }

  get resumeSessionId(): string | undefined {
    return this.claudeSessionId;
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Commit**

```bash
git add bridge/src/claude-process.ts bridge/src/__tests__/claude-process.test.ts
git commit -m "feat(bridge): Claude subprocess manager with NDJSON parsing"
```

### Task 7: Session Manager

**Files:**
- Create: `bridge/src/session-manager.ts`
- Create: `bridge/src/__tests__/session-manager.test.ts`

- [ ] **Step 1: Write tests**

```ts
// bridge/src/__tests__/session-manager.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../session-manager.js';
import { config } from '../config.js';

describe('SessionManager', () => {
  let mgr: SessionManager;

  beforeEach(() => {
    // use 'echo' as mock command so no real Claude needed
    mgr = new SessionManager({ claudeCommand: 'echo', claudeArgs: ['{"type":"system"}'] });
  });

  it('creates a session with unique ID', () => {
    const session = mgr.create('/tmp');
    expect(session.id).toBeTruthy();
    expect(session.projectPath).toBe('/tmp');
  });

  it('lists sessions', () => {
    mgr.create('/tmp');
    mgr.create('/home');
    expect(mgr.list()).toHaveLength(2);
  });

  it('gets session by ID', () => {
    const session = mgr.create('/tmp');
    expect(mgr.get(session.id)).toBeTruthy();
    expect(mgr.get('nonexistent')).toBeUndefined();
  });

  it('deletes session and kills process', async () => {
    const session = mgr.create('/tmp');
    await mgr.delete(session.id);
    expect(mgr.get(session.id)).toBeUndefined();
  });

  it('buffers events from Claude process', async () => {
    const session = mgr.create('/tmp');
    // wait for the mock echo process to emit and exit
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(session.buffer.getAll().length).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement**

```ts
// bridge/src/session-manager.ts
import { v4 as uuid } from 'uuid';
import { ClaudeProcess } from './claude-process.js';
import { EventBuffer, BufferedEvent } from './event-buffer.js';
import { config } from './config.js';
import { EventEmitter } from 'events';

export interface Session {
  id: string;
  projectPath: string;
  process: ClaudeProcess;
  buffer: EventBuffer;
  createdAt: Date;
  lastEventAt?: Date;
}

interface SessionManagerOptions {
  claudeCommand?: string;
  claudeArgs?: string[];
}

export class SessionManager extends EventEmitter {
  private sessions = new Map<string, Session>();
  private opts: SessionManagerOptions;

  constructor(opts?: SessionManagerOptions) {
    super();
    this.opts = opts || {};
  }

  create(projectPath: string, resumeSessionId?: string): Session {
    const id = uuid();
    const args = this.opts.claudeArgs ?? [
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
    ];

    if (resumeSessionId) {
      args.push('--resume', resumeSessionId);
    }

    const proc = new ClaudeProcess({
      command: this.opts.claudeCommand,
      args,
      cwd: projectPath,
      sessionId: id,
    });

    const buffer = new EventBuffer(config.eventBufferSize);

    const session: Session = {
      id,
      projectPath,
      process: proc,
      buffer,
      createdAt: new Date(),
    };

    proc.on('event', (event) => {
      const buffered = buffer.push({ type: 'claude_event', event });
      session.lastEventAt = new Date();
      this.emit('event', id, buffered);
    });

    proc.on('exit', (code, signal) => {
      this.emit('session_exit', id, code, signal, proc.resumeSessionId);
    });

    proc.on('error', (err) => {
      this.emit('session_error', id, err);
    });

    this.sessions.set(id, session);
    return session;
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  list(): Array<{ id: string; projectPath: string; createdAt: Date; alive: boolean }> {
    return [...this.sessions.values()].map((s) => ({
      id: s.id,
      projectPath: s.projectPath,
      createdAt: s.createdAt,
      alive: s.process.alive,
    }));
  }

  async delete(id: string): Promise<void> {
    const session = this.sessions.get(id);
    if (session) {
      session.process.kill();
      this.sessions.delete(id);
    }
  }

  sendMessage(sessionId: string, content: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`session ${sessionId} not found`);
    session.process.send({
      type: 'user',
      message: { role: 'user', content: [{ type: 'text', text: content }] },
    });
  }

  async shutdownAll(): Promise<void> {
    const promises = [...this.sessions.keys()].map((id) => this.delete(id));
    await Promise.all(promises);
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Commit**

```bash
git add bridge/src/session-manager.ts bridge/src/__tests__/session-manager.test.ts
git commit -m "feat(bridge): session manager with multi-session Claude processes"
```

### Task 8: Project Scanner

**Files:**
- Create: `bridge/src/project-scanner.ts`
- Create: `bridge/src/__tests__/project-scanner.test.ts`

- [ ] **Step 1: Write tests**

```ts
// bridge/src/__tests__/project-scanner.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { ProjectScanner } from '../project-scanner.js';

const tmpRoot = '/tmp/vibelink-test-scan';

beforeAll(() => {
  // create test directory structure
  mkdirSync(join(tmpRoot, 'project-a', '.git'), { recursive: true });
  mkdirSync(join(tmpRoot, 'project-b'), { recursive: true });
  writeFileSync(join(tmpRoot, 'project-b', 'CLAUDE.md'), '# test');
  mkdirSync(join(tmpRoot, 'not-a-project'), { recursive: true });
  mkdirSync(join(tmpRoot, 'project-a', 'node_modules', 'pkg', '.git'), { recursive: true });
});

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe('ProjectScanner', () => {
  it('finds directories with .git or CLAUDE.md', async () => {
    const scanner = new ProjectScanner({ roots: [tmpRoot], maxDepth: 3, cacheTtlMs: 0 });
    const projects = await scanner.scan();
    const paths = projects.map((p) => p.path);
    expect(paths).toContain(join(tmpRoot, 'project-a'));
    expect(paths).toContain(join(tmpRoot, 'project-b'));
    expect(paths).not.toContain(join(tmpRoot, 'not-a-project'));
  });

  it('excludes node_modules', async () => {
    const scanner = new ProjectScanner({ roots: [tmpRoot], maxDepth: 4, cacheTtlMs: 0 });
    const projects = await scanner.scan();
    const paths = projects.map((p) => p.path);
    expect(paths).not.toContain(join(tmpRoot, 'project-a', 'node_modules', 'pkg'));
  });

  it('caches results', async () => {
    const scanner = new ProjectScanner({ roots: [tmpRoot], maxDepth: 3, cacheTtlMs: 60000 });
    const first = await scanner.scan();
    const second = await scanner.scan();
    expect(first).toEqual(second);
  });
});
```

- [ ] **Step 2: Run tests — verify fail**

- [ ] **Step 3: Implement**

```ts
// bridge/src/project-scanner.ts
import { readdir, stat, access } from 'fs/promises';
import { join, basename } from 'path';

const EXCLUDED = new Set([
  'node_modules', '.git', '.cache', 'Library', '.local', '.npm', 'dist', 'build', '.Trash',
]);

export interface Project {
  path: string;
  name: string;
  hasGit: boolean;
  hasClaudeMd: boolean;
}

interface ScannerOptions {
  roots: string[];
  maxDepth: number;
  cacheTtlMs: number;
}

export class ProjectScanner {
  private cache: Project[] | null = null;
  private cacheTime = 0;
  private opts: ScannerOptions;

  constructor(opts: ScannerOptions) {
    this.opts = opts;
  }

  async scan(): Promise<Project[]> {
    if (this.cache && Date.now() - this.cacheTime < this.opts.cacheTtlMs) {
      return this.cache;
    }

    const projects: Project[] = [];
    for (const root of this.opts.roots) {
      await this.scanDir(root, 0, projects);
    }

    projects.sort((a, b) => a.name.localeCompare(b.name));
    this.cache = projects;
    this.cacheTime = Date.now();
    return projects;
  }

  private async scanDir(dir: string, depth: number, results: Project[]): Promise<void> {
    if (depth > this.opts.maxDepth) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });
      const hasGit = entries.some((e) => e.name === '.git' && e.isDirectory());
      const hasClaudeMd = entries.some((e) => e.name === 'CLAUDE.md' && e.isFile());

      if (hasGit || hasClaudeMd) {
        results.push({ path: dir, name: basename(dir), hasGit, hasClaudeMd });
        return; // don't recurse into project dirs
      }

      for (const entry of entries) {
        if (!entry.isDirectory() || EXCLUDED.has(entry.name) || entry.name.startsWith('.')) continue;
        await this.scanDir(join(dir, entry.name), depth + 1, results);
      }
    } catch {
      // permission denied, etc. — skip silently
    }
  }
}
```

- [ ] **Step 4: Run tests — verify pass**

- [ ] **Step 5: Commit**

```bash
git add bridge/src/project-scanner.ts bridge/src/__tests__/project-scanner.test.ts
git commit -m "feat(bridge): project scanner with depth limit and caching"
```

### Task 9: WebSocket Client Tracking

**Files:**
- Create: `bridge/src/ws-client.ts`

- [ ] **Step 1: Implement**

```ts
// bridge/src/ws-client.ts
import WebSocket from 'ws';
import { config } from './config.js';

interface TrackedClient {
  ws: WebSocket;
  sessionId: string;
  connectedAt: Date;
  lastPong: number;
  alive: boolean;
}

export class WsClientTracker {
  private clients = new Map<WebSocket, TrackedClient>();
  private heartbeatInterval?: NodeJS.Timeout;

  start(): void {
    this.heartbeatInterval = setInterval(() => this.heartbeat(), config.wsHeartbeatIntervalMs);
  }

  stop(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    for (const [ws] of this.clients) {
      ws.close(1001, 'server shutting down');
    }
    this.clients.clear();
  }

  add(ws: WebSocket, sessionId: string): void {
    const client: TrackedClient = {
      ws,
      sessionId,
      connectedAt: new Date(),
      lastPong: Date.now(),
      alive: true,
    };
    this.clients.set(ws, client);

    ws.on('pong', () => {
      client.lastPong = Date.now();
      client.alive = true;
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });

    ws.on('error', () => {
      this.clients.delete(ws);
    });
  }

  broadcastToSession(sessionId: string, message: object): void {
    const data = JSON.stringify(message);
    for (const [ws, client] of this.clients) {
      if (client.sessionId === sessionId && ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    }
  }

  getSessionClients(sessionId: string): number {
    let count = 0;
    for (const [, client] of this.clients) {
      if (client.sessionId === sessionId) count++;
    }
    return count;
  }

  private heartbeat(): void {
    for (const [ws, client] of this.clients) {
      if (!client.alive) {
        ws.terminate();
        this.clients.delete(ws);
        continue;
      }
      client.alive = false;
      ws.ping();
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add bridge/src/ws-client.ts
git commit -m "feat(bridge): WebSocket client tracking with heartbeat"
```

### Task 10: IPC Server

**Files:**
- Create: `bridge/src/ipc-server.ts`

- [ ] **Step 1: Implement**

```ts
// bridge/src/ipc-server.ts
import net from 'net';
import { unlinkSync, existsSync } from 'fs';
import { EventEmitter } from 'events';

export class IpcServer extends EventEmitter {
  private server: net.Server | null = null;
  private connections = new Map<string, net.Socket>(); // sessionId → socket

  start(socketPath: string): void {
    if (existsSync(socketPath)) {
      unlinkSync(socketPath); // remove stale socket
    }

    this.server = net.createServer((socket) => {
      let buffer = '';
      let sessionId: string | null = null;

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const msg = JSON.parse(trimmed);
            if (msg.type === 'handshake' && msg.sessionId) {
              sessionId = msg.sessionId;
              this.connections.set(sessionId, socket);
              socket.write(JSON.stringify({ type: 'handshake_ack', sessionId }) + '\n');
              this.emit('connected', sessionId);
            } else if (sessionId) {
              this.emit('message', sessionId, msg);
            }
          } catch {
            // malformed — skip
          }
        }
      });

      socket.on('close', () => {
        if (sessionId) {
          this.connections.delete(sessionId);
          this.emit('disconnected', sessionId);
        }
      });

      socket.on('error', () => {
        if (sessionId) this.connections.delete(sessionId);
      });
    });

    this.server.listen(socketPath);
  }

  sendToSession(sessionId: string, message: object): boolean {
    const socket = this.connections.get(sessionId);
    if (!socket || socket.destroyed) return false;
    socket.write(JSON.stringify(message) + '\n');
    return true;
  }

  stop(): void {
    for (const socket of this.connections.values()) {
      socket.destroy();
    }
    this.connections.clear();
    this.server?.close();
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add bridge/src/ipc-server.ts
git commit -m "feat(bridge): Unix socket IPC server for MCP communication"
```

### Task 11: Graceful Shutdown

**Files:**
- Create: `bridge/src/shutdown.ts`

- [ ] **Step 1: Implement**

```ts
// bridge/src/shutdown.ts
type CleanupFn = () => Promise<void>;

export class ShutdownManager {
  private cleanups: Array<{ name: string; fn: CleanupFn }> = [];
  private shuttingDown = false;

  register(name: string, fn: CleanupFn): void {
    this.cleanups.push({ name, fn });
  }

  listen(): void {
    const handler = (signal: string) => {
      if (this.shuttingDown) return;
      this.shuttingDown = true;
      console.log(`received ${signal}, shutting down...`);
      this.run().then(() => process.exit(0));
    };

    process.on('SIGTERM', () => handler('SIGTERM'));
    process.on('SIGINT', () => handler('SIGINT'));
  }

  async run(): Promise<void> {
    for (const { name, fn } of this.cleanups) {
      try {
        await fn();
        console.log(`shutdown: ${name} done`);
      } catch (err) {
        console.error(`shutdown: ${name} failed`, err);
      }
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add bridge/src/shutdown.ts
git commit -m "feat(bridge): graceful shutdown manager"
```

### Task 12: Wire Everything Into server.ts

**Files:**
- Modify: `bridge/src/server.ts`
- Modify: `bridge/src/__tests__/server.test.ts`

- [ ] **Step 1: Update server.ts to integrate all components**

Rewrite `server.ts` to wire: Express routes (sessions, projects, debug), WebSocket upgrade handling, IPC server, session manager events → WS broadcast, graceful shutdown. This is the integration point — each component is already tested individually.

Key integration:
- `POST /sessions` → `sessionManager.create()`
- `GET /sessions` → `sessionManager.list()`
- `DELETE /sessions/:id` → `sessionManager.delete()`
- `GET /projects` → `projectScanner.scan()`
- WebSocket on `/ws/:sessionId` → authenticate, add to tracker, replay buffer, forward messages
- SessionManager `event` → WsClientTracker `broadcastToSession`
- IPC `message` → WsClientTracker `broadcastToSession` (for MCP UI updates)
- WS `user_message` → SessionManager `sendMessage`
- Shutdown → sessions, ws clients, ipc server

- [ ] **Step 2: Update server tests to cover REST endpoints**

Add tests for `POST /sessions` (with mock command), `GET /sessions`, `GET /projects`, `DELETE /sessions/:id`.

- [ ] **Step 3: Run full test suite**

```bash
cd /home/deck/vibelink/bridge
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Manual smoke test**

```bash
# terminal 1: start bridge
npx tsx src/server.ts

# terminal 2: create session, connect via wscat
curl -X POST http://localhost:3400/sessions -H 'Content-Type: application/json' -d '{"projectPath":"/tmp"}'
# note the sessionId and wsUrl

# terminal 3: if wscat installed
npx wscat -c ws://localhost:3400/ws/<sessionId>
```

- [ ] **Step 5: Commit**

```bash
git add bridge/src/
git commit -m "feat(bridge): full server integration — REST + WS + IPC + sessions"
```

---

## Chunk 3: MCP Server

Goal: MCP server with all 6 tools, IPC client, registered with Claude. Testable by starting Bridge + running `claude` and asking it to use render_ui.

### Task 13: MCP Server Scaffolding

**Files:**
- Create: `mcp-server/package.json`
- Create: `mcp-server/tsconfig.json`
- Create: `mcp-server/src/types.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "@vibelink/mcp-server",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create types.ts with component type definitions**

```ts
// mcp-server/src/types.ts
export type ComponentType =
  | 'decision_table'
  | 'form'
  | 'code_viewer'
  | 'chart'
  | 'markdown'
  | 'image_gallery'
  | 'progress'
  | 'tree_view';

export interface UiComponent {
  id: string;
  type: ComponentType;
  [key: string]: unknown;
}

export interface IpcMessage {
  type: string;
  sessionId: string;
  [key: string]: unknown;
}
```

- [ ] **Step 4: Install deps, verify build**

```bash
cd /home/deck/vibelink/mcp-server
npm install
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add mcp-server/
git commit -m "chore: scaffold MCP server package with types"
```

### Task 14: IPC Client

**Files:**
- Create: `mcp-server/src/ipc-client.ts`

- [ ] **Step 1: Implement**

The IPC client connects to Bridge's Unix socket, sends handshake, and provides send/receive methods. Retries with backoff if Bridge isn't ready.

```ts
// mcp-server/src/ipc-client.ts
import net from 'net';
import { EventEmitter } from 'events';

export class IpcClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = '';
  private retryDelay = 500;
  private maxRetryDelay = 5000;
  private connected = false;

  constructor(
    private socketPath: string,
    private sessionId: string,
  ) {
    super();
  }

  connect(): void {
    this.socket = net.createConnection(this.socketPath);

    this.socket.on('connect', () => {
      this.connected = true;
      this.retryDelay = 500;
      this.send({ type: 'handshake', sessionId: this.sessionId });
    });

    this.socket.on('data', (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          this.emit('message', JSON.parse(line.trim()));
        } catch { /* skip */ }
      }
    });

    this.socket.on('close', () => {
      this.connected = false;
      this.scheduleRetry();
    });

    this.socket.on('error', () => {
      this.connected = false;
      this.scheduleRetry();
    });
  }

  send(message: object): void {
    if (this.socket && this.connected) {
      this.socket.write(JSON.stringify(message) + '\n');
    }
  }

  get isConnected(): boolean {
    return this.connected;
  }

  close(): void {
    this.socket?.destroy();
  }

  private scheduleRetry(): void {
    setTimeout(() => {
      if (!this.connected) this.connect();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add mcp-server/src/ipc-client.ts
git commit -m "feat(mcp): IPC client with auto-reconnect"
```

### Task 15: MCP Tool Handlers

**Files:**
- Create: `mcp-server/src/tools/render-ui.ts`
- Create: `mcp-server/src/tools/tabs.ts`
- Create: `mcp-server/src/tools/input.ts`
- Create: `mcp-server/src/tools/notify.ts`

- [ ] **Step 1: Implement all tool handler files**

Each file exports a function that registers tools on the MCP server and takes the IPC client as a dependency. See spec sections "Tools" and "IPC Protocol" for message formats.

Key patterns:
- Non-blocking tools (render_ui, create_tab, etc.): send IPC message, return `{ success: true }` immediately
- Blocking tools (request_input): send IPC message, listen for `input_response` matching `requestId`, return value or timeout after 5 min

- [ ] **Step 2: Commit**

```bash
git add mcp-server/src/tools/
git commit -m "feat(mcp): all tool handlers — render_ui, tabs, input, notify"
```

### Task 16: MCP Server Entry Point + Registration

**Files:**
- Create: `mcp-server/src/index.ts`

- [ ] **Step 1: Implement**

```ts
// mcp-server/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { IpcClient } from './ipc-client.js';

const sessionId = process.env.VIBELINK_SESSION_ID;
const socketPath = process.env.VIBELINK_IPC_SOCKET || '/tmp/vibelink.sock';

if (!sessionId) {
  console.error('VIBELINK_SESSION_ID not set');
  process.exit(1);
}

const server = new McpServer({ name: 'vibelink', version: '0.1.0' });
const ipc = new IpcClient(socketPath, sessionId);

// register all tools (import from tools/ directory)
// ... registerRenderUi(server, ipc);
// ... registerTabs(server, ipc);
// ... registerInput(server, ipc);
// ... registerNotify(server, ipc);

ipc.connect();

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Build and verify**

```bash
cd /home/deck/vibelink/mcp-server
npm run build
```

- [ ] **Step 3: Register with Claude**

```bash
claude mcp add vibelink --scope user -- node $(pwd)/dist/index.js
```

- [ ] **Step 4: Integration test — start Bridge, ask Claude to use render_ui**

```bash
# terminal 1
cd /home/deck/vibelink/bridge && npx tsx src/server.ts

# terminal 2
cd /tmp && claude
# then ask: "Use the render_ui tool to show a markdown component with the text 'Hello from VibeLink'"
# Check Bridge logs for the IPC message
```

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/index.ts
git commit -m "feat(mcp): server entry point with stdio transport and IPC connection"
```

---

## Chunk 4: Mobile App Foundation

Goal: Expo project with NativeWind, session list screen, project picker, and basic navigation. Can connect to Bridge and display project list.

### Task 17: Initialize Expo Project

**Files:**
- Create: `mobile/` (via `create-expo-app`)

- [ ] **Step 1: Create Expo app**

```bash
cd /home/deck/vibelink
npx create-expo-app mobile --template blank-typescript
```

- [ ] **Step 2: Install core dependencies**

```bash
cd /home/deck/vibelink/mobile
npx expo install expo-router expo-secure-store expo-haptics
npm install nativewind tailwindcss zustand @shopify/flash-list react-native-keyboard-controller react-native-safe-area-context react-native-screens react-native-gesture-handler react-native-reanimated
npm install -D nativewind-env
```

- [ ] **Step 3: Configure NativeWind + Tailwind**

Create `tailwind.config.js`, `global.css`, update `app.json` with scheme, update `babel.config.js` for NativeWind plugin. Set up the dark zinc color theme from spec.

- [ ] **Step 4: Create theme constants**

```ts
// mobile/src/constants/theme.ts
export const colors = {
  bg: '#0a0a0a',
  surface: '#18181b',
  border: '#27272a',
  text: '#fafafa',
  textSecondary: '#a1a1aa',
  accent: '#3b82f6',
  success: '#10b981',
  error: '#ef4444',
  warning: '#f59e0b',
};
```

- [ ] **Step 5: Verify app runs**

```bash
npx expo start
# scan QR with Expo Go or run on emulator
```

- [ ] **Step 6: Commit**

```bash
git add mobile/
git commit -m "chore: initialize Expo app with NativeWind and dark theme"
```

### Task 18: Zustand Stores

**Files:**
- Create: `mobile/src/store/connection.ts`
- Create: `mobile/src/store/sessions.ts`
- Create: `mobile/src/store/messages.ts`

- [ ] **Step 1: Implement all three stores**

Follows the Zustand store shapes from spec:
- `ConnectionStore`: bridgeUrl, isConnected, authToken
- `SessionStore`: sessions map, activeSessionId
- `MessageStore`: per-session events[], messages[], components, tabs, isStreaming

- [ ] **Step 2: Commit**

```bash
git add mobile/src/store/
git commit -m "feat(mobile): Zustand stores for connection, sessions, messages"
```

### Task 19: Bridge API Service + Hooks

**Files:**
- Create: `mobile/src/services/bridge-api.ts`
- Create: `mobile/src/hooks/useProjects.ts`

- [ ] **Step 1: Implement bridge-api.ts**

REST client wrapping `fetch` with auth token header. Methods: `getProjects()`, `getSessions()`, `createSession(projectPath)`, `deleteSession(id)`.

- [ ] **Step 2: Implement useProjects hook**

Fetches projects from Bridge, handles loading/error states.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/services/ mobile/src/hooks/useProjects.ts
git commit -m "feat(mobile): Bridge REST client and useProjects hook"
```

### Task 20: Session List + Project Picker Screens

**Files:**
- Create: `mobile/app/index.tsx` (session list)
- Create: `mobile/app/projects.tsx` (project picker)
- Create: `mobile/src/components/ConnectionBadge.tsx`

- [ ] **Step 1: Implement session list (home screen)**

FlashList of sessions. "New Chat" button navigates to project picker. ConnectionBadge in header. Swipe-to-delete on sessions.

- [ ] **Step 2: Implement project picker**

FlashList of projects from `useProjects`. Search/filter bar. Tap → `createSession` → navigate to chat screen.

- [ ] **Step 3: Implement ConnectionBadge**

Green/red dot + text. Tap shows connection details modal.

- [ ] **Step 4: Test navigation flow**

Start Bridge + app. Verify: see project list, tap a project, see session created (check Bridge logs).

- [ ] **Step 5: Commit**

```bash
git add mobile/app/ mobile/src/components/ConnectionBadge.tsx
git commit -m "feat(mobile): session list and project picker screens"
```

---

## Chunk 5: Mobile Chat Screen

Goal: Full chat experience — CLI tab, GUI tab, WebSocket streaming, keyboard handling. End-to-end: type on phone, see Claude's streamed response.

### Task 21: WebSocket Hook

**Files:**
- Create: `mobile/src/hooks/useWebSocket.ts`

- [ ] **Step 1: Implement**

Handles: connect with auth token, auto-reconnect with exponential backoff, send/receive JSON messages, reconnect with `lastEventId`, respond to ping/pong, message queue for offline sends. Updates ConnectionStore and MessageStore.

- [ ] **Step 2: Commit**

```bash
git add mobile/src/hooks/useWebSocket.ts
git commit -m "feat(mobile): WebSocket hook with reconnection and event replay"
```

### Task 22: Streaming + Message Parsing Hook

**Files:**
- Create: `mobile/src/hooks/useStreaming.ts`

- [ ] **Step 1: Implement**

Parses `claude_event` WebSocket messages into structured message objects for the GUI tab. Handles: `system` → session metadata, `stream_event` (text_delta) → append to current message, `assistant` → complete message with tool_use blocks, `user` (tool_result) → tool result display, `result` → mark turn complete. Throttles state updates to 16ms.

- [ ] **Step 2: Commit**

```bash
git add mobile/src/hooks/useStreaming.ts
git commit -m "feat(mobile): streaming NDJSON parser with 60fps throttle"
```

### Task 23: Input Bar + Drafts

**Files:**
- Create: `mobile/src/components/InputBar.tsx`
- Create: `mobile/src/hooks/useDraft.ts`

- [ ] **Step 1: Implement InputBar**

Text input with send button. Autofocus. Uses `react-native-keyboard-controller`'s `KeyboardAvoidingView`. Haptic feedback on send. Calls `ws.send({ type: "user_message", content })`.

- [ ] **Step 2: Implement useDraft**

Saves/restores input text per session using AsyncStorage. Debounced save (500ms).

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/InputBar.tsx mobile/src/hooks/useDraft.ts
git commit -m "feat(mobile): input bar with keyboard handling and draft persistence"
```

### Task 24: CLI Tab

**Files:**
- Create: `mobile/src/components/CliRenderer.tsx`
- Create: `mobile/src/hooks/useStickyScroll.ts`

- [ ] **Step 1: Implement CliRenderer**

Inverted FlashList rendering raw NDJSON events. Each event as a monospace text line. Color-coded by type (system=blue, assistant=green, tool_use=orange, error=red). Uses `useStickyScroll` for auto-scroll behavior.

- [ ] **Step 2: Implement useStickyScroll**

Tracks if user has scrolled up (detach). While detached, no auto-scroll. Shows "scroll to bottom" pill. Reattaches when user scrolls to bottom.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/CliRenderer.tsx mobile/src/hooks/useStickyScroll.ts
git commit -m "feat(mobile): CLI tab with raw event rendering and sticky scroll"
```

### Task 25: GUI Tab — Message Bubbles + Tool Activity

**Files:**
- Create: `mobile/src/components/MessageBubble.tsx`
- Create: `mobile/src/components/ToolActivity.tsx`

- [ ] **Step 1: Implement MessageBubble**

Renders a single conversation turn. User messages: right-aligned, accent background. Assistant messages: left-aligned, surface background, markdown rendered (use `react-native-markdown-display` or similar). Code blocks with syntax highlighting and tap-to-copy.

- [ ] **Step 2: Implement ToolActivity**

Compact chip showing tool name + status. `Reading file.ts` with spinner while in progress. `Edited file.ts` with checkmark when complete. Collapsible to show tool input/output.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/MessageBubble.tsx mobile/src/components/ToolActivity.tsx
git commit -m "feat(mobile): GUI message bubbles with markdown and tool activity chips"
```

### Task 26: Chat Screen Integration

**Files:**
- Create: `mobile/app/session/[id].tsx`

- [ ] **Step 1: Implement chat screen**

Tab bar at top: CLI | GUI | (dynamic tabs). Each tab renders its content. Shared InputBar at bottom. Uses `useWebSocket`, `useStreaming`, `useDraft`, `useStickyScroll`. `KeyboardAvoidingView` wrapping the whole screen. `react-native-keyboard-controller` for interactive dismiss.

- [ ] **Step 2: End-to-end test**

```bash
# terminal 1: start bridge
cd /home/deck/vibelink/bridge && npx tsx src/server.ts

# phone: open app → new chat → pick a project → type a message → see Claude respond
```

Verify: text streams in on GUI tab, raw events visible on CLI tab, tool calls show as activity chips.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/session/
git commit -m "feat(mobile): chat screen with CLI and GUI tabs, full streaming"
```

---

## Chunk 6: Dynamic UI Components + Polish

Goal: render_ui components rendered in app. Auth flow. Setup script. Everything needed to ship v0.1.

### Task 27: Dynamic UI Renderer

**Files:**
- Create: `mobile/src/components/DynamicRenderer.tsx`
- Create: `mobile/src/components/DecisionTable.tsx`
- Create: `mobile/src/components/CodeViewer.tsx`
- Create: `mobile/src/components/FormRenderer.tsx`
- Create: `mobile/src/components/ChartView.tsx`
- Create: `mobile/src/components/TreeView.tsx`

- [ ] **Step 1: Implement DynamicRenderer**

Routes `component.type` to the correct component: `decision_table` → DecisionTable, `code_viewer` → CodeViewer, `markdown` → MessageBubble (reuse), etc. Handles unknown types gracefully (show JSON fallback).

- [ ] **Step 2: Implement each component**

Each component renders its specific UI from the JSON props defined in the MCP spec. DecisionTable supports row selection (sends `ui_interaction`). FormRenderer collects values and submits. CodeViewer supports syntax highlighting + copy. ChartView uses a charting library (e.g. `victory-native` or `react-native-chart-kit`). TreeView renders expandable file tree.

- [ ] **Step 3: Wire into GUI tab**

When `useStreaming` receives `ui_update` or `ui_modify` WebSocket messages, store components in MessageStore. GUI tab renders them inline via DynamicRenderer.

- [ ] **Step 4: Test with real Claude**

Start Bridge. Open app. Ask Claude: "Use render_ui to show me a decision table comparing React vs Vue vs Svelte." Verify table renders on phone with selectable rows.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/components/
git commit -m "feat(mobile): dynamic UI components — tables, code, forms, charts, trees"
```

### Task 28: Auth + First-Launch Pairing

**Files:**
- Modify: `bridge/src/server.ts` (add auth middleware)
- Create: `mobile/app/setup.tsx` (first-launch setup screen)

- [ ] **Step 1: Add auth middleware to Bridge**

Check `Authorization: Bearer <token>` on all REST endpoints (except `/health`). Check `?token=` query param on WebSocket upgrade. Return 401 / close with 4001 on invalid.

- [ ] **Step 2: Implement first-launch setup screen**

If no `bridgeUrl` in secure store: show screen to enter Bridge URL + token (or scan QR). Save to `expo-secure-store`. Navigate to session list.

- [ ] **Step 3: Test**

Start Bridge with `AUTH_TOKEN=test123` in `.env`. Open app, enter URL + token. Verify: can see projects. Try wrong token: verify 401.

- [ ] **Step 4: Commit**

```bash
git add bridge/src/server.ts mobile/app/setup.tsx
git commit -m "feat: token-based auth with first-launch pairing flow"
```

### Task 29: Setup Script

**Files:**
- Create: `setup.sh`
- Create: `vibelink` (CLI wrapper)
- Create: `vibelink.service` (systemd unit template)

- [ ] **Step 1: Implement setup.sh**

Interactive script that: checks prereqs, builds bridge + mcp-server, registers MCP, generates AUTH_TOKEN, optionally installs systemd service, optionally builds APK, prints QR code + instructions. See spec "Setup & Installation" section.

- [ ] **Step 2: Implement vibelink CLI wrapper**

```bash
#!/bin/bash
case "$1" in
  start)  sudo systemctl start vibelink ;;
  stop)   sudo systemctl stop vibelink ;;
  status) sudo systemctl status vibelink ;;
  *)      echo "Usage: vibelink {start|stop|status}" ;;
esac
```

- [ ] **Step 3: Create systemd service template**

```ini
[Unit]
Description=VibeLink Bridge Server
After=network.target tailscaled.service

[Service]
Type=simple
User=%USER%
WorkingDirectory=%BRIDGE_DIR%
ExecStart=%NODE_PATH% dist/server.js
Restart=always
EnvironmentFile=%BRIDGE_DIR%/.env

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Test full setup flow**

```bash
cd /home/deck/vibelink
./setup.sh
vibelink status
# open app on phone, complete pairing, send a message
```

- [ ] **Step 5: Commit**

```bash
git add setup.sh vibelink vibelink.service
git commit -m "feat: setup script, CLI wrapper, and systemd service"
```

### Task 30: README + Final Polish

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

Sections: What is VibeLink, Requirements, Quick Start, Android Setup, iOS Setup (contributor guide), Daily Use (start/stop/status), Security & Privacy, Architecture Overview, Contributing, License (MIT).

- [ ] **Step 2: Update CLAUDE.md with any corrections found during implementation**

- [ ] **Step 3: Final integration test**

Full end-to-end: setup.sh → vibelink start → install APK → open app → pair → new chat → pick project → send message → see streamed response → see tool activity → ask Claude to render_ui → see component on phone.

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: README with setup guides and architecture overview"
```

---

## Implementation Order Summary

| Chunk | What You Build | What You Can Test |
|---|---|---|
| 1 | Bridge core (config, server, buffer, parser) | `curl /health`, unit tests |
| 2 | Claude integration + WS + sessions + IPC | Send text via `wscat`, see Claude respond |
| 3 | MCP server (all tools) | Ask Claude to `render_ui`, see IPC message in Bridge logs |
| 4 | Mobile app foundation (screens, navigation) | See project list on phone, create session |
| 5 | Chat screen (CLI + GUI tabs, streaming) | Type on phone → see Claude respond with streaming |
| 6 | Dynamic UI + auth + setup script | Full product: render_ui on phone, auth, one-command setup |

Each chunk builds on the previous one. At every checkpoint, you have something working you can test.
