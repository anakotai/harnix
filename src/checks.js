import { promises as fs } from "node:fs";
import path from "node:path";
import { findCiSystem } from "./scanner.js";

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
  const hasAgents = files.includes("AGENTS.md");
  const hasClaude = files.includes("CLAUDE.md");

  if (!hasAgents && !hasClaude) {
    return {
      id: "agents-md",
      name: "Agent guidance",
      tier: "critical",
      score: 0,
      status: "fail",
      summary: "No AGENTS.md or CLAUDE.md found",
      recommendations: [
        "Create AGENTS.md with focused guidance for build, test, and repo conventions."
      ]
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
      tier: "critical",
      score: 0.1,
      status: "fail",
      summary: `Could not read ${sourceFile}: ${message}`,
      recommendations: [
        `Fix permissions or encoding issues so ${sourceFile} can be read during scans.`
      ]
    };
  }
  const trimmed = content.trim();

  let score = 1;
  let summary = `${sourceFile} present`;
  let recommendations = [
    "Keep AGENTS.md current as workflows, commands, and repository conventions change."
  ];

  if (trimmed.length === 0) {
    score = 0.6;
    summary = `${sourceFile} is empty but intentionally present`;
    recommendations = [
      "Add concise, high-value agent guidance (common commands, traps, and repo-specific rules)."
    ];
  } else if (trimmed.length < 120) {
    score = 0.8;
    summary = `${sourceFile} has brief guidance`;
    recommendations = [
      "Expand AGENTS.md with concrete build, test, and module-specific workflow instructions."
    ];
  }

  return {
    id: "agents-md",
    name: "Agent guidance",
    tier: "critical",
    score,
    status: statusFromScore(score),
    summary,
    recommendations
  };
}

/**
 * @param {string} rootPath
 * @param {string[]} files
 */
async function checkDocumentation(rootPath, files) {
  const hasReadme = files.includes("README.md");
  const hasDocs = files.some(
    (filePath) =>
      filePath.startsWith("docs/") ||
      filePath.startsWith("prds/")
  );

  if (!hasReadme) {
    return {
      id: "documentation",
      name: "Documentation",
      tier: "critical",
      score: 0.2,
      status: "fail",
      summary: "No README.md found",
      recommendations: [
        "Add a substantive README.md with project purpose, setup steps, and usage examples."
      ]
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
      tier: "critical",
      score: 0.2,
      status: "fail",
      summary: `Unable to read README.md: ${message}`,
      recommendations: [
        "Repair README.md readability issues so onboarding and tooling checks can parse it."
      ]
    };
  }
  const substantiveReadme = readme.trim().length > 120;
  const score = (substantiveReadme ? 0.6 : 0.3) + (hasDocs ? 0.4 : 0);

  let summary = "README.md and docs structure present";
  let recommendations = [
    "Maintain README.md and docs/prds as the single source of truth for onboarding and operations."
  ];
  if (!substantiveReadme) {
    summary = "README.md exists but is brief";
    recommendations = [
      "Expand README.md with setup, run, test, and contribution guidance to reduce onboarding friction."
    ];
  } else if (!hasDocs) {
    summary = "README.md exists but no docs/ or prds/ directory";
    recommendations = [
      "Add docs/ or prds/ for durable product, architecture, and process documentation."
    ];
  }

  return {
    id: "documentation",
    name: "Documentation",
    tier: "critical",
    score: Math.min(1, score),
    status: statusFromScore(score),
    summary,
    recommendations
  };
}

/**
 * @param {string[]} files
 */
async function checkCiPipeline(files) {
  const ciSystem = findCiSystem(files);

  if (!ciSystem) {
    return {
      id: "ci-pipeline",
      name: "CI pipeline",
      tier: "important",
      score: 0,
      status: "fail",
      summary: "No CI/CD configuration detected",
      recommendations: [
        "Add a CI pipeline (for example GitHub Actions) to automate lint, test, and build checks."
      ]
    };
  }

  return {
    id: "ci-pipeline",
    name: "CI pipeline",
    tier: "important",
    score: 1,
    status: "pass",
    summary: `Detected ${ciSystem}`,
    recommendations: [
      "Keep CI checks reliable and enforce required status checks before merging."
    ]
  };
}
