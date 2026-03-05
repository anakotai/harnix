import path from "node:path";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import type { CheckResult, RecursiveScanResult } from "./types.js";
import { detectGitInfo, detectRepoType, listFiles } from "./scanner.js";
import type { GitInfo } from "./scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// From src/engine.ts: package.json is one level up
// From dist/src/engine.js: package.json is two levels up
const HARNIX_ROOT = existsSync(path.join(__dirname, "..", "package.json"))
  ? path.resolve(__dirname, "..")
  : path.resolve(__dirname, "..", "..");
const CHECKS_DIR = path.join(HARNIX_ROOT, "checks");
const DIST_CHECKS_DIR = path.join(HARNIX_ROOT, "dist", "checks");

interface CheckMeta {
  id: string;
  name: string;
  category?: string;
  tier: string;
  description?: string;
  applicableTo: string;
}

interface DiscoveredCheck {
  dirName: string;
  meta: CheckMeta;
}

/**
 * Discovers all available checks by scanning checks/{id}/meta.yaml.
 * No hardcoded check list — adding a new check only requires
 * creating a new directory with meta.yaml + check.ts under checks/.
 */
async function discoverChecks(): Promise<DiscoveredCheck[]> {
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fs.readdir(CHECKS_DIR, { withFileTypes: true });
  } catch {
    throw new Error(`Checks directory not found: ${CHECKS_DIR}`);
  }

  const discovered: DiscoveredCheck[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const metaPath = path.join(CHECKS_DIR, entry.name, "meta.yaml");
    let content: string;
    try {
      content = await fs.readFile(metaPath, "utf8");
    } catch {
      continue;
    }

    const doc = parseDocument(content);
    if (doc.errors.length > 0) {
      console.warn(
        `Warning: invalid meta.yaml in checks/${entry.name}/: ${doc.errors[0].message}`
      );
      continue;
    }

    const meta = doc.toJS() as Record<string, unknown>;
    if (!meta || typeof meta !== "object") continue;
    if (!meta.id || !meta.name || !meta.tier || !meta.applicableTo) {
      console.warn(
        `Warning: checks/${entry.name}/meta.yaml missing required fields (id, name, tier, applicableTo)`
      );
      continue;
    }

    discovered.push({ dirName: entry.name, meta: meta as unknown as CheckMeta });
  }

  return discovered;
}

async function loadCheckFunction(dirName: string): Promise<(ctx: import("./types.js").ScanContext) => Promise<CheckResult>> {
  const compiledPath = path.join(DIST_CHECKS_DIR, dirName, "check.js");
  const sourcePath = path.join(CHECKS_DIR, dirName, "check.ts");

  let checkPath: string;
  try {
    await fs.access(compiledPath);
    checkPath = compiledPath;
  } catch {
    try {
      await fs.access(sourcePath);
      checkPath = sourcePath;
    } catch {
      throw new Error(
        `Check not found for "${dirName}". Run "npm run build" first.`
      );
    }
  }

  const module = await import(pathToFileURL(checkPath).href) as { default?: unknown };
  if (typeof module.default !== "function") {
    throw new Error(
      `checks/${dirName}/check.ts does not export a default function`
    );
  }

  return module.default as (ctx: import("./types.js").ScanContext) => Promise<CheckResult>;
}

interface ScanContext {
  rootPath: string;
  files: string[];
  repoType: "software" | "non-software";
  gitInfo: GitInfo;
}

interface RunOptions {
  skipIds?: string[];
  onlyIds?: string[];
}

