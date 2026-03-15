import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IpcClient } from "../ipc-client.js";

const UNAVAILABLE = { content: [{ type: "text" as const, text: "Bridge unavailable" }] };

function log(msg: string): void {
  process.stderr.write(`[screen-mirror] ${msg}\n`);
}

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
      if (!ipc.isConnected) {
        log("list_windows: bridge not connected");
        return UNAVAILABLE;
      }

      log("list_windows: requesting window list from bridge");
      interface WindowEntry { title: string; className: string; id: string; width: number; height: number }
      let result: { windows?: WindowEntry[] } | undefined;
      try {
        result = await ipc.request({
          type: "list_windows",
          sessionId,
        }) as typeof result;
      } catch (err) {
        log(`list_windows: IPC request failed — ${(err as Error).message}`);
        return { content: [{ type: "text" as const, text: "Failed to list windows (bridge timeout)" }] };
      }

      if (!result || !Array.isArray(result.windows)) {
        log("list_windows: no windows returned");
        return { content: [{ type: "text" as const, text: "No windows found" }] };
      }

      log(`list_windows: found ${result.windows.length} windows`);
      const list = result.windows
        .map((w) => `- ${w.title} [${w.className}] (id=${w.id}, ${w.width}x${w.height})`)
        .join("\n");

      return {
        content: [{ type: "text" as const, text: `Open windows:\n${list}` }],
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
          .describe("exact X11 window ID (hex, e.g. '3e00004')"),
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
      if (!ipc.isConnected) {
        log("stream_window: bridge not connected");
        return UNAVAILABLE;
      }

      if (!params.title && !params.windowId) {
        log("stream_window: no title or windowId provided");
        return {
          content: [{
            type: "text" as const,
            text: "Provide either 'title' or 'windowId' to identify the window",
          }],
        };
      }

      const target = params.title ?? params.windowId;
      log(`stream_window: requesting stream of "${target}" fps=${params.fps ?? 5} quality=${params.quality ?? 10}`);

      ipc.send({
        type: "stream_window",
        sessionId,
        title: params.title,
        windowId: params.windowId,
        fps: params.fps,
        quality: params.quality,
      });

      return {
        content: [{
          type: "text" as const,
          text: `Requesting stream of "${target}" — user will confirm on phone. ` +
            `Stream will appear as a new tab once confirmed.`,
        }],
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
      if (!ipc.isConnected) {
        log("stop_stream: bridge not connected");
        return UNAVAILABLE;
      }

      log(`stop_stream: ${params.windowId ?? "all streams"}`);

      ipc.send({
        type: "stop_stream",
        sessionId,
        windowId: params.windowId,
      });

      return {
        content: [{
          type: "text" as const,
          text: params.windowId
            ? `Stream stopped for ${params.windowId}`
            : "All streams stopped",
        }],
      };
    },
  );

  server.registerTool(
    "stream_status",
    {
      title: "Get Stream Status",
      description:
        "Get diagnostic info about active screen streams. " +
        "Shows fps, frame count, byte count, uptime, ffmpeg stderr, errors. " +
        "Useful for debugging when streams aren't appearing on the phone.",
      inputSchema: {
        windowId: z
          .string()
          .optional()
          .describe("window ID to check (omit for all streams)"),
      },
    },
    async (params) => {
      if (!ipc.isConnected) {
        log("stream_status: bridge not connected");
        return UNAVAILABLE;
      }

      log(`stream_status: requesting status for ${params.windowId ?? "all"}`);

      let result: { streams?: StreamStatusEntry[] } | undefined;
      try {
        result = await ipc.request({
          type: "stream_status",
          sessionId,
          windowId: params.windowId,
        }) as typeof result;
      } catch (err) {
        log(`stream_status: IPC request failed — ${(err as Error).message}`);
        return {
          content: [{
            type: "text" as const,
            text: "Failed to get stream status (bridge timeout). " +
              "The bridge may not support stream_status yet — " +
              "check bridge/src/server.ts for the IPC handler.",
          }],
        };
      }

      if (!result || !Array.isArray(result.streams) || result.streams.length === 0) {
        return { content: [{ type: "text" as const, text: "No active streams" }] };
      }

      const lines = result.streams.map((s) => {
        const parts = [
          `Window: ${s.windowId}`,
          `  alive: ${s.alive}`,
          `  frames: ${s.frameCount}`,
          `  fps: ${s.fps?.toFixed(1) ?? "?"}`,
          `  bytes: ${formatBytes(s.byteCount ?? 0)}`,
          `  avg frame: ${(s.avgFrameSizeKb ?? 0).toFixed(1)} KB`,
          `  uptime: ${((s.uptimeMs ?? 0) / 1000).toFixed(0)}s`,
          `  restarts: ${s.restartCount ?? 0}`,
          `  last frame: ${s.lastFrameAgoMs >= 0 ? `${s.lastFrameAgoMs}ms ago` : "never"}`,
          `  ffmpeg pid: ${s.ffmpegPid ?? "unknown"}`,
        ];
        if (s.lastError) parts.push(`  last error: ${s.lastError}`);
        if (s.ffmpegStderr?.length) {
          parts.push(`  ffmpeg stderr (last ${s.ffmpegStderr.length} lines):`);
          for (const line of s.ffmpegStderr.slice(-5)) {
            parts.push(`    ${line}`);
          }
        }
        return parts.join("\n");
      });

      return {
        content: [{ type: "text" as const, text: lines.join("\n\n") }],
      };
    },
  );
}

interface StreamStatusEntry {
  windowId: string;
  alive: boolean;
  frameCount: number;
  byteCount: number;
  fps: number;
  uptimeMs: number;
  restartCount: number;
  lastFrameAgoMs: number;
  avgFrameSizeKb: number;
  lastError: string | null;
  ffmpegPid: number | null;
  ffmpegStderr: string[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
