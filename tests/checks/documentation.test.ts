import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import type { ScanContext } from "../../src/types.js";
import documentationCheck from "../../checks/documentation/check.js";

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

describe("documentation check", () => {
  it("passes when supported documentation roots contain substantive docs", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-doc-roots-pass-"));
    try {
      await fs.mkdir(path.join(tmpDir, "docs"), { recursive: true });
      await fs.mkdir(path.join(tmpDir, "prds"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "docs", "guide.md"),
        "Contributor guide with setup steps, workflow expectations, and command reference for local development."
      );
      await fs.writeFile(
        path.join(tmpDir, "prds", "example.md"),
        "Product requirements document covering goals, scope, constraints, and rollout assumptions."
      );

      const files = [
        "docs/guide.md",
        "prds/example.md",
      ];
      const ctx = makeCtx(tmpDir, files);

      const result = await documentationCheck(ctx);
      expect(result.id).toBe("documentation");
      expect(result.status).toBe("pass");
      expect(result.score).toBe(1);
      expect(result.tier).toBe("important");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("fails when no supported documentation roots exist", async () => {
    const ctx = makeCtx(path.join(FIXTURES, "fail-all"), ["notes.txt"]);
    const result = await documentationCheck(ctx);
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
    expect(result.summary).toContain("No docs/, specs/, or prds/");
  });

  it("returns partial score when docs roots only contain placeholders", async () => {
    const tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "harnix-doc-roots-partial-")
    );
    try {
      await fs.mkdir(path.join(tmpDir, "specs"), { recursive: true });
      await fs.writeFile(path.join(tmpDir, "specs", "overview.md"), "# Overview\n");

      const ctx = makeCtx(tmpDir, ["specs/overview.md"]);

      const result = await documentationCheck(ctx);
      expect(result.score).toBe(0.4);
      expect(result.status).toBe("partial");
      expect(result.summary).toContain("no substantive docs");
      expect(result.details).toContain("Placeholder or unreadable documentation files");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns partial when docs roots exist but contain no supported doc files", async () => {
    const ctx = makeCtx(path.join(FIXTURES, "does-not-exist"), [
      "docs/image.png",
    ]);
    const result = await documentationCheck(ctx);
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0.2);
  });

  it("supports specs/ as a documentation root", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-doc-roots-specs-"));
    try {
      await fs.mkdir(path.join(tmpDir, "specs"), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "specs", "api.md"),
        "Specification document with endpoints, constraints, assumptions, and expected validation rules."
      );

      const result = await documentationCheck(makeCtx(tmpDir, ["specs/api.md"]));
      expect(result.status).toBe("pass");
      expect(result.references).toContain("specs/api.md");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
