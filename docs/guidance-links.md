# Guidance link integrity

The `guidance-links` check is an important-tier local heuristic, introduced in Harnix 0.24.0 and applicable to software and non-software targets alike. It detects broken local file references in operating guidance and reports each with source file, line number, original destination, resolved relative path, and reason. It never validates external URLs, heading anchors, or semantic correctness, never executes commands, and never accesses the network. Existing `agents-md`, `root-readme`, and `documentation` scores are unchanged: those checks measure guidance presence and substance, while this one verifies that local references inside that guidance resolve.

## Sources and traversal

Entry points are root `AGENTS.md`, `CLAUDE.md`, `README.md`, `README.txt`, and `CONTRIBUTING.md`, case-insensitive, taken from the target's scan inventory. `README.txt` contributes when it contains Markdown links. No manifest (`package.json` or otherwise) is required, so child directories that are their own scan targets are checked with their own entry points.

Relative Markdown links from the entry points are followed one hop only: a destination that exists, stays inside the target, passes inventory eligibility, and uses `.md` or `.markdown` becomes a further source whose links are also checked. At most five unique linked files follow the entry points per target, chosen by a lexical sort of destination paths and deduplicated by realpath; truncation is disclosed in the details. Links found in a followed page are checked, but candidates they surface are never followed. A second hop therefore never happens even with `--depth 0`.

## Link syntax handled

- Inline links `[text](destination)` and reference-style uses `[text][id]` or `[text]` paired with `[id]: destination` definitions, including angle-bracket destinations `<destination>` and one nesting level of balanced parentheses (`docs/report(1).md`).
- Destinations resolved relative to the referring file's directory, with optional `#fragment` (stripped, not validated) and URL-encoded characters (`%6F`).
- Deliberately not a full Markdown parser: multi-line link text, nested brackets beyond one parenthesis level, destinations split across lines, and bare destinations containing spaces (without angle brackets) are outside scope. Links in fenced blocks, inline code, and HTML comments are ignored; links written inside four-space/tab indented code blocks are treated as prose and may be reported, a documented approximation.

## Scoring

If the target has no local guidance sources, or the readable sources contain no relative local file destinations, the check is `not-assessed` (N/A): zero weight, a reason in summary and details, and no recommendations. This keeps it from double-penalizing guidance-presence checks.

Otherwise the score is the share of unique in-scope destinations verified:

| Bucket | Meaning |
|---|---|
| Verified | Present and readable; directory destinations verify when their subtree holds inventoried files |
| Broken | Definitely missing (`ENOENT`, including broken symlink targets), or present but not readable |

Score = verified / (verified + broken), with the standard pass/partial/fail status thresholds. The denominator deduplicates by resolved destination, so repeated references to the same broken path report once; every source occurrence still appears with its line. Broken references produce one recommendation per unique destination, capped at fifty recommended destinations with an omission note.

## Excluded categories (disclosed, never "missing")

Destinations are classified per occurrence deterministically. Categories below are counted in the check details and never reported as broken:

- External URLs (`https://…`, `mailto:…`)
- Absolute paths (`/docs/x.md`, protocol-relative `//…`), query strings (`?`), and backslashes
- Harness imports: `@…` and `~…` destinations
- Fragment-only links (`#anchor`) and GitHub-flavored footnotes (`[^1]`, `[^1]: prose`)
- Malformed percent-encodings
- Lexically out-of-root paths (`../` beyond the target) and symlink escapes (the nearest existing ancestor resolves outside the target)
- Noise paths: a leading directory segment matching the scanner's ignored directory names (such as `node_modules/…` and `dist/…`, case-sensitive, mirroring its walk rules); files and final segments with those names, like a root `build` script or `Build/guide.md`, stay assessable
- Present-but-unscanned paths: the destination exists but is not in the scan inventory (gitignored, generated, or symlink-aliased content; the scanner does not inventory symlinks), so existence is confirmed while the path stays outside assessment; directory links verify only when their subtree holds inventoried files, and uninhabited directories are disclosed the same way
- Non-regular destinations such as FIFOs and sockets (`not-a-file`), which are never opened
- Inaccessible paths where containment or readability could not be established

## Reports

Findings render as `- <source>:<line> — "<original>" resolves to <resolved> — <reason>.` with deterministic ordering by source path, then line, then destination. They appear in console verbose output (root checks and, since 0.24.0, per-target details in the recursive breakdown), Markdown and HTML detailed findings including per-target sections, and the versioned JSON report's `details`. Compare scores only for the same Harnix version and effective check set: a new catalog entry changes aggregates without repository changes.
