import { promises as fs, type Stats } from "node:fs";
import path from "node:path";
import { uniqueSorted } from "../../src/documentation-utils.js";
import { isResolvedInsideRoot } from "../../src/scanner.js";
import { statusFromScore, type CheckResult, type ScanContext } from "../../src/types.js";

const ROOT_GUIDANCE = /^(AGENTS\.md|CLAUDE\.md|README\.md|README\.txt|CONTRIBUTING\.md)$/i;
const LINKABLE_SOURCES = /\.(?:md|markdown)$/i;
// Approximates the scanner's built-in noise directory names (src/scanner.ts IGNORED_DIRS);
// the scanner's exact ignore predicates are not exported.
const NOISE = /(^|\/)(?:node_modules|\.git|\.hg|\.svn|\.next|\.venv|venv|__pycache__|\.cache|dist|build)(?:\/|$)/i;
/** Occurrences checked per target; at most this many unique linked Markdown files follow root guidance (documented limit). */
const LIMIT = 5;
const MAX_FINDINGS = 50;
const MAX_REFERENCES = 20;

const DISCLOSURE_ORDER = [
  "external",
  "absolute",
  "harness-import",
  "query",
  "windows-separator",
  "malformed-encoding",
  "fragment-only",
  "empty",
  "out-of-root",
  "noise-excluded",
  "present-unscanned",
  "not-a-file",
  "inaccessible",
] as const;

interface Finding {
  file: string;
  line: number;
  original: string;
  resolved: string;
  reason: string;
}

interface FollowCandidate {
  relative: string;
  real: string;
}

interface State {
  broken: Finding[];
  verifiedDestinations: Set<string>;
  directoryDestinations: Set<string>;
  brokenDestinations: Set<string>;
  disclosed: Map<string, number>;
  followCandidates: FollowCandidate[];
  seenReal: Set<string>;
}

const byText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const byCandidates = (a: FollowCandidate, b: FollowCandidate): number => byText(a.relative, b.relative) || byText(a.real, b.real);

const mask = (text: string): string => text.replace(/[^\n]/g, " ");

/** Mask past an HTML comment on prose lines, preserving offsets; `open` carries multi-line state. */
function maskHtmlComment(line: string, open: { value: boolean }): string {
  if (open.value) {
    const close = line.indexOf("-->");
    if (close < 0) return mask(line);
    open.value = false;
    return mask(line.slice(0, close + 3)) + line.slice(close + 3);
  }
  let result = "";
  let from = 0;
  while (true) {
    const start = line.indexOf("<!--", from);
    if (start < 0) return result + line.slice(from);
    result += line.slice(from, start);
    const close = line.indexOf("-->", start + 4);
    if (close < 0) {
      open.value = true;
      return result + mask(line.slice(start));
    }
    result += mask(line.slice(start, close + 3));
    from = close + 3;
  }
}

/** Mask fenced blocks, inline code, and HTML comments while preserving newlines and offsets.
 * Comments are tracked only on prose lines, so a `<!--` inside a fenced code sample
 * cannot silently disable links in the rest of a file. */
function maskExcluded(content: string): string {
  let fence: string | undefined;
  const commentOpen = { value: false };
  return content
    .split("\n")
    .map((line) => {
      const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (fence) {
        if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
          fence = undefined;
        }
        return mask(line);
      }
      const masked = maskHtmlComment(line, commentOpen);
      const proseMarker = masked.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
      if (proseMarker) {
        fence = proseMarker[1];
        return mask(line);
      }
      return masked.replace(/(`+)([^`]*?)\1/g, (span) => mask(span));
    })
    .join("\n");
}

