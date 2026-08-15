import { promises as fs } from "node:fs";
import path from "node:path";
import { statusFromScore, type ScanContext, type CheckResult } from "../../src/types.js";
import {
  hasSubstantiveDocContent,
  normalizePath,
  uniqueSorted,
} from "../../src/documentation-utils.js";

const WHY_THIS_MATTERS =
  "A shared ubiquitous language keeps humans and agents using the same domain terms. The idea comes from domain-driven design and has become more important in agentic coding, where a discoverable CONTEXT.md or UBIQUITOUS_LANGUAGE.md reduces invented synonyms and inconsistent edits.";

const LANGUAGE_BASENAMES = new Set(["context.md", "ubiquitous_language.md"]);
const EXCLUDED_DIR_SEGMENTS = new Set([
  "docs",
  "vendor",
  "third_party",
  "third-party",
]);
const MAX_REFERENCE_COUNT = 20;

const SCORE_ROOT_SUBSTANTIVE = 1;
const SCORE_NESTED_SUBSTANTIVE = 0.7;
const SCORE_PLACEHOLDER = 0.4;
const SCORE_UNREADABLE = 0.1;

interface LanguageCandidate {
  relativePath: string;
  root: boolean;
}

interface FileEvaluation extends LanguageCandidate {
  readable: boolean;
  substantive: boolean;
}

function pathSegments(relativePath: string): string[] {
  return normalizePath(relativePath)
    .replace(/^\.\/+/, "")
    .split("/")
    .filter((part) => part.length > 0 && part !== ".");
}

function canonicalRelativePath(relativePath: string): string {
  return pathSegments(relativePath).join("/");
}

function baseName(relativePath: string): string {
  const parts = pathSegments(relativePath);
  return parts[parts.length - 1] ?? relativePath;
}

function directorySegments(relativePath: string): string[] {
  return pathSegments(relativePath).slice(0, -1);
}

function isLanguageBasename(relativePath: string): boolean {
  return LANGUAGE_BASENAMES.has(baseName(relativePath).toLowerCase());
}

function excludedSegmentsIn(relativePath: string): string[] {
  return directorySegments(relativePath).filter((segment) =>
    EXCLUDED_DIR_SEGMENTS.has(segment.toLowerCase())
  );
}

function classifyCandidates(files: string[]): {
  accepted: LanguageCandidate[];
  ignored: string[];
} {
  const accepted: LanguageCandidate[] = [];
  const ignored: string[] = [];

  for (const filePath of uniqueSorted(files.map(canonicalRelativePath).filter(Boolean))) {
    if (!isLanguageBasename(filePath)) continue;
    if (excludedSegmentsIn(filePath).length > 0) {
      ignored.push(filePath);
      continue;
    }

    accepted.push({
      relativePath: filePath,
      root: directorySegments(filePath).length === 0,
    });
  }

  return { accepted, ignored };
}

