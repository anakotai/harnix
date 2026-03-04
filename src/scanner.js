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

const ROOT_WORKSPACE_MARKERS = {
  pnpmWorkspace: "pnpm-workspace.yaml",
  lerna: "lerna.json",
  nx: "nx.json",
  turborepo: "turbo.json"
};

const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist", "build"]);

/**
 * @param {string} rootPath
 */
export async function listFiles(rootPath) {
  /** @type {string[]} */
  const files = [];

  async function walk(relativeDir) {
    const absoluteDir = path.join(rootPath, relativeDir);
    let entries;
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

/**
 * @param {string[]} files
 */
export function detectRepoType(files) {
  const normalized = new Set(files.map((filePath) => filePath.toLowerCase()));
  const hasDotnetSolution = files.some((filePath) => {
    const lowerFilePath = filePath.toLowerCase();
    return lowerFilePath.endsWith(".sln") || lowerFilePath.endsWith(".csproj");
  });
  const hasSoftwareMarker = SOFTWARE_MARKERS.some((marker) =>
    normalized.has(marker.toLowerCase())
  );

  return hasSoftwareMarker || hasDotnetSolution ? "software" : "non-software";
}

/**
 * @param {string} rootPath
 * @param {string[]} files
 */
export async function detectGitInfo(rootPath, files) {
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

/**
 * @param {string} rootPath
 */
async function readSubmodulePaths(rootPath) {
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

/**
 * @param {string} rootPath
 * @param {Set<string>} normalizedFiles
 */
async function readNpmWorkspacePatterns(rootPath, normalizedFiles) {
  if (!normalizedFiles.has("package.json")) {
    return [];
  }

  try {
    const packageJson = await fs.readFile(path.join(rootPath, "package.json"), "utf8");
    const parsed = JSON.parse(packageJson);
    return extractWorkspacePatterns(parsed?.workspaces);
  } catch {
    return [];
  }
}

/**
 * @param {string} rootPath
 * @param {Set<string>} normalizedFiles
 */
async function readPnpmWorkspacePatterns(rootPath, normalizedFiles) {
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
    const rawValue = parsed.toJS();
    return extractWorkspacePatterns(rawValue?.packages);
  } catch {
    return [];
  }
}

/**
 * @param {string} rootPath
 * @param {Set<string>} normalizedFiles
 */
async function readCargoWorkspaceMembers(rootPath, normalizedFiles) {
  if (!normalizedFiles.has("cargo.toml")) {
    return [];
  }

  let cargoToml;
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

/**
 * @param {string} rootPath
 * @param {Set<string>} normalizedFiles
 */
async function readLernaWorkspacePatterns(rootPath, normalizedFiles) {
  if (!normalizedFiles.has(ROOT_WORKSPACE_MARKERS.lerna)) {
    return [];
  }

  try {
    const lernaJson = await fs.readFile(path.join(rootPath, ROOT_WORKSPACE_MARKERS.lerna), "utf8");
    const parsed = JSON.parse(lernaJson);
    return extractWorkspacePatterns(parsed?.packages);
  } catch {
    return [];
  }
}

/**
 * @param {string[]} files
 * @param {Set<string>} normalizedFiles
 */
function readNxWorkspaceProjects(files, normalizedFiles) {
  if (!normalizedFiles.has(ROOT_WORKSPACE_MARKERS.nx)) {
    return [];
  }

  const projectDirs = files
    .filter((filePath) => filePath.replace(/\\/g, "/").toLowerCase().endsWith("/project.json"))
    .map((filePath) => normalizeRelativePath(path.dirname(filePath)));

  return Array.from(new Set(projectDirs)).filter((entry) => entry.length > 0);
}

/**
 * @param {unknown} value
 */
function extractWorkspacePatterns(value) {
  /** @type {string[]} */
  const patterns = [];

  const collect = (candidate) => {
    if (typeof candidate === "string") {
      const normalized = normalizeRelativePath(candidate);
      if (normalized.length > 0 && !normalized.startsWith("!")) {
        patterns.push(normalized);
      }
      return;
    }

    if (Array.isArray(candidate)) {
      candidate.forEach((entry) => collect(entry));
      return;
    }

    if (candidate && typeof candidate === "object") {
      for (const nested of Object.values(candidate)) {
        collect(nested);
      }
    }
  };

  collect(value);
  return Array.from(new Set(patterns));
}

/**
 * @param {string} value
 */
function normalizeRelativePath(value) {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "").trim();
}

/**
 * @param {string} pattern
 */
function globPatternToRegex(pattern) {
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

    if ("+.^$()|[]{}\\".includes(char)) {
      expression += `\\${char}`;
      continue;
    }

    expression += char;
  }

  expression += "$";
  return new RegExp(expression);
}

/**
 * @param {string[]} files
 */
function deriveDirectoryPaths(files) {
  const directories = new Set();

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

/**
 * @param {string[]} directories
 * @param {string[]} patterns
 */
function resolveGlobPatterns(directories, patterns) {
  const matches = new Set();
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

/**
 * @param {string} rootPath
 * @param {string} relativePath
 */
async function isDirectory(rootPath, relativePath) {
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

/**
 * @param {string} rootPath
 * @param {string[]} files
 * @param {{npmWorkspacePatterns: string[], pnpmWorkspacePatterns: string[], cargoWorkspaceMembers: string[], lernaWorkspacePatterns: string[], nxWorkspaceProjects: string[]}} inputs
 */
async function resolveWorkspacePaths(rootPath, files, inputs) {
  const directoryPaths = deriveDirectoryPaths(files);
  const workspaceCandidates = new Set();

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

  const resolved = [];
  for (const candidate of workspaceCandidates) {
    if (await isDirectory(rootPath, candidate)) {
      resolved.push(candidate);
    }
  }

  return Array.from(new Set(resolved));
}

/**
 * @param {string[]} files
 */
export function findCiSystem(files) {
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
