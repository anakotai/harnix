# Harnix

Local, offline toolkit that guides project owners and AI agents toward foundational operating context for effective agent-assisted work. Harnix discovers and runs applicable checks against a repository path and produces a heuristic signal-coverage report with prioritized recommendations. It does not remediate, host, or perform general compliance analysis, and it does not claim that a high score predicts agent success.

## Language

**Harnix**:
A local, offline assessment toolkit: given a repository path, it measures whether foundational operating-context guidelines and structures are present, and points project owners and agents at what to add or fix next. Running an assessment does not use the network.
_Avoid_: remediator, hosted service, compliance platform, general compliance product, agent-success predictor

**Local-only assessment**:
The scan path reads the filesystem and writes local reports only — no network calls, telemetry, or remote APIs during assessment. Installers and external docs may use the network; they are not part of assessment.
_Avoid_: cloud scoring, phone-home telemetry, online knowledge fetch as part of `scan`

**Harness readiness**:
How prepared a repository is for productive AI-assisted development and human collaboration, measured only by *discoverable operating context* — whether foundational guidelines and structures are present for an agent or human to find how to work in the repo. Not the quality, truth, currency, or effectiveness of that context in a comprehensive way.
_Avoid_: compliance score, security posture, code quality score, pipeline health, semantic correctness of docs, “agents will succeed”

**Signal**:
A locally observable, machine-detectable fact about the repository (file presence, path patterns, length bands, simple content heuristics) used as evidence that foundational operating context exists. When the same content is reachable via both a real path and an in-repo symlink, the inventory counts it once under a single path identity (not every alias).
_Avoid_: judgment, LLM analysis, runtime verification, human review finding; requiring every symlink alias path to appear separately in the inventory

**Heuristic**:
A cheap, deterministic rule over signals (presence, size bands, path patterns, simple text markers). Harnix assessments use heuristics only; they do not require human or LLM reasoning.
_Avoid_: deep analysis, semantic validation, comprehensive quality assessment

**Score**:
A heuristic coverage measure over discoverable operating-context signals. A check score is that check’s own 0–1 result; a local score is the tier-weighted mean of evaluated checks; a rollup score averages local/child scores up the tree. Not a prediction of agent success, not an assessment of guidance quality beyond cheap structural proxies. Comparable across runs only for the same Harnix version and the same effective check set (skip/only, repo type, depth, and catalog). Catalog or heuristic changes may move numbers without repo changes.
_Avoid_: quality grade, agent productivity metric, compliance rating, success probability; multi-year score continuity; comparing scores across different Harnix versions without caveat

**Assessment**:
Harnix's primary job: measure readiness signals via heuristics, diagnose gaps, and recommend fixes so a project owner knows the direction of work. Does not apply fixes, and does not comprehensively assess fidelity or runtime quality of the context found.
_Avoid_: remediation, enforcement platform, continuous monitoring, human or LLM reasoning as part of assessment

**Check**:
A discrete, auto-discovered readiness evaluation unit (identity + scoring logic) that contributes a score and recommendations to a report by applying heuristics to signals.
_Avoid_: rule, plugin (unless speaking about extensibility), lint, policy

**Built-in check**:
A check in Harnix’s opinionated core catalog. Admitted only if it (1) uses local heuristics only, (2) targets discoverable operating context or structural provisions that make that context usable, (3) yields a clear recommendation for a project owner or agent, and (4) is honestly scoped by repo type. Not a general static-analysis, security, or quality linter.
_Avoid_: CVE scanner, style linter, pipeline health monitor, test-effectiveness judge, runtime verifier, org-specific policy pack as core identity

**Custom check**:
A check added via the extension path (check directory plugin) for local or organizational needs. Secondary to the product; not required for Harnix to fulfill its primary job.
_Avoid_: treating custom checks as the core product; conflating with built-in catalog

**Recommendation**:
A prioritized, actionable suggestion derived from a check result that tells a project owner or agent what foundational guidance or structure to add or improve next. Not an automated change applied by Harnix. Ordering: higher tier first, then lower check score within the same tier. In recursive scans, recommendations stay attributed to their scan target rather than a single unattributed flat list.
_Avoid_: fix, patch, remediation, autofix; ordering only by score while ignoring tier; mixing child tips into the parent without path attribution

**Project owner**:
A primary audience for Harnix reports — the human responsible for making the repository workable for agents and collaborators. Consumes scores and recommendations to decide what foundational context to add or fix.
_Avoid_: end user (ambiguous), developer (too narrow); treating the owner as the only primary audience

**Agent (report consumer)**:
A primary audience alongside the project owner — an AI coding agent that may read the report or recommendations to see which operating-context gaps exist and what to work on next. Does not change Harnix’s non-remediator role: agents may act on recommendations outside Harnix; Harnix itself still only assesses.
_Avoid_: treating agents as the sole audience; implying Harnix applies fixes for agents; agent-success certification via score

**Scan target**:
A repository path Harnix assesses as one unit: its own file list, repo type, applicable checks, and local score. The path passed to `scan` is a scan target; so is every non-noise subdirectory in the recursive walk (subject to `--depth`).
_Avoid_: treating the whole monorepo as a single flat file list without per-path assessment; limiting children to only declared git submodules or workspace packages; scanning noise paths

