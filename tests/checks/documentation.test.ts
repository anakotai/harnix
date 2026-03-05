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
  it("passes with required and optional documentation signals present", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-docs-pass-"));
    try {
      await fs.mkdir(path.join(tmpDir, "docs", "styling"), { recursive: true });
      await fs.mkdir(path.join(tmpDir, "docs", "decisions"), { recursive: true });
      await fs.mkdir(path.join(tmpDir, "docs", "api"), { recursive: true });
      await fs.mkdir(path.join(tmpDir, "prds"), { recursive: true });
      await fs.mkdir(path.join(tmpDir, "ops"), { recursive: true });

      await fs.writeFile(
        path.join(tmpDir, "README.md"),
        [
          "# Harnix Example Repo",
          "",
          "This repository includes detailed setup, development, testing, and troubleshooting documentation for contributors and autonomous agents.",
          "Use npm install, npm test, and npm run build before opening pull requests.",
        ].join("\n")
      );
      await fs.writeFile(path.join(tmpDir, "docs", "styling", "guide.md"), "Brand guide with typography, spacing, and color tokens used across reports.");
      await fs.writeFile(path.join(tmpDir, "docs", "decisions", "adr-001.md"), "Architecture decision record with context, decision, and consequences.");
      await fs.writeFile(path.join(tmpDir, "docs", "infrastructure.md"), "Infrastructure and environment documentation with deployment targets and service dependencies.");
      await fs.writeFile(path.join(tmpDir, "ops", "deployment.md"), "Deployment runbook for staging and production release workflows.");
      await fs.writeFile(path.join(tmpDir, "prds", "pitch-deck.md"), "Pitch deck narrative for product positioning and sales messaging.");
      await fs.writeFile(path.join(tmpDir, "docs", "company-profile.md"), "Company profile with legal entity summary and points of contact.");
      await fs.writeFile(path.join(tmpDir, "docs", "tech-stack.md"), "Tech stack overview covering runtime, frameworks, and key dependencies.");
      await fs.writeFile(path.join(tmpDir, "docs", "api", "openapi.yaml"), "openapi: 3.0.0\ninfo:\n  title: Example API\n  version: 1.0.0\npaths: {}\n");
      await fs.writeFile(path.join(tmpDir, "docs", "database-schema.md"), "Database schema documentation with entities, relationships, and migration notes.");

      const files = [
        "README.md",
        "docs/styling/guide.md",
        "docs/decisions/adr-001.md",
        "docs/infrastructure.md",
        "ops/deployment.md",
        "prds/pitch-deck.md",
        "docs/company-profile.md",
        "docs/tech-stack.md",
        "docs/api/openapi.yaml",
        "docs/database-schema.md",
      ];
      const ctx = makeCtx(tmpDir, files);

      const result = await documentationCheck(ctx);
      expect(result.id).toBe("documentation");
      expect(result.status).toBe("pass");
      expect(result.score).toBeGreaterThanOrEqual(0.95);
      expect(result.tier).toBe("critical");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("fails when no README.md exists", async () => {
    const ctx = makeCtx(path.join(FIXTURES, "fail-all"), ["notes.txt"]);
    const result = await documentationCheck(ctx);
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0.1);
    expect(result.summary).toContain("No README.md");
  });

  it("returns partial score when required signals are missing and docs are placeholders", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-docs-partial-"));
    try {
      await fs.mkdir(path.join(tmpDir, "docs", "decisions"), { recursive: true });
      await fs.mkdir(path.join(tmpDir, "ops"), { recursive: true });
      await fs.writeFile(path.join(tmpDir, "README.md"), "# Project Name\n");
      await fs.writeFile(path.join(tmpDir, "docs", "design.md"), "# Design\n");
      await fs.writeFile(path.join(tmpDir, "docs", "decisions", "adr-001.md"), "# ADR\n");
      await fs.writeFile(path.join(tmpDir, "docs", "infrastructure.md"), "# Infrastructure\n");
      await fs.writeFile(path.join(tmpDir, "ops", "deployment.md"), "# Deployment\n");

      const ctx = makeCtx(tmpDir, [
        "README.md",
        "docs/design.md",
        "docs/decisions/adr-001.md",
        "docs/infrastructure.md",
        "ops/deployment.md",
      ]);

      const result = await documentationCheck(ctx);
      expect(result.score).toBeLessThan(0.75);
      expect(result.status).toBe("partial");
      expect(result.summary).toContain("not substantive");
      expect(result.details).toContain("Missing required signals");
      expect(result.details).toContain("Non-substantive documentation files");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("fails when README is not readable", async () => {
    const ctx = makeCtx(path.join(FIXTURES, "does-not-exist"), [
      "README.md",
      "docs/guide.md",
    ]);
    const result = await documentationCheck(ctx);
    expect(result.status).toBe("fail");
    expect(result.score).toBe(0.1);
    expect(result.summary).toContain("Unable to read README.md");
  });
});
