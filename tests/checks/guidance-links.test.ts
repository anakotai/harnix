import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import check from "../../checks/guidance-links/check.js";
import { listFiles } from "../../src/scanner.js";
import type { ScanContext } from "../../src/types.js";

let root: string;

async function write(file: string, content: string) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), content);
}

async function symlink(target: string, linkPath: string) {
  await fs.mkdir(path.dirname(path.join(root, linkPath)), { recursive: true });
  await fs.symlink(target, path.join(root, linkPath));
}

async function run(repoType: ScanContext["repoType"] = "software") {
  const ctx: ScanContext = {
    rootPath: root,
    files: await listFiles(root),
    repoType,
    gitInfo: { hasSubmodules: false, submodules: [], hasWorkspaces: false, workspaces: [], workspaceConfig: {} },
  };
  return check(ctx);
}

function lines(...parts: string[]): string {
  return `${parts.join("\n")}\n`;
}

beforeEach(async () => {
  await fs.mkdir("tmp", { recursive: true });
  root = await fs.mkdtemp(path.resolve("tmp/guidance-links-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("guidance-links", () => {
  it("reports both reproduction links with source locations and a directory-safe score", async () => {
    await write("docs/overview.md", "# Overview\n");
    await write(
      "README.md",
      lines(
        "# Demo",
        "",
        "Setup: [setup guide](docs/missing-setup.md)",
        "Verify: [verification guide](docs/missing-verification.md)",
        "Overview: [overview](docs/overview.md)",
      ),
    );
    const result = await run();
    expect(result.status).toBe("partial");
    expect(result.score).toBeCloseTo(1 / 3);
    expect(result.details).toContain('- README.md:3 — "docs/missing-setup.md" resolves to docs/missing-setup.md — destination not found in the scan root');
    expect(result.details).toContain('- README.md:4 — "docs/missing-verification.md" resolves to docs/missing-verification.md — destination not found in the scan root');
    expect(result.recommendations).toHaveLength(2);
    expect(result.summary).toContain("2 of 3 in-scope destination(s) broken");
    expect(result.references).toEqual(["README.md", "docs/overview.md"]);
  });

  it("handles valid relative links, encoded paths, angle destinations, and file fragments", async () => {
    await write("docs/overview.md", "# Overview\n");
    await write(
      "README.md",
      lines(
        "[plain](docs/overview.md)",
        "[encoded](./docs/%6Fverview.md)",
        "[angled](<docs/overview.md#intro>)",
        "[fragment-only](#intro)",
      ),
    );
    const result = await run();
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    expect(result.details).toContain("No broken local references found.");
    expect(result.details).toContain("Excluded from assessment, not reported as missing: fragment-only: 1.");
  });

  it("handles destinations with one nesting level of balanced parentheses", async () => {
    await write("docs/report(1).md", "# report\n");
    await write("docs/Spec (v2).md", "content\n");
    await write(
      "README.md",
      lines(
        "[balanced](docs/report(1).md)",
        "[spec](<docs/Spec (v2).md>)",
        "[missing-balanced](docs/absent(1).md)",
        "[defined][r]",
        "",
        "[r]: docs/absent-ref(1).md",
      ),
    );
    const result = await run();
    expect(result.details).toContain('- README.md:3 — "docs/absent(1).md" resolves to docs/absent(1).md — destination not found in the scan root');
    expect(result.details).toContain('- README.md:4 — "docs/absent-ref(1).md" resolves to docs/absent-ref(1).md — destination not found in the scan root');
    expect(result.details).not.toContain('"docs/report(1"');
    expect(result.details).not.toContain('"docs/Spec (v2"');
    expect(result.summary).toContain("2 of 4 in-scope destination(s) broken");
  });

  it("discloses non-regular destinations instead of opening them", async () => {
    await write("README.md", lines("[pipe](docs/pipe.md)"));
    await fs.mkdir(path.join(root, "docs"), { recursive: true });
    const { execSync } = await import("node:child_process");
    execSync(`mkfifo ${JSON.stringify(path.join(root, "docs/pipe.md"))}`);
    const result = await run();
    expect(result.status).toBe("not-assessed");
    expect(result.details).toContain("not-a-file: 1");
    expect(result.details).not.toContain("not readable");
  });

  it("reveals links written after a fenced HTML comment open, without masking into it", async () => {
    await write(
      "README.md",
      lines(
        "```html",
        "<!-- an unterminated sample comment inside code",
        "```",
        "[real](docs/overview.md)",
      ),
    );
    await write("docs/overview.md", "# Overview\n");
    const result = await run();
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
  });

  it("caps recommendations and discloses the omission when many destinations break", async () => {
    const targets: string[] = [];
    for (let index = 0; index < 60; index += 1) {
      targets.push(`[broken-${index}](absent-${index}.md)`);
    }
    await write("README.md", targets.join("\n") + "\n");
    const result = await run();
    expect(result.recommendations).toHaveLength(51);
    expect(result.details).toContain(`first ${50} of ${60}`);
    expect(result.recommendations[50]).toContain("10 more broken destination(s) omitted");
  });

  it("discloses uninhabited directory destinations instead of verifying them", async () => {
    await fs.mkdir(path.join(root, "empty-docs"), { recursive: true });
    await write("README.md", lines("[empty](empty-docs/)"));
    const result = await run();
    expect(result.status).toBe("not-assessed");
    expect(result.details).toContain("present-unscanned: 1");
  });

  it("ignores links in fenced code, inline code, HTML comments, and images", async () => {    await write(
      "README.md",
      lines(
        "```text",
        "[looks broken](docs/absent-a.md)",
        "```",
        "`[inline broken](docs/absent-b.md)`",
        "<!-- [comment broken](docs/absent-c.md) -->",
        "![banner](docs/absent-logo.png)",
      ),
    );
    const result = await run("non-software");
    expect(result.status).toBe("not-assessed");
    expect(result.details).toContain("no relative local file destinations in guidance");
    expect(result.recommendations).toEqual([]);
    expect(result.score).toBe(0);
  });

  it("distinguishes external, absolute, harness-import, and query destinations without missing findings", async () => {
    await write("README.md", lines("[site](https://example.com)", "[root](/etc/harnix.md)", "[agent](@skills/cooking/SKILL.md)", "[home](~/docs/guide.md)", "[query](docs/x.md?v=1)"));
    const result = await run();
    expect(result.status).toBe("not-assessed");
    expect(result.details).toContain("external: 1");
    expect(result.details).toContain("absolute: 1");
    expect(result.details).toContain("harness-import: 2");
    expect(result.details).toContain("query: 1");
    expect(result.summary).toContain("destination occurrences are outside local-file scope");
  });

  it("ignores GitHub-flavored footnotes in definition and use positions", async () => {
    await write(
      "README.md",
      lines(
        "Setup: [setup](docs/setup.md)",
        "Details below.[^src]",
        "",
        "[^src]: Run `pnpm install` before scanning.",
      ),
    );
    await write("docs/setup.md", "# Setup\n");
    const result = await run();
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    expect(result.details).toContain("No broken local references found.");
    expect(result.details).not.toContain('"Run"');
    expect(result.summary).toContain("1 in-scope destination(s) verified, none broken");
  });

  it("reports vendored destinations like any other inventory path", async () => {
    await write("vendor/notes.md", "# Notes\n");
    await write("README.md", lines("[notes](vendor/notes.md)", "[gone](vendor/missing.md)"));
    const result = await run();
    expect(result.details).toContain('resolves to vendor/missing.md — destination not found in the scan root');
    expect(result.details).not.toContain("noise-excluded");
    expect(result.summary).toContain("1 of 2");
  });

  it("does not report present-but-unscanned destinations as missing", async () => {
    await write(".gitignore", "drafts/\n");
    await write("drafts/plan.md", "# Draft\n");
    await write("README.md", lines("[draft](drafts/plan.md)"));
    const result = await run();
    expect(result.status).toBe("not-assessed");
    expect(result.details).toContain("present-unscanned: 1");
    expect(result.details).not.toContain("not found in the scan root");
  });

  it("discloses out-of-root and symlink-escape destinations, never calling them missing", async () => {
    const parentReal = path.resolve(root, "..");
    await fs.writeFile(path.join(parentReal, "guidance-links-outside.md"), "# Outside\n");
    try {
      await write("README.md", lines("[escape](../guidance-links-outside.md)", "[through-link](guides/absent.md)"));
      await symlink(path.join(parentReal, "guidance-links-outside-dir"), "guides");
      await fs.mkdir(path.join(parentReal, "guidance-links-outside-dir"), { recursive: true });
      const result = await run();
      expect(result.status).toBe("not-assessed");
      expect(result.details).toContain("out-of-root: 2");
      expect(result.details).not.toContain("not found in the scan root");
    } finally {
      await fs.rm(path.join(parentReal, "guidance-links-outside-dir"), { recursive: true, force: true });
      await fs.rm(path.join(parentReal, "guidance-links-outside.md"), { force: true });
    }
  });

  it("verifies in-root symlink aliases to scannable directories as present-unscanned, not missing", async () => {
    await write("docs/overview.md", "# Overview\n");
    await symlink("docs", "guides");
    await write("README.md", lines("[alias](guides/overview.md)"));
    const result = await run();
    expect(result.details).toContain("present-unscanned: 1");
    expect(result.details).not.toContain("not found in the scan root");
  });

  it("reports broken symlink destinations as missing", async () => {
    await write("docs/overview.md", "# Overview\n");
    await symlink("no-such-target.md", "docs/lost.md");
    await write("README.md", lines("[lost](docs/lost.md)", "[kept](docs/overview.md)"));
    const result = await run();
    expect(result.status).toBe("partial");
    expect(result.score).toBe(0.5);
    expect(result.details).toContain("- README.md:1 — \"docs/lost.md\" resolves to docs/lost.md — destination is a symlink whose target is missing");
  });

  it("counts directory destinations as verified existence and separates link-text formatting", async () => {
    await write("docs/overview.md", "# Overview\n");
    await write("README.md", lines("[docs dir](docs/)", "[notes](docs/overview.md)"));
    const result = await run();
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    expect(result.details).toContain("verified incl. 1 directory");
  });

  it("enforces the one-hop five-file traversal limit deterministically", async () => {
    await write(
      "README.md",
      lines(
        "[one](docs/page-1.md)",
        "[two](docs/page-2.md)",
        "[three](docs/page-3.md)",
        "[four](docs/page-4.md)",
        "[five](docs/page-5.md)",
        "[six](docs/page-6.md)",
      ),
    );
    for (let index = 1; index <= 6; index += 1) {
      await write(`docs/page-${index}.md`, `[broken](absent-${index}.md)\n`);
    }
    const result = await run();
    expect(result.details).toContain(`at most 5 unique linked files (5 followed); additional eligible linked files omitted`);
    expect(result.details).toContain('- docs/page-1.md:1 — "absent-1.md" resolves to docs/absent-1.md');
    expect(result.details).toContain('resolves to docs/absent-5.md');
    expect(result.details).not.toContain("docs/absent-6.md");
    expect(result.recommendations).toHaveLength(5);
    expect(result.summary).toContain("5 of 11 in-scope destination(s) broken");
  });

  it("checks one-hop linked pages without crawling a second hop", async () => {
    await write("README.md", lines("[a](docs/a.md)"));
    await write("docs/a.md", lines("[broken](absent-a.md)", "[c](c.md)"));
    await write("docs/c.md", lines("[broken-two](absent-c.md)"));
    const result = await run();
    expect(result.details).toContain("Traversal: one hop from root guidance into linked Markdown; at most 5 unique linked files (1 followed).");
    expect(result.summary).toContain("1 of 3 in-scope destination(s) broken");
    expect(result.details).toContain('- docs/a.md:1 — "absent-a.md" resolves to docs/absent-a.md — destination not found in the scan root');
    expect(result.details).not.toContain("docs/absent-c.md");
    expect(result.references).toEqual(["README.md", "docs/a.md"]);
  });

  it("resolves reference-style links with their definition destination at the use-site line", async () => {
    await write("README.md", lines("[guide][g]", "", "[g]: docs/missing-guide.md"));
    const result = await run();
    expect(result.details).toContain('- README.md:1 — "docs/missing-guide.md"');
  });

  it("checks README.txt when it contains Markdown links", async () => {
    await write("README.txt", lines("[reference](docs/absent.txt)"));
    const result = await run();
    expect(result.details).toContain("- README.txt:1");
    expect(result.details).toContain("resolves to docs/absent.txt");
  });

  it("orders findings deterministically across sources and lines", async () => {
    await write("AGENTS.md", lines("[late](docs/agents-absent.md)"));
    await write("README.md", lines("[second](docs/readme-absent-2.md)", "[first](docs/readme-absent-1.md)"));
    const result = await run();
    const agents = result.details.indexOf("- AGENTS.md:1 — \"docs/agents-absent.md\"");
    const readmeFirst = result.details.indexOf("- README.md:1 — \"docs/readme-absent-2.md\"");
    const readmeSecond = result.details.indexOf("- README.md:2 — \"docs/readme-absent-1.md\"");
    expect(agents).toBeGreaterThanOrEqual(0);
    expect(readmeFirst).toBeGreaterThan(agents);
    expect(readmeSecond).toBeGreaterThan(readmeFirst);
  });

  it("stays not-assessed without guidance files and under --only keeps rollup unavailable", async () => {
    await write("docs/notes.txt", "plain\n");
    const result = await run();
    expect(result.status).toBe("not-assessed");
    expect(result.summary).toContain("Not assessed: no root operating guidance in inventory");
    expect(result.recommendations).toEqual([]);
    expect(result.references).toEqual([]);

    const { scanRepository } = await import("../../src/engine.js");
    const scan = await scanRepository(root, { recursive: false, onlyIds: ["guidance-links"] });
    expect(scan.overallScore).toBe(0);
    expect(scan.localScore).toBeNull();
    expect(scan.rollupScore).toBeNull();
  });

  it("is not assessed when guidance has no Markdown links or only out-of-scope links", async () => {
    await write("README.md", "No links at all, just prose.\n");
    const noLinks = await run();
    expect(noLinks.status).toBe("not-assessed");

    await fs.writeFile(path.join(root, "README.md"), "[only external](https://example.com)\n");
    const externalOnly = await run();
    expect(externalOnly.status).toBe("not-assessed");
    expect(externalOnly.details).toContain("external: 1");
  });

  it("passes at full verification of mixed destinations including one-hop dedupe", async () => {
    await write("docs/overview.md", "# Overview\n");
    await write(
      "README.md",
      lines(
        "[readme](README.md)",
        "[overview](docs/overview.md)",
        "[overview-again](./docs/overview.md)",
      ),
    );
    const result = await run();
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    // Root sources dedupe; a linked Markdown page added once as a followed source is listed once.
    expect(result.references).toEqual(["README.md", "docs/overview.md"]);
  });

  it.skipIf(process.getuid?.() === 0)("reports unreadable destinations distinctly from missing ones", async () => {
    await write("docs/overview.md", "# Overview\n");
    await write("docs/locked.md", "secret\n");
    await fs.chmod(path.join(root, "docs/locked.md"), 0o000);
    try {
      await write("README.md", lines("[locked](docs/locked.md)", "[opened](docs/overview.md)"));
      const result = await run();
      expect(result.status).toBe("partial");
      expect(result.score).toBe(0.5);
      expect(result.details).toContain("- README.md:1 — \"docs/locked.md\" resolves to docs/locked.md — destination exists but is not readable");
    } finally {
      await fs.chmod(path.join(root, "docs/locked.md"), 0o644);
    }
  });
});
