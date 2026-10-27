import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import check from "../../checks/operating-commands/check.js";
import { listFiles } from "../../src/scanner.js";
import { scanRepository, tierWeight } from "../../src/engine.js";
import type { ScanContext } from "../../src/types.js";

let root: string;
async function write(file: string, content: string) {
  await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true });
  await fs.writeFile(path.join(root, file), content);
}
async function run() {
  const ctx: ScanContext = { rootPath: root, files: await listFiles(root), repoType: "software",
    gitInfo: { hasSubmodules: false, submodules: [], hasWorkspaces: false, workspaces: [], workspaceConfig: {} } };
  return check(ctx);
}
async function manifest(value: unknown = { dependencies: { foo: "1" }, scripts: { test: "vitest", build: "tsc", dev: "node app" } }) {
  await write("package.json", JSON.stringify(value));
}

beforeEach(async () => {
  await fs.mkdir("tmp", { recursive: true });
  root = await fs.mkdtemp(path.resolve("tmp/operating-commands-"));
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

describe("operating-commands", () => {
  it("ignores prose and reports all missing applicable categories", async () => {
    await manifest();
    await write("README.md", "Install with npm install. Use npm test, npm run build, npm run dev.");
    const result = await run();
    expect(result.score).toBe(0);
    expect(result.details).toContain("Missing: setup, verification, build, run");
    expect(result.recommendations).toHaveLength(4);
  });

  it.each(["npm", "pnpm", "yarn", "bun"])("recognizes %s examples in canonical CONTRIBUTING guidance", async (manager) => {
    await manifest();
    await write("CONTRIBUTING.md", `~~~sh\n$ ${manager} install --frozen-lockfile\n${manager} test\n${manager} run build && ${manager} run dev\n~~~`);
    const result = await run();
    expect(result.score).toBe(1);
    expect(result.references).toEqual(["CONTRIBUTING.md"]);
  });

  it("equally weights only applicable categories for libraries", async () => {
    await manifest({ devDependencies: { vitest: "1" }, scripts: { test: "vitest", build: "tsc" } });
    await write("README.txt", "`npm ci` and `npm test`");
    const result = await run();
    expect(result.score).toBeCloseTo(2 / 3);
    expect(result.details).toContain("Applicable: setup, verification, build.");
    expect(result.details).toContain("Missing: build.");
  });

  it.each(["yarn --immutable", "yarn --frozen-lockfile"])("recognizes implicit Yarn install with flags: %s", async (command) => {
    await manifest({ dependencies: { foo: "1" } });
    await write("README.md", `\`${command}\``);
    expect((await run()).score).toBe(1);
  });

  it.each(["yarn --global", "yarn -g", "yarn --immutable lodash"])("does not treat global or package installs as setup: %s", async (command) => {
    await manifest({ dependencies: { foo: "1" } });
    await write("README.md", `\`${command}\``);
    expect((await run()).score).toBe(0);
  });

  it("uses a local test suite without a test script", async () => {
    await manifest({});
    await write("src/example.spec.ts", "export {};");
    await write("README.md", "`bun test`");
    expect((await run()).score).toBe(1);
  });

  it("does not infer local tests from nested packages or vendored tests", async () => {
    await manifest({});
    await write("child/package.json", "{}");
    await write("child/tests/example.test.ts", "");
    await write("vendor/tests/example.test.ts", "");
    expect((await run()).status).toBe("not-assessed");
  });

  it.each(["npm install <package>", "npm i lodash", "npm install -g", "npm test ...", "npm run dev $PORT", "npm run build {target}", "echo npm test", "npm testing", "npm run test-TODO"])("ignores placeholder or unrelated command %s", async (command) => {
    await manifest();
    await write("README.md", `\`${command}\``);
    expect((await run()).score).toBe(0);
  });

  it("ignores HTML comments and commands in link text", async () => {
    await manifest();
    await write("README.md", "<!-- `npm ci` -->\n[npm test](https://example.com)\n```text\necho npm run build\n```");
    expect((await run()).score).toBe(0);
  });

  it("ignores shell comments even when they contain command separators", async () => {
    await manifest();
    await write("README.md", "```sh\n# documentation; npm test\nnpm ci # example; npm run build\n```");
    const result = await run();
    expect(result.score).toBe(0.25);
    expect(result.details).toContain("Found: setup.");
  });

  it("does not traverse inline or reference-style images", async () => {
    await manifest();
    await write("README.md", "![badge][commands]\n![other](commands.md)\n[commands]: commands.md");
    await write("commands.md", "`npm ci`\n`npm test`");
    const result = await run();
    expect(result.score).toBe(0);
    expect(result.references).toEqual(["README.md"]);
  });

  it("follows inline and reference links, fragments, encoded paths, and reads one hop only", async () => {
    await manifest();
    await write("README.md", "[setup](./guides/setup%20guide.md#install)\n[tests][test]\n[test]: guides/test.md#usage");
    await write("guides/setup guide.md", "`npm ci`\n[deeper](../deep.md)");
    await write("guides/test.md", "`npm test`");
    await write("deep.md", "`npm run build`\n`npm run dev`");
    const result = await run();
    expect(result.score).toBe(0.5);
    expect(result.references).toEqual(["README.md", "guides/setup guide.md", "guides/test.md"]);
  });

  it("sorts links and limits traversal to five unique targets regardless of link order", async () => {
    await manifest();
    await write("README.md", [6, 5, 4, 3, 2, 1].map((n) => `[${n}](guide${n}.md)`).join("\n"));
    for (let n = 1; n <= 6; n++) await write(`guide${n}.md`, n === 6 ? "`npm ci`" : "# Guidance");
    await fs.symlink("guide1.md", path.join(root, "alias.md"));
    await write("CONTRIBUTING.md", "[alias](alias.md)");
    const result = await run();
    expect(result.score).toBe(0);
    expect(result.details).toContain("additional eligible links omitted");
    expect(result.references).not.toContain("guide6.md");
    expect(result.references.filter((f) => f === "alias.md" || f === "guide1.md")).toHaveLength(1);
  });

  it("rejects escapes, external links, harness imports, code links and noise", async () => {
    await manifest();
    await write("README.md", "[noise](node_modules/commands.md) [vendor](vendor/commands.md) [external](https://example.com) [escape](../outside.md)\n@guide.md\n`[code](guide.md)`");
    await write("node_modules/commands.md", "`npm ci`");
    await write("vendor/commands.md", "`npm test`");
    await write("guide.md", "`npm run build`");
    await fs.symlink("/etc/hosts", path.join(root, "escape.md"));
    await write("CLAUDE.md", "[escape](escape.md)");
    expect((await run()).score).toBe(0);
  });

  it("rejects an in-root symlink to noise even when the alias is inventoried", async () => {
    await manifest();
    await write("node_modules/commands.md", "`npm ci`");
    await fs.symlink("node_modules/commands.md", path.join(root, "alias.md"));
    await write("README.md", "[alias](alias.md)");
    expect((await run()).score).toBe(0);
  });

  it("discloses unreadable roots and linked targets and continues", async () => {
    await manifest();
    await write("README.md", "[commands](commands.md)");
    await write("AGENTS.md", "`npm ci`");
    await write("commands.md", "`npm test`");
    const original = fs.readFile.bind(fs);
    vi.spyOn(fs, "readFile").mockImplementation((...args: Parameters<typeof fs.readFile>) => {
      if (/(AGENTS|commands)\.md$/.test(String(args[0]))) return Promise.reject(new Error("denied"));
      return original(...args);
    });
    const result = await run();
    expect(result.score).toBe(0);
    expect(result.details).toContain("Unreadable guidance: AGENTS.md, commands.md");
  });

  it.each([{}, [], null, { scripts: { test: "", build: " " } }])("does not assess targets with no applicable categories or invalid objects: %j", async (value) => {
    await manifest(value);
    expect((await run()).status).toBe("not-assessed");
  });

  it("leaves unsupported ecosystems undetermined, including parents of Node packages", async () => {
    await write("pyproject.toml", "[project]");
    await write("child/package.json", '{"scripts":{"test":"vitest"}}');
    expect((await run()).status).toBe("not-assessed");
    await write("package.json", "invalid");
    expect((await run()).status).toBe("not-assessed");
  });

  it("excludes not-assessed results from engine scoring and honors software-only applicability", async () => {
    await manifest({});
    await write("README.md", "# Library\nThis library provides useful functions for consuming applications.");
    const options = { onlyIds: ["root-readme", "operating-commands"], recursive: false };
    const result = await scanRepository(root, options);
    expect(result.checks.find((c) => c.id === "operating-commands")?.status).toBe("not-assessed");
    expect(result.overallScore).toBeCloseTo(result.checks.find((c) => c.id === "root-readme")!.score);
    const only = await scanRepository(root, { ...options, onlyIds: ["operating-commands"] });
    expect(only.overallScore).toBe(0);
    expect(only.localScore).toBeNull();
    expect(only.rollupScore).toBeNull();
    const nonsoftware = await scanRepository(root, { ...options, repoType: "non-software" });
    expect(nonsoftware.checks.some((c) => c.id === "operating-commands")).toBe(false);
    await manifest();
    const assessed = await scanRepository(root, options);
    const sum = assessed.checks.reduce((n, c) => n + c.score * tierWeight(c.tier), 0);
    expect(assessed.overallScore).toBe(sum / 5);
  });

  it("excludes not-assessed local targets from recursive rollup and honors ignored guidance", async () => {
    await manifest({});
    await write("a/package.json", '{"scripts":{"test":"vitest"}}');
    await write("a/README.md", "`npm test`");
    await write("b/package.json", "{}");
    const result = await scanRepository(root, { onlyIds: ["operating-commands"] });
    expect(result.localScore).toBeNull();
    expect(result.rollupScore).toBe(1);
    expect(result.recursiveScans.find((child) => child.path === "b")?.result?.localScore).toBeNull();
    await manifest({ dependencies: { foo: "1" } });
    await write(".gitignore", "commands.md\n");
    await write("README.md", "[setup](commands.md)");
    await write("commands.md", "`npm ci`");
    const ignored = await scanRepository(root, { onlyIds: ["operating-commands"], recursive: false });
    expect(ignored.checks[0].score).toBe(0);
    expect(ignored.checks[0].references).not.toContain("commands.md");
  });
});
