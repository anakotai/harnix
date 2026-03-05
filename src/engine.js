import path from "node:path";
import { promises as fs } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseDocument } from "yaml";
import { detectGitInfo, detectRepoType, listFiles } from "./scanner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNIX_ROOT = path.resolve(__dirname, "..");
const CHECKS_DIR = path.join(HARNIX_ROOT, "checks");
const DIST_CHECKS_DIR = path.join(HARNIX_ROOT, "dist", "checks");

/**
 * Discovers all available checks by scanning checks/{id}/meta.yaml.
 * No hardcoded check list — adding a new check only requires
 * creating a new directory with meta.yaml + check.ts under checks/.
 */
async function discoverChecks() {
  let entries;
  try {
    entries = await fs.readdir(CHECKS_DIR, { withFileTypes: true });
  } catch {
    throw new Error(`Checks directory not found: ${CHECKS_DIR}`);
  }

  const discovered = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const metaPath = path.join(CHECKS_DIR, entry.name, "meta.yaml");
    let content;
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

    const meta = doc.toJS();
    if (!meta || typeof meta !== "object") continue;
    if (!meta.id || !meta.name || !meta.tier || !meta.applicableTo) {
      console.warn(
        `Warning: checks/${entry.name}/meta.yaml missing required fields (id, name, tier, applicableTo)`
      );
      continue;
    }

    discovered.push({ dirName: entry.name, meta });
  }

  return discovered;
}

/**
 * Loads a check function from the compiled dist/ directory.
 * @param {string} dirName
 */
async function loadCheckFunction(dirName) {
  const checkPath = path.join(DIST_CHECKS_DIR, dirName, "check.js");

  try {
    await fs.access(checkPath);
  } catch {
    throw new Error(
      `Compiled check not found for "${dirName}". Run "npm run build" first.`
    );
  }

  const module = await import(pathToFileURL(checkPath).href);
  if (typeof module.default !== "function") {
    throw new Error(
      `checks/${dirName}/check.ts does not export a default function`
    );
  }

  return module.default;
}

/**
 * Runs dynamically discovered checks against a ScanContext.
 *
 * @param {{rootPath: string, files: string[], repoType: "software" | "non-software", gitInfo: object}} ctx
 * @param {{skipIds?: string[], onlyIds?: string[]}} [options]
 */
async function runDiscoveredChecks(ctx, options = {}) {
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

  const checkPromises = applicable.map(async ({ dirName, meta }) => {
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
        tier: meta.tier,
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

/**
 * @param {string} targetPath
 * @param {{
 *   skipIds?: string[],
 *   onlyIds?: string[],
 *   repoType?: "software" | "non-software",
 *   recursive?: boolean,
 *   _visitedPaths?: Set<string>
 * }} [options]
 */
export async function scanRepository(targetPath, options = {}) {
  const absolutePath = path.resolve(targetPath);
  const recursive = options.recursive !== false;
  const visitedPaths = options._visitedPaths ?? new Set();
  visitedPaths.add(absolutePath);

  const files = await listFiles(absolutePath);
  const repoType = options.repoType ?? detectRepoType(files);
  const gitInfo = await detectGitInfo(absolutePath, files);

  const ctx = { rootPath: absolutePath, files, repoType, gitInfo };
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

  const total = checks.reduce((sum, check) => sum + check.score, 0);
  const overallScore = checks.length > 0 ? total / checks.length : 0;

  return {
    absolutePath,
    repoType,
    gitInfo,
    overallScore,
    checks,
    recursiveScans
  };
}

/**
 * @param {string} rootPath
 * @param {{submodules?: string[], workspaces?: string[]}} gitInfo
 * @param {{
 *   skipIds?: string[],
 *   onlyIds?: string[],
 *   repoType?: "software" | "non-software",
 *   recursive: boolean,
 *   visitedPaths: Set<string>
 * }} options
 */
async function runRecursiveScans(rootPath, gitInfo, options) {
  const submodulePaths = (gitInfo.submodules ?? []).map((entry) => ({
    kind: "submodule",
    relativePath: entry
  }));
  const workspacePaths = (gitInfo.workspaces ?? []).map((entry) => ({
    kind: "workspace",
    relativePath: entry
  }));
  const candidates = [...submodulePaths, ...workspacePaths];
  /** @type {Array<{kind: "submodule" | "workspace", path: string, absolutePath: string, result?: object, error?: string}>} */
  const recursiveScans = [];

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

/**
 * @param {string} value
 */
function normalizeRelativePath(value) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "").trim();
}

/**
 * @param {string} absolutePath
 */
async function safeStatDirectory(absolutePath) {
  try {
    const stats = await fs.stat(absolutePath);
    return stats.isDirectory() ? stats : null;
  } catch {
    return null;
  }
}
