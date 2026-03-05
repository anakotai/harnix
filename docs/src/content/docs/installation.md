---
title: Installation
description: Install and run Harnix using npm, npx, or from source.
---

## Requirements

- **Node.js 20 or newer** — Harnix uses modern JavaScript features (`import.meta.dirname`) that require Node.js 20.11.0 or later
- **npm 10 or newer** — ships with Node.js 20 by default

## Zero-install usage

Run Harnix directly without installing it globally. This downloads and executes the latest published version:

```bash
npx harnix scan .
```

## Global install

Install Harnix globally to use the `harnix` command from any directory:

```bash
npm install --global harnix
harnix scan .
```

## Run from source

```bash
git clone https://github.com/anakotai/harnix.git
cd harnix
npm install
node bin/harnix.js scan .
```

## Verify installation

After installation, confirm the CLI is accessible and responds:

```bash
harnix --help
```

Check the installed version:

```bash
harnix --version
```

## Platform compatibility

Harnix runs on any operating system that supports Node.js 20 or later, including macOS, Linux, and Windows. There are no native binary dependencies — the CLI is pure JavaScript compiled from TypeScript. It works in CI environments (GitHub Actions, GitLab CI, CircleCI, Azure Pipelines) with no additional setup beyond having Node.js available.

## Upgrading

When installed globally, upgrade to the latest version with:

```bash
npm update --global harnix
```

When using `npx`, you always get the latest published version by default. To pin a specific version:

```bash
npx harnix@0.14.0 scan .
```
