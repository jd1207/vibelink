import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ProjectScanner } from "../project-scanner.js";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import os from "os";
import path from "path";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), "vibelink-scanner-"));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function createStructure(base: string, structure: string[]): Promise<void> {
  for (const p of structure) {
    const full = path.join(base, p);
    if (p.endsWith("/")) {
      await mkdir(full, { recursive: true });
    } else {
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, "");
    }
  }
}

describe("ProjectScanner", () => {
  it("finds a project with .git directory", async () => {
    await createStructure(tmpDir, ["project-a/.git/"]);
    const scanner = new ProjectScanner({ roots: [tmpDir], maxDepth: 3, cacheTtlMs: 0 });
    const projects = await scanner.scan();
    const names = projects.map((p) => p.name);
    expect(names).toContain("project-a");
    const proj = projects.find((p) => p.name === "project-a")!;
    expect(proj.hasGit).toBe(true);
    expect(proj.hasClaudeMd).toBe(false);
  });

  it("finds a project with CLAUDE.md", async () => {
    await createStructure(tmpDir, ["project-b/CLAUDE.md"]);
    const scanner = new ProjectScanner({ roots: [tmpDir], maxDepth: 3, cacheTtlMs: 0 });
    const projects = await scanner.scan();
    const names = projects.map((p) => p.name);
    expect(names).toContain("project-b");
    const proj = projects.find((p) => p.name === "project-b")!;
    expect(proj.hasClaudeMd).toBe(true);
    expect(proj.hasGit).toBe(false);
  });

  it("does not include directories without .git or CLAUDE.md", async () => {
    await createStructure(tmpDir, ["not-a-project/somefile.txt"]);
    const scanner = new ProjectScanner({ roots: [tmpDir], maxDepth: 3, cacheTtlMs: 0 });
    const projects = await scanner.scan();
    const names = projects.map((p) => p.name);
    expect(names).not.toContain("not-a-project");
  });

  it("excludes node_modules directories from scanning", async () => {
    await createStructure(tmpDir, [
      "myapp/node_modules/some-pkg/.git/",
    ]);
    const scanner = new ProjectScanner({ roots: [tmpDir], maxDepth: 5, cacheTtlMs: 0 });
    const projects = await scanner.scan();
    const names = projects.map((p) => p.name);
    expect(names).not.toContain("some-pkg");
    expect(names).not.toContain("node_modules");
  });

  it("does not recurse into a found project", async () => {
    // project-outer has .git; project-inner inside it also has .git
    await createStructure(tmpDir, [
      "project-outer/.git/",
      "project-outer/inner/.git/",
    ]);
    const scanner = new ProjectScanner({ roots: [tmpDir], maxDepth: 5, cacheTtlMs: 0 });
    const projects = await scanner.scan();
    const names = projects.map((p) => p.name);
    expect(names).toContain("project-outer");
    expect(names).not.toContain("inner");
  });

  it("caches results for cacheTtlMs", async () => {
    await createStructure(tmpDir, ["cached-project/.git/"]);
    const scanner = new ProjectScanner({ roots: [tmpDir], maxDepth: 3, cacheTtlMs: 60000 });
    const first = await scanner.scan();
    // add another project — should not appear in cached result
    await createStructure(tmpDir, ["new-project/.git/"]);
    const second = await scanner.scan();
    expect(second).toBe(first); // same reference = cache hit
    const names = second.map((p) => p.name);
    expect(names).not.toContain("new-project");
  });

  it("returns fresh results when cache is expired", async () => {
    await createStructure(tmpDir, ["old-project/.git/"]);
    const scanner = new ProjectScanner({ roots: [tmpDir], maxDepth: 3, cacheTtlMs: 0 });
    const first = await scanner.scan();
    await createStructure(tmpDir, ["new-project/.git/"]);
    const second = await scanner.scan();
    const names = second.map((p) => p.name);
    expect(names).toContain("new-project");
    expect(names).toContain("old-project");
  });

  it("handles permission errors silently", async () => {
    const scanner = new ProjectScanner({
      roots: ["/root/nonexistent-dir-that-does-not-exist"],
      maxDepth: 3,
      cacheTtlMs: 0,
    });
    await expect(scanner.scan()).resolves.toEqual([]);
  });
});
