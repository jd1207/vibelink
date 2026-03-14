import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IpcClient } from "../ipc-client.js";

export function registerNotifyTools(
  server: McpServer,
  ipc: IpcClient,
  sessionId: string
): void {
  server.registerTool(
    "send_notification",
    {
      title: "Send Notification",
      description: "Send a notification to the user's phone",
      inputSchema: {
        message: z.string().describe("notification message"),
        level: z.enum(["info", "success", "error"]).describe("notification severity"),
      },
    },
    (params) => {
      if (!ipc.isConnected) {
        return { content: [{ type: "text" as const, text: "Bridge unavailable, UI tools temporarily disabled" }] };
      }
      ipc.send({ type: "notification", sessionId, message: params.message, level: params.level });
      return { content: [{ type: "text" as const, text: `Notification sent: ${params.message}` }] };
    }
  );
}
