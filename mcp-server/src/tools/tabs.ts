import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IpcClient } from "../ipc-client.js";

const UNAVAILABLE = { content: [{ type: "text" as const, text: "Bridge unavailable, UI tools temporarily disabled" }] };

export function registerTabTools(
  server: McpServer,
  ipc: IpcClient,
  sessionId: string
): void {
  server.registerTool(
    "create_tab",
    {
      title: "Create Tab",
      description: "Create a new tab on the user's phone",
      inputSchema: {
        id: z.string().describe("unique tab id"),
        name: z.string().describe("tab display name"),
        content: z.unknown().optional().describe("optional initial content"),
      },
    },
    (params) => {
      if (!ipc.isConnected) return UNAVAILABLE;
      ipc.send({ type: "tab_create", sessionId, tab: { ...params } });
      return { content: [{ type: "text" as const, text: `Tab created: ${params.id}` }] };
    }
  );

  server.registerTool(
    "update_tab",
    {
      title: "Update Tab",
      description: "Update an existing tab on the user's phone",
      inputSchema: {
        tabId: z.string().describe("id of the tab to update"),
        updates: z.record(z.unknown()).describe("fields to update"),
      },
    },
    (params) => {
      if (!ipc.isConnected) return UNAVAILABLE;
      ipc.send({ type: "tab_update", sessionId, tabId: params.tabId, updates: params.updates });
      return { content: [{ type: "text" as const, text: `Tab updated: ${params.tabId}` }] };
    }
  );
}
