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

## Overall score

The current CLI computes overall score as the arithmetic mean of all evaluated checks:

```text
overall = sum(check scores) / number of evaluated checks
```

Skipped and inapplicable checks are excluded from the evaluated set.

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

The overall score is computed as a weighted average:

```text
overall = sum(check_score × tier_weight) / sum(tier_weight)
```

This means critical checks have three times the influence of nice-to-have checks on the final score.

## Recommendation ranking

Top recommendations prioritize:

1. Check tier (`critical`, then `important`, then `nice-to-have`)
2. Lower score within the same tier

This ordering ensures the most impactful improvements are surfaced first in the console output and reports.
