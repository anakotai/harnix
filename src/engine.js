import path from "node:path";
import { promises as fs } from "node:fs";
import { detectGitInfo, detectRepoType, listFiles } from "./scanner.js";
import { runChecks } from "./checks.js";

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
  const checks = await runChecks(absolutePath, files, {
    skipIds: options.skipIds,
    onlyIds: options.onlyIds,
    repoType
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
