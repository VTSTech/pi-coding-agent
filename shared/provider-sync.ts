/**
 * Shared Provider Sync Utilities
 *
 * Provider-agnostic helpers used by sync extensions (ollama-sync, openrouter-sync, etc.)
 * for merging model entries and related operations.
 */
import type { PiModelEntry } from "./ollama";

// ── Merge helper ──────────────────────────────────────────────────────────

/**
 * Merge new model entries with old entries, preserving any extra
 * user-defined fields while always refreshing standard metadata.
 *
 * For each model in `newModels`:
 *  - If the model already exists in `oldModels`, the new entry's fields
 *    take precedence, but any extra user-defined fields from the old entry
 *    that aren't in the new entry are preserved.
 *  - If the model is new, it's included as-is.
 *
 * @param newModels - Freshly fetched/constructed model entries
 * @param oldModels - Existing model entries from models.json
 * @returns Merged array ready to write back
 */
export function mergeModels(
  newModels: PiModelEntry[],
  oldModels: PiModelEntry[]
): PiModelEntry[] {
  const oldModelMap = new Map(oldModels.map((m) => [m.id, m]));

  return newModels.map((m) => {
    const old = oldModelMap.get(m.id);
    if (old) {
      // Start with fresh metadata, overlay any extra user fields from old entry
      const merged = { ...m } as Record<string, unknown>;
      for (const [k, v] of Object.entries(old)) {
        if (!(k in m)) merged[k] = v;
      }
      return merged as PiModelEntry;
    }
    return m;
  });
}
