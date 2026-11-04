import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import check from "../../checks/review-md/check.js";
import { scanRepository } from "../../src/engine.js";
import { inventoryTree } from "../../src/scanner.js";
import { statusFromScore, type ScanContext } from "../../src/types.js";

const PROSE = "Report only findings supported by concrete evidence and reproducible behavior.";
let root: string;
async function put(name: string, content: string) {
  await fs.mkdir(path.dirname(path.join(root, name)), { recursive: true });
  await fs.writeFile(path.join(root, name), content);
}
async function assess() {
  const { files } = await inventoryTree(root);
  return check({ rootPath: root, files } as ScanContext);
}
beforeEach(async () => {
  await fs.mkdir(path.resolve("tmp"), { recursive: true });
  root = await fs.mkdtemp(path.resolve("tmp/review-md-"));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("review-md content", () => {
  it("fails without eligible evidence", async () => {
    expect(await assess()).toMatchObject({ id: "review-md", category: "documentation", tier: "nice-to-have", score: 0, status: "fail", references: [] });
  });

  it.each(["review.md", "Review.md", "docs/REVIEW.md"])("ignores %s at the parent target", async (name) => {
    await put(name, PROSE);
    expect(await assess()).toMatchObject({ score: 0, references: [] });
  });

  it.each([
    ["empty", "", 0.4],
    ["headings", "# Review\n## Evidence", 0.4],
    ["short body", "# Review\nBe specific.", 0.4],
    ["comments", `<!-- ${PROSE} -->`, 0.4],
    ["unclosed comment", `<!-- ${PROSE}`, 0.4],
    ["multiline comment", `<!--\n${PROSE}\n-->`, 0.4],
    ["comment in fenced example", `~~~markdown\n<!-- ${PROSE} -->\n~~~`, 1],
    ["unclosed comment in fenced example", `~~~markdown\n<!--\n~~~\n${PROSE}`, 1],
    ["comment-like fence info cannot hide later prose", `\`\`\`bash <!-- note\necho hi\n\`\`\`\n${PROSE}`, 1],
    ["fences hidden inside comments", "<!--\n```\n-->\n@long-canonical-review-rules-file.md", 0.4],
    ["frontmatter", `---\ndescription: ${PROSE}\n---\n# Review`, 0.4],
    ["frontmatter fence cannot expose hidden comments", `---\nexample: |\n  ~~~\n---\n<!-- ${PROSE} -->`, 0.4],
    ["frontmatter fence cannot inflate includes", "---\nexample: |\n  ```\n---\n@a-very-long-canonical-review-rules-file.md", 0.4],
    ["frontmatter comment cannot hide visible prose", `---\nexample: |\n  <!--\n---\n${PROSE}`, 1],
    ["BOM frontmatter and CRLF", `\uFEFF---\r\ndescription: ${PROSE}\r\n---\r\n# Review`, 0.4],
    ["shared paired-delimiter limitation", `# Review\n---\n${PROSE}\n---`, 0.4],
    ["single include", "@a-very-long-canonical-review-rules-file.md", 0.4],
    ["multiple includes", "# Review\n@security-review.md\n@evidence-review.md", 0.4],
    ["skill include", "@.claude/skills/api-review/SKILL.md", 0.4],
    ["short prose and include", "Be specific.\n@long-canonical-review-rules-file.md", 0.4],
    ["mixed prose and include", `${PROSE}\n@canonical.md`, 1],
    ["substantive", `# Review\n${PROSE}`, 1],
    ["29 characters", "a".repeat(29), 0.4],
    ["30 characters", "a".repeat(30), 1],
    ["normalized short body", "*a*   ".repeat(10), 0.4],
    ["comments do not inflate prose", `Be specific. <!-- ${PROSE} -->`, 0.4],
    ["backtick example", "```md\n@a-very-long-canonical-review-rules-file.md\n```", 1],
    ["tilde example", "~~~md\n@a-very-long-canonical-review-rules-file.md\n~~~", 1],
    ["BOM fenced example", "\uFEFF~~~md\n@a-very-long-canonical-review-rules-file.md\n~~~", 1],
    ["list nested fenced example", "- example:\n\n    ```md\n    @a-very-long-canonical-review-rules-file.md\n    ```", 1],
    ["blockquote fenced comment", `> ~~~markdown\n> <!-- ${PROSE} -->\n> ~~~`, 1],
    ["list marker fence opener", `- ~~~markdown\n  <!-- ${PROSE} -->\n  ~~~`, 1],
    ["bulleted text is not a standalone include", "- @a-very-long-canonical-review-rules-file.md", 1],
    ["quoted text is not a standalone include", "> @a-very-long-canonical-review-rules-file.md", 1],
    ["long outer fence", "````md\n```\n@a-very-long-canonical-review-rules-file.md\n```\n````", 1],
    ["inline at mention", "Discuss @reviewers and cite concrete behavior changes.", 1],
    ["standalone token uses broad include heuristic", "@backend-reviewers-with-a-long-team-name", 0.4],
  ])("scores %s", async (_name, content, score) => {
    await put("REVIEW.md", content);
    const result = await assess();
    expect(result.score).toBe(score);
    expect(result.status).toBe(statusFromScore(score));
    expect(result.references).toEqual(["REVIEW.md"]);
  });

  it("explains include limitations without requiring canonical duplication", async () => {
    await put("REVIEW.md", "@canonical-review-rules-with-a-long-name.md");
    const result = await assess();
    expect(result.details).toContain("referenced content was not expanded, validated, or assessed");
    expect(result.recommendations.join(" ")).toContain("Retain canonical rules");
    expect(result.details).not.toContain("placeholder");
  });

  it("does not detect fenced examples as active includes", async () => {
    await put("REVIEW.md", "~~~markdown\n@long-canonical-review-rules-example.md\n~~~");
    expect((await assess()).details).not.toContain("Standalone include references were found");
  });

  it("recognizes includes after a fence closes without counting their paths", async () => {
    await put("REVIEW.md", "~~~\n~~~\n@a-very-long-canonical-review-rules-file.md");
    const result = await assess();
    expect(result.score).toBe(0.4);
    expect(result.details).toContain("Standalone include references were found");
  });

  it("keeps nested fenced examples out of active include detection", async () => {
    await put("REVIEW.md", "- example:\n\n    ```md\n    @a-very-long-canonical-review-rules-file.md\n    ```");
    expect((await assess()).details).not.toContain("Standalone include references were found");
  });

  it("detects includes after comment-like fence info closes", async () => {
    await put("REVIEW.md", "```bash <!-- note\necho hi\n```\n@long-canonical-review-rules-file.md");
    const result = await assess();
    expect(result.score).toBe(0.4);
    expect(result.details).toContain("Standalone include references were found");
  });

  it("credits only presence after a deterministic read failure", async () => {
    await put("REVIEW.md", PROSE);
    const read = fs.readFile.bind(fs);
    vi.spyOn(fs, "readFile").mockImplementation(async (file, options) => {
      if (file === path.join(root, "REVIEW.md")) throw new Error("simulated read failure");
      return read(file, options);
    });
    const result = await assess();
    expect(result).toMatchObject({ score: 0.1, status: "fail", references: ["REVIEW.md"], details: expect.stringContaining("file presence only") });
    expect(result.details).toContain("simulated read failure");
  });
});

describe("review-md real inventory and assessment", () => {
  it("attributes nested evidence only to its target and honors depth", async () => {
    await put("docs/REVIEW.md", PROSE);
    const result = await scanRepository(root, { onlyIds: ["review-md"] });
    expect(result.checks).toHaveLength(1);
    expect(result.checks[0]).toMatchObject({ score: 0, references: [] });
    expect(result.recursiveScans[0]).toMatchObject({ path: "docs", result: { repoType: "non-software", checks: [{ id: "review-md", score: 1, references: ["REVIEW.md"] }] } });
    const limited = await scanRepository(root, { onlyIds: ["review-md"], maxDepth: 0 });
    expect(limited.recursiveScans).toEqual([]);
    expect(limited.checks[0].score).toBe(0);
    const skipped = await scanRepository(root, { skipIds: ["review-md"] });
    expect(skipped.checks.some((entry) => entry.id === "review-md")).toBe(false);
    expect(skipped.recursiveScans[0].result?.checks.some((entry) => entry.id === "review-md")).toBe(false);
  });

  it("honors ignores, noise, and excluded symlinks", async () => {
    await put(".gitignore", "/REVIEW.md\nignored/\n");
    for (const name of ["REVIEW.md", "ignored/REVIEW.md", "node_modules/REVIEW.md", "harnix/REVIEW.md", "visible/canonical.md"]) await put(name, PROSE);
    await fs.symlink(path.join(root, "visible/canonical.md"), path.join(root, "visible/REVIEW.md"));
    const result = await scanRepository(root, { onlyIds: ["review-md"] });
    expect(result.checks[0]).toMatchObject({ score: 0, references: [] });
    expect(result.recursiveScans.map((entry) => entry.path)).toEqual(["visible"]);
    expect(result.recursiveScans[0].result?.checks[0]).toMatchObject({ score: 0, references: [] });
  });
});
