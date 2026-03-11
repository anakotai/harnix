---
title: CLI Reference
description: Command and flag reference for the Harnix CLI.
---

## Command

```bash
harnix scan [path]
```

- `path` is optional and defaults to `.`.
- `scan` is the current command.

## Flags

### `--verbose`

Include inline rationale per check in terminal output.

```bash
harnix scan . --verbose
```

### `--output <path>`

Write report files to a custom output directory.

```bash
harnix scan . --output ./reports/harnix
```

Also supported:

```bash
harnix scan . --output=./reports/harnix
```

### `--skip <check-id>`

Skip one or more checks.

```bash
harnix scan . --skip agents-md,ci-pipeline
harnix scan . --skip agents-md --skip ci-pipeline
```

### `--only <check-id>`

Run only the specified checks.

```bash
harnix scan . --only agents-md
harnix scan . --only agents-md,documentation
```

`--skip` and `--only` are mutually exclusive.

### `--type <software|non-software>`

Override repository type detection.

```bash
harnix scan . --type software
harnix scan . --type non-software
```

### `--depth <n>`

Limit recursive scanning of submodules/workspaces by depth.

- `0` scans only the target repository.
- `1` scans the target plus direct submodules/workspaces.
- `2` includes one additional nested level, and so on.
- If omitted, depth is unlimited (current behavior).

```bash
harnix scan . --depth 0
harnix scan . --depth 1
harnix scan . --depth=2
```

## Exit codes

Harnix uses the following exit codes to indicate scan outcomes:

- `0` — scan completed successfully, regardless of scores
- `1` — an error occurred (invalid arguments, missing directory, malformed config file)

The exit code does not reflect the scan score. A repository scoring `0%` still exits with code `0` because the scan itself succeeded. This design makes Harnix safe to use in CI pipelines where you want to capture results without failing the build on low scores.

## Help

Display the top-level help text with available commands:

```bash
harnix --help
```

Display scan-specific help with all flags and arguments:

```bash
harnix scan --help
```

## Version

Print the installed Harnix version:

```bash
harnix --version
```
