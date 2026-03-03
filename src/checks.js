import { promises as fs } from "node:fs";
import path from "node:path";
import { findCiSystem } from "./scanner.js";
import { explanationForCheck } from "./knowledge-base.js";

const WHY_AGENT_GUIDANCE_FALLBACK =
  "Clear agent instructions reduce workflow mistakes and make automated contributions predictable. Add AGENTS.md guidance for setup, tests, and repository-specific guardrails.";
const WHY_DOCUMENTATION_FALLBACK =
  "Durable documentation lowers onboarding time and keeps delivery and compliance evidence repeatable. Keep README and docs updated with setup, run, and troubleshooting steps.";
const WHY_CI_PIPELINE_FALLBACK =
  "Automated CI catches regressions early and enforces quality gates before changes are merged. Add or tighten CI checks for lint, tests, and builds before merge.";

/**
 * @param {number} score
 * @returns {"pass" | "partial" | "fail"}
 */
function statusFromScore(score) {
  const percent = Math.round(score * 100);
  if (percent >= 75) {
    return "pass";
  }
  if (percent >= 25) {
    return "partial";
  }
  return "fail";
}

/**
 * @param {string} rootPath
 * @param {string[]} files
 */
export async function runChecks(rootPath, files) {
  return [
    await checkAgentGuidance(rootPath, files),
    await checkDocumentation(rootPath, files),
    await checkCiPipeline(files)
  ];
}

/**
 * @param {string} rootPath
 * @param {string[]} files
 */
async function checkAgentGuidance(rootPath, files) {
  const whyThisMatters = await explanationForCheck("agents-md", WHY_AGENT_GUIDANCE_FALLBACK);
  const hasAgents = files.includes("AGENTS.md");
  const hasClaude = files.includes("CLAUDE.md");

  if (!hasAgents && !hasClaude) {
    return {
      id: "agents-md",
      name: "Agent guidance",
      category: "agent-readiness",
      tier: "critical",
      score: 0,
      status: "fail",
      summary: "No AGENTS.md or CLAUDE.md found",
      details:
        "No root-level agent instruction file was detected. Agents are more likely to mis-handle repository-specific workflows without explicit guidance.",
      recommendations: [
        "Create AGENTS.md with focused guidance for build, test, and repo conventions."
      ],
      references: [],
      whyThisMatters
    };
  }

  const sourceFile = hasAgents ? "AGENTS.md" : "CLAUDE.md";
  const sourcePath = path.join(rootPath, sourceFile);
  let content;
  try {
    content = await fs.readFile(sourcePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "agents-md",
      name: "Agent guidance",
      category: "agent-readiness",
      tier: "critical",
      score: 0.1,
      status: "fail",
      summary: `Could not read ${sourceFile}: ${message}`,
      details: `${sourceFile} exists but could not be read during scanning.`,
      recommendations: [
        `Fix permissions or encoding issues so ${sourceFile} can be read during scans.`
      ],
      references: [sourceFile],
      whyThisMatters
    };
  }
  const trimmed = content.trim();
  const guidanceLength = trimmed.length;

  let score = 1;
  let summary = `${sourceFile} present`;
  let details = `${sourceFile} is present with ${guidanceLength} characters of guidance.`;
  let recommendations = [
    "Keep AGENTS.md current as workflows, commands, and repository conventions change."
  ];

  if (trimmed.length === 0) {
    score = 0.6;
    summary = `${sourceFile} is empty but intentionally present`;
    details = `${sourceFile} exists but contains no guidance text.`;
    recommendations = [
      "Add concise, high-value agent guidance (common commands, traps, and repo-specific rules)."
    ];
  } else if (trimmed.length < 120) {
    score = 0.8;
    summary = `${sourceFile} has brief guidance`;
    details = `${sourceFile} contains only ${guidanceLength} characters; more context is likely needed for reliable agent operation.`;
    recommendations = [
      "Expand AGENTS.md with concrete build, test, and module-specific workflow instructions."
    ];
  }

  return {
    id: "agents-md",
    name: "Agent guidance",
    category: "agent-readiness",
    tier: "critical",
    score,
    status: statusFromScore(score),
    summary,
    details,
    recommendations,
    references: [sourceFile],
    whyThisMatters
  };
}

