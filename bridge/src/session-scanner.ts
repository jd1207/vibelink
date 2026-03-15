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
  alive: boolean;
  recentMessages: RecentMessage[];
}

interface RecentMessage {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
}

interface PidEntry {
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

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function loadActivePids(): Promise<Map<string, PidEntry>> {
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
  recentMessages: RecentMessage[];
}

async function parseSessionJsonl(filePath: string): Promise<ParsedSession> {
  const empty: ParsedSession = {
    lastActivity: "",
    model: null,
    gitBranch: null,
    projectPath: null,
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
        alive: aliveSessionIds.has(sessionId),
        recentMessages: parsed.recentMessages,
      });
    }
  }

  sessions.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

  return sessions;
}

// delete a session's JSONL file (and companion directory if it exists)
export async function deleteClaudeSession(sessionId: string): Promise<boolean> {
  const projectsDir = join(homedir(), ".claude", "projects");

  let projectDirs: string[];
  try {
    projectDirs = await readdir(projectsDir);
  } catch {
    return false;
  }

  for (const dirName of projectDirs) {
    const dirPath = join(projectsDir, dirName);
    const jsonlPath = join(dirPath, `${sessionId}.jsonl`);

    try {
      await stat(jsonlPath);
    } catch {
      continue;
    }

    // found it — delete the JSONL and any companion directory
    await unlink(jsonlPath);

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

  return false;
}
