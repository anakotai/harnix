# Harnix

**Harnix** is an open-source harness readiness scanner that evaluates how well a repository exposes foundational operating context for AI-assisted development workflows. It scans your codebase and produces a scored report covering agent guidance, documentation presence, CI configuration signals, testing provisions, repository structure, and more.

## Motivation

AI coding agents — GitHub Copilot, Claude Code, Codex, Gemini CLI — are becoming standard development tools. Their usefulness improves when a repository makes conventions, build steps, and decisions discoverable. A repo without an `AGENTS.md`, clear documentation, or CI pipelines forces every agent session to start from scratch, burning context and producing inconsistent results.

**Harness readiness** (as Harnix measures it) is heuristic signal coverage over that discoverable operating context — not a prediction that agents will succeed. Harnix quantifies those signals with a repeatable, scored assessment.

## The Problem

Most repositories lack the structural signals that AI agents need to be effective:

- No `AGENTS.md` or equivalent guidance file telling agents how to build, test, and navigate the codebase
- No `CONTEXT.md` or `UBIQUITOUS_LANGUAGE.md` capturing the project's shared domain vocabulary
- Missing or skeletal documentation that forces agents to guess at conventions
- No CI pipeline to catch agent-introduced regressions
- No testing infrastructure for agents to validate their changes against
- Duplicated configuration spread across multiple locations (violating single-source-of-truth)
- Disorganized repo structure that makes discovery harder for both humans and agents

Harnix detects these gaps and tells you exactly what to fix, prioritized by impact.

## Quick Start

Run a scan with a single command — no installation required:

```bash
pnpm dlx harnix scan .
```

Sample output:

```
Harness Readiness Report: .
───────────────────────────────────────
Overall: Good (53%)

✓ Agent skills       100%  Found 1 skill(s): 1 compliant, 0 security flag(s)
✓ Agents guidance     80%  AGENTS.md has brief guidance
✗ CI pipeline          0%  No CI/CD configuration detected
✗ Documentation        0%  No docs/, specs/, or prds/ content found
✗ Ubiquitous language  0%  No CONTEXT.md or UBIQUITOUS_LANGUAGE.md found
✓ Repo structure      75%  Source organized in src
✗ Root README         0%  No root README.md or README.txt found
✓ Source of truth    100%  No single source of truth violations detected
✓ Testing provision   85%  Tests exist but testing documentation is missing

Top recommendations:
1. Add a substantive root README.md or README.txt with project purpose, setup steps, usage examples, and verification guidance.
2. Add a docs/, specs/, or prds/ directory for durable project documentation.
3. Add a CI pipeline (for example GitHub Actions) to automate lint, test, and build checks.
```

Reports are also written as Markdown and self-contained HTML files to the `harnix/` output directory. Pass `--json-report` to add a versioned, machine-readable JSON artifact beside them.

## Installation

### pnpm dlx (no install)

```bash
pnpm dlx harnix scan .
```

### Global install

```bash
pnpm install -g harnix
harnix scan .
```

### From source

```bash
git clone https://github.com/anakotai/harnix.git
cd harnix
pnpm install
pnpm run build
node bin/harnix.js scan /path/to/repo
```

## Distribution

Harnix is distributed via the public npm registry as `harnix`.

- **npm registry** is the installation source (`pnpm dlx harnix`, `pnpm install -g harnix`)
- **GitHub Releases** mirror tagged versions and release notes
- **GitHub Packages** is not used for Harnix distribution

## Usage

### Commands

```bash
harnix scan [path]     # Scan a repository (default: current directory)
harnix --help          # Show global help
harnix --version       # Show version number
harnix scan --help     # Show scan-specific help
```

### Scan Flags

| Flag | Description |
|---|---|
| `--verbose` | Show per-check rationale in console output |
| `--output <path>` | Write reports to a custom output directory |
| `--skip <id>` | Skip check IDs (comma-separated or repeated) |
| `--only <id>` | Run only specified check IDs (comma-separated or repeated) |
| `--type <type>` | Override repo type (`software` or `non-software`) for the scanned root path |
| `--depth <n>` | Recursive assessment depth for all non-noise subdirectories (`0` = root only, default: unlimited) |
| `--json-report` | Also write a timestamped, versioned JSON report beside the Markdown and HTML files |
| `--help`, `-h` | Show scan help text |

