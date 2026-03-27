import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ScanContext } from "../../src/types.js";
import rootReadmeCheck from "../../checks/root-readme/check.js";

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

describe("root-readme check", () => {
  it("passes with a substantive root README and onboarding signals", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-root-readme-pass-"));
    try {
      await fs.writeFile(
        path.join(tmpDir, "README.md"),
        [
          "# Harnix Example Repo",
          "",
          "This repository scans harness readiness for AI-assisted development workflows and explains how contributors should work with the project.",
          "",
          "## Getting Started",
          "Run `npm install` to install dependencies.",
          "",
          "## Usage",
          "Use `npm run build` and `npm run dev` while developing locally.",
          "",
          "## Verification",
          "Run `npm test` before opening a pull request and review troubleshooting notes when a command fails.",
        ].join("\n")
      );

      const result = await rootReadmeCheck(makeCtx(tmpDir, ["README.md"]));
      expect(result.id).toBe("root-readme");
      expect(result.status).toBe("pass");
      expect(result.score).toBeGreaterThanOrEqual(0.9);
      expect(result.tier).toBe("critical");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns partial when the root README exists but is only a placeholder", async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "harnix-root-readme-partial-")
    );
    try {
      await fs.writeFile(path.join(tmpDir, "README.md"), "# Project Name\n");

      const result = await rootReadmeCheck(makeCtx(tmpDir, ["README.md"]));
      expect(result.status).toBe("partial");
      expect(result.summary).toContain("not substantive");
      expect(result.details).toContain("Missing signals");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("fails when no supported root README exists", async () => {
    const result = await rootReadmeCheck(
      makeCtx(path.join(FIXTURES, "fail-all"), ["notes.txt"])
    );
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
    expect(result.summary).toContain("No root README.md or README.txt");
  });

  it("fails when the root README is not readable", async () => {
    const result = await rootReadmeCheck(
      makeCtx(path.join(FIXTURES, "does-not-exist"), ["README.md"])
    );
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
    expect(result.summary).toContain("Unable to read README.md");
  });
});
