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
 * @param {"critical" | "important" | "nice-to-have"} tier
 */
function tierPriority(tier) {
  if (tier === "critical") {
    return 0;
  }
  if (tier === "important") {
    return 1;
  }
  return 2;
}

/**
 * @param {Array<{name: string, tier: "critical" | "important" | "nice-to-have", score: number, recommendations: string[]}>} checks
 */
function topRecommendations(checks) {
  const ranked = checks
    .filter((check) => Array.isArray(check.recommendations) && check.recommendations.length > 0)
    .map((check) => ({
      recommendation: check.recommendations[0],
      tier: check.tier,
      score: check.score,
      name: check.name
    }))
    .sort((a, b) => {
      const tierDelta = tierPriority(a.tier) - tierPriority(b.tier);
      if (tierDelta !== 0) {
        return tierDelta;
      }

      const scoreDelta = a.score - b.score;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return a.name.localeCompare(b.name);
    });

  return ranked.slice(0, 3);
}

/**
 * @param {string} targetPath
 * @param {Array<{name: string, tier: "critical" | "important" | "nice-to-have", score: number, status: "pass" | "partial" | "fail", summary: string, recommendations: string[]}>} checks
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

  const recommendations = topRecommendations(checks);
  if (recommendations.length > 0) {
    console.log("");
    console.log("Top recommendations:");
    recommendations.forEach((item, index) => {
      console.log(`${index + 1}. ${item.recommendation}`);
    });
  }
}
