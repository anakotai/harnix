import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import type { CheckResult } from "../src/types.js";
import type { ScanResult } from "../src/engine.js";
import {
  buildJsonReport,
  buildMarkdownReport,
  buildHtmlReport,
  reportTimestamp,
  writeReportFiles,
  type EffectiveRunOptions,
} from "../src/report.js";
import {
  buildJsonReportJsonSchema,
  jsonReportSchema,
  JSON_REPORT_SCHEMA_VERSION,
} from "../src/schemas/report.js";

const REPO_ROOT = path.resolve(import.meta.dirname!, "..");
const SCHEMA_PATH = path.join(REPO_ROOT, "schema", "harnix-report.schema.json");
const FIXED_GENERATED_AT = "2026-03-05T14:30:45.000Z";
const FIXED_TIMESTAMP = reportTimestamp(new Date(FIXED_GENERATED_AT));

const runOptions: EffectiveRunOptions = {
  skipIds: [],
  onlyIds: [],
  typeOverride: null,
  depth: null,
};

function makeCheck(overrides: Partial<CheckResult> & Pick<CheckResult, "id">): CheckResult {
  const { id, ...rest } = overrides;
  return {
    id,
    name: id,
    category: "quality-gates",
    tier: "important",
    score: 0.5,
    status: "partial",
    summary: `${id} summary`,
    details: `${id} details`,
    whyThisMatters: `${id} matters`,
    recommendations: [`Fix ${id}`],
    references: [],
    ...rest,
  };
}

function makeGitInfo(): ScanResult["gitInfo"] {
  return {
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
  };
}

function makeResult(overrides: Partial<ScanResult> = {}): ScanResult {
  const checks = overrides.checks ?? [];
  const overallScore = overrides.overallScore ?? 0.5;
  const localScore =
    overrides.localScore !== undefined ? overrides.localScore : checks.length > 0 ? overallScore : null;
  const rollupScore = overrides.rollupScore !== undefined ? overrides.rollupScore : localScore;
  return {
    absolutePath: "/test/repo",
    repoType: "software",
    repoTypeSource: "detected",
    detectedRepoType: "software",
    gitInfo: makeGitInfo(),
    overallScore,
    localScore,
    rollupScore,
    checks,
    checkErrors: [],
    recursiveScans: [],
    ...overrides,
  };
}

function buildReport(result: ScanResult, options: Partial<EffectiveRunOptions> = {}): string {
  return buildJsonReport({
    targetPath: result.absolutePath,
    generatedAt: FIXED_GENERATED_AT,
    harnixVersion: "0.21.0",
    runOptions: { ...runOptions, ...options },
    scanResult: result,
  });
}

async function compilePublishedSchema() {
  const schema = JSON.parse(await fs.readFile(SCHEMA_PATH, "utf8")) as object;
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  return ajv.compile(schema);
}

