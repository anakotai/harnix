export interface ScanContext {
  rootPath: string;
  files: string[];
  repoType: 'software' | 'non-software';
  gitInfo: {
    hasSubmodules: boolean;
    submodules: string[];
    hasWorkspaces: boolean;
    workspaces: string[];
    workspaceConfig: Record<string, boolean | string[]>;
  };
}

export interface CheckResult {
  id: string;
  name: string;
  category: string;
  tier: 'critical' | 'important' | 'nice-to-have';
  score: number;
  status: 'pass' | 'partial' | 'fail';
  summary: string;
  details: string;
  whyThisMatters: string;
  recommendations: string[];
  references: string[];
}

export const SCORE_BANDS = {
  poor: { min: 0, max: 25, label: 'Poor' },
  needsImprovement: { min: 26, max: 50, label: 'Needs Improvement' },
  good: { min: 51, max: 75, label: 'Good' },
  excellent: { min: 76, max: 100, label: 'Excellent' },
} as const;

export interface RecursiveScanResult {
  kind: 'submodule' | 'workspace';
  path: string;
  absolutePath: string;
  result?: unknown;
  error?: string;
}
