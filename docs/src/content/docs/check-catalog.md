---
title: Check Catalog
description: Current Harnix checks, IDs, tiers, and applicability.
---

## Active checks

| Check ID | Name | Category | Tier | Applies to |
|---|---|---|---|---|
| `agents-md` | Agent guidance | `agent-readiness` | `critical` | `all` |
| `documentation` | Documentation | `documentation` | `critical` | `all` |
| `ci-pipeline` | CI pipeline | `quality-gates` | `important` | `software` |
| `testing-provision` | Testing provision | `quality-gates` | `important` | `software` |

## Check details

### `agents-md`

- Detects root-level `AGENTS.md` or `CLAUDE.md`
- Evaluates presence and guidance depth
- Recommends improvements when guidance is missing or too brief

### `documentation`

- Requires a root `README.md`
- Looks for durable docs structure such as `docs/` or `prds/`
- Scores readability and documentation coverage signals

### `ci-pipeline`

- Detects CI markers such as GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis CI, and Azure Pipelines
- Returns pass when a CI system is detected

### `testing-provision`

- Looks for runnable test signals and common test framework patterns
- Surfaces remediation guidance when testing coverage appears weak or missing

## Filter by check ID

Use check IDs with CLI flags:

```bash
harnix scan . --only agents-md
harnix scan . --skip ci-pipeline
```
