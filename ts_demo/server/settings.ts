import type { RetrievalSettings } from "../shared/types.js";

export const MAX_TOP_K = 20;

function bounded(value: unknown, label: string, check: (n: number) => boolean, rule: string): number {
  const parsed = Number(value);
  if (!check(parsed)) throw new Error(`${label} ${rule}`);
  return parsed;
}

export function validateSettings(patch: unknown, current: RetrievalSettings): RetrievalSettings {
  if (!patch || typeof patch !== "object") throw new Error("Send the settings to change as a JSON object.");
  const body = patch as Record<string, unknown>;
  const next = { ...current };
  if (body.topK !== undefined) {
    next.topK = bounded(body.topK, "topK", (n) => Number.isInteger(n) && n >= 1 && n <= MAX_TOP_K,
      `must be a whole number between 1 and ${MAX_TOP_K}.`);
  }
  if (body.minSimilarity !== undefined) {
    next.minSimilarity = bounded(body.minSimilarity, "minSimilarity", (n) => Number.isFinite(n) && n >= 0 && n <= 1,
      "must be a number between 0 and 1.");
  }
  return next;
}

export function createSettings(): { get(): RetrievalSettings; update(patch: unknown): RetrievalSettings } {
  // Defaults come from the environment; changes made through the UI last for the life of the process.
  let current = validateSettings(
    { topK: process.env.TOP_K ?? 4, minSimilarity: process.env.MIN_SIMILARITY ?? 0 },
    { topK: 4, minSimilarity: 0 },
  );
  return {
    get: () => current,
    update(patch: unknown) {
      current = validateSettings(patch, current);
      return current;
    },
  };
}
