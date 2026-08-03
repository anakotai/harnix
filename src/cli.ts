import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { scanRepository } from "./engine.js";
import { printConsoleReport, writeReportFiles } from "./report.js";
import { configSchema } from "./schemas/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// From src/cli.ts: package.json is one level up; from dist/src/cli.js: two levels up
const HARNIX_ROOT = existsSync(path.join(__dirname, "..", "package.json"))
  ? path.resolve(__dirname, "..")
  : path.resolve(__dirname, "..", "..");
const ANSI_RESET = "\u001b[0m";
const ANSI_BOLD = "\u001b[1m";

interface ScanConfig {
  outputPath?: string;
  skipIds?: string[];
  onlyIds?: string[];
  repoType?: "software" | "non-software";
  depth?: number;
}

function supportsAnsiStyling(): boolean {
  if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === "0") {
    return false;
  }
  return process.stdout.isTTY === true;
}

function bold(text: string): string {
  if (!supportsAnsiStyling()) {
    return text;
  }
  return `${ANSI_BOLD}${text}${ANSI_RESET}`;
}

async function readVersion(): Promise<string | undefined> {
  try {
    const packageJsonPath = path.join(HARNIX_ROOT, "package.json");
    const content = await fs.readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(content) as { version: string };
    return typeof pkg.version === "string" && pkg.version.length > 0 ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

function printHelp(): void {
  console.log("Usage: harnix <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  scan [path]   Scan a repository for harness readiness");
  console.log("");
  console.log("Options:");
  console.log("  --help, -h       Show help text");
  console.log("  --version, -V    Show version number");
}

function printScanHelp(): void {
  console.log("Usage: harnix scan [path] [options]");
  console.log("");
  console.log("Scan a repository for harness readiness.");
  console.log("");
  console.log("Arguments:");
  console.log("  path             Path to repository (default: current directory)");
  console.log("");
  console.log("Options:");
  console.log("  --verbose        Show per-check rationale in console output");
  console.log("  --output <path>  Write reports to a custom output directory");
  console.log("  --skip <id>      Skip check IDs (comma-separated or repeated)");
  console.log("  --only <id>      Run only check IDs (comma-separated or repeated)");
  console.log("  --type <type>    Override repo type (software | non-software)");
  console.log("  --depth <n>      Recursive scan depth for submodules/workspaces (0 = root only)");
  console.log("  --help, -h       Show this help text");
}

async function ensureDirectory(targetPath: string): Promise<void> {
  let stats: import("node:fs").Stats;
  try {
    stats = await fs.stat(targetPath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`Path does not exist: ${targetPath}`, { cause: error });
    }
    throw error;
  }
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${targetPath}`);
  }
}

async function loadScanConfig(scanRootPath: string): Promise<ScanConfig> {
  const configPath = path.join(scanRootPath, ".harnix.yaml");
  let configContent: string;

  try {
    configContent = await fs.readFile(configPath, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return {};
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read .harnix.yaml at ${configPath}: ${message}`, { cause: error });
  }

  return parseScanConfig(configContent, configPath);
}

function parseScanConfig(configContent: string, configPath: string): ScanConfig {
  let parsedDocument: ReturnType<typeof parseDocument>;
  try {
    parsedDocument = parseDocument(configContent);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid .harnix.yaml at ${configPath}: ${message}`, { cause: error });
  }

  if (parsedDocument.errors.length > 0) {
    const [firstError] = parsedDocument.errors;
    const message = firstError?.message ?? "Unable to parse YAML";
    throw new Error(`Invalid .harnix.yaml at ${configPath}: ${message}`);
  }

  const rawConfig = parsedDocument.toJS() as unknown;
  if (rawConfig == null) {
    return {};
  }

  if (typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    throw new Error(`Invalid .harnix.yaml at ${configPath}: top-level value must be a mapping`);
  }

  const result = configSchema.safeParse(rawConfig);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid .harnix.yaml at ${configPath}: ${issues}`);
  }

  const config = result.data;
  const normalizedConfig: ScanConfig = {};

  if (config.output) {
    normalizedConfig.outputPath = config.output;
  }
  if (config.skip && config.skip.length > 0) {
    normalizedConfig.skipIds = dedupeIds(config.skip);
  }
  if (config.only && config.only.length > 0) {
    normalizedConfig.onlyIds = dedupeIds(config.only);
  }
  if (config.type) {
    normalizedConfig.repoType = config.type;
  }
  if (typeof config.depth === "number") {
    normalizedConfig.depth = config.depth;
  }

  return normalizedConfig;
}

