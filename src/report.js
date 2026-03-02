import { SCORE_BANDS } from "./types.js";

/**
 * @param {number} scorePercent
 */
export function overallBand(scorePercent) {
  if (scorePercent >= SCORE_BANDS.excellent.min) {
    return SCORE_BANDS.excellent.label;
  }
  if (scorePercent >= SCORE_BANDS.good.min) {
    return SCORE_BANDS.good.label;
  }
  if (scorePercent >= SCORE_BANDS.needsImprovement.min) {
    return SCORE_BANDS.needsImprovement.label;
  }
  return SCORE_BANDS.poor.label;
}

/**
 * @param {"pass" | "partial" | "fail"} status
 */
function symbolForStatus(status) {
  if (status === "pass") {
    return "✓";
  }
  if (status === "partial") {
    return "△";
  }
  return "✗";
}

/**
 * @param {number} score
 */
function formatPercent(score) {
  return `${Math.round(score * 100)}%`;
}

/**
 * @param {string} targetPath
 * @param {Array<{name: string, score: number, status: "pass" | "partial" | "fail", summary: string}>} checks
 * @param {number} overallScore
 */
export function printConsoleReport(targetPath, checks, overallScore) {
  const overallPercent = Math.round(overallScore * 100);
  const band = overallBand(overallPercent);

  console.log(`Harness Readiness Report: ${targetPath}`);
  console.log("───────────────────────────────────────");
  console.log(`Overall: ${band} (${overallPercent}%)`);
  console.log("");

  for (const check of checks) {
    const symbol = symbolForStatus(check.status);
    const name = check.name.padEnd(18, " ");
    const percent = formatPercent(check.score).padStart(4, " ");
    console.log(`${symbol} ${name} ${percent}  ${check.summary}`);
  }
}
