import { describe, it, expect } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ScanContext } from "../../src/types.js";
import designMdCheck from "../../checks/design-md/check.js";

const FULL_DESIGN_MD = `---
name: Heritage
colors:
  primary: "#1A1C1E"
typography:
  body-md:
    fontFamily: Public Sans
    fontSize: 1rem
---

## Overview

Architectural minimalism with a warm limestone foundation.

## Colors

Primary ink for headlines; a single clay accent for actions.
`;

const FRONT_MATTER_ONLY = `---
name: Heritage
colors:
  primary: "#1A1C1E"
---
`;

const SECTIONS_ONLY = `## Overview

A lecture-handout aesthetic: dense, austere, unconcerned with first impressions.

## Typography

One family at modest sizes; no display serif.
`;

function makeCtx(rootPath: string, files: string[]): ScanContext {
  return {
    rootPath,
    files,
    repoType: "software",
    gitInfo: {
      hasSubmodules: false,
      submodules: [],
      hasWorkspaces: false,
      workspaces: [],
      workspaceConfig: {
        npmWorkspaces: false,
        pnpmWorkspace: false,
        cargoWorkspace: false,
        lerna: false,
        nx: false,
        turborepo: false,
        detected: [],
      },
    },
  };
}

async function makeTempCtx(
  files: Record<string, string>,
): Promise<{ ctx: ScanContext; cleanup: () => Promise<void> }> {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "harnix-design-md-"));
  for (const [fileName, content] of Object.entries(files)) {
    const fullPath = path.join(rootPath, fileName);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf8");
  }

  return {
    ctx: makeCtx(rootPath, Object.keys(files).map((file) => file.replace(/\\/g, "/"))),
    cleanup: () => fs.rm(rootPath, { recursive: true, force: true }),
  };
}

describe("design-md check", () => {
  it("fails when DESIGN.md is missing", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "README.md": "# Project\n",
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.id).toBe("design-md");
      expect(result.tier).toBe("nice-to-have");
      expect(result.status).toBe("fail");
      expect(result.score).toBe(0);
      expect(result.references).toEqual([]);
    } finally {
      await cleanup();
    }
  });

  it("ignores nested DESIGN.md and design.md aliases", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "apps/web/DESIGN.md": FULL_DESIGN_MD,
      "design.md": FULL_DESIGN_MD,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(0);
      expect(result.status).toBe("fail");
      expect(result.summary).toBe("No DESIGN.md found");
    } finally {
      await cleanup();
    }
  });

  it("scores existence only when the file lacks spec shape", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": "# Brand notes\n\nUse the blue from the slide deck.\n",
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(0.4);
      expect(result.status).toBe("partial");
      expect(result.references).toEqual(["DESIGN.md"]);
    } finally {
      await cleanup();
    }
  });

  it("scores partial shape when only token front matter is present", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": FRONT_MATTER_ONLY,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(0.7);
      expect(result.status).toBe("partial");
      expect(result.summary).toBe("DESIGN.md has spec front matter but no canonical sections");
    } finally {
      await cleanup();
    }
  });

  it("scores partial shape when only canonical sections are present", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": SECTIONS_ONLY,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(0.7);
      expect(result.status).toBe("partial");
      expect(result.summary).toBe("DESIGN.md has canonical sections but no token front matter");
    } finally {
      await cleanup();
    }
  });

  it("passes when DESIGN.md has token front matter and canonical sections", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": FULL_DESIGN_MD,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(1);
      expect(result.status).toBe("pass");
      expect(result.references).toEqual(["DESIGN.md"]);
      expect(result.details).toContain("Overview");
      expect(result.details).toContain("Colors");
    } finally {
      await cleanup();
    }
  });

  it("treats Brand & Style as the Overview section alias", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": `---
name: Alias Check
---

## Brand & Style

A specific reference: a 1970s graduate lecture handout.
`,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(1);
      expect(result.details).toContain("Overview");
    } finally {
      await cleanup();
    }
  });

  it.each([
    ["Layout & Spacing", "Layout"],
    ["Elevation", "Elevation & Depth"],
    ["Do's and Don'ts", "Do's and Don'ts"],
    ["Do’s and Don’ts", "Do's and Don'ts"],
  ])("treats %s as the %s section", async (heading, canonical) => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": `---
name: Alias Check
---

## ${heading}

Enough prose for the section to exist.
`,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(1);
      expect(result.details).toContain(canonical);
    } finally {
      await cleanup();
    }
  });

  it("scores 0.1 when DESIGN.md is listed but unreadable", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "README.md": "# Project\n",
    });
    ctx.files = ["DESIGN.md"];
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(0.1);
      expect(result.status).toBe("fail");
      expect(result.summary).toMatch(/^Could not read DESIGN.md:/);
      expect(result.references).toEqual(["DESIGN.md"]);
    } finally {
      await cleanup();
    }
  });

  it("treats empty front-matter fences as missing spec front matter", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": `---
---

## Overview

A lecture-handout aesthetic with no tokens yet.
`,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(0.7);
      expect(result.summary).toBe("DESIGN.md has canonical sections but no token front matter");
    } finally {
      await cleanup();
    }
  });

  it("accepts a UTF-8 BOM and trailing whitespace on YAML fences", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": `\uFEFF--- \nname: Heritage\n--- \n\n## Overview\n\nWarm limestone foundation.\n`,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(1);
    } finally {
      await cleanup();
    }
  });

  it("treats invalid YAML front matter as missing spec front matter", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": `---
name: [
---

## Overview

Invalid YAML should not count as spec front matter.
`,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(0.7);
      expect(result.summary).toBe("DESIGN.md has canonical sections but no token front matter");
    } finally {
      await cleanup();
    }
  });

  it("does not treat example headings inside fenced code as sections", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": `---
name: Heritage
---

\`\`\`markdown
## Overview
## Colors
\`\`\`
`,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(0.7);
      expect(result.summary).toBe("DESIGN.md has spec front matter but no canonical sections");
    } finally {
      await cleanup();
    }
  });

  it("does not close a longer outer fence on a shorter inner fence", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": `---
name: Heritage
---

\`\`\`\`markdown
\`\`\`
## Overview
\`\`\`
\`\`\`\`

## Colors

Primary ink for headlines.
`,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(1);
      expect(result.details).toContain("Colors");
      expect(result.details).not.toContain("Overview");
    } finally {
      await cleanup();
    }
  });

  it("accepts closed ATX headings", async () => {
    const { ctx, cleanup } = await makeTempCtx({
      "DESIGN.md": `---
name: Heritage
---

## Overview ##

Warm limestone foundation.
`,
    });
    try {
      const result = await designMdCheck(ctx);
      expect(result.score).toBe(1);
      expect(result.details).toContain("Overview");
    } finally {
      await cleanup();
    }
  });
});
