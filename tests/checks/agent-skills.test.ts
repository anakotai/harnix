import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ScanContext } from "../../src/types.js";
import agentSkillsCheck from "../../checks/agent-skills/check.js";

const FIXTURES = path.resolve(import.meta.dirname!, "..", "fixtures");

function makeCtx(rootPath: string, files: string[]): ScanContext {
  return {
    rootPath,
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

describe("agent-skills check", () => {
  it("passes with a fully compliant skills directory", async () => {
    const ctx = makeCtx(path.join(FIXTURES, "pass-all"), [
      "skills/my-skill/SKILL.md",
      "package.json",
    ]);
    const result = await agentSkillsCheck(ctx);
    expect(result.id).toBe("agent-skills");
    expect(result.score).toBe(1);
    expect(result.status).toBe("pass");
  });

  it("fails when no skills directory exists", async () => {
    const ctx = makeCtx(path.join(FIXTURES, "fail-all"), ["notes.txt"]);
    const result = await agentSkillsCheck(ctx);
    expect(result.score).toBe(0);
    expect(result.status).toBe("fail");
  });

  it("ignores SKILL.md outside supported skill roots", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-test-"));
    try {
      await fs.mkdir(path.join(tmpDir, "custom", "my-skill"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "custom", "my-skill", "SKILL.md"),
        "---\nname: custom-skill\ndescription: test\n---\n\nBody",
      );
      const ctx = makeCtx(tmpDir, ["custom/my-skill/SKILL.md"]);
      const result = await agentSkillsCheck(ctx);
      expect(result.score).toBe(0);
      expect(result.status).toBe("fail");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("detects skills under .codex/skills", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-test-"));
    try {
      await fs.mkdir(path.join(tmpDir, ".codex", "skills", "my-skill"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, ".codex", "skills", "my-skill", "SKILL.md"),
        "---\nname: codex-skill\ndescription: test\n---\n\nBody",
      );
      const ctx = makeCtx(tmpDir, [".codex/skills/my-skill/SKILL.md"]);
      const result = await agentSkillsCheck(ctx);
      expect(result.score).toBe(1);
      expect(result.status).toBe("pass");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns low score for skill missing frontmatter", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-test-"));
    try {
      await fs.mkdir(path.join(tmpDir, "skills", "bad-skill"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "skills", "bad-skill", "SKILL.md"),
        "No frontmatter here, just plain content.",
      );
      const ctx = makeCtx(tmpDir, ["skills/bad-skill/SKILL.md"]);
      const result = await agentSkillsCheck(ctx);
      // No compliant skills, no security flags → score = 0.2
      expect(result.score).toBe(0.2);
      expect(result.score).toBeLessThan(1);
      expect(result.status).toBe("fail");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