Every direct non-noise subdirectory is assessed recursively, including ordinary `src/` and `docs/` directories and empty directories. Submodule/workspace declarations annotate the real tree; they do not promote deeply nested projects to direct children. Default depth remains unlimited; `--depth 0` assesses only the root, and `--depth 1` adds direct children. Depth limits assessments, not the complete file inventory used by each target. A root `--type non-software` override does not force child software projects into non-software scoring.

Inventory and discovery share `.gitignore` filtering from the scan root down: deeper files override shallower files, the last matching rule wins within a file, and negation cannot restore files inside an excluded directory. Patterns are case-sensitive, anchored relative to their `.gitignore`, and use Git-compatible wildcards and escapes. Ancestor rules above the scan root, global Git excludes, `.git/info/exclude`, and Git's tracked-file exceptions are not consulted. Built-in noise takes precedence: `.git`, `.hg`, `.svn`, `node_modules`, `.next`, `dist`, `build`, `.venv`, `venv`, `__pycache__`, and `.cache`. Symlink aliases are omitted in favor of their physical in-root paths, so aliases cannot bypass ignores, duplicate content, escape the root, or form cycles.

The selected dedicated report output directory (default `harnix/`) is excluded. When output is the scan root (`--output .`), unrelated files remain visible. Timestamp-named `report-YYYYMMDDTHHMMSS.md`/`.html` files are excluded anywhere only when their opening content identifies a Harnix report. Historical arbitrary custom output directories are not recognized after selecting a different output path: add them to `.gitignore`. Renamed reports or edited headers cannot reliably be identified.

### Configuration File

Create a `.harnix.yaml` at the repository root for persistent configuration:

```yaml
# Skip specific checks
skip:
  - ci-pipeline
  - testing-provision

# Or run only specific checks (mutually exclusive with skip)
only:
  - agents-md
  - root-readme
  - documentation

# Override repo type detection
type: software

# Optional recursive depth for non-noise subdirectories
# 0 = root only
depth: 1

# Custom output directory
output: ./reports
```

**Precedence:** CLI flags override `.harnix.yaml` values. When `--only` is passed on the CLI, the config file's `only` and `skip` keys are both ignored.

### Output Formats

Every scan produces three human-readable outputs:

1. **Console** — colored summary printed to stdout
2. **Markdown** — timestamped `.md` report in the output directory
3. **HTML** — self-contained `.html` report with embedded CSS (no external requests)

