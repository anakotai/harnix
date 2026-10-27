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
    name: "Agents guidance",
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

  it("includes nested recursive entries using joined paths", () => {
    const md = buildMarkdownReport("/test/repo", sampleChecks, 0.65, "20260305T143045", {
      recursiveScans: [
        {
          path: "software",
          kind: "submodule",
          result: {
            checks: sampleChecks,
            overallScore: 0.58,
            recursiveScans: [
              {
                path: "harnix",
                kind: "submodule",
                result: {
                  checks: sampleChecks,
                  overallScore: 0.59,
                },
              },
            ],
          },
        },
      ],
    });
    expect(md).toContain("`software`");
    expect(md).toContain("`software/harnix`");
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

  it("includes nested recursive entries using joined paths", () => {
    const html = buildHtmlReport("/test/repo", sampleChecks, 0.65, "20260305T143045", {
      recursiveScans: [
        {
          path: "software",
          kind: "submodule",
          result: {
            checks: sampleChecks,
            overallScore: 0.58,
            recursiveScans: [
              {
                path: "harnix",
                kind: "submodule",
                result: {
                  checks: sampleChecks,
                  overallScore: 0.59,
                },
              },
            ],
          },
        },
      ],
    });
    expect(html).toContain("<code>software</code>");
    expect(html).toContain("<code>software/harnix</code>");
  });
});

describe("printConsoleReport", () => {
  it("does not throw for valid input", () => {
    expect(() => printConsoleReport("/test/repo", sampleChecks, 0.65)).not.toThrow();
  });

  it("prints separately labeled local and rollup scores", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      printConsoleReport("/test/repo", sampleChecks, 0.65);

      const calls = logSpy.mock.calls.map(([value]) => value);
      expect(calls[2]).toBe("Local score: 65% (Good)");
      expect(calls[3]).toBe("Rollup score: 65% (Good)");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("adds a blank line and bold heading before monorepo breakdown output", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      printConsoleReport("/test/repo", sampleChecks, 0.65, {
        recursiveScans: [
          {
            path: "submodules/core",
            kind: "submodule",
            result: {
              checks: sampleChecks,
              overallScore: 0.24,
            },
          },
        ],
      });

      const calls = logSpy.mock.calls.map(([value]) => value);
      const headingIndex = calls.findIndex((value) => typeof value === "string" && value.includes("Monorepo breakdown:"));

      expect(headingIndex).toBeGreaterThan(0);
      expect(calls[headingIndex - 1]).toBe("");
      expect(calls[headingIndex]).toContain("Monorepo breakdown:");
      expect(calls[headingIndex + 1]).toBe("- Submodule submodules/core: Local score: 24% (Poor); Rollup score: 24% (Poor)");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("prints nested monorepo entries with joined paths", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      printConsoleReport("/test/repo", sampleChecks, 0.65, {
        recursiveScans: [
          {
            path: "software",
            kind: "submodule",
            result: {
              checks: sampleChecks,
              overallScore: 0.58,
              recursiveScans: [
                {
                  path: "harnix",
                  kind: "submodule",
                  result: {
                    checks: sampleChecks,
                    overallScore: 0.59,
                  },
                },
              ],
            },
          },
        ],
      });

      const calls = logSpy.mock.calls.map(([value]) => value);
      expect(calls).toContain("- Submodule software: Local score: 58% (Good); Rollup score: 58% (Good)");
      expect(calls).toContain("- Submodule software/harnix: Local score: 59% (Good); Rollup score: 59% (Good)");
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe("report run identity", () => {
  it("shows not-assessed as N/A and excludes it from counts and categories", () => {
    const unassessed: CheckResult = { ...sampleChecks[0], id: "operating-commands", name: "Operating commands", score: 0,
      status: "not-assessed", summary: "Not assessed: unsupported ecosystem", recommendations: ["SHOULD_NOT_BE_RANKED"] };
    const checks = [sampleChecks[0], unassessed];
    const md = buildMarkdownReport("/test", checks, 1, "now");
    expect(md).toContain("Checks evaluated: 1 (1 pass, 0 partial, 0 fail)");
    expect(md).toContain("Not assessed: 1");
    expect(md).toContain("Score: N/A (not-assessed)");
    expect(md).toContain("| Agent Readiness | 1 | 100% | 1 | 0 | 0 |");
    expect(md.split("## Prioritized Recommendations")[1]).not.toContain("SHOULD_NOT_BE_RANKED");
    const html = buildHtmlReport("/test", checks, 1, "now");
    expect(html).toContain("N/A (not-assessed)");
    expect(html).toContain("Checks evaluated:</strong> 1 (1 pass, 0 partial, 0 fail)");
    expect(html.split("<h2>Prioritized Recommendations</h2>")[1]).not.toContain("SHOULD_NOT_BE_RANKED");
    const spy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      printConsoleReport("/test", [unassessed], 0);
      expect(spy.mock.calls.some(([line]) => String(line).includes("N/A"))).toBe(true);
      expect(spy.mock.calls.some(([line]) => String(line).includes("no checks were evaluated"))).toBe(true);
      expect(spy.mock.calls.some(([line]) => String(line).includes("SHOULD_NOT_BE_RANKED"))).toBe(false);
    } finally { spy.mockRestore(); }
    expect(buildMarkdownReport("/test", [unassessed], 0, "now")).toContain("no checks were evaluated");
    expect(buildHtmlReport("/test", [unassessed], 0, "now")).toContain("no checks were evaluated");
    const childOptions = { recursiveScans: [{ path: "child", kind: "directory" as const,
      result: { checks: [unassessed], overallScore: 0, localScore: null, rollupScore: null } }] };
    const childMarkdown = buildMarkdownReport("/test", [], 0, "now", childOptions);
    expect(childMarkdown).toContain("Score: N/A (not-assessed)");
    expect(childMarkdown).toContain("Local score: Unavailable");
    expect(buildHtmlReport("/test", [], 0, "now", childOptions)).toContain("Score: N/A (not-assessed)");
  });

  it("includes Harnix version in markdown when provided", () => {
    const md = buildMarkdownReport("/test/repo", sampleChecks, 0.5, "20260305T143045", {
      harnixVersion: "0.18.0",
    });
    expect(md).toContain("0.18.0");
    expect(md).toMatch(/Harnix version/i);
  });

  it("labels local score when recursive children exist", () => {
    const md = buildMarkdownReport("/test/repo", sampleChecks, 0.5, "20260305T143045", {
      recursiveScans: [
        {
          path: "packages/a",
          kind: "workspace",
          result: { overallScore: 0.2, checks: sampleChecks },
        },
      ],
    });
    expect(md).toContain("Local score");
    expect(md).not.toMatch(/^- Overall score:/m);
  });

  it("attributes child recommendations in prioritized list", () => {
    const md = buildMarkdownReport("/test/repo", sampleChecks, 0.9, "20260305T143045", {
      recursiveScans: [
        {
          path: "frontend",
          kind: "workspace",
          result: {
            overallScore: 0.1,
            checks: [
              {
                ...sampleChecks[1],
                recommendations: ["Add CI in frontend"],
              },
            ],
          },
        },
      ],
    });
    expect(md).toContain("[frontend]");
  });
});
