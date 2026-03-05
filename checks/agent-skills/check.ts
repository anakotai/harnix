import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScanContext, CheckResult } from '../../src/types.js';

const WHY_THIS_MATTERS =
  'Well-structured agent skills enable predictable autonomous workflows. Skills directories with valid frontmatter and no commented-out code reduce security risk and improve agent reliability.';

const SKILL_DIR_NAMES = ['skills', '.skills'];
const VALID_OPTIONAL_DIRS = new Set(['scripts', 'references', 'assets']);
const COMMENTED_CODE_PATTERNS = [
  /\/\/\s*(import|export|const|let|var|function|class|return|if|for|while)\b/,
  /#\s*(import|def|class|return|if|for|while)\b/,
  /\/\*[\s\S]*?\b(function|class|return|import)\b[\s\S]*?\*\//,
];

function statusFromScore(score: number): 'pass' | 'partial' | 'fail' {
  const percent = Math.round(score * 100);
  if (percent >= 75) return 'pass';
  if (percent >= 25) return 'partial';
  return 'fail';
}

interface SkillValidation {
  path: string;
  hasSkillMd: boolean;
  hasFrontmatter: boolean;
  hasBody: boolean;
  invalidDirs: string[];
  hasCommentedCode: boolean;
}

async function findSkillDirs(
  files: string[],
): Promise<{ dirName: string; skillPaths: string[] }[]> {
  const skillGroups: { dirName: string; skillPaths: string[] }[] = [];
  const normalizedFiles = files.map((f) => f.replace(/\\/g, '/'));

  // Check standard skill directories
  for (const dirName of SKILL_DIR_NAMES) {
    const prefix = `${dirName}/`;
    const matchingFiles = normalizedFiles.filter((f) => f.startsWith(prefix));
    if (matchingFiles.length > 0) {
      // Find subdirectories that contain SKILL.md
      const subdirs = new Set<string>();
      for (const f of matchingFiles) {
        const parts = f.slice(prefix.length).split('/');
        if (parts.length >= 2) {
          subdirs.add(parts[0]);
        }
      }
      skillGroups.push({
        dirName,
        skillPaths: Array.from(subdirs).map((s) => `${dirName}/${s}`),
      });
    }
  }

  // Check for directories containing SKILL.md anywhere
  const skillMdFiles = normalizedFiles.filter((f) =>
    f.endsWith('/SKILL.md'),
  );
  for (const skillMdFile of skillMdFiles) {
    const skillDir = path.dirname(skillMdFile);
    const parentDir = path.dirname(skillDir);
    const alreadyCovered = skillGroups.some((g) =>
      g.skillPaths.includes(skillDir),
    );
    if (!alreadyCovered && parentDir !== '.') {
      const existing = skillGroups.find((g) => g.dirName === parentDir);
      if (existing) {
        existing.skillPaths.push(skillDir);
      } else {
        skillGroups.push({
          dirName: parentDir,
          skillPaths: [skillDir],
        });
      }
    }
  }

  return skillGroups;
}

async function validateSkill(
  rootPath: string,
  skillPath: string,
  files: string[],
): Promise<SkillValidation> {
  const normalizedFiles = files.map((f) => f.replace(/\\/g, '/'));
  const prefix = `${skillPath}/`;
  const skillFiles = normalizedFiles.filter((f) => f.startsWith(prefix));

  const skillMdPath = `${skillPath}/SKILL.md`;
  const hasSkillMd = normalizedFiles.includes(skillMdPath);

  let hasFrontmatter = false;
  let hasBody = false;
  let hasCommentedCode = false;

  if (hasSkillMd) {
    try {
      const content = await fs.readFile(
        path.join(rootPath, skillMdPath),
        'utf8',
      );
      const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      hasFrontmatter = frontmatterMatch !== null;
      const bodyContent = hasFrontmatter
        ? content.slice(content.indexOf('---', 3) + 3).trim()
        : content.trim();
      hasBody = bodyContent.length > 0;
    } catch {
      // File exists in listing but unreadable
    }
  }

  // Check for invalid optional directories
  const subDirs = new Set<string>();
  for (const f of skillFiles) {
    const relative = f.slice(prefix.length);
    const firstSegment = relative.split('/')[0];
    if (relative.includes('/')) {
      subDirs.add(firstSegment);
    }
  }
  const invalidDirs = Array.from(subDirs).filter(
    (d) => !VALID_OPTIONAL_DIRS.has(d),
  );

  // Security check: look for commented-out code in skill files
  for (const f of skillFiles) {
    if (f.endsWith('.md') || f.endsWith('.yaml') || f.endsWith('.yml')) {
      continue;
    }
    try {
      const content = await fs.readFile(path.join(rootPath, f), 'utf8');
      for (const pattern of COMMENTED_CODE_PATTERNS) {
        if (pattern.test(content)) {
          hasCommentedCode = true;
          break;
        }
      }
    } catch {
      // Skip unreadable files
    }
    if (hasCommentedCode) break;
  }

  return {
    path: skillPath,
    hasSkillMd,
    hasFrontmatter,
    hasBody,
    invalidDirs,
    hasCommentedCode,
  };
}

