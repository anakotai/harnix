import { describe, it, expect } from "vitest";
import path from "node:path";
import type { ScanContext } from "../../src/types.js";
import sourceOfTruthCheck from "../../checks/source-of-truth/check.js";

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

describe("source-of-truth check", () => {
  it("passes when no SSOT violations exist", async () => {
    const ctx = makeCtx(["src/index.ts", "package.json", "README.md"]);
    const result = await sourceOfTruthCheck(ctx);
    expect(result.id).toBe("source-of-truth");
    expect(result.score).toBe(1);
    expect(result.status).toBe("pass");
  });

  it("fails with multiple SSOT violations", async () => {
    const ctx = makeCtx([
      "legal/terms.md",
      "policies/terms.md",
      "docs/legal/privacy.md",
      "styling/colors.css",
      "brand/colors.css",
      "docs/brand/logo.png",
    ]);
    const result = await sourceOfTruthCheck(ctx);
    // 2 violations (Legal + Styling) → score = max(0, 1 - 2*0.25) = 0.5
    expect(result.score).toBeLessThanOrEqual(0.5);
    expect(result.status).toBe("partial");
  });

  it("deducts for a single SSOT violation in legal/policies", async () => {
    const ctx = makeCtx([
      "legal/terms.md",
      "policies/privacy.md",
      "src/index.ts",
    ]);
    const result = await sourceOfTruthCheck(ctx);
    // 1 violation → score = max(0, 1 - 0.25) = 0.75
    expect(result.score).toBe(0.75);
    expect(result.status).toBe("pass");
  });
});
