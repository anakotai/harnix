---
title: Contributing
description: How to contribute checks, docs, and fixes to Harnix.
---

## Ways to contribute

- Improve existing checks and recommendations
- Add or refine report output
- Expand documentation and examples
- Report issues and propose feature requests

## Local development

```bash
git clone https://github.com/anakotai/harnix.git
cd harnix
pnpm install
```

Run the CLI against a target repository:

```bash
node bin/harnix.js scan .
```

Run docs locally:

```bash
cd docs
pnpm install
pnpm run dev
```

## Running tests

Harnix uses [Vitest](https://vitest.dev/) for testing. Run the full test suite with:

```bash
pnpm test
```

Tests live in `tests/` and use fixture repositories under `tests/fixtures/` that simulate repos with various check conditions (pass, partial, fail). When adding or modifying a check, add corresponding tests in `tests/checks/<check-id>.test.ts` with at least three test cases covering pass, fail, and partial/edge scenarios.

## Adding a new check

1. Create `checks/<check-id>/meta.yaml` with required fields: `id`, `name`, `category`, `tier`, `description`, `tags`, `applicableTo`
2. Create `checks/<check-id>/check.ts` exporting a default async function that receives a `ScanContext` and returns a `CheckResult`
3. Rebuild with `pnpm run build` and verify the check is discovered by running `harnix scan .`
4. Add tests in `tests/checks/<check-id>.test.ts`

Checks may return `status: "not-assessed"` with a placeholder score of `0` when there are no applicable supported categories. Give a clear reason and avoid missing-evidence recommendations; these results display as N/A and are excluded from aggregate/category scores and evaluated counts. Keep existing check behavior stable. For command discovery, test prose versus code, canonical guidance, bounded links, inventory/noise eligibility, symlink containment, read failures, and unsupported/no-category targets. Never execute example commands during a scan.

## Contribution quality bar

- Keep changes focused and testable
- Update docs when behavior changes
- Prefer explicit check IDs and deterministic output wording
- Avoid network dependencies in scan execution
- Follow [Conventional Commits](https://www.conventionalcommits.org/) format for commit messages (e.g., `feat:`, `fix:`, `docs:`, `chore:`)
