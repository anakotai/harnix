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
