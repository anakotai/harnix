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
  console.log("  --verbose        Show per-check rationale in console output");
  console.log("  --output <path>  Write reports to a custom output directory");
  console.log("  --skip <id>      Skip check IDs (comma-separated or repeated)");
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
 * @param {string} optionName
 * @param {string} rawValue
 */
function parseIdList(optionName, rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    throw new Error(`Missing value for ${optionName}`);
  }

  const ids = rawValue
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (ids.length === 0) {
    throw new Error(`Missing value for ${optionName}`);
  }

  return ids;
}

/**
 * @param {string[]} ids
 */
function dedupeIds(ids) {
  return Array.from(new Set(ids));
}

/**
 * @param {string[]} args
 */
function parseScanArgs(args) {
  let targetPath = ".";
  let hasTargetPath = false;
  let outputPath;
  let verbose = false;
  /** @type {string[]} */
  const skipIds = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];

    if (argument === "--verbose") {
      verbose = true;
      continue;
    }

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

    if (argument === "--skip") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --skip");
      }
      skipIds.push(...parseIdList("--skip", value));
      index += 1;
      continue;
    }

    if (argument.startsWith("--skip=")) {
      const value = argument.slice("--skip=".length);
      skipIds.push(...parseIdList("--skip", value));
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

  return { targetPath, outputPath, verbose, skipIds: dedupeIds(skipIds) };
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

  const { targetPath, outputPath, verbose, skipIds } = parseScanArgs(commandArgs);
  const resolvedPath = path.resolve(targetPath);
  const resolvedOutputPath = outputPath ? path.resolve(outputPath) : undefined;
  await ensureDirectory(resolvedPath);

  const result = await scanRepository(resolvedPath, { skipIds });
  printConsoleReport(targetPath, result.checks, result.overallScore, { verbose });

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
