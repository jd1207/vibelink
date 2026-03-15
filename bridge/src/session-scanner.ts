import { readdir, readFile, stat } from "fs/promises";
import { join, basename } from "path";
import { homedir } from "os";
import { execSync } from "child_process";

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

// check if a PID is still running
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// load all active PID → sessionId mappings from ~/.claude/sessions/
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

// extract metadata from the last N lines of a JSONL file (read from the end)
async function parseSessionJsonl(
  filePath: string,
): Promise<{
  lastActivity: string;
  model: string | null;
  gitBranch: string | null;
  projectPath: string | null;
  recentMessages: RecentMessage[];
}> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    return {
      lastActivity: "",
      model: null,
      gitBranch: null,
      projectPath: null,
      recentMessages: [],
    };
  }

  const lines = content.trim().split("\n");

  let lastActivity = "";
  let model: string | null = null;
  let gitBranch: string | null = null;
  let projectPath: string | null = null;
  const messages: RecentMessage[] = [];

  // scan all lines for metadata, collect user/assistant messages
  for (const line of lines) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const timestamp = entry.timestamp as string | undefined;
    if (timestamp && timestamp > lastActivity) {
      lastActivity = timestamp;
    }

    // extract project path from cwd field
    if (!projectPath && entry.cwd) {
      projectPath = entry.cwd as string;
    }

    // extract git branch
    if (entry.gitBranch) {
      gitBranch = entry.gitBranch as string;
    }

    const type = entry.type as string;

    if (type === "assistant" && entry.message) {
      const msg = entry.message as Record<string, unknown>;
      if (!model && msg.model) {
        model = msg.model as string;
      }

      // extract text content from assistant message
      const contentArr = msg.content as Array<{ type: string; text?: string }> | undefined;
      if (contentArr) {
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
      const contentArr = msg.content as
        | string
        | Array<{ type: string; text?: string }>
        | undefined;
      let text = "";
      if (typeof contentArr === "string") {
        text = contentArr;
      } else if (Array.isArray(contentArr)) {
        const textBlock = contentArr.find((b) => b.type === "text" && b.text);
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

  // keep last 5 messages
  const recentMessages = messages.slice(-5);

  return { lastActivity, model, gitBranch, projectPath, recentMessages };
}

export async function scanClaudeSessions(): Promise<ClaudeSession[]> {
  const claudeDir = join(homedir(), ".claude");
  const projectsDir = join(claudeDir, "projects");

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

    // skip non-directories
    try {
      const s = await stat(dirPath);
      if (!s.isDirectory()) continue;
    } catch {
      continue;
    }

    // decode the project path from directory name
    const projectPath = decodeDirName(dirName);

    // find all JSONL session files in this directory
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

      const resolvedProjectPath = parsed.projectPath ?? projectPath;
      const projectName =
        resolvedProjectPath.split("/").filter(Boolean).pop() ?? resolvedProjectPath;

      sessions.push({
        sessionId,
        projectPath: resolvedProjectPath,
        projectName,
        lastActivity: parsed.lastActivity,
        model: parsed.model,
        gitBranch: parsed.gitBranch,
        alive: aliveSessionIds.has(sessionId),
        recentMessages: parsed.recentMessages,
      });
    }
  }

  // sort by last activity, newest first
  sessions.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));

  return sessions;
}
