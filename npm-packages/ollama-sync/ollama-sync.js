// .build-npm/ollama-sync/ollama-sync.temp.ts
import {
  MODELS_JSON_PATH as MODELS_FILE,
  fetchOllamaModels,
  fetchContextLengthsBatched,
  readModelsJson,
  writeModelsJson,
  isReasoningModel,
  getOllamaBaseUrl,
  EXTENSION_VERSION
} from "@vtstech/pi-shared/ollama";
import { section, ok, warn, info, bytesHuman, estimateVram } from "@vtstech/pi-shared/format";
var BRANDING = [
  `  \u26A1 Pi Ollama Sync v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`
].join("\n");
function getProviderConfig(existing) {
  const defaultUrl = getOllamaBaseUrl();
  const ollama = existing.providers["ollama"];
  return {
    baseUrl: ollama?.baseUrl ?? defaultUrl + "/v1",
    api: ollama?.api ?? "openai-completions",
    apiKey: ollama?.apiKey ?? "ollama",
    compat: ollama?.compat ?? {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false
    }
  };
}
function buildModelEntry(m, contextLength) {
  const estimatedSize = estimateVram(m.details.parameter_size, m.details.quantization_level);
  return {
    id: m.name,
    reasoning: isReasoningModel(m.name),
    parameterSize: m.details.parameter_size,
    quantizationLevel: m.details.quantization_level,
    modelFamily: m.details.family || m.details.families?.[0] || "unknown",
    contextLength,
    estimatedSize
  };
}
function mergeModels(newModels, oldModels) {
  const oldModelMap = new Map(oldModels.map((m) => [m.id, m]));
  return newModels.map((m) => {
    const old = oldModelMap.get(m.id);
    if (old) {
      const merged = { ...m };
      for (const [k, v] of Object.entries(old)) {
        if (!(k in m)) merged[k] = v;
      }
      return merged;
    }
    return m;
  });
}
function ollama_sync_temp_default(pi) {
  pi.registerCommand("ollama-sync", {
    description: "Sync models from Ollama into models.json. Use: /ollama-sync [url]",
    getArgumentCompletions: async () => {
      const url = getOllamaBaseUrl();
      return [
        { value: url, label: url, description: "Default Ollama URL..." }
      ];
    },
    async handler(args, ctx) {
      const arg = args.trim();
      const overrideUrl = arg || void 0;
      ctx.ui.setStatus("ollama-sync", "Fetching models from Ollama...");
      try {
        const existing = readModelsJson();
        const config = getProviderConfig(existing);
        const ollamaBaseUrl = overrideUrl ? overrideUrl.replace(/\/v1$/, "").replace(/\/+$/, "") : config.baseUrl?.replace(/\/v1$/, "") ?? getOllamaBaseUrl();
        const models = await fetchOllamaModels(ollamaBaseUrl);
        if (models.length === 0) {
          ctx.ui.notify("No models found in Ollama", "info");
          ctx.ui.setStatus("ollama-sync", void 0);
          return;
        }
        const sorted = [...models].sort((a, b) => a.size - b.size);
        ctx.ui.setStatus("ollama-sync", "Fetching model details...");
        const contextMap = await fetchContextLengthsBatched(
          ollamaBaseUrl,
          sorted.map((m) => m.name)
        );
        const newModels = sorted.map(
          (m) => buildModelEntry(m, contextMap.get(m.name))
        );
        const oldIds = new Set(
          existing.providers["ollama"]?.models?.map((m) => m.id) ?? []
        );
        const added = newModels.filter((m) => !oldIds.has(m.id));
        const removed = [...oldIds].filter((id) => !newModels.some((m) => m.id === id));
        const mergedModels = mergeModels(
          newModels,
          existing.providers["ollama"]?.models ?? []
        );
        existing.providers["ollama"] = {
          ...config,
          baseUrl: ollamaBaseUrl + "/v1",
          models: mergedModels
        };
        writeModelsJson(existing);
        const lines = [""];
        lines.push(`  Ollama: ${ollamaBaseUrl}`);
        lines.push(`  Synced ${newModels.length} models from Ollama`);
        lines.push(section("Synced Models"));
        for (const m of newModels) {
          lines.push(ok(m.id));
          const ctxStr = m.contextLength != null ? m.contextLength.toLocaleString() : "?";
          const sizeStr = m.estimatedSize ? bytesHuman(m.estimatedSize) : "?";
          lines.push(
            `       Params: ${m.parameterSize ?? "?"} \xB7 Quant: ${m.quantizationLevel ?? "?"} \xB7 Family: ${m.modelFamily ?? "?"} \xB7 Context: ${ctxStr} \xB7 VRAM: ~${sizeStr}`
          );
        }
        if (added.length > 0 || removed.length > 0) {
          lines.push(section("Changes"));
          if (added.length > 0) {
            lines.push(ok(`Added ${added.length}: ${added.map((m) => m.id).join(", ")}`));
          }
          if (removed.length > 0) {
            lines.push(warn(`Removed ${removed.length}: ${removed.join(", ")}`));
          }
        } else {
          lines.push(info("No changes \u2014 already in sync"));
        }
        lines.push("");
        lines.push(`  Written to ${MODELS_FILE}`);
        lines.push(`  Run /reload to pick up changes`);
        lines.push(BRANDING);
        const report = lines.join("\n");
        const summary = [`Synced ${newModels.length} models`];
        if (added.length > 0) summary.push(`+${added.map((m) => m.id).join(", ")}`);
        if (removed.length > 0) summary.push(`-${removed.join(", ")}`);
        ctx.ui.notify(summary.join(" \xB7 "), "success");
        pi.sendMessage({
          customType: "ollama-sync-report",
          content: report,
          display: { type: "content", content: report },
          details: { timestamp: (/* @__PURE__ */ new Date()).toISOString(), added: added.length, removed: removed.length }
        });
      } catch (err) {
        ctx.ui.notify(`Failed: ${err.message}`, "error");
      }
      ctx.ui.setStatus("ollama-sync", void 0);
    }
  });
  pi.registerTool({
    name: "ollama_sync",
    label: "Ollama Sync",
    description: "Sync available models from an Ollama instance into Pi's models.json config file. Supports local or remote Ollama.\n\n" + BRANDING,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "Ollama base URL (e.g. http://192.168.1.100:11434). If omitted, uses models.json or OLLAMA_HOST env var."
        }
      }
    },
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const overrideUrl = params?.url;
      const existing = readModelsJson();
      const config = getProviderConfig(existing);
      const ollamaBaseUrl = overrideUrl ? overrideUrl.replace(/\/v1$/, "").replace(/\/+$/, "") : config.baseUrl?.replace(/\/v1$/, "") ?? getOllamaBaseUrl();
      try {
        const models = await fetchOllamaModels(ollamaBaseUrl);
        const sorted = [...models].sort((a, b) => a.size - b.size);
        const contextMap = await fetchContextLengthsBatched(
          ollamaBaseUrl,
          sorted.map((m) => m.name)
        );
        const newModels = sorted.map(
          (m) => buildModelEntry(m, contextMap.get(m.name))
        );
        const mergedModels = mergeModels(
          newModels,
          existing.providers["ollama"]?.models ?? []
        );
        existing.providers["ollama"] = {
          ...config,
          baseUrl: ollamaBaseUrl + "/v1",
          models: mergedModels
        };
        writeModelsJson(existing);
        const modelDetails = newModels.map(
          (m) => {
            const ctxStr = m.contextLength ?? "?";
            const sizeStr = m.estimatedSize ? bytesHuman(m.estimatedSize) : "?";
            return `  \u2022 ${m.id} (${m.parameterSize}, ${m.quantizationLevel}, ctx: ${ctxStr}, ~${sizeStr})`;
          }
        ).join("\n");
        return {
          content: [
            {
              type: "text",
              text: `${BRANDING}

Synced ${newModels.length} models from ${ollamaBaseUrl} to ${MODELS_FILE}. Run /reload to pick up changes.

${modelDetails}`
            }
          ],
          details: { models: newModels }
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          details: {}
        };
      }
    }
  });
}
export {
  ollama_sync_temp_default as default
};
