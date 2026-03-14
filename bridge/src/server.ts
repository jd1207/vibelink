import express from "express";
import http from "http";
import { config } from "./config.js";

interface AppOptions {
  port?: number;
}

interface AppInstance {
  app: http.Server;
  close: () => Promise<void>;
}

const startTime = Date.now();

export async function createApp(options: AppOptions = {}): Promise<AppInstance> {
  const port = options.port ?? config.port;
  const expressApp = express();

  expressApp.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  expressApp.get("/debug", (_req, res) => {
    const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
    res.json({
      sessions: [],
      ipcConnected: false,
      uptime: `${uptimeSeconds}s`,
    });
  });

  const server = http.createServer(expressApp);

  await new Promise<void>((resolve) => {
    server.listen(port, resolve);
  });

  const close = (): Promise<void> =>
    new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

  return { app: server, close };
}

// only start when run directly
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  createApp().then(({ app }) => {
    const addr = app.address();
    const port = addr && typeof addr === "object" ? addr.port : config.port;
    console.log(`bridge server listening on port ${port}`);
  });
}
