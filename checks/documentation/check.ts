import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScanContext, CheckResult } from "../../src/types.js";
import {
  DOC_EXTENSIONS,
  hasSubstantiveDocContent,
  normalizePath,
  uniqueSorted,
} from "../../src/documentation-utils.js";

const WHY_THIS_MATTERS =
  "Durable documentation roots keep reference material discoverable instead of burying it in ad hoc files. Repositories should have a canonical place for product, technical, or process documentation.";

const DOC_ROOTS = ["docs", "specs", "prds"] as const;
const MAX_REFERENCE_COUNT = 20;

function statusFromScore(score: number): "pass" | "partial" | "fail" {
  const percent = Math.round(score * 100);
  if (percent >= 75) return "pass";
  if (percent >= 25) return "partial";
  return "fail";
}

function rootLabel(root: string): string {
  return `${root}/`;
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const normalizedFiles = uniqueSorted(ctx.files.map(normalizePath));
  const rootMatches = DOC_ROOTS.map((root) => {
    const prefix = `${root}/`;
    const files = normalizedFiles.filter((filePath) => filePath.startsWith(prefix));
    const docFiles = files.filter((filePath) =>
      DOC_EXTENSIONS.has(path.extname(filePath).toLowerCase())
    );

    return {
      root,
      files,
      docFiles,
    };
  });

  const presentRoots = rootMatches.filter((match) => match.files.length > 0);
  if (presentRoots.length === 0) {
    return {
      id: "documentation",
      name: "Documentation",
      category: "documentation",
      tier: "important",
      score: 0,
      status: "fail",
      summary: "No docs/, specs/, or prds/ content found",
      details:
        "The repository does not contain any supported durable documentation roots.",
      recommendations: [
        "Add a docs/, specs/, or prds/ directory for durable product, technical, or process documentation.",
      ],
      references: [],
      whyThisMatters: WHY_THIS_MATTERS,
    };
  }

  const substantiveFiles: string[] = [];
  const placeholderFiles: string[] = [];

  for (const match of presentRoots) {
    for (const relativePath of match.docFiles) {
      try {
        const content = await fs.readFile(path.join(ctx.rootPath, relativePath), "utf8");
        if (hasSubstantiveDocContent(content)) {
          substantiveFiles.push(relativePath);
        } else {
          placeholderFiles.push(relativePath);
        }
      } catch {
        placeholderFiles.push(relativePath);
      }
    }
  }

  const score =
    substantiveFiles.length > 0
      ? 1
      : presentRoots.some((match) => match.docFiles.length > 0)
        ? 0.4
        : 0.2;

  const detectedRoots = presentRoots.map((match) => rootLabel(match.root));
  let summary = `Documentation roots detected: ${detectedRoots.join(", ")}`;
  if (substantiveFiles.length === 0) {
    summary = "Documentation roots exist but no substantive docs were detected";
  }

  const detailsLines = [
    `Detected documentation roots: ${detectedRoots.join(", ")}.`,
    `Substantive documentation files: ${substantiveFiles.length}.`,
  ];

  if (placeholderFiles.length > 0) {
    detailsLines.push(
      `Placeholder or unreadable documentation files: ${uniqueSorted(placeholderFiles).join(", ")}.`
    );
  }

  const missingRoots = DOC_ROOTS.filter(
    (root) => !presentRoots.some((match) => match.root === root)
  ).map(rootLabel);
  if (missingRoots.length > 0) {
    detailsLines.push(`Missing supported documentation roots: ${missingRoots.join(", ")}.`);
  }

  const recommendations: string[] = [];
  if (substantiveFiles.length === 0) {
    recommendations.push(
      "Add substantive documentation under docs/, specs/, or prds/ so contributors have a durable place to find reference material."
    );
  }
  if (placeholderFiles.length > 0) {
    recommendations.push(
      `Replace placeholder or unreadable documentation files with substantive content: ${uniqueSorted(placeholderFiles).join(", ")}.`
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Maintain documentation quality in docs/, specs/, and prds/ as the canonical long-form reference layer evolves."
    );
  }

  const references = uniqueSorted([
    ...substantiveFiles,
    ...placeholderFiles,
  ]).slice(0, MAX_REFERENCE_COUNT);

  return {
    id: "documentation",
    name: "Documentation",
    category: "documentation",
    tier: "important",
    score,
    status: statusFromScore(score),
    summary,
    details: detailsLines.join(" "),
    recommendations,
    references,
    whyThisMatters: WHY_THIS_MATTERS,
  };
}
