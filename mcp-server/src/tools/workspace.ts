import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { IpcClient } from "../ipc-client.js";

const UNAVAILABLE = { content: [{ type: "text" as const, text: "Bridge unavailable" }] };

export function registerWorkspaceTools(
  server: McpServer,
  ipc: IpcClient,
  sessionId: string,
): void {
  server.registerTool(
    "render_html",
    {
      title: "Render HTML in Workspace",
      description:
        "Render an HTML artifact in the user's workspace canvas. " +
        "Supports full HTML with styles and scripts. " +
        "The workspace WebView will display this content.",
      inputSchema: {
        html: z.string().describe("full HTML content to render"),
        title: z.string().optional().describe("optional title shown above the canvas"),
      },
    },
    (params) => {
      if (!ipc.isConnected) return UNAVAILABLE;
      ipc.send({
        type: "workspace_html",
        sessionId,
        html: params.html,
        title: params.title,
      });
      return {
        content: [{ type: "text" as const, text: "HTML rendered in workspace" }],
      };
    },
  );

  server.registerTool(
    "set_preview_url",
    {
      title: "Set Workspace Preview URL",
      description:
        "Load a URL in the workspace WebView. " +
        "Use this to show localhost dev servers, documentation, or any web page. " +
        "The user's phone must be able to reach the URL (use Tailscale IP for localhost).",
      inputSchema: {
        url: z.string().url().describe("URL to load in the workspace WebView"),
        title: z.string().optional().describe("optional title shown above the canvas"),
      },
    },
    (params) => {
      if (!ipc.isConnected) return UNAVAILABLE;
      ipc.send({
        type: "workspace_url",
        sessionId,
        url: params.url,
        title: params.title,
      });
      return {
        content: [{ type: "text" as const, text: `Preview loaded: ${params.url}` }],
      };
    },
  );

  server.registerTool(
    "clear_workspace",
    {
      title: "Clear Workspace Canvas",
      description: "Reset the workspace canvas back to the default empty state.",
      inputSchema: {},
    },
    () => {
      if (!ipc.isConnected) return UNAVAILABLE;
      ipc.send({ type: "workspace_clear", sessionId });
      return {
        content: [{ type: "text" as const, text: "Workspace cleared" }],
      };
    },
  );
}
