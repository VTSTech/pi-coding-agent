// shared/ollama.ts
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

// shared/debug.ts
var DEBUG_ENABLED = process?.env?.PI_EXTENSIONS_DEBUG === "1";
function debugLog(module, message, ...args) {
  if (!DEBUG_ENABLED) return;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  console.debug(`[pi-ext:${module}] ${timestamp} ${message}`, ...args);
}

// shared/ollama.ts
var EXTENSION_VERSION = "1.2.9";
var MODELS_JSON_PATH = path.join(os.homedir(), ".pi", "agent", "models.json");
var _modelsJsonCache = null;
var _ollamaBaseUrlCache = null;
var CACHE_TTL_MS = 2e3;
function readModelsJson() {
  const now = Date.now();
  if (_modelsJsonCache && now - _modelsJsonCache.ts < CACHE_TTL_MS) return _modelsJsonCache.data;
  try {
    if (fs.existsSync(MODELS_JSON_PATH)) {
      const raw = fs.readFileSync(MODELS_JSON_PATH, "utf-8");
      const data = JSON.parse(raw);
      _modelsJsonCache = { data, ts: now };
      return data;
    }
  } catch (err) {
    debugLog("ollama", "failed to read/parse models.json", err);
  }
  const empty = { providers: {} };
  _modelsJsonCache = { data: empty, ts: now };
  return empty;
}
function writeModelsJson(data) {
  const dir = path.dirname(MODELS_JSON_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = MODELS_JSON_PATH + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  fs.renameSync(tmpPath, MODELS_JSON_PATH);
  _modelsJsonCache = null;
  _ollamaBaseUrlCache = null;
}
var _modelsJsonLock = null;
async function acquireModelsJsonLock() {
  while (_modelsJsonLock) {
    await _modelsJsonLock;
  }
  let releaseLock;
  _modelsJsonLock = new Promise((resolve) => {
    releaseLock = resolve;
  });
  return {
    release: () => {
      releaseLock();
      _modelsJsonLock = null;
    }
  };
}
async function readModifyWriteModelsJson(modifier) {
  const { release } = await acquireModelsJsonLock();
  try {
    const data = readModelsJson();
    const modified = modifier(data);
    if (modified === null) return false;
    writeModelsJson(modified);
    return true;
  } finally {
    release();
  }
}
var BUILTIN_PROVIDERS = {
  openrouter: { api: "openai-completions", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" },
  anthropic: { api: "anthropic-messages", baseUrl: "https://api.anthropic.com/v1", envKey: "ANTHROPIC_API_KEY" },
  google: { api: "gemini", baseUrl: "https://generativelanguage.googleapis.com", envKey: "GOOGLE_API_KEY" },
  openai: { api: "openai-completions", baseUrl: "https://api.openai.com/v1", envKey: "OPENAI_API_KEY" },
  groq: { api: "openai-completions", baseUrl: "https://api.groq.com/v1", envKey: "GROQ_API_KEY" },
  deepseek: { api: "openai-completions", baseUrl: "https://api.deepseek.com/v1", envKey: "DEEPSEEK_API_KEY" },
  mistral: { api: "openai-completions", baseUrl: "https://api.mistral.ai/v1", envKey: "MISTRAL_API_KEY" },
  xai: { api: "openai-completions", baseUrl: "https://api.x.ai/v1", envKey: "XAI_API_KEY" },
  together: { api: "openai-completions", baseUrl: "https://api.together.xyz/v1", envKey: "TOGETHER_API_KEY" },
  fireworks: { api: "openai-completions", baseUrl: "https://api.fireworks.ai/inference/v1", envKey: "FIREWORKS_API_KEY" },
  cohere: { api: "cohere-chat", baseUrl: "https://api.cohere.com/v1", envKey: "COHERE_API_KEY" },
  zai: { api: "openai-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4", envKey: "ZAI_API_KEY" }
};

// shared/format.ts
function section(title) {
  return `
\u2500\u2500 ${title} ${"\u2500".repeat(Math.max(1, 60 - title.length - 4))}`;
}
function ok(msg) {
  return `  \u2705 ${msg}`;
}
function warn(msg) {
  return `  \u26A0\uFE0F  ${msg}`;
}

// extensions/openrouter-sync.ts
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
async function performSync(modelIds) {
  let result;
  await readModifyWriteModelsJson((data) => {
    if (!data.providers["openrouter"]) {
      data.providers["openrouter"] = {
        baseUrl: OR_CONFIG.baseUrl,
        api: OR_CONFIG.api,
        models: []
      };
    }
    const orProvider = data.providers["openrouter"];
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
    data.providers = ensureProviderOrder(data.providers);
    result = { added, skipped, totalModels: orProvider.models.length };
    return data;
  });
  return result;
}
function openrouter_sync_default(pi) {
  pi.registerCommand("openrouter-sync", {
    description: "Add OpenRouter model(s) to models.json. Use: /or-sync <url-or-id> [url-or-id ...]",
    detailedHelp: "\n\n\u{1F310} OpenRouter Synchronization Extension\n\nAdds OpenRouter model IDs to Pi's models.json configuration under\nthe 'openrouter' provider. Creates the provider if it doesn't exist.\n\n\u{1F4CB} Usage:\n  /openrouter-sync <model>                  - Add single model\n  /openrouter-sync --help                  - Show this help\n  /openrouter-sync <model1> <model2>        - Add multiple models\n  /or-sync <model>                          - Short alias\n\n\u{1F527} Supported Formats:\n\u2022 Full URLs: https://openrouter.ai/liquid/lfm-2.5-1.2b-thinking:free\n\u2022 Bare IDs: liquid/lfm-2.5-1.2b-thinking:free\n\u2022 Mixed: https://openrouter.ai/model1 liquid/model2:tag\n\n\u{1F4CA} Features:\n\u2022 Automatic provider creation and ordering\n\u2022 Duplicate model detection (skips existing)\n\u2022 Atomic configuration updates\n\u2022 Built-in provider configuration\n\u2022 Position above ollama in provider list\n\n\u{1F4A1} Tips:\n\u2022 Use /or-sync as a shorter alias\n\u2022 Models are never removed, only added\n\u2022 Run /reload after sync to apply changes\n\u2022 Works with all OpenRouter free and paid models\n",
    async handler(args, ctx) {
      if (args.trim() === "--help") {
        ctx.ui.notify(
          "\u{1F310} OpenRouter Synchronization Extension\n\n\u{1F4CB} Usage:\n  /openrouter-sync <model>                  - Add single model\n  /openrouter-sync --help                  - Show this help\n  /openrouter-sync <model1> <model2>        - Add multiple models\n  /or-sync <model>                          - Short alias\n\n\u{1F527} Supported Formats:\n\u2022 Full URLs: https://openrouter.ai/liquid/lfm-2.5-1.2b-thinking:free\n\u2022 Bare IDs: liquid/lfm-2.5-1.2b-thinking:free\n\u2022 Mixed: https://openrouter.ai/model1 liquid/model2:tag\n\n\u{1F4CA} Features:\n\u2022 Automatic provider creation and ordering\n\u2022 Duplicate model detection (skips existing)\n\u2022 Atomic configuration updates\n\u2022 Built-in provider configuration\n\u2022 Position above ollama in provider list\n\n\u{1F4A1} Tips:\n\u2022 Use /or-sync as a shorter alias\n\u2022 Models are never removed, only added\n\u2022 Run /reload after sync to apply changes\n\u2022 Works with all OpenRouter free and paid models\n",
          "info"
        );
        return;
      }
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
        const { added, skipped, totalModels } = await performSync(modelIds);
        const lines = [""];
        lines.push(`  Provider: openrouter (built-in)`);
        lines.push(`  Base URL: ${OR_CONFIG.baseUrl}`);
        lines.push(`  Total models: ${totalModels}`);
        if (added.length > 0) {
          lines.push(section("Added"));
          for (const id of added) lines.push(ok(id));
        }
        if (skipped.length > 0) {
          lines.push(section("Already Present"));
          for (const id of skipped) lines.push(warn(id));
        }
        lines.push("");
        lines.push(`  Written to ${MODELS_JSON_PATH}`);
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
      try {
        const { added, skipped, totalModels } = await performSync(modelIds);
        const config = readModelsJson();
        const orProvider = config.providers["openrouter"];
        const modelList = (orProvider?.models || []).map((m) => `  - ${m.id}`).join("\n");
        const report = [
          BRANDING,
          "",
          `Added ${added.length} model(s) to openrouter provider (${totalModels} total).`,
          ...added.length > 0 ? ["\nAdded:"] : [],
          ...added.map((id) => `  + ${id}`),
          ...skipped.length > 0 ? ["\nSkipped (already present):"] : [],
          ...skipped.map((id) => `  = ${id}`),
          "",
          `Written to ${MODELS_JSON_PATH}. Run /reload to pick up changes.`,
          "",
          "Current openrouter models:",
          modelList
        ].join("\n");
        return {
          content: [{ type: "text", text: report }],
          details: { added: added.length, skipped: skipped.length, total: totalModels }
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
  openrouter_sync_default as default
};
