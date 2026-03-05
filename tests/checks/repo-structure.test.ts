import { describe, it, expect } from "vitest";
import path from "node:path";
import type { ScanContext } from "../../src/types.js";
import repoStructureCheck from "../../checks/repo-structure/check.js";

const FIXTURES = path.resolve(import.meta.dirname!, "..", "fixtures");

function makeCtx(files: string[], gitInfo?: Partial<ScanContext["gitInfo"]>): ScanContext {
  return {
    rootPath: path.join(FIXTURES, "pass-all"),
    files,
    repoType: "software",
    gitInfo: {
      hasSubmodules: false,
      submodules: [],
      hasWorkspaces: false,
      workspaces: [],
      workspaceConfig: {
        npmWorkspaces: false,
        pnpmWorkspace: false,
        cargoWorkspace: false,
        lerna: false,
        nx: false,
        turborepo: false,
        detected: [],
      },
      ...gitInfo,
    },
  };
}

describe("repo-structure check", () => {
  it("passes with src/ directory and good separation", async () => {
    const files = [
      "package.json",
      "tsconfig.json",
      "src/index.ts",
      "src/utils.ts",
      "src/cli.ts",
      "tests/index.test.ts",
      "docs/readme.md",
    ];
    const result = await repoStructureCheck(makeCtx(files));
    expect(result.id).toBe("repo-structure");
    expect(result.status).toBe("pass");
    // sourceOrg(0.35) + goodSep(0.25) + basic(0.15) = 0.75
    expect(result.score).toBeGreaterThanOrEqual(0.75);
  });

  it("fails when all files are at root level", async () => {
    const files = ["file1.txt", "file2.txt", "file3.txt"];
    const result = await repoStructureCheck(makeCtx(files));
    expect(result.score).toBeLessThanOrEqual(0.15);
    expect(result.status).toBe("fail");
  });

  it("returns partial when src/ exists but root is cluttered", async () => {
    const files = [
      "a.js",
      "b.js",
      "c.js",
      "d.js",
      "e.js",
      "f.js",
      "g.js",
      "h.js",
      "i.js",
      "src/index.ts",
    ];
    const result = await repoStructureCheck(makeCtx(files));
    // sourceOrg(0.35) + no goodSep (root ratio 9/10=90%) + basic(0.15) = 0.5
    expect(result.score).toBeGreaterThanOrEqual(0.25);
    expect(result.score).toBeLessThan(0.75);
    expect(result.status).toBe("partial");
  });
});
