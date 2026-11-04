import { promises as fs } from "node:fs";
import path from "node:path";
import { hasSubstantiveDocContent } from "../../src/documentation-utils.js";
import { statusFromScore, type ScanContext, type CheckResult } from "../../src/types.js";

// Includes are evidence of a reference, never evidence of the referenced body.
// Fenced examples remain local body content, not active include directives.
function localBody(content: string): { body: string; hasIncludes: boolean } {
  // Metadata examples must not change fence/comment state in the visible body.
  const visibleBody = content.replace(/^\uFEFF/, "").trimStart()
    .replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, "");
  const lines: string[] = [];
  let fence: { char: string; length: number } | undefined;
  let inComment = false;
  let hasIncludes = false;
  for (const original of visibleBody.split(/\r?\n/)) {
    let line = original;
    if (!fence) {
      line = "";
      let cursor = 0;
      while (cursor < original.length) {
        if (inComment) {
          const end = original.indexOf("-->", cursor);
          if (end < 0) break;
          inComment = false;
          cursor = end + 3;
        } else {
          const start = original.indexOf("<!--", cursor);
          if (start < 0) {
            line += original.slice(cursor);
            break;
          }
          line += original.slice(cursor, start) + " ";
          inComment = true;
          cursor = start + 4;
        }
      }
    }
    // Recognize examples nested in list/quote containers as visible code too.
    // This is bounded delimiter handling, not a complete Markdown parser.
    const fenceLine = line.replace(/^(?:\s*>\s*)+/, "").trimStart()
      .replace(/^(?:[-+*]|\d+[.)])\s+/, "");
    const marker = fenceLine.match(/^(`{3,}|~{3,})(.*)$/);
    if (marker) {
      const run = marker[1];
      if (!fence) {
        fence = { char: run[0], length: run.length };
        // A comment-like token in fence info is visible code metadata; it
        // must not leave hidden-comment state active after the fence closes.
        inComment = false;
        line = original;
      }
      else if (run[0] === fence.char && run.length >= fence.length && marker[2].trim() === "") fence = undefined;
    } else if (!fence && /^\s*@\S+\s*$/.test(line)) {
      hasIncludes = true;
      continue;
    }
    lines.push(line);
  }
  return { body: lines.join("\n"), hasIncludes };
}

function result(score: number, summary: string, details: string, recommendations: string[], references: string[]): CheckResult {
  return {
    id: "review-md", name: "Review guidance", category: "documentation", tier: "nice-to-have",
    score, status: statusFromScore(score), summary, details, recommendations, references,
    whyThisMatters: "Discoverable review-specific guidance helps reviewers find project priorities, evidence requirements, and exclusions. File presence does not establish provider consumption or review effectiveness.",
  };
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  if (!ctx.files.includes("REVIEW.md")) {
    return result(0, "No REVIEW.md found", "No eligible exact-name REVIEW.md was found at this scan target's root. Descendant files and differently cased names do not contribute.",
      ["If review-specific guidance would help this project, make priorities, evidence requirements, and exclusions discoverable in a root REVIEW.md. This filename is not universally required by review tools."], []);
  }
  let content: string;
  try {
    content = await fs.readFile(path.join(ctx.rootPath, "REVIEW.md"), "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return result(0.1, "Could not read REVIEW.md", `REVIEW.md is discoverable but unreadable: ${message}. This score credits file presence only, not readable instructions.`,
      ["Make REVIEW.md readable during scans so its local guidance can be assessed."], ["REVIEW.md"]);
  }
  const { body, hasIncludes } = localBody(content);
  const substantive = hasSubstantiveDocContent(body);
  const includeNote = hasIncludes ? " Standalone include references were found; referenced content was not expanded, validated, or assessed. Keep canonical rules in their source files." : "";
  return result(substantive ? 1 : 0.4,
    substantive ? "REVIEW.md has substantive local body content" : "REVIEW.md has insufficient local body content",
    "REVIEW.md is readable. Substance uses the shared heuristic: at least 30 characters of normalized non-heading body, excluding frontmatter, hidden HTML comments, and standalone include lines outside fenced examples. Fenced examples count as visible local content. This does not measure completeness, semantic quality, provider activation, or inheritance." + includeNote,
    substantive ? [] : hasIncludes
      ? ["Referenced content was not assessed. Retain canonical rules where they are; add local review priorities or scope context if useful, and check provider-specific include support separately."]
      : ["Add visible review-specific guidance such as priorities, evidence requirements, or exclusions if useful to this project."],
    ["REVIEW.md"]);
}
