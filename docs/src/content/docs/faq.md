---
title: FAQ
description: Frequently asked questions about Harnix usage and capabilities.
---

## Does Harnix require an internet connection?

No. Harnix operates entirely offline. It reads files from the local filesystem and does not make network calls, connect to external APIs, or require authentication tokens. You can run `harnix scan .` on an air-gapped machine, inside a CI container with no outbound access, or on any system with Node.js installed. All checks analyze local repository structure and file contents only.

## Does Harnix support monorepos?

Yes. Harnix automatically detects Git submodules (via `.gitmodules`) and workspace configurations (npm workspaces in `package.json`, Yarn/pnpm `workspace` fields, Nx `nx.json`, Turborepo `turbo.json`, and Lerna `lerna.json`). When submodules or workspaces are found, the `repo-structure` check evaluates organizational quality signals such as source directory presence, root-file ratio, and workspace config coherence. Harnix also performs recursive scans of discovered submodules and workspaces, reporting per-component scores alongside the top-level assessment.

## Can I customize the scoring?

Harnix uses a fixed tier-weighted scoring model where each check has a tier (`critical`, `important`, or `nice-to-have`) with corresponding weights of 3, 2, and 1. The overall score is a weighted average of all evaluated checks. You cannot change tier assignments or weights through configuration.

However, you can influence which checks contribute to the score:

- **Skip checks** that are not relevant to your repository using `--skip <check-id>` or the `skip` key in `.harnix.yaml`. Skipped checks are excluded from the scoring calculation entirely.
- **Run only specific checks** using `--only <check-id>` or the `only` key in `.harnix.yaml`. Only the specified checks are evaluated and scored.
- **Override repository type** using `--type software` or `--type non-software`. Some checks only apply to software repositories (e.g., `ci-pipeline`, `testing-provision`, `repo-structure`), so changing the type affects which checks are included.

See the [Configuration](/configuration/) page for details on `.harnix.yaml` and CLI flag precedence.

## How do I add a custom check?

Each check in Harnix is a self-contained directory under `checks/` with two files:

1. **`meta.yaml`** — Declares the check's ID, name, category, tier, description, tags, and `applicableTo` scope.
2. **`check.ts`** — Exports a default async function that receives a `ScanContext` and returns a `CheckResult`.

To add a new check:

1. Create a directory under `checks/` named with a kebab-case ID (e.g., `checks/my-check/`).
2. Add a `meta.yaml` following the existing checks as a template.
3. Implement your check logic in `check.ts`. The function receives `rootPath`, `files` (array of relative paths), `repoType`, and `gitInfo` in the scan context.
4. Rebuild with `npm run build` and run `harnix scan .` — Harnix auto-discovers the new check from the `checks/` directory.
5. Add tests in `tests/checks/my-check.test.ts` using Vitest and the test fixtures under `tests/fixtures/`.

See the [Contributing](/contributing/) page for code style and testing guidelines.

## What repository types does Harnix detect?

Harnix classifies repositories as either `software` or `non-software`. Detection is automatic: if the repository contains files like `package.json`, `Cargo.toml`, `go.mod`, `pyproject.toml`, `pom.xml`, `build.gradle`, `Makefile`, or source directories (`src/`, `lib/`), it is classified as `software`. All other repositories default to `non-software`.

Three checks (`ci-pipeline`, `testing-provision`, `repo-structure`) only apply to software repositories and are automatically skipped for non-software repos. You can override detection with the `--type` flag or the `type` key in `.harnix.yaml`.

## What output formats does Harnix produce?

Every scan generates three outputs:

1. **Console summary** — printed to the terminal with per-check status symbols (`✓`, `△`, `✗`), scores, and top recommendations.
2. **Markdown report** — a timestamped `.md` file suitable for embedding in pull requests, issues, or documentation.
3. **HTML report** — a self-contained `.html` file with inline styles for browser viewing, no external dependencies required.

Report files are written to the repository root by default, or to a custom directory specified via `--output` or the `output` key in `.harnix.yaml`.
