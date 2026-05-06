import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { debugLog } from "./debug";
const EXTENSION_VERSION = "1.2.3";
const MODELS_JSON_PATH = path.join(os.homedir(), ".pi", "agent", "models.json");
let _modelsJsonCache = null;
let _ollamaBaseUrlCache = null;
const CACHE_TTL_MS = 2e3;
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
let _modelsJsonLock = null;
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
const DEFAULT_RETRY_OPTIONS = {
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
const RETRYABLE_ERROR_PATTERNS = [
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
const BUILTIN_PROVIDERS = {
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
function detectModelFamily(modelName) {
  const name = modelName.toLowerCase();
  const families = [
    ["qwen3.5", "qwen35"],
    ["qwen3", "qwen3"],
    ["qwen2.5", "qwen2"],
    ["qwen2", "qwen2"],
    ["qwen", "qwen2"],
    ["llama3.3", "llama"],
    ["llama3.2", "llama"],
    ["llama3.1", "llama"],
    ["llama3", "llama"],
    ["llama", "llama"],
    ["gemma3", "gemma3"],
    ["gemma2", "gemma2"],
    ["gemma", "gemma2"],
    ["granite", "granite"],
    ["dolphin", "dolphin"],
    ["glm-4", "glm"],
    ["glm", "glm"],
    ["deepseek-r1", "deepseek-r1"],
    ["deepseek", "deepseek"],
    ["mistral", "qwen2"],
    ["phi", "llama"],
    ["tinyllama", "llama"],
    ["codestral", "qwen2"]
  ];
  for (const [prefix, family] of families) {
    if (name.includes(prefix)) return family;
  }
  return "unknown";
}
function detectProvider(ctx, modelsJson) {
  const model = ctx.model;
  if (!model) return { kind: "unknown", name: "none" };
  const providerName = model.provider || "";
  if (!providerName) return { kind: "unknown", name: "none" };
  const effectiveModelsJson = modelsJson ?? readModelsJson();
  const userProviderCfg = (effectiveModelsJson.providers || {})[providerName];
  if (userProviderCfg) {
    const baseUrl = userProviderCfg.baseUrl || "";
    const apiMode = userProviderCfg.api || "";
    const apiKey = userProviderCfg.apiKey || "";
    const isOllama = /ollama/i.test(providerName) || /localhost:\d+/.test(baseUrl) || /127\.0\.0\.1:\d+/.test(baseUrl) || /0\.0\.0\.0:\d+/.test(baseUrl) || /\/api\/chat/.test(baseUrl) || apiMode === "ollama";
    if (isOllama) {
      return { kind: "ollama", name: providerName, apiMode: "ollama", baseUrl, apiKey };
    }
    if (/\/api\/chat/.test(baseUrl)) {
      return { kind: "ollama", name: providerName, apiMode: "ollama", baseUrl, apiKey };
    }
    return {
      kind: "builtin",
      name: providerName,
      apiMode: apiMode || "openai-completions",
      baseUrl,
      apiKey
    };
  }
  const builtin = BUILTIN_PROVIDERS[providerName];
  if (builtin) {
    const apiKey = process.env[builtin.envKey] || "";
    return {
      kind: "builtin",
      name: providerName,
      apiMode: builtin.api,
      baseUrl: builtin.baseUrl,
      envKey: builtin.envKey,
      apiKey
    };
  }
  return { kind: "unknown", name: providerName };
}
function isLocalProvider(baseUrl, providerName) {
  if (providerName === "ollama") return true;
  const url = baseUrl || "";
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0");
}
export {
  BUILTIN_PROVIDERS,
  EXTENSION_VERSION,
  MODELS_JSON_PATH,
  acquireModelsJsonLock,
  detectModelFamily,
  detectProvider,
  fetchContextLengthsBatched,
  fetchModelContextLength,
  fetchOllamaModels,
  getOllamaBaseUrl,
  isLocalProvider,
  isReasoningModel,
  readModelsJson,
  readModifyWriteModelsJson,
  withRetry,
  writeModelsJson
};