/** Destination occurrences with their source line, extracted from masked prose only. */
function linkOccurrences(prose: string): Array<{ destination: string; line: number }> {
  const lineStarts: number[] = [0];
  for (let index = prose.indexOf("\n"); index >= 0; index = prose.indexOf("\n", index + 1)) {
    lineStarts.push(index + 1);
  }
  const lineOf = (offset: number): number => {
    let line = lineStarts.length - 1;
    while (line > 0 && lineStarts[line] > offset) line -= 1;
    return line + 1;
  };

  // Whole images are masked first so their inner [text](dest) never reads as a link.
  const text = prose.replace(/!\[[^\]\n]*\](?:\((?:[^()\n\s]|\((?:[^()\n]|\([^()\n]*\))*\))+\)|\[[^\]\n]*\])?/g, (image) => mask(image));

  const occurrences: Array<{ destination: string; line: number }> = [];
  const record = (offset: number, destination: string) => {
    if (destination.length > 0) occurrences.push({ destination: destination.trim(), line: lineOf(offset) });
  };

  // Destination atom: angle-wrapped (allows spaces) or bare with one nesting level of
  // balanced parentheses, per CommonMark's balanced-paren destination rule.
  for (const match of text.matchAll(/(?<!!)\[[^\]\n]*\]\(\s*(<[^>]*>|(?:[^()\s]|\((?:[^()\s]|\([^()\s]*\))*\))+)(?:\s+["'][^\n]*?["'])?\s*\)/g)) {
    record(match.index ?? 0, match[1]);
  }

  const definitions = new Map<string, string>();
  for (const match of text.matchAll(/^ {0,3}\[([^\]\n]+)\]:\s*(?:<([^>\n]*)>|((?:[^()\s\n]|\((?:[^()\s]|\([^()\s]*\))*\))+)).*$/gm)) {
    const id = match[1].trim().toLowerCase();
    if (id.startsWith("^")) continue; // GFM footnote definitions, not links
    const destination = (match[2] ?? match[3] ?? "").trim();
    if (destination.length > 0 && !definitions.has(id)) definitions.set(id, destination);
  }
  const withoutDefinitions = text.replace(/^ {0,3}\[[^\]\n]+\]:.*$/gm, (definition) => mask(definition));
  for (const match of withoutDefinitions.matchAll(/(?<!!)\[([^\]\n]+)\](?:\[([^\]\n]*)\])?(?!\()/g)) {
    const label = (match[2] || match[1]).trim();
    if (label.startsWith("^")) continue; // GFM footnote uses, not links
    const definition = definitions.get(label.toLowerCase());
    // Bracketed text without a definition is formatting, not a link.
    if (definition) record(match.index ?? 0, definition);
  }
  return occurrences;
}

/** Strip fragments, decode, and lexically resolve a destination from a referring file. */
function unmaskDestination(
  raw: string,
  source: string,
  ctx: ScanContext,
): { resolved: string | null; category: string } {
  const wrapped = raw.startsWith("<") && raw.endsWith(">");
  const destination = (wrapped ? raw.slice(1, -1) : raw).trim();
  const hadFragment = destination.includes("#");
  const base = destination.split("#")[0].trim();
  if (base.length === 0) return { resolved: null, category: hadFragment ? "fragment-only" : "empty" };
  let decoded: string;
  try {
    decoded = decodeURIComponent(base);
  } catch {
    return { resolved: null, category: "malformed-encoding" };
  }
  if (decoded.length === 0) return { resolved: null, category: "empty" };
  if (/^[a-z][a-z\d+.-]*:/i.test(decoded)) return { resolved: null, category: "external" };
  if (decoded.startsWith("//") || decoded.startsWith("/") || decoded.startsWith("\\")) {
    return { resolved: null, category: "absolute" };
  }
  if (decoded.startsWith("~") || decoded.startsWith("@")) return { resolved: null, category: "harness-import" };
  if (decoded.includes("?")) return { resolved: null, category: "query" };
  if (decoded.includes("\\")) return { resolved: null, category: "windows-separator" };
  const absolute = path.resolve(ctx.rootPath, path.dirname(source), decoded);
  const relative = path.relative(ctx.rootPath, absolute).split(path.sep).join("/");
  if (relative.length === 0 || relative.startsWith("..") || path.isAbsolute(relative) || relative === "..") {
    return { resolved: null, category: "out-of-root" };
  }
  if (NOISE.test(relative)) return { resolved: null, category: "noise-excluded" };
  return { resolved: relative, category: "in-scope" };
}

