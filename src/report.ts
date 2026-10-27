import { promises as fs } from "node:fs";
import path from "node:path";
import type { CheckResult, RepoType } from "./types.js";
import { SCORE_BANDS } from "./types.js";
import { tierWeight } from "./engine.js";
import type { ScanResult } from "./engine.js";
import { JSON_REPORT_SCHEMA_VERSION, jsonReportSchema } from "./schemas/report.js";
import type { JsonReport } from "./schemas/report.js";

const ANSI_RESET = "\u001b[0m";
const ANSI_BOLD = "\u001b[1m";
const ANSI_RED = "\u001b[31m";
const ANSI_GREEN = "\u001b[32m";
const ANSI_ORANGE = "\u001b[38;5;208m";

function supportsAnsiStyling(): boolean {
  if (process.env.NO_COLOR !== undefined || process.env.FORCE_COLOR === "0") {
    return false;
  }
  return process.stdout.isTTY === true;
}

function styleAnsi(text: string, ...codes: string[]): string {
  if (!supportsAnsiStyling() || codes.length === 0) {
    return text;
  }
  return `${codes.join("")}${text}${ANSI_RESET}`;
}

function bold(text: string): string {
  return styleAnsi(text, ANSI_BOLD);
}

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

function symbolForStatus(status: CheckResult["status"]): string {
  if (status === "not-assessed") return "–";
  if (status === "pass") {
    return "✓";
  }
  if (status === "partial") {
    return "△";
  }
  return "✗";
}

function colorSymbolForStatus(status: CheckResult["status"]): string {
  if (status === "not-assessed") return symbolForStatus(status);
  if (status === "pass") {
    return styleAnsi(symbolForStatus(status), ANSI_GREEN);
  }
  if (status === "partial") {
    return styleAnsi(symbolForStatus(status), ANSI_ORANGE);
  }
  return styleAnsi(symbolForStatus(status), ANSI_RED);
}

function formatPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function checkScore(check: CheckResult): string {
  return check.status === "not-assessed" ? "N/A" : formatPercent(check.score);
}

function evaluatedCount(checks: CheckResult[]): number {
  return checks.filter((check) => check.status !== "not-assessed").length;
}

function formatRecursiveKind(kind: "directory" | "submodule" | "workspace"): string {
  return kind === "submodule" ? "Submodule" : kind === "workspace" ? "Workspace" : "Directory";
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

function compareText(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
}

export function reportTimestamp(now = new Date()): string {
  const year = now.getUTCFullYear();
  const month = padTwo(now.getUTCMonth() + 1);
  const day = padTwo(now.getUTCDate());
  const hours = padTwo(now.getUTCHours());
  const minutes = padTwo(now.getUTCMinutes());
  const seconds = padTwo(now.getUTCSeconds());
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
    if (check.status === "not-assessed") continue;
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
      return compareText(a.category, b.category);
    });
}

