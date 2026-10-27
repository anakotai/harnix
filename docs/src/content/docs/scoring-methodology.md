---
title: Scoring Methodology
description: How Harnix computes score percentages and qualitative bands.
---

## Score range

Each check returns a numeric score in the range `0.0` to `1.0`.

Harnix displays these as percentages:

- `1.0`: 100%
- `0.75`: 75%
- `0.0`: 0%

## Status mapping

Per-check statuses are derived from percentage thresholds:

- `✓ pass`: >= 75%
- `△ partial`: >= 25%, < 75%
- `✗ fail`: < 25%

## Local and rollup scores

Local score is the fixed tier-weighted mean of evaluated checks, using weights 3/2/1 below. Skipped, inapplicable, and not-assessed checks are excluded from the evaluated set and category averages. Not-assessed results display as N/A with a reason. No evaluated checks means unavailable, with no band; it does not mean 0%.

Rollup equally averages the available local score and successfully scored direct children's effective scores (their rollup, otherwise local). Failed/unscanned targets and unavailable scores are omitted. Descendants influence the parent through their direct ancestor only. A leaf's rollup equals its local score. With no available local or child scores, rollup is unavailable. A target without local checks can still have a rollup from children.

For root local 80%, child rollup 40%, and child local 60%, root rollup is 60%. Child size and importance are not weighted. Both scores are labeled separately in all report formats. The engine retains numeric `overallScore` as `rollupScore ?? localScore ?? 0` for compatibility; consumers must use the nullable fields to distinguish unavailable from zero.

Every non-noise subdirectory is a scan target by default, including ordinary source/docs directories. Root-oriented checks can score these paths low and reduce rollup. This coverage expansion is deliberate; compare assessments using the same Harnix version, depth, and effective check set. `--depth 0` assesses only the root. Markdown/HTML retain full child findings, recommendations, references, and path-attributed errors; report size grows with target count.

The `operating-commands` check, introduced in 0.22.0, equally weights only applicable supported command categories. Unsupported ecosystems and Node targets without applicable categories are not assessed. Existing check scores are unchanged. Compare scores only for the same Harnix version and effective check set; catalog and heuristic changes may change aggregates without repository changes.

## Qualitative bands

The overall percentage maps to one of these labels:

- `0` to `25`: Poor
- `26` to `50`: Needs Improvement
- `51` to `75`: Good
- `76` to `100`: Excellent

## Tier weighting

Each check has an assigned tier that influences its contribution to the overall score:

| Tier | Weight | Description |
|------|--------|-------------|
| <span class="check-badge check-badge--tier">critical</span> | 3 | Essential signals that must be present for reliable agent and human usage |
| <span class="check-badge check-badge--tier">important</span> | 2 | Significant signals that improve readiness but are not blockers |
| <span class="check-badge check-badge--tier">nice-to-have</span> | 1 | Supplementary signals that indicate mature repository practices |

The local score is computed as a weighted average:

```text
local = sum(check_score × tier_weight) / sum(tier_weight)
```

This means critical checks have three times the influence of nice-to-have checks on the final score.

## Recommendation ranking

Top recommendations prioritize:

1. Check tier (`critical`, then `important`, then `nice-to-have`)
2. Lower score within the same tier

This ordering ensures the most impactful improvements are surfaced first in the console output and reports.
