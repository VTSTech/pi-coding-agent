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
var EXTENSION_VERSION = "1.2.3";
var MODELS_JSON_PATH = path.join(os.homedir(), ".pi", "agent", "models.json");
var _modelsJsonCache = null;
var _ollamaBaseUrlCache = null;
var CACHE_TTL_MS = 2e3;
function getOllamaBaseUrl() {
  const now = Date.now();
  if (_ollamaBaseUrlCache && now - _ollamaBaseUrlCache.ts < CACHE_TTL_MS) return _ollamaBaseUrlCache.data;
  try {
    if (fs.existsSync(MODELS_JSON_PATH)) {
      const raw = fs.readFileSync(MODELS_JSON_PATH, "utf-8");
      const config = JSON.parse(raw);
      const baseUrl = config?.providers?.["ollama"]?.baseUrl;
      if (baseUrl) {
        const result = baseUrl.replace(/\/v1\/?$/, "");
        _ollamaBaseUrlCache = { data: result, ts: now };
        return result;
      }
    }
  } catch (err) {
    debugLog("ollama", "failed to parse models.json for base URL", err);
  }
  if (process.env.OLLAMA_HOST) {
    const result = `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, "")}`;
    _ollamaBaseUrlCache = { data: result, ts: now };
    return result;
  }
  const fallback = "http://localhost:11434";
  _ollamaBaseUrlCache = { data: fallback, ts: now };
  return fallback;
}
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
var DEFAULT_RETRY_OPTIONS = {
  maxRetries: 2,
  baseDelayMs: 1e3,
  maxDelayMs: 1e4,
  retryOnTimeout: true,
  retryOnConnectionError: true
};
function backoffDelay(attempt, baseDelayMs, maxDelayMs) {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(delay + jitter));
}
var RETRYABLE_ERROR_PATTERNS = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "fetch failed",
  "network error",
  "socket hang up",
  "Empty response"
];
function isRetryableError(error, opts) {
  if (error instanceof Error) {
    if (error.name === "AbortError" && opts.retryOnTimeout) return true;
    const msg = error.message;
    if (opts.retryOnConnectionError && RETRYABLE_ERROR_PATTERNS.some((p) => msg.includes(p))) {
      return true;
    }
  }
  return false;
}
async function withRetry(fn, options) {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < opts.maxRetries && isRetryableError(error, opts)) {
        const delay = backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
        debugLog("ollama", `Retry ${attempt + 1}/${opts.maxRetries} after ${delay}ms: ${error instanceof Error ? error.message : String(error)}`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
async function fetchOllamaModels(baseUrl) {
  return withRetry(async () => {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5e3)
    });
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    const data = await res.json();
    return data.models ?? [];
  });
}
async function fetchModelContextLength(baseUrl, modelName) {
  return withRetry(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
        signal: AbortSignal.timeout(3e4)
      });
      if (!res.ok) return void 0;
      const data = await res.json();
      for (const key of Object.keys(data?.model_info ?? {})) {
        if (key.endsWith(".context_length")) {
          const val = data.model_info[key];
          if (typeof val === "number") return val;
        }
      }
      const numCtx = data?.model_info?.["num_ctx"];
      if (typeof numCtx === "number") return numCtx;
    } catch (err) {
      debugLog("ollama", `failed to fetch context length for ${modelName}`, err);
      return void 0;
    }
    return void 0;
  });
}
async function fetchContextLengthsBatched(baseUrl, modelNames, batchSize = 3) {
  const result = /* @__PURE__ */ new Map();
  for (let i = 0; i < modelNames.length; i += batchSize) {
    const batch = modelNames.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((name) => fetchModelContextLength(baseUrl, name))
    );
    results.forEach((r, idx) => {
      result.set(batch[idx], r.status === "fulfilled" ? r.value : void 0);
    });
  }
  return result;
}
function isReasoningModel(name) {
  const lower = name.toLowerCase();
  return lower.includes("deepseek-r1") || lower.includes("qwq") || /\bo1\b/.test(lower) || /\bo3\b/.test(lower) || lower.includes("qwen3") || lower.includes("reasoning") || lower.includes("thinker") || lower.includes("thinking");
}

