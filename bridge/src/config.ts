import { homedir } from "os";

const env = process.env;

export const config = {
  port: parseInt(env.PORT ?? "3400", 10),
  authToken: env.AUTH_TOKEN ?? "",
  ipcSocketPath: env.IPC_SOCKET_PATH ?? "tcp:3401",
  scanRoots: env.SCAN_ROOTS ? env.SCAN_ROOTS.split(",") : [homedir()],
  scanMaxDepth: parseInt(env.SCAN_MAX_DEPTH ?? "3", 10),
  scanCacheTtlMs: parseInt(env.SCAN_CACHE_TTL_MS ?? "60000", 10),
  eventBufferSize: parseInt(env.EVENT_BUFFER_SIZE ?? "200", 10),
  wsHeartbeatIntervalMs: parseInt(env.WS_HEARTBEAT_INTERVAL_MS ?? "30000", 10),
  wsHeartbeatTimeoutMs: parseInt(env.WS_HEARTBEAT_TIMEOUT_MS ?? "10000", 10),
  requestInputTimeoutMs: parseInt(env.REQUEST_INPUT_TIMEOUT_MS ?? "300000", 10),
  maxConcurrentStreams: parseInt(env.MAX_CONCURRENT_STREAMS ?? "3", 10),
  maxWatchSessions: parseInt(env.MAX_WATCH_SESSIONS ?? "5", 10),
  watchSessionReaperIntervalMs: 10000,
  watchSessionGracePeriodMs: 5000,
};
