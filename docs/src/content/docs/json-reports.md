---
title: JSON Reports
description: Versioned machine-readable Harnix assessment reports for agents and tooling.
---

## Overview

Pass `--json-report` to add a machine-readable artifact to a scan:

```bash
harnix scan . --json-report
```

Harnix keeps the console summary unchanged and still writes the Markdown and HTML reports. The JSON report is written as `report-<timestamp>.json` beside them. The filename timestamp and `generatedAt` both derive from the same run instant; the filename uses UTC. The CLI prints the JSON path only after the artifact is written successfully.

JSON output is opt-in. It is a CLI-only output choice and is not a `.harnix.yaml` key.

## Top-level shape

```json
{
  "schemaVersion": "1.0",
  "harnixVersion": "0.21.0",
  "generatedAt": "2026-03-05T14:30:45.000Z",
  "run": {
    "target": { "path": "/absolute/path/to/repo" },
    "options": {
      "skip": [],
      "only": ["agents-md"],
      "typeOverride": null,
      "depth": null
    }
  },
  "assessment": {},
  "topRecommendations": []
}
```

| Field | Meaning |
|---|---|
| `schemaVersion` | Version of this JSON contract, formatted as `MAJOR.MINOR`. |
| `harnixVersion` | Installed Harnix version, or `null` when it cannot be read. Scores are comparable only for the same version and effective check set. |
| `generatedAt` | Run instant as an ISO 8601 UTC timestamp. The Markdown, HTML, and JSON artifacts share this instant, and the filename timestamp uses the same UTC instant. |
| `run.target.path` | Absolute path passed to the assessment. |
| `run.options` | Effective options after CLI/config precedence. `depth: null` means unlimited; `typeOverride: null` means the root type was detected. |
| `assessment` | Root scan target assessment. |
| `topRecommendations` | The same cross-tree, tier-prioritized recommendations shown in the human-readable reports. `targetPath` is `null` for the root target. |

## Assessment nodes

Each scan target, including nested children, is represented by an assessment node:

| Field | Meaning |
|---|---|
| `repoType` | Effective type for this target (`software` or `non-software`). |
| `repoTypeSource` | `detected` or `override`. A root type override does not force child types. |
| `detectedRepoType` | Best-effort detection result, retained even when an override replaced it. |
| `localScore` | Tier-weighted mean of this target's evaluated checks, or `null` when no checks were evaluated. |
| `localScoreState` | `evaluated` or `no-checks`. An evaluated zero is `localScore: 0` with state `evaluated`; an empty check set is `localScore: null` with state `no-checks`. |
| `rollupScore` | Equal-weight rollup of the local score and each successfully scored direct child's effective score, or `null` when no local or child score is available. |
| `rollupState` | `evaluated` or `unavailable`. A target can have `localScore: null` and still have an available rollup from scored children. |
| `band` | Qualitative band for `localScore`, or `null` when no score is available. |
| `evaluatedCheckIds` | Check IDs that contributed to this target's local score (excludes `not-assessed`), sorted by ID. |
| `checks` | Full check results, including `not-assessed` results, sorted by ID. Every `CheckResult` field is preserved, including summaries, details, recommendations, and references. |
| `checkErrors` | Structured failures captured at the engine's check loader/execution boundary. |
| `children` | Existing recursive child tree, sorted by path then kind. |

### Check results

Each entry in `checks` preserves the engine's `CheckResult` fields:

- `id`, `name`, `category`, and `tier`
- `score` (`0`–`1`) and `status` (`pass`, `partial`, `fail`, or `not-assessed`)
- `summary`, `details`, and `whyThisMatters`
- `recommendations` and `references`

References and opaque strings are exported unchanged. Harnix does not add source-file contents, secrets, or environment variables. Structured check and child error messages are exported; known child absolute paths are normalized to the child tree path, but engine-authored error text is not otherwise rewritten and may still contain filesystem paths. The human-readable reports render child failures as `Scan failed` without that engine text.

### Check execution errors

`checkErrors` is distinct from an ordinary failed finding:

```json
{
  "checkId": "agents-md",
  "checkName": "Agents guidance",
  "message": "raw error message"
}
```

A check that throws still produces the legacy synthetic failed `CheckResult` so console and scoring behavior do not change; the structured entry is additional machine-readable context. `checkErrors` does not include discovery or inventory failures that happen outside the instrumented check boundary, and it is not inferred from display strings.

### Children

Child entries keep the existing workspace/submodule tree:

```json
{
  "kind": "submodule",
  "path": "packages/core",
  "status": "assessed",
  "assessment": {},
  "error": null
}
```

- `path` is relative to the immediate parent target.
- `kind` is an extensible string. Known emitted values are `directory`, `submodule`, and `workspace`.
- `status` is an extensible string. Known emitted values are `assessed` and `error`; `not-assessed` is reserved for future depth or discovery states.
- An `assessed` child has an `assessment` object and `error: null`.
- An `error` child has `assessment: null` and an `error` object with the path-attributed failure message.

## Schema and compatibility

The published Draft 2020-12 schema is included in the npm package at `schema/harnix-report.schema.json` and identified as `urn:harnix:json-report:1`. It describes the current `1.x` contract.

Compatibility policy:

- `schemaVersion` is a `MAJOR.MINOR` string. The published schema constrains it to the current major (`^1\.\d+$`), so additive `1.x` reports validate against the same schema. Consumers should validate against the schema for the major version they support.
- The major version changes for removed or renamed fields, tightened required fields, changed types, changed score units, changed `null` semantics, or changed path interpretation.
- The minor version changes for additive optional fields and new values in documented extensible string fields. The schema file is regenerated with `npm run schema`, and a test fails if the checked-in schema drifts.
- Consumers must ignore unknown fields and tolerate unknown values for extensible strings such as child `kind`, check `status`, `repoTypeSource`, `localScoreState`, and `rollupState`. Unknown states must not be treated as success or as a zero score.
- A higher minor version is compatible with the same major version. A different major version requires explicit consumer support.

## Comparison limits

JSON reports record run identity so comparisons can be scoped. Compare scores only when all of the following match:

- `harnixVersion`
- the effective `run.options` (`skip`, `only`, `typeOverride`, and `depth`)
- the evaluated check set (`assessment.evaluatedCheckIds`, including child targets)

Catalog or heuristic changes can move scores without repository changes. `schemaVersion` describes the report contract, not score comparability.

Rollup scoring equally averages the local score and each successfully scored direct child's effective score. `rollupScore` is `null` only when no local or child score is available, so a target can have `localScore: null` with an available rollup from scored children. A parent's `localScore` is not a rollup of its children.

## Failure behavior

If the requested JSON artifact cannot be written, Harnix reports the write failure, exits nonzero, and does not print any artifact paths. Markdown and HTML are written first and may already have completed for that run.
