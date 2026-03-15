import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readdir, stat, readFile } from "node:fs/promises";
import { join, resolve, relative } from "node:path";
import { execFileSync } from "node:child_process";

interface FileEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
}

function getProjectRoot(): string {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      timeout: 3000,
    }).trim();
    return root;
  } catch {
    return process.cwd();
  }
}

function getGitIgnoredSet(dirPath: string, names: string[]): Set<string> {
  if (names.length === 0) return new Set();
  const paths = names.map((n) => join(dirPath, n));
  try {
    // git check-ignore prints ignored paths, one per line
    const result = execFileSync("git", ["check-ignore", ...paths], {
      encoding: "utf-8",
      timeout: 5000,
      cwd: dirPath,
    });
    const ignored = new Set<string>();
    for (const line of result.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        // extract just the filename from the full path
        const name = trimmed.split("/").pop() ?? trimmed;
        ignored.add(name);
      }
    }
    return ignored;
  } catch {
    // exit code 1 = nothing ignored, or git not available
    return new Set();
  }
}

const ALWAYS_HIDDEN = new Set([".git"]);
const MAX_ENTRIES = 200;
const DEFAULT_LINE_LIMIT = 500;
const MAX_LINE_LIMIT = 2000;

export function registerFileBrowserTools(server: McpServer): void {
  server.registerTool(
    "browse_files",
    {
      title: "Browse Files",
      description:
        "List files and directories at a path in the project. " +
        "Returns name, type, size, and modified date. Respects .gitignore.",
      inputSchema: {
        path: z
          .string()
          .optional()
          .describe("relative path from project root (defaults to root)"),
        showHidden: z
          .boolean()
          .optional()
          .describe("include hidden files (default false)"),
      },
    },
    async (params) => {
      const root = getProjectRoot();
      const targetPath = params.path
        ? resolve(root, params.path)
        : root;

      // safety: don't allow escaping project root
      if (!targetPath.startsWith(root)) {
        return {
          content: [{ type: "text" as const, text: "error: path is outside project root" }],
        };
      }

      try {
        const dirents = await readdir(targetPath, { withFileTypes: true });
        const names = dirents.map((d) => d.name);
        const ignored = getGitIgnoredSet(targetPath, names);

        const entries: FileEntry[] = [];
        for (const dirent of dirents) {
          if (ALWAYS_HIDDEN.has(dirent.name)) continue;
          if (!params.showHidden && dirent.name.startsWith(".")) continue;
          if (ignored.has(dirent.name)) continue;
          if (entries.length >= MAX_ENTRIES) break;

          try {
            const fullPath = join(targetPath, dirent.name);
            const stats = await stat(fullPath);
            entries.push({
              name: dirent.name,
              type: dirent.isDirectory() ? "directory" : "file",
              size: stats.size,
              modified: stats.mtime.toISOString(),
            });
          } catch {
            // skip unreadable entries
          }
        }

        // sort: directories first, then alphabetical
        entries.sort((a, b) => {
          if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

        const relativePath = relative(root, targetPath) || ".";
        const result = { path: relativePath, entries };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `error: ${message}` }],
        };
      }
    }
  );

  server.registerTool(
    "view_file",
    {
      title: "View File",
      description:
        "Read the contents of a file in the project. " +
        "Large files are truncated to a line limit.",
      inputSchema: {
        path: z.string().describe("relative path from project root"),
        lineLimit: z
          .number()
          .optional()
          .describe(`max lines to return (default ${DEFAULT_LINE_LIMIT}, max ${MAX_LINE_LIMIT})`),
      },
    },
    async (params) => {
      const root = getProjectRoot();
      const targetPath = resolve(root, params.path);

      if (!targetPath.startsWith(root)) {
        return {
          content: [{ type: "text" as const, text: "error: path is outside project root" }],
        };
      }

      try {
        const stats = await stat(targetPath);
        if (stats.isDirectory()) {
          return {
            content: [{ type: "text" as const, text: "error: path is a directory, use browse_files instead" }],
          };
        }

        const raw = await readFile(targetPath, "utf-8");
        const lines = raw.split("\n");
        const limit = Math.min(
          params.lineLimit ?? DEFAULT_LINE_LIMIT,
          MAX_LINE_LIMIT
        );
        const truncated = lines.length > limit;
        const content = truncated
          ? lines.slice(0, limit).join("\n")
          : raw;

        const result = {
          path: relative(root, targetPath),
          lines: Math.min(lines.length, limit),
          totalLines: lines.length,
          truncated,
          content,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `error: ${message}` }],
        };
      }
    }
  );
}
