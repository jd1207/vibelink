import { describe, it, expect, vi } from "vitest";
import { Readable } from "stream";
import { parseNdjsonStream } from "../ndjson-parser.js";

function makeStream(chunks: string[]): Readable {
  const stream = new Readable({ read() {} });
  for (const chunk of chunks) {
    stream.push(chunk);
  }
  stream.push(null);
  return stream;
}

async function collect(
  stream: Readable
): Promise<{ events: unknown[]; errors: Error[] }> {
  const events: unknown[] = [];
  const errors: Error[] = [];
  await parseNdjsonStream(
    stream,
    (event) => events.push(event),
    (err) => errors.push(err)
  );
  return { events, errors };
}

describe("parseNdjsonStream", () => {
  it("parses complete newline-delimited json lines", async () => {
    const stream = makeStream(['{"a":1}\n{"b":2}\n']);
    const { events } = await collect(stream);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ a: 1 });
    expect(events[1]).toEqual({ b: 2 });
  });

  it("handles partial lines split across chunks", async () => {
    const stream = makeStream(['{"a":', "1}\n"]);
    const { events } = await collect(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ a: 1 });
  });

  it("handles multiple lines in a single chunk", async () => {
    const stream = makeStream(['{"x":1}\n{"y":2}\n{"z":3}\n']);
    const { events } = await collect(stream);
    expect(events).toHaveLength(3);
  });

  it("skips malformed lines and calls onError without crashing", async () => {
    const stream = makeStream(["not-json\n", '{"ok":true}\n']);
    const { events, errors } = await collect(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ ok: true });
    expect(errors).toHaveLength(1);
  });

  it("handles a final line with no trailing newline", async () => {
    const stream = makeStream(['{"a":1}']);
    const { events } = await collect(stream);
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ a: 1 });
  });

  it("works without an onError callback when lines are malformed", async () => {
    const stream = makeStream(["bad\n", '{"good":1}\n']);
    const events: unknown[] = [];
    // no error callback — should not throw
    await expect(
      parseNdjsonStream(stream, (e) => events.push(e))
    ).resolves.toBeUndefined();
    expect(events).toHaveLength(1);
  });
});
