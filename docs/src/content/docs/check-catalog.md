---
title: Check Catalog
description: Complete catalog of all 10 built-in checks — IDs, tiers, scoring, and what each check evaluates.
---

Harnix ships with 10 built-in checks grouped into 6 categories. Each check produces a score between 0 and 1.0, which is then weighted by its tier during overall scoring. The table below summarizes every check; detailed descriptions and scoring rules follow.

## Active checks

| Name | Check ID | Category | Tier | Applies to |
|---|---|---|---|---|
| [Agents guidance](#agents-guidance) | `agents-md` | <span class="check-badge check-badge--category">agent-readiness</span> | <span class="check-badge check-badge--tier">critical</span> | <span class="check-badge check-badge--scope">all</span> |
| [Agent skills](#agent-skills) | `agent-skills` | <span class="check-badge check-badge--category">agent-readiness</span> | <span class="check-badge check-badge--tier">important</span> | <span class="check-badge check-badge--scope">all</span> |
| [CI pipeline](#ci-pipeline) | `ci-pipeline` | <span class="check-badge check-badge--category">quality-gates</span> | <span class="check-badge check-badge--tier">important</span> | <span class="check-badge check-badge--scope">software</span> |
| [Root README](#root-readme) | `root-readme` | <span class="check-badge check-badge--category">documentation</span> | <span class="check-badge check-badge--tier">critical</span> | <span class="check-badge check-badge--scope">all</span> |
| [Documentation](#documentation) | `documentation` | <span class="check-badge check-badge--category">documentation</span> | <span class="check-badge check-badge--tier">important</span> | <span class="check-badge check-badge--scope">all</span> |
| [Ubiquitous language](#ubiquitous-language) | `ubiquitous-language` | <span class="check-badge check-badge--category">documentation</span> | <span class="check-badge check-badge--tier">important</span> | <span class="check-badge check-badge--scope">all</span> |
| [Design guidance](#design-guidance) | `design-md` | <span class="check-badge check-badge--category">documentation</span> | <span class="check-badge check-badge--tier">nice-to-have</span> | <span class="check-badge check-badge--scope">all</span> |
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

### Root README

<div class="check-detail-meta">
  <span class="check-badge check-badge--category">documentation</span>
  <span class="check-badge check-badge--tier">critical</span>
  <span class="check-badge check-badge--scope">all repositories</span>
</div>

Checks for a substantive root `README.md` or `README.txt` file. The root README should be the fastest onboarding artifact in the repository and cover how to get started, how to run the project, and how to verify changes.

#### What it checks

- Presence of `README.md` or `README.txt` at the repository root
- Whether the README has substantive body content instead of a placeholder heading
- Whether the README includes setup, usage, and testing or troubleshooting guidance

#### Scoring

| Condition | Score |
|---|---|
| No supported root README found | 0 |
| Root README exists but is only a placeholder | 0.3 |
| Substantive root README | +0.4 |
| Setup/install guidance detected | +0.1 |
| Usage/run guidance detected | +0.1 |
| Testing/troubleshooting guidance detected | +0.1 |

The components are summed and capped at 1.0.

### Documentation

<div class="check-detail-meta">
  <span class="check-badge check-badge--category">documentation</span>
  <span class="check-badge check-badge--tier">important</span>
  <span class="check-badge check-badge--scope">all repositories</span>
</div>

Checks for durable documentation roots such as `docs/`, `specs/`, and `prds/`. This check focuses on whether the repository has a canonical long-form documentation layer, separate from the root README.

#### What it checks

- Presence of supported documentation roots: `docs/`, `specs/`, `prds/`
- Whether those roots contain supported documentation files (`.md`, `.mdx`, `.txt`, `.rst`, `.adoc`, `.yaml`, `.yml`, `.json`, `.toml`)
- Whether at least one matched documentation file contains substantive content

#### Scoring

| Condition | Score |
|---|---|
| No supported documentation roots found | 0 |
| Documentation roots exist but contain no supported documentation files | 0.2 |
| Documentation roots exist but only placeholder docs were detected | 0.4 |
| At least one substantive doc exists under `docs/`, `specs/`, or `prds/` | 1.0 |

### Ubiquitous language

<div class="check-detail-meta">
  <span class="check-badge check-badge--category">documentation</span>
  <span class="check-badge check-badge--tier">important</span>
  <span class="check-badge check-badge--scope">all repositories</span>
</div>

Checks for `CONTEXT.md` or `UBIQUITOUS_LANGUAGE.md` (case-insensitive basename). Either filename is enough. A root copy is the preferred canonical glossary; a copy in any nested project directory counts as supplementary language for that subtree.

[Ubiquitous language](https://www.dremio.com/wiki/ubiquitous-language/) is a [domain-driven design](https://en.wikipedia.org/wiki/Domain-driven_design) practice: the team uses one shared vocabulary for the domain, in conversation and in written artifacts. That glossary has become more useful in the agentic coding era, because a discoverable language file is a cheap constraint against invented synonyms and inconsistent edits.

Files under `docs/` are ignored. `docs/` is a documentation root, so `docs/CONTEXT.md` is not treated as ubiquitous-language evidence. The same exclusion applies to any path with a `docs` directory segment, such as `src/billing/docs/CONTEXT.md`. Copies under `vendor/`, `third_party/`, or `third-party/` are also ignored so a vendored project's glossary cannot inflate the score.

This check does not score whether the code still matches the terms.

#### What it checks

- Presence of `CONTEXT.md` or `UBIQUITOUS_LANGUAGE.md` at the repository root
- Presence of the same filenames in a nested project directory (for example `src/ordering/CONTEXT.md` or `packages/billing/CONTEXT.md`)
- Whether accepted files have substantive body content, using the same substance heuristic as the documentation check
- Copies under `docs/` are ignored
- Copies under `vendor/`, `third_party/`, or `third-party/` are ignored
- Nested placement is not restricted to source-code roots such as `src/`. Any other project path outside those excluded segments counts.

#### Scoring

| Condition | Score |
|---|---|
| No accepted file found | 0 |
| Accepted file exists but could not be read | 0.1 |
| Accepted file exists but is empty or only a placeholder | 0.4 |
| Substantive nested file found, but no substantive root file | 0.7 |
| Substantive root `CONTEXT.md` or `UBIQUITOUS_LANGUAGE.md` | 1.0 |

#### Further reading

- [`domain-modeling` skill](https://github.com/mattpocock/skills/tree/main/skills/engineering/domain-modeling) by Matt Pocock
- [Ubiquitous Language: the Good, the Bad, and the Lessons](https://dev.to/upslide/ubiquitous-language-the-good-the-bad-and-the-lessons-c2p) by Fabien Sinquin

### Design guidance

<div class="check-detail-meta">
  <span class="check-badge check-badge--category">documentation</span>
  <span class="check-badge check-badge--tier">nice-to-have</span>
  <span class="check-badge check-badge--scope">all repositories</span>
</div>

Checks for a root-level `DESIGN.md`. [DESIGN.md](https://github.com/google-labs-code/design.md) is a portable visual-identity format for coding agents: YAML design tokens in the front matter, plus markdown rationale in the body. Tokens are the normative values; the prose explains why those values exist and how to apply them.

This check is presence plus spec *shape*, not a DESIGN.md linter. It does not run [`@google/design.md lint`](https://github.com/google-labs-code/design.md), check WCAG contrast, resolve `{token}` references, validate token *values*, or score whether the file matches the implemented UI. A single known schema key such as `name` or `version` counts as front matter, even when no color or typography tokens are present.

Only the exact filename `DESIGN.md` at the scanned repository root counts. Nested copies (`apps/web/DESIGN.md`) and differently cased names (`design.md`) are ignored.

#### What it checks

- Presence of `DESIGN.md` at the repository root
- YAML front matter that parses as a mapping and includes at least one DESIGN.md schema key (`version`, `name`, `description`, `omitted`, `colors`, `typography`, `rounded`, `spacing`, `components`). Values are not type-checked.
- Canonical `##` sections from the spec, including aliases: Overview (Brand & Style), Colors, Typography, Layout (Layout & Spacing), Elevation & Depth (Elevation), Shapes, Components, Do's and Don'ts. Headings inside fenced code blocks are ignored.

#### Scoring

| Condition | Score |
|---|---|
| No root `DESIGN.md` | 0 |
| Root file exists but could not be read | 0.1 |
| Root file exists but has neither schema-key front matter nor canonical sections | 0.4 |
| Schema-key front matter *or* canonical sections, but not both | 0.7 |
| Schema-key front matter *and* at least one canonical section | 1.0 |

#### Further reading

- [The DESIGN.md specification](https://stitch.withgoogle.com/docs/design-md/specification)
- [google-labs-code/design.md](https://github.com/google-labs-code/design.md)
- [Atlassian’s DESIGN.md is here: what we learned testing portable design context in practice](https://www.atlassian.com/blog/how-we-build/atlassians-design-md-is-here-what-we-learned-testing-portable-design-context-in-practice) by Kylor Hall and Andrew Campbell
- [The DESIGN.md Workflow: How Google Stitch + Claude Code Quietly Changed the Design-to-Code Handoff](https://www.designsystemscollective.com/the-design-md-workflow-how-google-stitch-claude-code-quietly-changed-the-design-to-code-handoff-c4213f97ed8f) by Abhi Chatterjee
- [What is design.md, and how do I use it?](https://medium.com/@jackanglesea/what-is-design-md-and-how-do-i-use-it-a450bc8376e0) by Jack Anglesea

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

Historical snapshots under `archive/` and `legacy/` are excluded from this check. Configuration files are also treated as scoped (not duplicated) when the same filename appears once per project root in a monorepo.

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
harnix scan . --only agents-md,root-readme,documentation
harnix scan . --skip repo-structure,source-of-truth
```
