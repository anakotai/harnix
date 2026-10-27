# Operating command discoverability

The `operating-commands` check is an important-tier, software-only local heuristic introduced in Harnix 0.22.0. It detects concrete command examples in guidance; it never executes them, fetches linked content, or claims they work. Existing guidance, README, and testing-provision scores are unchanged: those checks measure guidance structure, broad onboarding signals, and testing provisions respectively.

## Applicability and scoring

V1 supports scan targets with their own inventory-eligible, readable JSON-object `package.json`. A nested package does not establish support for its parent. Other ecosystems, missing or malformed manifests, and unreadable manifests are undetermined and receive `not-assessed` (N/A), excluded from scoring.

Supported categories are equally weighted when applicable:

| Category | Applicability | Example |
|---|---|---|
| Setup | Nonempty dependencies, devDependencies, or optionalDependencies | `npm ci` |
| Verification | Nonempty test script or local test suite | `npm test` |
| Build | Nonempty build script | `npm run build` |
| Run | Nonempty start or dev script | `npm run dev` |

Local test suites use JS/TS `.test` or `.spec` filenames, or files under `test/`, `tests/`, or `__tests__/`; nested packages, vendored trees, and noise do not establish a local suite. With no applicable categories the check is not assessed. Missing examples score zero only in applicable categories. Unsupported categories are not negative evidence. Overall and category scores exclude not-assessed checks; a run with no evaluated checks has an unavailable local score and warns that nothing was evaluated. The numeric overallScore compatibility alias remains zero when no local or rollup score is available.

## Recognized command patterns

Only fenced code and inline backtick code count, including in README.txt. Keyword-only prose and HTML comments do not count. Commands must start a code line or a simple `&&`, `||`, or `;` segment; an optional `$` prompt is supported.

- Setup: `npm install`, `npm i`, `npm ci`, `pnpm install`, `pnpm i`, `yarn`, `yarn install`, `bun install`, `bun i`. Package operands and global installs do not count as repository setup.
- Verification: `npm test`, or `npm run test`; pnpm/yarn/Bun accept `test` with or without `run`.
- Build: `npm run build`; pnpm/yarn/Bun accept `build` with or without `run`.
- Run: `npm start`, `npm run start`, `npm run dev`; pnpm/yarn/Bun accept `start` or `dev` with or without `run`.

Simple trailing option flags are supported. Script arguments after `--` may be present. Angle-bracket, brace, environment-variable, TODO/CHANGEME, and ellipsis placeholders cause that command segment to be ignored. This intentionally bounded recognizer is not a shell or Markdown parser: wrappers, environment assignments, indented code blocks, quoted executables, options before the subcommand, direct tool invocations, and arbitrary script names may be missed. Working-directory changes are not tracked, so commands intended for another subproject may count. Script references are not validated against the manifest; an example's presence does not prove it is usable or current.

## Guidance traversal

Entry points are root AGENTS.md, CLAUDE.md, README.md, README.txt, and CONTRIBUTING.md (case insensitive). Relative Markdown links from those entry points are followed one hop only, resolving from the referring file and stripping fragments. Inline and reference-style links are supported; images, external URLs, absolute paths, query strings, and harness `@imports` are excluded. Linked pages may use `.md` or `.markdown`.

Candidate paths are sorted lexically, deduplicated by realpath, and limited to five unique linked files, excluding already-read entry points. Both the link path and resolved target must remain inside the scan root and pass inventory/noise eligibility. Standard generated/dependency/VCS directories and vendored trees are excluded. Unreadable eligible targets are disclosed and consume a traversal slot; invalid or out-of-bounds links are not a broken-link lint finding. Reports disclose the one-hop/five-file limits, truncation, read failures, sources read, and found/missing categories.

Keep exact examples in canonical guidance such as CONTRIBUTING.md or a linked testing page. Duplication in AGENTS.md is unnecessary. Compare scores only for the same Harnix version and effective check set: a new catalog entry can change an aggregate without repository changes.
