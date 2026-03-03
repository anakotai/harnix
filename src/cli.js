import { promises as fs } from "node:fs";
import path from "node:path";
import { scanRepository } from "./engine.js";
import { printConsoleReport, writeReportFiles } from "./report.js";

function printHelp() {
  console.log("Usage: harnix scan [path]");
  console.log("");
  console.log("Commands:");
  console.log("  scan [path]   Scan a repository for harness readiness");
}

/**
 * @param {string} targetPath
 */
async function ensureDirectory(targetPath) {
  let stats;
  try {
    stats = await fs.stat(targetPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Path does not exist: ${targetPath}`);
    }
    throw error;
  }
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${targetPath}`);
  }
}

/**
 * @param {string[]} args
 */
export async function runCli(args) {
  const [command, maybePath] = args;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command !== "scan") {
    throw new Error(`Unknown command: ${command}`);
  }

  const targetPath = maybePath ?? ".";
  const resolvedPath = path.resolve(targetPath);
  await ensureDirectory(resolvedPath);

  const result = await scanRepository(resolvedPath);
  printConsoleReport(targetPath, result.checks, result.overallScore);

  const reports = await writeReportFiles(result.absolutePath, result.checks, result.overallScore);
  console.log("");
  console.log(`Reports written: ${reports.markdownPath}`);
  console.log(`                 ${reports.htmlPath}`);
}
