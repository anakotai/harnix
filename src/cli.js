import { promises as fs } from "node:fs";
import path from "node:path";
import { scanRepository } from "./engine.js";
import { printConsoleReport, writeReportFiles } from "./report.js";

function printHelp() {
  console.log("Usage: harnix scan [path]");
  console.log("");
  console.log("Commands:");
  console.log("  scan [path]   Scan a repository for harness readiness");
  console.log("");
  console.log("Options:");
  console.log("  --output <path>  Write reports to a custom output directory");
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
function parseScanArgs(args) {
  let targetPath = ".";
  let hasTargetPath = false;
  let outputPath;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--output") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --output");
      }
      outputPath = value;
      index += 1;
      continue;
    }

    if (argument.startsWith("--output=")) {
      outputPath = argument.slice("--output=".length);
      if (!outputPath) {
        throw new Error("Missing value for --output");
      }
      continue;
    }

    if (argument.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (hasTargetPath) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    targetPath = argument;
    hasTargetPath = true;
  }

  return { targetPath, outputPath };
}

/**
 * @param {string[]} args
 */
export async function runCli(args) {
  const [command, ...commandArgs] = args;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command !== "scan") {
    throw new Error(`Unknown command: ${command}`);
  }

  const { targetPath, outputPath } = parseScanArgs(commandArgs);
  const resolvedPath = path.resolve(targetPath);
  const resolvedOutputPath = outputPath ? path.resolve(outputPath) : undefined;
  await ensureDirectory(resolvedPath);

  const result = await scanRepository(resolvedPath);
  printConsoleReport(targetPath, result.checks, result.overallScore);

  const reports = await writeReportFiles(
    result.absolutePath,
    result.checks,
    result.overallScore,
    resolvedOutputPath
  );
  console.log("");
  console.log(`Reports written: ${reports.markdownPath}`);
  console.log(`                 ${reports.htmlPath}`);
}
