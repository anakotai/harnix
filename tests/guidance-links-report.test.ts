import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { buildHtmlReport, buildJsonReport, buildMarkdownReport, printConsoleReport, reportTimestamp } from "../src/report.js";
import { scanRepository } from "../src/engine.js";

let root: string;

async function write(file: string, content: string) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), content);
}

beforeEach(async () => {
  await fs.mkdir("tmp", { recursive: true });
  root = await fs.mkdtemp(path.resolve("tmp/guidance-links-report-"));
  await write("package.json", '{ "name": "fixture", "private": true }\n');
  await write("AGENTS.md", "Root overview lives in [the root doc](docs/missing-root.md), see also [child guidance](docs/README.md).\n");
  await write("docs/README.md", ["[child detail](missing-child.md)", "[back toward root](../AGENTS.md)"].join("\n") + "\n");
  // A passing child (3 verified, 1 broken = 0.75) that must still surface its finding.
  await write("docs2/README.md", ["[a](a.md)", "[b](b.md)", "[c](c.md)", "[broken](absent-child.md)"].join("\n") + "\n");
  await write("docs2/a.md", "a\n");
  await write("docs2/b.md", "b\n");
  await write("docs2/c.md", "c\n");
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("guidance-links across report formats", () => {
  it("attributes findings to their scan target consistently in console, Markdown, HTML, and JSON", async () => {
    const result = await scanRepository(root, { onlyIds: ["guidance-links"] });
    const rootCheck = result.checks.find((entry) => entry.id === "guidance-links");
    const docsChild = result.recursiveScans.find((entry) => entry.path === "docs");
    if (!rootCheck || !docsChild || !docsChild.result) {
      throw new Error("expected a root guidance-links check and an assessed docs child target");
    }
    const childCheck = docsChild.result.checks.find((entry) => entry.id === "guidance-links");
    if (!childCheck) {
      throw new Error("expected the docs child to report a guidance-links check");
    }

    // Recursive attribution: the child's own broken reference is assessed by the docs target.
    expect(childCheck.status).toBe("fail");
    expect(childCheck.details).toContain('- README.md:1 — "missing-child.md" resolves to missing-child.md — destination not found in the scan root');
    // Seen from docs/, ../AGENTS.md leaves the scan root: disclosed, never called missing.
    expect(childCheck.details).toContain("out-of-root: 1");
    expect(childCheck.details).not.toContain("resolves to AGENTS.md");
    // The root's one hop reaches docs/README.md and resolves its destinations against the root.
    expect(rootCheck.details).toContain('resolves to docs/missing-root.md');
    expect(rootCheck.details).toContain('resolves to docs/missing-child.md');

    const timestamp = reportTimestamp(new Date("2026-11-02T00:00:00Z"));
    const generatedAt = "2026-11-02T00:00:00.000Z";
    const reportOptions = {
      recursiveScans: result.recursiveScans,
      localScore: result.localScore,
      rollupScore: result.rollupScore,
      generatedAt,
    };

    const markdown = buildMarkdownReport(root, result.checks, result.overallScore, timestamp, { ...reportOptions, harnixVersion: "0.24.0" });
    const html = buildHtmlReport(root, result.checks, result.overallScore, timestamp, reportOptions);
    const json = JSON.parse(
      buildJsonReport({
        targetPath: root,
        generatedAt,
        runOptions: { skipIds: [], onlyIds: [], typeOverride: null, depth: null },
        scanResult: result,
      }),
    ) as {
      assessment: {
        checks: Array<{ id: string; details: string }>;
        children: Array<{ path: string; assessment: { checks: Array<{ id: string; details: string }> } | null }>;
      };
    };
    const consoleLogs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line?: unknown) => {
      consoleLogs.push(String(line));
    });
    printConsoleReport(root, result.checks, result.overallScore, { ...reportOptions, verbose: true });
    const consoleOutput = consoleLogs.join("\n");

    // All four formats carry findings; each reports paths within its own target's scope.
    const rootFinding = 'resolves to docs/missing-root.md';
    const childFinding = '- README.md:1 — "missing-child.md" resolves to missing-child.md — destination not found in the scan root';
    expect(markdown).toContain(rootFinding);
    expect(markdown).toContain(childFinding);
    expect(markdown).toContain("## Scan target: docs");
    expect(html).toContain(rootFinding);
    expect(html).toContain('README.md:1 — &quot;missing-child.md&quot; resolves to missing-child.md');
    expect(html).toContain("Scan target: docs");
    expect(json.assessment.checks.some((entry) => entry.id === "guidance-links" && entry.details.includes("docs/missing-child.md"))).toBe(true);
    expect(json.assessment.children.some((child) =>
      child.path === "docs" && child.assessment?.checks.some((entry) => entry.id === "guidance-links" && entry.details.includes("missing-child.md")))).toBe(true);
    expect(consoleOutput).toContain(rootFinding);
    expect(consoleOutput).toContain("Recursive target details:");
    expect(consoleOutput).toContain(childFinding);
    // A passing child with a broken reference still surfaces its finding in verbose console.
    const docs2Child = result.recursiveScans.find((entry) => entry.path === "docs2")!;
    const docs2Check = docs2Child.result?.checks.find((entry) => entry.id === "guidance-links");
    expect(docs2Check?.status).toBe("pass");
    expect(consoleOutput).toContain("[docs2] Guidance links");
    expect(consoleOutput).toContain("absent-child.md");
  });
});
