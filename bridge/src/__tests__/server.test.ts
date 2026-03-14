import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createApp } from "../server.js";
import type { AddressInfo } from "net";
import { mkdtemp, rm } from "fs/promises";
import os from "os";
import path from "path";

let closeApp: (() => Promise<void>) | undefined;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "vibelink-server-"));
});

afterEach(async () => {
  if (closeApp) {
    await closeApp();
    closeApp = undefined;
  }
  await rm(tmpDir, { recursive: true, force: true });
});

// use 'cat' so sessions stay alive; no claude required
const mockAppOptions = {
  port: 0 as number,
  claudeCommand: "cat",
  claudeArgs: [] as string[],
};

async function startApp(extraOpts: Record<string, unknown> = {}): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const opts = { ...mockAppOptions, ...extraOpts };
  const { app, close } = await createApp(opts);
  closeApp = close;
  const { port } = app.address() as AddressInfo;
  return { baseUrl: `http://localhost:${port}`, close };
}

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const { baseUrl } = await startApp();
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });
});

describe("GET /debug", () => {
  it("returns sessions array and uptime string", async () => {
    const { baseUrl } = await startApp();
    const res = await fetch(`${baseUrl}/debug`);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(typeof body.uptime).toBe("string");
    expect((body.uptime as string).endsWith("s")).toBe(true);
  });

  it("returns ipcConnected boolean", async () => {
    const { baseUrl } = await startApp();
    const res = await fetch(`${baseUrl}/debug`);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.ipcConnected).toBe("boolean");
  });
});

describe("GET /projects", () => {
  it("returns array of projects from scan roots", async () => {
    const { baseUrl } = await startApp({ scanRoots: [tmpDir] });
    const res = await fetch(`${baseUrl}/projects`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe("GET /sessions", () => {
  it("returns empty array when no sessions exist", async () => {
    const { baseUrl } = await startApp();
    const res = await fetch(`${baseUrl}/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(0);
  });
});

describe("POST /sessions", () => {
  it("creates a session and returns sessionId and wsUrl", async () => {
    const { baseUrl } = await startApp();
    const res = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath: tmpDir }),
    });
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(typeof body.sessionId).toBe("string");
    expect(typeof body.wsUrl).toBe("string");
    expect((body.wsUrl as string).startsWith("ws://")).toBe(true);
  });

  it("returns 400 when projectPath is missing", async () => {
    const { baseUrl } = await startApp();
    const res = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("session appears in GET /sessions after creation", async () => {
    const { baseUrl } = await startApp();
    await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath: tmpDir }),
    });
    const listRes = await fetch(`${baseUrl}/sessions`);
    const sessions = await listRes.json() as Array<{ id: string; projectPath: string }>;
    expect(sessions).toHaveLength(1);
    expect(sessions[0].projectPath).toBe(tmpDir);
  });
});

describe("DELETE /sessions/:id", () => {
  it("returns 204 and removes the session", async () => {
    const { baseUrl } = await startApp();
    const createRes = await fetch(`${baseUrl}/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectPath: tmpDir }),
    });
    const { sessionId } = await createRes.json() as { sessionId: string };

    const delRes = await fetch(`${baseUrl}/sessions/${sessionId}`, { method: "DELETE" });
    expect(delRes.status).toBe(204);

    const listRes = await fetch(`${baseUrl}/sessions`);
    const sessions = await listRes.json() as unknown[];
    expect(sessions).toHaveLength(0);
  });
});