function statusCounts(checks: CheckResult[]): { pass: number; partial: number; fail: number } {
  return checks.reduce(
    (accumulator, check) => {
      if (check.status === "not-assessed") return accumulator;
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
  /** Empty string = root scan target; otherwise path attributed to a child. */
  scanTargetPath: string;
}

function recommendationsFromChecks(
  checks: CheckResult[],
  scanTargetPath: string
): RankedRecommendation[] {
  return checks
    .filter((check) => check.status !== "not-assessed" && Array.isArray(check.recommendations) && check.recommendations.length > 0)
    .map((check) => ({
      id: check.id,
      recommendation: check.recommendations[0],
      tier: check.tier,
      score: check.score,
      name: check.name,
      scanTargetPath
    }));
}

function collectRecommendationsFromTree(
  recursiveScans: RecursiveScanInput[],
  parentPath = ""
): RankedRecommendation[] {
  const collected: RankedRecommendation[] = [];

  for (const scan of recursiveScans) {
    const fullPath = parentPath ? `${parentPath}/${scan.path}` : scan.path;
    if (scan.error || !scan.result) {
      continue;
    }

    const childChecks = Array.isArray(scan.result.checks)
      ? (scan.result.checks as CheckResult[])
      : [];
    collected.push(...recommendationsFromChecks(childChecks, fullPath));

    const nested = Array.isArray(scan.result.recursiveScans) ? scan.result.recursiveScans : [];
    if (nested.length > 0) {
      collected.push(...collectRecommendationsFromTree(nested, fullPath));
    }
  }

  return collected;
}

function topRecommendations(
  checks: CheckResult[],
  recursiveScans: RecursiveScanInput[] = []
): RankedRecommendation[] {
  const ranked = [
    ...recommendationsFromChecks(checks, ""),
    ...collectRecommendationsFromTree(recursiveScans)
  ].sort((a, b) => {
    const tierDelta = tierPriority(a.tier) - tierPriority(b.tier);
    if (tierDelta !== 0) {
      return tierDelta;
    }

    const scoreDelta = a.score - b.score;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }

    const pathDelta = compareText(a.scanTargetPath, b.scanTargetPath);
    if (pathDelta !== 0) {
      return pathDelta;
    }

    return compareText(a.name, b.name);
  });

  return ranked.slice(0, 5);
}

function formatRecommendationLine(item: RankedRecommendation): string {
  if (item.scanTargetPath.length > 0) {
    return `[${item.scanTargetPath}] ${item.recommendation}`;
  }
  return item.recommendation;
}

interface RecursiveScanInput {
  kind: "directory" | "submodule" | "workspace";
  path: string;
  result?: { overallScore?: number; localScore?: number | null; rollupScore?: number | null; checks?: unknown[]; recursiveScans?: RecursiveScanInput[] };
  error?: string;
}

type RecursiveEntry =
  | { kind: RecursiveScanInput["kind"]; path: string; error: string }
  | { kind: RecursiveScanInput["kind"]; path: string; local: string; rollup: string; checks: number; findings: CheckResult[] };

function displayScore(score: number | null | undefined): string {
  if (score == null) return "Unavailable";
  const percent = Math.round(score * 100);
  return `${percent}% (${overallBand(percent)})`;
}

function scorePair(checks: CheckResult[], overallScore: number, options: ReportOptions): { local: string; rollup: string } {
  const local = options.localScore !== undefined ? options.localScore : evaluatedCount(checks) ? overallScore : null;
  const rollup = options.rollupScore !== undefined ? options.rollupScore : local;
  return { local: displayScore(local), rollup: displayScore(rollup) };
}

function collectRecursiveEntries(recursiveScans: RecursiveScanInput[], parentPath = ""): RecursiveEntry[] {
  const entries: RecursiveEntry[] = [];
  for (const scan of recursiveScans) {
    const fullPath = parentPath ? `${parentPath}/${scan.path}` : scan.path;
    if (scan.error || !scan.result) {
      entries.push({ kind: scan.kind, path: fullPath, error: scan.error ?? "Scan failed" });
      continue;
    }
    const findings = (scan.result.checks ?? []) as CheckResult[];
    const local = scan.result.localScore !== undefined ? scan.result.localScore : evaluatedCount(findings) ? scan.result.overallScore : null;
    const rollup = scan.result.rollupScore !== undefined ? scan.result.rollupScore : local;
    entries.push({ kind: scan.kind, path: fullPath, local: displayScore(local), rollup: displayScore(rollup), checks: evaluatedCount(findings), findings });
    entries.push(...collectRecursiveEntries(scan.result.recursiveScans ?? [], fullPath));
  }
  return entries;
}

function childMarkdown(entries: RecursiveEntry[]): string {
  return entries.map((entry) => {
    const heading = `## Scan target: ${escapeMarkdownText(entry.path)}`;
    if ("error" in entry) return `${heading}\n\nScan failed: ${escapeMarkdownText(entry.error)}\n`;
    const findings = entry.findings.map((check) => [
      `### ${check.name} (${check.id})`,
      `Category: ${formatCategoryLabel(check.category)}; Tier: ${check.tier}; Score: ${checkScore(check)} (${check.status})`,
      check.summary, check.details, `Why this matters: ${check.whyThisMatters}`,
      "References:", ...check.references.map((ref) => `- ${ref}`),
      "Recommendations:", ...check.recommendations.map((rec) => `- ${rec}`)
    ].join("\n\n")).join("\n\n");
    return `${heading}\n\nLocal score: ${entry.local}\n\nRollup score: ${entry.rollup}\n\n${findings}\n`;
  }).join("\n");
}

function escapeMarkdownText(value: string): string {
  return value.replace(/[\\`*_[\]<>#|]/g, (char) => `\\${char}`).replace(/[\r\n]/g, " ");
}

function childHtml(entries: RecursiveEntry[]): string {
  return entries.map((entry) => {
    const heading = `<h2>Scan target: ${escapeHtml(entry.path)}</h2>`;
    if ("error" in entry) return `${heading}<p>Scan failed: ${escapeHtml(entry.error)}</p>`;
    return `${heading}<p>Local score: ${escapeHtml(entry.local)}</p><p>Rollup score: ${escapeHtml(entry.rollup)}</p>` +
      entry.findings.map((check) => `<details class="check-detail"><summary>${escapeHtml(check.name)} (${escapeHtml(check.id)})</summary><div class="check-body">
        <p>Category: ${escapeHtml(formatCategoryLabel(check.category))}; Tier: ${escapeHtml(check.tier)}; Score: ${checkScore(check)} (${escapeHtml(check.status)})</p>
        <p>${escapeHtml(check.summary)}</p><p>${escapeHtml(check.details).replaceAll("\n", "<br>")}</p>
        <p>Why this matters: ${escapeHtml(check.whyThisMatters)}</p>
        <p>References</p><ul>${check.references.map((ref) => `<li>${escapeHtml(ref)}</li>`).join("")}</ul>
        <p>Recommendations</p><ul>${check.recommendations.map((rec) => `<li>${escapeHtml(rec)}</li>`).join("")}</ul>
        </div></details>`).join("");
  }).join("\n");
}

function recursiveBreakdown(recursiveScans: RecursiveScanInput[]): RecursiveEntry[] {
  return collectRecursiveEntries(recursiveScans).sort((a, b) => {
    const pathDelta = compareText(a.path, b.path);
    if (pathDelta !== 0) {
      return pathDelta;
    }
    return compareText(formatRecursiveKind(a.kind), formatRecursiveKind(b.kind));
  });
}

export interface ReportOptions {
  recursiveScans?: RecursiveScanInput[];
  harnixVersion?: string;
  localScore?: number | null;
  rollupScore?: number | null;
  /** ISO 8601 UTC instant shared by the filenames, Markdown, HTML, and JSON. */
  generatedAt?: string;
  /** Complete engine result, required when jsonReport is true. */
  scanResult?: ScanResult;
  /** Effective options after CLI/config precedence, exported in the JSON report. */
  runOptions?: EffectiveRunOptions;
  /** Opt in to the machine-readable JSON artifact. */
  jsonReport?: boolean;
}

export interface EffectiveRunOptions {
  skipIds: string[];
  onlyIds: string[];
  typeOverride: RepoType | null;
  /** null means unlimited depth. */
  depth: number | null;
}

export interface JsonReportInput {
  targetPath: string;
  generatedAt: string;
  harnixVersion?: string;
  runOptions: EffectiveRunOptions;
  scanResult: ScanResult;
}

type JsonAssessment = JsonReport["assessment"];
type JsonChild = JsonAssessment["children"][number];

function buildJsonAssessment(result: ScanResult): JsonAssessment {
  const checks = [...result.checks].sort((a, b) => compareText(a.id, b.id));
  const evaluatedChecks = checks.filter((check) => check.status !== "not-assessed");
  const hasLocalScore = result.localScore !== null;
  const children = [...result.recursiveScans]
    .sort((a, b) => {
      const pathDelta = compareText(a.path, b.path);
      if (pathDelta !== 0) {
        return pathDelta;
      }
      return compareText(a.kind, b.kind);
    })
    .map((entry): JsonChild => {
      const assessed = entry.result !== undefined;
      const rawMessage = entry.error ?? "";
      const relativeMessage =
        entry.absolutePath.length > 0
          ? rawMessage.split(entry.absolutePath).join(entry.path)
          : rawMessage;
      return {
        kind: entry.kind,
        path: entry.path,
        status: assessed ? "assessed" : "error",
        assessment: assessed ? buildJsonAssessment(entry.result!) : null,
        error: assessed ? null : { message: relativeMessage }
      };
    });

  return {
    repoType: result.repoType,
    repoTypeSource: result.repoTypeSource,
    detectedRepoType: result.detectedRepoType,
    localScore: result.localScore,
    localScoreState: hasLocalScore ? "evaluated" : "no-checks",
    rollupScore: result.rollupScore,
    rollupState: result.rollupScore !== null ? "evaluated" : "unavailable",
    band: hasLocalScore ? overallBand(Math.round(result.localScore! * 100)) : null,
    evaluatedCheckIds: evaluatedChecks.map((check) => check.id),
    checks: checks as JsonAssessment["checks"],
    checkErrors: [...result.checkErrors].sort((a, b) => {
      const idDelta = compareText(a.checkId, b.checkId);
      if (idDelta !== 0) {
        return idDelta;
      }
      return compareText(a.message, b.message);
    }) as JsonAssessment["checkErrors"],
    children
  };
}

/**
 * Builds the versioned JSON report from a complete scan result.
 *
 * Ordering is deterministic: checks by ID, check errors by check ID, and
 * children by path then kind. Only run metadata (target, options, version,
 * and instant) reflects the invocation.
 */
export function buildJsonReport(input: JsonReportInput): string {
  const assessment = buildJsonAssessment(input.scanResult);
  const sortedChecks = [...input.scanResult.checks].sort((a, b) => compareText(a.id, b.id));
  const rankedRecommendations = topRecommendations(
    sortedChecks,
    input.scanResult.recursiveScans as RecursiveScanInput[]
  ).map((item) => ({
    checkId: item.id,
    checkName: item.name,
    targetPath: item.scanTargetPath.length > 0 ? item.scanTargetPath : null,
    recommendation: item.recommendation,
    tier: item.tier,
    score: item.score
  }));

  const report: JsonReport = {
    schemaVersion: JSON_REPORT_SCHEMA_VERSION,
    harnixVersion: input.harnixVersion && input.harnixVersion.length > 0 ? input.harnixVersion : null,
    generatedAt: input.generatedAt,
    run: {
      target: { path: input.targetPath },
      options: {
        skip: [...input.runOptions.skipIds],
        only: [...input.runOptions.onlyIds],
        typeOverride: input.runOptions.typeOverride,
        depth: input.runOptions.depth
      }
    },
    assessment,
    topRecommendations: rankedRecommendations
  };

  return `${JSON.stringify(jsonReportSchema.parse(report), null, 2)}\n`;
}

export function buildMarkdownReport(
  scannedPath: string,
  checks: CheckResult[],
  overallScore: number,
  timestamp: string,
  options: ReportOptions = {}
): string {
  const scores = scorePair(checks, overallScore, options);
  const categoryScores = categoryBreakdown(checks);
  const counts = statusCounts(checks);
  const recursiveInput = options.recursiveScans ?? [];
  const recommendations = topRecommendations(checks, recursiveInput);
  const recursiveScans = recursiveBreakdown(recursiveInput);
  const versionLine =
    typeof options.harnixVersion === "string" && options.harnixVersion.length > 0
      ? [`- Harnix version: **${options.harnixVersion}**`]
      : [];
  const generatedLine =
    typeof options.generatedAt === "string" && options.generatedAt.length > 0
      ? `- Generated: ${timestamp} (${options.generatedAt})`
      : `- Generated: ${timestamp}`;

  const lines: string[] = [
    "# Harnix Harness Readiness Report",
    "",
    "## Executive Summary",
    "",
    `- Local score: **${scores.local}**`,
    `- Rollup score: **${scores.rollup}**`,
    ...versionLine,
    generatedLine,
    `- Scanned path: \`${scannedPath}\``,
    `- Checks evaluated: ${evaluatedCount(checks)} (${counts.pass} pass, ${counts.partial} partial, ${counts.fail} fail)`,
    ...(checks.some((check) => check.status === "not-assessed") ? [`- Not assessed: ${checks.length - evaluatedCount(checks)}`] : []),
    ...(evaluatedCount(checks) === 0
      ? [
          "",
          "> Warning: no checks were evaluated. Review `--only` / `--skip` filters and repo type applicability.",
        ]
      : []),
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
    lines.push("", "## Child Scan Targets", "");
    lines.push("| Type | Path | Local score | Rollup score | Checks |");
    lines.push("|---|---|---:|---|---:|");
    for (const entry of recursiveScans) {
      if ("error" in entry) {
        lines.push(
          `| ${formatRecursiveKind(entry.kind)} | \`${escapeMarkdownCell(entry.path)}\` | Unavailable | Scan failed: ${escapeMarkdownCell(entry.error)} | 0 |`
        );
        continue;
      }

      lines.push(
        `| ${formatRecursiveKind(entry.kind)} | \`${escapeMarkdownCell(entry.path)}\` | ${entry.local} | ${entry.rollup} | ${entry.checks} |`
      );
    }
  }

  lines.push("", "## Detailed Findings", "");
  for (const check of checks) {
    lines.push(`### ${check.name} (\`${check.id}\`)`);
    lines.push(`- Category: ${formatCategoryLabel(check.category)}`);
    lines.push(`- Tier: ${check.tier}`);
    lines.push(`- Score: ${checkScore(check)} (${check.status})`);
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

  lines.push(childMarkdown(recursiveScans));
  lines.push("## Prioritized Recommendations", "");
  if (recommendations.length > 0) {
    recommendations.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${formatRecommendationLine(item)} (${item.name}, ${item.tier})`
      );
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
  const scores = scorePair(checks, overallScore, options);
  const categoryScores = categoryBreakdown(checks);
  const counts = statusCounts(checks);
  const recursiveInput = options.recursiveScans ?? [];
  const recursiveScans = recursiveBreakdown(recursiveInput);
  const versionMeta =
    typeof options.harnixVersion === "string" && options.harnixVersion.length > 0
      ? ` • Harnix ${escapeHtml(options.harnixVersion)}`
      : "";
  const generatedMeta =
    typeof options.generatedAt === "string" && options.generatedAt.length > 0
      ? ` (${escapeHtml(options.generatedAt)})`
      : "";

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
  <td>${escapeHtml(checkScore(check))}</td>
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
  <td colspan="3">Scan failed: ${escapeHtml(entry.error)}</td>
</tr>`;
      }

      return `<tr>
  <td>${escapeHtml(formatRecursiveKind(entry.kind))}</td>
  <td><code>${escapeHtml(entry.path)}</code></td>
  <td>${escapeHtml(entry.local)}</td>
  <td>${escapeHtml(entry.rollup)}</td>
  <td>${entry.checks}</td>

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
    <span class="check-summary">${escapeHtml(checkScore(check))} • ${escapeHtml(check.status)}</span>
  </summary>
  <div class="check-body">
    <p><strong>ID:</strong> <code>${escapeHtml(check.id)}</code></p>
    <p><strong>Category:</strong> ${escapeHtml(formatCategoryLabel(check.category))}</p>
    <p><strong>Tier:</strong> ${escapeHtml(check.tier)}</p>
    <p><strong>Score:</strong> ${escapeHtml(checkScore(check))} (${escapeHtml(check.status)})</p>
    ${check.status === "not-assessed" ? "" : `<div class="score-track" aria-hidden="true">
      <div class="score-fill" style="width: ${checkPercent}%"></div>
    </div>
    <span class="metric-label">${checkPercent}%</span>`}
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

  const recommendationItems = topRecommendations(checks, recursiveInput)
    .map(
      (item) =>
        `<li>${escapeHtml(formatRecommendationLine(item))} <span class="meta">(${escapeHtml(item.name)}, ${escapeHtml(item.tier)})</span></li>`
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
        <p class="meta">Generated ${escapeHtml(timestamp)}${generatedMeta} • Scanned <code>${escapeHtml(scannedPath)}</code>${versionMeta}</p>
      </div>
      <div class="controls" role="group" aria-label="Report controls">
        <button id="theme-toggle" type="button">Toggle theme</button>
        <button id="expand-all" type="button">Expand all</button>
        <button id="collapse-all" type="button">Collapse all</button>
      </div>
    </header>

    <h2>Executive Summary</h2>
    <div class="summary-card">
      <p><strong>Local score:</strong> ${escapeHtml(scores.local)}</p>
      <p><strong>Rollup score:</strong> ${escapeHtml(scores.rollup)}</p>
      <p><strong>Checks evaluated:</strong> ${evaluatedCount(checks)} (${counts.pass} pass, ${counts.partial} partial, ${counts.fail} fail)</p>
      ${checks.some((check) => check.status === "not-assessed") ? `<p><strong>Not assessed:</strong> ${checks.length - evaluatedCount(checks)}</p>` : ""}
      ${
        evaluatedCount(checks) === 0
          ? `<p class="meta"><strong>Warning:</strong> no checks were evaluated. Review <code>--only</code> / <code>--skip</code> filters and repo type applicability.</p>`
          : ""
      }
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
        ? `<h2>Child Scan Targets</h2>
    <table>
      <thead>
        <tr>
          <th>Type</th>
          <th>Path</th>
          <th>Local score</th>
          <th>Rollup score</th>
          <th>Checks</th>
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

    ${childHtml(recursiveScans)}

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
): Promise<{
  markdownPath: string;
  htmlPath: string;
  jsonPath?: string;
  timestamp: string;
  generatedAt: string;
}> {
  const now = typeof options.generatedAt === "string" && options.generatedAt.length > 0
    ? new Date(options.generatedAt)
    : new Date();
  if (Number.isNaN(now.getTime())) {
    throw new Error(`Invalid generatedAt: ${options.generatedAt}`);
  }
  const generatedAt = now.toISOString();
  const timestamp = reportTimestamp(now);
  const resolvedOutputDirectory = outputDirectory
    ? path.resolve(outputDirectory)
    : path.join(scannedPath, "harnix");
  const markdownPath = path.join(resolvedOutputDirectory, `report-${timestamp}.md`);
  const htmlPath = path.join(resolvedOutputDirectory, `report-${timestamp}.html`);

  const effectiveChecks = options.scanResult?.checks ?? checks;
  const effectiveScore = options.scanResult?.overallScore ?? overallScore;
  const effectiveRecursiveScans = options.scanResult?.recursiveScans ?? options.recursiveScans;
  const effectiveLocalScore = options.scanResult ? options.scanResult.localScore : options.localScore;
  const effectiveRollupScore = options.scanResult ? options.scanResult.rollupScore : options.rollupScore;
  const reportOptions: ReportOptions = {
    ...options,
    generatedAt,
    localScore: effectiveLocalScore,
    rollupScore: effectiveRollupScore,
    ...(effectiveRecursiveScans ? { recursiveScans: effectiveRecursiveScans } : {})
  };
  const markdownContent = buildMarkdownReport(
    scannedPath,
    effectiveChecks,
    effectiveScore,
    timestamp,
    reportOptions
  );
  const htmlContent = buildHtmlReport(
    scannedPath,
    effectiveChecks,
    effectiveScore,
    timestamp,
    reportOptions
  );

  let jsonPath: string | undefined;
  let jsonContent: string | undefined;
  if (options.jsonReport === true) {
    if (!options.scanResult) {
      throw new Error("JSON report requested but no scan result was provided");
    }
    if (!options.runOptions) {
      throw new Error("JSON report requested but no effective run options were provided");
    }

    jsonPath = path.join(resolvedOutputDirectory, `report-${timestamp}.json`);
    jsonContent = buildJsonReport({
      targetPath: scannedPath,
      generatedAt,
      harnixVersion: options.harnixVersion,
      runOptions: options.runOptions,
      scanResult: options.scanResult
    });
  }

  await fs.mkdir(resolvedOutputDirectory, { recursive: true });
  await Promise.all([
    fs.writeFile(markdownPath, markdownContent, "utf8"),
    fs.writeFile(htmlPath, htmlContent, "utf8")
  ]);

  if (jsonPath && jsonContent !== undefined) {
    await fs.writeFile(jsonPath, jsonContent, "utf8");
  }

  return { markdownPath, htmlPath, ...(jsonPath ? { jsonPath } : {}), timestamp, generatedAt };
}

export function printConsoleReport(
  targetPath: string,
  checks: CheckResult[],
  overallScore: number,
  options: {
    verbose?: boolean;
    recursiveScans?: RecursiveScanInput[];
    harnixVersion?: string;
    localScore?: number | null;
    rollupScore?: number | null;
  } = {}
): void {
  const verbose = options.verbose === true;
  const scores = scorePair(checks, overallScore, options);
  const recursiveInput = options.recursiveScans ?? [];
  const recursiveScans = recursiveBreakdown(recursiveInput);

  console.log(bold(`Harness Readiness Report: ${targetPath}`));
  console.log("───────────────────────────────────────");
  if (typeof options.harnixVersion === "string" && options.harnixVersion.length > 0) {
    console.log(`Harnix ${options.harnixVersion}`);
  }
  console.log(`${bold("Local score:")} ${scores.local}`);
  console.log(`${bold("Rollup score:")} ${scores.rollup}`);
  if (evaluatedCount(checks) === 0) {
    console.log(
      "Warning: no checks were evaluated (check --only/--skip filters and repo type applicability)."
    );
  }
  if (recursiveScans.length > 0) {
    console.log("");
    console.log(bold("Monorepo breakdown:"));
    for (const entry of recursiveScans) {
      if ("error" in entry) {
        console.log(`- ${formatRecursiveKind(entry.kind)} ${entry.path}: scan failed: ${entry.error}`);
      } else {
        console.log(
          `- ${formatRecursiveKind(entry.kind)} ${entry.path}: Local score: ${entry.local}; Rollup score: ${entry.rollup}`
        );
      }
    }
  }
  console.log("");

  for (const check of checks) {
    const symbol = colorSymbolForStatus(check.status);
    const name = bold(check.name.padEnd(18, " "));
    const percent = checkScore(check).padStart(4, " ");
    console.log(`${symbol} ${name} ${percent}  ${check.summary}`);

    if (verbose) {
      const why =
        typeof check.whyThisMatters === "string" && check.whyThisMatters.trim().length > 0
          ? check.whyThisMatters.trim()
          : "This check affects how reliably humans and agents can operate in the repository.";
      console.log(`    Why this matters: ${why}`);
    }
  }

  const recommendations = topRecommendations(checks, recursiveInput);
  if (recommendations.length > 0) {
    console.log("");
    console.log(bold("Top recommendations:"));
    recommendations.forEach((item, index) => {
      console.log(`${index + 1}. ${formatRecommendationLine(item)}`);
    });
  }
}
