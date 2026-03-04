---
title: Getting Started
description: Run your first Harnix scan and understand the generated outputs.
---

## What Harnix does

Harnix scans a repository for harness readiness signals such as agent guidance, documentation, CI, and testing setup.

Each scan produces:

- A console summary with per-check status and recommendations
- A Markdown report file for sharing in issues and pull requests
- A self-contained HTML report file for browser review

## First scan

```bash
npx harnix scan .
```

You can also scan a specific path:

```bash
npx harnix scan /path/to/repository
```

## What to expect in output

- Overall score and qualitative band
- Per-check score with status symbols (`✓`, `△`, `✗`)
- Top recommendations prioritized by impact
- Report output paths printed after the scan

## Next

1. Review [Installation](/installation/) for all runtime options.
2. Check [CLI Reference](/cli-reference/) for flags such as `--verbose`, `--skip`, and `--output`.
3. Use [Scoring Methodology](/scoring-methodology/) to interpret results consistently across repos.
