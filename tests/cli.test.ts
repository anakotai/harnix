import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import type { ScanResult } from "../src/engine.js";

const scanRepositoryMock = vi.hoisted(() => vi.fn());
const printConsoleReportMock = vi.hoisted(() => vi.fn());
const writeReportFilesMock = vi.hoisted(() => vi.fn());

vi.mock("../src/engine.js", () => ({
  scanRepository: scanRepositoryMock,
}));

vi.mock("../src/report.js", () => ({
  printConsoleReport: printConsoleReportMock,
  writeReportFiles: writeReportFilesMock,
}));

import { runCli } from "../src/cli.js";

function makeResult(absolutePath: string): ScanResult {
  return {
    absolutePath,
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
    overallScore: 1,
    checks: [],
    recursiveScans: [],
  };
}

describe("runCli depth option", () => {
  let tmpDir: string;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-cli-"));
    scanRepositoryMock.mockReset();
    printConsoleReportMock.mockReset();
    writeReportFilesMock.mockReset();
    scanRepositoryMock.mockResolvedValue(makeResult(path.resolve(tmpDir)));
    writeReportFilesMock.mockResolvedValue({
      markdownPath: "/tmp/report.md",
      htmlPath: "/tmp/report.html",
      timestamp: "20260311T000000",
    });
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    consoleLogSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("passes --depth to scanRepository", async () => {
    await runCli(["scan", tmpDir, "--depth", "0"]);

    expect(scanRepositoryMock).toHaveBeenCalledWith(
      path.resolve(tmpDir),
      expect.objectContaining({ maxDepth: 0 }),
    );
  });

  it("uses config depth when CLI depth is not provided", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".harnix.yaml"),
      "depth: 1\n",
      "utf8",
    );

    await runCli(["scan", tmpDir]);

    expect(scanRepositoryMock).toHaveBeenCalledWith(
      path.resolve(tmpDir),
      expect.objectContaining({ maxDepth: 1 }),
    );
  });

  it("lets CLI depth override config depth", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".harnix.yaml"),
      "depth: 2\n",
      "utf8",
    );

    await runCli(["scan", tmpDir, "--depth=0"]);

    expect(scanRepositoryMock).toHaveBeenCalledWith(
      path.resolve(tmpDir),
      expect.objectContaining({ maxDepth: 0 }),
    );
  });

  it("throws when depth is invalid", async () => {
    await expect(runCli(["scan", tmpDir, "--depth", "-1"])).rejects.toThrow(
      "Invalid value for --depth: -1",
    );
    expect(scanRepositoryMock).not.toHaveBeenCalled();
  });
});
