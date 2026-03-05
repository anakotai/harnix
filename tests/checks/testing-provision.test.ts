import { describe, it, expect } from "vitest";
import path from "node:path";
import type { ScanContext } from "../../src/types.js";
import testingProvisionCheck from "../../checks/testing-provision/check.js";

const FIXTURES = path.resolve(import.meta.dirname!, "..", "fixtures");

function makeCtx(fixtureName: string, files: string[]): ScanContext {
  return {
    rootPath: path.join(FIXTURES, fixtureName),
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
    },
  };
}

describe("testing-provision check", () => {
  it("passes with test files, isolated test dir, and testing docs", async () => {
    const ctx = makeCtx("pass-all", [
      "README.md",
      "tests/example.test.ts",
      "package.json",
    ]);
    const result = await testingProvisionCheck(ctx);
    expect(result.id).toBe("testing-provision");
    // hasTests (0.6) + hasIsolatedTests (0.25) + hasTestingDocs via README (0.15) = 1.0
    expect(result.score).toBe(1);
    expect(result.status).toBe("pass");
  });

  it("fails when no test files exist", async () => {
    const ctx = makeCtx("fail-all", ["notes.txt"]);
    const result = await testingProvisionCheck(ctx);
    expect(result.score).toBe(0);
    expect(result.status).toBe("fail");
  });

  it("returns partial score with co-located test file but no test dir", async () => {
    const ctx = makeCtx("partial", [
      "README.md",
      "package.json",
      "src/main.ts",
      "src/main.test.ts",
    ]);
    const result = await testingProvisionCheck(ctx);
    // hasTests (0.6) + no isolated dir (0) + no testing docs in partial README (0) = 0.6
    expect(result.score).toBeGreaterThanOrEqual(0.6);
    expect(result.status).toBe("partial");
  });
});
