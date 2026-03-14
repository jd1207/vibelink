import { describe, it, expect } from "vitest";
import { ClaudeProcess } from "../claude-process.js";
import os from "os";

const cwd = os.tmpdir();

describe("ClaudeProcess", () => {
  it("emits exit event when process finishes", async () => {
    const proc = new ClaudeProcess({
      command: "true",
      args: [],
      cwd,
      sessionId: "test-session-1",
    });

    const [code] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) => {
      proc.once("exit", (c, s) => resolve([c, s]));
    });

    expect(code).toBe(0);
    expect(proc.alive).toBe(false);
  });

  it("emits events from stdout as parsed json objects", async () => {
    const proc = new ClaudeProcess({
      command: "echo",
      args: ['{"type":"test","value":42}'],
      cwd,
      sessionId: "test-session-2",
    });

    const events: unknown[] = [];
    proc.on("event", (e) => events.push(e));

    await new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ type: "test", value: 42 });
  });

  it("tracks resumeSessionId from result events", async () => {
    const proc = new ClaudeProcess({
      command: "echo",
      args: ['{"type":"result","session_id":"abc-123"}'],
      cwd,
      sessionId: "test-session-3",
    });

    await new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
    });

    expect(proc.resumeSessionId).toBe("abc-123");
  });

  it("send() writes to stdin without throwing for alive process", async () => {
    const proc = new ClaudeProcess({
      command: "cat",
      args: [],
      cwd,
      sessionId: "test-session-4",
    });

    expect(() => proc.send({ type: "user", content: "hello" })).not.toThrow();
    proc.kill();

    await new Promise<void>((resolve) => {
      proc.once("exit", () => resolve());
    });

    expect(proc.alive).toBe(false);
  });

  it("emits error for invalid command", async () => {
    const proc = new ClaudeProcess({
      command: "this-command-does-not-exist-vibelink-test",
      args: [],
      cwd,
      sessionId: "test-session-5",
    });

    const err = await new Promise<Error>((resolve) => {
      proc.once("error", resolve);
    });

    expect(err).toBeInstanceOf(Error);
    expect(proc.alive).toBe(false);
  });

  it("has a pid while alive", () => {
    const proc = new ClaudeProcess({
      command: "cat",
      args: [],
      cwd,
      sessionId: "test-session-6",
    });

    expect(typeof proc.pid).toBe("number");
    proc.kill();
  });
});
