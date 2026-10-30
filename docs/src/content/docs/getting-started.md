---
title: Getting Started
description: Run your first Harnix scan and understand the generated outputs.
---

## What Harnix does

Harnix scans a repository for harness readiness signals such as agent guidance, documentation, ubiquitous language, DESIGN.md, CI, and testing setup.

Each scan produces:

- A console summary with per-check status and recommendations
- A Markdown report file for sharing in issues and pull requests
- A self-contained HTML report file for browser review

## First scan

```bash
pnpm dlx harnix scan .
```

You can also scan a specific path:

```bash
pnpm dlx harnix scan /path/to/repository
```

## What to expect in output

The console summary includes:

- **Overall score and qualitative band** — a percentage and label such as "Good" (51–75%) or "Excellent" (76–100%)
- **Per-check score with status symbols** — `✓` for pass (≥75%), `△` for partial (25–74%), `✗` for fail (<25%), `–` and N/A for not assessed (no applicable supported categories; excluded from scoring)
- **Top recommendations** — prioritized by check tier (critical first) and then by lowest score within each tier
- **Report paths** — file locations for the generated Markdown and HTML reports, plus the JSON report when `--json-report` is used

After the scan, two report files are written to the `harnix/` directory (or a custom directory if `--output` is used):

- A timestamped **Markdown report** (`.md`) for embedding in pull requests and issues
- A self-contained **HTML report** (`.html`) for viewing in any browser without external dependencies

Pass `--json-report` to add a timestamped **JSON report** (`.json`) for agents and tooling. The JSON artifact is versioned and uses the same run instant as the Markdown and HTML files.

## Next

1. Review [Installation](/installation/) for all runtime options.
2. Check [CLI Reference](/cli-reference/) for flags such as `--verbose`, `--skip`, `--output`, and `--json-report`.
3. Read [JSON Reports](/json-reports/) before consuming the machine-readable artifact.
4. Use [Scoring Methodology](/scoring-methodology/) to interpret results consistently across repos.