async function runDiscoveredChecks(ctx: ScanContext, options: RunOptions = {}): Promise<CheckResult[]> {
  const discovered = await discoverChecks();
  const skipIds = new Set(options.skipIds ?? []);
  const onlyIds = new Set(options.onlyIds ?? []);
  const hasOnlyFilter = onlyIds.size > 0;

  const applicable = discovered.filter(({ meta }) => {
    const id = meta.id;
    if (hasOnlyFilter && !onlyIds.has(id)) return false;
    if (skipIds.has(id)) return false;
    if (meta.applicableTo === "all") return true;
    return meta.applicableTo === ctx.repoType;
  });

  const checkPromises = applicable.map(async ({ dirName, meta }): Promise<CheckResult> => {
    try {
      const checkFn = await loadCheckFunction(dirName);
      return await checkFn(ctx);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Warning: check "${meta.id}" failed to run: ${message}`);
      return {
        id: meta.id,
        name: meta.name,
        category: meta.category ?? "unknown",
        tier: (meta.tier as CheckResult["tier"]),
        score: 0,
        status: "fail",
        summary: `Check failed to run: ${message}`,
        details: `The check "${meta.id}" threw an error during execution.`,
        whyThisMatters: meta.description ?? "",
        recommendations: ["Fix the check implementation or report the issue."],
        references: []
      };
    }
  });

  return Promise.all(checkPromises);
}

export interface ScanOptions {
  skipIds?: string[];
  onlyIds?: string[];
  repoType?: "software" | "non-software";
  recursive?: boolean;
  _visitedPaths?: Set<string>;
}

export interface ScanResult {
  absolutePath: string;
  repoType: "software" | "non-software";
  gitInfo: GitInfo;
  overallScore: number;
  checks: CheckResult[];
  recursiveScans: RecursiveScanEntry[];
}

export interface RecursiveScanEntry {
  kind: "submodule" | "workspace";
  path: string;
  absolutePath: string;
  result?: ScanResult;
  error?: string;
}

export const TIER_WEIGHTS: Record<string, number> = {
  critical: 3,
  important: 2,
  "nice-to-have": 1
};

export function tierWeight(tier: string): number {
  return TIER_WEIGHTS[tier] ?? 1;
}

export async function scanRepository(targetPath: string, options: ScanOptions = {}): Promise<ScanResult> {
  const absolutePath = path.resolve(targetPath);
  const recursive = options.recursive !== false;
  const visitedPaths = options._visitedPaths ?? new Set<string>();
  visitedPaths.add(absolutePath);

  const files = await listFiles(absolutePath);
  const repoType = options.repoType ?? detectRepoType(files);
  const gitInfo = await detectGitInfo(absolutePath, files);

  const ctx: ScanContext = { rootPath: absolutePath, files, repoType, gitInfo };
  const checks = await runDiscoveredChecks(ctx, {
    skipIds: options.skipIds,
    onlyIds: options.onlyIds
  });

  const recursiveScans = recursive
    ? await runRecursiveScans(absolutePath, gitInfo, {
        skipIds: options.skipIds,
        onlyIds: options.onlyIds,
        repoType: options.repoType,
        recursive,
        visitedPaths
      })
    : [];

  const weightedSum = checks.reduce((sum, check) => sum + tierWeight(check.tier) * check.score, 0);
  const totalWeight = checks.reduce((sum, check) => sum + tierWeight(check.tier), 0);
  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    absolutePath,
    repoType,
    gitInfo,
    overallScore,
    checks,
    recursiveScans
  };
}

interface RecursiveScanOptions {
  skipIds?: string[];
  onlyIds?: string[];
  repoType?: "software" | "non-software";
  recursive: boolean;
  visitedPaths: Set<string>;
}

async function runRecursiveScans(
  rootPath: string,
  gitInfo: GitInfo,
  options: RecursiveScanOptions
): Promise<RecursiveScanEntry[]> {
  const submodulePaths = (gitInfo.submodules ?? []).map((entry) => ({
    kind: "submodule" as const,
    relativePath: entry
  }));
  const workspacePaths = (gitInfo.workspaces ?? []).map((entry) => ({
    kind: "workspace" as const,
    relativePath: entry
  }));
  const candidates = [...submodulePaths, ...workspacePaths];
  const recursiveScans: RecursiveScanEntry[] = [];

  for (const candidate of candidates) {
    const normalizedPath = normalizeRelativePath(candidate.relativePath);
    if (normalizedPath.length === 0 || normalizedPath === ".") {
      continue;
    }

    const absoluteChildPath = path.resolve(rootPath, normalizedPath);
    if (options.visitedPaths.has(absoluteChildPath)) {
      continue;
    }

    const childStats = await safeStatDirectory(absoluteChildPath);
    if (!childStats) {
      continue;
    }

    try {
      const result = await scanRepository(absoluteChildPath, {
        skipIds: options.skipIds,
        onlyIds: options.onlyIds,
        repoType: options.repoType,
        recursive: options.recursive,
        _visitedPaths: options.visitedPaths
      });

      recursiveScans.push({
        kind: candidate.kind,
        path: normalizedPath,
        absolutePath: absoluteChildPath,
        result
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      recursiveScans.push({
        kind: candidate.kind,
        path: normalizedPath,
        absolutePath: absoluteChildPath,
        error: message
      });
    }
  }

  return recursiveScans;
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "").trim();
}

async function safeStatDirectory(absolutePath: string): Promise<import("node:fs").Stats | null> {
  try {
    const stats = await fs.stat(absolutePath);
    return stats.isDirectory() ? stats : null;
  } catch {
    return null;
  }
}
