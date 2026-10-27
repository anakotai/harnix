import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCli } from "../src/cli.js";
import { scanRepository } from "../src/engine.js";
import { jsonReportSchema } from "../src/schemas/report.js";

const FIXTURES = path.resolve(import.meta.dirname!, "fixtures");
const PASS_ALL = path.join(FIXTURES, "pass-all");

function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  });
  const errorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args.map((value) => String(value)).join(" "));
  });
  return { logs, errors, logSpy, errorSpy };
}

async function readAnnouncedJson(logs: string[]): Promise<string> {
  const jsonPath = logs.find((line) => line.endsWith(".json"));
  if (!jsonPath) {
    throw new Error(`No JSON report path announced. Logs: ${logs.join(" | ")}`);
  }
  return jsonPath;
}

describe("CLI --json-report integration", () => {
  let tmpDir: string;
  let consoleSpies: ReturnType<typeof captureConsole>;
  let previousExitCode: string | number | undefined;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-cli-json-"));
    consoleSpies = captureConsole();
    previousExitCode = process.exitCode ?? undefined;
    process.exitCode = undefined;
  });

  afterEach(async () => {
    consoleSpies.logSpy.mockRestore();
    consoleSpies.errorSpy.mockRestore();
    process.exitCode = previousExitCode ?? undefined;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("writes a schema-valid artifact from a real engine run and announces its path", async () => {
    const outputDir = path.join(tmpDir, "reports");
    const expected = await scanRepository(PASS_ALL, { recursive: false });

    await runCli(["scan", PASS_ALL, "--output", outputDir, "--json-report"]);

    const jsonPath = await readAnnouncedJson(consoleSpies.logs);
    expect(path.dirname(jsonPath)).toBe(outputDir);
    const report = JSON.parse(await fs.readFile(jsonPath, "utf8"));
    expect(jsonReportSchema.safeParse(report).success).toBe(true);
    expect(report.assessment.localScore).toBe(expected.localScore);
    expect(report.assessment.evaluatedCheckIds).toEqual(
      [...expected.checks.map((check) => check.id)].sort(),
    );
    expect(process.exitCode).toBeUndefined();
  });

  it("does not write or announce JSON without the opt-in flag", async () => {
    const outputDir = path.join(tmpDir, "reports");

    await runCli(["scan", PASS_ALL, "--output", outputDir]);

    expect(consoleSpies.logs.some((line) => line.endsWith(".json"))).toBe(false);
    expect((await fs.readdir(outputDir)).filter((entry) => entry.endsWith(".json"))).toEqual([]);
    expect(process.exitCode).toBeUndefined();
  });

  it("exports effective CLI/config precedence and root-only type overrides", async () => {
    const repoDir = path.join(tmpDir, "repo");
    const outputDir = path.join(tmpDir, "reports");
    await fs.mkdir(repoDir, { recursive: true });
    await fs.writeFile(path.join(repoDir, "package.json"), '{"name":"demo"}\n', "utf8");
    await fs.writeFile(path.join(repoDir, "README.md"), "# Demo\n", "utf8");
    await fs.writeFile(path.join(repoDir, ".harnix.yaml"), "only:\n  - agents-md\n", "utf8");

    await runCli([
      "scan",
      repoDir,
      "--skip",
      "root-readme",
      "--type",
      "non-software",
      "--depth",
      "0",
      "--output",
      outputDir,
      "--json-report",
    ]);

    const report = JSON.parse(await fs.readFile(await readAnnouncedJson(consoleSpies.logs), "utf8"));
    expect(report.run.options).toEqual({
      skip: ["root-readme"],
      only: ["agents-md"],
      typeOverride: "non-software",
      depth: 0,
    });
    expect(report.assessment.repoType).toBe("non-software");
    expect(report.assessment.repoTypeSource).toBe("override");
    expect(report.assessment.detectedRepoType).toBe("software");
    expect(report.assessment.evaluatedCheckIds).toEqual(["agents-md"]);
    expect(report.assessment.children).toEqual([]);
  });

  it("exports no-checks as an unavailable local score rather than zero", async () => {
    const outputDir = path.join(tmpDir, "reports");

    await runCli([
      "scan",
      PASS_ALL,
      "--only",
      "not-a-real-check",
      "--output",
      outputDir,
      "--json-report",
    ]);

    const report = JSON.parse(await fs.readFile(await readAnnouncedJson(consoleSpies.logs), "utf8"));
    expect(report.assessment.localScore).toBeNull();
    expect(report.assessment.localScoreState).toBe("no-checks");
    expect(report.assessment.band).toBeNull();
    expect(report.assessment.evaluatedCheckIds).toEqual([]);
  });

  it("exits nonzero and announces no artifacts when the requested report cannot be written", async () => {
    const blocker = path.join(tmpDir, "blocker");
    await fs.writeFile(blocker, "not a directory", "utf8");

    await runCli([
      "scan",
      PASS_ALL,
      "--output",
      path.join(blocker, "reports"),
      "--json-report",
    ]);

    expect(process.exitCode).toBe(1);
    expect(consoleSpies.errors.join("\n")).toContain("failed to write report files");
    expect(consoleSpies.logs.some((line) => line.includes("Reports written:"))).toBe(false);
    expect(consoleSpies.logs.some((line) => line.endsWith(".json"))).toBe(false);
  });
});