/**
 * @param {string} rootPath
 * @param {string[]} files
 */
async function checkDocumentation(rootPath, files) {
  const whyThisMatters = await explanationForCheck("documentation", WHY_DOCUMENTATION_FALLBACK);
  const hasReadme = files.includes("README.md");
  const hasDocsDir = files.some((filePath) => filePath.startsWith("docs/"));
  const hasPrdsDir = files.some((filePath) => filePath.startsWith("prds/"));
  const hasDocs = hasDocsDir || hasPrdsDir;

  if (!hasReadme) {
    return {
      id: "documentation",
      name: "Documentation",
      category: "documentation",
      tier: "critical",
      score: 0.2,
      status: "fail",
      summary: "No README.md found",
      details:
        "The repository does not include a root README.md, which is a core onboarding artifact.",
      recommendations: [
        "Add a substantive README.md with project purpose, setup steps, and usage examples."
      ],
      references: [],
      whyThisMatters
    };
  }

  const readmePath = path.join(rootPath, "README.md");
  let readme;
  try {
    readme = await fs.readFile(readmePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: "documentation",
      name: "Documentation",
      category: "documentation",
      tier: "critical",
      score: 0.2,
      status: "fail",
      summary: `Unable to read README.md: ${message}`,
      details: "README.md exists but could not be read during scanning.",
      recommendations: [
        "Repair README.md readability issues so onboarding and tooling checks can parse it."
      ],
      references: ["README.md"],
      whyThisMatters
    };
  }
  const readmeLength = readme.trim().length;
  const substantiveReadme = readmeLength > 120;
  const score = (substantiveReadme ? 0.6 : 0.3) + (hasDocs ? 0.4 : 0);

  let summary = "README.md and docs structure present";
  let details = `README.md contains ${readmeLength} characters and supporting docs directories are present.`;
  let recommendations = [
    "Maintain README.md and docs/prds as the single source of truth for onboarding and operations."
  ];
  if (!substantiveReadme) {
    summary = "README.md exists but is brief";
    details = `README.md contains ${readmeLength} characters and appears too short for comprehensive onboarding.`;
    recommendations = [
      "Expand README.md with setup, run, test, and contribution guidance to reduce onboarding friction."
    ];
  } else if (!hasDocs) {
    summary = "README.md exists but no docs/ or prds/ directory";
    details = "README.md is substantive, but no docs/ or prds/ directory was found for durable documentation.";
    recommendations = [
      "Add docs/ or prds/ for durable product, architecture, and process documentation."
    ];
  }

  const references = ["README.md"];
  if (hasDocsDir) {
    references.push("docs/");
  }
  if (hasPrdsDir) {
    references.push("prds/");
  }

  return {
    id: "documentation",
    name: "Documentation",
    category: "documentation",
    tier: "critical",
    score: Math.min(1, score),
    status: statusFromScore(score),
    summary,
    details,
    recommendations,
    references,
    whyThisMatters
  };
}

/**
 * @param {string[]} files
 */
async function checkCiPipeline(files) {
  const whyThisMatters = await explanationForCheck("ci-pipeline", WHY_CI_PIPELINE_FALLBACK);
  const ciSystem = findCiSystem(files);

  if (!ciSystem) {
    return {
      id: "ci-pipeline",
      name: "CI pipeline",
      category: "quality-gates",
      tier: "important",
      score: 0,
      status: "fail",
      summary: "No CI/CD configuration detected",
      details:
        "No common CI configuration markers were found (GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis CI, or Azure Pipelines).",
      recommendations: [
        "Add a CI pipeline (for example GitHub Actions) to automate lint, test, and build checks."
      ],
      references: [],
      whyThisMatters
    };
  }

  return {
    id: "ci-pipeline",
    name: "CI pipeline",
    category: "quality-gates",
    tier: "important",
    score: 1,
    status: "pass",
    summary: `Detected ${ciSystem}`,
    details: `Detected CI configuration marker: ${ciSystem}.`,
    recommendations: [
      "Keep CI checks reliable and enforce required status checks before merging."
    ],
    references: [ciSystem],
    whyThisMatters
  };
}
