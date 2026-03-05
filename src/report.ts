import { promises as fs } from "node:fs";
import path from "node:path";
import type { CheckResult } from "./types.js";
import { SCORE_BANDS } from "./types.js";
import { tierWeight } from "./engine.js";

export function overallBand(scorePercent: number): string {
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

function symbolForStatus(status: "pass" | "partial" | "fail"): string {
  if (status === "pass") {
    return "✓";
  }
  if (status === "partial") {
    return "△";
  }
  return "✗";
}

function formatPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function formatRecursiveKind(kind: "submodule" | "workspace"): string {
  return kind === "submodule" ? "Submodule" : "Workspace";
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll("|", "\\|");
}

function formatCategoryLabel(category: string): string {
  return category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function padTwo(value: number): string {
  return String(value).padStart(2, "0");
}

export function reportTimestamp(now = new Date()): string {
  const year = now.getFullYear();
  const month = padTwo(now.getMonth() + 1);
  const day = padTwo(now.getDate());
  const hours = padTwo(now.getHours());
  const minutes = padTwo(now.getMinutes());
  const seconds = padTwo(now.getSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

interface CategoryEntry {
  category: string;
  count: number;
  averageScore: number;
  pass: number;
  partial: number;
  fail: number;
}

function categoryBreakdown(checks: CheckResult[]): CategoryEntry[] {
  const categories = new Map<string, { category: string; weightedSum: number; totalWeight: number; count: number; pass: number; partial: number; fail: number }>();

  for (const check of checks) {
    const existing = categories.get(check.category) ?? {
      category: check.category,
      weightedSum: 0,
      totalWeight: 0,
      count: 0,
      pass: 0,
      partial: 0,
      fail: 0
    };

    const w = tierWeight(check.tier);
    existing.weightedSum += w * check.score;
    existing.totalWeight += w;
    existing.count += 1;
    existing[check.status] += 1;
    categories.set(check.category, existing);
  }

  return Array.from(categories.values())
    .map((entry) => ({
      category: entry.category,
      count: entry.count,
      averageScore: entry.totalWeight > 0 ? entry.weightedSum / entry.totalWeight : 0,
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

function statusCounts(checks: CheckResult[]): { pass: number; partial: number; fail: number } {
  return checks.reduce(
    (accumulator, check) => {
      accumulator[check.status] += 1;
      return accumulator;
    },
    { pass: 0, partial: 0, fail: 0 }
  );
}

function tierPriority(tier: "critical" | "important" | "nice-to-have"): number {
  if (tier === "critical") {
    return 0;
  }
  if (tier === "important") {
    return 1;
  }
  return 2;
}

interface RankedRecommendation {
  id: string;
  recommendation: string;
  tier: "critical" | "important" | "nice-to-have";
  score: number;
  name: string;
}

function topRecommendations(checks: CheckResult[]): RankedRecommendation[] {
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

interface RecursiveScanInput {
  kind: "submodule" | "workspace";
  path: string;
  result?: { overallScore?: number; checks?: unknown[] };
  error?: string;
}

type RecursiveEntry =
  | { kind: "submodule" | "workspace"; path: string; error: string }
  | { kind: "submodule" | "workspace"; path: string; overallScore: number; overallPercent: number; band: string; checks: number };

function recursiveBreakdown(recursiveScans: RecursiveScanInput[]): RecursiveEntry[] {
  return recursiveScans
    .map((scan): RecursiveEntry => {
      if (scan.error || !scan.result || typeof scan.result.overallScore !== "number") {
        return {
          kind: scan.kind,
          path: scan.path,
          error: scan.error ?? "Scan failed"
        };
      }

      const overallPercent = Math.round(scan.result.overallScore * 100);
      const checkCount = Array.isArray(scan.result.checks) ? scan.result.checks.length : 0;
      return {
        kind: scan.kind,
        path: scan.path,
        overallScore: scan.result.overallScore,
        overallPercent,
        band: overallBand(overallPercent),
        checks: checkCount
      };
    })
    .sort((a, b) => {
      const pathDelta = a.path.localeCompare(b.path);
      if (pathDelta !== 0) {
        return pathDelta;
      }
      return formatRecursiveKind(a.kind).localeCompare(formatRecursiveKind(b.kind));
    });
}

export interface ReportOptions {
  recursiveScans?: RecursiveScanInput[];
}

export function buildMarkdownReport(
  scannedPath: string,
  checks: CheckResult[],
  overallScore: number,
  timestamp: string,
  options: ReportOptions = {}
): string {
  const overallPercent = Math.round(overallScore * 100);
  const band = overallBand(overallPercent);
  const categoryScores = categoryBreakdown(checks);
  const counts = statusCounts(checks);
  const recommendations = topRecommendations(checks);
  const recursiveScans = recursiveBreakdown(options.recursiveScans ?? []);

  const lines: string[] = [
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

  if (recursiveScans.length > 0) {
    lines.push("", "## Workspace and Submodule Breakdown", "");
    lines.push("| Type | Path | Overall | Band | Checks |");
    lines.push("|---|---|---:|---|---:|");
    for (const entry of recursiveScans) {
      if ("error" in entry) {
        lines.push(
          `| ${formatRecursiveKind(entry.kind)} | \`${escapeMarkdownCell(entry.path)}\` | N/A | Scan failed | 0 |`
        );
        continue;
      }

      lines.push(
        `| ${formatRecursiveKind(entry.kind)} | \`${escapeMarkdownCell(entry.path)}\` | ${entry.overallPercent}% | ${escapeMarkdownCell(entry.band)} | ${entry.checks} |`
      );
    }
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

export function buildHtmlReport(
  scannedPath: string,
  checks: CheckResult[],
  overallScore: number,
  timestamp: string,
  options: ReportOptions = {}
): string {
  const overallPercent = Math.round(overallScore * 100);
  const band = overallBand(overallPercent);
  const categoryScores = categoryBreakdown(checks);
  const counts = statusCounts(checks);
  const recursiveScans = recursiveBreakdown(options.recursiveScans ?? []);

  const categoryRows = categoryScores
    .map((category) => {
      const categoryPercent = Math.round(category.averageScore * 100);
      return `<tr>
  <td>${escapeHtml(formatCategoryLabel(category.category))}</td>
  <td>${category.count}</td>
  <td>${escapeHtml(formatPercent(category.averageScore))}</td>
  <td>
    <div class="score-track" aria-hidden="true">
      <div class="score-fill" style="width: ${categoryPercent}%"></div>
    </div>
    <span class="metric-label">${categoryPercent}%</span>
  </td>
  <td>${category.pass}</td>
  <td>${category.partial}</td>
  <td>${category.fail}</td>
</tr>`
    })
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

  const recursiveRows = recursiveScans
    .map((entry) => {
      if ("error" in entry) {
        return `<tr>
  <td>${escapeHtml(formatRecursiveKind(entry.kind))}</td>
  <td><code>${escapeHtml(entry.path)}</code></td>
  <td colspan="4">Scan failed</td>
</tr>`;
      }

      return `<tr>
  <td>${escapeHtml(formatRecursiveKind(entry.kind))}</td>
  <td><code>${escapeHtml(entry.path)}</code></td>
  <td>${escapeHtml(String(entry.overallPercent))}%</td>
  <td>${escapeHtml(entry.band)}</td>
  <td>${entry.checks}</td>
  <td>
    <div class="score-track" aria-hidden="true">
      <div class="score-fill" style="width: ${entry.overallPercent}%"></div>
    </div>
    <span class="metric-label">${entry.overallPercent}%</span>
  </td>
</tr>`;
    })
    .join("\n");

  const detailsSections = checks
    .map((check, index) => {
      const recommendationItems = check.recommendations
        .map((item) => `<li>${escapeHtml(item)}</li>`)
        .join("\n");
      const referenceItems = check.references
        .map((item) => `<li><code>${escapeHtml(item)}</code></li>`)
        .join("\n");
      const openByDefault = check.status !== "pass" && index === 0;
      const checkPercent = Math.round(check.score * 100);

      return `<details class="check-detail" data-status="${escapeHtml(check.status)}"${openByDefault ? " open" : ""}>
  <summary>
    <span class="check-status">${escapeHtml(symbolForStatus(check.status))}</span>
    <span class="check-name">${escapeHtml(check.name)}</span>
    <span class="check-summary">${escapeHtml(formatPercent(check.score))} • ${escapeHtml(check.status)}</span>
  </summary>
  <div class="check-body">
    <p><strong>ID:</strong> <code>${escapeHtml(check.id)}</code></p>
    <p><strong>Category:</strong> ${escapeHtml(formatCategoryLabel(check.category))}</p>
    <p><strong>Tier:</strong> ${escapeHtml(check.tier)}</p>
    <p><strong>Score:</strong> ${escapeHtml(formatPercent(check.score))} (${escapeHtml(check.status)})</p>
    <div class="score-track" aria-hidden="true">
      <div class="score-fill" style="width: ${checkPercent}%"></div>
    </div>
    <span class="metric-label">${checkPercent}%</span>
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
  </div>
</details>`;
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
      font-family: Roboto, Arial, sans-serif;
      --bg: #f8faf0;
      --surface: #ffffff;
      --text: #1a1c18;
      --muted: #43483e;
      --border: #c3c8bb;
      --header-bg: #d9e7cb;
      --summary-bg: #eff5e7;
      --track: #d9dbd1;
      --fill: #386a1f;
      --accent: #1556ac;
      --status-pass: #386a1f;
      --status-partial: #e38a20;
      --status-fail: #ba1a1a;
      color-scheme: light;
    }
    :root[data-theme="dark"] {
      --bg: #11140e;
      --surface: #1b1f18;
      --text: #e3e3dc;
      --muted: #c3c8bb;
      --border: #4a5144;
      --header-bg: #283420;
      --summary-bg: #253121;
      --track: #373a33;
      --fill: #9dd67d;
      --accent: #8ab4ff;
      --status-pass: #9dd67d;
      --status-partial: #ffc166;
      --status-fail: #ffb4ab;
      color-scheme: dark;
    }
    body {
      margin: 0;
      line-height: 1.5;
      background: var(--bg);
      color: var(--text);
    }
    .container {
      max-width: 1040px;
      margin: 0 auto;
      padding: 2rem;
    }
    h1, h2, h3 {
      font-family: "Roboto Serif", Georgia, serif;
    }
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .controls {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    button {
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      border-radius: 0.5rem;
      padding: 0.45rem 0.7rem;
      font: inherit;
      cursor: pointer;
    }
    button:hover {
      border-color: var(--accent);
    }
    .summary-card {
      border: 1px solid var(--border);
      background: var(--summary-bg);
      border-radius: 0.75rem;
      padding: 1rem 1rem 0.75rem;
      margin-bottom: 1.25rem;
    }
    .score-track {
      width: 100%;
      max-width: 320px;
      height: 0.65rem;
      background: var(--track);
      border-radius: 999px;
      overflow: hidden;
      margin: 0.35rem 0 0.2rem;
    }
    .score-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--fill), var(--accent));
    }
    .metric-label {
      color: var(--muted);
      font-size: 0.85rem;
      white-space: nowrap;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
      background: var(--surface);
    }
    th, td {
      border: 1px solid var(--border);
      text-align: left;
      padding: 0.5rem;
      vertical-align: top;
    }
    thead th {
      background: var(--header-bg);
    }
    details.check-detail {
      border: 1px solid var(--border);
      background: var(--surface);
      margin: 0.75rem 0;
      border-radius: 0.5rem;
    }
    details.check-detail summary {
      list-style: none;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 0.65rem;
      align-items: center;
      padding: 0.8rem 1rem;
      cursor: pointer;
      user-select: none;
      font-weight: 600;
    }
    details.check-detail summary::-webkit-details-marker {
      display: none;
    }
    details.check-detail summary::after {
      content: "Show";
      font-size: 0.8rem;
      color: var(--muted);
      justify-self: end;
    }
    details.check-detail[open] summary::after {
      content: "Hide";
    }
    .check-status {
      font-size: 1rem;
      width: 1.25rem;
      text-align: center;
      color: var(--status-partial);
    }
    details.check-detail[data-status="pass"] .check-status {
      color: var(--status-pass);
    }
    details.check-detail[data-status="fail"] .check-status {
      color: var(--status-fail);
    }
    .check-summary {
      color: var(--muted);
      font-size: 0.85rem;
      justify-self: end;
      text-transform: capitalize;
    }
    .check-body {
      padding: 0 1rem 1rem;
      border-top: 1px solid var(--border);
    }
    .meta {
      color: var(--muted);
      font-size: 0.9rem;
    }
    @media (max-width: 720px) {
      .container {
        padding: 1rem;
      }
      details.check-detail summary {
        grid-template-columns: auto 1fr;
      }
      .check-summary {
        grid-column: 1 / -1;
        justify-self: start;
      }
    }
    @media print {
      button {
        display: none;
      }
      details.check-detail {
        break-inside: avoid;
      }
      details.check-detail summary::after {
        content: "";
      }
      .container {
        max-width: none;
        padding: 0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <header class="page-header">
      <div>
        <h1>Harnix Harness Readiness Report</h1>
        <p class="meta">Generated ${escapeHtml(timestamp)} • Scanned <code>${escapeHtml(scannedPath)}</code></p>
      </div>
      <div class="controls" role="group" aria-label="Report controls">
        <button id="theme-toggle" type="button">Toggle theme</button>
        <button id="expand-all" type="button">Expand all</button>
        <button id="collapse-all" type="button">Collapse all</button>
      </div>
    </header>

    <h2>Executive Summary</h2>
    <div class="summary-card">
      <p><strong>Overall score:</strong> ${escapeHtml(String(overallPercent))}%</p>
      <div class="score-track" aria-hidden="true">
        <div class="score-fill" style="width: ${overallPercent}%"></div>
      </div>
      <span class="metric-label">${overallPercent}% readiness</span>
      <p><strong>Qualitative band:</strong> ${escapeHtml(band)}</p>
      <p><strong>Checks evaluated:</strong> ${checks.length} (${counts.pass} pass, ${counts.partial} partial, ${counts.fail} fail)</p>
    </div>

    <h2>Category Breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>Category</th>
          <th>Checks</th>
          <th>Average score</th>
          <th>Visualization</th>
          <th>Pass</th>
          <th>Partial</th>
          <th>Fail</th>
        </tr>
      </thead>
      <tbody>
${categoryRows}
      </tbody>
    </table>

    ${
      recursiveRows
        ? `<h2>Workspace and Submodule Breakdown</h2>
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Path</th>
          <th>Overall</th>
          <th>Band</th>
          <th>Checks</th>
          <th>Visualization</th>
        </tr>
      </thead>
      <tbody>
${recursiveRows}
      </tbody>
    </table>`
        : ""
    }

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
  </div>
  <script>
    (() => {
      const root = document.documentElement;
      const themeToggle = document.getElementById("theme-toggle");
      const expandAll = document.getElementById("expand-all");
      const collapseAll = document.getElementById("collapse-all");
      const details = Array.from(document.querySelectorAll("details.check-detail"));
      const storageKey = "harnix-report-theme";
      const media = window.matchMedia("(prefers-color-scheme: dark)");

      const getSystemTheme = () => (media.matches ? "dark" : "light");
      const getStoredTheme = () => {
        try {
          const value = window.localStorage.getItem(storageKey);
          return value === "dark" || value === "light" ? value : null;
        } catch {
          return null;
        }
      };
      const setStoredTheme = (value) => {
        try {
          window.localStorage.setItem(storageKey, value);
        } catch {
          // Ignore environments without localStorage.
        }
      };
      const applyTheme = (theme) => {
        root.dataset.theme = theme;
        themeToggle.textContent = theme === "dark" ? "Light mode" : "Dark mode";
      };

      applyTheme(getStoredTheme() || getSystemTheme());

      themeToggle.addEventListener("click", () => {
        const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
        setStoredTheme(nextTheme);
        applyTheme(nextTheme);
      });

      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", () => {
          if (!getStoredTheme()) {
            applyTheme(getSystemTheme());
          }
        });
      }

      expandAll.addEventListener("click", () => {
        details.forEach((element) => {
          element.open = true;
        });
      });
      collapseAll.addEventListener("click", () => {
        details.forEach((element) => {
          element.open = false;
        });
      });
    })();
  </script>
</body>
</html>`;
}

export async function writeReportFiles(
  scannedPath: string,
  checks: CheckResult[],
  overallScore: number,
  outputDirectory?: string,
  options: ReportOptions = {}
): Promise<{ markdownPath: string; htmlPath: string; timestamp: string }> {
  const timestamp = reportTimestamp();
  const resolvedOutputDirectory = outputDirectory
    ? path.resolve(outputDirectory)
    : path.join(scannedPath, "harnix");
  const markdownPath = path.join(resolvedOutputDirectory, `report-${timestamp}.md`);
  const htmlPath = path.join(resolvedOutputDirectory, `report-${timestamp}.html`);

  await fs.mkdir(resolvedOutputDirectory, { recursive: true });

  const markdownContent = buildMarkdownReport(scannedPath, checks, overallScore, timestamp, options);
  const htmlContent = buildHtmlReport(scannedPath, checks, overallScore, timestamp, options);

  await Promise.all([
    fs.writeFile(markdownPath, markdownContent, "utf8"),
    fs.writeFile(htmlPath, htmlContent, "utf8")
  ]);

  return { markdownPath, htmlPath, timestamp };
}

export function printConsoleReport(
  targetPath: string,
  checks: CheckResult[],
  overallScore: number,
  options: { verbose?: boolean; recursiveScans?: RecursiveScanInput[] } = {}
): void {
  const verbose = options.verbose === true;
  const overallPercent = Math.round(overallScore * 100);
  const band = overallBand(overallPercent);
  const recursiveScans = recursiveBreakdown(options.recursiveScans ?? []);

  console.log(`Harness Readiness Report: ${targetPath}`);
  console.log("───────────────────────────────────────");
  console.log(`Overall: ${band} (${overallPercent}%)`);
  if (recursiveScans.length > 0) {
    console.log("Monorepo breakdown:");
    for (const entry of recursiveScans) {
      if ("error" in entry) {
        console.log(`- ${formatRecursiveKind(entry.kind)} ${entry.path}: scan failed`);
      } else {
        console.log(
          `- ${formatRecursiveKind(entry.kind)} ${entry.path}: ${entry.band} (${entry.overallPercent}%)`
        );
      }
    }
  }
  console.log("");

  for (const check of checks) {
    const symbol = symbolForStatus(check.status);
    const name = check.name.padEnd(18, " ");
    const percent = formatPercent(check.score).padStart(4, " ");
    console.log(`${symbol} ${name} ${percent}  ${check.summary}`);

    if (verbose) {
      const why =
        typeof check.whyThisMatters === "string" && check.whyThisMatters.trim().length > 0
          ? check.whyThisMatters.trim()
          : "This check affects how reliably humans and agents can operate in the repository.";
      console.log(`    Why this matters: ${why}`);
    }
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
