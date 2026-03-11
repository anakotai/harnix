---
title: Check Catalog
description: Complete catalog of all 7 MVP checks — IDs, tiers, scoring, and what each check evaluates.
---

Harnix ships with 7 built-in checks grouped into 6 categories. Each check produces a score between 0 and 1.0, which is then weighted by its tier during overall scoring. The table below summarizes every check; detailed descriptions and scoring rules follow.

## Active checks

| Name | Check ID | Category | Tier | Applies to |
|---|---|---|---|---|
| [Agents guidance](#agents-guidance) | `agents-md` | <span class="check-badge check-badge--category">agent-readiness</span> | <span class="check-badge check-badge--tier">critical</span> | <span class="check-badge check-badge--scope">all</span> |
| [Agent skills](#agent-skills) | `agent-skills` | <span class="check-badge check-badge--category">agent-readiness</span> | <span class="check-badge check-badge--tier">important</span> | <span class="check-badge check-badge--scope">all</span> |
| [CI pipeline](#ci-pipeline) | `ci-pipeline` | <span class="check-badge check-badge--category">quality-gates</span> | <span class="check-badge check-badge--tier">important</span> | <span class="check-badge check-badge--scope">software</span> |
| [Documentation](#documentation) | `documentation` | <span class="check-badge check-badge--category">documentation</span> | <span class="check-badge check-badge--tier">critical</span> | <span class="check-badge check-badge--scope">all</span> |
| [Repo structure](#repo-structure) | `repo-structure` | <span class="check-badge check-badge--category">infrastructure</span> | <span class="check-badge check-badge--tier">important</span> | <span class="check-badge check-badge--scope">software</span> |
| [Source of truth](#source-of-truth) | `source-of-truth` | <span class="check-badge check-badge--category">organization</span> | <span class="check-badge check-badge--tier">important</span> | <span class="check-badge check-badge--scope">all</span> |
| [Testing provision](#testing-provision) | `testing-provision` | <span class="check-badge check-badge--category">quality</span> | <span class="check-badge check-badge--tier">important</span> | <span class="check-badge check-badge--scope">software</span> |

## Check details

### Agents guidance

<div class="check-detail-meta">
  <span class="check-badge check-badge--category">agent-readiness</span>
  <span class="check-badge check-badge--tier">critical</span>
  <span class="check-badge check-badge--scope">all repositories</span>
</div>

Detects whether the repository provides agent guidance via a root-level `AGENTS.md` or `CLAUDE.md` file. The file should contain repo-specific constraints, non-obvious gotchas, paths or conventions that agents would otherwise miss.

#### What it checks

- Presence of `AGENTS.md` or `CLAUDE.md` at the repository root
- Content length and substance of the guidance file

#### Scoring

| Condition | Score |
|---|---|
| No AGENTS found | 0 |
| Suspiciously empty file (0 chars) | 0.2 |
| Suspiciously long file (10,000+ chars) | 0.2 |
| File is getting long (5,000 ~ 10,000 chars) | 0.4 |
| File is getting short (less than 120 chars) | 0.4 |
| File is a bit long, but still fine (3,000 ~ 5,000 chars) | 0.6 |
| File is a bit brief, but still fine (120 ~ 1,000 chars) | 0.8 |
| File has substantive content and not too long (1,000 ~ 3,000 chars) | 1.0 |

### Agent skills

<div class="check-detail-meta">
  <span class="check-badge check-badge--category">agent-readiness</span>
  <span class="check-badge check-badge--tier">important</span>
  <span class="check-badge check-badge--scope">all repositories</span>
</div>

Detects skills in supported roots and validates that each skill conforms to the Agent Skills specification. Skills must contain a `SKILL.md` file with proper frontmatter and body content. Hidden Markdown comments in `SKILL.md` are flagged as a security risk because they are not visibly rendered to the reader.

#### What it checks

- Presence of skill roots (`skills/`, `.skills/`, `.claude/skills/`, `.codex/skills/`, `.agent/skills/`, `.github/skills/`)
- Each skill has a valid `SKILL.md` with frontmatter and body content
- Subdirectories are restricted to `scripts/`, `references/`, and `assets/`
- Hidden Markdown comments in `SKILL.md` outside fenced code blocks (flagged as security risk)

#### Scoring

| Condition | Score |
|---|---|
| No skill directories found | 0 |
| Skills found with mixed compliance and no security flags | 0.5–0.8 |
| All skills compliant, no hidden Markdown comments | 1.0 |
| Hidden Markdown comments detected | Penalty applied (reduces score) |

The score is 0 when no skill directories are found, and ranges from 0.2 to 1.0 based on the ratio of compliant skills and the absence of security violations.

### CI pipeline

<div class="check-detail-meta">
  <span class="check-badge check-badge--category">quality-gates</span>
  <span class="check-badge check-badge--tier">important</span>
  <span class="check-badge check-badge--scope">software repositories</span>
</div>

Detects whether the repository has a CI/CD pipeline configured. Supports GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis CI, and Azure Pipelines.

#### What it checks

- Presence of CI configuration files or directories (e.g., `.github/workflows/`, `.gitlab-ci.yml`, `.circleci/`, `Jenkinsfile`, `.travis.yml`, `azure-pipelines.yml`)

#### Scoring

| Condition | Score |
|---|---|
| No CI configuration detected | 0 |
| At least one CI system detected | 1.0 |

### Documentation

<div class="check-detail-meta">
  <span class="check-badge check-badge--category">documentation</span>
  <span class="check-badge check-badge--tier">critical</span>
  <span class="check-badge check-badge--scope">all repositories</span>
</div>

Checks for a substantive `README.md` and supporting documentation directories. Repositories with both a well-written README and a durable docs structure score highest.

#### What it checks

- Presence and length of `README.md` at the repository root
- Presence of documentation directories (`docs/` or `prds/`)

#### Scoring

| Condition | Score |
|---|---|
| No README found | 0.2 |
| Brief README (< 120 characters) | 0.3 base |
| Substantive README (≥ 120 characters) | 0.6 base |
| `docs/` or `prds/` directory exists | +0.4 bonus |

The base and bonus are summed, capped at 1.0.

### Repo structure

<div class="check-detail-meta">
  <span class="check-badge check-badge--category">infrastructure</span>
  <span class="check-badge check-badge--tier">important</span>
  <span class="check-badge check-badge--scope">software repositories</span>
</div>

Evaluates the repository's source code organization, separation of concerns, and monorepo tooling. Well-structured repositories keep root clutter low, organize source code in dedicated directories, and configure workspaces when using submodules.

#### What it checks

- Source code directories (`src/`, `lib/`, `packages/`, `apps/`, `modules/`, `crates/`)
- Root file ratio (percentage of files at the repository root vs. subdirectories)
- Monorepo signals (`.gitmodules`, workspace configurations in `package.json`, `pnpm-workspace.yaml`, etc.)
- Presence of any meaningful subdirectory structure

#### Scoring

| Component | Points |
|---|---|
| Source code directories detected | +0.35 |
| Root file ratio < 30% | +0.25 |
| Root file ratio 30–50% | +0.15 |
| Monorepo tooling with workspace config | +0.25 |
| Submodules without workspace config | +0.15 |
| Any subdirectories exist | +0.15 |

Components are summed for a maximum score of 1.0.

### Source of truth

<div class="check-detail-meta">
  <span class="check-badge check-badge--category">organization</span>
  <span class="check-badge check-badge--tier">important</span>
  <span class="check-badge check-badge--scope">all repositories</span>
</div>

Detects single-source-of-truth violations by scanning for duplicate definitions across six semantic groups. When the same kind of configuration, policy, or specification appears in multiple locations, it signals organizational drift and maintenance risk.

#### What it checks

Six semantic groups are evaluated for duplication:

1. **Legal / Policies** — license files, terms, privacy policies
2. **Styling / Brand** — style guides, brand assets, design tokens
3. **Configuration** — `.config` files, `.env` files, settings directories
4. **Architecture** — specs, ADRs, decision records
5. **API Specs** — OpenAPI / Swagger definitions
6. **Database Config** — migration files, schema definitions

#### Scoring

| Condition | Score |
|---|---|
| No violations detected | 1.0 |
| One violation | 0.75 |
| Two violations | 0.50 |
| Three violations | 0.25 |
| Four or more violations | 0 |

Each violation reduces the score by 0.25.

### Testing provision

<div class="check-detail-meta">
  <span class="check-badge check-badge--category">quality</span>
  <span class="check-badge check-badge--tier">important</span>
  <span class="check-badge check-badge--scope">software repositories</span>
</div>

Evaluates whether the repository has runnable tests, properly isolated test directories, and testing documentation. Repositories that separate tests into dedicated directories and document their testing approach receive the highest scores.

#### What it checks

- Presence of test files (patterns like `*.test.ts`, `*.spec.ts`, `*.test.js`, etc.)
- Test isolation in dedicated directories (`test/`, `tests/`, `__tests__/`)
- Testing documentation in README or standalone test docs (e.g., `test*.md`)

#### Scoring

| Component | Points |
|---|---|
| Test files exist | +0.6 |
| Tests isolated in dedicated directories | +0.25 |
| Testing documentation present | +0.15 |

Components are summed for a maximum score of 1.0.

## Filter by check ID

Use check IDs with CLI flags to run or skip specific checks:

```bash
harnix scan . --only agents-md
harnix scan . --skip ci-pipeline
harnix scan . --only agents-md,documentation
harnix scan . --skip repo-structure,source-of-truth
```