function parseIdList(optionName: string, rawValue: string): string[] {
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

function dedupeIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function parseRepoType(optionName: string, rawValue: string | undefined): "software" | "non-software" {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    throw new Error(`Missing value for ${optionName}`);
  }

  const normalized = rawValue.trim();
  const validTypes = new Set(["software", "non-software"]);
  if (!validTypes.has(normalized)) {
    throw new Error(`Invalid value for ${optionName}: ${normalized}`);
  }

  return normalized as "software" | "non-software";
}

function parseDepth(optionName: string, rawValue: string | undefined): number {
  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    throw new Error(`Missing value for ${optionName}`);
  }

  const parsed = Number(rawValue.trim());
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid value for ${optionName}: ${rawValue}`);
  }

  return parsed;
}

interface ParsedScanArgs {
  targetPath: string;
  outputPath?: string;
  repoType?: "software" | "non-software";
  depth?: number;
  verbose: boolean;
  skipIds: string[];
  onlyIds: string[];
}

function parseScanArgs(args: string[]): ParsedScanArgs {
  let targetPath = ".";
  let hasTargetPath = false;
  let outputPath: string | undefined;
  let repoType: "software" | "non-software" | undefined;
  let depth: number | undefined;
  let verbose = false;
  const skipIds: string[] = [];
  const onlyIds: string[] = [];

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

    if (argument?.startsWith("--output=")) {
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

    if (argument?.startsWith("--skip=")) {
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

    if (argument?.startsWith("--only=")) {
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

    if (argument?.startsWith("--type=")) {
      const value = argument.slice("--type=".length);
      repoType = parseRepoType("--type", value);
      continue;
    }

    if (argument === "--depth") {
      const value = args[index + 1];
      depth = parseDepth("--depth", value);
      index += 1;
      continue;
    }

    if (argument?.startsWith("--depth=")) {
      const value = argument.slice("--depth=".length);
      depth = parseDepth("--depth", value);
      continue;
    }

    if (argument?.startsWith("-")) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (hasTargetPath) {
      throw new Error(`Unexpected argument: ${argument}`);
    }

    targetPath = argument!;
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
    depth,
    verbose,
    skipIds: uniqueSkipIds,
    onlyIds: uniqueOnlyIds
  };
}

export async function runCli(args: string[]): Promise<void> {
  const [command, ...commandArgs] = args;

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "--version" || command === "-V") {
    const version = await readVersion();
    if (!version) {
      console.error("Unable to read package version");
      process.exitCode = 1;
      return;
    }
    console.log(version);
    return;
  }

  if (command !== "scan") {
    console.error(`Unknown command: ${command}`);
    console.error("");
    printHelp();
    process.exitCode = 1;
    return;
  }

  if (commandArgs.includes("--help") || commandArgs.includes("-h")) {
    printScanHelp();
    return;
  }

  const { targetPath, outputPath, repoType, depth, verbose, skipIds, onlyIds } = parseScanArgs(
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

  // CLI flags override config. CLI --only ignores all skip sources (including config).
  // CLI --skip still applies when only comes from config (config only does not swallow CLI skip).
  const cliOnly = onlyIds.length > 0;
  const cliSkip = skipIds.length > 0;
  const effectiveOnlyIds = cliOnly ? onlyIds : (config.onlyIds ?? []);
  const effectiveSkipIds = cliOnly
    ? []
    : cliSkip
      ? skipIds
      : effectiveOnlyIds.length > 0
        ? []
        : (config.skipIds ?? []);
  const effectiveRepoType = repoType ?? config.repoType;
  const effectiveDepth = depth ?? config.depth;

  const result = await scanRepository(resolvedPath, {
    skipIds: effectiveSkipIds,
    onlyIds: effectiveOnlyIds,
    repoType: effectiveRepoType,
    maxDepth: effectiveDepth
  });
  const harnixVersion = await readVersion();
  printConsoleReport(targetPath, result.checks, result.overallScore, {
    verbose,
    recursiveScans: result.recursiveScans,
    harnixVersion
  });

  const reports = await writeReportFiles(
    result.absolutePath,
    result.checks,
    result.overallScore,
    resolvedOutputPath,
    { recursiveScans: result.recursiveScans, harnixVersion }
  );
  console.log("");
  console.log(bold("Reports written:"));
  console.log(reports.markdownPath);
  console.log(reports.htmlPath);
}
