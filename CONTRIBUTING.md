# Contributing to Harnix

Thank you for your interest in contributing to Harnix! This guide covers everything you need to get started.

## Conventional Commits

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

| Type | Description |
|---|---|
| `feat` | A new feature or functionality |
| `fix` | A bug fix |
| `docs` | Documentation-only changes |
| `style` | Code style changes (formatting, semicolons, etc.) |
| `refactor` | Code changes that neither fix a bug nor add a feature |
| `test` | Adding or updating tests |
| `chore` | Maintenance tasks (dependencies, build config, etc.) |

### Examples

```text
feat(checks): add new dependency-audit check
fix(engine): handle missing meta.yaml gracefully
docs: update scoring methodology in README
test(checks): add edge cases for agent-skills check
```

## Issue Types

| Type | Description |
|---|---|
| Task | A specific piece of work |
| Bug | An unexpected problem or behavior |
| Feat | A request, idea, or new functionality |
| Plan | A strategy or set of steps to reach a goal |

## Adding a New Check

Harnix uses a plugin architecture — adding a new check requires **zero engine changes**. Follow these steps:

### 1. Create the check directory

```bash
mkdir checks/<your-check-id>
```

Use kebab-case for the directory name (e.g., `dependency-audit`, `license-check`).

### 2. Create `meta.yaml`

```yaml
id: your-check-id
name: Your Check Name
category: quality-gates    # or: agent-readiness, documentation, infrastructure, organization, quality
tier: important            # critical | important | nice-to-have
description: >-
  A clear description of what this check evaluates
  and why it matters for harness readiness.
tags:
  - relevant
  - keywords
applicableTo: all          # all | software | non-software
```

**Required fields:**

| Field | Type | Description |
|---|---|---|
| `id` | string (kebab-case) | Unique check identifier, must match directory name |
| `name` | string | Human-readable check name |
| `category` | string | Grouping category for reports |
| `tier` | enum | `critical`, `important`, or `nice-to-have` — determines scoring weight |
| `description` | string | What the check does and why |
| `tags` | string[] | Keywords for discoverability |
| `applicableTo` | enum | `all`, `software`, or `non-software` |

### 3. Create `check.ts`

```typescript
import type { ScanContext, CheckResult } from "../../src/types.js";

export default async function (ctx: ScanContext): Promise<CheckResult> {
  let score = 0;
  const findings: string[] = [];
  const recommendations: string[] = [];

  // Your check logic here
  // ctx.rootPath — absolute path to the scanned repository
  // ctx.files — array of relative file paths in the repository
  // ctx.repoType — "software" or "non-software"
  // ctx.gitInfo — git metadata (remotes, branch, submodules, etc.)

  if (/* condition met */) {
    score = 1.0;
    findings.push("Detected the thing we're looking for");
  } else {
    recommendations.push("Add the thing we're looking for");
  }

  return {
    id: "your-check-id",
    name: "Your Check Name",
    category: "quality-gates",
    tier: "important",
    score,
    findings,
    recommendations,
  };
}
```

The check function receives a `ScanContext` and must return a `CheckResult`. The score must be a float between `0.0` (complete fail) and `1.0` (complete pass).

### 4. Verify

```bash
npm run build
node bin/harnix.js scan .
```

Your new check should appear in the scan output automatically — the engine discovers checks by scanning `checks/*/meta.yaml` at startup.

### 5. Add tests

Create `tests/checks/your-check-id.test.ts` with at minimum:

- A **pass** case (score = 1.0)
- A **fail** case (score = 0)
- A **partial/edge** case (intermediate score)

Use the existing test fixtures in `tests/fixtures/` or create new ones as needed.

## Testing

Harnix uses [Vitest](https://vitest.dev/) for testing.

### Running tests

```bash
npm test              # Run all tests once
npx vitest            # Run in watch mode
npx vitest run        # Run once (same as npm test)
```

### Test structure

```
tests/
├── checks/           # One test file per check
│   ├── agents-md.test.ts
│   ├── documentation.test.ts
│   └── ...
├── engine.test.ts    # Engine discovery, execution, scoring
├── report.test.ts    # Output formatters (console, Markdown, HTML)
└── fixtures/         # Sample directory structures for tests
    ├── pass-all/
    ├── fail-all/
    └── partial/
```

### Writing tests

```typescript
import { describe, it, expect } from "vitest";
import check from "../../checks/your-check-id/check.js";
import type { ScanContext } from "../../src/types.js";

describe("your-check-id", () => {
  it("should pass when condition is met", async () => {
    const ctx: ScanContext = {
      rootPath: "/path/to/fixture",
      files: ["relevant-file.md"],
      repoType: "software",
      gitInfo: { /* ... */ },
    };
    const result = await check(ctx);
    expect(result.score).toBe(1.0);
  });
});
```

## Code Style

- **Language:** TypeScript (strict mode)
- **Module system:** ESM (`"type": "module"` in package.json)
- **Import extensions:** Use `.js` extensions in import paths (required by `moduleResolution: "NodeNext"`)
- **Types:** Use native TypeScript types, not JSDoc annotations
- **Exports:** Check files export a single `default async function`
- **Error handling:** Checks should not throw — return a score of `0` with descriptive findings instead
- **Node.js version:** 20.11.0 or later (required for `import.meta.dirname`)

## Development Setup

```bash
git clone https://github.com/anakotai/harnix.git
cd harnix
npm install
npm run build    # Compile TypeScript
npm test         # Run tests
```

## License

By contributing to Harnix, you agree that your contributions will be licensed under the [Apache 2.0 License](LICENSE).