describe("JSON report", () => {
  it("builds a valid, schema-conformant report with full check fields", async () => {
    const checks = [
      makeCheck({
        id: "ci-pipeline",
        name: "CI pipeline",
        category: "quality-gates",
        tier: "important",
        score: 0,
        status: "fail",
        summary: 'No CI "pipeline" found',
        details: "Line one\nLine two",
        whyThisMatters: "CI catches regressions.",
        recommendations: ["Add a CI pipeline."],
        references: ["README.md", "https://example.com/ci"],
      }),
      makeCheck({
        id: "agents-md",
        name: "Agents guidance",
        tier: "critical",
        score: 1,
        status: "pass",
      }),
    ];
    const result = makeResult({ checks, overallScore: 0.6 });
    const text = buildReport(result);
    const report = JSON.parse(text) as ReturnType<typeof JSON.parse>;

    expect(report.schemaVersion).toBe(JSON_REPORT_SCHEMA_VERSION);
    expect(report.harnixVersion).toBe("0.21.0");
    expect(report.generatedAt).toBe(FIXED_GENERATED_AT);
    expect(report.run).toEqual({
      target: { path: "/test/repo" },
      options: { skip: [], only: [], typeOverride: null, depth: null },
    });
    expect(report.assessment.localScore).toBe(0.6);
    expect(report.assessment.localScoreState).toBe("evaluated");
    expect(report.assessment.rollupScore).toBe(0.6);
    expect(report.assessment.rollupState).toBe("evaluated");
    expect(report.assessment.band).toBe("Good");
    expect(report.assessment.evaluatedCheckIds).toEqual(["agents-md", "ci-pipeline"]);
    expect(report.assessment.checks.map((check: CheckResult) => check.id)).toEqual([
      "agents-md",
      "ci-pipeline",
    ]);
    expect(report.assessment.checks[1]).toEqual(checks[0]);

    expect(jsonReportSchema.safeParse(report).success).toBe(true);
    const validate = await compilePublishedSchema();
    expect(validate(report)).toBe(true);
  });

  it("distinguishes an evaluated zero from no evaluated checks", () => {
    const zero = JSON.parse(
      buildReport(
        makeResult({
          checks: [makeCheck({ id: "agents-md", score: 0, status: "fail" })],
          overallScore: 0,
        }),
      ),
    );
    expect(zero.assessment.localScore).toBe(0);
    expect(zero.assessment.localScoreState).toBe("evaluated");
    expect(zero.assessment.band).toBe("Poor");

    const empty = JSON.parse(buildReport(makeResult({ checks: [], overallScore: 0 })));
    expect(empty.assessment.localScore).toBeNull();
    expect(empty.assessment.localScoreState).toBe("no-checks");
    expect(empty.assessment.band).toBeNull();
    expect(empty.assessment.evaluatedCheckIds).toEqual([]);
  });

  it("exports local and rollup scores with independent states", () => {
    const report = JSON.parse(
      buildReport(
        makeResult({
          checks: [makeCheck({ id: "agents-md", score: 0.4 })],
          overallScore: 0.4,
          localScore: 0.4,
          rollupScore: 0.6,
        }),
      ),
    );
    expect(report.assessment.localScore).toBe(0.4);
    expect(report.assessment.localScoreState).toBe("evaluated");
    expect(report.assessment.rollupScore).toBe(0.6);
    expect(report.assessment.rollupState).toBe("evaluated");

    const unavailable = JSON.parse(
      buildReport(makeResult({ checks: [], localScore: null, rollupScore: null })),
    );
    expect(unavailable.assessment.rollupScore).toBeNull();
    expect(unavailable.assessment.rollupState).toBe("unavailable");
  });

  it("excludes not-assessed checks from evaluated IDs while preserving full results", () => {
    const report = JSON.parse(
      buildReport(
        makeResult({
          checks: [
            makeCheck({ id: "agents-md", score: 1, status: "pass" }),
            makeCheck({
              id: "operating-commands",
              score: 0,
              status: "not-assessed",
              summary: "Not assessed: unsupported ecosystem",
            }),
          ],
          overallScore: 1,
          localScore: 1,
          rollupScore: 1,
        }),
      ),
    );
    expect(report.assessment.evaluatedCheckIds).toEqual(["agents-md"]);
    expect(report.assessment.checks.map((check: CheckResult) => check.id)).toEqual([
      "agents-md",
      "operating-commands",
    ]);
    expect(report.assessment.checks[1].status).toBe("not-assessed");
  });

  it("preserves check text and references while producing valid UTF-8 JSON", () => {
    const tricky = 'quote " backslash \\ newline\n tab\t emoji \u{1F600} separator \u2028';
    const check = makeCheck({
      id: "agents-md",
      summary: tricky,
      details: tricky,
      whyThisMatters: tricky,
      recommendations: [tricky],
      references: [tricky, "https://example.com/a?b=c&d=e"],
    });
    const report = JSON.parse(buildReport(makeResult({ checks: [check] })));

    expect(report.assessment.checks[0].summary).toBe(tricky);
    expect(report.assessment.checks[0].details).toBe(tricky);
    expect(report.assessment.checks[0].whyThisMatters).toBe(tricky);
    expect(report.assessment.checks[0].recommendations).toEqual([tricky]);
    expect(report.assessment.checks[0].references).toEqual([
      tricky,
      "https://example.com/a?b=c&d=e",
    ]);
  });

  it("uses code-point ordering for machine artifacts", () => {
    const report = JSON.parse(
      buildReport(
        makeResult({
          checks: [makeCheck({ id: "a_b" }), makeCheck({ id: "a-b" })],
        }),
      ),
    );
    expect(report.assessment.evaluatedCheckIds).toEqual(["a-b", "a_b"]);
  });

  it("orders checks, check errors, and children deterministically", () => {
    const result = makeResult({
      checks: [
        makeCheck({ id: "root-readme" }),
        makeCheck({ id: "agents-md" }),
        makeCheck({ id: "ci-pipeline" }),
      ],
      checkErrors: [
        { checkId: "root-readme", checkName: "Root README", message: "second" },
        { checkId: "agents-md", checkName: "Agents guidance", message: "first" },
      ],
      recursiveScans: [
        {
          kind: "workspace",
          path: "z-pack",
          absolutePath: "/test/repo/z-pack",
          result: makeResult({ absolutePath: "/test/repo/z-pack", checks: [] }),
        },
        {
          kind: "submodule",
          path: "a-mod",
          absolutePath: "/test/repo/a-mod",
          result: makeResult({ absolutePath: "/test/repo/a-mod", checks: [] }),
        },
        {
          kind: "submodule",
          path: "b-mod",
          absolutePath: "/test/repo/b-mod",
          error: "child failed",
        },
      ],
    });

    const report = JSON.parse(buildReport(result));
    expect(report.assessment.checks.map((check: CheckResult) => check.id)).toEqual([
      "agents-md",
      "ci-pipeline",
      "root-readme",
    ]);
    expect(report.assessment.checkErrors.map((error: { checkId: string }) => error.checkId)).toEqual([
      "agents-md",
      "root-readme",
    ]);
    expect(report.assessment.children.map((child: { path: string }) => child.path)).toEqual([
      "a-mod",
      "b-mod",
      "z-pack",
    ]);
  });

  it("represents nested children and path-attributed child errors", () => {
    const nested = makeResult({
      absolutePath: "/test/repo/a-mod/nested",
      checkErrors: [{ checkId: "agents-md", checkName: "Agents guidance", message: "boom" }],
    });
    const child = makeResult({
      absolutePath: "/test/repo/a-mod",
      recursiveScans: [
        {
          kind: "submodule",
          path: "nested",
          absolutePath: "/test/repo/a-mod/nested",
          result: nested,
        },
      ],
    });
    const result = makeResult({
      recursiveScans: [
        {
          kind: "submodule",
          path: "a-mod",
          absolutePath: "/test/repo/a-mod",
          result: child,
        },
        {
          kind: "workspace",
          path: "broken",
          absolutePath: "/test/repo/broken",
          error: "Failed to read /test/repo/broken/src: permission denied",
        },
      ],
    });

    const report = JSON.parse(buildReport(result));
    const assessed = report.assessment.children.find(
      (entry: { path: string }) => entry.path === "a-mod",
    );
    expect(assessed.status).toBe("assessed");
    expect(assessed.error).toBeNull();
    expect(assessed.assessment.children[0].path).toBe("nested");
    expect(assessed.assessment.children[0].status).toBe("assessed");
    expect(assessed.assessment.children[0].assessment.checkErrors[0].message).toBe("boom");

    const broken = report.assessment.children.find(
      (entry: { path: string }) => entry.path === "broken",
    );
    expect(broken.status).toBe("error");
    expect(broken.assessment).toBeNull();
    expect(broken.error).toEqual({
      message: "Failed to read broken/src: permission denied",
    });
  });

  it("exports per-target type provenance and keeps root overrides root-only", () => {
    const child = makeResult({
      absolutePath: "/test/repo/software",
      repoType: "software",
      repoTypeSource: "detected",
      detectedRepoType: "software",
    });
    const result = makeResult({
      repoType: "non-software",
      repoTypeSource: "override",
      detectedRepoType: "software",
      recursiveScans: [
        {
          kind: "submodule",
          path: "software",
          absolutePath: "/test/repo/software",
          result: child,
        },
      ],
    });

    const report = JSON.parse(buildReport(result));
    expect(report.assessment.repoType).toBe("non-software");
    expect(report.assessment.repoTypeSource).toBe("override");
    expect(report.assessment.detectedRepoType).toBe("software");
    expect(report.assessment.children[0].assessment.repoType).toBe("software");
    expect(report.assessment.children[0].assessment.repoTypeSource).toBe("detected");
  });

  it("includes top recommendations with target attribution", () => {
    const rootCheck = makeCheck({
      id: "agents-md",
      tier: "critical",
      score: 0,
      recommendations: ["Add AGENTS.md"],
    });
    const childCheck = makeCheck({
      id: "ci-pipeline",
      tier: "important",
      score: 0,
      recommendations: ["Add CI"],
    });
    const result = makeResult({
      checks: [rootCheck],
      overallScore: 0,
      recursiveScans: [
        {
          kind: "workspace",
          path: "frontend",
          absolutePath: "/test/repo/frontend",
          result: makeResult({
            absolutePath: "/test/repo/frontend",
            checks: [childCheck],
            overallScore: 0,
          }),
        },
      ],
    });

    const report = JSON.parse(buildReport(result));
    expect(report.topRecommendations[0]).toMatchObject({
      checkId: "agents-md",
      checkName: "agents-md",
      targetPath: null,
      recommendation: "Add AGENTS.md",
      tier: "critical",
      score: 0,
    });
    expect(report.topRecommendations[1]).toMatchObject({
      checkId: "ci-pipeline",
      targetPath: "frontend",
      recommendation: "Add CI",
    });
  });

  it("refuses to serialize non-finite scores that would violate the schema", () => {
    const result = makeResult({
      checks: [makeCheck({ id: "agents-md", score: Number.NaN })],
      overallScore: Number.NaN,
    });
    expect(() => buildReport(result)).toThrow();
  });

  it("derives the filename timestamp from the same UTC run instant", () => {
    expect(reportTimestamp(new Date(FIXED_GENERATED_AT))).toBe("20260305T143045");
    expect(FIXED_TIMESTAMP).toBe("20260305T143045");
  });

  it("keeps run options after precedence, including unlimited depth", () => {
    const report = JSON.parse(
      buildReport(makeResult(), {
        skipIds: ["root-readme"],
        onlyIds: ["agents-md"],
        typeOverride: "non-software",
        depth: null,
      }),
    );
    expect(report.run.options).toEqual({
      skip: ["root-readme"],
      only: ["agents-md"],
      typeOverride: "non-software",
      depth: null,
    });
  });

  it("accepts documented additive fields and reserved extensible states", async () => {
    const report = JSON.parse(buildReport(makeResult({ checks: [makeCheck({ id: "agents-md" })] })));
    report.futureTopLevel = true;
    report.assessment.futureAssessment = true;
    report.assessment.checks[0].status = "not-assessed";
    report.assessment.checks[0].futureCheckField = { okay: true };
    report.assessment.children.push({
      kind: "directory",
      path: "src",
      status: "not-assessed",
      assessment: null,
      error: null,
      futureChildField: "yes",
    });

    const validate = await compilePublishedSchema();
    expect(validate(report)).toBe(true);
    expect(jsonReportSchema.safeParse(report).success).toBe(true);
  });
});

