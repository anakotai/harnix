import { describe, it, expect } from "vitest";
import path from "node:path";
import type { ScanContext } from "../../src/types.js";
import ciPipelineCheck from "../../checks/ci-pipeline/check.js";

const FIXTURES = path.resolve(import.meta.dirname!, "..", "fixtures");

function makeCtx(files: string[]): ScanContext {
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
    },
  };
}

describe("ci-pipeline check", () => {
  it("passes when GitHub Actions workflow exists", async () => {
    const ctx = makeCtx([".github/workflows/ci.yml", "package.json"]);
    const result = await ciPipelineCheck(ctx);
    expect(result.id).toBe("ci-pipeline");
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    expect(result.summary).toContain(".github/workflows");
  });

  it("fails when no CI configuration exists", async () => {
    const ctx = makeCtx(["package.json", "src/index.ts"]);
    const result = await ciPipelineCheck(ctx);
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
  });

  it("detects GitLab CI as an alternative CI system", async () => {
    const ctx = makeCtx([".gitlab-ci.yml", "package.json"]);
    const result = await ciPipelineCheck(ctx);
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    expect(result.summary).toContain(".gitlab-ci.yml");
  });
});
