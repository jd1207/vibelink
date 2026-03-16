import { readdir, readFile, stat, open, unlink, rmdir } from "fs/promises";
import { join } from "path";
import { homedir } from "os";

export interface ClaudeSession {
  sessionId: string;
  projectPath: string;
  projectName: string;
  lastActivity: string;
  model: string | null;
  gitBranch: string | null;
  name: string | null;
  alive: boolean;
  recentMessages: RecentMessage[];
}

interface RecentMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

export interface PidEntry {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
}

// decode directory name back to a real path
// "-home-deck-vibelink" → "/home/deck/vibelink"
function decodeDirName(name: string): string {
  return name.replace(/-/g, "/");
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function loadActivePids(): Promise<Map<string, PidEntry>> {
  const sessionsDir = join(homedir(), ".claude", "sessions");
  const map = new Map<string, PidEntry>();

  try {
    const files = await readdir(sessionsDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(sessionsDir, file), "utf-8");
        const entry = JSON.parse(raw) as PidEntry;
        if (entry.sessionId) {
          map.set(entry.sessionId, entry);
        }
      } catch {
        // skip corrupt files
      }
    }
  } catch {
    // sessions dir may not exist
  }

  return map;
}

export async function validatePid(pid: number): Promise<boolean> {
  try {
    const cmdline = await readFile(`/proc/${pid}/cmdline`, "utf-8");
    return cmdline.includes("claude");
  } catch {
    return false;
  }
}

// read the head (first ~8KB) and tail (last ~32KB) of a file
// head gives us metadata (cwd, model, gitBranch from first entries)
// tail gives us recent messages and last activity timestamp
async function readHeadAndTail(
  filePath: string,
  headBytes: number = 8192,
  tailBytes: number = 32768,
): Promise<string> {
  const fileStat = await stat(filePath);
  const size = fileStat.size;

  if (size <= headBytes + tailBytes) {
    return readFile(filePath, "utf-8");
  }

  const fh = await open(filePath, "r");
  try {
    const headBuf = Buffer.alloc(headBytes);
    const tailBuf = Buffer.alloc(tailBytes);

    await fh.read(headBuf, 0, headBytes, 0);
    await fh.read(tailBuf, 0, tailBytes, size - tailBytes);

    const head = headBuf.toString("utf-8");
    const tail = tailBuf.toString("utf-8");

    // trim partial lines at boundaries
    const headEnd = head.lastIndexOf("\n");
    const tailStart = tail.indexOf("\n");

    return (
      (headEnd >= 0 ? head.slice(0, headEnd) : head) +
      "\n" +
      (tailStart >= 0 ? tail.slice(tailStart + 1) : tail)
    );
  } finally {
    await fh.close();
  }
}

