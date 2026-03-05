import { readFile } from "node:fs/promises";

const KNOWLEDGE_BASE_FILE = new URL("./knowledge-base.json", import.meta.url);

interface KnowledgeBase {
  checkExplanations?: Record<string, unknown>;
}

let cachedKnowledgeBase: KnowledgeBase | null = null;

async function readKnowledgeBase(): Promise<KnowledgeBase> {
  if (cachedKnowledgeBase) {
    return cachedKnowledgeBase;
  }

  const raw = await readFile(KNOWLEDGE_BASE_FILE, { encoding: "utf8" });
  const parsed: unknown = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("knowledge-base.json must contain a JSON object as the root value.");
  }

  cachedKnowledgeBase = parsed as KnowledgeBase;
  return cachedKnowledgeBase;
}

export async function explanationForCheck(checkId: string, fallback: string): Promise<string> {
  try {
    const knowledgeBase = await readKnowledgeBase();
    const value = knowledgeBase.checkExplanations?.[checkId];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  } catch {
    // Fall back so scans still complete even if the bundled JSON is unavailable.
  }

  return fallback;
}
