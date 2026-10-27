# Assess all non-noise directories

## Context and Problem Statement

The domain defines recursive scan targets as every non-noise subdirectory, but the engine previously admitted only declared submodules and workspaces. Broad coverage exposes missing context in ordinary source directories and increases traversal work and report size.

## Decision

Implement the existing domain contract without changing the unlimited default depth or check catalog. Discover direct directories from one filtered inventory tree; declarations annotate their actual locations. Keep local and recursive rollup scores distinct, omit unavailable scores and failed children from arithmetic, and retain each target's findings in durable reports.

## Consequences

Source directories often lack root-oriented guidance and can lower rollup scores. Scores across this catalog/discovery change are not directly comparable. Operators can select `--depth 0` for a root-only assessment; depth does not truncate inventories. Built-in noise and selected dedicated outputs override ignore negations. Physical in-root paths supply one canonical identity; symlink aliases cannot reintroduce ignored content. Gitignore scope begins at the scan root, independent of workstation Git configuration.
