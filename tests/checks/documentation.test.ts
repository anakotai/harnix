import { describe, it, expect } from "vitest";
import path from "node:path";
import type { ScanContext } from "../../src/types.js";
import documentationCheck from "../../checks/documentation/check.js";

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

describe("documentation check", () => {
  it("passes with substantive README and docs directory", async () => {
    const ctx = makeCtx("pass-all", [
      "README.md",
      "docs/guide.md",
      "prds/example.md",
      "package.json",
    ]);
    const result = await documentationCheck(ctx);
    expect(result.id).toBe("documentation");
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    expect(result.tier).toBe("critical");
  });

  it("fails when no README.md exists", async () => {
    const ctx = makeCtx("fail-all", ["notes.txt"]);
    const result = await documentationCheck(ctx);
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0.2);
  });

  it("returns partial score for brief README without docs", async () => {
    const ctx = makeCtx("partial", ["README.md", "package.json", "src/main.ts"]);
    const result = await documentationCheck(ctx);
    // Brief README (< 120 chars) without docs => 0.3
    expect(result.score).toBe(0.3);
    expect(result.status).toBe("partial");
    expect(result.summary).toContain("brief");
  });
});
