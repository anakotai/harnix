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
function escapeMarkdownCell(value) {
  return value.replaceAll("|", "\\|");
}

/**
 * @param {string} category
 */
function formatCategoryLabel(category) {
  return category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
 * @param {Array<{category: string, score: number, status: "pass" | "partial" | "fail"}>} checks
 */
function categoryBreakdown(checks) {
  /** @type {Map<string, {category: string, totalScore: number, count: number, pass: number, partial: number, fail: number}>} */
  const categories = new Map();

  for (const check of checks) {
    const existing = categories.get(check.category) ?? {
      category: check.category,
      totalScore: 0,
      count: 0,
      pass: 0,
      partial: 0,
      fail: 0
    };

    existing.totalScore += check.score;
    existing.count += 1;
    existing[check.status] += 1;
    categories.set(check.category, existing);
  }

  return Array.from(categories.values())
    .map((entry) => ({
      category: entry.category,
      count: entry.count,
      averageScore: entry.count > 0 ? entry.totalScore / entry.count : 0,
      pass: entry.pass,
      partial: entry.partial,
      fail: entry.fail
    }))
    .sort((a, b) => {
      const scoreDelta = a.averageScore - b.averageScore;
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return a.category.localeCompare(b.category);
    });
}

/**
 * @param {Array<{status: "pass" | "partial" | "fail"}>} checks
 */
function statusCounts(checks) {
  return checks.reduce(
    (accumulator, check) => {
      accumulator[check.status] += 1;
      return accumulator;
    },
    { pass: 0, partial: 0, fail: 0 }
  );
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
 * @param {Array<{id: string, name: string, tier: "critical" | "important" | "nice-to-have", score: number, recommendations: string[]}>} checks
 */
function topRecommendations(checks) {
  const ranked = checks
    .filter((check) => Array.isArray(check.recommendations) && check.recommendations.length > 0)
    .map((check) => ({
      id: check.id,
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
 * @param {Array<{id: string, name: string, category: string, tier: "critical" | "important" | "nice-to-have", score: number, status: "pass" | "partial" | "fail", summary: string, details: string, recommendations: string[], references: string[]}>} checks
 * @param {number} overallScore
 * @param {string} timestamp
 */
export function buildMarkdownReport(scannedPath, checks, overallScore, timestamp) {
  const overallPercent = Math.round(overallScore * 100);
  const band = overallBand(overallPercent);
  const categoryScores = categoryBreakdown(checks);
  const counts = statusCounts(checks);
  const recommendations = topRecommendations(checks);

  const lines = [
    "# Harnix Harness Readiness Report",
    "",
    "## Executive Summary",
    "",
    `- Overall score: **${overallPercent}%**`,
    `- Qualitative band: **${band}**`,
    `- Generated: ${timestamp}`,
    `- Scanned path: \`${scannedPath}\``,
    `- Checks evaluated: ${checks.length} (${counts.pass} pass, ${counts.partial} partial, ${counts.fail} fail)`,
    "",
    "## Category Breakdown",
    "",
    "| Category | Checks | Average score | Pass | Partial | Fail |",
    "|---|---:|---:|---:|---:|---:|"
  ];

  for (const category of categoryScores) {
    lines.push(
      `| ${escapeMarkdownCell(formatCategoryLabel(category.category))} | ${category.count} | ${formatPercent(category.averageScore)} | ${category.pass} | ${category.partial} | ${category.fail} |`
    );
  }

  lines.push("", "## Detailed Findings", "");
  for (const check of checks) {
    lines.push(`### ${check.name} (\`${check.id}\`)`);
    lines.push(`- Category: ${formatCategoryLabel(check.category)}`);
    lines.push(`- Tier: ${check.tier}`);
    lines.push(`- Score: ${formatPercent(check.score)} (${check.status})`);
    lines.push(`- Summary: ${check.summary}`);
    lines.push("");
    lines.push(check.details);
    lines.push("");

    if (check.references.length > 0) {
      lines.push("References:");
      for (const reference of check.references) {
        lines.push(`- \`${reference}\``);
      }
      lines.push("");
    }

    if (check.recommendations.length > 0) {
      lines.push("Recommendations:");
      check.recommendations.forEach((recommendation, index) => {
        lines.push(`${index + 1}. ${recommendation}`);
      });
      lines.push("");
    }
  }

  lines.push("## Prioritized Recommendations", "");
  if (recommendations.length > 0) {
    recommendations.forEach((item, index) => {
      lines.push(`${index + 1}. ${item.recommendation} (${item.name}, ${item.tier})`);
    });
  } else {
    lines.push("No prioritized recommendations generated.");
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * @param {string} scannedPath
 * @param {Array<{id: string, name: string, category: string, tier: "critical" | "important" | "nice-to-have", score: number, status: "pass" | "partial" | "fail", summary: string, details: string, recommendations: string[], references: string[]}>} checks
 * @param {number} overallScore
 * @param {string} timestamp
 */
export function buildHtmlReport(scannedPath, checks, overallScore, timestamp) {
  const overallPercent = Math.round(overallScore * 100);
  const band = overallBand(overallPercent);
  const categoryScores = categoryBreakdown(checks);
  const counts = statusCounts(checks);

  const categoryRows = categoryScores
    .map(
      (category) => `<tr>
  <td>${escapeHtml(formatCategoryLabel(category.category))}</td>
  <td>${category.count}</td>
  <td>${escapeHtml(formatPercent(category.averageScore))}</td>
  <td>${category.pass}</td>
  <td>${category.partial}</td>
  <td>${category.fail}</td>
</tr>`
    )
    .join("\n");

  const resultRows = checks
    .map((check) => {
      const symbol = symbolForStatus(check.status);
      return `<tr>
  <td>${escapeHtml(symbol)}</td>
  <td>${escapeHtml(check.name)}</td>
  <td>${escapeHtml(formatCategoryLabel(check.category))}</td>
  <td>${escapeHtml(check.tier)}</td>
  <td>${escapeHtml(formatPercent(check.score))}</td>
  <td>${escapeHtml(check.summary)}</td>
</tr>`;
    })
    .join("\n");

  const detailsSections = checks
    .map((check) => {
      const recommendationItems = check.recommendations
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("\n");
      const referenceItems = check.references
        .map((item) => `<li><code>${escapeHtml(item)}</code></li>`)
        .join("\n");

      return `<section class="check-detail">
  <h3>${escapeHtml(check.name)} <code>${escapeHtml(check.id)}</code></h3>
  <p><strong>Category:</strong> ${escapeHtml(formatCategoryLabel(check.category))}</p>
  <p><strong>Tier:</strong> ${escapeHtml(check.tier)}</p>
  <p><strong>Score:</strong> ${escapeHtml(formatPercent(check.score))} (${escapeHtml(check.status)})</p>
  <p><strong>Summary:</strong> ${escapeHtml(check.summary)}</p>
  <p>${escapeHtml(check.details).replaceAll("\n", "<br>")}</p>
  ${
    check.references.length > 0
      ? `<p><strong>References</strong></p>
  <ul>
${referenceItems}
  </ul>`
      : ""
  }
  ${
    check.recommendations.length > 0
      ? `<p><strong>Recommendations</strong></p>
  <ol>
${recommendationItems}
  </ol>`
      : ""
  }
</section>`;
    })
    .join("\n");

  const recommendationItems = topRecommendations(checks)
    .map(
      (item) =>
        `<li>${escapeHtml(item.recommendation)} <span class="meta">(${escapeHtml(item.name)}, ${escapeHtml(item.tier)})</span></li>`
    )
    .join("\n");
  const recommendationsList = recommendationItems || "<li>No prioritized recommendations generated.</li>";

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
    section.check-detail {
      border: 1px solid #74796d;
      padding: 1rem;
      margin: 1rem 0;
      border-radius: 0.5rem;
    }
    .meta {
      color: #43483e;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <h1>Harnix Harness Readiness Report</h1>
  <h2>Executive Summary</h2>
  <p><strong>Overall score:</strong> ${escapeHtml(String(overallPercent))}%</p>
  <p><strong>Qualitative band:</strong> ${escapeHtml(band)}</p>
  <p><strong>Generated:</strong> ${escapeHtml(timestamp)}</p>
  <p><strong>Scanned path:</strong> <code>${escapeHtml(scannedPath)}</code></p>
  <p><strong>Checks evaluated:</strong> ${checks.length} (${counts.pass} pass, ${counts.partial} partial, ${counts.fail} fail)</p>

  <h2>Category Breakdown</h2>
  <table>
    <thead>
      <tr>
        <th>Category</th>
        <th>Checks</th>
        <th>Average score</th>
        <th>Pass</th>
        <th>Partial</th>
        <th>Fail</th>
      </tr>
    </thead>
    <tbody>
${categoryRows}
    </tbody>
  </table>

  <h2>Check Results</h2>
  <table>
    <thead>
      <tr>
        <th>Status</th>
        <th>Check</th>
        <th>Category</th>
        <th>Tier</th>
        <th>Score</th>
        <th>Summary</th>
      </tr>
    </thead>
    <tbody>
${resultRows}
    </tbody>
  </table>

  <h2>Detailed Findings</h2>
${detailsSections}

  <h2>Prioritized Recommendations</h2>
  <ol>
${recommendationsList}
  </ol>
</body>
</html>`;
}

/**
 * @param {string} scannedPath
 * @param {Array<{id: string, name: string, category: string, tier: "critical" | "important" | "nice-to-have", score: number, status: "pass" | "partial" | "fail", summary: string, details: string, recommendations: string[], references: string[]}>} checks
 * @param {number} overallScore
 * @param {string} [outputDirectory]
 */
export async function writeReportFiles(scannedPath, checks, overallScore, outputDirectory) {
  const timestamp = reportTimestamp();
  const resolvedOutputDirectory = outputDirectory
    ? path.resolve(outputDirectory)
    : path.join(scannedPath, "harnix");
  const markdownPath = path.join(resolvedOutputDirectory, `report-${timestamp}.md`);
  const htmlPath = path.join(resolvedOutputDirectory, `report-${timestamp}.html`);

  await fs.mkdir(resolvedOutputDirectory, { recursive: true });

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
 * @param {Array<{id: string, name: string, category: string, tier: "critical" | "important" | "nice-to-have", score: number, status: "pass" | "partial" | "fail", summary: string, details: string, recommendations: string[], references: string[]}>} checks
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
