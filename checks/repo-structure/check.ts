import { statusFromScore, type ScanContext, type CheckResult } from '../../src/types.js';

const WHY_THIS_MATTERS =
  'Clear repository structure improves onboarding, simplifies CI/CD, and helps agents navigate codebases predictably. Organize source code in dedicated directories and configure workspace tooling for monorepos.';

const SOURCE_DIRS = ['src', 'lib', 'packages', 'apps', 'modules', 'crates'];


export default async function (ctx: ScanContext): Promise<CheckResult> {
  const { files, gitInfo } = ctx;
  const normalizedFiles = files.map((f) => f.replace(/\\/g, '/'));

  // Check for source code organization directories
  const detectedSourceDirs = SOURCE_DIRS.filter((dir) =>
    normalizedFiles.some((f) => f.startsWith(`${dir}/`)),
  );
  const hasSourceOrg = detectedSourceDirs.length > 0;

  // Check separation of concerns: ratio of root-level files to total files
  const rootFiles = normalizedFiles.filter((f) => !f.includes('/'));
  const rootRatio =
    normalizedFiles.length > 0
      ? rootFiles.length / normalizedFiles.length
      : 1;
  const goodSeparation = rootRatio < 0.3;

  // Check monorepo signals from gitInfo
  const hasSubmodules = gitInfo.hasSubmodules;
  const hasWorkspaces = gitInfo.hasWorkspaces;
  const hasMonorepoTooling = hasSubmodules || hasWorkspaces;

  // Flag: submodules without workspace config
  const submodulesWithoutWorkspace =
    hasSubmodules && !hasWorkspaces;

  // Scoring
  let score = 0;

  // Source organization: 0.35
  if (hasSourceOrg) score += 0.35;

  // Separation of concerns: 0.25
  if (goodSeparation) score += 0.25;
  else if (rootRatio < 0.5) score += 0.15;

  // Monorepo tooling: 0.25
  if (hasMonorepoTooling) {
    score += submodulesWithoutWorkspace ? 0.15 : 0.25;
  }

  // Basic structure exists (not everything in root): 0.15
  if (normalizedFiles.some((f) => f.includes('/'))) score += 0.15;

  score = Math.min(1, score);

  const recommendations: string[] = [];
  if (!hasSourceOrg) {
    recommendations.push(
      'Organize source code under a dedicated directory (src/, lib/, or packages/).',
    );
  }
  if (!goodSeparation) {
    recommendations.push(
      `${rootFiles.length} of ${normalizedFiles.length} files are at the root level. Move implementation files into subdirectories.`,
    );
  }
  if (submodulesWithoutWorkspace) {
    recommendations.push(
      'Submodules detected without workspace configuration. Add workspace tooling (npm workspaces, pnpm, Nx, etc.) for consistent dependency management.',
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Repository structure is well-organized. Keep source code and configuration cleanly separated.',
    );
  }

  const references: string[] = [];
  if (detectedSourceDirs.length > 0) {
    references.push(...detectedSourceDirs.map((d) => `${d}/`));
  }
  if (hasSubmodules) references.push('.gitmodules');

  const details = [
    `Source directories: ${hasSourceOrg ? detectedSourceDirs.join(', ') : 'none detected'}.`,
    `Root file ratio: ${rootFiles.length}/${normalizedFiles.length} (${Math.round(rootRatio * 100)}%).`,
    `Monorepo signals: ${hasSubmodules ? 'submodules' : 'no submodules'}, ${hasWorkspaces ? 'workspaces configured' : 'no workspaces'}.`,
  ].join(' ');

  return {
    id: 'repo-structure',
    name: 'Repo structure',
    category: 'infrastructure',
    tier: 'important',
    score,
    status: statusFromScore(score),
    summary: hasSourceOrg
      ? `Source organized in ${detectedSourceDirs.join(', ')}${hasMonorepoTooling ? ' with monorepo tooling' : ''}`
      : 'No clear source code organization detected',
    details,
    recommendations,
    references,
    whyThisMatters: WHY_THIS_MATTERS,
  };
}
