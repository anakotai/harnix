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
harnix scan . --only agents-md,root-readme,documentation
```

`--skip` and `--only` are mutually exclusive.

### `--type <software|non-software>`

Override repository type detection.

```bash
harnix scan . --type software
harnix scan . --type non-software
```

### `--depth <n>`

Limit recursive scanning of non-noise subdirectories by depth.

- `0` scans only the target repository.
- `1` scans the target plus direct non-noise subdirectories.
- `2` includes one additional nested level, and so on.
- If omitted, depth is unlimited (current behavior).

```bash
harnix scan . --depth 0
harnix scan . --depth 1
harnix scan . --depth=2
```

### `--json-report`

Also write a timestamped, versioned JSON report beside the Markdown and HTML artifacts.

```bash
harnix scan . --json-report
```

JSON output is opt-in so default stdout and report files stay human-readable. The JSON report records the effective options after CLI/config precedence, evaluated check IDs, full check results, structured check-execution errors, and the existing recursive child tree. The CLI prints the artifact path only after every requested file is written successfully. See [JSON Reports](/json-reports/) for the schema and compatibility policy.

`--json-report` is a CLI-only output choice; it is not available in `.harnix.yaml`.

## Exit codes

Harnix uses the following exit codes to indicate scan outcomes:

- `0` — scan completed successfully, regardless of scores
- `1` — an error occurred (invalid arguments, missing directory, malformed config file, or a requested report artifact that could not be written)

The exit code does not reflect the scan score. A repository scoring `0%` still exits with code `0` because the scan itself succeeded. Child scan failures are surfaced in reports and omitted from rollup; they do not by themselves require a non-zero exit.

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
