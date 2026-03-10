import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
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

async function makeTempCtx(content: string, fileName = "AGENTS.md"): Promise<ScanContext> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-agents-md-"));
  await fs.writeFile(path.join(rootPath, fileName), content, "utf8");

  return {
    rootPath,
    files: [fileName],
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
    const ctx = await makeTempCtx("a".repeat(1500));
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

  it("returns 0.4 for guidance shorter than 120 chars", async () => {
    const ctx = makeCtx("partial", ["AGENTS.md", "package.json", "src/main.ts"]);
    const result = await agentsMdCheck(ctx);
    expect(result.status).toBe("partial");
    expect(result.score).toBe(0.4);
    expect(result.summary).toContain("getting short");
  });

  it("returns 0.8 for guidance between 120 and 1,000 chars", async () => {
    const ctx = await makeTempCtx("a".repeat(200));
    const result = await agentsMdCheck(ctx);
    expect(result.status).toBe("pass");
    expect(result.score).toBe(0.8);
    expect(result.summary).toContain("bit brief");
  });

  it("returns 0.2 for empty guidance file", async () => {
    const ctx = await makeTempCtx("");
    const result = await agentsMdCheck(ctx);
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0.2);
    expect(result.summary).toContain("suspiciously empty");
  });

  it("returns 0.6 for guidance between 3,000 and 5,000 chars", async () => {
    const ctx = await makeTempCtx("a".repeat(3200));
    const result = await agentsMdCheck(ctx);
    expect(result.status).toBe("partial");
    expect(result.score).toBe(0.6);
    expect(result.summary).toContain("bit long");
  });

  it("returns 0.4 for guidance between 5,000 and 10,000 chars", async () => {
    const ctx = await makeTempCtx("a".repeat(6200));
    const result = await agentsMdCheck(ctx);
    expect(result.status).toBe("partial");
    expect(result.score).toBe(0.4);
    expect(result.summary).toContain("getting long");
  });

  it("returns 0.2 for guidance at or above 10,000 chars", async () => {
    const ctx = await makeTempCtx("a".repeat(10100));
    const result = await agentsMdCheck(ctx);
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0.2);
    expect(result.summary).toContain("suspiciously long");
  });
});