function baseResult(
  score: number,
  summary: string,
  details: string,
  recommendations: string[],
  references: string[],
): CheckResult {
  return {
    id: "ubiquitous-language",
    name: "Ubiquitous language",
    category: "documentation",
    tier: "important",
    score,
    status: statusFromScore(score),
    summary,
    details,
    recommendations,
    references,
    whyThisMatters: WHY_THIS_MATTERS,
  };
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const { accepted, ignored } = classifyCandidates(ctx.files);
  const ignoredDocs = ignored.filter((filePath) =>
    excludedSegmentsIn(filePath).some((segment) => segment.toLowerCase() === "docs")
  );

  if (accepted.length === 0) {
    const onlyDocsIgnored = ignored.length > 0 && ignoredDocs.length === ignored.length;
    const details = ignored.length > 0
      ? onlyDocsIgnored
        ? `Found language files only under docs/ (${ignored.join(", ")}). docs/ is a documentation root, so those copies are ignored.`
        : `Found language files only under excluded paths (${ignored.join(", ")}). Copies under docs/, vendor/, third_party/, or third-party/ are ignored.`
      : "No CONTEXT.md or UBIQUITOUS_LANGUAGE.md was detected at the repository root or in a nested project directory.";

    const recommendations = ignored.length > 0
      ? [
          "Add a root CONTEXT.md or UBIQUITOUS_LANGUAGE.md, or place a supplementary copy next to the relevant code instead of under docs/ or vendored trees.",
        ]
      : [
          "Add a root CONTEXT.md or UBIQUITOUS_LANGUAGE.md that defines the project's ubiquitous language.",
        ];

    return baseResult(
      0,
      onlyDocsIgnored
        ? "Only docs/ copies of CONTEXT.md or UBIQUITOUS_LANGUAGE.md were found"
        : ignored.length > 0
          ? "Only excluded-path copies of CONTEXT.md or UBIQUITOUS_LANGUAGE.md were found"
          : "No CONTEXT.md or UBIQUITOUS_LANGUAGE.md found",
      details,
      recommendations,
      [],
    );
  }

  const evaluations: FileEvaluation[] = [];
  for (const candidate of accepted) {
    try {
      const content = await fs.readFile(path.join(ctx.rootPath, candidate.relativePath), "utf8");
      evaluations.push({
        ...candidate,
        readable: true,
        substantive: hasSubstantiveDocContent(content),
      });
    } catch {
      evaluations.push({
        ...candidate,
        readable: false,
        substantive: false,
      });
    }
  }

  const substantiveRoot = evaluations.filter((item) => item.root && item.substantive);
  const substantiveNested = evaluations.filter((item) => !item.root && item.substantive);
  const placeholders = evaluations.filter((item) => item.readable && !item.substantive);
  const unreadable = evaluations.filter((item) => !item.readable);
  const references = uniqueSorted(evaluations.map((item) => item.relativePath)).slice(
    0,
    MAX_REFERENCE_COUNT,
  );

  const detailParts = [
    `Accepted language files: ${references.join(", ")}.`,
  ];
  if (ignored.length > 0) {
    detailParts.push(
      `Ignored copies under excluded paths: ${ignored.join(", ")}.`,
    );
  }

  if (substantiveRoot.length > 0) {
    const extra = substantiveNested.length > 0
      ? ` Supplementary nested files: ${substantiveNested.map((item) => item.relativePath).join(", ")}.`
      : "";
    return baseResult(
      SCORE_ROOT_SUBSTANTIVE,
      "Root ubiquitous-language file is substantive",
      `${detailParts.join(" ")} Root file ${substantiveRoot.map((item) => item.relativePath).join(" and ")} defines shared domain terms.${extra}`,
      [
        "Keep the root ubiquitous-language file current as domain terms are resolved, and prefer those terms over ad-hoc phrasing.",
      ],
      references,
    );
  }

  if (substantiveNested.length > 0) {
    return baseResult(
      SCORE_NESTED_SUBSTANTIVE,
      "Nested ubiquitous-language file found; root file is missing or not substantive",
      `${detailParts.join(" ")} Substantive nested files: ${substantiveNested.map((item) => item.relativePath).join(", ")}. A root CONTEXT.md or UBIQUITOUS_LANGUAGE.md is the preferred canonical glossary.`,
      [
        "Add a substantive root CONTEXT.md or UBIQUITOUS_LANGUAGE.md as the canonical ubiquitous language, and keep nested copies supplementary.",
      ],
      references,
    );
  }

  if (placeholders.length > 0) {
    return baseResult(
      SCORE_PLACEHOLDER,
      "Ubiquitous-language file exists but is not substantive",
      `${detailParts.join(" ")} Placeholder or heading-only files: ${placeholders.map((item) => item.relativePath).join(", ")}.`,
      [
        "Replace placeholder ubiquitous-language files with the project's shared domain terms.",
      ],
      references,
    );
  }

  return baseResult(
    SCORE_UNREADABLE,
    "Could not read ubiquitous-language file",
    `${detailParts.join(" ")} Unreadable files: ${unreadable.map((item) => item.relativePath).join(", ")}.`,
    [
      "Fix permissions or encoding issues so CONTEXT.md or UBIQUITOUS_LANGUAGE.md can be read during scans.",
    ],
    references,
  );
}
