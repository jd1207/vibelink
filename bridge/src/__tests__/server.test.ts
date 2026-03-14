import { describe, it, expect, afterEach } from "vitest";
import { createApp } from "../server.js";
import type { AddressInfo } from "net";

let closeApp: (() => Promise<void>) | undefined;

afterEach(async () => {
  if (closeApp) {
    await closeApp();
    closeApp = undefined;
  }
});

async function startApp(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const { app, close } = await createApp({ port: 0 });
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