Pass `--json-report` to also write a timestamped `.json` report for agents and tooling. The JSON artifact uses a versioned schema, includes the same run instant as the human-readable reports, and is announced only after it is written successfully. See [JSON Reports](https://github.com/anakotai/harnix/blob/main/docs/src/content/docs/json-reports.md) for the contract and compatibility policy.

## Scoring Methodology

Harnix uses a **tier-weighted scoring formula** to calculate the overall harness readiness score.

### Tier Weights

Each check belongs to a tier that determines its weight in the overall score:

| Tier | Weight | Rationale |
|---|---|---|
| Critical | 3 | Foundational — without these, agent workflows are severely impaired |
| Important | 2 | Significant impact on agent effectiveness and developer experience |
| Nice-to-have | 1 | Beneficial but not essential for basic agent operation |

### Formula

```
Local Score = (Σ weight_i × score_i) / (Σ weight_i)
```

Each check produces a score between 0.0 and 1.0. The weighted formula ensures critical checks (like agent guidance and documentation) have proportionally more influence on the overall score than nice-to-have checks.

### Recursive rollup

Reports label **Local score** and **Rollup score** separately. Local score is the fixed tier-weighted mean above. Rollup equally averages the available local score and each successfully scored direct child's effective score (its rollup, otherwise local). Descendants contribute through their direct ancestor only. Failed or unscanned targets are omitted, never counted as zero. With no evaluated checks, local score is unavailable and has no band; scored children can still produce a rollup. With no scores at all, rollup is also unavailable. A leaf's rollup equals its local score.

For example, a root local score of 80%, one child with rollup 40%, and another child with local 60% produce a root rollup of 60%. Child importance is not weighted. The engine's numeric `overallScore` compatibility field now means `rollupScore ?? localScore ?? 0`; use nullable `localScore`/`rollupScore` to distinguish unavailable from zero.

Ordinary source directories often lack root-oriented guidance, README files, or CI markers. Their lower local scores can lower the recursive rollup even when the root is well documented. This release deliberately expands coverage under the existing domain contract; compare scores only with the same Harnix version, check set, and depth. Use `--depth 0` for a root-only assessment. Markdown and HTML retain every assessed child's findings, references, recommendations, and path-attributed errors; large trees produce large reports.

### Qualitative Bands

The percentage score maps to a qualitative band:

| Band | Score Range |
|---|---|
| Excellent | 76–100% |
| Good | 51–75% |
| Needs Improvement | 26–50% |
| Poor | 0–25% |

### Per-Category Scores

Checks are grouped by category, and each category's score is also calculated using the tier-weighted formula across its constituent checks.

Checks with no applicable supported categories appear as **not assessed (N/A)** and contribute neither score nor weight, including to category averages. With no evaluated checks the local score is unavailable and the report warns that nothing was evaluated. The Node-focused `operating-commands` check was added in 0.22.0; existing check scores are unchanged. Compare scores only across the same Harnix version and effective check set, since catalog or heuristic changes can move aggregates without repository changes.

## Check Catalog

Harnix ships with 11 built-in checks:

| ID | Name | Category | Tier | Description |
|---|---|---|---|---|
| `agents-md` | Agents guidance | Agent Readiness | Critical | Detects AGENTS.md or CLAUDE.md; scores content length and substance |
| `agent-skills` | Agent skills | Agent Readiness | Important | Detects skills in supported roots (`skills/`, `.skills/`, `.claude/skills/`, `.codex/skills/`, `.agent/skills/`, `.github/skills/`), validates SKILL.md frontmatter, flags hidden Markdown comments |
| `operating-commands` | Operating commands | Agent Readiness | Important | Software-only; detects applicable Node setup, verification, build, and run examples in root or linked canonical guidance ([patterns and limits](docs/operating-commands.md)) |
| `ci-pipeline` | CI pipeline | Quality Gates | Important | Detects CI/CD config for GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis, Azure Pipelines |
| `root-readme` | Root README | Documentation | Critical | Checks for a substantive root README.md or README.txt with onboarding guidance |
| `documentation` | Documentation | Documentation | Important | Checks for durable documentation roots such as docs/, specs/, and prds/ |
| `ubiquitous-language` | Ubiquitous language | Documentation | Important | Detects CONTEXT.md or UBIQUITOUS_LANGUAGE.md at the root (preferred) or in a nested project directory; ignores docs/ and vendored trees; scores substance |
| `design-md` | Design guidance | Documentation | Nice-to-have | Detects a root DESIGN.md and scores schema-key YAML front matter plus canonical spec sections |
| `repo-structure` | Repo structure | Infrastructure | Important | Detects monorepo/submodule setup, source organization, root file ratio |
| `source-of-truth` | Source of truth | Organization | Important | Flags single-source-of-truth violations across 6 semantic groups |
| `testing-provision` | Testing provision | Quality | Important | Detects test files/directories, test isolation, and testing documentation |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:

- Conventional commit format
- How to add a new check
- Testing expectations with Vitest
- TypeScript code style

## Built by Anakot

Harnix is built and maintained by [Anakot](https://anakot.ai/haas) as part of the Harness-as-a-Service platform. It is the open-source assessment toolkit for harness readiness signals that can feed broader AI-ready development workflows.

## Resources

- [Harness Engineering](https://anakot.ai/haas) — the concept behind Harnix
- [AGENTS.md specification](https://github.com/agentsmd/agents.md) — the open format for AI coding agent guidance files
- [DESIGN.md specification](https://stitch.withgoogle.com/docs/design-md/specification) — portable visual-identity format for coding agents ([google-labs-code/design.md](https://github.com/google-labs-code/design.md))
- [Ubiquitous language](https://www.dremio.com/wiki/ubiquitous-language/) — shared domain vocabulary from [domain-driven design](https://en.wikipedia.org/wiki/Domain-driven_design)
- [`domain-modeling` skill](https://github.com/mattpocock/skills/tree/main/skills/engineering/domain-modeling) by Matt Pocock
- [Ubiquitous Language: the Good, the Bad, and the Lessons](https://dev.to/upslide/ubiquitous-language-the-good-the-bad-and-the-lessons-c2p) by Fabien Sinquin
- [Contributor Covenant](https://www.contributor-covenant.org/) — the code of conduct standard used by this project

## License

[Apache 2.0](LICENSE)
