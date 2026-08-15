import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ScanContext } from "../../src/types.js";
import ubiquitousLanguageCheck from "../../checks/ubiquitous-language/check.js";

const FIXTURES = path.resolve(import.meta.dirname!, "..", "fixtures");
const SUBSTANTIVE =
  "Order: a customer purchase request that the factory must fulfill before invoicing.";

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

async function makeTempCtx(
  files: Record<string, string>,
): Promise<{ ctx: ScanContext; cleanup: () => Promise<void> }> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-ubiquitous-language-"));
  for (const [fileName, content] of Object.entries(files)) {
    const fullPath = path.join(rootPath, fileName);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
  }

  return {
    ctx: makeCtx(rootPath, Object.keys(files).map((file) => file.replace(/\\/g, "/"))),
    cleanup: () => fs.rm(rootPath, { recursive: true, force: true }),
  };
}

describe("ubiquitous-language check", () => {
  it("passes when root CONTEXT.md is substantive", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "CONTEXT.md": SUBSTANTIVE,
    });
    try {
      const result = await ubiquitousLanguageCheck(ctx);
      expect(result.id).toBe("ubiquitous-language");
      expect(result.tier).toBe("important");
      expect(result.status).toBe("pass");
      expect(result.score).toBe(1);
      expect(result.references).toContain("CONTEXT.md");
    } finally {
      await cleanup();
    }
  });

  it("passes when only root UBIQUITOUS_LANGUAGE.md is substantive", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "UBIQUITOUS_LANGUAGE.md": SUBSTANTIVE,
    });
    try {
      const result = await ubiquitousLanguageCheck(ctx);
      expect(result.status).toBe("pass");
      expect(result.score).toBe(1);
      expect(result.references).toEqual(["UBIQUITOUS_LANGUAGE.md"]);
    } finally {
      await cleanup();
    }
  });

  it("fails when neither language file exists", async () => {
    const ctx = makeCtx(path.join(FIXTURES, "fail-all"), ["notes.txt"]);
    const result = await ubiquitousLanguageCheck(ctx);
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0);
    expect(result.summary).toContain("No CONTEXT.md or UBIQUITOUS_LANGUAGE.md");
  });

  it("ignores CONTEXT.md under docs/", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "docs/CONTEXT.md": SUBSTANTIVE,
    });
    try {
      const result = await ubiquitousLanguageCheck(ctx);
      expect(result.score).toBe(0);
      expect(result.status).toBe("fail");
      expect(result.summary).toContain("Only docs/ copies");
      expect(result.details).toContain("docs/");
      expect(result.references).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("ignores docs/ even when nested under another directory", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "src/billing/docs/CONTEXT.md": SUBSTANTIVE,
    });
    try {
      const result = await ubiquitousLanguageCheck(ctx);
      expect(result.score).toBe(0);
      expect(result.references).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("scores nested files as partial when the root file is missing", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "src/ordering/CONTEXT.md": SUBSTANTIVE,
    });
    try {
      const result = await ubiquitousLanguageCheck(ctx);
      expect(result.score).toBe(0.7);
      expect(result.status).toBe("partial");
      expect(result.references).toContain("src/ordering/CONTEXT.md");
      expect(result.summary).toContain("root file is missing");
    } finally {
      await cleanup();
    }
  });

  it("still passes when a substantive root file is paired with nested copies", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "CONTEXT.md": SUBSTANTIVE,
      "src/ordering/CONTEXT.md": SUBSTANTIVE,
      "docs/CONTEXT.md": SUBSTANTIVE,
    });
    try {
      const result = await ubiquitousLanguageCheck(ctx);
      expect(result.score).toBe(1);
      expect(result.status).toBe("pass");
      expect(result.references).toEqual(["CONTEXT.md", "src/ordering/CONTEXT.md"]);
      expect(result.details).toContain("docs/CONTEXT.md");
    } finally {
      await cleanup();
    }
  });

  it("returns a partial score when the language file is only a placeholder", async () => {
    const { ctx, cleanup } = await makeTempCtx({ "CONTEXT.md": "# Language\n" });
    try {
      const result = await ubiquitousLanguageCheck(ctx);
      expect(result.status).toBe("partial");
      expect(result.score).toBe(0.4);
      expect(result.summary).toContain("not substantive");
    } finally {
      await cleanup();
    }
  });

  it("passes if at least one root language file is substantive", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "CONTEXT.md": "# Language\n",
      "UBIQUITOUS_LANGUAGE.md": SUBSTANTIVE,
    });
    try {
      const result = await ubiquitousLanguageCheck(ctx);
      expect(result.status).toBe("pass");
      expect(result.score).toBe(1);
      expect(result.references).toEqual(["CONTEXT.md", "UBIQUITOUS_LANGUAGE.md"]);
    } finally {
      await cleanup();
    }
  });

  it("accepts case-variant filenames", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "context.md": SUBSTANTIVE,
    });
    try {
      const result = await ubiquitousLanguageCheck(ctx);
      expect(result.status).toBe("pass");
      expect(result.score).toBe(1);
      expect(result.references).toContain("context.md");
    } finally {
      await cleanup();
    }
  });

  it("treats ./CONTEXT.md as a root file", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "CONTEXT.md": SUBSTANTIVE,
    });
    try {
      const result = await ubiquitousLanguageCheck({
        ...ctx,
        files: ["./CONTEXT.md"],
      });
      expect(result.status).toBe("pass");
      expect(result.score).toBe(1);
      expect(result.references).toEqual(["CONTEXT.md"]);
    } finally {
      await cleanup();
    }
  });

  it("scores a nested copy outside src/ as supplementary", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "assets/CONTEXT.md": SUBSTANTIVE,
    });
    try {
      const result = await ubiquitousLanguageCheck(ctx);
      expect(result.score).toBe(0.7);
      expect(result.status).toBe("partial");
      expect(result.references).toContain("assets/CONTEXT.md");
    } finally {
      await cleanup();
    }
  });

  it("ignores CONTEXT.md under vendor/", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "vendor/lib/CONTEXT.md": SUBSTANTIVE,
    });
    try {
      const result = await ubiquitousLanguageCheck(ctx);
      expect(result.score).toBe(0);
      expect(result.status).toBe("fail");
      expect(result.summary).toContain("Only excluded-path copies");
      expect(result.references).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("returns 0.1 when an accepted file cannot be read", async () => {
    const ctx = makeCtx(path.join(FIXTURES, "fail-all"), ["CONTEXT.md"]);
    const result = await ubiquitousLanguageCheck(ctx);
    expect(result.score).toBe(0.1);
    expect(result.status).toBe("fail");
    expect(result.summary).toContain("Could not read");
    expect(result.references).toContain("CONTEXT.md");
  });
});
