import { promises as fs } from "node:fs";
import path from "node:path";

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

  const workspaceConfig = {
    npmWorkspaces: await hasNpmWorkspaces(rootPath, normalizedFiles),
    pnpmWorkspace: normalizedFiles.has(ROOT_WORKSPACE_MARKERS.pnpmWorkspace),
    cargoWorkspace: await hasCargoWorkspace(rootPath, normalizedFiles),
    lerna: normalizedFiles.has(ROOT_WORKSPACE_MARKERS.lerna),
    nx: normalizedFiles.has(ROOT_WORKSPACE_MARKERS.nx),
    turborepo: normalizedFiles.has(ROOT_WORKSPACE_MARKERS.turborepo)
  };

  const detected = Object.entries(workspaceConfig)
    .filter(([, enabled]) => enabled)
    .map(([marker]) => marker);

  return {
    hasSubmodules,
    submodules,
    hasWorkspaces: detected.length > 0,
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
async function hasNpmWorkspaces(rootPath, normalizedFiles) {
  if (!normalizedFiles.has("package.json")) {
    return false;
  }

  try {
    const packageJson = await fs.readFile(path.join(rootPath, "package.json"), "utf8");
    const parsed = JSON.parse(packageJson);
    const workspaces = parsed?.workspaces;

    if (Array.isArray(workspaces)) {
      return workspaces.some((entry) => typeof entry === "string" && entry.trim().length > 0);
    }

    if (workspaces && typeof workspaces === "object") {
      const hasPatterns = (value) => {
        if (typeof value === "string") {
          return value.trim().length > 0;
        }
        if (Array.isArray(value)) {
          return value.some((entry) => typeof entry === "string" && entry.trim().length > 0);
        }
        return false;
      };

      if (hasPatterns(workspaces.packages)) {
        return true;
      }

      return Object.values(workspaces).some((value) => hasPatterns(value));
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * @param {string} rootPath
 * @param {Set<string>} normalizedFiles
 */
async function hasCargoWorkspace(rootPath, normalizedFiles) {
  if (!normalizedFiles.has("cargo.toml")) {
    return false;
  }

  for (const candidate of ["Cargo.toml", "cargo.toml"]) {
    try {
      const cargoToml = await fs.readFile(path.join(rootPath, candidate), "utf8");
      return /^\s*\[workspace\]\s*$/m.test(cargoToml);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue;
      }
      return false;
    }
  }

  return false;
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
