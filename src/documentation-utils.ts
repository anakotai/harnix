export const DOC_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".rst",
  ".adoc",
  ".yaml",
  ".yml",
  ".json",
  ".toml",
]);

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function hasSubstantiveDocContent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;

  const withoutFrontmatter = trimmed.replace(/^---[\s\S]*?---\s*/m, "");
  const lines = withoutFrontmatter
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return false;

  const nonHeadingLines = lines.filter((line) => !/^#{1,6}\s+/.test(line));
  if (nonHeadingLines.length === 0) return false;

  const bodyText = nonHeadingLines
    .join(" ")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return bodyText.length >= 30;
}

export function readmePlaceholderLike(content: string): boolean {
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
