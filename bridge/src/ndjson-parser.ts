import type { Readable } from "stream";

type EventCallback = (event: unknown) => void;
type ErrorCallback = (err: Error) => void;

export function parseNdjsonStream(
  stream: Readable,
  onEvent: EventCallback,
  onError?: ErrorCallback
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = "";

    stream.on("data", (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      // keep the last (possibly incomplete) segment in the buffer
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          onEvent(JSON.parse(trimmed));
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
    });

    stream.on("end", () => {
      // flush any remaining data that wasn't followed by a newline
      const trimmed = buffer.trim();
      if (trimmed) {
        try {
          onEvent(JSON.parse(trimmed));
        } catch (err) {
          onError?.(err instanceof Error ? err : new Error(String(err)));
        }
      }
      resolve();
    });

    stream.on("error", reject);
  });
}
