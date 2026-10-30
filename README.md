# Harnix

Harnix is an open-source, offline harness readiness scanner for project owners and AI coding agents. It checks whether a repository makes operating context discoverable: agent guidance, shared vocabulary, documentation, CI, testing provisions, and repository structure.

Scores measure heuristic signal coverage. They do not certify documentation quality or predict agent success. Scans read local files and write local reports without network calls or telemetry.

## Quick start

Requires Node.js 20.11.0 or later. Run without installing:

```bash
pnpm dlx harnix scan .
```

Or install globally from the public npm registry:

```bash
pnpm install -g harnix
harnix scan .
```

Each scan prints a console summary and writes timestamped Markdown and self-contained HTML reports to `harnix/`. Add `--json-report` for a versioned JSON artifact for agents and tooling.

## Usage

```bash
harnix scan [path]     # Default: current directory
harnix scan --help    # All scan options
harnix --version
```

| Flag | Purpose |
|---|---|
| `--verbose` | Include per-check rationale in console output |
| `--output <path>` | Choose a report directory |
| `--skip <id>` | Skip check IDs (comma-separated or repeated) |
| `--only <id>` | Run only specified check IDs (comma-separated or repeated) |
| `--type <type>` | Override root repo type: `software` or `non-software` |
| `--depth <n>` | Limit recursive assessments (`0` = root only; default: unlimited) |
| `--json-report` | Also write a versioned JSON report |

By default, every non-noise subdirectory is assessed, including ordinary source and documentation directories. Submodule and workspace declarations annotate this tree. Each target gets its own findings; `.gitignore`, built-in noise, and generated-report exclusions filter discovery. Depth limits assessments, not each target's file inventory. Use `--depth 0` for a root-only assessment.

For persistent settings, create `.harnix.yaml` in the scanned root:

```yaml
skip:
  - ci-pipeline
depth: 0
output: ./reports
```

CLI flags override corresponding configuration values. Use `skip` or `only`, not both, in the file; CLI `--only` ignores configured filters. See [configuration](https://github.com/anakotai/harnix/blob/main/docs/src/content/docs/configuration.md) for precedence and exclusion rules.

A completed scan exits 0 regardless of scores. Invalid invocations, fatal scan errors, and failures to write requested reports exit non-zero.

## Checks and scoring

The built-in catalog covers agent guidance and skills, operating commands, CI pipelines, root README, durable documentation, ubiquitous language, design guidance, repository structure, source of truth, and testing provisions. See the [check catalog](https://github.com/anakotai/harnix/blob/main/docs/src/content/docs/check-catalog.md) for check IDs, applicability, and heuristics.

Each evaluated check scores from 0 to 1. A target's **local score** is the weighted mean of its checks: critical ×3, important ×2, nice-to-have ×1. Its **rollup score** equally averages its available local score and each scored direct child's effective score. Unavailable scores and failed children are omitted; zero remains a valid score.

Ordinary subdirectories may lack root-oriented guidance and lower the rollup. Compare runs using the same Harnix version, effective check set, and depth. Recommendations prioritize check tier, then lower scores within that tier.

See [scoring methodology](https://github.com/anakotai/harnix/blob/main/docs/src/content/docs/scoring-methodology.md) for bands and examples, and [JSON reports](https://github.com/anakotai/harnix/blob/main/docs/src/content/docs/json-reports.md) for the machine-readable contract.

## Development

```bash
git clone https://github.com/anakotai/harnix.git
cd harnix
pnpm install
pnpm run build
pnpm test
node bin/harnix.js scan /path/to/repo
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for adding checks, testing, code style, and releases, and [CONTEXT.md](CONTEXT.md) for domain vocabulary. Full usage details are in the [CLI reference](https://github.com/anakotai/harnix/blob/main/docs/src/content/docs/cli-reference.md).

Built and maintained by [Anakot](https://anakot.ai/haas) as part of its Harness-as-a-Service platform. Licensed under [Apache 2.0](LICENSE).
