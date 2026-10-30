# Harnix

Harnix is a local, offline assessment toolkit for project owners and AI coding agents. It measures discoverable operating-context signals and recommends improvements; it does not apply fixes or certify agent success. Extensions, HaaS integration, and CI gating are secondary concerns.

## Language

**Harness readiness**:
Coverage of discoverable operating context that helps agents and humans find how to work in a repository. It does not establish the context's correctness, currency, or effectiveness.
_Avoid_: compliance score, security posture, code quality score, agent-success prediction

**Local-only assessment**:
An assessment that reads the filesystem and writes local reports without network calls, telemetry, or remote APIs. Package installation and external documentation sit outside this boundary.

**Signal**:
A locally observable fact, such as file presence, path patterns, content length, or simple text markers, used as evidence of operating context.
_Avoid_: human review finding, runtime verification

**Heuristic**:
A deterministic rule that evaluates signals without human or LLM reasoning.
_Avoid_: semantic validation, comprehensive quality assessment

**Assessment**:
Evaluation of a scan target's readiness signals, producing scores, findings, and recommendations.
_Avoid_: remediation, enforcement, continuous monitoring

**Check**:
A discrete readiness evaluation that applies heuristics to signals and returns a score, findings, and recommendations.
_Avoid_: lint, policy; plugin when referring to the evaluation itself

**Built-in check**:
A check in Harnix's opinionated core catalog, admitted only when it uses local heuristics, targets discoverable operating context or supporting structure, yields actionable recommendations, and has honest repo-type applicability.
_Avoid_: general static analysis, security scanning, runtime verification

**Custom check**:
A check supplied through the extension path for local or organizational needs, outside the built-in catalog.

**Check catalog**:
The shipped set of built-in checks, governed by the built-in admission criteria.
_Avoid_: open-ended policy marketplace

**Recommendation**:
A prioritized suggestion telling a project owner or agent what guidance or structure to add or improve. Recommendations remain attributed to their scan target.
_Avoid_: patch, autofix

**Project owner**:
The human responsible for making a repository workable for agents and collaborators; a primary report consumer alongside agents.

**Agent (report consumer)**:
An AI coding agent that uses findings and recommendations to identify operating-context gaps. Any changes it makes happen outside Harnix's assessment.

**Scan target**:
A repository path assessed as one unit, with its own file inventory, repo type, applicable checks, and local score. The initial path and every included non-noise subdirectory are scan targets.
_Avoid_: treating only declared submodules or workspace packages as targets

**Child scan target**:
A direct subdirectory included in a target's recursive assessment. Descendants contribute to ancestors through these direct parent-child relationships.

**Noise**:
Paths excluded from inventory and assessment, including VCS metadata, dependencies, build outputs, generated assessment reports, and ignored content.

**Repo type**:
A per-target applicability classification (`software` or `non-software`) that selects meaningful checks; detection can be explicitly overridden.
_Avoid_: quality label, inheriting the parent's type automatically

**Score**:
A heuristic signal-coverage measure, comparable only across the same Harnix version and effective check set, repo types, and depth.
_Avoid_: quality grade, productivity metric, success probability

**Local score**:
The tier-weighted mean of one target's evaluated check scores, excluding skipped, inapplicable, and not-assessed checks. It is unavailable when no checks were evaluated; zero is an evaluated score.
_Avoid_: overall score when children contribute

**Tier**:
A fixed check importance class (`critical`, `important`, `nice-to-have`) that determines local-score weight and recommendation priority.
_Avoid_: security severity, user-configurable weight

**Check status**:
A check's signal-coverage label (`pass`, `partial`, `fail`), or `not-assessed` when no applicable supported categories can be established. Not-assessed results carry no score weight or missing-evidence recommendations.
_Avoid_: certification, CI gate

**Score band**:
An aggregate coverage label: Poor, Needs Improvement, Good, or Excellent.
_Avoid_: readiness certification, team maturity grade

**Rollup score**:
The equal-weight mean of a target's available local score and each successfully scored direct child's effective score (its rollup, otherwise local). Unavailable scores and failed or unscanned children are omitted; with no available scores the rollup is unavailable.
_Avoid_: weakest-link score, flat subtree mean, size-weighted mean, failed children counted as zero

**Report**:
A presentation of an assessment and its child tree, including scores, findings, recommendations, errors, and run identity for version-scoped comparison. Console, Markdown, HTML, and opt-in versioned JSON are views of the same assessment.
_Avoid_: audit certificate, separate scoring models per format
