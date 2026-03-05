import type { ScanContext, CheckResult } from '../../src/types.js';

const WHY_THIS_MATTERS =
  'Duplicated sources of truth lead to inconsistencies, stale documentation, and conflicting configurations. Consolidate each concern into a single canonical location.';

interface SemanticGroup {
  name: string;
  patterns: RegExp[];
}

const SEMANTIC_GROUPS: SemanticGroup[] = [
  {
    name: 'Legal / Policies',
    patterns: [
      /^legal\//i,
      /^policies\//i,
      /^docs\/legal\//i,
      /^docs\/policies\//i,
    ],
  },
  {
    name: 'Styling / Brand',
    patterns: [
      /^styling\//i,
      /^brand\//i,
      /^design\//i,
      /^specs\/styling\//i,
      /^docs\/brand\//i,
      /^docs\/design\//i,
    ],
  },
  {
    name: 'Configuration',
    patterns: [], // handled separately via config file detection
  },
  {
    name: 'Architecture',
    patterns: [
      /^docs\/architecture\//i,
      /^specs\//i,
      /^adr\//i,
      /^decisions\//i,
      /^docs\/adr\//i,
      /^docs\/decisions\//i,
    ],
  },
  {
    name: 'API Specs',
    patterns: [], // handled separately via OpenAPI file detection
  },
  {
    name: 'Database Config',
    patterns: [], // handled separately via DB config file detection
  },
];

function statusFromScore(score: number): 'pass' | 'partial' | 'fail' {
  const percent = Math.round(score * 100);
  if (percent >= 75) return 'pass';
  if (percent >= 25) return 'partial';
  return 'fail';
}

interface Violation {
  group: string;
  locations: string[];
}

function detectDirectoryViolations(files: string[]): Violation[] {
  const normalizedFiles = files.map((f) => f.replace(/\\/g, '/'));
  const violations: Violation[] = [];

  for (const group of SEMANTIC_GROUPS) {
    if (group.patterns.length === 0) continue;

    const matchedDirs = new Set<string>();
    for (const file of normalizedFiles) {
      for (const pattern of group.patterns) {
        if (pattern.test(file)) {
          // Extract the matched directory prefix
          const match = file.match(pattern);
          if (match) {
            matchedDirs.add(match[0].replace(/\/$/, ''));
          }
        }
      }
    }

    if (matchedDirs.size >= 2) {
      violations.push({
        group: group.name,
        locations: Array.from(matchedDirs),
      });
    }
  }

  return violations;
}

function detectConfigViolations(files: string[]): Violation | null {
  const normalizedFiles = files.map((f) => f.replace(/\\/g, '/'));

  // Find config files at different directory levels
  const configFiles = normalizedFiles.filter((f) =>
    /\.(config)\.[a-z]+$/i.test(f),
  );

  // Group by base config name
  const configGroups = new Map<string, string[]>();
  for (const f of configFiles) {
    const basename = f
      .split('/')
      .pop()!
      .replace(/\.(config)\.[a-z]+$/i, '');
    const existing = configGroups.get(basename) ?? [];
    existing.push(f);
    configGroups.set(basename, existing);
  }

  // Find env files in different locations
  const envFiles = normalizedFiles.filter(
    (f) =>
      /(?:^|\/)\.env(?:\.[a-z]+)?$/i.test(f) &&
      !f.includes('node_modules'),
  );
  const envDirs = new Set(
    envFiles.map((f) => {
      const parts = f.split('/');
      return parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    }),
  );

  const violations: string[] = [];
  for (const [name, paths] of configGroups) {
    const dirs = new Set(
      paths.map((p) => {
        const parts = p.split('/');
        return parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      }),
    );
    if (dirs.size >= 2) {
      violations.push(...paths);
    }
  }
  if (envDirs.size >= 2) {
    violations.push(...envFiles);
  }

  return violations.length >= 2
    ? { group: 'Configuration', locations: violations }
    : null;
}

function detectApiSpecViolations(files: string[]): Violation | null {
  const normalizedFiles = files.map((f) => f.replace(/\\/g, '/'));
  const apiSpecFiles = normalizedFiles.filter(
    (f) =>
      /(?:openapi|swagger)\.(json|ya?ml)$/i.test(f) &&
      !f.includes('node_modules'),
  );

  if (apiSpecFiles.length < 2) return null;

  const dirs = new Set(
    apiSpecFiles.map((f) => {
      const parts = f.split('/');
      return parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    }),
  );

  return dirs.size >= 2
    ? { group: 'API Specs', locations: apiSpecFiles }
    : null;
}

function detectDbConfigViolations(files: string[]): Violation | null {
  const normalizedFiles = files.map((f) => f.replace(/\\/g, '/'));
  const dbConfigPatterns = [
    /(?:^|\/)(?:database|db)\.(config|json|ya?ml|toml)$/i,
    /(?:^|\/)knexfile\.[a-z]+$/i,
    /(?:^|\/)ormconfig\.[a-z]+$/i,
    /(?:^|\/)prisma\/schema\.prisma$/i,
    /(?:^|\/)drizzle\.config\.[a-z]+$/i,
  ];

  const dbFiles = normalizedFiles.filter((f) =>
    dbConfigPatterns.some((p) => p.test(f)),
  );

  if (dbFiles.length < 2) return null;

  const dirs = new Set(
    dbFiles.map((f) => {
      const parts = f.split('/');
      return parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
    }),
  );

  return dirs.size >= 2
    ? { group: 'Database Config', locations: dbFiles }
    : null;
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const { files } = ctx;

  const violations: Violation[] = [
    ...detectDirectoryViolations(files),
  ];

  const configViolation = detectConfigViolations(files);
  if (configViolation) violations.push(configViolation);

  const apiViolation = detectApiSpecViolations(files);
  if (apiViolation) violations.push(apiViolation);

  const dbViolation = detectDbConfigViolations(files);
  if (dbViolation) violations.push(dbViolation);

  if (violations.length === 0) {
    return {
      id: 'source-of-truth',
      name: 'Source of truth',
      category: 'organization',
      tier: 'important',
      score: 1.0,
      status: 'pass',
      summary: 'No single source of truth violations detected',
      details:
        'No duplicate sources were found across the 6 semantic groups (Legal, Styling, Configuration, Architecture, API Specs, Database Config).',
      recommendations: [
        'Continue consolidating each concern into a single canonical location.',
      ],
      references: [],
      whyThisMatters: WHY_THIS_MATTERS,
    };
  }

  const score = Math.max(0, 1 - violations.length * 0.25);

  const recommendations = violations.map(
    (v) =>
      `Consolidate ${v.group}: found overlapping locations at ${v.locations.join(', ')}.`,
  );

  const references = violations.flatMap((v) => v.locations);

  return {
    id: 'source-of-truth',
    name: 'Source of truth',
    category: 'organization',
    tier: 'important',
    score,
    status: statusFromScore(score),
    summary: `${violations.length} SSOT violation(s) detected across ${violations.map((v) => v.group).join(', ')}`,
    details: `Detected potential single source of truth violations in ${violations.length} semantic group(s). Each violation indicates 2+ locations serving the same concern, which risks inconsistency.`,
    recommendations,
    references,
    whyThisMatters: WHY_THIS_MATTERS,
  };
}
