import { promises as fs } from "node:fs";
import path from "node:path";
import { isResolvedInsideRoot } from "../../src/scanner.js";
import { statusFromScore, type CheckResult, type ScanContext } from "../../src/types.js";

type Category = "setup" | "verification" | "build" | "run";
const CATEGORIES: Category[] = ["setup", "verification", "build", "run"];
const ROOT_GUIDANCE = /^(AGENTS\.md|CLAUDE\.md|README\.md|README\.txt|CONTRIBUTING\.md)$/i;
const NOISE = /(^|\/)(node_modules|vendor|third_party|third-party|\.git|\.next|dist|build)(\/|$)/i;
const LIMIT = 5;

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

/** Bounded Markdown extraction, deliberately not general shell parsing. */
function codeAndProse(content: string): { code: string[]; prose: string } {
  const code: string[] = [];
  const prose: string[] = [];
  let fence: string | undefined;
  for (const line of content.replace(/<!--[\s\S]*?(?:-->|$)/g, "").split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = undefined;
      } else code.push(line);
    } else if (marker) {
      fence = marker[1];
    } else {
      prose.push(line.replace(/(`+)([^`]*?)\1/g, (_match, _ticks, body: string) => {
        code.push(body);
        return "";
      }));
    }
  }
  return { code, prose: prose.join("\n") };
}

