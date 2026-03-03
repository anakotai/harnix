import path from "node:path";
import { listFiles } from "./scanner.js";
import { runChecks } from "./checks.js";

/**
 * @param {string} targetPath
 * @param {{skipIds?: string[], onlyIds?: string[]}} [options]
 */
export async function scanRepository(targetPath, options = {}) {
  const absolutePath = path.resolve(targetPath);
  const files = await listFiles(absolutePath);
  const checks = await runChecks(absolutePath, files, {
    skipIds: options.skipIds,
    onlyIds: options.onlyIds
  });

  const total = checks.reduce((sum, check) => sum + check.score, 0);
  const overallScore = checks.length > 0 ? total / checks.length : 0;

  return {
    absolutePath,
    overallScore,
    checks
  };
}
