---
title: Contributing
description: How to contribute checks, docs, and fixes to Harnix.
---

## Ways to contribute

- Improve existing checks and recommendations
- Add or refine report output
- Expand documentation and examples
- Report issues and propose feature requests

## Local development

```bash
git clone https://github.com/anakotai/harnix.git
cd harnix
npm install
```

Run the CLI against a target repository:

```bash
node bin/harnix.js scan .
```

Run docs locally:

```bash
cd docs
npm install
npm run dev
```

## Contribution quality bar

- Keep changes focused and testable
- Update docs when behavior changes
- Prefer explicit check IDs and deterministic output wording
- Avoid network dependencies in scan execution
