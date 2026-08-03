import { describe, it, expect } from "vitest";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
import {
  listFiles,
  resolveContainedChildPath,
  resolveContainedChildPathAsync,
} from "../src/scanner.js";

describe("resolveContainedChildPath", () => {
  const root = "/tmp/harnix-root-example";

  it("accepts in-tree relative paths", () => {
    const resolved = resolveContainedChildPath(root, "packages/app");
    expect(resolved?.relativePath).toBe("packages/app");
    expect(resolved?.absolutePath).toBe(path.resolve(root, "packages/app"));
  });

  it("rejects parent-directory traversal", () => {
    expect(resolveContainedChildPath(root, "../escape")).toBeNull();
    expect(resolveContainedChildPath(root, "pkg/../../escape")).toBeNull();
  });

  it("rejects absolute paths outside the root", () => {
    expect(resolveContainedChildPath(root, "/etc/passwd")).toBeNull();
  });
});

describe("resolveContainedChildPathAsync", () => {
  it("rejects in-repo symlink that resolves outside the root", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-contain-root-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-contain-out-"));
    try {
      await fs.writeFile(path.join(outside, "secret.txt"), "secret\n", "utf8");
      await fs.symlink(outside, path.join(rootDir, "escape-link"), "dir");

      // Lexical check alone would allow this (path is under root).
      expect(resolveContainedChildPath(rootDir, "escape-link")).not.toBeNull();
      // Realpath check must reject.
      expect(await resolveContainedChildPathAsync(rootDir, "escape-link")).toBeNull();
    } finally {
      await fs.rm(rootDir, { recursive: true, force: true });
      await fs.rm(outside, { recursive: true, force: true });
    }
  });

  it("accepts in-repo symlink to an in-tree directory", async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-contain-in-"));
    try {
      const realDir = path.join(rootDir, "packages", "app");
      await fs.mkdir(realDir, { recursive: true });
      await fs.symlink(realDir, path.join(rootDir, "app-link"), "dir");

      const resolved = await resolveContainedChildPathAsync(rootDir, "app-link");
      expect(resolved?.relativePath).toBe("app-link");
    } finally {
      await fs.rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe("listFiles symlink directories", () => {
  it("walks in-tree symlink-to-directory without treating it as a file", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-symlink-"));
    try {
      const realDir = path.join(tmp, "real-src");
      await fs.mkdir(realDir, { recursive: true });
      await fs.writeFile(path.join(realDir, "index.ts"), "export {};\n", "utf8");
      await fs.symlink(realDir, path.join(tmp, "src"), "dir");

      const files = await listFiles(tmp);
      const normalized = files.map((f) => f.replace(/\\/g, "/"));
      // Files appear once via the real or symlink path; never as a bare "src" file entry.
      expect(normalized.filter((f) => f.endsWith("index.ts")).length).toBe(1);
      expect(normalized).not.toContain("src");
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("does not explode on a self-referencing directory symlink", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-loop-"));
    try {
      await fs.writeFile(path.join(tmp, "README.md"), "# loop\n", "utf8");
      await fs.symlink(".", path.join(tmp, "loop"), "dir");

      const files = await listFiles(tmp);
      const normalized = files.map((f) => f.replace(/\\/g, "/"));
      expect(normalized).toContain("README.md");
      expect(normalized.some((f) => f.includes("loop/loop"))).toBe(false);
      expect(normalized.filter((f) => f === "README.md" || f.endsWith("/README.md")).length).toBe(1);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }
  });

  it("does not enumerate files through a symlink to an external directory", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-extlink-"));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-extlink-out-"));
    try {
      await fs.writeFile(path.join(outside, "secret.txt"), "secret\n", "utf8");
      await fs.writeFile(path.join(tmp, "README.md"), "# root\n", "utf8");
      await fs.symlink(outside, path.join(tmp, "vendor-link"), "dir");

      const files = await listFiles(tmp);
      const normalized = files.map((f) => f.replace(/\\/g, "/"));
      expect(normalized).toContain("README.md");
      expect(normalized.some((f) => f.includes("secret.txt"))).toBe(false);
      expect(normalized.some((f) => f.includes("vendor-link"))).toBe(false);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
});
