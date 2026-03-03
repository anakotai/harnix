import { readFile } from "node:fs/promises";

const KNOWLEDGE_BASE_FILE = new URL("./knowledge-base.json", import.meta.url);

/** @type {{checkExplanations?: Record<string, unknown>} | null} */
let cachedKnowledgeBase = null;

/**
 * @returns {Promise<{checkExplanations?: Record<string, unknown>}>}
 */
async function readKnowledgeBase() {
  if (cachedKnowledgeBase) {
    return cachedKnowledgeBase;
  }

  const raw = await readFile(KNOWLEDGE_BASE_FILE, { encoding: "utf8" });
  const parsed = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("knowledge-base.json must contain a JSON object as the root value.");
  }

  cachedKnowledgeBase = parsed;
  return parsed;
}

/**
 * @param {string} checkId
 * @param {string} fallback
 * @returns {Promise<string>}
 */
export async function explanationForCheck(checkId, fallback) {
  try {
    const knowledgeBase = await readKnowledgeBase();
    const value = knowledgeBase.checkExplanations?.[checkId];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  } catch (error) {
    // Fall back so scans still complete even if the bundled JSON is unavailable.
  }

  return fallback;
}
