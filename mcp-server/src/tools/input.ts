import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomUUID } from "crypto";
import type { IpcClient } from "../ipc-client.js";
import type { IpcMessage } from "../types.js";

const INPUT_TIMEOUT_MS = 5 * 60 * 1000;

export function registerInputTools(
  server: McpServer,
  ipc: IpcClient,
  sessionId: string
): void {
  // pending resolvers keyed by requestId
  const pending = new Map<string, (value: string) => void>();

  ipc.on("message", (msg: IpcMessage) => {
    if (msg.type !== "input_response") return;
    const requestId = msg.requestId as string;
    const value = msg.value as string;
    const resolve = pending.get(requestId);
    if (!resolve) return;
    pending.delete(requestId);
    resolve(value);
  });

  server.registerTool(
    "request_input",
    {
      title: "Request Input",
      description: "Ask the user for input on their phone and wait for a response",
      inputSchema: {
        prompt: z.string().describe("message to display to the user"),
        options: z.array(z.string()).optional().describe("optional list of choices"),
      },
    },
    async (params) => {
      if (!ipc.isConnected) {
        return { content: [{ type: "text" as const, text: "Bridge unavailable, UI tools temporarily disabled" }] };
      }

      const requestId = randomUUID();

      const responsePromise = new Promise<string>((resolve, reject) => {
        pending.set(requestId, resolve);
        setTimeout(() => {
          if (!pending.has(requestId)) return;
          pending.delete(requestId);
          reject(new Error("input request timed out after 5 minutes"));
        }, INPUT_TIMEOUT_MS);
      });

      ipc.send({ type: "input_request", sessionId, requestId, prompt: params.prompt, options: params.options });

      try {
        const value = await responsePromise;
        return { content: [{ type: "text" as const, text: value }] };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${message}` }] };
      }
    }
  );
}
