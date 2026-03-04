---
title: Scoring Methodology
description: How Harnix computes score percentages and qualitative bands.
---

## Score range

Each check returns a numeric score in the range `0.0` to `1.0`.

Harnix displays these as percentages:

- `1.0` -> `100%`
- `0.75` -> `75%`
- `0.5` -> `50%`
- `0.0` -> `0%`

## Status mapping

Per-check statuses are derived from percentage thresholds:

- `✓ pass`: `>= 75%`
- `△ partial`: `25%` to `74%`
- `✗ fail`: `< 25%`

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

## Recommendation ranking

Top recommendations prioritize:

1. Check tier (`critical`, then `important`, then `nice-to-have`)
2. Lower score within the same tier
