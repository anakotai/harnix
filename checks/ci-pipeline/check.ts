import type { ScanContext, CheckResult } from '../../src/types.js';

const WHY_THIS_MATTERS =
  'Continuous integration catches regressions early and enforces minimum quality before changes reach shared branches. Add or tighten CI checks for lint, tests, and builds before merge.';

const CI_MARKERS = [
  '.github/workflows',
  '.gitlab-ci.yml',
  '.circleci',
  'Jenkinsfile',
  '.travis.yml',
  'azure-pipelines.yml',
];

function findCiSystem(files: string[]): string | null {
  const filesLower = files.map((f) => f.toLowerCase());
  const fileSetLower = new Set(filesLower);

  for (const marker of CI_MARKERS) {
    const markerLower = marker.toLowerCase();
    if (
      fileSetLower.has(markerLower) ||
      filesLower.some((f) => f.startsWith(`${markerLower}/`))
    ) {
      return marker;
    }
  }

  return null;
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const { files } = ctx;
  const ciSystem = findCiSystem(files);

  if (!ciSystem) {
    return {
      id: 'ci-pipeline',
      name: 'CI pipeline',
      category: 'quality-gates',
      tier: 'important',
      score: 0,
      status: 'fail',
      summary: 'No CI/CD configuration detected',
      details:
        'No common CI configuration markers were found (GitHub Actions, GitLab CI, CircleCI, Jenkins, Travis CI, or Azure Pipelines).',
      recommendations: [
        'Add a CI pipeline (for example GitHub Actions) to automate lint, test, and build checks.',
      ],
      references: [],
      whyThisMatters: WHY_THIS_MATTERS,
    };
  }

  return {
    id: 'ci-pipeline',
    name: 'CI pipeline',
    category: 'quality-gates',
    tier: 'important',
    score: 1,
    status: 'pass',
    summary: `Detected ${ciSystem}`,
    details: `Detected CI configuration marker: ${ciSystem}.`,
    recommendations: [
      'Keep CI checks reliable and enforce required status checks before merging.',
    ],
    references: [ciSystem],
    whyThisMatters: WHY_THIS_MATTERS,
  };
}
