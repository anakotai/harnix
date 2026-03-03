import { promises as fs } from "node:fs";
import path from "node:path";
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
 * @param {string} value
 */
function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * @param {number} value
 */
function padTwo(value) {
  return String(value).padStart(2, "0");
}

/**
 * @param {Date} [now]
 */
export function reportTimestamp(now = new Date()) {
  const year = now.getFullYear();
  const month = padTwo(now.getMonth() + 1);
  const day = padTwo(now.getDate());
  const hours = padTwo(now.getHours());
  const minutes = padTwo(now.getMinutes());
  const seconds = padTwo(now.getSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
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
 * @param {string} scannedPath
 * @param {Array<{name: string, tier: "critical" | "important" | "nice-to-have", score: number, status: "pass" | "partial" | "fail", summary: string, recommendations: string[]}>} checks
 * @param {number} overallScore
 * @param {string} timestamp
 */
export function buildMarkdownReport(scannedPath, checks, overallScore, timestamp) {
  const overallPercent = Math.round(overallScore * 100);
  const band = overallBand(overallPercent);

  const lines = [
    "# Harnix Harness Readiness Report",
    "",
    `- Generated: ${timestamp}`,
    `- Scanned path: \`${scannedPath}\``,
    `- Overall: **${band} (${overallPercent}%)**`,
    "",
    "## Check Results",
    "",
    "| Status | Check | Tier | Score | Summary |",
    "|---|---|---|---:|---|"
  ];

  for (const check of checks) {
    lines.push(
      `| ${symbolForStatus(check.status)} | ${check.name} | ${check.tier} | ${formatPercent(check.score)} | ${check.summary} |`
    );
  }

  const recommendations = topRecommendations(checks);
  if (recommendations.length > 0) {
    lines.push("", "## Top Recommendations", "");
    recommendations.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.recommendation}`);
    });
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * @param {string} scannedPath
 * @param {Array<{name: string, tier: "critical" | "important" | "nice-to-have", score: number, status: "pass" | "partial" | "fail", summary: string, recommendations: string[]}>} checks
 * @param {number} overallScore
 * @param {string} timestamp
 */
export function buildHtmlReport(scannedPath, checks, overallScore, timestamp) {
  const overallPercent = Math.round(overallScore * 100);
  const band = overallBand(overallPercent);

  const rows = checks
    .map((check) => {
      const symbol = symbolForStatus(check.status);
      return `<tr>
  <td>${escapeHtml(symbol)}</td>
  <td>${escapeHtml(check.name)}</td>
  <td>${escapeHtml(check.tier)}</td>
  <td>${escapeHtml(formatPercent(check.score))}</td>
  <td>${escapeHtml(check.summary)}</td>
</tr>`;
    })
    .join("\n");

  const recommendationItems = topRecommendations(checks)
    .map((item) => `<li>${escapeHtml(item.recommendation)}</li>`)
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Harnix Harness Readiness Report</title>
  <style>
    :root {
      color-scheme: light dark;
      font-family: Roboto, Arial, sans-serif;
    }
    body {
      margin: 2rem;
      line-height: 1.5;
    }
    h1, h2 {
      font-family: "Roboto Serif", Georgia, serif;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    th, td {
      border: 1px solid #74796d;
      text-align: left;
      padding: 0.5rem;
      vertical-align: top;
    }
    thead th {
      background: #d9e7cb;
    }
  </style>
</head>
<body>
  <h1>Harnix Harness Readiness Report</h1>
  <p><strong>Generated:</strong> ${escapeHtml(timestamp)}</p>
  <p><strong>Scanned path:</strong> <code>${escapeHtml(scannedPath)}</code></p>
  <p><strong>Overall:</strong> ${escapeHtml(band)} (${escapeHtml(String(overallPercent))}%)</p>

  <h2>Check Results</h2>
  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Check</th>
        <th>Tier</th>
        <th>Score</th>
        <th>Summary</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>

  <h2>Top Recommendations</h2>
  <ol>
${recommendationItems}
  </ol>
</body>
</html>`;
}

/**
 * @param {string} scannedPath
 * @param {Array<{name: string, tier: "critical" | "important" | "nice-to-have", score: number, status: "pass" | "partial" | "fail", summary: string, recommendations: string[]}>} checks
 * @param {number} overallScore
 */
export async function writeReportFiles(scannedPath, checks, overallScore) {
  const timestamp = reportTimestamp();
  const outputDirectory = path.join(scannedPath, "harnix");
  const markdownPath = path.join(outputDirectory, `report-${timestamp}.md`);
  const htmlPath = path.join(outputDirectory, `report-${timestamp}.html`);

  await fs.mkdir(outputDirectory, { recursive: true });

  const markdownContent = buildMarkdownReport(scannedPath, checks, overallScore, timestamp);
  const htmlContent = buildHtmlReport(scannedPath, checks, overallScore, timestamp);

  await Promise.all([
    fs.writeFile(markdownPath, markdownContent, "utf8"),
    fs.writeFile(htmlPath, htmlContent, "utf8")
  ]);

  return { markdownPath, htmlPath, timestamp };
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
