import { promises as fs } from "node:fs";
import path from "node:path";
import { parseDocument } from "yaml";

const SOFTWARE_MARKERS = [
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  "Gemfile",
  "pom.xml",
  "build.gradle",
  "Makefile",
  "CMakeLists.txt",
  "composer.json"
];

const CI_MARKERS = [
  ".github/workflows",
  ".gitlab-ci.yml",
  ".circleci",
  "Jenkinsfile",
  ".travis.yml",
  "azure-pipelines.yml"
];

const ROOT_WORKSPACE_MARKERS: Record<string, string> = {
  pnpmWorkspace: "pnpm-workspace.yaml",
  lerna: "lerna.json",
  nx: "nx.json",
  turborepo: "turbo.json"
};

const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist", "build"]);

export async function listFiles(rootPath: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(relativeDir: string): Promise<void> {
    const absoluteDir = path.join(rootPath, relativeDir);
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to read directory "${absoluteDir}" while scanning "${rootPath}": ${message}`
      );
    }

    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          await walk(relativePath);
        }
        continue;
      }

      files.push(relativePath);
    }
  }

  await walk(".");
  return files.map((filePath) => filePath.replace(/^[.][/\\]/, ""));
}

export function detectRepoType(files: string[]): "software" | "non-software" {
  const markerNames = new Set(SOFTWARE_MARKERS.map((marker) => marker.toLowerCase()));
  const hasDotnetSolution = files.some((filePath) => {
    const fileName = path.posix.basename(filePath.replace(/\\/g, "/")).toLowerCase();
    return fileName.endsWith(".sln") || fileName.endsWith(".csproj");
  });
  const hasSoftwareMarker = files.some((filePath) => {
    const fileName = path.posix.basename(filePath.replace(/\\/g, "/")).toLowerCase();
    return markerNames.has(fileName);
  });

  return hasSoftwareMarker || hasDotnetSolution ? "software" : "non-software";
}

export interface WorkspaceConfig {
  npmWorkspaces: boolean;
  pnpmWorkspace: boolean;
  cargoWorkspace: boolean;
  lerna: boolean;
  nx: boolean;
  turborepo: boolean;
  detected: string[];
  [key: string]: boolean | string[];
}

export interface GitInfo {
  hasSubmodules: boolean;
  submodules: string[];
  hasWorkspaces: boolean;
  workspaces: string[];
  workspaceConfig: WorkspaceConfig;
}

export async function detectGitInfo(rootPath: string, files: string[]): Promise<GitInfo> {
  const normalizedFiles = new Set(
    files.map((filePath) => filePath.replace(/\\/g, "/").toLowerCase())
  );

  const hasSubmodules = normalizedFiles.has(".gitmodules");
  const submodules = hasSubmodules ? await readSubmodulePaths(rootPath) : [];
  const npmWorkspacePatterns = await readNpmWorkspacePatterns(rootPath, normalizedFiles);
  const pnpmWorkspacePatterns = await readPnpmWorkspacePatterns(rootPath, normalizedFiles);
  const cargoWorkspaceMembers = await readCargoWorkspaceMembers(rootPath, normalizedFiles);
  const lernaWorkspacePatterns = await readLernaWorkspacePatterns(rootPath, normalizedFiles);
  const nxWorkspaceProjects = readNxWorkspaceProjects(files, normalizedFiles);

  const workspaceConfig = {
    npmWorkspaces: npmWorkspacePatterns.length > 0,
    pnpmWorkspace: pnpmWorkspacePatterns.length > 0,
    cargoWorkspace: cargoWorkspaceMembers.length > 0,
    lerna: lernaWorkspacePatterns.length > 0,
    nx: normalizedFiles.has(ROOT_WORKSPACE_MARKERS.nx),
    turborepo: normalizedFiles.has(ROOT_WORKSPACE_MARKERS.turborepo)
  };
  const workspaces = await resolveWorkspacePaths(rootPath, files, {
    npmWorkspacePatterns,
    pnpmWorkspacePatterns,
    cargoWorkspaceMembers,
    lernaWorkspacePatterns,
    nxWorkspaceProjects
  });

  const detected = Object.entries(workspaceConfig)
    .filter(([, enabled]) => enabled)
    .map(([marker]) => marker);

  return {
    hasSubmodules,
    submodules,
    hasWorkspaces: detected.length > 0,
    workspaces,
    workspaceConfig: {
      ...workspaceConfig,
      detected
    }
  };
}

async function readSubmodulePaths(rootPath: string): Promise<string[]> {
  try {
    const gitmodulesContent = await fs.readFile(path.join(rootPath, ".gitmodules"), "utf8");
    const submodulePaths = Array.from(
      gitmodulesContent.matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm),
      (match) => match[1].trim().replace(/^['"]|['"]$/g, "")
    )
      .filter((candidate) => candidate.length > 0)
      .map((candidate) => candidate.replace(/\\/g, "/"));

    return Array.from(new Set(submodulePaths));
  } catch {
    return [];
  }
}

async function readNpmWorkspacePatterns(rootPath: string, normalizedFiles: Set<string>): Promise<string[]> {
  if (!normalizedFiles.has("package.json")) {
    return [];
  }

  try {
    const packageJson = await fs.readFile(path.join(rootPath, "package.json"), "utf8");
    const parsed = JSON.parse(packageJson) as Record<string, unknown>;
    return extractWorkspacePatterns(parsed?.workspaces);
  } catch {
    return [];
  }
}

async function readPnpmWorkspacePatterns(rootPath: string, normalizedFiles: Set<string>): Promise<string[]> {
  if (!normalizedFiles.has(ROOT_WORKSPACE_MARKERS.pnpmWorkspace)) {
    return [];
  }

  try {
    const workspaceYaml = await fs.readFile(
      path.join(rootPath, ROOT_WORKSPACE_MARKERS.pnpmWorkspace),
      "utf8"
    );
    const parsed = parseDocument(workspaceYaml);
    if (parsed.errors.length > 0) {
      return [];
    }
    const rawValue = parsed.toJS() as Record<string, unknown> | null;
    return extractWorkspacePatterns(rawValue?.packages);
  } catch {
    return [];
  }
}

async function readCargoWorkspaceMembers(rootPath: string, normalizedFiles: Set<string>): Promise<string[]> {
  if (!normalizedFiles.has("cargo.toml")) {
    return [];
  }

  let cargoToml: string | undefined;
  for (const candidate of ["Cargo.toml", "cargo.toml"]) {
    try {
      cargoToml = await fs.readFile(path.join(rootPath, candidate), "utf8");
      break;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      return [];
    }
  }

  if (!cargoToml) {
    return [];
  }

  const workspaceMatch = cargoToml.match(/^\s*\[workspace\]\s*([\s\S]*?)(?=^\s*\[[^\]]+\]\s*$|$)/m);
  if (!workspaceMatch) {
    return [];
  }

  const workspaceBlock = workspaceMatch[1] ?? "";
  const membersMatch = workspaceBlock.match(/^\s*members\s*=\s*\[([\s\S]*?)\]/m);
  if (!membersMatch) {
    return [];
  }

  const membersRaw = membersMatch[1] ?? "";
  return Array.from(
    membersRaw.matchAll(/["']([^"']+)["']/g),
    (match) => normalizeRelativePath(match[1] ?? "")
  ).filter((entry) => entry.length > 0);
}

async function readLernaWorkspacePatterns(rootPath: string, normalizedFiles: Set<string>): Promise<string[]> {
  if (!normalizedFiles.has(ROOT_WORKSPACE_MARKERS.lerna)) {
    return [];
  }

  try {
    const lernaJson = await fs.readFile(path.join(rootPath, ROOT_WORKSPACE_MARKERS.lerna), "utf8");
    const parsed = JSON.parse(lernaJson) as Record<string, unknown>;
    return extractWorkspacePatterns(parsed?.packages);
  } catch {
    return [];
  }
}

function readNxWorkspaceProjects(files: string[], normalizedFiles: Set<string>): string[] {
  if (!normalizedFiles.has(ROOT_WORKSPACE_MARKERS.nx)) {
    return [];
  }

  const projectDirs = files
    .filter((filePath) => filePath.replace(/\\/g, "/").toLowerCase().endsWith("/project.json"))
    .map((filePath) => normalizeRelativePath(path.dirname(filePath)));

  return Array.from(new Set(projectDirs)).filter((entry) => entry.length > 0);
}

function extractWorkspacePatterns(value: unknown): string[] {
  const patterns: string[] = [];

  const collect = (candidate: unknown): void => {
    if (typeof candidate === "string") {
      const normalized = normalizeRelativePath(candidate);
      if (normalized.length > 0 && !normalized.startsWith("!")) {
        patterns.push(normalized);
      }
      return;
    }

    if (Array.isArray(candidate)) {
      candidate.forEach((entry: unknown) => collect(entry));
      return;
    }

    if (candidate && typeof candidate === "object") {
      for (const nested of Object.values(candidate as Record<string, unknown>)) {
        collect(nested);
      }
    }
  };

  collect(value);
  return Array.from(new Set(patterns));
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "").trim();
}

function globPatternToRegex(pattern: string): RegExp {
  let expression = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];

    if (char === "*" && next === "*") {
      expression += ".*";
      index += 1;
      continue;
    }

    if (char === "*") {
      expression += "[^/]*";
      continue;
    }

    if (char === "?") {
      expression += "[^/]";
      continue;
    }

    if ("+.^$()|[]{}\\".includes(char!)) {
      expression += `\\${char}`;
      continue;
    }

    expression += char;
  }

  expression += "$";
  return new RegExp(expression);
}

function deriveDirectoryPaths(files: string[]): string[] {
  const directories = new Set<string>();

  for (const filePath of files) {
    const normalized = normalizeRelativePath(filePath);
    if (normalized.length === 0) {
      continue;
    }

    const parts = normalized.split("/");
    for (let index = 1; index < parts.length; index += 1) {
      const dirPath = parts.slice(0, index).join("/");
      if (dirPath.length > 0) {
        directories.add(dirPath);
      }
    }
  }

  return Array.from(directories);
}

function resolveGlobPatterns(directories: string[], patterns: string[]): string[] {
  const matches = new Set<string>();
  const regexes = patterns.map((pattern) => ({
    pattern,
    regex: globPatternToRegex(pattern)
  }));

  for (const directory of directories) {
    for (const { pattern, regex } of regexes) {
      if (regex.test(directory)) {
        matches.add(directory);
      }

      if (!pattern.includes("*") && directory === pattern) {
        matches.add(directory);
      }
    }
  }

  return Array.from(matches);
}

async function isDirectory(rootPath: string, relativePath: string): Promise<boolean> {
  if (!relativePath || relativePath === ".") {
    return false;
  }

  try {
    const stats = await fs.stat(path.join(rootPath, relativePath));
    return stats.isDirectory();
  } catch {
    return false;
  }
}

interface WorkspaceInputs {
  npmWorkspacePatterns: string[];
  pnpmWorkspacePatterns: string[];
  cargoWorkspaceMembers: string[];
  lernaWorkspacePatterns: string[];
  nxWorkspaceProjects: string[];
}

async function resolveWorkspacePaths(rootPath: string, files: string[], inputs: WorkspaceInputs): Promise<string[]> {
  const directoryPaths = deriveDirectoryPaths(files);
  const workspaceCandidates = new Set<string>();

  const patternMatches = resolveGlobPatterns(directoryPaths, [
    ...inputs.npmWorkspacePatterns,
    ...inputs.pnpmWorkspacePatterns,
    ...inputs.lernaWorkspacePatterns
  ]);

  for (const candidate of patternMatches) {
    workspaceCandidates.add(normalizeRelativePath(candidate));
  }

  for (const candidate of inputs.cargoWorkspaceMembers) {
    workspaceCandidates.add(normalizeRelativePath(candidate));
  }

  for (const candidate of inputs.nxWorkspaceProjects) {
    workspaceCandidates.add(normalizeRelativePath(candidate));
  }

  const resolved: string[] = [];
  for (const candidate of workspaceCandidates) {
    if (await isDirectory(rootPath, candidate)) {
      resolved.push(candidate);
    }
  }

  return Array.from(new Set(resolved));
}

export function findCiSystem(files: string[]): string | null {
  const filesLower = files.map((filePath) => filePath.toLowerCase());
  const fileSetLower = new Set(filesLower);

  for (const marker of CI_MARKERS) {
    const markerLower = marker.toLowerCase();
    if (
      fileSetLower.has(markerLower) ||
      filesLower.some((filePath) => filePath.startsWith(`${markerLower}/`))
    ) {
      return marker;
    }
  }

  return null;
}
