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

## Help

```bash
harnix --help
```
