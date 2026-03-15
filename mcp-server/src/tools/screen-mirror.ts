import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IpcClient } from "../ipc-client.js";

const UNAVAILABLE = { content: [{ type: "text" as const, text: "Bridge unavailable" }] };

export function registerScreenMirrorTools(
  server: McpServer,
  ipc: IpcClient,
  sessionId: string,
): void {
  server.registerTool(
    "list_windows",
    {
      title: "List Desktop Windows",
      description:
        "List all visible windows on the user's desktop. " +
        "Returns window IDs, titles, classes, and dimensions. " +
        "Use this to find a window before calling stream_window.",
      inputSchema: {},
    },
    async () => {
      if (!ipc.isConnected) return UNAVAILABLE;

      // request window list from bridge and wait for response
      interface WindowEntry { title: string; className: string; id: string; width: number; height: number }
      const result = await ipc.request({
        type: "list_windows",
        sessionId,
      }) as { windows?: WindowEntry[] } | undefined;

      if (!result || !Array.isArray(result.windows)) {
        return {
          content: [{ type: "text" as const, text: "No windows found" }],
        };
      }

      const list = result.windows
        .map(
          (w) => `- ${w.title} [${w.className}] (${w.id}, ${w.width}x${w.height})`
        )
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Open windows:\n${list}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "stream_window",
    {
      title: "Stream Desktop Window",
      description:
        "Start streaming a desktop window to the user's phone. " +
        "Opens a new tab showing a live MJPEG feed of the window at 720p 5fps. " +
        "The user will be asked to confirm before streaming starts. " +
        "Use list_windows first to find available windows.",
      inputSchema: {
        title: z
          .string()
          .optional()
          .describe("window title to search for (partial match)"),
        windowId: z
          .string()
          .optional()
          .describe("exact X11 window ID (e.g. '0x3e00004')"),
        fps: z
          .number()
          .min(1)
          .max(30)
          .optional()
          .describe("frames per second (default 5)"),
        quality: z
          .number()
          .min(1)
          .max(31)
          .optional()
          .describe("JPEG quality 1-31, lower is better (default 10)"),
      },
    },
    (params) => {
      if (!ipc.isConnected) return UNAVAILABLE;

      if (!params.title && !params.windowId) {
        return {
          content: [
            {
              type: "text" as const,
              text: "Provide either 'title' or 'windowId' to identify the window",
            },
          ],
        };
      }

      ipc.send({
        type: "stream_window",
        sessionId,
        title: params.title,
        windowId: params.windowId,
        fps: params.fps,
        quality: params.quality,
      });

      const target = params.title ?? params.windowId;
      return {
        content: [
          {
            type: "text" as const,
            text: `Requesting stream of "${target}" — user will confirm on phone`,
          },
        ],
      };
    },
  );

  server.registerTool(
    "stop_stream",
    {
      title: "Stop Window Stream",
      description:
        "Stop streaming a desktop window. " +
        "If windowId is omitted, stops all active streams.",
      inputSchema: {
        windowId: z
          .string()
          .optional()
          .describe("window ID to stop streaming (omit to stop all)"),
      },
    },
    (params) => {
      if (!ipc.isConnected) return UNAVAILABLE;

      ipc.send({
        type: "stop_stream",
        sessionId,
        windowId: params.windowId,
      });

      return {
        content: [
          {
            type: "text" as const,
            text: params.windowId
              ? `Stream stopped for ${params.windowId}`
              : "All streams stopped",
          },
        ],
      };
    },
  );
}
