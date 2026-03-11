---
title: Configuration
description: Configure Harnix behavior with .harnix.yaml and CLI flags.
---

Harnix can be configured using a `.harnix.yaml` file placed at the root of the scanned repository, or through CLI flags passed directly to the `harnix scan` command. This page explains the available configuration keys, their types, and how Harnix resolves conflicts when both a config file and CLI flags are present.

## `.harnix.yaml` file

Create a `.harnix.yaml` file in the root of the repository you want to scan. Harnix automatically detects this file when running `harnix scan` and applies the settings before the scan begins.

### Supported keys

| Key | Type | Description |
|-----|------|-------------|
| `output` | `string` | Directory path where Markdown and HTML report files are written. Resolved relative to the repository root. |
| `skip` | `string[]` | Array of check IDs to exclude from the scan. |
| `only` | `string[]` | Array of check IDs to include exclusively. All other checks are skipped. |
| `type` | `"software"` or `"non-software"` | Override automatic repository type detection. Controls which checks run based on their `applicableTo` field. |
| `depth` | `number` | Recursive scan depth for submodules/workspaces (`0` = root only). |

### Example `.harnix.yaml`

```yaml
output: ./reports/harnix
skip:
  - ci-pipeline
  - testing-provision
type: non-software
depth: 0
```

### Constraints

- **`skip` and `only` are mutually exclusive.** If both are specified in `.harnix.yaml`, Harnix exits with a descriptive error. Use one or the other to control which checks run.
- **All entries are trimmed and deduplicated.** Leading and trailing whitespace in check IDs is removed, and duplicate entries are silently ignored.
- **`output` must be a non-empty string.** If provided, Harnix creates the directory if it does not already exist.
- **`type` must be exactly `"software"` or `"non-software"`.** Any other value produces a validation error.
- **`depth` must be a non-negative integer.** `0` disables recursive submodule/workspace scans.

## CLI-vs-config precedence

When a CLI flag and a `.harnix.yaml` key both specify the same setting, the **CLI flag always wins**. This allows teams to commit a shared `.harnix.yaml` while individual developers override specific settings at scan time.

The resolution rules for each setting are:

| Setting | Precedence |
|---------|-----------|
| `output` | CLI `--output` overrides config `output`. If neither is set, reports are written to the repository root. |
| `skip` | CLI `--skip` overrides config `skip`. If `--only` is present (from CLI or config), `skip` is ignored entirely. |
| `only` | CLI `--only` overrides config `only`. When `only` is active from any source, `skip` is cleared. |
| `type` | CLI `--type` overrides config `type`. If neither is set, Harnix auto-detects the repository type by scanning for software signals such as `package.json`, `Cargo.toml`, or `go.mod`. |
| `depth` | CLI `--depth` overrides config `depth`. If neither is set, recursive scan depth is unlimited. |

### Precedence example

Given this `.harnix.yaml`:

```yaml
output: ./reports
skip:
  - ci-pipeline
type: software
depth: 1
```

Running `harnix scan . --only agents-md,documentation` would:

1. Ignore the `output` config — no `--output` flag, so config value `./reports` is used
2. Override `skip` — the CLI `--only` takes priority, so `skip` is cleared
3. Run only `agents-md` and `documentation` checks
4. Keep `type: software` from the config since no `--type` flag was passed
5. Keep `depth: 1` from the config since no `--depth` flag was passed

## No config file

When no `.harnix.yaml` is present, Harnix runs with default behavior:

- All applicable checks are executed
- Reports are written to the repository root directory
- Repository type is auto-detected from file signals
- Recursive scan depth is unlimited

No error or warning is produced when the config file is absent.