export default async function (ctx: ScanContext): Promise<CheckResult> {
  const { rootPath, files } = ctx;
  const skillGroups = await findSkillDirs(files);

  if (skillGroups.length === 0) {
    return {
      id: 'agent-skills',
      name: 'Agent skills',
      category: 'agent-readiness',
      tier: 'important',
      score: 0,
      status: 'fail',
      summary: 'No skills directories detected',
      details:
        'No skills/, .skills/, or directories containing SKILL.md were found.',
      recommendations: [
        'Add a skills/ directory with SKILL.md files to define agent skill capabilities.',
      ],
      references: [],
      whyThisMatters: WHY_THIS_MATTERS,
    };
  }

  const allSkillPaths = skillGroups.flatMap((g) => g.skillPaths);
  const validations: SkillValidation[] = [];
  for (const skillPath of allSkillPaths) {
    validations.push(await validateSkill(rootPath, skillPath, files));
  }

  const totalSkills = validations.length;
  const compliant = validations.filter(
    (v) =>
      v.hasSkillMd &&
      v.hasFrontmatter &&
      v.hasBody &&
      v.invalidDirs.length === 0,
  );
  const securityFlags = validations.filter((v) => v.hasCommentedCode);

  let score: number;
  if (
    compliant.length === totalSkills &&
    securityFlags.length === 0
  ) {
    score = 1.0;
  } else if (compliant.length > 0 && securityFlags.length === 0) {
    score = 0.5 + (compliant.length / totalSkills) * 0.3;
  } else if (compliant.length > 0) {
    score = 0.3 + (compliant.length / totalSkills) * 0.2;
  } else {
    score = 0.2;
  }

  const recommendations: string[] = [];
  const nonCompliant = validations.filter(
    (v) =>
      !v.hasSkillMd || !v.hasFrontmatter || !v.hasBody,
  );
  if (nonCompliant.length > 0) {
    recommendations.push(
      `Fix ${nonCompliant.length} skill(s) missing SKILL.md, frontmatter, or body content: ${nonCompliant.map((v) => v.path).join(', ')}.`,
    );
  }
  const withInvalidDirs = validations.filter(
    (v) => v.invalidDirs.length > 0,
  );
  if (withInvalidDirs.length > 0) {
    recommendations.push(
      'Use only scripts/, references/, or assets/ as subdirectories within skills.',
    );
  }
  if (securityFlags.length > 0) {
    recommendations.push(
      `Review ${securityFlags.length} skill(s) with commented-out code (potential security risk): ${securityFlags.map((v) => v.path).join(', ')}.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Keep skills up to date as agent capabilities evolve.',
    );
  }

  const references = skillGroups.map((g) => `${g.dirName}/`);

  return {
    id: 'agent-skills',
    name: 'Agent skills',
    category: 'agent-readiness',
    tier: 'important',
    score,
    status: statusFromScore(score),
    summary: `Found ${totalSkills} skill(s): ${compliant.length} compliant, ${securityFlags.length} security flag(s)`,
    details: `Detected ${totalSkills} skill(s) across ${skillGroups.length} skills director${skillGroups.length === 1 ? 'y' : 'ies'}. ${compliant.length} fully compliant with Agent Skills spec. ${securityFlags.length} flagged for commented-out code.`,
    recommendations,
    references,
    whyThisMatters: WHY_THIS_MATTERS,
  };
}
