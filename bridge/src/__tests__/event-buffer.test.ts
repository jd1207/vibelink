import { describe, it, expect } from "vitest";
import { EventBuffer } from "../event-buffer.js";

describe("EventBuffer", () => {
  it("assigns sequential event ids starting at 1", () => {
    const buf = new EventBuffer(10);
    const a = buf.push({ type: "test", data: "a" });
    const b = buf.push({ type: "test", data: "b" });
    expect(a.eventId).toBe(1);
    expect(b.eventId).toBe(2);
  });

  it("getAll returns a copy of all buffered events", () => {
    const buf = new EventBuffer(10);
    buf.push({ type: "x" });
    buf.push({ type: "y" });
    const all = buf.getAll();
    expect(all).toHaveLength(2);
    // modifying the returned array doesn't affect the buffer
    all.pop();
    expect(buf.getAll()).toHaveLength(2);
  });

  it("drops oldest event when maxSize is exceeded", () => {
    const buf = new EventBuffer(3);
    buf.push({ type: "a" });
    buf.push({ type: "b" });
    buf.push({ type: "c" });
    buf.push({ type: "d" }); // drops "a"
    const all = buf.getAll();
    expect(all).toHaveLength(3);
    expect(all[0].payload.type).toBe("b");
    expect(all[2].payload.type).toBe("d");
  });

  it("getAfter returns only events with eventId greater than lastEventId", () => {
    const buf = new EventBuffer(10);
    buf.push({ type: "a" }); // id 1
    buf.push({ type: "b" }); // id 2
    buf.push({ type: "c" }); // id 3
    const after = buf.getAfter(1);
    expect(after).toHaveLength(2);
    expect(after[0].eventId).toBe(2);
    expect(after[1].eventId).toBe(3);
  });

  it("getAfter with lastEventId 0 returns all events", () => {
    const buf = new EventBuffer(10);
    buf.push({ type: "a" });
    buf.push({ type: "b" });
    expect(buf.getAfter(0)).toHaveLength(2);
  });

  it("getAfter returns empty array when no events are newer", () => {
    const buf = new EventBuffer(10);
    buf.push({ type: "a" }); // id 1
    expect(buf.getAfter(1)).toHaveLength(0);
    expect(buf.getAfter(999)).toHaveLength(0);
  });

  it("getAfter on empty buffer returns empty array", () => {
    const buf = new EventBuffer(10);
    expect(buf.getAfter(0)).toHaveLength(0);
  });
});
