import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScanContext, CheckResult } from '../../src/types.js';

const WHY_THIS_MATTERS =
  'Shared documentation keeps onboarding predictable and reduces repeated clarification work across humans and agents. Keep README and docs updated with setup, run, and troubleshooting steps.';

const REQUIRED_WEIGHT = 3;
const OPTIONAL_WEIGHT = 1;
const MAX_REFERENCE_COUNT = 20;

const DOC_EXTENSIONS = new Set([
  '.md',
  '.mdx',
  '.txt',
  '.rst',
  '.adoc',
  '.yaml',
  '.yml',
  '.json',
  '.toml',
]);

interface Signal {
  id: string;
  label: string;
  required: boolean;
  patterns: RegExp[];
  recommendation: string;
}

const REQUIRED_SIGNALS: Signal[] = [
  {
    id: 'docs-structure',
    label: 'docs/prds directory',
    required: true,
    patterns: [/^docs\//i, /^prds\//i],
    recommendation:
      'Add a docs/ or prds/ directory for durable product, architecture, and process documentation.',
  },
  {
    id: 'styling-brand',
    label: 'styling/brand guide',
    required: true,
    patterns: [
      /(^|\/)(styling|brand|design)(\/|[-_.])/i,
      /(^|\/)(style-guide|brand-guide|design-guide)(\/|[-_.])/i,
    ],
    recommendation:
      'Add styling/brand documentation (for example docs/styling/guide.md or docs/brand.md).',
  },
  {
    id: 'adr-architecture',
    label: 'ADR/architecture docs',
    required: true,
    patterns: [
      /(^|\/)(adr|adrs|architecture|decisions)(\/|[-_.])/i,
      /(^|\/)docs\/decisions(\/|[-_.])/i,
    ],
    recommendation:
      'Add architecture decision records or architecture docs (for example docs/decisions/ or docs/architecture/).',
  },
  {
    id: 'infra-environment',
    label: 'infrastructure/environment docs',
    required: true,
    patterns: [/(^|\/)(infra|infrastructure|environment|tooling)(\/|[-_.])/i],
    recommendation:
      'Add infrastructure/environment/tooling documentation (for example docs/infrastructure.md or docs/tooling.md).',
  },
  {
    id: 'deployment',
    label: 'deployment/ops docs',
    required: true,
    patterns: [/(^|\/)(deploy|deployment|ops)(\/|[-_.])/i],
    recommendation:
      'Add deployment/operations documentation (for example docs/deployment.md or docs/ops.md).',
  },
];

const OPTIONAL_SIGNALS: Signal[] = [
  {
    id: 'pitch-deck',
    label: 'pitch/deck docs',
    required: false,
    patterns: [/(^|\/)(pitch|deck)(\/|[-_.])/i],
    recommendation:
      'Optional: add pitch/deck documentation for product and sales alignment.',
  },
  {
    id: 'company-profile',
    label: 'company/profile docs',
    required: false,
    patterns: [/(^|\/)(company|profile)(\/|[-_.])/i],
    recommendation:
      'Optional: add company/profile documentation for cross-functional onboarding.',
  },
  {
    id: 'tech-stack',
    label: 'tech stack docs',
    required: false,
    patterns: [
      /(^|\/)(tech|stack)(\/|[-_.])/i,
      /(^|\/)tech-stack(\/|[-_.])/i,
    ],
    recommendation:
      'Optional: add a tech stack document describing key frameworks and infrastructure choices.',
  },
  {
    id: 'api-docs',
    label: 'API docs',
    required: false,
    patterns: [/(^|\/)(api|swagger|openapi)(\/|[-_.])/i],
    recommendation:
      'Optional: add API documentation (OpenAPI/Swagger specs or API reference docs).',
  },
  {
    id: 'database-schema',
    label: 'database schema docs',
    required: false,
    patterns: [/(^|\/)(db|schema|database)(\/|[-_.])/i],
    recommendation:
      'Optional: add database/schema documentation to reduce data-model ambiguity.',
  },
];

interface SignalResult {
  signal: Signal;
  matched: boolean;
  matches: string[];
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function hasSubstantiveDocContent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;

  const withoutFrontmatter = trimmed.replace(/^---[\s\S]*?---\s*/m, '');
  const lines = withoutFrontmatter
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return false;

  const nonHeadingLines = lines.filter((line) => !/^#{1,6}\s+/.test(line));
  if (nonHeadingLines.length === 0) return false;

  const bodyText = nonHeadingLines
    .join(' ')
    .replace(/[`*_>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return bodyText.length >= 30;
}

function readmePlaceholderLike(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return true;

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return true;

  const nonHeadingLines = lines.filter((line) => !/^#{1,6}\s+/.test(line));
  return nonHeadingLines.length === 0;
}

function evaluateSignals(files: string[], signals: Signal[]): SignalResult[] {
  return signals.map((signal) => {
    const matches = uniqueSorted(
      files.filter((filePath) =>
        signal.patterns.some((pattern) => pattern.test(filePath))
      )
    );
    return {
      signal,
      matched: matches.length > 0,
      matches,
    };
  });
}

async function findNonSubstantiveDocs(
  rootPath: string,
  files: string[],
  readmePath: string | null,
  signalMatches: SignalResult[]
): Promise<string[]> {
  const candidateFiles = new Set<string>();

  if (readmePath) {
    candidateFiles.add(readmePath);
  }

  for (const result of signalMatches) {
    for (const match of result.matches) {
      const ext = path.extname(match).toLowerCase();
      if (DOC_EXTENSIONS.has(ext)) {
        candidateFiles.add(match);
      }
    }
  }

  const nonSubstantive: string[] = [];
  for (const relativePath of candidateFiles) {
    try {
      const content = await fs.readFile(path.join(rootPath, relativePath), 'utf8');
      if (!hasSubstantiveDocContent(content)) {
        nonSubstantive.push(relativePath);
      }
    } catch {
      nonSubstantive.push(relativePath);
    }
  }

  return uniqueSorted(nonSubstantive);
}

function statusFromScore(score: number): 'pass' | 'partial' | 'fail' {
  const percent = Math.round(score * 100);
  if (percent >= 75) return 'pass';
  if (percent >= 25) return 'partial';
  return 'fail';
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const { rootPath, files } = ctx;
  const normalizedFiles = uniqueSorted(files.map(normalizePath));
  const readmePath = normalizedFiles.find((f) => f === 'README.md') ?? null;

  if (!readmePath) {
    return {
      id: 'documentation',
      name: 'Documentation',
      category: 'documentation',
      tier: 'critical',
      score: 0.1,
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

  let readme: string;
  try {
    readme = await fs.readFile(path.join(rootPath, readmePath), 'utf8');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      id: 'documentation',
      name: 'Documentation',
      category: 'documentation',
      tier: 'critical',
      score: 0.1,
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

  const requiredResults = evaluateSignals(normalizedFiles, REQUIRED_SIGNALS);
  const optionalResults = evaluateSignals(normalizedFiles, OPTIONAL_SIGNALS);

  const readmeSubstantive =
    hasSubstantiveDocContent(readme) && !readmePlaceholderLike(readme);
  const readmeScoreWeight = REQUIRED_WEIGHT;
  const requiredTotalWeight = readmeScoreWeight + requiredResults.length * REQUIRED_WEIGHT;
  const optionalTotalWeight = optionalResults.length * OPTIONAL_WEIGHT;
  const totalWeight = requiredTotalWeight + optionalTotalWeight;

  let weightedMet = 0;
  if (readmeSubstantive) {
    weightedMet += readmeScoreWeight;
  }

  for (const result of requiredResults) {
    if (result.matched) {
      weightedMet += REQUIRED_WEIGHT;
    }
  }
  for (const result of optionalResults) {
    if (result.matched) {
      weightedMet += OPTIONAL_WEIGHT;
    }
  }

  const allSignalResults = [...requiredResults, ...optionalResults];
  const nonSubstantiveDocs = await findNonSubstantiveDocs(
    rootPath,
    normalizedFiles,
    readmePath,
    allSignalResults
  );

  const invalidDocPenalty = Math.min(0.3, nonSubstantiveDocs.length * 0.1);
  const baseScore = totalWeight > 0 ? weightedMet / totalWeight : 0;
  const score = Math.max(0, Math.min(1, baseScore - invalidDocPenalty));

  const requiredMetCount =
    (readmeSubstantive ? 1 : 0) + requiredResults.filter((r) => r.matched).length;
  const requiredTotalCount = 1 + requiredResults.length;
  const optionalMetCount = optionalResults.filter((r) => r.matched).length;
  const optionalTotalCount = optionalResults.length;

  let summary = `Documentation signals: ${requiredMetCount}/${requiredTotalCount} required, ${optionalMetCount}/${optionalTotalCount} optional`;
  if (!readmeSubstantive) {
    summary = 'README.md exists but is not substantive';
  }
  if (nonSubstantiveDocs.length > 0) {
    summary += ` (${nonSubstantiveDocs.length} placeholder/empty doc file(s) detected)`;
  }

  const missingRequiredLabels = [
    ...(readmeSubstantive ? [] : ['substantive README.md']),
    ...requiredResults.filter((r) => !r.matched).map((r) => r.signal.label),
  ];

  const detailsLines = [
    `README.md: ${readmeSubstantive ? 'substantive' : 'present but placeholder/brief'}.`,
    `Required signals met: ${requiredMetCount}/${requiredTotalCount}.`,
    `Optional signals met: ${optionalMetCount}/${optionalTotalCount}.`,
  ];

  if (missingRequiredLabels.length > 0) {
    detailsLines.push(`Missing required signals: ${missingRequiredLabels.join(', ')}.`);
  }

  if (nonSubstantiveDocs.length > 0) {
    detailsLines.push(
      `Non-substantive documentation files: ${nonSubstantiveDocs.join(', ')}.`
    );
  }

  const recommendations: string[] = [];
  if (!readmeSubstantive) {
    recommendations.push(
      'Expand README.md beyond a heading/placeholder with setup, usage, testing, and troubleshooting guidance.'
    );
  }
  for (const result of requiredResults) {
    if (!result.matched) {
      recommendations.push(result.signal.recommendation);
    }
  }
  if (nonSubstantiveDocs.length > 0) {
    recommendations.push(
      `Replace placeholder/empty docs with substantive content: ${nonSubstantiveDocs.join(', ')}.`
    );
  }

  const missingOptional = optionalResults.filter((r) => !r.matched);
  if (missingOptional.length > 0) {
    recommendations.push(
      `Optional documentation gaps: ${missingOptional
        .map((result) => result.signal.label)
        .join(', ')}.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Maintain documentation quality and keep key reference docs current as the project evolves.'
    );
  }

  const references = uniqueSorted(
    [
      readmePath,
      ...allSignalResults.flatMap((result) => result.matches),
      ...nonSubstantiveDocs,
    ].filter((value): value is string => Boolean(value))
  ).slice(0, MAX_REFERENCE_COUNT);

  return {
    id: 'documentation',
    name: 'Documentation',
    category: 'documentation',
    tier: 'critical',
    score,
    status: statusFromScore(score),
    summary,
    details: detailsLines.join(' '),
    recommendations,
    references,
    whyThisMatters: WHY_THIS_MATTERS,
  };
}
