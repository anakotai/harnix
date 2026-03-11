import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScanContext, CheckResult } from '../../src/types.js';

const WHY_THIS_MATTERS =
  'Clear agent instructions prevent workflow errors and keep autonomous edits aligned with repository-specific expectations. Add AGENTS.md guidance for setup, tests, and repo-specific guardrails.';

function statusFromScore(score: number): 'pass' | 'partial' | 'fail' {
  const percent = Math.round(score * 100);
  if (percent >= 75) return 'pass';
  if (percent >= 25) return 'partial';
  return 'fail';
}

function evaluateGuidanceLength(
  sourceFile: string,
  guidanceLength: number,
): Pick<CheckResult, 'score' | 'summary' | 'details' | 'recommendations'> {
  if (guidanceLength === 0) {
    return {
      score: 0.2,
      summary: `${sourceFile} is suspiciously empty`,
      details: `${sourceFile} exists but contains no guidance text.`,
      recommendations: [
        'Add concise, repo-specific guidance covering common commands, traps, and workflow constraints.',
      ],
    };
  }

  if (guidanceLength >= 10000) {
    return {
      score: 0.2,
      summary: `${sourceFile} is suspiciously long`,
      details: `${sourceFile} contains ${guidanceLength} characters. Agent guidance this long is hard to scan quickly and likely mixes instructions with reference material.`,
      recommendations: [
        'Trim AGENTS.md to the highest-value workflow guidance and move bulky reference content into linked docs.',
      ],
    };
  }

  if (guidanceLength >= 5000) {
    return {
      score: 0.4,
      summary: `${sourceFile} is getting long`,
      details: `${sourceFile} contains ${guidanceLength} characters. The guidance is likely useful, but its length will slow agent onboarding and retrieval.`,
      recommendations: [
        'Condense AGENTS.md and link out to deeper documentation for background material or edge cases.',
      ],
    };
  }

  if (guidanceLength >= 3000) {
    return {
      score: 0.6,
      summary: `${sourceFile} is a bit long but still fine`,
      details: `${sourceFile} contains ${guidanceLength} characters. The file is still usable, but tighter instructions would improve scan efficiency.`,
      recommendations: [
        'Keep AGENTS.md focused on workflow-critical guidance and move secondary detail into linked docs if it grows further.',
      ],
    };
  }

  if (guidanceLength >= 1000) {
    return {
      score: 1,
      summary: `${sourceFile} has substantive guidance`,
      details: `${sourceFile} contains ${guidanceLength} characters of substantive guidance without being overly long.`,
      recommendations: [
        'Keep AGENTS.md current as workflows, commands, and repository conventions change.',
      ],
    };
  }

  if (guidanceLength >= 120) {
    return {
      score: 0.8,
      summary: `${sourceFile} is a bit brief but still fine`,
      details: `${sourceFile} contains ${guidanceLength} characters. The guidance is short, but still provides some direct repository context.`,
      recommendations: [
        'Expand AGENTS.md with concrete build, test, and module-specific workflow instructions if the repo has important edge cases or workflow traps.',
      ],
    };
  }

  return {
    score: 0.4,
    summary: `${sourceFile} is getting short`,
    details: `${sourceFile} contains only ${guidanceLength} characters. This is likely too little guidance for reliable agent operation.`,
    recommendations: [
      'Expand AGENTS.md with concrete build, test, and module-specific workflow instructions.',
    ],
  };
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const { rootPath, files } = ctx;
  const hasAgents = files.includes('AGENTS.md');
  const hasClaude = files.includes('CLAUDE.md');

  if (!hasAgents && !hasClaude) {
    return {
      id: 'agents-md',
      name: 'Agents guidance',
      category: 'agent-readiness',
      tier: 'critical',
      score: 0,
      status: 'fail',
      summary: 'No AGENTS.md or CLAUDE.md found',
      details:
        'No root-level agent instruction file was detected. Agents are more likely to mis-handle repository-specific workflows without explicit guidance.',
      recommendations: [
        'Create AGENTS.md with focused guidance for build, test, and repo conventions.',
      ],
      references: [],
      whyThisMatters: WHY_THIS_MATTERS,
    };
  }

  const sourceFile = hasAgents ? 'AGENTS.md' : 'CLAUDE.md';
  const sourcePath = path.join(rootPath, sourceFile);
  let content: string;
  try {
    content = await fs.readFile(sourcePath, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: 'agents-md',
      name: 'Agents guidance',
      category: 'agent-readiness',
      tier: 'critical',
      score: 0.1,
      status: 'fail',
      summary: `Could not read ${sourceFile}: ${message}`,
      details: `${sourceFile} exists but could not be read during scanning.`,
      recommendations: [
        `Fix permissions or encoding issues so ${sourceFile} can be read during scans.`,
      ],
      references: [sourceFile],
      whyThisMatters: WHY_THIS_MATTERS,
    };
  }

  const trimmed = content.trim();
  const guidanceLength = trimmed.length;
  const { score, summary, details, recommendations } = evaluateGuidanceLength(
    sourceFile,
    guidanceLength,
  );

  return {
    id: 'agents-md',
    name: 'Agents guidance',
    category: 'agent-readiness',
    tier: 'critical',
    score,
    status: statusFromScore(score),
    summary,
    details,
    recommendations,
    references: [sourceFile],
    whyThisMatters: WHY_THIS_MATTERS,
  };
}
