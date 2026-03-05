import { describe, it, expect } from "vitest";
import path from "node:path";
import type { ScanContext } from "../../src/types.js";
import agentsMdCheck from "../../checks/agents-md/check.js";

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

describe("agents-md check", () => {
  it("passes with a substantive AGENTS.md", async () => {
    const ctx = makeCtx("pass-all", ["AGENTS.md", "package.json", "src/index.ts"]);
    const result = await agentsMdCheck(ctx);
    expect(result.id).toBe("agents-md");
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
    expect(result.tier).toBe("critical");
  });

  it("fails when no AGENTS.md or CLAUDE.md exists", async () => {
    const ctx = makeCtx("fail-all", ["notes.txt"]);
    const result = await agentsMdCheck(ctx);
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
  });

  it("returns partial score for brief AGENTS.md", async () => {
    const ctx = makeCtx("partial", ["AGENTS.md", "package.json", "src/main.ts"]);
    const result = await agentsMdCheck(ctx);
    expect(result.status).toBe("pass"); // 0.8 rounds to 80% >= 75
    expect(result.score).toBe(0.8);
    expect(result.summary).toContain("brief");
  });
});
