import { promises as fs } from "node:fs";
import path from "node:path";
import { statusFromScore, type ScanContext, type CheckResult } from "../../src/types.js";
import {
  hasSubstantiveDocContent,
  normalizePath,
  readmePlaceholderLike,
  uniqueSorted,
} from "../../src/documentation-utils.js";

const WHY_THIS_MATTERS =
  "A root README is the fastest onboarding artifact for humans and agents. It should explain what the repository is for, how to get started, and how to verify changes safely.";

const README_PATTERNS = [/^README\.md$/i, /^README\.txt$/i];
const MAX_REFERENCE_COUNT = 5;

interface ReadmeSignal {
  id: string;
  label: string;
  weight: number;
  patterns: RegExp[];
  recommendation: string;
}

const README_SIGNALS: ReadmeSignal[] = [
  {
    id: "setup",
    label: "setup/install guidance",
    weight: 2,
    patterns: [
      /\b(getting started|quick start|setup|installation|install)\b/i,
      /\b(npm install|pnpm install|yarn install|pip install|cargo build)\b/i,
    ],
    recommendation:
      "Add setup or installation guidance so a first-time contributor can bootstrap the repository quickly.",
  },
  {
    id: "usage",
    label: "usage/run guidance",
    weight: 2,
    patterns: [
      /\b(usage|how to use|commands|run|start|development|dev server)\b/i,
      /\b(npm run|pnpm run|yarn |cargo run|docker compose up)\b/i,
    ],
    recommendation:
      "Add usage or run guidance with the main commands contributors should execute locally.",
  },
  {
    id: "verification",
    label: "testing or troubleshooting guidance",
    weight: 2,
    patterns: [
      /\b(test|tests|testing|troubleshoot|troubleshooting|debug|verification)\b/i,
      /\b(npm test|pnpm test|yarn test|cargo test|pytest)\b/i,
    ],
    recommendation:
      "Add testing or troubleshooting guidance so contributors know how to verify changes and recover from common issues.",
  },
];


function findRootReadme(files: string[]): string | null {
  return (
    files.find((filePath) => README_PATTERNS.some((pattern) => pattern.test(filePath))) ??
    null
  );
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const normalizedFiles = uniqueSorted(ctx.files.map(normalizePath));
  const readmePath = findRootReadme(normalizedFiles);

  if (!readmePath) {
    return {
      id: "root-readme",
      name: "Root README",
      category: "documentation",
      tier: "critical",
      score: 0,
      status: "fail",
      summary: "No root README.md or README.txt found",
      details:
        "The repository does not include a supported root README file, which is the primary onboarding artifact for contributors and agents.",
      recommendations: [
        "Add a substantive root README.md or README.txt with project purpose, setup steps, usage examples, and verification guidance.",
      ],
      references: [],
      whyThisMatters: WHY_THIS_MATTERS,
    };
  }

  let readme: string;
  try {
    readme = await fs.readFile(path.join(ctx.rootPath, readmePath), "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "root-readme",
      name: "Root README",
      category: "documentation",
      tier: "critical",
      score: 0,
      status: "fail",
      summary: `Unable to read ${readmePath}: ${message}`,
      details:
        "A supported root README file exists but could not be read during scanning.",
      recommendations: [
        "Repair root README readability issues so onboarding and tooling checks can parse it reliably.",
      ],
      references: [readmePath],
      whyThisMatters: WHY_THIS_MATTERS,
    };
  }

  const substantive =
    hasSubstantiveDocContent(readme) && !readmePlaceholderLike(readme);
  const signalResults = README_SIGNALS.map((signal) => ({
    signal,
    matched: signal.patterns.some((pattern) => pattern.test(readme)),
  }));

  const totalWeight =
    4 + signalResults.reduce((sum, result) => sum + result.signal.weight, 0);
  let weightedMet = 3;
  if (substantive) {
    weightedMet += 4;
  }
  for (const result of signalResults) {
    if (result.matched) {
      weightedMet += result.signal.weight;
    }
  }

  const score = Math.min(1, weightedMet / totalWeight);
  const matchedSignalCount = signalResults.filter((result) => result.matched).length;
  const missingSignals = signalResults.filter((result) => !result.matched);

  let summary = `README signals: ${matchedSignalCount}/${signalResults.length} content signals detected`;
  if (!substantive) {
    summary = `${readmePath} exists but is not substantive`;
  }

  const details = [
    `${readmePath}: ${substantive ? "substantive" : "present but placeholder/brief"}.`,
    `Detected content signals: ${matchedSignalCount}/${signalResults.length}.`,
    missingSignals.length > 0
      ? `Missing signals: ${missingSignals.map((result) => result.signal.label).join(", ")}.`
      : "All core README content signals were detected.",
  ].join(" ");

  const recommendations: string[] = [];
  if (!substantive) {
    recommendations.push(
      `Expand ${readmePath} beyond a heading or placeholder with project purpose, setup, usage, and verification guidance.`
    );
  }
  for (const result of missingSignals) {
    recommendations.push(result.signal.recommendation);
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Maintain the root README as the primary onboarding entry point and keep its commands current."
    );
  }

  return {
    id: "root-readme",
    name: "Root README",
    category: "documentation",
    tier: "critical",
    score,
    status: statusFromScore(score),
    summary,
    details,
    recommendations,
    references: [readmePath].slice(0, MAX_REFERENCE_COUNT),
    whyThisMatters: WHY_THIS_MATTERS,
  };
}
