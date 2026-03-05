import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScanContext, CheckResult } from '../../src/types.js';

const WHY_THIS_MATTERS =
  'Shared documentation keeps onboarding predictable and reduces repeated clarification work across humans and agents. Keep README and docs updated with setup, run, and troubleshooting steps.';

function statusFromScore(score: number): 'pass' | 'partial' | 'fail' {
  const percent = Math.round(score * 100);
  if (percent >= 75) return 'pass';
  if (percent >= 25) return 'partial';
  return 'fail';
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const { rootPath, files } = ctx;
  const hasReadme = files.includes('README.md');
  const hasDocsDir = files.some((f) => f.startsWith('docs/'));
  const hasPrdsDir = files.some((f) => f.startsWith('prds/'));
  const hasDocs = hasDocsDir || hasPrdsDir;

  if (!hasReadme) {
    return {
      id: 'documentation',
      name: 'Documentation',
      category: 'documentation',
      tier: 'critical',
      score: 0.2,
      status: 'fail',
      summary: 'No README.md found',
      details:
        'The repository does not include a root README.md, which is a core onboarding artifact.',
      recommendations: [
        'Add a substantive README.md with project purpose, setup steps, and usage examples.',
      ],
      references: [],
      whyThisMatters: WHY_THIS_MATTERS,
    };
  }

  const readmePath = path.join(rootPath, 'README.md');
  let readme: string;
  try {
    readme = await fs.readFile(readmePath, 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: 'documentation',
      name: 'Documentation',
      category: 'documentation',
      tier: 'critical',
      score: 0.2,
      status: 'fail',
      summary: `Unable to read README.md: ${message}`,
      details: 'README.md exists but could not be read during scanning.',
      recommendations: [
        'Repair README.md readability issues so onboarding and tooling checks can parse it.',
      ],
      references: ['README.md'],
      whyThisMatters: WHY_THIS_MATTERS,
    };
  }

  const readmeLength = readme.trim().length;
  const substantiveReadme = readmeLength > 120;
  const score = Math.min(1, (substantiveReadme ? 0.6 : 0.3) + (hasDocs ? 0.4 : 0));

  let summary = 'README.md and docs structure present';
  let details = `README.md contains ${readmeLength} characters and supporting docs directories are present.`;
  let recommendations = [
    'Maintain README.md and docs/prds as the single source of truth for onboarding and operations.',
  ];

  if (!substantiveReadme) {
    summary = 'README.md exists but is brief';
    details = `README.md contains ${readmeLength} characters and appears too short for comprehensive onboarding.`;
    recommendations = [
      'Expand README.md with setup, run, test, and contribution guidance to reduce onboarding friction.',
    ];
  } else if (!hasDocs) {
    summary = 'README.md exists but no docs/ or prds/ directory';
    details =
      'README.md is substantive, but no docs/ or prds/ directory was found for durable documentation.';
    recommendations = [
      'Add docs/ or prds/ for durable product, architecture, and process documentation.',
    ];
  }

  const references: string[] = ['README.md'];
  if (hasDocsDir) references.push('docs/');
  if (hasPrdsDir) references.push('prds/');

  return {
    id: 'documentation',
    name: 'Documentation',
    category: 'documentation',
    tier: 'critical',
    score,
    status: statusFromScore(score),
    summary,
    details,
    recommendations,
    references,
    whyThisMatters: WHY_THIS_MATTERS,
  };
}
