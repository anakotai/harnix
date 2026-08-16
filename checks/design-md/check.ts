import { promises as fs } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { statusFromScore, type ScanContext, type CheckResult } from "../../src/types.js";
import { normalizePath } from "../../src/documentation-utils.js";

const WHY_THIS_MATTERS =
  "A root DESIGN.md gives agents a portable visual identity — tokens plus rationale — so generated UI can follow the project's look instead of a generic default.";

const DESIGN_MD = "DESIGN.md";

const KNOWN_FRONT_MATTER_KEYS = new Set([
  "version",
  "name",
  "description",
  "omitted",
  "colors",
  "typography",
  "rounded",
  "spacing",
  "components",
]);

const CANONICAL_HEADINGS = new Map<string, string>([
  ["overview", "Overview"],
  ["brand & style", "Overview"],
  ["colors", "Colors"],
  ["typography", "Typography"],
  ["layout", "Layout"],
  ["layout & spacing", "Layout"],
  ["elevation & depth", "Elevation & Depth"],
  ["elevation", "Elevation & Depth"],
  ["shapes", "Shapes"],
  ["components", "Components"],
  ["do's and don'ts", "Do's and Don'ts"],
  ["dos and don'ts", "Do's and Don'ts"],
  ["dos and donts", "Do's and Don'ts"],
]);

const SCORE_MISSING = 0;
const SCORE_UNREADABLE = 0.1;
const SCORE_EXISTS = 0.4;
const SCORE_PARTIAL_SHAPE = 0.7;
const SCORE_FULL_SHAPE = 1;

function canonicalRelativePath(relativePath: string): string {
  return normalizePath(relativePath)
    .replace(/^\.\/+/, "")
    .split("/")
    .filter((part) => part.length > 0 && part !== ".")
    .join("/");
}

function isRootDesignMd(relativePath: string): boolean {
  return canonicalRelativePath(relativePath) === DESIGN_MD;
}

function isYamlFence(line: string): boolean {
  return line.trim() === "---";
}

function normalizeHeading(heading: string): string {
  return heading
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, "")
    .replace(/[*_`]/g, "")
    .replace(/\s+#+\s*$/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function splitFrontMatter(content: string): { yamlText: string | null; body: string } {
  const text = content.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);
  if (!isYamlFence(lines[0] ?? "")) {
    return { yamlText: null, body: text };
  }

  for (let index = 1; index < lines.length; index += 1) {
    if (!isYamlFence(lines[index] ?? "")) continue;
    return {
      yamlText: lines.slice(1, index).join("\n"),
      body: lines.slice(index + 1).join("\n"),
    };
  }

  return { yamlText: null, body: text };
}

function stripFencedCodeBlocks(content: string): string {
  const visibleLines: string[] = [];
  let activeFence: { char: string; length: number } | null = null;

  for (const line of content.split(/\r?\n/)) {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fenceMatch) {
      const marker = fenceMatch[1] ?? "";
      const rest = fenceMatch[2] ?? "";
      const char = marker[0] ?? "";
      const length = marker.length;

      if (activeFence === null) {
        activeFence = { char, length };
        continue;
      }

      if (char === activeFence.char && length >= activeFence.length && rest.trim() === "") {
        activeFence = null;
      }
      continue;
    }

    if (activeFence === null) {
      visibleLines.push(line);
    }
  }

  return visibleLines.join("\n");
}

function hasSpecFrontMatter(yamlText: string | null): boolean {
  if (yamlText === null) return false;
  const trimmed = yamlText.trim();
  if (trimmed.length === 0) return false;

  try {
    const value: unknown = parseYaml(trimmed);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return Object.keys(value).some((key) => KNOWN_FRONT_MATTER_KEYS.has(key));
  } catch {
    return false;
  }
}

function collectCanonicalSections(body: string): string[] {
  const found = new Set<string>();
  for (const line of stripFencedCodeBlocks(body).split(/\r?\n/)) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (!match) continue;
    const canonical = CANONICAL_HEADINGS.get(normalizeHeading(match[1] ?? ""));
    if (canonical) found.add(canonical);
  }
  return Array.from(found);
}

function baseResult(
  score: number,
  summary: string,
  details: string,
  recommendations: string[],
  references: string[],
): CheckResult {
  return {
    id: "design-md",
    name: "Design guidance",
    category: "documentation",
    tier: "nice-to-have",
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
  const hasRootFile = ctx.files.some(isRootDesignMd);

  if (!hasRootFile) {
    return baseResult(
      SCORE_MISSING,
      "No DESIGN.md found",
      "No DESIGN.md was detected at the repository root. Nested copies and differently cased names such as design.md are ignored.",
      [
        "Add a root DESIGN.md with YAML front matter using DESIGN.md schema keys and canonical markdown sections (Overview, Colors, Typography, and the rest of the spec order).",
      ],
      [],
    );
  }

  let content: string;
  try {
    content = await fs.readFile(path.join(ctx.rootPath, DESIGN_MD), "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return baseResult(
      SCORE_UNREADABLE,
      `Could not read ${DESIGN_MD}: ${message}`,
      `${DESIGN_MD} exists at the repository root but could not be read during scanning.`,
      [`Fix permissions or encoding issues so ${DESIGN_MD} can be read during scans.`],
      [DESIGN_MD],
    );
  }

  const { yamlText, body } = splitFrontMatter(content);
  const tokenFrontMatter = hasSpecFrontMatter(yamlText);
  const sections = collectCanonicalSections(body);
  const hasSections = sections.length > 0;

  if (tokenFrontMatter && hasSections) {
    return baseResult(
      SCORE_FULL_SHAPE,
      "DESIGN.md has spec front matter and canonical sections",
      `${DESIGN_MD} has YAML front matter with a DESIGN.md schema key and canonical sections: ${sections.join(", ")}.`,
      [
        "Keep DESIGN.md current as the visual identity changes, and treat tokens as the normative values with prose as the rationale.",
      ],
      [DESIGN_MD],
    );
  }

  if (tokenFrontMatter) {
    return baseResult(
      SCORE_PARTIAL_SHAPE,
      "DESIGN.md has spec front matter but no canonical sections",
      `${DESIGN_MD} has YAML front matter with a DESIGN.md schema key, but no canonical ## sections from the DESIGN.md spec were found.`,
      [
        "Add canonical markdown sections such as Overview, Colors, and Typography so agents get rationale, not only token values.",
      ],
      [DESIGN_MD],
    );
  }

  if (hasSections) {
    return baseResult(
      SCORE_PARTIAL_SHAPE,
      "DESIGN.md has canonical sections but no token front matter",
      `${DESIGN_MD} has canonical sections (${sections.join(", ")}), but no YAML front matter with DESIGN.md token keys was found.`,
      [
        "Add YAML front matter with at least one DESIGN.md schema key (for example name, colors, typography, spacing, rounded, components).",
      ],
      [DESIGN_MD],
    );
  }

  return baseResult(
    SCORE_EXISTS,
    "DESIGN.md exists but lacks spec shape",
    `${DESIGN_MD} is present at the repository root but has neither YAML front matter with a DESIGN.md schema key nor canonical ## sections from the DESIGN.md spec.`,
    [
      "Give DESIGN.md spec shape: YAML front matter with a known schema key plus canonical sections such as Overview, Colors, and Typography.",
    ],
    [DESIGN_MD],
  );
}
