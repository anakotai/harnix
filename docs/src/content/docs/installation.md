---
title: Installation
description: Install and run Harnix using npm, npx, or from source.
---

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Zero-install usage

Run Harnix without installing globally:

```bash
npx harnix scan .
```

## Global install

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

## Verify the CLI help output

```bash
harnix --help
```