function parseLine(line: string): Record<string, unknown> | null {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

interface ParsedSession {
  lastActivity: string;
  model: string | null;
  gitBranch: string | null;
  projectPath: string | null;
  name: string | null;
  recentMessages: RecentMessage[];
}

async function parseSessionJsonl(filePath: string): Promise<ParsedSession> {
  const empty: ParsedSession = {
    lastActivity: "",
    model: null,
    gitBranch: null,
    projectPath: null,
    name: null,
    recentMessages: [],
  };

  let content: string;
  try {
    content = await readHeadAndTail(filePath);
  } catch {
    return empty;
  }

  const lines = content.split("\n");

  let lastActivity = "";
  let model: string | null = null;
  let gitBranch: string | null = null;
  let projectPath: string | null = null;
  let name: string | null = null;
  const messages: RecentMessage[] = [];

  for (const line of lines) {
    if (!line) continue;
    const entry = parseLine(line);
    if (!entry) continue;

    const timestamp = entry.timestamp as string | undefined;
    if (timestamp && timestamp > lastActivity) {
      lastActivity = timestamp;
    }

    if (!projectPath && entry.cwd) {
      projectPath = entry.cwd as string;
    }

    if (entry.gitBranch) {
      gitBranch = entry.gitBranch as string;
    }

    if (entry.name) {
      name = entry.name as string;
    }

    const type = entry.type as string;

    if (type === "assistant" && entry.message) {
      const msg = entry.message as Record<string, unknown>;
      if (!model && msg.model) {
        model = msg.model as string;
      }
      const contentArr = msg.content as Array<{ type: string; text?: string }> | undefined;
      if (Array.isArray(contentArr)) {
        const textBlock = contentArr.find((b) => b.type === "text" && b.text);
        if (textBlock?.text) {
          messages.push({
            role: "assistant",
            text: textBlock.text.slice(0, 200),
            timestamp: timestamp ?? "",
          });
        }
      }
    }

    if (type === "user" && entry.message) {
      const msg = entry.message as Record<string, unknown>;
      const contentField = msg.content as
        | string
        | Array<{ type: string; text?: string }>
        | undefined;
      let text = "";
      if (typeof contentField === "string") {
        text = contentField;
      } else if (Array.isArray(contentField)) {
        const textBlock = contentField.find((b) => b.type === "text" && b.text);
        text = textBlock?.text ?? "";
      }
      if (text) {
        messages.push({
          role: "user",
          text: text.slice(0, 200),
          timestamp: timestamp ?? "",
        });
      }
    }
  }

  return {
    lastActivity,
    model,
    gitBranch,
    projectPath,
    name,
    recentMessages: messages.slice(-5),
  };
}

export async function scanClaudeSessions(): Promise<ClaudeSession[]> {
  const projectsDir = join(homedir(), ".claude", "projects");

  const activePids = await loadActivePids();
  const aliveSessionIds = new Set<string>();
  for (const [sid, entry] of activePids) {
    if (isPidAlive(entry.pid)) {
      aliveSessionIds.add(sid);
    }
  }

  const sessions: ClaudeSession[] = [];

  let projectDirs: string[];
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return [];
  }

  for (const dirName of projectDirs) {
    const dirPath = join(projectsDir, dirName);

    try {
      const s = await stat(dirPath);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }

    const projectPath = decodeDirName(dirName);

    let files: string[];
    try {
      files = await readdir(dirPath);
    } catch {
      continue;
    }

    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

    for (const jsonlFile of jsonlFiles) {
      const sessionId = jsonlFile.replace(".jsonl", "");
      const filePath = join(dirPath, jsonlFile);

      const parsed = await parseSessionJsonl(filePath);
      if (!parsed.lastActivity) continue;

      const resolvedPath = parsed.projectPath ?? projectPath;
      const projectName =
        resolvedPath.split("/").filter(Boolean).pop() ?? resolvedPath;

      sessions.push({
        sessionId,
        projectPath: resolvedPath,
        projectName,
        lastActivity: parsed.lastActivity,
        model: parsed.model,
        gitBranch: parsed.gitBranch,
        name: parsed.name,
        alive: aliveSessionIds.has(sessionId),
        recentMessages: parsed.recentMessages,
      });
    }
  }

  // add alive PID entries that have no matching JSONL (e.g., fresh sessions
  // where the PID session ID doesn't match any JSONL filename yet).
  // deduplicate: only keep the most recent PID per cwd (project path).
  const foundSessionIds = new Set(sessions.map((s) => s.sessionId));
  const alivePaths = new Set(
    sessions.filter((s) => s.alive).map((s) => s.projectPath),
  );

  // group unmatched PIDs by cwd, keep newest per cwd
  const unmatchedByCwd = new Map<string, { sid: string; entry: PidEntry }>();
  for (const [sid, entry] of activePids) {
    if (foundSessionIds.has(sid)) continue;
    if (!isPidAlive(entry.pid)) continue;
    // skip if we already have an alive JSONL-based session for this path
    if (alivePaths.has(entry.cwd)) continue;
    const existing = unmatchedByCwd.get(entry.cwd);
    if (!existing || entry.startedAt > existing.entry.startedAt) {
      unmatchedByCwd.set(entry.cwd, { sid, entry });
    }
  }

  for (const [, { sid, entry }] of unmatchedByCwd) {
    const projectName = entry.cwd.split("/").filter(Boolean).pop() ?? entry.cwd;

    // try to get metadata from the most recent JSONL in the same project dir
    let model: string | null = null;
    let gitBranch: string | null = null;
    let name: string | null = null;
    let recentMessages: RecentMessage[] = [];
    let lastActivity = new Date(entry.startedAt).toISOString();

    const recentJsonl = await findMostRecentJsonl(entry.cwd);
    if (recentJsonl) {
      const parsed = await parseSessionJsonl(recentJsonl);
      model = parsed.model;
      gitBranch = parsed.gitBranch;
      name = parsed.name;
      recentMessages = parsed.recentMessages;
      if (parsed.lastActivity) lastActivity = parsed.lastActivity;
    }

    sessions.push({
      sessionId: sid,
      projectPath: entry.cwd,
      projectName: name || projectName,
      lastActivity,
      model,
      gitBranch,
      name,
      alive: true,
      recentMessages,
    });
  }

  sessions.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

  return sessions;
}

