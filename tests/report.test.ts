import { describe, it, expect, vi } from "vitest";
import type { CheckResult } from "../src/types.js";
import {
  overallBand,
  reportTimestamp,
  buildMarkdownReport,
  buildHtmlReport,
  printConsoleReport,
} from "../src/report.js";

const sampleChecks: CheckResult[] = [
  {
    id: "agents-md",
    name: "Agent guidance",
    category: "agent-readiness",
    tier: "critical",
    score: 1,
    status: "pass",
    summary: "AGENTS.md present",
    details: "AGENTS.md is present with 200 characters.",
    whyThisMatters: "Clear agent instructions matter.",
    recommendations: ["Keep AGENTS.md current."],
    references: ["AGENTS.md"],
  },
  {
    id: "ci-pipeline",
    name: "CI pipeline",
    category: "quality-gates",
    tier: "important",
    score: 0,
    status: "fail",
    summary: "No CI/CD configuration detected",
    details: "No CI markers found.",
    whyThisMatters: "CI catches regressions.",
    recommendations: ["Add a CI pipeline."],
    references: [],
  },
];

describe("overallBand", () => {
  it("returns 'Excellent' for scores >= 76", () => {
    expect(overallBand(76)).toBe("Excellent");
    expect(overallBand(100)).toBe("Excellent");
  });

  it("returns 'Good' for scores 51-75", () => {
    expect(overallBand(51)).toBe("Good");
    expect(overallBand(75)).toBe("Good");
  });

  it("returns 'Needs Improvement' for scores 26-50", () => {
    expect(overallBand(26)).toBe("Needs Improvement");
    expect(overallBand(50)).toBe("Needs Improvement");
  });

  it("returns 'Poor' for scores <= 25", () => {
    expect(overallBand(0)).toBe("Poor");
    expect(overallBand(25)).toBe("Poor");
  });
});

describe("reportTimestamp", () => {
  it("formats date as YYYYMMDDTHHMMSS", () => {
    const date = new Date("2026-03-05T14:30:45Z");
    const ts = reportTimestamp(date);
    expect(ts).toMatch(/^\d{8}T\d{6}$/);
  });
});

describe("buildMarkdownReport", () => {
  it("produces valid Markdown with check results", () => {
    const md = buildMarkdownReport("/test/repo", sampleChecks, 0.65, "20260305T143045");
    expect(md).toContain("Harnix");
    expect(md).toContain("agents-md");
    expect(md).toContain("ci-pipeline");
    expect(md).toContain("pass");
    expect(md).toContain("fail");
  });

  it("includes overall score percentage", () => {
    const md = buildMarkdownReport("/test/repo", sampleChecks, 0.82, "20260305T143045");
    expect(md).toContain("82%");
  });
});

describe("buildHtmlReport", () => {
  it("produces valid HTML with check results", () => {
    const html = buildHtmlReport("/test/repo", sampleChecks, 0.65, "20260305T143045");
    expect(html).toContain("<html");
    expect(html).toContain("agents-md");
    expect(html).toContain("ci-pipeline");
  });

  it("includes score percentage in HTML", () => {
    const html = buildHtmlReport("/test/repo", sampleChecks, 0.9, "20260305T143045");
    expect(html).toContain("90%");
  });
});

describe("printConsoleReport", () => {
  it("does not throw for valid input", () => {
    expect(() => printConsoleReport("/test/repo", sampleChecks, 0.65)).not.toThrow();
  });

  it("adds a blank line and bold heading before monorepo breakdown output", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      printConsoleReport("/test/repo", sampleChecks, 0.65, {
        recursiveScans: [
          {
            path: "packages/app",
            kind: "workspace",
            checks: sampleChecks,
            overallScore: 0.8,
          },
        ],
      });

      const calls = logSpy.mock.calls.map(([value]) => value);
      const headingIndex = calls.findIndex((value) => typeof value === "string" && value.includes("Monorepo breakdown:"));

      expect(headingIndex).toBeGreaterThan(0);
      expect(calls[headingIndex - 1]).toBe("");
      expect(calls[headingIndex]).toContain("Monorepo breakdown:");
    } finally {
      logSpy.mockRestore();
    }
  });
});