function commands(code: string[]): Set<Category> {
  const found = new Set<Category>();
  for (const line of code) {
    for (const segment of line.replace(/(^|\s)#.*$/, "").split(/&&|\|\||;/)) {
      const command = segment.trim().replace(/^\$\s+/, "").replace(/\s+#.*$/, "");
      if (/[<>{}$]|\.\.\.|…|\b(TODO|CHANGEME)\b/i.test(command)) continue;
      const tokens = command.split(/\s+/);
      const manager = tokens.shift();
      if (!manager || !["npm", "pnpm", "yarn", "bun"].includes(manager)) continue;
      let action = tokens.shift();
      if (manager === "yarn" && action?.startsWith("-")) {
        tokens.unshift(action);
        action = undefined;
      }
      const explicitRun = action === "run";
      if (explicitRun) action = tokens.shift();
      // Only standalone flags (and arguments after --) are understood.
      const delimiter = tokens.indexOf("--");
      const flags = delimiter < 0 ? tokens : tokens.slice(0, delimiter);
      if (flags.some((token) => !/^--?[a-zA-Z][\w-]*(?:=[\w./-]+)?$/.test(token))) continue;
      if (!explicitRun && (action === "install" || action === "i" || (manager === "npm" && action === "ci") || (manager === "yarn" && !action))) {
        if (!tokens.some((token) => /^(?:-g|--global)(?:=|$)/.test(token)) && delimiter < 0) found.add("setup");
        continue;
      }
      if (manager === "npm" && !explicitRun && action !== "test" && action !== "start") continue;
      if (action === "test") found.add("verification");
      if (action === "build") found.add("build");
      if (action === "start" || action === "dev") found.add("run");
    }
  }
  return found;
}

function links(prose: string): string[] {
  // Remove whole images before matching references, including the second [id].
  prose = prose.replace(/!\[[^\]\n]*\](?:\([^\n)]*\)|\[[^\]\n]*\])?/g, "");
  const destinations = Array.from(prose.matchAll(/(?<!!)\[[^\]\n]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^\n]*?["'])?\s*\)/g), (match) => match[1]);
  const definitions = new Map(Array.from(prose.matchAll(/^ {0,3}\[([^\]\n]+)\]:\s*(<[^>]+>|[^\s]+).*$/gm), (match) => [match[1].trim().toLowerCase(), match[2]]));
  const withoutDefinitions = prose.replace(/^ {0,3}\[[^\]\n]+\]:.*$/gm, "");
  for (const match of withoutDefinitions.matchAll(/(?<!!)\[([^\]\n]+)\](?:\[([^\]\n]*)\])?(?!\()/g)) {
    const target = definitions.get((match[2] || match[1]).trim().toLowerCase());
    if (target) destinations.push(target);
  }
  return destinations;
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const base = {
    id: "operating-commands", name: "Operating commands", category: "agent-readiness",
    tier: "important" as const,
    whyThisMatters: "Concrete command examples help contributors and agents discover how to set up and verify changes without guessing.",
  };
  const notAssessed = (reason: string): CheckResult => ({
    ...base, score: 0, status: "not-assessed", summary: `Not assessed: ${reason}`,
    details: `${reason}. V1 supports only targets with their own readable package.json; no command was executed.`,
    recommendations: [], references: [],
  });
  const inventory = new Set(ctx.files.map((file) => file.replace(/\\/g, "/")));
  const eligible = (file: string) => inventory.has(file) && !NOISE.test(file);
  let rootReal: string;
  try { rootReal = await fs.realpath(ctx.rootPath); } catch { return notAssessed("scan root is unreadable"); }
  // Check lexical inventory membership AND the canonical target's eligibility.
  async function resolve(file: string): Promise<string | null> {
    if (!eligible(file)) return null;
    const absolute = path.resolve(ctx.rootPath, file);
    if (!isResolvedInsideRoot(ctx.rootPath, absolute)) return null;
    const real = await fs.realpath(absolute);
    if (!isResolvedInsideRoot(rootReal, real)) return null;
    const canonical = path.relative(rootReal, real).split(path.sep).join("/");
    return eligible(canonical) ? real : null;
  }
  if (ctx.repoType !== "software" || !eligible("package.json")) return notAssessed("unsupported ecosystem or no root package.json");
  let manifest: Record<string, unknown>;
  try {
    const real = await resolve("package.json");
    if (!real) return notAssessed("package.json is outside eligible inventory");
    const parsed: unknown = JSON.parse(await fs.readFile(real, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return notAssessed("package.json is not a JSON object");
    manifest = object(parsed);
  } catch { return notAssessed("package.json is unreadable or invalid JSON"); }
  const scripts = object(manifest.scripts);
  const script = (name: string) => typeof scripts[name] === "string" && (scripts[name] as string).trim().length > 0;
  const packageDirs = [...inventory].filter((file) => file.endsWith("/package.json")).map((file) => path.posix.dirname(file));
  const hasTests = [...inventory].some((file) => !NOISE.test(file) && !packageDirs.some((dir) => file.startsWith(`${dir}/`)) &&
    (/(^|\/)(__tests__)\//.test(file) || /^(tests?|__tests__)\//.test(file) || /\.(test|spec)\.[cm]?[jt]sx?$/.test(file)));
  const applicable: Record<Category, boolean> = {
    setup: ["dependencies", "devDependencies", "optionalDependencies"].some((key) => Object.keys(object(manifest[key])).length > 0),
    verification: script("test") || hasTests,
    build: script("build"), run: script("start") || script("dev"),
  };
  const expected = CATEGORIES.filter((category) => applicable[category]);
  if (!expected.length) return notAssessed("no applicable supported command categories");

  const sources = new Map<string, string>();
  const seen = new Set<string>();
  const unreadable: string[] = [];
  async function read(file: string): Promise<boolean> {
    try {
      const real = await resolve(file);
      if (!real || seen.has(real)) return false;
      seen.add(real);
      sources.set(file, await fs.readFile(real, "utf8"));
      return true;
    } catch { unreadable.push(file); return true; }
  }
  const roots = [...inventory].filter((file) => ROOT_GUIDANCE.test(file)).sort();
  for (const file of roots) await read(file);
  const candidates = new Set<string>();
  for (const file of roots) {
    const content = sources.get(file);
    if (content === undefined) continue;
    for (let destination of links(codeAndProse(content).prose)) {
      destination = destination.replace(/^<|>$/g, "").split("#")[0];
      try { destination = decodeURIComponent(destination); } catch { continue; }
      if (!destination || /^(?:[a-z][a-z\d+.-]*:|[/\\@])/i.test(destination) || /[?\\]/.test(destination) || !/\.(md|markdown)$/i.test(destination)) continue;
      const absolute = path.resolve(ctx.rootPath, path.dirname(file), destination);
      if (!isResolvedInsideRoot(ctx.rootPath, absolute)) continue;
      const relative = path.relative(ctx.rootPath, absolute).split(path.sep).join("/");
      if (eligible(relative)) candidates.add(relative);
    }
  }
  let followed = 0;
  let truncated = false;
  for (const file of [...candidates].sort()) {
    try {
      const real = await resolve(file);
      if (!real || seen.has(real)) continue;
    } catch { /* An eligible unreadable target still consumes a slot. */ }
    if (followed >= LIMIT) { truncated = true; break; }
    if (await read(file)) followed += 1;
  }
  const evidence = new Map<Category, string[]>(CATEGORIES.map((category) => [category, []]));
  for (const [file, content] of sources) {
    for (const category of commands(codeAndProse(content).code)) evidence.get(category)!.push(file);
  }
  const found = expected.filter((category) => evidence.get(category)!.length > 0);
  const missing = expected.filter((category) => !found.includes(category));
  const score = found.length / expected.length;
  return {
    ...base, score, status: statusFromScore(score),
    summary: `Command examples: ${found.length}/${expected.length} applicable categories found`,
    details: [
      `Applicable: ${expected.join(", ")}. Found: ${found.join(", ") || "none"}. Missing: ${missing.join(", ") || "none"}.`,
      ...found.map((category) => `${category}: ${evidence.get(category)!.join(", ")}.`),
      `Sources read: ${[...sources.keys()].join(", ") || "none"}.`,
      `Traversal: one hop from root guidance; at most five unique linked files (${followed} followed)${truncated ? "; additional eligible links omitted" : ""}.`,
      `Unreadable guidance: ${unreadable.join(", ") || "none"}.`,
      "Only supported examples in fenced/inline code count. Commands were not executed or validated.",
    ].join("\n"),
    recommendations: missing.map((category) => `Document an exact ${category} command example in canonical guidance (CONTRIBUTING.md or a linked Markdown page); no duplication in AGENTS.md is required.`),
    references: [...sources.keys()],
  };
}