// find the most recent JSONL file in a project directory (by cwd path)
export async function findMostRecentJsonl(cwd: string): Promise<string | null> {
  const projectsDir = join(homedir(), ".claude", "projects");
  // encode the cwd path to match the directory name format
  const encoded = cwd.replace(/\//g, "-");
  const dirPath = join(projectsDir, encoded);
  try {
    const files = await readdir(dirPath);
    const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));
    if (jsonlFiles.length === 0) return null;
    // find the most recently modified JSONL
    let newest: { path: string; mtime: number } | null = null;
    for (const f of jsonlFiles) {
      const p = join(dirPath, f);
      try {
        const s = await stat(p);
        if (!newest || s.mtimeMs > newest.mtime) {
          newest = { path: p, mtime: s.mtimeMs };
        }
      } catch { continue; }
    }
    return newest?.path ?? null;
  } catch {
    return null;
  }
}

export async function findJsonlPath(sessionId: string): Promise<string | null> {
  const projectsDir = join(homedir(), ".claude", "projects");
  let projectDirs: string[];
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return null;
  }
  for (const dirName of projectDirs) {
    const jsonlPath = join(projectsDir, dirName, `${sessionId}.jsonl`);
    try {
      await stat(jsonlPath);
      return jsonlPath;
    } catch {
      continue;
    }
  }
  return null;
}

// read conversation messages from a session JSONL for hydrating the phone UI
export interface HistoryMessage {
  type: "assistant" | "user";
  message: Record<string, unknown>;
  timestamp: string;
  sessionId: string;
}

// max user messages to include in history (plus their assistant responses)
const HISTORY_USER_TURNS = 4;
const HISTORY_TAIL_BYTES = 65536;

export async function readSessionHistory(sessionId: string): Promise<HistoryMessage[]> {
  const jsonlPath = await findJsonlPath(sessionId);
  if (!jsonlPath) return [];

  // read only the tail of the file — recent messages are at the end
  let content: string;
  try {
    const fileStat = await stat(jsonlPath);
    if (fileStat.size <= HISTORY_TAIL_BYTES) {
      content = await readFile(jsonlPath, "utf-8");
    } else {
      const fh = await open(jsonlPath, "r");
      try {
        const buf = Buffer.alloc(HISTORY_TAIL_BYTES);
        await fh.read(buf, 0, HISTORY_TAIL_BYTES, fileStat.size - HISTORY_TAIL_BYTES);
        content = buf.toString("utf-8");
        // trim partial first line
        const nl = content.indexOf("\n");
        if (nl >= 0) content = content.slice(nl + 1);
      } finally {
        await fh.close();
      }
    }
  } catch {
    return [];
  }

  const allMessages: HistoryMessage[] = [];
  for (const line of content.split("\n")) {
    if (!line) continue;
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const type = entry.type as string;
    if ((type === "user" || type === "assistant") && entry.message) {
      allMessages.push({
        type: type as "user" | "assistant",
        message: entry.message as Record<string, unknown>,
        timestamp: (entry.timestamp as string) ?? "",
        sessionId,
      });
    }
  }

  // find the last N user turns and include everything from that point
  // if fewer than N turns exist, return all messages
  let userCount = 0;
  let cutoff = 0;
  for (let i = allMessages.length - 1; i >= 0; i--) {
    if (allMessages[i].type === "user") {
      userCount++;
      if (userCount >= HISTORY_USER_TURNS) {
        cutoff = i;
        break;
      }
    }
  }

  return allMessages.slice(cutoff);
}

// delete a session's JSONL file (and companion directory if it exists)
export async function deleteClaudeSession(sessionId: string): Promise<boolean> {
  const jsonlPath = await findJsonlPath(sessionId);
  if (!jsonlPath) return false;

  // found it — delete the JSONL and any companion directory
  await unlink(jsonlPath);

  const dirPath = join(jsonlPath, "..");
  const companionDir = join(dirPath, sessionId);
  try {
    const s = await stat(companionDir);
    if (s.isDirectory()) {
      // remove companion dir contents then dir itself
      const files = await readdir(companionDir);
      for (const f of files) {
        await unlink(join(companionDir, f)).catch(() => {});
      }
      await rmdir(companionDir).catch(() => {});
    }
  } catch {
    // no companion dir
  }

  return true;
}