**Child scan target**:
A direct subdirectory of a scan target that is included in the recursive assessment walk. Every project subdirectory is a potential child unless cut off by `--depth` or treated as **noise** (not assessed). Discovery is not limited to `.gitmodules` or workspace manifests. The same rule applies at every level: each child may itself have child scan targets.
_Avoid_: “only submodules”; “only npm workspaces”; treating only gitlinks as children; assessing dependency trees, VCS metadata, or other noise as readiness

**Noise**:
Paths that are never scan targets and never enter rollup — including VCS metadata (e.g. `.git`), dependency/install trees (e.g. `node_modules`), other non-project junk, and anything ignored by the scan target’s `.gitignore`. Harnix does not assess the “state of noise.”
_Avoid_: treating ignored or generated dependency trees as children; scoring `node_modules` / `.git`

**Local score**:
The heuristic signal-coverage score for one scan target from that path’s own evaluated checks only: a **tier-weighted mean** of those check scores (fixed shipped tier weights). Always available as the granular assessment for that path. Inapplicable and skipped checks are excluded from the mean.
_Avoid_: using “overall” to mean only the local score when children exist; unweighted mean of checks; user-defined tier weights

**Tier**:
A fixed importance class on a check (`critical`, `important`, `nice-to-have`) that sets its weight in the local score. Expresses the toolkit’s opinionated priority among signal classes, not end-user preference.
_Avoid_: severity (security), priority (issue tracker), user-configurable weight

**Check status**:
A coverage-strength label derived from a check score (`pass` / `partial` / `fail` via fixed percentage thresholds). Indicates how completely that check’s expected signals were found by heuristics — not certification that the harness works or that agents will succeed.
_Avoid_: certification, quality pass, CI gate (unless an explicit fail-under threshold is added later), agent-ready stamp

**Score band**:
A coverage-strength label for an aggregate score (Poor / Needs Improvement / Good / Excellent via fixed ranges). Same non-claim as check status: strength of signal coverage, not operational readiness certification.
_Avoid_: readiness certification, letter grade of team maturity, prediction of agent productivity

**Rollup score**:
At a scan target that has scored **direct** children, the overall stance for that path: an equal-weight average of that path’s **local score** and each **successfully scored direct (1st) child’s** score only. Each child uses its own rollup when it has children, otherwise its local score — the same recursive rule at every level. Non-direct descendants are not averaged again at the parent; they influence the parent only through the direct child’s rollup. Children that fail to produce a score are omitted from the mean and surfaced as errors. Paths not scanned (e.g. beyond `--depth`) are not members of the mean. Child importance/weight is not assessed yet. Not worst-child-dominates. Parent and child may use different applicable check sets (different repo types); that does not block averaging their scores.
_Avoid_: min/weakest-link as the overall monorepo score; flat mean of the entire subtree; size-weighted rollup (not yet defined); counting failed children as zero; averaging only workspace/submodule children when the walk includes all subdirectories; applying check tiers inside the parent/child rollup average

**Repo type**:
An applicability classification for a scan target (`software` or `non-software`) that selects which checks are meaningful to run. Not a score, not a quality judgment, not a product split. Detection is best-effort; explicit override is first-class.
_Avoid_: quality label, project category for humans, forcing parent type onto children

**Check catalog**:
The shipped set of built-in checks. Opinionated and growable under the built-in admission rules; not an open-ended policy marketplace.
_Avoid_: “any check anyone wants ships in core”; security product catalog

**Report**:
The presentation of one assessment (for a scan target and, when present, its child tree): local and rollup scores as applicable, coverage-strength statuses and bands, per-check results, prioritized recommendations, and surfaced child-scan errors. Console, Markdown, and HTML are three views of the same assessment, not separate products. Durable views should be actionable without re-running the CLI, should record enough run identity (at least Harnix version) for version-scoped comparison, and should not imply certification of agent success.
_Avoid_: treating formats as different products; audit certificate; agent-success certificate; timeless scores without version context

**Scan configuration**:
Effective options for a scan run (skip, only, type, depth, output). CLI flags override `.harnix.yaml` for the same key. CLI `--only` ignores all skip sources for that run. When `only` comes only from config, CLI `--skip` still applies. Child scan targets inherit the same effective skip/only/depth policy from the invocation; they do not load a separate child `.harnix.yaml` by default. Repo type is detected per scan target unless the invocation set an explicit type on the root only (root override does not force children).
_Avoid_: silent inversion of CLI vs config precedence; per-child config files as an assumed default

**Process exit status**:
The CLI process exit code is about run success (could the assessment complete?), not readiness certification. A completed scan with low signal-coverage scores still exits 0 by default. Child scan failures are surfaced in the report and omitted from rollup; they do not by themselves require a non-zero exit. Non-zero exit is for unusable invocations (bad args, unreadable root path, fatal engine errors). Optional fail-under thresholds remain a secondary/future concern.
_Avoid_: treating exit 0 as “agents will succeed”; treating any partial score as a CI failure without an explicit threshold feature

**Secondary concerns**:
Plugin-style check extensibility, Anakot HaaS integration, subrepo importance weighting for rollup, full productization of non-noise recursive walk + rollup scoring (domain intent; not all of it is shipped yet), and optional CI fail-under thresholds support or extend Harnix but do not redefine its primary job as an assessment toolkit for project owners and agents. Default success exit is not a readiness certification. Network use outside assessment (package install, docs sites, HaaS) is out of band. CI is a secondary consumer, not a dual-primary audience with owners and agents.
_Avoid_: treating the check framework, HaaS, or CI gating as the product identity
