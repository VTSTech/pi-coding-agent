// .build-npm/openrouter-sync/openrouter-sync.temp.ts
import {
  MODELS_JSON_PATH as MODELS_FILE,
  readModelsJson,
  writeModelsJson,
  BUILTIN_PROVIDERS,
  EXTENSION_VERSION
} from "@vtstech/pi-shared/ollama";
import { section, ok, warn } from "@vtstech/pi-shared/format";
var BRANDING = [
  `  \u26A1 Pi OpenRouter Sync v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`
].join("\n");
var OR_CONFIG = BUILTIN_PROVIDERS.openrouter;
function parseModelIds(args) {
  return args.trim().split(/[\s,]+/).filter(Boolean).map((arg) => {
    const match = arg.match(/openrouter\.ai\/([^?#]+)/);
    return match ? match[1] : arg;
  });
}
function ensureProviderOrder(providers) {
  const ordered = {};
  const keys = Object.keys(providers);
  const orIdx = keys.indexOf("openrouter");
  const olIdx = keys.indexOf("ollama");
  if (orIdx !== -1) {
    ordered["openrouter"] = providers["openrouter"];
  }
  if (olIdx !== -1 && (orIdx === -1 || olIdx < orIdx)) {
    ordered["ollama"] = providers["ollama"];
  }
  for (const key of keys) {
    if (key in ordered) continue;
    ordered[key] = providers[key];
  }
  return ordered;
}
function openrouter_sync_temp_default(pi) {
  pi.registerCommand("openrouter-sync", {
    description: "Add OpenRouter model(s) to models.json. Use: /or-sync <url-or-id> [url-or-id ...]",
    async handler(args, ctx) {
      const modelIds = parseModelIds(args);
      if (modelIds.length === 0) {
        ctx.ui.notify(
          "Usage: /or-sync <model-url-or-id> \u2014 e.g. /or-sync https://openrouter.ai/liquid/lfm-2.5-1.2b-thinking:free",
          "info"
        );
        return;
      }
      ctx.ui.setStatus("openrouter-sync", `Adding ${modelIds.length} model(s)...`);
      try {
        const existing = readModelsJson();
        if (!existing.providers["openrouter"]) {
          existing.providers["openrouter"] = {
            baseUrl: OR_CONFIG.baseUrl,
            api: OR_CONFIG.api,
            models: []
          };
        }
        const orProvider = existing.providers["openrouter"];
        if (!orProvider.models) orProvider.models = [];
        const existingIds = new Set(orProvider.models.map((m) => m.id));
        const added = [];
        const skipped = [];
        for (const modelId of modelIds) {
          if (existingIds.has(modelId)) {
            skipped.push(modelId);
            continue;
          }
          orProvider.models.push({ id: modelId });
          added.push(modelId);
        }
        existing.providers = ensureProviderOrder(existing.providers);
        writeModelsJson(existing);
        const lines = [""];
        lines.push(`  Provider: openrouter (built-in)`);
        lines.push(`  Base URL: ${OR_CONFIG.baseUrl}`);
        lines.push(`  Total models: ${orProvider.models.length}`);
        if (added.length > 0) {
          lines.push(section("Added"));
          for (const id of added) lines.push(ok(id));
        }
        if (skipped.length > 0) {
          lines.push(section("Already Present"));
          for (const id of skipped) lines.push(warn(id));
        }
        lines.push("");
        lines.push(`  Written to ${MODELS_FILE}`);
        lines.push(`  Run /reload to pick up changes`);
        lines.push(BRANDING);
        const report = lines.join("\n");
        const summary = [];
        if (added.length > 0) summary.push(`+${added.join(", ")}`);
        if (skipped.length > 0) summary.push(`skipped: ${skipped.join(", ")}`);
        ctx.ui.notify(summary.join(" \xB7 ") || "No changes", added.length > 0 ? "success" : "info");
        pi.sendMessage({
          customType: "openrouter-sync-report",
          content: report,
          display: { type: "content", content: report },
          details: { timestamp: (/* @__PURE__ */ new Date()).toISOString(), added: added.length, skipped: skipped.length }
        });
      } catch (err) {
        ctx.ui.notify(`Failed: ${err.message}`, "error");
      }
      ctx.ui.setStatus("openrouter-sync", void 0);
    }
  });
  pi.registerTool({
    name: "openrouter_sync",
    label: "OpenRouter Sync",
    description: "Add one or more OpenRouter model IDs to Pi's models.json under the openrouter provider.\nAccepts full URLs (https://openrouter.ai/...) or bare model IDs (owner/model:tag).\nThe openrouter provider is created if it doesn't exist, and positioned above ollama.\nExisting models are never removed.\n\n" + BRANDING,
    parameters: {
      type: "object",
      properties: {
        models: {
          type: "array",
          items: { type: "string" },
          description: 'Array of model identifiers \u2014 full OpenRouter URLs or bare IDs. e.g. ["https://openrouter.ai/liquid/lfm-2.5-1.2b-thinking:free", "nvidia/nemotron-3-nano-30b-a3b:free"]'
        }
      },
      required: ["models"]
    },
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const rawModels = params?.models;
      if (!Array.isArray(rawModels) || rawModels.length === 0) {
        return {
          content: [{ type: "text", text: "Error: 'models' must be a non-empty array of model IDs or URLs." }],
          details: {}
        };
      }
      const modelIds = parseModelIds(rawModels.join(" "));
      const existing = readModelsJson();
      if (!existing.providers["openrouter"]) {
        existing.providers["openrouter"] = {
          baseUrl: OR_CONFIG.baseUrl,
          api: OR_CONFIG.api,
          models: []
        };
      }
      const orProvider = existing.providers["openrouter"];
      if (!orProvider.models) orProvider.models = [];
      const existingIds = new Set(orProvider.models.map((m) => m.id));
      const added = [];
      const skipped = [];
      for (const modelId of modelIds) {
        if (existingIds.has(modelId)) {
          skipped.push(modelId);
          continue;
        }
        orProvider.models.push({ id: modelId });
        added.push(modelId);
      }
      existing.providers = ensureProviderOrder(existing.providers);
      writeModelsJson(existing);
      const modelList = orProvider.models.map((m) => `  - ${m.id}`).join("\n");
      const report = [
        BRANDING,
        "",
        `Added ${added.length} model(s) to openrouter provider (${orProvider.models.length} total).`,
        ...added.length > 0 ? ["\nAdded:"] : [],
        ...added.map((id) => `  + ${id}`),
        ...skipped.length > 0 ? ["\nSkipped (already present):"] : [],
        ...skipped.map((id) => `  = ${id}`),
        "",
        `Written to ${MODELS_FILE}. Run /reload to pick up changes.`,
        "",
        "Current openrouter models:",
        modelList
      ].join("\n");
      return {
        content: [{ type: "text", text: report }],
        details: { added: added.length, skipped: skipped.length, total: orProvider.models.length }
      };
    }
  });
}
export {
  openrouter_sync_temp_default as default
};
