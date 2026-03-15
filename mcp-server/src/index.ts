import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { IpcClient } from "./ipc-client.js";
import { registerRenderUiTools } from "./tools/render-ui.js";
import { registerTabTools } from "./tools/tabs.js";
import { registerInputTools } from "./tools/input.js";
import { registerNotifyTools } from "./tools/notify.js";
import { registerWorkspaceTools } from "./tools/workspace.js";

const sessionId = process.env.VIBELINK_SESSION_ID;
if (!sessionId) {
  process.stderr.write("fatal: VIBELINK_SESSION_ID environment variable is not set\n");
  process.exit(1);
}

const socketPath = process.env.VIBELINK_IPC_SOCKET ?? "/tmp/vibelink.sock";

const server = new McpServer({ name: "vibelink", version: "0.1.0" });
const ipc = new IpcClient(socketPath, sessionId);

registerRenderUiTools(server, ipc, sessionId);
registerTabTools(server, ipc, sessionId);
registerInputTools(server, ipc, sessionId);
registerNotifyTools(server, ipc, sessionId);
registerWorkspaceTools(server, ipc, sessionId);

ipc.connect();

const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write(`vibelink mcp server started (session=${sessionId})\n`);
