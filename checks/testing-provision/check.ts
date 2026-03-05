import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScanContext, CheckResult } from '../../src/types.js';

const WHY_THIS_MATTERS =
  'Automated tests reduce regression risk and make agent-driven changes safer to ship. Keep tests isolated and document exact test commands so verification is fast and consistent.';

function statusFromScore(score: number): 'pass' | 'partial' | 'fail' {
  const percent = Math.round(score * 100);
  if (percent >= 75) return 'pass';
  if (percent >= 25) return 'partial';
  return 'fail';
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const { rootPath, files } = ctx;
  const lowerFiles = files.map((f) => f.toLowerCase());

  const testFiles = files.filter((filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    const lower = normalized.toLowerCase();
    const base = path.basename(lower);
    return (
      lower.startsWith('test/') ||
      lower.startsWith('tests/') ||
      lower.startsWith('__tests__/') ||
      lower.includes('/__tests__/') ||
      /\.(test|spec)\.[cm]?[jt]sx?$/.test(base)
    );
  });

  const hasTests = testFiles.length > 0;
  const hasIsolatedTests = lowerFiles.some((filePath) => {
    const normalized = filePath.replace(/\\/g, '/');
    return (
      normalized.startsWith('test/') ||
      normalized.startsWith('tests/') ||
      normalized.startsWith('__tests__/') ||
      normalized.includes('/__tests__/')
    );
  });

  const testDocFile = files.find((filePath) =>
    /(^|\/)(test|tests|testing)([-_a-z0-9]*)\.(md|mdx)$/i.test(
      filePath.replace(/\\/g, '/'),
    ),
  );

  let readmeMentionsTesting = false;
  try {
    const readme = await fs.readFile(path.join(rootPath, 'README.md'), 'utf8');
    readmeMentionsTesting =
      /^#{1,6}\s+.*\b(test|tests|testing)\b/im.test(readme) ||
      /\b(test|tests|testing)\b/i.test(readme);
  } catch (error: unknown) {
    if (
      !(
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as NodeJS.ErrnoException).code === 'ENOENT'
      )
    ) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        id: 'testing-provision',
        name: 'Testing provision',
        category: 'quality',
        tier: 'important',
        score: 0.1,
        status: 'fail',
        summary: `Could not read README.md: ${message}`,
        details:
          'Tests may exist, but README.md could not be read to verify testing documentation quality.',
        recommendations: [
          'Fix README.md readability and include a concise testing section with runnable commands.',
        ],
        references: ['README.md'],
        whyThisMatters: WHY_THIS_MATTERS,
      };
    }
  }

  const hasTestingDocs = Boolean(testDocFile) || readmeMentionsTesting;
  const score =
    (hasTests ? 0.6 : 0) +
    (hasIsolatedTests ? 0.25 : 0) +
    (hasTestingDocs ? 0.15 : 0);

  const references: string[] = [];
  if (testDocFile) references.push(testDocFile);
  if (readmeMentionsTesting) references.push('README.md');
  if (testFiles.length > 0) references.push(...testFiles.slice(0, 3));

  let summary = 'Tests and testing guidance detected';
  let details = `Detected ${testFiles.length} test file(s), ${
    hasIsolatedTests ? 'with' : 'without'
  } dedicated test directories, and ${
    hasTestingDocs ? 'with' : 'without'
  } explicit testing documentation.`;
  const recommendations: string[] = [
    'Keep tests deterministic and ensure testing commands are documented for contributors and agents.',
  ];

  if (!hasTests) {
    summary = 'No test files detected';
    details =
      'No common test files or test directories were detected. This limits confidence in automated changes.';
    recommendations.splice(
      0,
      recommendations.length,
      'Add automated tests under a dedicated test directory (for example tests/ or __tests__/).',
    );
  } else if (!hasIsolatedTests && !hasTestingDocs) {
    summary = 'Tests exist but quality signals are incomplete';
    details =
      'Test files were found, but there is no dedicated test directory and no clear testing documentation.';
    recommendations.splice(
      0,
      recommendations.length,
      'Group tests in a dedicated directory and document how to run them in README.md.',
    );
  } else if (!hasIsolatedTests) {
    summary = 'Tests exist but are not clearly isolated';
    details =
      'Test files were found, but no dedicated test directory was detected. Clear test layout improves maintainability.';
    recommendations.splice(
      0,
      recommendations.length,
      'Move tests into a dedicated directory (for example tests/ or __tests__/) to improve discoverability.',
    );
  } else if (!hasTestingDocs) {
    summary = 'Tests exist but testing documentation is missing';
    details =
      'Automated tests and isolated structure were detected, but no explicit testing documentation was found.';
    recommendations.splice(
      0,
      recommendations.length,
      'Add a testing section to README.md with exact commands contributors should run.',
    );
  }

  return {
    id: 'testing-provision',
    name: 'Testing provision',
    category: 'quality',
    tier: 'important',
    score,
    status: statusFromScore(score),
    summary,
    details,
    recommendations,
    references,
    whyThisMatters: WHY_THIS_MATTERS,
  };
}