/** Nearest existing ancestor probe, so a missing path cannot hide a symlink escape. */
async function realAnchor(rootReal: string, absolute: string): Promise<"inside" | "outside" | "inaccessible"> {
  let probe = absolute;
  while (true) {
    try {
      const stats = await fs.lstat(probe);
      if (stats.isSymbolicLink()) {
        const real = await fs.realpath(probe);
        if (!isResolvedInsideRoot(rootReal, real)) return "outside";
        probe = real;
        continue;
      }
      return isResolvedInsideRoot(rootReal, await fs.realpath(probe)) ? "inside" : "outside";
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === "ENOENT" && path.dirname(probe) !== probe) {
        probe = path.dirname(probe);
        continue;
      }
      return "inaccessible";
    }
  }
}

const bump = (disclosed: Map<string, number>, category: string) => disclosed.set(category, (disclosed.get(category) ?? 0) + 1);

function recordBroken(state: State, source: string, occurrence: { destination: string; line: number }, resolved: string, reason: string): void {
  state.broken.push({ file: source, line: occurrence.line, original: occurrence.destination, resolved, reason });
  state.brokenDestinations.add(resolved);
}

async function resolveDestination(
  ctx: ScanContext,
  rootReal: string,
  inventory: Set<string>,
  source: string,
  occurrence: { destination: string; line: number },
  state: State,
): Promise<void> {
  const unmasked = unmaskDestination(occurrence.destination, source, ctx);
  if (unmasked.resolved === null) {
    bump(state.disclosed, unmasked.category);
    return;
  }
  const resolved = unmasked.resolved;
  const absolute = path.resolve(ctx.rootPath, resolved);
  const anchor = await realAnchor(rootReal, absolute);
  if (anchor === "outside") {
    bump(state.disclosed, "out-of-root");
    return;
  }
  if (anchor === "inaccessible") {
    // Containment or readability could not be established; never reported as missing.
    bump(state.disclosed, "inaccessible");
    return;
  }

  let stats: Stats;
  try {
    stats = await fs.lstat(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
      recordBroken(state, source, occurrence, resolved, "destination not found in the scan root");
    } else {
      bump(state.disclosed, "inaccessible");
    }
    return;
  }

  let target = absolute;
  if (stats.isSymbolicLink()) {
    try {
      target = await fs.realpath(absolute);
    } catch {
      recordBroken(state, source, occurrence, resolved, "destination is a symlink whose target is missing");
      return;
    }
    if (!isResolvedInsideRoot(rootReal, target)) {
      bump(state.disclosed, "out-of-root");
      return;
    }
  }

  let targetStats: Stats;
  try {
    targetStats = await fs.lstat(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
      recordBroken(state, source, occurrence, resolved, "destination is a symlink whose target is missing");
    } else {
      bump(state.disclosed, "inaccessible");
    }
    return;
  }

  if (targetStats.isDirectory()) {
    // Directory links verify only when their subtree holds inventoried files.
    const inhabited = [...inventory].some((file) => file.startsWith(`${resolved}/`));
    if (inhabited) {
      state.verifiedDestinations.add(resolved);
      state.directoryDestinations.add(resolved);
    } else {
      bump(state.disclosed, "present-unscanned");
    }
    return;
  }
  if (!targetStats.isFile()) {
    // FIFOs, sockets, device nodes and other non-regular entries: disclosed, never opened.
    bump(state.disclosed, "not-a-file");
    return;
  }

  // A read handle proves existence and readability without loading large guidance text.
  try {
    const handle = await fs.open(target, "r");
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") {
      recordBroken(state, source, occurrence, resolved, "destination is a symlink whose target is missing");
    } else {
      recordBroken(state, source, occurrence, resolved, "destination exists but is not readable");
    }
    return;
  }

  // Present but outside the inventory are ignored, generated, or symlink-aliased
  // paths: disclosed, never missing. The scanner does not inventory symlinks.
  if (!inventory.has(resolved)) {
    bump(state.disclosed, "present-unscanned");
    return;
  }
  state.verifiedDestinations.add(resolved);
  if (!LINKABLE_SOURCES.test(resolved)) return;
  try {
    const real = await fs.realpath(target);
    if (!state.seenReal.has(real)) state.followCandidates.push({ relative: resolved, real });
  } catch {
    // nowhere for traversal to continue; the destination is still verified.
  }
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const base = {
    id: "guidance-links",
    name: "Guidance links",
    category: "documentation",
    tier: "important" as const,
    whyThisMatters:
      "Agents and humans follow links in operating guidance to set up, build, and verify work; a broken local reference sends them to a path that does not exist. This check verifies local reference integrity only, not whether the linked guidance is correct or current.",
  };
  const notAssessed = (reason: string, disclosures?: string[]): CheckResult => ({
    ...base,
    score: 0,
    status: "not-assessed",
    summary: `Not assessed: ${reason}`,
    details: [reason, ...(disclosures ?? []), "No local destination was verified, and no command was executed."].join("\n"),
    recommendations: [],
    references: [],
  });

  const disclosureEntries = (state: State): string[] =>
    DISCLOSURE_ORDER
      .filter((category) => (state.disclosed.get(category) ?? 0) > 0)
      .map((category) => `${category}: ${state.disclosed.get(category)}`);

  const inventory = new Set(ctx.files.map((file) => file.replace(/\\/g, "/")));
  let rootReal: string;
  try {
    rootReal = await fs.realpath(ctx.rootPath);
  } catch {
    return notAssessed("scan root is unreadable");
  }

  const rootSources = [...inventory].filter((file) => ROOT_GUIDANCE.test(file)).sort(byText);
  if (rootSources.length === 0) return notAssessed("no root operating guidance in inventory");

  const state: State = {
    broken: [],
    verifiedDestinations: new Set(),
    directoryDestinations: new Set(),
    brokenDestinations: new Set(),
    disclosed: new Map(),
    followCandidates: [],
    seenReal: new Set([rootReal]),
  };

  const sourceContents = new Map<string, string>();
  const unreadableSources: string[] = [];
  const ingest = async (relative: string): Promise<boolean> => {
    try {
      const real = await fs.realpath(path.resolve(ctx.rootPath, relative));
      if (!isResolvedInsideRoot(rootReal, real) || state.seenReal.has(real)) return false;
      state.seenReal.add(real);
      sourceContents.set(relative, await fs.readFile(real, "utf8"));
      return true;
    } catch {
      unreadableSources.push(relative);
      return true;
    }
  };
  for (const file of rootSources) await ingest(file);
  if (sourceContents.size === 0) return notAssessed("no readable root operating guidance");

  let rootOccurrences = 0;
  for (const [source, content] of sourceContents) {
    for (const occurrence of linkOccurrences(maskExcluded(content))) {
      rootOccurrences += 1;
      await resolveDestination(ctx, rootReal, inventory, source, occurrence, state);
    }
  }

  // One hop into linked Markdown guidance; candidates surfaced while resolving
  // followed sources are never followed. Deterministic: candidates sorted, limit enforced.
  const followQueue = state.followCandidates.slice().sort(byCandidates);
  state.followCandidates = [];
  const followSeen = new Set(state.seenReal);
  const followedFiles: string[] = [];
  let followQueueExhausted = false;
  for (const candidate of followQueue) {
    if (followSeen.has(candidate.real)) continue;
    followSeen.add(candidate.real);
    if (followedFiles.length >= LIMIT) {
      followQueueExhausted = true;
      continue;
    }
    try {
      sourceContents.set(candidate.relative, await fs.readFile(candidate.real, "utf8"));
      followedFiles.push(candidate.relative);
    } catch {
      if (!unreadableSources.includes(candidate.relative)) unreadableSources.push(candidate.relative);
    }
  }
  const truncated = followQueueExhausted && followedFiles.length >= LIMIT;

  let followedOccurrences = 0;
  for (const source of followedFiles) {
    for (const occurrence of linkOccurrences(maskExcluded(sourceContents.get(source) ?? ""))) {
      followedOccurrences += 1;
      await resolveDestination(ctx, rootReal, inventory, source, occurrence, state);
    }
  }

  const uniqueVerified = state.verifiedDestinations.size;
  const uniqueBroken = state.brokenDestinations.size;
  const assessed = uniqueVerified + uniqueBroken;
  const occurrences = rootOccurrences + followedOccurrences;
  if (assessed === 0) {
    const entries = disclosureEntries(state);
    const inline = entries.length > 0 ? ` (${entries.join("; ")})` : "";
    return notAssessed(
      occurrences > 0
        ? `destination occurrences are outside local-file scope${inline}`
        : "no relative local file destinations in guidance",
      occurrences > 0 && entries.length > 0
        ? [`Excluded from assessment, not reported as missing: ${entries.join("; ")}.`]
        : undefined,
    );
  }

  const broken = state.broken.slice().sort(
    (a, b) => byText(a.file, b.file) || a.line - b.line || byText(a.original, b.original) || byText(a.resolved, b.resolved),
  );
  const truncatedFindings = broken.length > MAX_FINDINGS;
  const visibleFindings = broken.slice(0, MAX_FINDINGS);
  const score = uniqueVerified / assessed;
  const verbatimFiles = uniqueSorted([...rootSources, ...followedFiles]).sort(byText);
  const entries = disclosureEntries(state);
  const disclosureText = entries.length > 0 ? `Excluded from assessment, not reported as missing: ${entries.join("; ")}.` : "Excluded from assessment: none.";
  const recommendationTargets = [...state.brokenDestinations].sort(byText);
  const recommendations = recommendationTargets.slice(0, MAX_FINDINGS).map((resolved) => {    const first = broken.find((finding) => finding.resolved === resolved);
    return first
      ? `Repair or remove the local link in ${first.file} at line ${first.line}: "${first.original}" points to ${first.resolved}.`
      : `Repair or remove the local link that points to ${resolved}.`;
  });
  if (recommendationTargets.length > recommendations.length) {
    recommendations.push(`${recommendationTargets.length - recommendations.length} more broken destination(s) omitted; see the broken reference list above.`);
  }

  return {
    ...base,
    score,
    status: statusFromScore(score),
    summary: assessed > 0 && uniqueBroken > 0
      ? `Local links: ${uniqueBroken} of ${assessed} in-scope destination(s) broken across ${broken.length} reference(s)`
      : `Local links: ${assessed} in-scope destination(s) verified, none broken`,
    details: [
      `Sources: ${verbatimFiles.join(", ") || "none"}; unreadable: ${unreadableSources.sort(byText).join(", ") || "none"}.`,
      `Traversal: one hop from root guidance into linked Markdown; at most ${LIMIT} unique linked files (${followedFiles.length} followed)${truncated ? "; additional eligible linked files omitted" : ""}.`,
      `Destination occurrences classified: ${occurrences} (${rootOccurrences} root, ${followedOccurrences} linked).`,
      `In-scope destinations: ${assessed} unique (${uniqueVerified} verified incl. ${state.directoryDestinations.size} directory, ${uniqueBroken} broken).`,
      entries.length > 0 ? disclosureText : "Excluded from assessment: none.",
      broken.length > 0
        ? `Broken local references${truncatedFindings ? ` (first ${visibleFindings.length} of ${broken.length})` : ""}:`
        : "No broken local references found.",
      ...visibleFindings.map((finding) =>
        `- ${finding.file}:${finding.line} — "${finding.original}" resolves to ${finding.resolved} — ${finding.reason}.`,
      ),
      "Local reference integrity only; fragments, heading anchors, external URLs, and linked commands were not validated.",
    ].join("\n"),
    recommendations,
    references: verbatimFiles.slice(0, MAX_REFERENCES),
  };
}
