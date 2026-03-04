import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";
import { scanRepository } from "./engine.js";
import { printConsoleReport, writeReportFiles } from "./report.js";

const VALID_REPO_TYPES = new Set(["software", "non-software"]);

/**
 * @typedef {{outputPath?: string, skipIds?: string[], repoType?: "software" | "non-software"}} ScanConfig
 */

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
  console.log("  --only <id>      Run only check IDs (comma-separated or repeated)");
  console.log("  --type <type>    Override repo type (software | non-software)");
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
 * @param {string} scanRootPath
 */
async function loadScanConfig(scanRootPath) {
  const configPath = path.join(scanRootPath, ".harnix.yaml");
  let configContent;

  try {
    configContent = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read .harnix.yaml at ${configPath}: ${message}`);
  }

  return parseScanConfig(configContent, configPath);
}

/**
 * @param {string} configContent
 * @param {string} configPath
 * @returns {ScanConfig}
 */
function parseScanConfig(configContent, configPath) {
  let parsedDocument;
  try {
    parsedDocument = parseDocument(configContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid .harnix.yaml at ${configPath}: ${message}`);
  }

  if (parsedDocument.errors.length > 0) {
    const [firstError] = parsedDocument.errors;
    const message = firstError?.message ?? "Unable to parse YAML";
    throw new Error(`Invalid .harnix.yaml at ${configPath}: ${message}`);
  }

  const rawConfig = parsedDocument.toJS();
  if (rawConfig == null) {
    return {};
  }

  if (typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new Error(`Invalid .harnix.yaml at ${configPath}: top-level value must be a mapping`);
  }

  /** @type {ScanConfig} */
  const normalizedConfig = {};

  if ("output" in rawConfig) {
    const { output } = rawConfig;
    if (typeof output !== "string" || output.trim().length === 0) {
      throw new Error(`Invalid .harnix.yaml at ${configPath}: output must be a non-empty string`);
    }
    normalizedConfig.outputPath = output.trim();
  }

  if ("skip" in rawConfig) {
    const { skip } = rawConfig;
    if (!Array.isArray(skip)) {
      throw new Error(`Invalid .harnix.yaml at ${configPath}: skip must be an array of check IDs`);
    }

    const skipIds = skip.map((item) => {
      if (typeof item !== "string" || item.trim().length === 0) {
        throw new Error(
          `Invalid .harnix.yaml at ${configPath}: skip entries must be non-empty strings`
        );
      }
      return item.trim();
    });

    normalizedConfig.skipIds = dedupeIds(skipIds);
  }

  if ("type" in rawConfig) {
    const { type } = rawConfig;
    if (typeof type !== "string" || !VALID_REPO_TYPES.has(type)) {
      throw new Error(
        `Invalid .harnix.yaml at ${configPath}: type must be \"software\" or \"non-software\"`
      );
    }

    normalizedConfig.repoType = type;
  }

  return normalizedConfig;
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
 * @param {string} optionName
 * @param {string} rawValue
 */
function parseRepoType(optionName, rawValue) {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    throw new Error(`Missing value for ${optionName}`);
  }

  const normalized = rawValue.trim();
  if (!VALID_REPO_TYPES.has(normalized)) {
    throw new Error(`Invalid value for ${optionName}: ${normalized}`);
  }

  return normalized;
}

/**
 * @param {string[]} args
 */
function parseScanArgs(args) {
  let targetPath = ".";
  let hasTargetPath = false;
  let outputPath;
  /** @type {"software" | "non-software" | undefined} */
  let repoType;
  let verbose = false;
  /** @type {string[]} */
  const skipIds = [];
  /** @type {string[]} */
  const onlyIds = [];

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

    if (argument === "--only") {
      const value = args[index + 1];
      if (!value) {
        throw new Error("Missing value for --only");
      }
      onlyIds.push(...parseIdList("--only", value));
      index += 1;
      continue;
    }

    if (argument.startsWith("--only=")) {
      const value = argument.slice("--only=".length);
      onlyIds.push(...parseIdList("--only", value));
      continue;
    }

    if (argument === "--type") {
      const value = args[index + 1];
      repoType = parseRepoType("--type", value);
      index += 1;
      continue;
    }

    if (argument.startsWith("--type=")) {
      const value = argument.slice("--type=".length);
      repoType = parseRepoType("--type", value);
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

  const uniqueSkipIds = dedupeIds(skipIds);
  const uniqueOnlyIds = dedupeIds(onlyIds);

  if (uniqueSkipIds.length > 0 && uniqueOnlyIds.length > 0) {
    throw new Error("--skip and --only cannot be used together");
  }

  return {
    targetPath,
    outputPath,
    repoType,
    verbose,
    skipIds: uniqueSkipIds,
    onlyIds: uniqueOnlyIds
  };
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

  const { targetPath, outputPath, repoType, verbose, skipIds, onlyIds } = parseScanArgs(
    commandArgs
  );
  const resolvedPath = path.resolve(targetPath);
  await ensureDirectory(resolvedPath);
  const config = await loadScanConfig(resolvedPath);

  const resolvedOutputPath = outputPath
    ? path.resolve(outputPath)
    : config.outputPath
      ? path.resolve(resolvedPath, config.outputPath)
      : undefined;

  const effectiveOnlyIds = onlyIds;
  const effectiveSkipIds =
    effectiveOnlyIds.length > 0 ? [] : skipIds.length > 0 ? skipIds : (config.skipIds ?? []);
  const effectiveRepoType = repoType ?? config.repoType;

  const result = await scanRepository(resolvedPath, {
    skipIds: effectiveSkipIds,
    onlyIds: effectiveOnlyIds,
    repoType: effectiveRepoType
  });
  printConsoleReport(targetPath, result.checks, result.overallScore, {
    verbose,
    recursiveScans: result.recursiveScans
  });

  const reports = await writeReportFiles(
    result.absolutePath,
    result.checks,
    result.overallScore,
    resolvedOutputPath,
    { recursiveScans: result.recursiveScans }
  );
  console.log("");
  console.log(`Reports written: ${reports.markdownPath}`);
  console.log(`                 ${reports.htmlPath}`);

  return result;
}
