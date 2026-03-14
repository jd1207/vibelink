import { readdir, stat } from "fs/promises";
import path from "path";

const EXCLUDED_DIRS = new Set([
  "node_modules", ".git", ".cache", "Library", ".local",
  ".npm", "dist", "build",
]);

export interface Project {
  path: string;
  name: string;
  hasGit: boolean;
  hasClaudeMd: boolean;
}

interface ProjectScannerOptions {
  roots: string[];
  maxDepth: number;
  cacheTtlMs: number;
}

export class ProjectScanner {
  private readonly roots: string[];
  private readonly maxDepth: number;
  private readonly cacheTtlMs: number;
  private cachedResult: Project[] | null = null;
  private cacheTime = 0;

  constructor(options: ProjectScannerOptions) {
    this.roots = options.roots;
    this.maxDepth = options.maxDepth;
    this.cacheTtlMs = options.cacheTtlMs;
  }

  async scan(): Promise<Project[]> {
    if (this.cachedResult && Date.now() - this.cacheTime < this.cacheTtlMs) {
      return this.cachedResult;
    }

    const results: Project[] = [];
    for (const root of this.roots) {
      await this.scanDir(root, root, 0, results);
    }

    this.cachedResult = results;
    this.cacheTime = Date.now();
    return results;
  }

  private async scanDir(
    dir: string,
    root: string,
    depth: number,
    results: Project[],
  ): Promise<void> {
    if (depth > this.maxDepth) return;

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      // permission error or missing dir — skip silently
      return;
    }

    const hasGit = entries.includes(".git");
    const hasClaudeMd = entries.includes("CLAUDE.md");

    // if this is a scan root (depth 0), always recurse — don't treat it as a project
    // this prevents ~/CLAUDE.md from blocking discovery of ~/projects/*
    if ((hasGit || hasClaudeMd) && dir !== root) {
      results.push({
        path: dir,
        name: path.basename(dir),
        hasGit,
        hasClaudeMd,
      });
      // don't recurse into found projects
      return;
    }

    for (const entry of entries) {
      if (entry.startsWith(".")) continue;
      if (EXCLUDED_DIRS.has(entry)) continue;

      const fullPath = path.join(dir, entry);
      try {
        const info = await stat(fullPath);
        if (info.isDirectory()) {
          await this.scanDir(fullPath, root, depth + 1, results);
        }
      } catch {
        // permission error — skip
      }
    }
  }
}
