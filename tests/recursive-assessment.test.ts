import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { inventoryTree } from "../src/scanner.js";
import { calculateRollup, scanRepository, type ScanResult } from "../src/engine.js";
import { buildHtmlReport, buildMarkdownReport, printConsoleReport, writeReportFiles } from "../src/report.js";

let root: string;
async function put(name: string, content = "sample") {
  const absolute = path.join(root, name);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content);
}
beforeEach(async () => {
  await fs.mkdir(path.resolve("tmp"), { recursive: true });
  root = await fs.mkdtemp(path.resolve("tmp/recursive-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("recursive inventory and discovery", () => {
  it("applies inherited/nested rules, anchoring, negation and built-in priority to files and targets", async () => {
    await put(".gitignore", "/top/\n*.log\n!keep.log\nblocked/\n!blocked/keep.md\n!node_modules/\n");
    await put("top/hidden.md");
    await put("blocked/keep.md");
    await put("node_modules/hidden.md");
    await put("docs/top/visible.md");
    await put("docs/.gitignore", "!nested.log\n/local/\n");
    await put("docs/nested.log");
    await put("docs/lost.log");
    await put("docs/local/hidden.md");
    await put("keep.log");
    await put("lost.log");
    const tree = await inventoryTree(root);
    expect(tree.files).toEqual([".gitignore", "docs/.gitignore", "docs/nested.log", "docs/top/visible.md", "keep.log"]);
    const result = await scanRepository(root, { onlyIds: ["root-readme"] });
    expect(result.recursiveScans.map((entry) => entry.path)).toEqual(["docs"]);
    expect(result.recursiveScans[0].result?.recursiveScans.map((entry) => entry.path)).toEqual(["top"]);
  });

  it("annotates deep declarations without promoting or duplicating descendants", async () => {
    await put("package.json", JSON.stringify({ workspaces: ["packages/*", "node_modules/*", "hidden"] }));
    await put(".gitmodules", '[submodule "app"]\npath = packages/app\n[submodule "alias"]\npath = alias\n');
    await put(".gitignore", "hidden/\n");
    await put("packages/app/package.json", "{}");
    await put("hidden/package.json", "{}");
    await put("node_modules/pkg/package.json", "{}");
    await fs.mkdir(path.join(root, "empty"));
    await fs.symlink(path.join(root, "packages/app"), path.join(root, "alias"));
    const result = await scanRepository(root, { onlyIds: ["root-readme"] });
    expect(result.recursiveScans.map((entry) => entry.path)).toEqual(["empty", "packages"]);
    const app = result.recursiveScans[1].result?.recursiveScans;
    expect(app).toHaveLength(1);
    expect(app?.[0]).toMatchObject({ path: "app", kind: "submodule" });
  });

  it("does not let aliases bypass ignored paths or create cycles", async () => {
    await put(".gitignore", "secret/\n");
    await put("secret/private.md");
    await put("src/code.ts");
    await fs.symlink(path.join(root, "secret"), path.join(root, "alias"));
    await fs.symlink(root, path.join(root, "src/loop"));
    await fs.symlink(path.join(root, "src/code.ts"), path.join(root, "copy.ts"));
    await fs.symlink(path.dirname(root), path.join(root, "external"));
    const tree = await inventoryTree(root);
    expect(tree.files).toEqual([".gitignore", "src/code.ts"]);
    expect(tree.children.map((entry) => path.basename(entry.absolutePath))).toEqual(["src"]);
  });

  it("reuses one walk and keeps inventories complete at depth boundaries", async () => {
    await put("src/deep/package.json", "{}");
    await put("src/deep/README.md", "# Example\n".repeat(30));
    const spy = vi.spyOn(fs, "readdir");
    const result = await scanRepository(root, { maxDepth: 1, onlyIds: ["root-readme"], repoType: "non-software" });
    expect(result.repoType).toBe("non-software");
    expect(result.recursiveScans[0].result?.repoType).toBe("software");
    expect(result.recursiveScans[0].result?.recursiveScans).toEqual([]);
    for (const directory of [root, path.join(root, "src"), path.join(root, "src/deep")]) {
      expect(spy.mock.calls.filter(([dir]) => dir === directory)).toHaveLength(1);
    }
    const depth0 = await scanRepository(root, { maxDepth: 0, onlyIds: ["ci-pipeline"] });
    expect(depth0.repoType).toBe("software");
    expect(depth0.checks).toHaveLength(1);
    expect(depth0.recursiveScans).toEqual([]);
  });

  it("inherits only/skip but does not load child configuration", async () => {
    await put("src/.harnix.yaml", "only: [documentation]\n");
    const result = await scanRepository(root, { onlyIds: ["root-readme", "documentation"], skipIds: ["documentation"] });
    expect(result.recursiveScans[0].result?.checks.map((check) => check.id)).toEqual(["root-readme"]);
  });

  it("does not read ignored README testing guidance or drop unrelated files named like noise directories", async () => {
    await put(".gitignore", "README.md\n");
    await put("README.md", "# Testing\nRun the tests\n");
    await put("package.json", "{}");
    await put("build", "an ordinary file");
    const tree = await inventoryTree(root);
    expect(tree.files).toContain("build");
    const result = await scanRepository(root, { onlyIds: ["testing-provision"], maxDepth: 0 });
    expect(result.checks[0].score).toBe(0);
    expect(result.checks[0].references).not.toContain("README.md");
  });

  it("attributes unreadable children and omits their scores", async () => {
    await put("broken/file.md");
    const original = fs.readdir.bind(fs);
    vi.spyOn(fs, "readdir").mockImplementation(async (directory, options) => {
      if (directory === path.join(root, "broken")) throw new Error("permission denied");
      return original(directory, options);
    });
    const result = await scanRepository(root, { onlyIds: ["root-readme"] });
    expect(result.recursiveScans[0]).toMatchObject({ path: "broken", error: expect.stringContaining("permission denied") });
    expect(result.rollupScore).toBe(result.localScore);
    const options = { ...result };
    expect(buildMarkdownReport(root, result.checks, result.overallScore, "now", options)).toContain("permission denied");
    expect(buildHtmlReport(root, result.checks, result.overallScore, "now", options)).toContain("permission denied");
  });
});

describe("report output exclusion", () => {
  it("excludes dedicated output but preserves unrelated timestamp-named files when output is root", async () => {
    await put("README.md");
    await put("harnix/old.md");
    await put("reports/old.md");
    await put("report-20000101T000000.md", "User-authored notes");
    const custom = await inventoryTree(root, path.join(root, "reports"));
    expect(custom.files).not.toContain("reports/old.md");
    // Default output is recognized when selected; arbitrary historical output directories are not.
    expect((await inventoryTree(root)).files).not.toContain("harnix/old.md");
    const before = await inventoryTree(root, root);
    await writeReportFiles(root, [], 0, root, { localScore: null, rollupScore: null });
    const after = await inventoryTree(root, root);
    expect(after.files).toEqual(before.files);
    expect(after.files).toContain("report-20000101T000000.md");
    expect(after.files).toContain("README.md");
  });

  it("keeps repeated production scans stable with nested custom output", async () => {
    await put("src/code.ts");
    await put("docs/README.md");
    const outputPath = path.join(root, "docs/reports");
    const first = await scanRepository(root, { outputPath });
    await writeReportFiles(root, first.checks, first.overallScore, outputPath, first);
    const second = await scanRepository(root, { outputPath });
    expect(second).toEqual(first);
  });
});

describe("local and recursive scores", () => {
  it("distinguishes unavailable from zero and permits scored children without local checks", async () => {
    await put("software/package.json", "{}");
    const result = await scanRepository(root, { repoType: "non-software", onlyIds: ["ci-pipeline"] });
    expect(result.localScore).toBeNull();
    expect(result.rollupScore).toBe(0);
    expect(result.recursiveScans[0].result?.localScore).toBe(0);
    const empty = await scanRepository(root, { onlyIds: ["unknown"] });
    expect(empty.localScore).toBeNull();
    expect(empty.rollupScore).toBeNull();
    expect(empty.overallScore).toBe(0);
    const md = buildMarkdownReport(root, [], 0, "now", empty);
    const html = buildHtmlReport(root, [], 0, "now", empty);
    for (const report of [md, html]) {
      expect(report).toContain("Unavailable");
      expect(report).not.toContain("Poor");
      expect(report).not.toContain("NaN");
    }
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    printConsoleReport(root, [], 0, empty);
    expect(log.mock.calls.flat().join("\n")).not.toContain("Poor");
  });

  it("averages only local and direct effective child scores", async () => {
    await put("README.md", "# Root\n".repeat(100));
    await put("child/leaf/README.md", "# Leaf\n".repeat(100));
    await fs.mkdir(path.join(root, "sibling"));
    const result = await scanRepository(root, { onlyIds: ["root-readme"] });
    const child = result.recursiveScans.find((entry) => entry.path === "child")!.result!;
    const sibling = result.recursiveScans.find((entry) => entry.path === "sibling")!.result!;
    expect(child.rollupScore).toBe((child.localScore! + child.recursiveScans[0].result!.localScore!) / 2);
    expect(result.rollupScore).toBe((result.localScore! + child.rollupScore! + sibling.localScore!) / 3);
    expect(result.overallScore).toBe(result.rollupScore);
    const base = { ...result, localScore: null, rollupScore: null } as ScanResult;
    expect(calculateRollup(null, [{ kind: "directory", path: "none", absolutePath: "none", result: base }])).toBeNull();
    expect(calculateRollup(0.6, [{ kind: "directory", path: "bad", absolutePath: "bad", error: "failed" }])).toBe(0.6);
  });

  it("keeps all child findings, references and recommendations in durable reports", async () => {
    await put("child/README.md", "tiny");
    const result = await scanRepository(root, { onlyIds: ["root-readme"] });
    const check = result.recursiveScans[0].result!.checks[0];
    const markdown = buildMarkdownReport(root, result.checks, result.overallScore, "now", result);
    const html = buildHtmlReport(root, result.checks, result.overallScore, "now", result);
    for (const report of [markdown, html]) {
      expect(report).toContain("Scan target: child");
      expect(report).toContain(check.details);
      for (const recommendation of check.recommendations) expect(report).toContain(recommendation);
      expect(report).toContain("Local score");
      expect(report).toContain("Rollup score");
    }
    result.recursiveScans[0].path = "<script>|bad";
    const escaped = buildHtmlReport(root, result.checks, result.overallScore, "now", result);
    expect(escaped).not.toContain("<script>|bad");
    expect(escaped).toContain("&lt;script&gt;|bad");
  });
});
