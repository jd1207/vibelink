import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IpcClient } from "../ipc-client.js";

const COMPONENT_TYPES = [
  "decision_table",
  "form",
  "code_viewer",
  "chart",
  "markdown",
  "image_gallery",
  "progress",
  "tree_view",
] as const;

const UNAVAILABLE = { content: [{ type: "text" as const, text: "Bridge unavailable, UI tools temporarily disabled" }] };

export function registerRenderUiTools(
  server: McpServer,
  ipc: IpcClient,
  sessionId: string
): void {
  server.registerTool(
    "render_ui",
    {
      title: "Render UI Component",
      description: "Render a UI component on the user's phone",
      inputSchema: {
        id: z.string().describe("unique component id"),
        type: z.enum(COMPONENT_TYPES).describe("component type"),
        title: z.string().optional().describe("optional display title"),
        data: z.unknown().optional().describe("component-specific data"),
      },
    },
    (params) => {
      if (!ipc.isConnected) return UNAVAILABLE;
      ipc.send({ type: "ui_update", sessionId, component: { ...params } });
      return { content: [{ type: "text" as const, text: `Component rendered: ${params.id}` }] };
    }
  );

  server.registerTool(
    "update_ui",
    {
      title: "Update UI Component",
      description: "Update an existing UI component on the user's phone",
      inputSchema: {
        componentId: z.string().describe("id of the component to update"),
        updates: z.record(z.unknown()).describe("fields to update"),
      },
    },
    (params) => {
      if (!ipc.isConnected) return UNAVAILABLE;
      ipc.send({ type: "ui_modify", sessionId, componentId: params.componentId, updates: params.updates });
      return { content: [{ type: "text" as const, text: `Component updated: ${params.componentId}` }] };
    }
  );
}
