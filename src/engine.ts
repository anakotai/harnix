import path from "node:path";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import type { CheckResult } from "./types.js";
import {
  detectGitInfo,
  detectRepoType,
  inventoryTree,
  type InventoryNode
} from "./scanner.js";
import type { GitInfo } from "./scanner.js";
import { metaSchema, type CheckMeta } from "./schemas/meta.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// From src/engine.ts: package.json is one level up
// From dist/src/engine.js: package.json is two levels up
const HARNIX_ROOT = existsSync(path.join(__dirname, "..", "package.json"))
  ? path.resolve(__dirname, "..")
  : path.resolve(__dirname, "..", "..");
const CHECKS_DIR = path.join(HARNIX_ROOT, "checks");
const DIST_CHECKS_DIR = path.join(HARNIX_ROOT, "dist", "checks");

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

    const result = metaSchema.safeParse(meta);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new Error(
        `Invalid meta.yaml in checks/${entry.name}/: ${issues}`
      );
    }

    discovered.push({ dirName: entry.name, meta: result.data });
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
    const canLoadTypescript = process.env.VITEST === "true";
    if (!canLoadTypescript) {
      throw new Error(
        `Compiled check not found for "${dirName}". Run "npm run build" first.`
      );
    }

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

async function runDiscoveredChecks(ctx: ScanContext, options: RunOptions = {}, catalog?: DiscoveredCheck[]): Promise<CheckResult[]> {
  const discovered = catalog ?? await discoverChecks();
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
  maxDepth?: number;
  outputPath?: string;
}

export interface ScanResult {
  absolutePath: string;
  repoType: "software" | "non-software";
  gitInfo: GitInfo;
  /** Numeric compatibility alias: rollupScore ?? localScore ?? 0. */
  overallScore: number;
  localScore: number | null;
  rollupScore: number | null;
  checks: CheckResult[];
  recursiveScans: RecursiveScanEntry[];
}

export interface RecursiveScanEntry {
  kind: "directory" | "submodule" | "workspace";
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
  if (
    typeof options.maxDepth === "number" &&
    (!Number.isInteger(options.maxDepth) || options.maxDepth < 0)
  ) {
    throw new Error("Invalid maxDepth: expected a non-negative integer");
  }
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const tree = await inventoryTree(absolutePath, options.outputPath);
  const catalog = await discoverChecks();
  // Declarations annotate the real tree, including declarations several levels
  // below the declaring target. They never promote descendants to direct children.
  const annotations = new Map<string, RecursiveScanEntry["kind"]>();

  async function assess(node: InventoryNode, depth: number): Promise<ScanResult> {
    if (node.error) throw new Error(node.error);
    const files = node.files;
    const repoType = (depth === 0 ? options.repoType : undefined) ?? detectRepoType(files);
    const gitInfo = await detectGitInfo(node.absolutePath, files);
    for (const declared of gitInfo.workspaces) {
      const absolute = path.resolve(node.absolutePath, declared);
      if (!annotations.has(absolute)) annotations.set(absolute, "workspace");
    }
    for (const declared of gitInfo.submodules) {
      annotations.set(path.resolve(node.absolutePath, declared), "submodule");
    }
    const checks = await runDiscoveredChecks({ rootPath: node.absolutePath, files, repoType, gitInfo }, options, catalog);
    const recursiveScans: RecursiveScanEntry[] = [];
    if (recursive && depth < maxDepth) {
      for (const child of node.children) {
        const entry: RecursiveScanEntry = {
          kind: annotations.get(child.absolutePath) ?? "directory",
          path: path.basename(child.absolutePath),
          absolutePath: child.absolutePath
        };
        try { entry.result = await assess(child, depth + 1); }
        catch (error) { entry.error = error instanceof Error ? error.message : String(error); }
        recursiveScans.push(entry);
      }
    }
    const weightedSum = checks.reduce((sum, check) => sum + tierWeight(check.tier) * check.score, 0);
    const totalWeight = checks.reduce((sum, check) => sum + tierWeight(check.tier), 0);
    const localScore = totalWeight > 0 ? weightedSum / totalWeight : null;
    const rollupScore = calculateRollup(localScore, recursiveScans);
    return { absolutePath: node.absolutePath, repoType, gitInfo, checks, recursiveScans,
      localScore, rollupScore, overallScore: rollupScore ?? localScore ?? 0 };
  }
  return assess(tree, 0);
}

/** Only direct, successful, scored children contribute. Zero is a valid score. */
export function calculateRollup(localScore: number | null, children: RecursiveScanEntry[]): number | null {
  const scores: number[] = localScore === null ? [] : [localScore];
  for (const child of children) {
    if (child.error || !child.result) continue;
    const score = child.result.rollupScore ?? child.result.localScore;
    if (score !== null) scores.push(score);
  }
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}
