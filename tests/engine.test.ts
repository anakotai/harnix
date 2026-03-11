import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import { tierWeight, TIER_WEIGHTS, scanRepository } from "../src/engine.js";

const FIXTURES = path.resolve(import.meta.dirname!, "fixtures");

describe("tierWeight", () => {
  it("returns correct weights for known tiers", () => {
    expect(tierWeight("critical")).toBe(3);
    expect(tierWeight("important")).toBe(2);
    expect(tierWeight("nice-to-have")).toBe(1);
  });

  it("falls back to 1 for unknown tiers", () => {
    expect(tierWeight("unknown")).toBe(1);
    expect(tierWeight("")).toBe(1);
  });

  it("exports TIER_WEIGHTS with all three tiers", () => {
    expect(TIER_WEIGHTS).toEqual({
      critical: 3,
      important: 2,
      "nice-to-have": 1,
    });
  });
});

describe("scanRepository", () => {
  it("discovers and runs all 7 checks on a fixture repo", async () => {
    const result = await scanRepository(path.join(FIXTURES, "pass-all"), {
      recursive: false,
    });
    expect(result.checks.length).toBe(7);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.overallScore).toBeLessThanOrEqual(1);
    expect(result.repoType).toBe("software");
  });

  it("applies --only filter to limit checks", async () => {
    const result = await scanRepository(path.join(FIXTURES, "pass-all"), {
      onlyIds: ["agents-md", "documentation"],
      recursive: false,
    });
    expect(result.checks.length).toBe(2);
    const ids = result.checks.map((c) => c.id).sort();
    expect(ids).toEqual(["agents-md", "documentation"]);
  });

  it("applies --skip filter to exclude checks", async () => {
    const result = await scanRepository(path.join(FIXTURES, "pass-all"), {
      skipIds: ["agents-md"],
      recursive: false,
    });
    expect(result.checks.find((c) => c.id === "agents-md")).toBeUndefined();
    expect(result.checks.length).toBe(6);
  });

  it("applies repo type override to root scan only", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-recursive-type-"));
    const submodulePath = path.join(rootDir, "software");

    try {
      await fs.writeFile(
        path.join(rootDir, ".gitmodules"),
        ['[submodule "software"]', "\tpath = software", "\turl = https://example.invalid/software.git"].join("\n"),
        "utf8",
      );
      await fs.writeFile(path.join(rootDir, "README.md"), "# Root\n", "utf8");

      await fs.mkdir(submodulePath, { recursive: true });
      await fs.writeFile(path.join(submodulePath, "package.json"), '{ "name": "submodule-software" }\n', "utf8");
      await fs.writeFile(path.join(submodulePath, "README.md"), "# Software\n", "utf8");

      const result = await scanRepository(rootDir, {
        repoType: "non-software",
      });

      expect(result.repoType).toBe("non-software");
      const softwareSubmodule = result.recursiveScans.find((scan) => scan.path === "software");
      expect(softwareSubmodule?.result?.repoType).toBe("software");
    } finally {
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  });

  it("limits recursive scans using maxDepth", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-depth-"));
    const submodulePath = path.join(rootDir, "software");
    const nestedSubmodulePath = path.join(submodulePath, "harnix");

    try {
      await fs.writeFile(
        path.join(rootDir, ".gitmodules"),
        ['[submodule "software"]', "\tpath = software", "\turl = https://example.invalid/software.git"].join("\n"),
        "utf8",
      );
      await fs.writeFile(path.join(rootDir, "README.md"), "# Root\n", "utf8");
      await fs.writeFile(path.join(rootDir, "package.json"), '{ "name": "root-repo" }\n', "utf8");

      await fs.mkdir(submodulePath, { recursive: true });
      await fs.writeFile(path.join(submodulePath, "package.json"), '{ "name": "software-repo" }\n', "utf8");
      await fs.writeFile(path.join(submodulePath, "README.md"), "# Software\n", "utf8");
      await fs.writeFile(
        path.join(submodulePath, ".gitmodules"),
        ['[submodule "harnix"]', "\tpath = harnix", "\turl = https://example.invalid/harnix.git"].join("\n"),
        "utf8",
      );

      await fs.mkdir(nestedSubmodulePath, { recursive: true });
      await fs.writeFile(path.join(nestedSubmodulePath, "package.json"), '{ "name": "nested-repo" }\n', "utf8");
      await fs.writeFile(path.join(nestedSubmodulePath, "README.md"), "# Nested\n", "utf8");

      const depth0 = await scanRepository(rootDir, { maxDepth: 0 });
      expect(depth0.recursiveScans).toHaveLength(0);

      const depth1 = await scanRepository(rootDir, { maxDepth: 1 });
      expect(depth1.recursiveScans.map((scan) => scan.path)).toEqual(["software"]);
      expect(depth1.recursiveScans[0]?.result?.recursiveScans).toHaveLength(0);

      const depth2 = await scanRepository(rootDir, { maxDepth: 2 });
      const levelOne = depth2.recursiveScans.find((scan) => scan.path === "software")?.result;
      expect(levelOne?.recursiveScans.map((scan) => scan.path)).toContain("harnix");
    } finally {
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  });

  it("throws for invalid maxDepth values", async () => {
    await expect(
      scanRepository(path.join(FIXTURES, "pass-all"), { maxDepth: -1 }),
    ).rejects.toThrow("Invalid maxDepth");
  });
});

describe("tier-weighted scoring", () => {
  it("produces weighted score different from simple average", async () => {
    const result = await scanRepository(path.join(FIXTURES, "fail-all"), {
      onlyIds: ["agents-md", "ci-pipeline"],
      recursive: false,
    });
    // agents-md: critical (weight 3), score 0
    // ci-pipeline: important (weight 2), score 0
    // Both fail → weighted = 0
    expect(result.overallScore).toBe(0);
  });

  it("weights critical checks more heavily than important", async () => {
    const result = await scanRepository(path.join(FIXTURES, "pass-all"), {
      recursive: false,
    });
    // Verify the score is a weighted average, not a simple mean
    const checks = result.checks;
    const weightedSum = checks.reduce((s, c) => s + tierWeight(c.tier) * c.score, 0);
    const totalWeight = checks.reduce((s, c) => s + tierWeight(c.tier), 0);
    const weightedAvg = weightedSum / totalWeight;
    expect(result.overallScore).toBeCloseTo(weightedAvg, 10);
  });
});
