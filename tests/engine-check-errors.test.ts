import { describe, expect, it, vi } from "vitest";
import { runChecks, type DiscoveredCheck, type EngineScanContext } from "../src/engine.js";
import type { CheckMeta } from "../src/schemas/meta.js";
import type { CheckResult } from "../src/types.js";

function meta(id: string, overrides: Partial<CheckMeta> = {}): CheckMeta {
  return {
    id,
    name: `${id} name`,
    category: "quality-gates",
    tier: "important",
    description: `${id} description`,
    tags: [],
    applicableTo: "all",
    ...overrides,
  };
}

function ctx(repoType: EngineScanContext["repoType"] = "software"): EngineScanContext {
  return {
    rootPath: "/test/repo",
    files: [],
    repoType,
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

function checkResult(id: string, score = 1): CheckResult {
  return {
    id,
    name: `${id} name`,
    category: "quality-gates",
    tier: "important",
    score,
    status: score >= 0.75 ? "pass" : score >= 0.25 ? "partial" : "fail",
    summary: `${id} summary`,
    details: `${id} details`,
    whyThisMatters: `${id} matters`,
    recommendations: [],
    references: [],
  };
}

const discovered: DiscoveredCheck[] = [
  { dirName: "agents-md", meta: meta("agents-md", { tier: "critical" }) },
  { dirName: "ci-pipeline", meta: meta("ci-pipeline") },
  { dirName: "root-readme", meta: meta("root-readme") },
];

describe("runChecks structured execution errors", () => {
  it("captures check execution failures at the engine catch boundary", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = await runChecks(
        discovered,
        async (dirName) => {
          if (dirName === "ci-pipeline") {
            throw new Error("loader exploded");
          }
          return async () => checkResult(dirName);
        },
        ctx(),
      );

      expect(result.checks).toHaveLength(3);
      const failed = result.checks.find((check) => check.id === "ci-pipeline");
      expect(failed).toMatchObject({
        score: 0,
        status: "fail",
        summary: "Check failed to run: loader exploded",
      });
      expect(result.errors).toEqual([
        { checkId: "ci-pipeline", checkName: "ci-pipeline name", message: "loader exploded" },
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it("captures thrown non-Error values without classifying ordinary findings", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = await runChecks(
        discovered,
        async (dirName) => {
          if (dirName === "root-readme") {
            throw "string failure";
          }
          return async () => checkResult(dirName, 0);
        },
        ctx(),
      );

      expect(result.errors).toEqual([
        { checkId: "root-readme", checkName: "root-readme name", message: "string failure" },
      ]);
      const ordinaryFailure = result.checks.find((check) => check.id === "agents-md");
      expect(ordinaryFailure?.status).toBe("fail");
      expect(result.errors.some((error) => error.checkId === "agents-md")).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it("sorts structured errors by check ID regardless of completion order", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const result = await runChecks(
        discovered,
        async (dirName) => {
          if (dirName === "root-readme") {
            await new Promise((resolve) => setTimeout(resolve, 5));
            throw new Error("later");
          }
          if (dirName === "ci-pipeline") {
            throw new Error("earlier");
          }
          return async () => checkResult(dirName);
        },
        ctx(),
      );

      expect(result.errors.map((error) => error.checkId)).toEqual(["ci-pipeline", "root-readme"]);
    } finally {
      warn.mockRestore();
    }
  });

  it("applies only/skip filters and repo-type applicability", async () => {
    const result = await runChecks(
      [
        ...discovered,
        { dirName: "software-only", meta: meta("software-only", { applicableTo: "software" }) },
      ],
      async (dirName) => async () => checkResult(dirName),
      ctx("non-software"),
      { onlyIds: ["agents-md", "software-only", "root-readme"], skipIds: ["root-readme"] },
    );

    expect(result.checks.map((check) => check.id)).toEqual(["agents-md"]);
    expect(result.errors).toEqual([]);
  });
});

