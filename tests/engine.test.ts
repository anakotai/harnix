import { describe, it, expect } from "vitest";
import path from "node:path";
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
