# Harnix

**Harnix** is an open-source harness readiness scanner that evaluates how well a repository is prepared for AI-assisted development workflows. It scans your codebase and produces a scored report covering agent guidance, documentation quality, CI pipelines, testing provisions, repository structure, and more.

## Motivation

AI coding agents — GitHub Copilot, Claude Code, Codex, Gemini CLI — are becoming standard development tools. But their effectiveness depends heavily on how well a repository communicates its conventions, build steps, and architectural decisions. A repo without an `AGENTS.md`, clear documentation, or CI pipelines forces every agent session to start from scratch, burning context and producing inconsistent results.

**Harness readiness** is the measure of how prepared a codebase is for productive AI collaboration. Harnix quantifies this readiness with a repeatable, scored assessment.

## The Problem

Most repositories lack the structural signals that AI agents need to be effective:

- No `AGENTS.md` or equivalent guidance file telling agents how to build, test, and navigate the codebase
- Missing or skeletal documentation that forces agents to guess at conventions
- No CI pipeline to catch agent-introduced regressions
- No testing infrastructure for agents to validate their changes against
- Duplicated configuration spread across multiple locations (violating single-source-of-truth)
- Disorganized repo structure that makes discovery harder for both humans and agents

Harnix detects these gaps and tells you exactly what to fix, prioritized by impact.

## Quick Start

Run a scan with a single command — no installation required:

```bash
npx harnix scan .
```

Sample output:

```
Harness Readiness Report: .
───────────────────────────────────────
Overall: Good (64%)

✓ Agent skills       100%  Found 1 skill(s): 1 compliant, 0 security flag(s)
✓ Agents guidance     80%  AGENTS.md has brief guidance
✗ CI pipeline          0%  No CI/CD configuration detected
✗ Documentation       20%  No README.md found
✓ Repo structure      75%  Source organized in src
✓ Source of truth    100%  No single source of truth violations detected
✓ Testing provision   85%  Tests exist but testing documentation is missing

Top recommendations:
1. Add a substantive README.md with project purpose, setup steps, and usage examples.
2. Expand AGENTS.md with concrete build, test, and module-specific workflow instructions.
3. Add a CI pipeline (for example GitHub Actions) to automate lint, test, and build checks.
```

Reports are also written as Markdown and self-contained HTML files to the `harnix/` output directory.

## Installation

### npx (no install)

```bash
npx harnix scan .
```

### Global install

```bash
npm install -g harnix
harnix scan .
```

### From source

```bash
git clone https://github.com/anakotai/harnix.git
cd harnix
npm install
npm run build
node bin/harnix.js scan /path/to/repo
```

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
| `--type <type>` | Override repo type (`software` or `non-software`) |
| `--help`, `-h` | Show scan help text |

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
  - documentation

# Override repo type detection
type: software

# Custom output directory
output: ./reports
```

**Precedence:** CLI flags override `.harnix.yaml` values. When `--only` is passed on the CLI, the config file's `only` and `skip` keys are both ignored.

### Output Formats

Every scan produces three outputs:

1. **Console** — colored summary printed to stdout
2. **Markdown** — timestamped `.md` report in the output directory
3. **HTML** — self-contained `.html` report with embedded CSS (no external requests)

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
Overall Score = (Σ weight_i × score_i) / (Σ weight_i)
```

Each check produces a score between 0.0 and 1.0. The weighted formula ensures critical checks (like agent guidance and documentation) have proportionally more influence on the overall score than nice-to-have checks.

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

## Check Catalog

Harnix ships with 7 MVP checks:

| ID | Name | Category | Tier | Description |
|---|---|---|---|---|
| `agents-md` | Agents guidance | Agent Readiness | Critical | Detects AGENTS.md or CLAUDE.md; scores content length and substance |
| `documentation` | Documentation | Documentation | Critical | Checks for substantive README.md and docs/prds directories |
| `agent-skills` | Agent skills | Agent Readiness | Important | Detects skills in supported roots (`skills/`, `.skills/`, `.claude/skills/`, `.codex/skills/`, `.agent/skills/`, `.github/skills/`), validates SKILL.md frontmatter, flags hidden Markdown comments |
| `ci-pipeline` | CI pipeline | Quality Gates | Important | Detects CI/CD config for GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis, Azure Pipelines |
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

Harnix is built and maintained by [Anakot](https://anakot.ai/haas) as part of the Harness-as-a-Service platform. It is the open-source foundation of Anakot's compliance intelligence tooling for AI-ready development workflows.

## Resources

- [Harness Engineering](https://anakot.ai/haas) — the concept behind Harnix
- [AGENTS.md specification](https://github.com/agentsmd/agents.md) — the open format for AI coding agent guidance files
- [Contributor Covenant](https://www.contributor-covenant.org/) — the code of conduct standard used by this project

## License

[Apache 2.0](LICENSE)
