import { describe, it, expect, beforeEach, afterEach } from "vitest";
import net from "net";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { IpcClient } from "../ipc-client.js";

async function createTestServer(socketPath: string): Promise<{
  server: net.Server;
  received: unknown[];
  sendToClient: (msg: unknown) => void;
  close: () => Promise<void>;
}> {
  const received: unknown[] = [];
  let clientSocket: net.Socket | null = null;

  const server = net.createServer((socket) => {
    clientSocket = socket;
    let buffer = "";
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          received.push(JSON.parse(trimmed));
        } catch {
          // skip
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(socketPath, resolve);
    server.once("error", reject);
  });

  return {
    server,
    received,
    sendToClient: (msg: unknown) => {
      clientSocket?.write(JSON.stringify(msg) + "\n");
    },
    close: () =>
      new Promise<void>((resolve) => {
        clientSocket?.destroy();
        server.close(() => resolve());
      }),
  };
}

describe("IpcClient", () => {
  let tmpDir: string;
  let socketPath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "vibelink-test-"));
    socketPath = join(tmpDir, "test.sock");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("sends handshake on connect", async () => {
    const { received, close } = await createTestServer(socketPath);
    const client = new IpcClient(socketPath, "sess-abc");

    client.connect();
    // wait for handshake to arrive
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ type: "handshake", sessionId: "sess-abc" });

    client.close();
    await close();
  });

  it("isConnected returns true after connect, false after close", async () => {
    const { close } = await createTestServer(socketPath);
    const client = new IpcClient(socketPath, "sess-1");

    client.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    expect(client.isConnected).toBe(true);

    client.close();
    expect(client.isConnected).toBe(false);

    await close();
  });

  it("send writes json+newline to socket", async () => {
    const { received, close } = await createTestServer(socketPath);
    const client = new IpcClient(socketPath, "sess-2");

    client.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    client.send({ type: "ui_update", sessionId: "sess-2", component: { id: "c1" } });
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(received).toContainEqual({ type: "ui_update", sessionId: "sess-2", component: { id: "c1" } });

    client.close();
    await close();
  });

  it("emits message events for data received from server", async () => {
    const { sendToClient, close } = await createTestServer(socketPath);
    const client = new IpcClient(socketPath, "sess-3");
    const messages: unknown[] = [];

    client.on("message", (msg) => messages.push(msg));
    client.connect();
    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    sendToClient({ type: "input_response", requestId: "req-1", value: "hello" });
    await new Promise<void>((resolve) => setTimeout(resolve, 50));

    expect(messages).toContainEqual({ type: "input_response", requestId: "req-1", value: "hello" });

    client.close();
    await close();
  });

  it("handles partial ndjson lines split across chunks", async () => {
    const messages: unknown[] = [];
    const ref = { socket: null as net.Socket | null };
    const server = net.createServer((socket: net.Socket) => {
      ref.socket = socket;
      // send a message split into two chunks
      socket.write('{"type":"han');
      setTimeout(() => socket.write('dshake_ack"}\n'), 20);
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(socketPath, resolve);
      server.once("error", reject);
    });

    const client = new IpcClient(socketPath, "sess-4");
    client.on("message", (msg) => messages.push(msg));
    client.connect();

    await new Promise<void>((resolve) => setTimeout(resolve, 150));

    expect(messages).toContainEqual({ type: "handshake_ack" });

    client.close();
    ref.socket?.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("send is a no-op when not connected", () => {
    const client = new IpcClient(socketPath, "sess-5");
    // never connected — should not throw
    expect(() => client.send({ type: "test" })).not.toThrow();
  });

  it("skips malformed json lines without crashing", async () => {
    const messages: unknown[] = [];
    const ref = { socket: null as net.Socket | null };
    const server = net.createServer((socket: net.Socket) => {
      ref.socket = socket;
      socket.write("not-json\n");
      socket.write('{"type":"ok"}\n');
    });

    await new Promise<void>((resolve, reject) => {
      server.listen(socketPath, resolve);
      server.once("error", reject);
    });

    const client = new IpcClient(socketPath, "sess-6");
    client.on("message", (msg) => messages.push(msg));
    client.connect();

    await new Promise<void>((resolve) => setTimeout(resolve, 100));

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({ type: "ok" });

    client.close();
    ref.socket?.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
});
