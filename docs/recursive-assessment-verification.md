# Recursive assessment verification

Issue: [#33](https://github.com/anakotai/harnix/issues/33). Decision: [assess all non-noise directories](decisions/0001-assess-all-non-noise-directories.md).

## Characterization

Measured locally on WSL with Node 24 on 2026-10-27 using the built engine, all applicable checks, unlimited assessment depth, and the durable report writer. The synthetic tree has branching factor three, four levels below its root, and three files per directory (363 files). Times characterize this machine and filesystem, not a performance guarantee.

| Tree | Assessed targets | Directory reads | Scan time | Markdown bytes | HTML bytes |
|------|-----------------:|----------------:|----------:|---------------:|-----------:|
| Harnix checkout | 48 | 49 | 187 ms | 225,942 | 313,061 |
| Nested source fixture | 121 | 122 | 208 ms | 542,015 | 724,877 |

Directory reads include one catalog discovery plus one inventory read per visible directory. Inventories include all descendants even when assessment depth is limited. File lists are retained per target, so memory scales with files times nesting depth; check execution and full report size scale with assessed targets and findings. The catalog is parsed once per invocation. Reports render each child's detailed findings once, without repeating the full child document at every ancestor.

The checkout's local score was 74.76%, while its recursive rollup was 20.12%. This illustrates the intended effect of assessing ordinary source/docs directories with the current root-oriented check catalog. It is not evidence of a regression in those directories or a prediction of agent success.

## Production-path evidence

Built-engine scans and Markdown/HTML report writes completed for both trees. After writing reports, a second scan produced identical targets, checks, errors, and scores. A real CLI invocation with `--depth 1` also assessed `docs/` as an ordinary child, independent of declarations.

The generated reports, measured fixture, script, and machine-readable measurements remain in the ignored `tmp/issue-33-*` paths in the working checkout. They are local verification artifacts; this document preserves the results in Git.

## Regression coverage

Tests cover ordinary and empty directories, deep declarations, nested ignore overrides and parent pruning, root-anchored patterns, negation, built-in priority, symlink aliases/cycles/escapes, custom and root output directories, unrelated timestamp-named files, repeated report writes, depth-independent inventories, independent child types, inherited filters, unreadable children, unavailable scores, direct-child rollup arithmetic, and complete child findings in durable reports.

Build, lint, all 129 tests, the full TypeScript check, and the documentation site build passed. Real scans and report writes were repeated successfully.

## Independent review limitation

The planning cross-check returned usable DeepSeek and Gemini responses. The implementation review panel did not complete: DeepSeek timed out on both 300-second attempts, and the configured Beam model was unavailable on both attempts. Neither produced usable findings; this is not a clean independent review. CodeRabbit was skipped at the operator's request. Review logs remain under `tmp/issue-33-review/`.
