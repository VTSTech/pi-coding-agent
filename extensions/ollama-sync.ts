import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  type PiModelsJson,
  type PiModelEntry,
  MODELS_JSON_PATH as MODELS_FILE,
  fetchOllamaModels,
  fetchContextLengthsBatched,
  readModelsJson,
  writeModelsJson,
  isReasoningModel,
  getOllamaBaseUrl,
  EXTENSION_VERSION,
} from "../shared/ollama";
import { section, ok, fail, warn, info, bytesHuman, estimateMemory } from "../shared/format";

// ── Branding ──────────────────────────────────────────────────────────────

const BRANDING = [
  `  ⚡ Pi Ollama Sync v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`,
].join("\n");

// ── Provider config helper (kept local — not in shared) ──────────────────

function getProviderConfig(existing: PiModelsJson) {
  const defaultUrl = getOllamaBaseUrl();
  const ollama = existing.providers["ollama"];
  return {
    baseUrl: ollama?.baseUrl ?? defaultUrl + "/v1",
    api: ollama?.api ?? "openai-completions",
    apiKey: ollama?.apiKey ?? "ollama",
    compat: ollama?.compat ?? {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };
}

// ── Model entry builder with metadata extraction ─────────────────────────

/**
 * Build a PiModelEntry from an Ollama model, extracting metadata
 * (parameter_size, quantization_level) and detecting model family.
 */
function buildModelEntry(m: { name: string; details: { parameter_size: string; quantization_level: string; family: string; families?: string[] }; size: number }, contextLength?: number): PiModelEntry {
  const estimatedSize = estimateMemory(m.details.parameter_size, m.details.quantization_level, contextLength);
  return {
    id: m.name,
    reasoning: isReasoningModel(m.name),
    parameterSize: m.details.parameter_size,
    quantizationLevel: m.details.quantization_level,
    modelFamily: m.details.family || m.details.families?.[0] || "unknown",
    contextLength,
    estimatedSize,
  };
}

// ── Merge helper ──────────────────────────────────────────────────────────

/**
 * Merge new model entries with old entries, preserving any extra
 * user-defined fields while always refreshing standard metadata.
 */
function mergeModels(
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

// ── Shared sync result type ───────────────────────────────────────────────

interface SyncResult {
  ollamaBaseUrl: string;
  newModels: PiModelEntry[];
  added: PiModelEntry[];
  removed: string[];
  error?: string;
}

// ── Core sync logic ─────────────────────────────────────────────────────────

/**
 * Perform the full Ollama sync pipeline:
 *  1. Read models.json
 *  2. Get provider config
 *  3. Resolve URL
 *  4. Fetch Ollama models
 *  5. Sort by size
 *  6. Fetch context lengths batched
 *  7. Build model entries
 *  8. Diff against old entries
 *  9. Merge with existing
 * 10. Write to models.json
 *
 * Returns a structured SyncResult for the caller to format as needed.
 */
async function performSync(overrideUrl?: string): Promise<SyncResult> {
  const existing = readModelsJson();
  const config = getProviderConfig(existing);

  // URL priority: CLI arg > models.json baseUrl > env var / localhost
  const ollamaBaseUrl = overrideUrl
    ? overrideUrl.replace(/\/v1$/, "").replace(/\/+$/, "")
    : config.baseUrl?.replace(/\/v1$/, "") ?? getOllamaBaseUrl();

  try {
    const models = await fetchOllamaModels(ollamaBaseUrl);

    if (models.length === 0) {
      return {
        ollamaBaseUrl,
        newModels: [],
        added: [],
        removed: [],
        error: "No models found in Ollama",
      };
    }

    // Sort by size ascending
    const sorted = [...models].sort((a, b) => a.size - b.size);

    // Fetch context lengths in batches (3 concurrent to avoid overwhelming tunnels)
    const contextMap = await fetchContextLengthsBatched(
      ollamaBaseUrl,
      sorted.map((m) => m.name)
    );

    // Build model entries with metadata
    const newModels = sorted.map((m) =>
      buildModelEntry(m, contextMap.get(m.name))
    );

    // Diff against old entries
    const oldIds = new Set(
      existing.providers["ollama"]?.models?.map((m) => m.id) ?? []
    );
    const added = newModels.filter((m) => !oldIds.has(m.id));
    const removed = [...oldIds].filter((id) => !newModels.some((m) => m.id === id));

    // Merge preserving extra user fields
    const mergedModels = mergeModels(
      newModels,
      existing.providers["ollama"]?.models ?? []
    );

    // Write back — use the actual URL we synced from
    existing.providers["ollama"] = {
      ...config,
      baseUrl: ollamaBaseUrl + "/v1",
      models: mergedModels,
    };
    writeModelsJson(existing);

    return {
      ollamaBaseUrl,
      newModels,
      added,
      removed,
    };
  } catch (err: any) {
    return {
      ollamaBaseUrl,
      newModels: [],
      added: [],
      removed: [],
      error: err.message,
    };
  }
}

// ── Extension ─────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── Slash command: /ollama-sync ────────────────────────────────────────

  pi.registerCommand("ollama-sync", {
    description: "Sync models from Ollama into models.json. Use: /ollama-sync [url]",
    getArgumentCompletions: async () => {
      const url = getOllamaBaseUrl();
      return [
        { value: url, label: url, description: "Default Ollama URL..." },
      ];
    },
    async handler(args, ctx) {
      const arg = args.trim();
      const overrideUrl = arg || undefined;
      ctx.ui.setStatus("ollama-sync", "Fetching models from Ollama...");

      try {
        const result = await performSync(overrideUrl);

        if (result.error) {
          ctx.ui.notify(result.error, result.newModels.length === 0 ? "info" : "error");
          ctx.ui.setStatus("ollama-sync", undefined);
          return;
        }

        const { ollamaBaseUrl, newModels, added, removed } = result;

        // ── Build enhanced report ─────────────────────────────────────────
        const lines: string[] = [""];
        lines.push(`  Ollama: ${ollamaBaseUrl}`);
        lines.push(`  Synced ${newModels.length} models from Ollama`);

        // Per-model metadata table
        lines.push(section("Synced Models"));
        for (const m of newModels) {
          lines.push(ok(m.id));
          const ctxStr = m.contextLength != null ? m.contextLength.toLocaleString() : "?";
          const sizeStr = m.estimatedSize ? `GPU: ~${bytesHuman(m.estimatedSize.gpu)} · CPU: ~${bytesHuman(m.estimatedSize.cpu)}` : "?";
          lines.push(
            `       Params: ${m.parameterSize ?? "?"} · Quant: ${m.quantizationLevel ?? "?"} · Family: ${m.modelFamily ?? "?"} · Context: ${ctxStr} · ${sizeStr}`
          );
        }

        // Change summary
        if (added.length > 0 || removed.length > 0) {
          lines.push(section("Changes"));
          if (added.length > 0) {
            lines.push(ok(`Added ${added.length}: ${added.map((m) => m.id).join(", ")}`));
          }
          if (removed.length > 0) {
            lines.push(warn(`Removed ${removed.length}: ${removed.join(", ")}`));
          }
        } else {
          lines.push(info("No changes — already in sync"));
        }

        lines.push("");
        lines.push(`  Written to ${MODELS_FILE}`);
        lines.push(`  Run /reload to pick up changes`);
        lines.push(BRANDING);

        const report = lines.join("\n");

        // Notify short summary
        const summary: string[] = [`Synced ${newModels.length} models`];
        if (added.length > 0) summary.push(`+${added.map((m) => m.id).join(", ")}`);
        if (removed.length > 0) summary.push(`-${removed.join(", ")}`);
        ctx.ui.notify(summary.join(" · "), "success");

        // Display full report with branding
        pi.sendMessage({
          customType: "ollama-sync-report",
          content: report,
          display: { type: "content", content: report },
          details: { timestamp: new Date().toISOString(), added: added.length, removed: removed.length },
        });
      } catch (err: any) {
        ctx.ui.notify(`Failed: ${err.message}`, "error");
      }

      ctx.ui.setStatus("ollama-sync", undefined);
    },
  });

  // ── Tool: ollama_sync ──────────────────────────────────────────────────

  pi.registerTool({
    name: "ollama_sync",
    label: "Ollama Sync",
    description:
      "Sync available models from an Ollama instance into Pi's models.json config file. Supports local or remote Ollama.\n\n" +
      BRANDING,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Ollama base URL (e.g. http://192.168.1.100:11434). If omitted, uses models.json or OLLAMA_HOST env var.",
        },
      },
    } as any,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const overrideUrl = (params as any)?.url as string | undefined;

      const result = await performSync(overrideUrl);

      if (result.error) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          details: {},
        };
      }

      const { ollamaBaseUrl, newModels } = result;

      // Build tool result with per-model metadata
      const modelDetails = newModels
        .map(
          (m) => {
            const ctxStr = m.contextLength ?? "?";
            const sizeStr = m.estimatedSize ? `GPU: ~${bytesHuman(m.estimatedSize.gpu)}, CPU: ~${bytesHuman(m.estimatedSize.cpu)}` : "?";
            return `  • ${m.id} (${m.parameterSize}, ${m.quantizationLevel}, ctx: ${ctxStr}, ${sizeStr})`;
          }
        )
        .join("\n");

      return {
        content: [
          {
            type: "text",
            text: `${BRANDING}\n\nSynced ${newModels.length} models from ${ollamaBaseUrl} to ${MODELS_FILE}. Run /reload to pick up changes.\n\n${modelDetails}`,
          },
        ],
        details: { models: newModels },
      };
    },
  });
}
