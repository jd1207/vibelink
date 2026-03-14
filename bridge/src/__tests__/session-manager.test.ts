import { describe, it, expect, afterEach } from "vitest";
import { SessionManager } from "../session-manager.js";
import os from "os";

const cwd = os.tmpdir();

// use 'cat' as the mock claude process — stays alive until killed
const mockOpts = { claudeCommand: "cat", claudeArgs: [] };

let manager: SessionManager;

afterEach(() => {
  manager?.shutdownAll();
});

describe("SessionManager", () => {
  it("create returns a session with id and projectPath", () => {
    manager = new SessionManager(mockOpts);
    const session = manager.create(cwd);
    expect(typeof session.id).toBe("string");
    expect(session.projectPath).toBe(cwd);
    expect(session.process.alive).toBe(true);
    expect(session.buffer).toBeDefined();
  });

  it("get returns the session by id", () => {
    manager = new SessionManager(mockOpts);
    const session = manager.create(cwd);
    const found = manager.get(session.id);
    expect(found).toBeDefined();
    expect(found!.id).toBe(session.id);
  });

  it("get returns undefined for unknown id", () => {
    manager = new SessionManager(mockOpts);
    expect(manager.get("nonexistent")).toBeUndefined();
  });

  it("list returns all sessions with alive status", () => {
    manager = new SessionManager(mockOpts);
    const s1 = manager.create(cwd);
    const s2 = manager.create(cwd);
    const items = manager.list();
    expect(items).toHaveLength(2);
    const ids = items.map((i) => i.id);
    expect(ids).toContain(s1.id);
    expect(ids).toContain(s2.id);
    for (const item of items) {
      expect(item.alive).toBe(true);
      expect(typeof item.projectPath).toBe("string");
      expect(item.createdAt).toBeInstanceOf(Date);
    }
  });

  it("delete kills process and removes from map", async () => {
    manager = new SessionManager(mockOpts);
    const session = manager.create(cwd);
    const id = session.id;

    const exitPromise = new Promise<void>((resolve) => {
      session.process.once("exit", () => resolve());
    });

    manager.delete(id);
    await exitPromise;

    expect(manager.get(id)).toBeUndefined();
    expect(manager.list()).toHaveLength(0);
  });

  it("emits event with sessionId and buffered event when process outputs json", async () => {
    manager = new SessionManager({
      claudeCommand: "echo",
      claudeArgs: ['{"type":"ping"}'],
    });

    const session = manager.create(cwd);

    const emitted = await new Promise<[string, unknown]>((resolve) => {
      manager.once("event", (sessionId, bufferedEvent) => resolve([sessionId, bufferedEvent]));
    });

    expect(emitted[0]).toBe(session.id);
    const buffered = emitted[1] as { eventId: number; payload: unknown };
    expect(buffered.eventId).toBe(1);
    expect(buffered.payload).toEqual({ type: "ping" });
  });

  it("emits session_exit when process exits", async () => {
    manager = new SessionManager({
      claudeCommand: "true",
      claudeArgs: [],
    });

    const session = manager.create(cwd);

    const [exitedId, code] = await new Promise<[string, number | null]>((resolve) => {
      manager.once("session_exit", (id, c) => resolve([id, c]));
    });

    expect(exitedId).toBe(session.id);
    expect(code).toBe(0);
  });

  it("sendMessage does not throw for active session", () => {
    manager = new SessionManager(mockOpts);
    const session = manager.create(cwd);
    expect(() => manager.sendMessage(session.id, "hello world")).not.toThrow();
  });

  it("shutdownAll kills all sessions", async () => {
    manager = new SessionManager(mockOpts);
    const s1 = manager.create(cwd);
    const s2 = manager.create(cwd);

    const exits = Promise.all([
      new Promise<void>((r) => s1.process.once("exit", () => r())),
      new Promise<void>((r) => s2.process.once("exit", () => r())),
    ]);

    manager.shutdownAll();
    await exits;

    expect(manager.list()).toHaveLength(0);
  });
});
