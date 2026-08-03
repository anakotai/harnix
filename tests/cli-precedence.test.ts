import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

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

describe("CLI skip/only precedence vs config", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-cli-prec-"));
    scanRepositoryMock.mockReset();
    printConsoleReportMock.mockReset();
    writeReportFilesMock.mockReset();
    scanRepositoryMock.mockResolvedValue({
      absolutePath: path.resolve(tmpDir),
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
    });
    writeReportFilesMock.mockResolvedValue({
      markdownPath: "/tmp/report.md",
      htmlPath: "/tmp/report.html",
      timestamp: "20260311T000000",
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("applies CLI --skip even when config only is set", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".harnix.yaml"),
      "only:\n  - agents-md\n  - root-readme\n",
      "utf8",
    );

    await runCli(["scan", tmpDir, "--skip", "root-readme"]);

    expect(scanRepositoryMock).toHaveBeenCalledWith(
      path.resolve(tmpDir),
      expect.objectContaining({
        onlyIds: ["agents-md", "root-readme"],
        skipIds: ["root-readme"],
      }),
    );
  });
});
