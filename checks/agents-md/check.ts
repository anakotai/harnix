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

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const { rootPath, files } = ctx;
  const hasAgents = files.includes('AGENTS.md');
  const hasClaude = files.includes('CLAUDE.md');

  if (!hasAgents && !hasClaude) {
    return {
      id: 'agents-md',
      name: 'Agent guidance',
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
      name: 'Agent guidance',
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

  let score = 1;
  let summary = `${sourceFile} present`;
  let details = `${sourceFile} is present with ${guidanceLength} characters of guidance.`;
  let recommendations = [
    'Keep AGENTS.md current as workflows, commands, and repository conventions change.',
  ];

  if (trimmed.length === 0) {
    score = 0.6;
    summary = `${sourceFile} is empty but intentionally present`;
    details = `${sourceFile} exists but contains no guidance text.`;
    recommendations = [
      'Add concise, high-value agent guidance (common commands, traps, and repo-specific rules).',
    ];
  } else if (trimmed.length < 120) {
    score = 0.8;
    summary = `${sourceFile} has brief guidance`;
    details = `${sourceFile} contains only ${guidanceLength} characters; more context is likely needed for reliable agent operation.`;
    recommendations = [
      'Expand AGENTS.md with concrete build, test, and module-specific workflow instructions.',
    ];
  }

  return {
    id: 'agents-md',
    name: 'Agent guidance',
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