// shared/provider-sync.ts
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

// shared/model-test-utils.ts
import * as fs2 from "node:fs";
import * as os2 from "node:os";
import * as path2 from "node:path";
var CONFIG = {
  // General API settings
  DEFAULT_TIMEOUT_MS: 999999,
  // ~16.7 minutes — effectively unlimited for slow models
  CONNECT_TIMEOUT_S: 60,
  // 60 seconds to establish connection
  MAX_RETRIES: 1,
  // Single retry for transient failures
  RETRY_DELAY_MS: 1e4,
  // 10 seconds between retries
  // Model generation settings
  NUM_PREDICT: 1024,
  // Max tokens in response
  TEMPERATURE: 0.1,
  // Low temperature for more deterministic output
  // Test-specific settings
  MIN_THINKING_LENGTH: 10,
  // Minimum chars to consider thinking tokens valid
  TOOL_TEST_TIMEOUT_MS: 999999,
  // Effectively unlimited for slow tool usage tests
  TOOL_SUPPORT_TIMEOUT_MS: 999999,
  // Effectively unlimited for tool support detection
  // Metadata retrieval
  TAGS_TIMEOUT_MS: 15e3,
  // 15 seconds for /api/tags
  MODEL_INFO_TIMEOUT_MS: 3e4,
  // 30 seconds for model info lookup
  // Provider API settings
  PROVIDER_TIMEOUT_MS: 999999,
  // Effectively unlimited for cloud provider API calls
  PROVIDER_TOOL_TIMEOUT_MS: 12e4,
  // 120 seconds for tool usage tests on providers
  // Context length fetching
  CONTEXT_BATCH_SIZE: 3,
  // Concurrent requests when fetching model context lengths
  // Rate limiting
  TEST_DELAY_MS: 1e4
  // 10 seconds between tests to avoid rate limiting
};
var TEST_CONFIG_DIR = path2.join(os2.homedir(), ".pi", "agent");
var TEST_CONFIG_PATH = path2.join(TEST_CONFIG_DIR, "model-test-config.json");
function readTestConfig() {
  try {
    if (fs2.existsSync(TEST_CONFIG_PATH)) {
      const raw = fs2.readFileSync(TEST_CONFIG_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
  }
  return {};
}
function getEffectiveConfig() {
  const userConfig = readTestConfig();
  return {
    ...CONFIG,
    DEFAULT_TIMEOUT_MS: userConfig.defaultTimeoutMs ?? CONFIG.DEFAULT_TIMEOUT_MS,
    CONNECT_TIMEOUT_S: userConfig.connectTimeoutS ?? CONFIG.CONNECT_TIMEOUT_S,
    MAX_RETRIES: userConfig.maxRetries ?? CONFIG.MAX_RETRIES,
    RETRY_DELAY_MS: userConfig.retryDelayMs ?? CONFIG.RETRY_DELAY_MS,
    TEST_DELAY_MS: userConfig.testDelayMs ?? CONFIG.TEST_DELAY_MS,
    TOOL_TEST_TIMEOUT_MS: userConfig.toolTestTimeoutMs ?? CONFIG.TOOL_TEST_TIMEOUT_MS,
    PROVIDER_TIMEOUT_MS: userConfig.providerTimeoutMs ?? CONFIG.PROVIDER_TIMEOUT_MS,
    PROVIDER_TOOL_TIMEOUT_MS: userConfig.providerToolTimeoutMs ?? CONFIG.PROVIDER_TOOL_TIMEOUT_MS,
    CONTEXT_BATCH_SIZE: userConfig.contextBatchSize ?? CONFIG.CONTEXT_BATCH_SIZE,
    NUM_PREDICT: userConfig.numPredict ?? CONFIG.NUM_PREDICT,
    TEMPERATURE: userConfig.temperature ?? CONFIG.TEMPERATURE
  };
}
var TOOL_SUPPORT_CACHE_DIR = path2.join(os2.homedir(), ".pi", "agent", "cache");
var TOOL_SUPPORT_CACHE_PATH = path2.join(TOOL_SUPPORT_CACHE_DIR, "tool_support.json");
var TEST_HISTORY_DIR = path2.join(os2.homedir(), ".pi", "agent", "cache");
var TEST_HISTORY_PATH = path2.join(TEST_HISTORY_DIR, "model-test-history.json");

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
function info(msg) {
  return `  \u2139\uFE0F  ${msg}`;
}
function bytesHuman(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let b = bytes;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(1)}${units[i]}`;
}
function estimateMemory(parameterSize, quantizationLevel, contextLength) {
  const params = parseParamCount(parameterSize);
  if (params === void 0) return void 0;
  const bitsPerParam = bitsPerParamForQuant(quantizationLevel);
  const modelBytes = params * bitsPerParam / 8;
  const cpuMultiplier = contextLength != null ? 1.5 + contextLength / 1e5 : 2.5;
  return {
    gpu: Math.ceil(modelBytes * 1.1),
    // 10% overhead — GPU: weights dominate
    cpu: Math.ceil(modelBytes * cpuMultiplier)
    // context-aware — CPU: KV cache dominates
  };
}
function parseParamCount(s) {
  if (!s || typeof s !== "string") return void 0;
  const str = s.trim().toLowerCase();
  const match = str.match(/^([\d.]+)\s*([bmt]?|a(?:pple)?)$/);
  if (!match) return void 0;
  const num = parseFloat(match[1]);
  if (isNaN(num) || num <= 0) return void 0;
  const suffix = match[2];
  switch (suffix) {
    case "b":
      return num * 1e9;
    case "m":
      return num * 1e6;
    case "t":
      return num * 1e12;
    case "a":
      return num * 1e9;
    // Apple-style (e.g., "3a" = 3B parameters)
    case "":
      return num * 1e9;
    // Bare number assumed to be billions
    default:
      return void 0;
  }
}
function bitsPerParamForQuant(quant) {
  const q = quant.toUpperCase().replace(/[-_.]/g, "");
  if (q.startsWith("FP32") || q === "F32" || q === "TF32") return 32;
  if (q.startsWith("F16") || q === "BF16") return 16;
  if (q.startsWith("Q8")) return 8;
  if (q.startsWith("IQ4")) return 4.5;
  if (q.startsWith("IQ3")) return 3.5;
  if (q.startsWith("IQ2")) return 2.5;
  if (q.startsWith("IQ1")) return 1.75;
  if (q.startsWith("Q5") || q.startsWith("Q6")) return 5.5;
  if (q.startsWith("Q4")) return 4.5;
  if (q.startsWith("Q3")) return 3.5;
  if (q.startsWith("Q2")) return 2.5;
  if (q.startsWith("Q1")) return 1.75;
  return 5;
}

// extensions/ollama-sync.ts
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
  const estimatedSize = estimateMemory(m.details.parameter_size, m.details.quantization_level, contextLength);
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
async function performSync(overrideUrl) {
  let ollamaBaseUrl;
  if (overrideUrl) {
    ollamaBaseUrl = overrideUrl.replace(/\/v1$/, "").replace(/\/+$/, "");
  } else {
    const preview = readModelsJson();
    const config = getProviderConfig(preview);
    ollamaBaseUrl = config.baseUrl?.replace(/\/v1$/, "") ?? getOllamaBaseUrl();
  }
  try {
    const models = await fetchOllamaModels(ollamaBaseUrl);
    if (models.length === 0) {
      return {
        ollamaBaseUrl,
        newModels: [],
        added: [],
        removed: [],
        error: "No models found in Ollama"
      };
    }
    const sorted = [...models].sort((a, b) => a.size - b.size);
    const testConfig = getEffectiveConfig();
    const contextMap = await fetchContextLengthsBatched(
      ollamaBaseUrl,
      sorted.map((m) => m.name),
      testConfig.CONTEXT_BATCH_SIZE
    );
    const newModels = sorted.map(
      (m) => buildModelEntry(m, contextMap.get(m.name))
    );
    let added = [];
    let removed = [];
    await readModifyWriteModelsJson((existing) => {
      const config = getProviderConfig(existing);
      const oldIds = new Set(
        existing.providers["ollama"]?.models?.map((m) => m.id) ?? []
      );
      added = newModels.filter((m) => !oldIds.has(m.id));
      removed = [...oldIds].filter((id) => !newModels.some((m) => m.id === id));
      const mergedModels = mergeModels(
        newModels,
        existing.providers["ollama"]?.models ?? []
      );
      existing.providers["ollama"] = {
        ...config,
        baseUrl: ollamaBaseUrl + "/v1",
        models: mergedModels
      };
      return existing;
    });
    return {
      ollamaBaseUrl,
      newModels,
      added,
      removed
    };
  } catch (err) {
    return {
      ollamaBaseUrl,
      newModels: [],
      added: [],
      removed: [],
      error: err.message
    };
  }
}
function ollama_sync_default(pi) {
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
        const result = await performSync(overrideUrl);
        if (result.error) {
          ctx.ui.notify(result.error, result.newModels.length === 0 ? "info" : "error");
          ctx.ui.setStatus("ollama-sync", void 0);
          return;
        }
        const { ollamaBaseUrl, newModels, added, removed } = result;
        const lines = [""];
        lines.push(`  Ollama: ${ollamaBaseUrl}`);
        lines.push(`  Synced ${newModels.length} models from Ollama`);
        lines.push(section("Synced Models"));
        for (const m of newModels) {
          lines.push(ok(m.id));
          const ctxStr = m.contextLength != null ? m.contextLength.toLocaleString() : "?";
          const sizeStr = m.estimatedSize ? `GPU: ~${bytesHuman(m.estimatedSize.gpu)} \xB7 CPU: ~${bytesHuman(m.estimatedSize.cpu)}` : "?";
          lines.push(
            `       Params: ${m.parameterSize ?? "?"} \xB7 Quant: ${m.quantizationLevel ?? "?"} \xB7 Family: ${m.modelFamily ?? "?"} \xB7 Context: ${ctxStr} \xB7 ${sizeStr}`
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
        lines.push(`  Written to ${MODELS_JSON_PATH}`);
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
      const result = await performSync(overrideUrl);
      if (result.error) {
        return {
          content: [{ type: "text", text: `Error: ${result.error}` }],
          details: {}
        };
      }
      const { ollamaBaseUrl, newModels } = result;
      const modelDetails = newModels.map(
        (m) => {
          const ctxStr = m.contextLength ?? "?";
          const sizeStr = m.estimatedSize ? `GPU: ~${bytesHuman(m.estimatedSize.gpu)}, CPU: ~${bytesHuman(m.estimatedSize.cpu)}` : "?";
          return `  \u2022 ${m.id} (${m.parameterSize}, ${m.quantizationLevel}, ctx: ${ctxStr}, ${sizeStr})`;
        }
      ).join("\n");
      return {
        content: [
          {
            type: "text",
            text: `${BRANDING}

Synced ${newModels.length} models from ${ollamaBaseUrl} to ${MODELS_JSON_PATH}. Run /reload to pick up changes.

${modelDetails}`
          }
        ],
        details: { models: newModels }
      };
    }
  });
}
export {
  ollama_sync_default as default
};