describe("JSON report schema publication", () => {
  it("matches the checked-in Draft 2020-12 schema", async () => {
    const checkedIn = JSON.parse(await fs.readFile(SCHEMA_PATH, "utf8"));
    expect(checkedIn).toEqual(buildJsonReportJsonSchema());
    expect(checkedIn.$id).toBe("urn:harnix:json-report:1");
  });

  it("accepts additive minor versions of the same major and rejects other majors", async () => {
    const report = JSON.parse(
      buildReport(makeResult({ checks: [makeCheck({ id: "agents-md" })] })),
    );
    const validate = await compilePublishedSchema();

    report.schemaVersion = "1.1";
    expect(validate(report)).toBe(true);
    expect(jsonReportSchema.safeParse(report).success).toBe(true);

    report.schemaVersion = "2.0";
    expect(validate(report)).toBe(false);
    expect(jsonReportSchema.safeParse(report).success).toBe(false);
  });

  it("ships the schema in the npm package contents", async () => {
    const pkg = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf8"));
    expect(pkg.files).toContain("schema/harnix-report.schema.json");
  });
});

describe("writeReportFiles JSON workflow", () => {
  let tmpDir: string;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tmpDir) {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("writes JSON only when requested and shares one instant across formats", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-json-"));
    const result = makeResult({ checks: [makeCheck({ id: "agents-md" })] });

    const withoutJson = await writeReportFiles(
      result.absolutePath,
      result.checks,
      result.overallScore,
      tmpDir,
      { scanResult: result, generatedAt: FIXED_GENERATED_AT },
    );
    expect(withoutJson.jsonPath).toBeUndefined();
    expect((await fs.readdir(tmpDir)).filter((entry) => entry.endsWith(".json"))).toEqual([]);

    const withJson = await writeReportFiles(
      result.absolutePath,
      result.checks,
      result.overallScore,
      tmpDir,
      {
        scanResult: result,
        generatedAt: FIXED_GENERATED_AT,
        jsonReport: true,
        runOptions,
      },
    );

    expect(withJson.generatedAt).toBe(FIXED_GENERATED_AT);
    expect(withJson.timestamp).toBe(FIXED_TIMESTAMP);
    expect(withJson.jsonPath).toBe(path.join(tmpDir, `report-${FIXED_TIMESTAMP}.json`));
    expect(await fs.readFile(withJson.markdownPath, "utf8")).toContain(FIXED_GENERATED_AT);
    expect(await fs.readFile(withJson.htmlPath, "utf8")).toContain(FIXED_GENERATED_AT);
    const json = JSON.parse(await fs.readFile(withJson.jsonPath!, "utf8"));
    expect(json.generatedAt).toBe(FIXED_GENERATED_AT);
  });

  it("reports a JSON write failure without returning an artifact path", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-json-fail-"));
    const result = makeResult({ checks: [makeCheck({ id: "agents-md" })] });
    await fs.mkdir(path.join(tmpDir, `report-${FIXED_TIMESTAMP}.json`));

    await expect(
      writeReportFiles(result.absolutePath, result.checks, result.overallScore, tmpDir, {
        scanResult: result,
        generatedAt: FIXED_GENERATED_AT,
        jsonReport: true,
        runOptions,
      }),
    ).rejects.toThrow();

    expect(await fs.stat(path.join(tmpDir, `report-${FIXED_TIMESTAMP}.md`))).toBeTruthy();
  });

  it("rejects a JSON request without a complete scan result", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-json-noresult-"));
    await expect(
      writeReportFiles("/test/repo", [], 0, tmpDir, { jsonReport: true }),
    ).rejects.toThrow("no scan result");
  });

  it("rejects a JSON request without effective run options", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-json-norun-"));
    const result = makeResult({ checks: [makeCheck({ id: "agents-md" })] });
    await expect(
      writeReportFiles(result.absolutePath, result.checks, result.overallScore, tmpDir, {
        scanResult: result,
        generatedAt: FIXED_GENERATED_AT,
        jsonReport: true,
      }),
    ).rejects.toThrow("no effective run options");
  });

  it("derives the shared assessment from scanResult when it is supplied", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-json-parity-"));
    const result = makeResult({
      checks: [makeCheck({ id: "agents-md", score: 1 })],
      overallScore: 1,
    });

    const written = await writeReportFiles(
      result.absolutePath,
      [],
      0,
      tmpDir,
      { scanResult: result, generatedAt: FIXED_GENERATED_AT },
    );

    expect(await fs.readFile(written.markdownPath, "utf8")).toContain("100%");
  });

  it("rejects an invalid generatedAt value", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-json-badtime-"));
    await expect(
      writeReportFiles("/test/repo", [], 0, tmpDir, { generatedAt: "not-a-date" }),
    ).rejects.toThrow("Invalid generatedAt");
  });
});

describe("markdown and HTML run identity", () => {
  it("includes the shared ISO instant when provided", () => {
    const markdown = buildMarkdownReport("/test/repo", [], 0, FIXED_TIMESTAMP, {
      generatedAt: FIXED_GENERATED_AT,
    });
    const html = buildHtmlReport("/test/repo", [], 0, FIXED_TIMESTAMP, {
      generatedAt: FIXED_GENERATED_AT,
    });
    expect(markdown).toContain(FIXED_GENERATED_AT);
    expect(html).toContain(FIXED_GENERATED_AT);
  });
});
