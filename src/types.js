export const SCORE_BANDS = {
  poor: { min: 0, max: 25, label: "Poor" },
  needsImprovement: { min: 26, max: 50, label: "Needs Improvement" },
  good: { min: 51, max: 75, label: "Good" },
  excellent: { min: 76, max: 100, label: "Excellent" }
};

/**
 * @typedef {"pass" | "partial" | "fail"} CheckStatus
 */

/**
 * @typedef {"critical" | "important" | "nice-to-have"} CheckTier
 */

/**
 * @typedef {object} CheckResult
 * @property {string} id
 * @property {string} name
 * @property {string} category
 * @property {CheckTier} tier
 * @property {number} score
 * @property {CheckStatus} status
 * @property {string} summary
 * @property {string} details
 * @property {string[]} recommendations
 * @property {string[]} references
 */
