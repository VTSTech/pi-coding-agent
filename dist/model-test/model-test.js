var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});

// shared/format.ts
function section(title) {
  return `
\u2500\u2500 ${title} ${"\u2500".repeat(Math.max(1, 60 - title.length - 4))}`;
}
function ok(msg) {
  return `  \u2705 ${msg}`;
}
function fail(msg) {
  return `  \u274C ${msg}`;
}
function warn(msg) {
  return `  \u26A0\uFE0F  ${msg}`;
}
function info(msg) {
  return `  \u2139\uFE0F  ${msg}`;
}
function msHuman(ms) {
  if (ms < 1e3) return `${ms.toFixed(0)}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${(ms / 6e4).toFixed(1)}m`;
}
function truncate(s, max) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
function sanitizeForReport(s, maxLines = 40) {
  let cleaned = s.replace(/^\s*```[a-zA-Z]*[ \t]*\n?/gm, "");
  cleaned = cleaned.replace(/^\s*```[ \t]*\n?/gm, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  if (/<!DOCTYPE\b|<html[\s>]/i.test(cleaned) || /<[a-z][\s\S]*>/i.test(cleaned) && cleaned.includes("</") && /<(?:div|span|p|head|body|html|table|form|script)\b/i.test(cleaned)) {
    const firstLine = cleaned.split("\n")[0];
    return truncate(firstLine, 200) + "\n  \u2139\uFE0F  (HTML response truncated)";
  }
  const lines = cleaned.split("\n");
  if (lines.length > maxLines) {
    cleaned = lines.slice(0, maxLines).join("\n") + `
  \u2139\uFE0F  (truncated, ${lines.length - maxLines} more lines)`;
  }
  return cleaned;
}

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
var EXTENSION_VERSION = "1.2.7";
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

// shared/react-parser.ts
function sanitizeModelJson(text) {
  text = text.replace(/:\s*True\b/g, ": true");
  text = text.replace(/:\s*False\b/g, ": false");
  text = text.replace(/:\s*None\b/g, ": null");
  text = text.replace(/\[\s*True\b/g, "[true");
  text = text.replace(/\[\s*False\b/g, "[false");
  text = text.replace(/\[\s*None\b/g, "[null");
  text = text.replace(/("(?:[^"\\]|\\.)*")\s*\+\s*[^,}'"\]\n]+/g, "$1");
  text = text.replace(/,\s*([}\]])/g, "$1");
  text = text.replace(/\\\\\\\\/g, "\\\\");
  return text;
}
var REACT_DIALECTS = [
  {
    name: "react",
    actionTag: "Action:",
    inputTag: "Action Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Action:"],
    finalTag: "Final Answer:"
  },
  {
    name: "function",
    actionTag: "Function:",
    inputTag: "Function Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Function:", "Action:"],
    finalTag: "Final Answer:"
  },
  {
    name: "tool",
    actionTag: "Tool:",
    inputTag: "Tool Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Tool:", "Action:"],
    finalTag: "Final Answer:"
  },
  {
    name: "call",
    actionTag: "Call:",
    inputTag: "Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Call:", "Action:"],
    finalTag: "Final Answer:"
  }
];
function buildDialectPatterns(d) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const aT = esc(d.actionTag);
  const iT = esc(d.inputTag);
  const stopAlt = d.stopTags.map(esc).join("|");
  const tT = d.thoughtTag ? esc(d.thoughtTag) : void 0;
  const fT = d.finalTag ? esc(d.finalTag) : void 0;
  const thoughtRe = tT ? new RegExp(`${tT}\\s*(.*?)(?=${aT}|${fT}|$)`, "is") : void 0;
  const actionRe = new RegExp(
    `${aT}\\s*[\\x60"']?(\\w+)[\\x60"']?\\s*\\n?\\s*${iT}\\s*(.*?)(?=\\n\\s*(?:${stopAlt})|$)`,
    "is"
  );
  const actionReSameline = new RegExp(
    `${aT}\\s*[\\x60"']?(\\w+)[\\x60"']?\\s+${iT}\\s*(.*?)(?=\\n\\s*(?:${stopAlt})|$)`,
    "is"
  );
  const actionReLoose = new RegExp(
    `${aT}\\s*(.+?)\\n\\s*${iT}\\s*(.*?)(?=\\n\\s*(?:${stopAlt})|$)`,
    "is"
  );
  const actionReParen = new RegExp(`${aT}\\s*(\\w+)\\s*\\(([^)]*)\\)`, "i");
  const finalAnswerRe = fT ? new RegExp(`${fT}\\s*([\\s\\S]*?)$`, "i") : void 0;
  return { thoughtRe, actionRe, actionReSameline, actionReLoose, actionReParen, finalAnswerRe, dialect: d };
}
var ALL_DIALECT_PATTERNS = REACT_DIALECTS.map(buildDialectPatterns);
var CLASSIC_PATTERNS = ALL_DIALECT_PATTERNS[0];
var THOUGHT_RE = CLASSIC_PATTERNS.thoughtRe;
var ACTION_RE = CLASSIC_PATTERNS.actionRe;
var ACTION_RE_SAMELINE = CLASSIC_PATTERNS.actionReSameline;
var ACTION_RE_LOOSE = CLASSIC_PATTERNS.actionReLoose;
var ACTION_RE_PAREN = CLASSIC_PATTERNS.actionReParen;
var FINAL_ANSWER_RE = CLASSIC_PATTERNS.finalAnswerRe;
function extractJsonArgs(rawArgs) {
  const start = rawArgs.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < rawArgs.length; i++) {
    if (rawArgs[i] === "{") depth++;
    else if (rawArgs[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const jsonStr = rawArgs.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : { input: String(parsed) };
  } catch {
  }
  try {
    const sanitized = sanitizeModelJson(jsonStr);
    const parsed = JSON.parse(sanitized);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : { input: String(parsed) };
  } catch {
  }
  const exprMatch = jsonStr.match(/['"]expression['"]:\s*['"]([^'"]+)['"]/);
  if (exprMatch) return { expression: exprMatch[1] };
  const cmdMatch = jsonStr.match(/['"]command['"]:\s*['"]([^'"]+)['"]/);
  if (cmdMatch) return { command: cmdMatch[1] };
  return { input: jsonStr };
}
function extractBraceJson(raw) {
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) return "";
  let depth = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        jsonEnd = i;
        break;
      }
    }
  }
  return jsonEnd !== -1 ? raw.slice(jsonStart, jsonEnd + 1) : "";
}
function parseReactWithPatterns(text, dp, tightLoose = false, availableTools) {
  let thought;
  if (dp.thoughtRe) {
    const thoughtMatch = dp.thoughtRe.exec(text);
    if (thoughtMatch) thought = thoughtMatch[1].trim();
  }
  let match = dp.actionRe.exec(text);
  if (!match) match = dp.actionReSameline.exec(text);
  let looseMatch = false;
  if (!match) {
    const looseResult = dp.actionReLoose.exec(text);
    if (looseResult) {
      if (tightLoose) {
        const candidate = looseResult[1].trim().replace(/[`"']/g, "");
        const isToolIdentifier = /^\w+$/.test(candidate) && (candidate.includes("_") || candidate.includes("-"));
        const isKnownTool = /^(get_weather|calculate)$/i.test(candidate);
        if (isToolIdentifier || isKnownTool) {
          match = looseResult;
          looseMatch = true;
        }
      } else {
        match = looseResult;
        looseMatch = true;
      }
    }
  }
  let parenMatch = false;
  if (!match) match = dp.actionReParen.exec(text), parenMatch = true;
  if (match) {
    let toolName = match[1].trim().replace(/[`"']/g, "");
    if (looseMatch && !tightLoose && availableTools) {
      const tools = availableTools || [];
      for (const real of tools) {
        const rl = real.toLowerCase().replace(/_/g, "");
        if (toolName.toLowerCase().includes(rl)) {
          toolName = real;
          break;
        }
      }
      if (toolName.includes(" ")) {
        const words = toolName.split(/\s+/);
        for (const w of words) {
          const wc = w.replace(/[^a-zA-Z0-9_-]/g, "");
          if (wc.length < 3) continue;
          for (const real of tools) {
            const rl = real.toLowerCase().replace(/_/g, "");
            if (rl.includes(wc.toLowerCase())) {
              toolName = real;
              break;
            }
          }
          if (!toolName.includes(" ")) break;
        }
      }
    }
    const rawArgs = match[2].trim().replace(/^```\w*\s*/gm, "").replace(/```\s*$/gm, "").trim();
    let args;
    if (parenMatch && rawArgs && !rawArgs.startsWith("{")) {
      const pairs = rawArgs.match(/(\w+)\s*:\s*("[^"]*"|'[^']*'|\S+)/g);
      if (pairs) {
        const obj = {};
        for (const p of pairs) {
          const colonIdx = p.indexOf(":");
          const key = p.slice(0, colonIdx).trim();
          let val = p.slice(colonIdx + 1).trim();
          if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
            val = val.slice(1, -1);
          }
          obj[key] = val;
        }
        args = obj;
      } else {
        args = { input: rawArgs };
      }
    } else {
      args = extractJsonArgs(rawArgs) || { input: rawArgs };
    }
    let finalAnswer;
    if (dp.finalAnswerRe) {
      const faMatch = dp.finalAnswerRe.exec(text);
      if (faMatch) finalAnswer = faMatch[1].trim();
    }
    return { name: toolName, args, thought, finalAnswer, raw: match[0], dialect: dp.dialect.name };
  }
  return null;
}
function detectReactDialect(text) {
  for (const dp of ALL_DIALECT_PATTERNS) {
    const tagPattern = new RegExp(`^\\s*${dp.dialect.actionTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "im");
    if (tagPattern.test(text)) return dp.dialect;
  }
  return null;
}

// shared/model-test-utils.ts
import * as fs2 from "node:fs";
import * as os2 from "node:os";
import * as path2 from "node:path";
var CONFIG = {
  // General API settings - standardized across all providers
  DEFAULT_TIMEOUT_MS: 3e5,
  // 5 minutes - reasonable timeout for all providers
  CONNECT_TIMEOUT_S: 60,
  // 60 seconds to establish connection
  MAX_RETRIES: 2,
  // Two retries for transient failures (standardized)
  RETRY_DELAY_MS: 15e3,
  // 15 seconds between retries (standardized)
  // Model generation settings
  NUM_PREDICT: 1024,
  // Max tokens in response
  TEMPERATURE: 0.1,
  // Low temperature for more deterministic output
  // Test-specific settings - standardized across all providers
  MIN_THINKING_LENGTH: 10,
  // Minimum chars to consider thinking tokens valid
  TOOL_TEST_TIMEOUT_MS: 3e5,
  // 5 minutes - consistent timeout for tool usage tests
  TOOL_SUPPORT_TIMEOUT_MS: 3e5,
  // 5 minutes - consistent timeout for tool support detection
  // Metadata retrieval
  TAGS_TIMEOUT_MS: 15e3,
  // 15 seconds for /api/tags
  MODEL_INFO_TIMEOUT_MS: 3e4,
  // 30 seconds for model info lookup
  // Provider API settings
  PROVIDER_TIMEOUT_MS: 3e5,
  // 5 minutes - consistent with Ollama
  PROVIDER_TOOL_TIMEOUT_MS: 3e5,
  // 5 minutes - consistent with Ollama tool tests
  // Context length fetching
  CONTEXT_BATCH_SIZE: 3,
  // Concurrent requests when fetching model context lengths
  // Rate limiting
  TEST_DELAY_MS: 1e4,
  // 10 seconds between tests to avoid rate limiting
  // Cache management
  MAX_CACHE_SIZE: 1e3,
  // Maximum number of entries in tool support cache
  CACHE_TTL_DAYS: 30,
  // Cache entries expire after 30 days
  CACHE_CLEANUP_SIZE: 200
  // Remove oldest 200 entries during cleanup
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
var WEATHER_TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "get_weather",
    description: "Get the current weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] }
      },
      required: ["location"]
    }
  }
};
function scoreReasoning(msg) {
  const allNumbers = msg.match(/\b(\d+)\b/g) || [];
  const answer = allNumbers.length > 0 ? allNumbers[allNumbers.length - 1] : "?";
  const isCorrect = answer === "8";
  const reasoningPatterns = [
    "because",
    "therefore",
    "since",
    "step",
    "subtract",
    "minus",
    "each day",
    "each night",
    "slides",
    "climbs",
    "night",
    "reaches",
    "finally",
    "last day"
  ];
  const hasReasoningWords = reasoningPatterns.some((w) => msg.toLowerCase().includes(w));
  const hasNumberedSteps = /^\s*\d+\.\s/m.test(msg);
  const hasReasoning = hasReasoningWords || hasNumberedSteps;
  if (isCorrect && hasReasoning) return { score: "STRONG", pass: true };
  if (isCorrect) return { score: "MODERATE", pass: true };
  if (hasReasoning) return { score: "WEAK", pass: false };
  return { score: "FAIL", pass: false };
}
function scoreNativeToolCall(fnName, args) {
  const hasCorrectTool = fnName === "get_weather";
  const hasLocation = typeof args.location === "string" && args.location.toLowerCase().includes("paris");
  const unitValid = args.unit === void 0 || typeof args.unit === "string" && ["celsius", "fahrenheit"].includes(args.unit.toLowerCase());
  if (hasCorrectTool && hasLocation && unitValid) return { score: "STRONG", pass: true };
  if (hasCorrectTool && hasLocation) return { score: "MODERATE", pass: true };
  return { score: "WEAK", pass: false };
}
function scoreTextToolCall(fnName, args) {
  const isWeatherTool = fnName === "get_weather";
  const hasLocation = typeof args.location === "string" && args.location.toLowerCase().includes("paris");
  if (isWeatherTool && hasLocation) return { score: "STRONG", pass: true };
  if (isWeatherTool) return { score: "MODERATE", pass: true };
  return { score: "WEAK", pass: false };
}
function parseTextToolCall(content) {
  const firstBrace = content.indexOf("{");
  if (firstBrace === -1) return null;
  const lastBrace = content.lastIndexOf("}");
  if (lastBrace <= firstBrace) return null;
  const jsonCandidate = content.slice(firstBrace, lastBrace + 1);
  let textToolParsed = null;
  try {
    textToolParsed = JSON.parse(jsonCandidate);
  } catch {
    return null;
  }
  if (!textToolParsed || typeof textToolParsed.name !== "string") return null;
  const rawArgs = textToolParsed.arguments || { ...textToolParsed };
  const { name: _, ...fnArgs } = rawArgs;
  return { fnName: textToolParsed.name, args: fnArgs };
}
var TOOL_SUPPORT_CACHE_DIR = path2.join(os2.homedir(), ".pi", "agent", "cache");
var TOOL_SUPPORT_CACHE_PATH = path2.join(TOOL_SUPPORT_CACHE_DIR, "tool_support.json");
var _toolSupportCacheInMemory = null;
function readToolSupportCache() {
  try {
    if (fs2.existsSync(TOOL_SUPPORT_CACHE_PATH)) {
      const raw = fs2.readFileSync(TOOL_SUPPORT_CACHE_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
  }
  return {};
}
function writeToolSupportCache(cache) {
  if (!fs2.existsSync(TOOL_SUPPORT_CACHE_DIR)) {
    fs2.mkdirSync(TOOL_SUPPORT_CACHE_DIR, { recursive: true });
  }
  fs2.writeFileSync(TOOL_SUPPORT_CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}
function getCachedToolSupport(model) {
  const cache = _toolSupportCacheInMemory || readToolSupportCache();
  if (!_toolSupportCacheInMemory) _toolSupportCacheInMemory = cache;
  const entry = cache[model];
  if (!entry) return null;
  if (!entry.support || !["native", "react", "none"].includes(entry.support)) return null;
  return entry;
}
function cacheToolSupport(model, support, family) {
  const cache = _toolSupportCacheInMemory || readToolSupportCache();
  cache[model] = {
    support,
    testedAt: (/* @__PURE__ */ new Date()).toISOString(),
    family
  };
  _toolSupportCacheInMemory = cache;
  ensureCacheClean();
  writeToolSupportCache(cache);
}
function cleanupToolSupportCache() {
  const cache = readToolSupportCache();
  const now = Date.now();
  const ttlMs = CONFIG.CACHE_TTL_DAYS * 24 * 60 * 60 * 1e3;
  const cleanedCache = {};
  const entriesWithTimestamps = [];
  for (const [key, record] of Object.entries(cache)) {
    const timestamp = new Date(record.testedAt).getTime();
    if (now - timestamp < ttlMs) {
      cleanedCache[key] = record;
      entriesWithTimestamps.push({ key, record, timestamp });
    }
  }
  entriesWithTimestamps.sort((a, b) => a.timestamp - b.timestamp);
  if (entriesWithTimestamps.length > CONFIG.MAX_CACHE_SIZE) {
    const keepCount = CONFIG.MAX_CACHE_SIZE - CONFIG.CACHE_CLEANUP_SIZE;
    const entriesToKeep = entriesWithTimestamps.slice(-keepCount);
    const finalCache = {};
    entriesToKeep.forEach(({ key, record }) => {
      finalCache[key] = record;
    });
    writeToolSupportCache(finalCache);
    _toolSupportCacheInMemory = finalCache;
  } else {
    writeToolSupportCache(cleanedCache);
    _toolSupportCacheInMemory = cleanedCache;
  }
}
function ensureCacheClean() {
  const cache = readToolSupportCache();
  if (Object.keys(cache).length > CONFIG.MAX_CACHE_SIZE * 0.9) {
    debugLog("model-test", "Cache size exceeded threshold, performing cleanup");
    cleanupToolSupportCache();
  }
}
var TEST_HISTORY_DIR = path2.join(os2.homedir(), ".pi", "agent", "cache");
var TEST_HISTORY_PATH = path2.join(TEST_HISTORY_DIR, "model-test-history.json");
var MAX_HISTORY_PER_MODEL = 50;
var MAX_HISTORY_TOTAL = 500;
function readTestHistory() {
  try {
    if (fs2.existsSync(TEST_HISTORY_PATH)) {
      const raw = fs2.readFileSync(TEST_HISTORY_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
  }
  return {};
}
function writeTestHistory(history) {
  for (const model of Object.keys(history)) {
    if (history[model].length > MAX_HISTORY_PER_MODEL) {
      history[model] = history[model].slice(-MAX_HISTORY_PER_MODEL);
    }
  }
  let totalEntries = 0;
  const modelsByRecency = Object.entries(history).map(([model, entries]) => ({
    model,
    entries,
    lastEntry: entries[entries.length - 1]?.timestamp || ""
  })).sort((a, b) => b.lastEntry.localeCompare(a.lastEntry));
  const trimmedHistory = {};
  for (const { model, entries } of modelsByRecency) {
    if (totalEntries + entries.length > MAX_HISTORY_TOTAL) {
      const remaining = MAX_HISTORY_TOTAL - totalEntries;
      if (remaining <= 0) break;
      trimmedHistory[model] = entries.slice(-remaining);
      totalEntries += remaining;
    } else {
      trimmedHistory[model] = entries;
      totalEntries += entries.length;
    }
  }
  if (!fs2.existsSync(TEST_HISTORY_DIR)) {
    fs2.mkdirSync(TEST_HISTORY_DIR, { recursive: true });
  }
  fs2.writeFileSync(TEST_HISTORY_PATH, JSON.stringify(trimmedHistory, null, 2) + "\n", "utf-8");
}
function appendTestHistory(entry) {
  const history = readTestHistory();
  if (!history[entry.model]) {
    history[entry.model] = [];
  }
  history[entry.model].push(entry);
  writeTestHistory(history);
}
function detectRegression(model, current) {
  const history = readTestHistory();
  const entries = history[model] || [];
  if (entries.length < 2) return [];
  const previous = entries[entries.length - 2];
  const regressions = [];
  const scoreOrder = ["STRONG", "MODERATE", "WEAK", "FAIL", "ERROR", "NO", "YES"];
  const scoreRank = (s) => {
    const idx = scoreOrder.indexOf(s);
    return idx >= 0 ? idx : 99;
  };
  if (scoreRank(current.tests.reasoning.score) > scoreRank(previous.tests.reasoning.score)) {
    regressions.push({ test: "Reasoning", previous: previous.tests.reasoning.score, current: current.tests.reasoning.score });
  }
  if (scoreRank(current.tests.toolUsage.score) > scoreRank(previous.tests.toolUsage.score)) {
    regressions.push({ test: "Tool Usage", previous: previous.tests.toolUsage.score, current: current.tests.toolUsage.score });
  }
  if (scoreRank(current.tests.reactParsing.score) > scoreRank(previous.tests.reactParsing.score)) {
    regressions.push({ test: "ReAct Parsing", previous: previous.tests.reactParsing.score, current: current.tests.reactParsing.score });
  }
  if (scoreRank(current.tests.instructionFollowing.score) > scoreRank(previous.tests.instructionFollowing.score)) {
    regressions.push({ test: "Instructions", previous: previous.tests.instructionFollowing.score, current: current.tests.instructionFollowing.score });
  }
  const supportRank = (s) => s === "native" ? 0 : s === "react" ? 1 : 2;
  if (supportRank(current.tests.toolSupport.level) > supportRank(previous.tests.toolSupport.level)) {
    regressions.push({ test: "Tool Support", previous: previous.tests.toolSupport.level, current: current.tests.toolSupport.level });
  }
  return regressions;
}
var REASONING_PROMPT = `A snail climbs 3 feet up a wall each day, but slides back 2 feet each night. The wall is 10 feet tall. How many days does it take the snail to reach the top? Think step by step and give the final answer on its own line like: ANSWER: <number>`;
var TOOL_SYSTEM_PROMPT = "You are a helpful assistant. Use the available tools when needed.";
var TOOL_USER_PROMPT = "What's the weather like in Paris right now?";
async function testToolUsageUnified(chatFn, model, options) {
  const tools = options?.tools || [WEATHER_TOOL_DEFINITION];
  const systemPrompt = options?.systemPrompt || TOOL_SYSTEM_PROMPT;
  try {
    const result = await chatFn(model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: TOOL_USER_PROMPT }
    ], { tools });
    const content = result.content;
    const toolCalls = result.toolCalls;
    if (toolCalls && toolCalls.length > 0) {
      const call = toolCalls[0];
      const fn = call.function || {};
      let args = {};
      try {
        args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments || {};
      } catch {
        return {
          pass: true,
          score: "WEAK",
          hasToolCalls: true,
          toolCall: `malformed args: ${String(fn.arguments)}`,
          response: content,
          elapsedMs: result.elapsedMs
        };
      }
      const { score, pass } = scoreNativeToolCall(fn.name || "", args);
      return {
        pass,
        score,
        hasToolCalls: true,
        toolCall: `${fn.name}(${JSON.stringify(args)})`,
        response: content,
        elapsedMs: result.elapsedMs
      };
    }
    const textParsed = parseTextToolCall(content);
    if (textParsed) {
      const { score, pass } = scoreTextToolCall(textParsed.fnName, textParsed.args);
      return {
        pass,
        score,
        hasToolCalls: true,
        toolCall: `${textParsed.fnName}(${JSON.stringify(textParsed.args)})`,
        response: content,
        elapsedMs: result.elapsedMs
      };
    }
    return {
      pass: false,
      score: "FAIL",
      hasToolCalls: false,
      toolCall: "none",
      response: content,
      elapsedMs: result.elapsedMs
    };
  } catch (e) {
    return { pass: false, score: "ERROR", hasToolCalls: false, toolCall: `error: ${e.message}`, response: "", elapsedMs: 0 };
  }
}
async function testReasoningUnified(chatFn, model) {
  try {
    const result = await chatFn(model, [
      { role: "user", content: REASONING_PROMPT }
    ]);
    const msg = result.content.trim();
    if (msg.length === 0) {
      return { pass: false, score: "ERROR", reasoning: "Empty response", answer: "?", elapsedMs: result.elapsedMs };
    }
    const allNumbers = msg.match(/\b(\d+)\b/g) || [];
    const answer = allNumbers.length > 0 ? allNumbers[allNumbers.length - 1] : "?";
    const { score, pass } = scoreReasoning(msg);
    return { pass, score, reasoning: msg, answer, elapsedMs: result.elapsedMs };
  } catch (e) {
    return { pass: false, score: "ERROR", reasoning: e.message, answer: "?", elapsedMs: 0 };
  }
}
async function testInstructionFollowingUnified(chatFn, model) {
  const prompt = `You must respond with ONLY a valid JSON object. No markdown, no explanation, no backticks, no extra text.

The JSON object must have exactly these 4 keys:
- "name" (string): your model name
- "can_count" (boolean): true
- "sum" (number): the result of 15 + 27
- "language" (string): the language you are responding in`;
  try {
    const result = await chatFn(model, [
      { role: "user", content: prompt }
    ]);
    const msg = result.content.trim();
    let parsed = null;
    let repairNote = "";
    try {
      const cleaned = msg.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      const cleaned = msg.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
      let repaired = enhancedJsonRepair(cleaned);
      if (repaired !== cleaned) {
        try {
          parsed = JSON.parse(repaired);
          repairNote = " (repaired JSON)";
        } catch {
          repaired = basicJsonRepair(cleaned);
          try {
            parsed = JSON.parse(repaired);
            repairNote = " (basic repair)";
          } catch {
          }
        }
      }
    }
    if (!parsed) {
      return { pass: false, score: "FAIL", output: msg, elapsedMs: result.elapsedMs };
    }
    const hasKeys = parsed.name && parsed.can_count !== void 0 && parsed.sum !== void 0 && parsed.language;
    const correctSum = parsed.sum === 42;
    const hasCorrectCount = parsed.can_count === true;
    let score;
    if (hasKeys && correctSum && hasCorrectCount) {
      score = "STRONG";
    } else if (hasKeys && (correctSum || hasCorrectCount)) {
      score = "MODERATE";
    } else if (parsed.sum !== void 0 || parsed.name) {
      score = "WEAK";
    } else {
      score = "FAIL";
    }
    return {
      pass: hasKeys,
      score,
      output: JSON.stringify(parsed) + repairNote,
      elapsedMs: result.elapsedMs
    };
  } catch (e) {
    return { pass: false, score: "ERROR", output: e.message, elapsedMs: 0 };
  }
}
function enhancedJsonRepair(json) {
  let repaired = json;
  repaired = repaired.replace(/,\s*([}\]])/g, "$1");
  repaired = repaired.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, content) => {
    const fixedContent = content.replace(/(?<!\\)"/g, '\\"');
    return '"' + fixedContent + '"';
  });
  repaired = repaired.replace(/\\u([0-9a-fA-F]{3})/g, "\\u$1000");
  repaired = repaired.replace(/\\u([0-9a-fA-F]{2})/g, "\\u0100");
  return repaired;
}
function basicJsonRepair(json) {
  let braceDepth = 0, bracketDepth = 0;
  let inString = false, escapeNext = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (c === "\\") {
      if (inString) escapeNext = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") braceDepth++;
    else if (c === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (c === "[") bracketDepth++;
    else if (c === "]") bracketDepth = Math.max(0, bracketDepth - 1);
  }
  if (braceDepth > 0 || bracketDepth > 0) {
    return json + "}".repeat(braceDepth) + "]".repeat(bracketDepth);
  }
  return json;
}

// shared/test-report.ts
var branding = [
  `  \u26A1 Pi Model Benchmark v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`
].join("\n");
function formatTestSummary(tests, totalMs) {
  const lines = [];
  lines.push(section("SUMMARY"));
  for (const t of tests) {
    lines.push(t.pass ? ok(`${t.name}: ${t.score}`) : fail(`${t.name}: ${t.score}`));
  }
  lines.push(info(`Total time: ${msHuman(totalMs)}`));
  const passed = tests.filter((t) => t.pass).length;
  lines.push(info(`Score: ${passed}/${tests.length} tests passed`));
  return lines;
}
function formatRecommendation(model, passed, total, via) {
  const suffix = via ? ` via ${via}` : "";
  const lines = [];
  lines.push(section("RECOMMENDATION"));
  if (passed === total) {
    lines.push(ok(`${model} is a STRONG model${suffix} \u2014 full capability`));
  } else if (passed > 0 && passed >= total - 1) {
    lines.push(ok(`${model} is a GOOD model${suffix} \u2014 most capabilities work`));
  } else if (passed > 0 && passed >= total - 2) {
    lines.push(warn(`${model} is USABLE${suffix} \u2014 some capabilities are limited`));
  } else {
    lines.push(fail(`${model} is WEAK${suffix} \u2014 limited capabilities for agent use`));
  }
  return lines;
}

// extensions/model-test.ts
function model_test_default(pi) {
  const effectiveConfig = getEffectiveConfig();
  function ollamaBase() {
    return getOllamaBaseUrl();
  }
  async function rateLimitDelay(lines) {
    if (effectiveConfig.TEST_DELAY_MS > 0) {
      lines.push(info(`Waiting ${msHuman(effectiveConfig.TEST_DELAY_MS)} to avoid rate limiting...`));
      await new Promise((r) => setTimeout(r, effectiveConfig.TEST_DELAY_MS));
    }
  }
  function reportScore(lines, score, descriptions, fallback) {
    const desc = descriptions[score] || descriptions["*"] || `(${score})`;
    if (score === "STRONG" || score === "MODERATE") {
      lines.push(ok(desc));
    } else if (score === "WEAK") {
      lines.push(warn(desc));
    } else if (score === "FAIL") {
      lines.push(fail(desc));
    } else {
      lines.push(fail(fallback));
    }
  }
  function reportReasoningScore(lines, result) {
    reportScore(lines, result.score, {
      STRONG: `Answer: ${result.answer} \u2014 Correct with clear reasoning (${result.score})`,
      MODERATE: `Answer: ${result.answer} \u2014 Correct but weak reasoning (${result.score})`,
      WEAK: `Answer: ${result.answer} \u2014 Reasoned but wrong answer (${result.score})`,
      FAIL: `Answer: ${result.answer} \u2014 No reasoning detected (${result.score})`
    }, `Error: ${result.reasoning.includes("<!DOCTYPE") || result.reasoning.includes("<html") ? result.reasoning.split("\n")[0].slice(0, 100) + "..." : truncate(result.reasoning, 300)}`);
  }
  function reportInstructionScore(lines, result) {
    reportScore(lines, result.score, {
      STRONG: `JSON output valid with correct values (${result.score})`,
      MODERATE: `JSON output valid but some values incorrect (${result.score})`,
      WEAK: `Partial JSON compliance (${result.score})`
    }, `Failed to produce valid JSON (${result.score})`);
  }
  function reportToolScore(lines, result) {
    if (result.score === "STRONG" || result.score === "MODERATE") {
      lines.push(ok(`Tool call: ${result.toolCall} (${result.score})`));
    } else if (result.score === "WEAK") {
      lines.push(warn(`Tool call: ${result.toolCall} (${result.score}) \u2014 malformed call`));
    } else if (result.score === "FAIL") {
      const hasResponse = result.response && result.response.trim().length > 0;
      lines.push(fail(`Tool call: none \u2014 ${hasResponse ? "model responded in text instead" : "model returned empty response"} (${result.score})`));
    } else {
      lines.push(fail(`Error: ${result.toolCall}`));
    }
    if (result.score === "STRONG" || result.score === "MODERATE" || result.score === "WEAK") {
      if (result.response) {
        lines.push(info(`Raw response: ${sanitizeForReport(result.response)}`));
      }
    } else if (result.score === "FAIL") {
      const hasResponse = result.response && result.response.trim().length > 0;
      if (hasResponse) {
        lines.push(info(`Text response: ${sanitizeForReport(result.response)}`));
      } else {
        lines.push(info("Text response: (empty)"));
      }
    }
  }
  function makeOllamaChatFn(useStreaming = true) {
    return async (model, messages, _options) => {
      const chatFn = useStreaming ? ollamaChatStream : ollamaChat;
      const result = await chatFn(model, messages);
      return {
        content: result.response?.message?.content || "",
        elapsedMs: result.elapsedMs,
        raw: result.response
      };
    };
  }
  function makeOllamaToolChatFn() {
    return async (model, messages, options) => {
      const tools = options?.tools || void 0;
      const body = {
        model,
        messages,
        stream: false,
        options: { num_predict: CONFIG.NUM_PREDICT, temperature: CONFIG.TEMPERATURE }
      };
      if (tools && tools.length > 0) {
        body.tools = tools;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.TOOL_TEST_TIMEOUT_MS);
      const start = Date.now();
      try {
        const res = await fetch(`${ollamaBase()}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        const elapsedMs = Date.now() - start;
        clearTimeout(timeoutId);
        if (!res.ok) {
          const errorText = await res.text().catch(() => "unknown error");
          throw new Error(`Ollama API returned ${res.status}: ${truncate(errorText, 200)}`);
        }
        const text = await res.text();
        if (!text.trim()) throw new Error("Empty response from Ollama");
        const parsed = JSON.parse(text);
        const toolCalls = parsed?.message?.tool_calls;
        const content = parsed?.message?.content || "";
        return {
          content,
          toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : void 0,
          elapsedMs,
          raw: parsed
        };
      } catch (e) {
        clearTimeout(timeoutId);
        throw e;
      }
    };
  }
  function makeProviderChatFn(providerInfo) {
    return async (model, messages, options) => {
      const result = await providerChat(providerInfo, model, messages, {
        maxTokens: CONFIG.NUM_PREDICT,
        tools: options?.tools,
        timeoutMs: CONFIG.PROVIDER_TOOL_TIMEOUT_MS
      });
      return {
        content: result.content,
        toolCalls: result.toolCalls,
        elapsedMs: result.elapsedMs,
        raw: void 0
      };
    };
  }
  async function ollamaChat(model, messages, options = {}, timeoutMs = CONFIG.DEFAULT_TIMEOUT_MS, retries = CONFIG.MAX_RETRIES) {
    const body = { model, messages, stream: false, options: { num_predict: CONFIG.NUM_PREDICT, temperature: CONFIG.TEMPERATURE, ...options } };
    const url = `${ollamaBase()}/api/chat`;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        const elapsedMs = Date.now() - start;
        if (!res.ok) {
          const errorText = await res.text().catch(() => "unknown error");
          throw new Error(`Ollama API returned ${res.status}: ${truncate(errorText, 200)}`);
        }
        const text = await res.text();
        if (!text.trim()) {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, CONFIG.RETRY_DELAY_MS));
            continue;
          }
          throw new Error(`Empty response from Ollama after ${attempt + 1} attempt(s)`);
        }
        const parsed = JSON.parse(text);
        return { response: parsed, elapsedMs };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (e instanceof Error && e.name === "AbortError") {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, CONFIG.RETRY_DELAY_MS));
            continue;
          }
          throw new Error(`Ollama API timed out after ${msHuman(timeoutMs)}`);
        }
        if (attempt < retries && (msg.includes("Empty response") || msg.includes("ECONNREFUSED") || msg.includes("ECONNRESET") || msg.includes("fetch failed"))) {
          await new Promise((r) => setTimeout(r, CONFIG.RETRY_DELAY_MS));
          continue;
        }
        throw e;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw new Error("Unreachable");
  }
  async function ollamaChatStream(model, messages, options = {}, timeoutMs = CONFIG.DEFAULT_TIMEOUT_MS) {
    const body = { model, messages, stream: true, options: { num_predict: CONFIG.NUM_PREDICT, temperature: CONFIG.TEMPERATURE, ...options } };
    const url = `${ollamaBase()}/api/chat`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) {
        const errorText = await res.text().catch(() => "unknown error");
        throw new Error(`Ollama API returned ${res.status}: ${truncate(errorText, 200)}`);
      }
      if (!res.body) {
        throw new Error("Ollama streaming response has no body");
      }
      let messageContent = "";
      let thinkingContent = "";
      let done = false;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line) => line.trim().length > 0);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) messageContent += parsed.message.content;
            if (parsed.message?.thinking) thinkingContent += parsed.message.thinking;
            if (parsed.done) done = true;
          } catch (err) {
            debugLog("model-test", "skipped malformed JSON chunk in streaming response", err);
          }
        }
      }
      const elapsedMs = Date.now() - start;
      if (!messageContent.trim() && !thinkingContent.trim()) {
        throw new Error("Empty streaming response from Ollama");
      }
      const response = {
        message: {
          content: messageContent,
          thinking: thinkingContent,
          role: "assistant"
        },
        done: true
      };
      return { response, elapsedMs };
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Ollama API timed out after ${msHuman(timeoutMs)}`);
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  async function providerChat(providerInfo, model, messages, options = {}) {
    const { baseUrl, apiKey } = providerInfo;
    const maxTokens = options.maxTokens ?? CONFIG.NUM_PREDICT;
    const temperature = options.temperature ?? CONFIG.TEMPERATURE;
    const timeoutMs = options.timeoutMs ?? CONFIG.PROVIDER_TIMEOUT_MS;
    if (!baseUrl) throw new Error(`No base URL for provider "${providerInfo.name}"`);
    if (!apiKey) throw new Error(`No API key for provider "${providerInfo.name}". Set ${providerInfo.envKey || "the appropriate env var"}.`);
    const url = `${baseUrl}/chat/completions`;
    const body = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false
    };
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const elapsedMs = Date.now() - start;
      if (!res.ok) {
        const errorText = await res.text().catch(() => "unknown error");
        throw new Error(`API returned ${res.status}: ${truncate(errorText, 200)}`);
      }
      const data = await res.json();
      const choice = data.choices?.[0];
      const message = choice?.message || {};
      const content = message.content || "";
      const toolCalls = message.tool_calls || void 0;
      return {
        content,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : void 0,
        elapsedMs,
        usage: data.usage
      };
    } catch (e) {
      const elapsedMs = Date.now() - start;
      if (e.name === "AbortError") {
        throw new Error(`Provider API timed out after ${msHuman(elapsedMs)}`);
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  async function testConnectivity(providerInfo, model) {
    try {
      const start = Date.now();
      const result = await providerChat(providerInfo, model, [
        { role: "user", content: "Reply with exactly: PONG" }
      ], { maxTokens: 10, timeoutMs: 3e4 });
      const elapsedMs = Date.now() - start;
      const reachable = true;
      const authValid = true;
      return {
        pass: reachable && authValid,
        reachable,
        authValid,
        modelName: model,
        elapsedMs
      };
    } catch (e) {
      let reachable = false;
      let authValid = false;
      const msg = e.message || "";
      if (msg.includes("timed out") || msg.includes("ECONNREFUSED") || msg.includes("ENOTFOUND") || msg.includes("fetch failed")) {
        reachable = false;
        authValid = false;
      } else if (msg.includes("401") || msg.includes("403") || msg.includes("authentication") || msg.includes("unauthorized") || msg.includes("invalid API key")) {
        reachable = true;
        authValid = false;
      } else if (msg.includes("404") || msg.includes("model")) {
        reachable = true;
        authValid = true;
      } else {
        reachable = true;
        authValid = false;
      }
      return {
        pass: false,
        reachable,
        authValid,
        modelName: model,
        elapsedMs: 0,
        error: msg
      };
    }
  }
  async function testReasoning(model) {
    const prompt = `A snail climbs 3 feet up a wall each day, but slides back 2 feet each night. The wall is 10 feet tall. How many days does it take the snail to reach the top? Think step by step and give the final answer on its own line like: ANSWER: <number>`;
    try {
      let response, elapsedMs;
      try {
        const result = await ollamaChat(model, [
          { role: "user", content: prompt }
        ]);
        response = result.response;
        elapsedMs = result.elapsedMs;
        const msg2 = response?.message?.content || "";
        const thinking2 = response?.message?.thinking || "";
        if (msg2.trim().length === 0 && thinking2.trim().length === 0) {
          throw new Error("empty \u2014 will retry with thinking");
        }
      } catch (firstErr) {
        if (firstErr.message?.includes("empty \u2014 will retry with thinking")) {
          const retry = await ollamaChat(model, [
            { role: "user", content: prompt }
          ], { think: true });
          response = retry.response;
          elapsedMs = retry.elapsedMs;
        } else {
          throw firstErr;
        }
      }
      let msg = response?.message?.content || "";
      const thinking = response?.message?.thinking || "";
      const effectiveMsg = msg.trim().length > 0 ? msg : thinking;
      if (effectiveMsg.trim().length === 0) {
        return { pass: false, score: "ERROR", reasoning: "Empty response from Ollama (no content or thinking tokens)", answer: "?", elapsedMs };
      }
      const allNumbers = effectiveMsg.match(/\b(\d+)\b/g) || [];
      const answer = allNumbers.length > 0 ? allNumbers[allNumbers.length - 1] : "?";
      const { score, pass } = scoreReasoning(effectiveMsg);
      const displayMsg = msg.trim().length > 0 ? effectiveMsg : `[thinking tokens] ${effectiveMsg}`;
      return { pass, score, reasoning: displayMsg, answer, elapsedMs };
    } catch (e) {
      return { pass: false, score: "ERROR", reasoning: e.message, answer: "?", elapsedMs: 0 };
    }
  }
  async function testReasoningProvider(providerInfo, model) {
    return testReasoningUnified(makeProviderChatFn(providerInfo), model);
  }
  async function testThinking(model) {
    const prompt = "Multiply 37 by 43. Explain your reasoning step by step and give the final answer.";
    try {
      const { response, elapsedMs } = await ollamaChat(model, [
        { role: "user", content: prompt }
      ], { think: true });
      const msg = response?.message?.content || "";
      const thinking = response?.message?.thinking || "";
      const hasThinking = !!thinking && thinking.length > CONFIG.MIN_THINKING_LENGTH;
      const thinkTagMatch = msg.match(/<think[^>]*>([\s\S]*?)<\/think>/i);
      const hasThinkTags = !!thinkTagMatch;
      return {
        supported: hasThinking || hasThinkTags,
        thinkingContent: hasThinking ? thinking : hasThinkTags ? thinkTagMatch[1] : "none",
        answerContent: hasThinkTags ? msg.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, "").trim() : msg,
        elapsedMs
      };
    } catch (e) {
      return { supported: false, thinkingContent: `error: ${e.message}`, answerContent: "", elapsedMs: 0 };
    }
  }
  async function testToolUsage(model) {
    return testToolUsageUnified(makeOllamaToolChatFn(), model);
  }
  async function testToolUsageProvider(providerInfo, model) {
    return testToolUsageUnified(makeProviderChatFn(providerInfo), model);
  }
  async function testReactParsing(model) {
    const systemPrompt = [
      "You are a helpful assistant with access to tools.",
      "When you need to use a tool, you MUST output in this EXACT format:",
      "Thought: <your reasoning about what to do>",
      "Action: <tool_name>",
      "Action Input: <JSON object with arguments>",
      "Do NOT output anything after the Action Input line.",
      "The available tools are: get_weather (parameters: location: string), calculate (parameters: expression: string)."
    ].join("\n");
    const body = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "What's the weather like in Tokyo? Use the get_weather tool." }
      ],
      stream: false,
      options: { num_predict: CONFIG.NUM_PREDICT, temperature: CONFIG.TEMPERATURE }
    };
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.TOOL_TEST_TIMEOUT_MS);
      const start = Date.now();
      const res = await fetch(`${ollamaBase()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const elapsedMs = Date.now() - start;
      clearTimeout(timeoutId);
      if (!res.ok) {
        const errorText = await res.text().catch(() => "unknown error");
        return { pass: false, score: "ERROR", toolCall: `fetch error: ${res.status}`, thought: "", response: "", elapsedMs };
      }
      const text = await res.text();
      if (!text.trim()) throw new Error("Empty response from Ollama");
      const parsed = JSON.parse(text);
      const content = (parsed?.message?.content || "").trim();
      if (!content) {
        return { pass: false, score: "FAIL", toolCall: "empty response", thought: "", response: "", elapsedMs };
      }
      let parsedResult = null;
      for (const dp of ALL_DIALECT_PATTERNS) {
        const result = parseReactWithPatterns(content, dp, true);
        if (result) {
          let argsStr;
          const rawArgs = result.args ? JSON.stringify(result.args) : "";
          if (rawArgs && rawArgs !== "{}") {
            argsStr = rawArgs;
          } else if (result.raw) {
            argsStr = extractBraceJson(result.raw);
          } else {
            argsStr = "";
          }
          parsedResult = { name: result.name, args: argsStr, thought: result.thought || "", dialect: result.dialect };
          break;
        }
      }
      if (parsedResult) {
        let { name: toolName, args: argsStr, thought, dialect } = parsedResult;
        const argsParsed = argsStr.length > 0;
        let score;
        const isWeatherTool = toolName.toLowerCase().includes("get_weather") || toolName.toLowerCase() === "get_weather";
        if (isWeatherTool && argsParsed) {
          score = "STRONG";
        } else if (isWeatherTool) {
          score = "MODERATE";
        } else {
          score = "WEAK";
        }
        const pass = score !== "WEAK";
        return {
          pass,
          score,
          toolCall: `${toolName}(${argsStr})`,
          thought,
          response: content,
          elapsedMs,
          dialect: dialect || "react"
        };
      }
      const altTagPatterns = [
        /^\s*Function:\s*/im,
        /^\s*Tool:\s*/im,
        /^\s*Call:\s*/im,
        /<function_call/i,
        /<invoke\s/i
      ];
      const hasAltTag = altTagPatterns.some((p) => p.test(content));
      const hasToolMention = /\bget_weather\b/i.test(content) || /\btool\b/i.test(content);
      if (hasAltTag || hasToolMention) {
        const detail = hasAltTag ? "model used alternative tool-call tags but format was not parseable" : "model mentioned tool but not in ReAct format";
        return {
          pass: false,
          score: "FAIL",
          toolCall: `none \u2014 ${detail}`,
          thought: "",
          response: content,
          elapsedMs
        };
      }
      return {
        pass: false,
        score: "FAIL",
        toolCall: "none",
        thought: "",
        response: content,
        elapsedMs
      };
    } catch (e) {
      return { pass: false, score: "ERROR", toolCall: `error: ${e.message}`, thought: "", response: "", elapsedMs: 0 };
    }
  }
  async function testInstructionFollowing(model) {
    return testInstructionFollowingUnified(makeOllamaChatFn(), model);
  }
  async function testInstructionFollowingProvider(providerInfo, model) {
    return testInstructionFollowingUnified(makeProviderChatFn(providerInfo), model);
  }
  async function testToolSupport(model, family) {
    const cached = getCachedToolSupport(model);
    if (cached) {
      return {
        level: cached.support,
        cached: true,
        evidence: `cached (tested ${cached.testedAt})`,
        elapsedMs: 0
      };
    }
    const tools = [WEATHER_TOOL_DEFINITION];
    const body = {
      model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant with access to tools. When you need to look up information, use the available tools. Always use tools when asked about real-time data like weather."
        },
        { role: "user", content: "What's the weather like in Tokyo right now? Use the get_weather tool to find out." }
      ],
      tools,
      stream: false,
      options: { num_predict: 1024, temperature: 0.1 }
    };
    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveConfig.TOOL_SUPPORT_TIMEOUT_MS);
      const res = await fetch(`${ollamaBase()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const elapsedMs = Date.now() - start;
      clearTimeout(timeoutId);
      if (!res.ok) {
        const detail = await res.text().catch(() => "unknown error");
        const level2 = "none";
        cacheToolSupport(model, level2, family);
        return { level: level2, cached: false, evidence: `API error ${res.status}: ${truncate(detail, 100)}`, elapsedMs };
      }
      const text = await res.text();
      if (!text.trim()) {
        const level2 = "none";
        cacheToolSupport(model, level2, family);
        return { level: level2, cached: false, evidence: "empty response from Ollama", elapsedMs };
      }
      const parsed = JSON.parse(text);
      const toolCalls = parsed?.message?.tool_calls;
      const content = (parsed?.message?.content || "").trim();
      if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
        const fn = toolCalls[0].function || {};
        const fnName = fn.name || "unknown";
        let argsStr;
        try {
          const args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : fn.arguments || {};
          argsStr = JSON.stringify(args);
        } catch (err) {
          debugLog("model-test", "failed to parse tool call arguments", err);
          argsStr = String(fn.arguments);
        }
        const level2 = "native";
        cacheToolSupport(model, level2, family);
        return {
          level: level2,
          cached: false,
          evidence: `API returned tool_calls: ${fnName}(${argsStr})`,
          elapsedMs
        };
      }
      const detectedDialect = detectReactDialect(content);
      if (detectedDialect) {
        const level2 = "react";
        cacheToolSupport(model, level2, family);
        return {
          level: level2,
          cached: false,
          evidence: `ReAct format detected (${detectedDialect.name} dialect) in text response`,
          elapsedMs
        };
      }
      const strippedContent = content.replace(/^\s*```\w*\s*/gm, "").replace(/```\s*$/gm, "").trim();
      const textToolPatterns = [
        /\bget_weather\b/i,
        // Model mentions the tool name
        /\bfunction_call\b/i,
        // Explicit function call marker
        /\btool_call\b/i,
        // Explicit tool call marker
        /"name"\s*:\s*"get_weather"/
        // JSON with tool name
      ];
      const hasTextToolSignal = textToolPatterns.some((p) => p.test(strippedContent));
      const hasJsonToolCall = /"name"\s*:\s*"get_weather"/i.test(strippedContent) && /"arguments"\s*:\s*\{/i.test(strippedContent);
      if (hasJsonToolCall) {
        const level2 = "react";
        cacheToolSupport(model, level2, family);
        return {
          level: level2,
          cached: false,
          evidence: `JSON tool call in text (no native API tool_calls \u2014 will use react-fallback)`,
          elapsedMs
        };
      }
      const level = "none";
      cacheToolSupport(model, level, family);
      const cleanContent = truncate(strippedContent, 150);
      const evidenceDetail = hasTextToolSignal ? `no structured tool calling (text mentions tool: ${cleanContent})` : `no tool calling patterns (text: ${cleanContent})`;
      return { level, cached: false, evidence: evidenceDetail, elapsedMs };
    } catch (e) {
      const level = "none";
      cacheToolSupport(model, level, family);
      return { level, cached: false, evidence: `error: ${e.message}`, elapsedMs: 0 };
    }
  }
  async function getOllamaModels() {
    try {
      const res = await fetch(`${ollamaBase()}/api/tags`, { signal: AbortSignal.timeout(15e3) });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map((m) => m.name).filter(Boolean);
    } catch (err) {
      debugLog("model-test", "failed to list Ollama models", err);
      return [];
    }
  }
  function getCurrentModel(ctx) {
    return ctx.model?.id;
  }
  function updateModelsJsonReasoning(model, hasReasoning) {
    try {
      const written = readModifyWriteModelsJson((config2) => {
        for (const provider of Object.values(config2.providers || {})) {
          const models = provider.models || [];
          for (const m of models) {
            if (m.id === model) {
              const current = m.reasoning;
              if (current === hasReasoning) {
                return null;
              }
              m.reasoning = hasReasoning;
              return config2;
            }
          }
        }
        return null;
      });
      if (!written) {
        return { updated: false, message: `${model} not found in models.json \u2014 skipped` };
      }
      const config = readModelsJson();
      for (const provider of Object.values(config.providers || {})) {
        const models = provider.models || [];
        for (const m of models) {
          if (m.id === model && m.reasoning === hasReasoning) {
            return { updated: false, message: `reasoning already "${hasReasoning}" for ${model} \u2014 no change` };
          }
        }
      }
      const action = hasReasoning ? "set reasoning: true" : "set reasoning: false";
      return { updated: true, message: `Updated ${model}: ${action}` };
    } catch (e) {
      return { updated: false, message: `Failed to update models.json: ${e.message}` };
    }
  }
  async function testModelOllama(model, providerInfo, ctx) {
    const lines = [];
    const totalStart = Date.now();
    lines.push(branding);
    lines.push(section(`MODEL: ${model}`));
    lines.push(info("Provider: Ollama (local/remote)"));
    const modelsJson = readModelsJson();
    let apiMode = "ollama";
    const providerName = ctx?.model?.provider || providerInfo?.name || "";
    if (providerName && modelsJson) {
      const providerCfg = (modelsJson.providers || {})[providerName];
      if (providerCfg) {
        apiMode = providerCfg.api || "ollama";
      }
    }
    lines.push(info(`API: ${apiMode}`));
    const nativeContext = await fetchModelContextLength(ollamaBase(), model);
    if (nativeContext !== void 0) {
      const ctxStr = nativeContext >= 1e3 ? `${(nativeContext / 1e3).toFixed(1)}k` : String(nativeContext);
      lines.push(info(`Context: ${ctxStr} tokens (native max)`));
    }
    let modelSize = "unknown";
    let modelFamily = "unknown";
    let modelParams = "unknown";
    let modelQuant = "unknown";
    let modelModified = "unknown";
    try {
      const tagsRes = await fetch(`${ollamaBase()}/api/tags`, { signal: AbortSignal.timeout(1e4) });
      if (tagsRes.ok) {
        const tags = await tagsRes.json();
        const entry = (tags.models || []).find((m) => m.name === model);
        if (entry) {
          const details = entry.details || {};
          const sizeBytes = entry.size || 0;
          const sizeGB = sizeBytes / (1024 * 1024 * 1024);
          const sizeMB = sizeBytes / (1024 * 1024);
          modelSize = sizeGB >= 1 ? `${sizeGB.toFixed(1)} GB` : `${sizeMB.toFixed(0)} MB`;
          modelFamily = details.family || details.families?.[0] || "unknown";
          modelParams = details.parameter_size || "unknown";
          modelQuant = details.quantization_level || "unknown";
          const modDate = entry.modified_at ? new Date(entry.modified_at) : null;
          modelModified = modDate ? modDate.toLocaleDateString() : "unknown";
        }
      }
    } catch (err) {
      debugLog("model-test", "failed to fetch model metadata from /api/show", err);
    }
    const detectedFamily = detectModelFamily(model);
    lines.push(info(`Size: ${modelSize}  |  Params: ${modelParams}  |  Quant: ${modelQuant}`));
    lines.push(info(`Family: ${modelFamily}  |  Detected: ${detectedFamily}  |  Modified: ${modelModified}`));
    lines.push(section("REASONING TEST"));
    lines.push(info("Prompt: A snail climbs 3ft up a wall each day, slides 2ft back each night. Wall is 10ft. How many days?"));
    lines.push(info("Testing..."));
    const reasoning = await testReasoning(model);
    lines.push(info(`Time: ${msHuman(reasoning.elapsedMs)}`));
    reportReasoningScore(lines, reasoning);
    lines.push(info(`Response: ${sanitizeForReport(reasoning.reasoning)}`));
    lines.push(section("THINKING TEST"));
    lines.push(info('Prompt: "Multiply 37 by 43. Explain your reasoning step by step."'));
    await rateLimitDelay(lines);
    const thinking = await testThinking(model);
    lines.push(info(`Time: ${msHuman(thinking.elapsedMs)}`));
    if (thinking.supported) {
      lines.push(ok(`Thinking/reasoning tokens: SUPPORTED`));
      lines.push(info(`Thinking content: ${sanitizeForReport(thinking.thinkingContent)}`));
    } else {
      lines.push(fail(`Thinking/reasoning tokens: NOT SUPPORTED`));
    }
    lines.push(info(`Answer output: ${sanitizeForReport(thinking.answerContent)}`));
    lines.push(section("MODELS.JSON SYNC"));
    const reasoningUpdate = updateModelsJsonReasoning(model, thinking.supported);
    lines.push(info(reasoningUpdate.message));
    lines.push(section("TOOL USAGE TEST"));
    lines.push(info(`Prompt: "What's the weather in Paris?" (with get_weather tool available)`));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);
    const tools = await testToolUsage(model);
    lines.push(info(`Time: ${msHuman(tools.elapsedMs)}`));
    reportToolScore(lines, tools);
    lines.push(section("REACT PARSING TEST"));
    lines.push(info(`Prompt: "What's the weather in Tokyo?" (ReAct format, no native tools)`));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);
    const react = await testReactParsing(model);
    lines.push(info(`Time: ${msHuman(react.elapsedMs)}`));
    const dialectTag = react.dialect && react.dialect !== "react" ? ` [${react.dialect} dialect]` : "";
    if (react.score === "STRONG") {
      lines.push(ok(`ReAct parsed: ${react.toolCall} (${react.score})${dialectTag}`));
      if (react.thought) {
        lines.push(info(`Thought: ${sanitizeForReport(react.thought)}`));
      }
    } else if (react.score === "MODERATE") {
      lines.push(ok(`ReAct parsed: ${react.toolCall} (${react.score})${dialectTag}`));
      if (react.thought) {
        lines.push(info(`Thought: ${sanitizeForReport(react.thought)}`));
      }
    } else if (react.score === "WEAK") {
      lines.push(warn(`ReAct parsed: ${react.toolCall} (${react.score}) \u2014 wrong tool or malformed args${dialectTag}`));
      if (react.thought) {
        lines.push(info(`Thought: ${sanitizeForReport(react.thought)}`));
      }
    } else if (react.score === "FAIL") {
      lines.push(fail(`ReAct parsing: ${react.toolCall} (${react.score})${dialectTag}`));
      if (react.response) {
        lines.push(info(`Response: ${sanitizeForReport(react.response)}`));
      }
    } else {
      lines.push(fail(`Error: ${react.toolCall}`));
    }
    lines.push(section("INSTRUCTION FOLLOWING TEST"));
    lines.push(info("Prompt: Respond with ONLY a JSON object with keys: name, can_count, sum (15+27), language"));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);
    const instructions = await testInstructionFollowing(model);
    lines.push(info(`Time: ${msHuman(instructions.elapsedMs)}`));
    reportInstructionScore(lines, instructions);
    lines.push(info(`Output: ${sanitizeForReport(instructions.output)}`));
    lines.push(section("TOOL SUPPORT DETECTION"));
    lines.push(info("Probing model for tool calling capability (native / ReAct / none)"));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);
    const toolSupport = await testToolSupport(model, detectedFamily);
    lines.push(info(`Time: ${msHuman(toolSupport.elapsedMs)}`));
    const supportLabel = (level) => {
      switch (level) {
        case "native":
          return "NATIVE (structured API tool_calls)";
        case "react":
          return "REACT (Action:/Action Input: text format)";
        case "none":
          return "NONE (no tool support detected)";
        default:
          return "UNKNOWN";
      }
    };
    if (toolSupport.cached) {
      lines.push(info(`Result: ${supportLabel(toolSupport.level)} \u2014 from cache`));
    } else {
      if (toolSupport.level === "native") {
        lines.push(ok(`Tool support: ${supportLabel(toolSupport.level)}`));
      } else if (toolSupport.level === "react") {
        lines.push(ok(`Tool support: ${supportLabel(toolSupport.level)}`));
      } else {
        lines.push(warn(`Tool support: ${supportLabel(toolSupport.level)}`));
      }
    }
    lines.push(info(`Evidence: ${toolSupport.evidence}`));
    lines.push(info(`Cache: ${TOOL_SUPPORT_CACHE_PATH}`));
    const totalMs = Date.now() - totalStart;
    const toolPass = tools.score === "STRONG" || tools.score === "MODERATE";
    const reactPass = react.score === "STRONG" || react.score === "MODERATE";
    const ollamaTests = [
      { name: "Reasoning", pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", score: reasoning.score },
      { name: "Thinking", pass: thinking.supported, score: thinking.supported ? "YES" : "NO" },
      { name: "Tool Usage", pass: toolPass, score: tools.score },
      { name: "ReAct Parse", pass: reactPass, score: react.score },
      { name: "Instructions", pass: instructions.pass, score: instructions.score },
      { name: "Tool Support", pass: toolSupport.level === "native" || toolSupport.level === "react", score: toolSupport.level.toUpperCase() }
    ];
    const passed = ollamaTests.filter((t) => t.pass).length;
    const total = ollamaTests.length;
    lines.push(...formatTestSummary(ollamaTests, totalMs));
    lines.push(...formatRecommendation(model, passed, total));
    try {
      const historyEntry = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        model,
        providerKind: "ollama",
        providerName: providerName || "ollama",
        tests: {
          reasoning: { score: reasoning.score, pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", answer: reasoning.answer },
          thinking: { supported: thinking.supported },
          toolUsage: { score: tools.score, pass: tools.score === "STRONG" || tools.score === "MODERATE", toolCall: tools.toolCall },
          reactParsing: { score: react.score, pass: react.score === "STRONG" || react.score === "MODERATE", toolCall: react.toolCall, dialect: react.dialect },
          instructionFollowing: { score: instructions.score, pass: instructions.pass },
          toolSupport: { level: toolSupport.level, evidence: toolSupport.evidence }
        },
        passedCount: passed,
        totalCount: total,
        totalMs
      };
      appendTestHistory(historyEntry);
      const regressions = detectRegression(model, historyEntry);
      if (regressions.length > 0) {
        lines.push(section("REGRESSION DETECTED"));
        for (const reg of regressions) {
          lines.push(warn(`${reg.test}: ${reg.previous} \u2192 ${reg.current}`));
        }
      }
    } catch (err) {
      debugLog("model-test", "failed to save test history", err);
    }
    return lines.join("\n");
  }
  async function testModelProvider(providerInfo, model, ctx) {
    const lines = [];
    const totalStart = Date.now();
    lines.push(branding);
    lines.push(section(`MODEL: ${model}`));
    lines.push(info(`Provider: ${providerInfo.name} (built-in)`));
    lines.push(info(`API: ${providerInfo.apiMode || "openai-completions"}`));
    lines.push(info(`Base URL: ${providerInfo.baseUrl || "unknown"}`));
    if (providerInfo.apiKey) {
      lines.push(info(`API Key: ****${providerInfo.apiKey.slice(-4)}`));
    } else {
      lines.push(warn(`API Key: NOT SET (${providerInfo.envKey || "env var not found"})`));
    }
    const contextWindow = ctx?.model?.contextWindow ?? null;
    if (contextWindow !== null) {
      const ctxStr = contextWindow >= 1e3 ? `${(contextWindow / 1e3).toFixed(1)}k` : String(contextWindow);
      lines.push(info(`Context: ${ctxStr} tokens`));
    }
    lines.push(section("CONNECTIVITY TEST"));
    lines.push(info("Sending minimal request to verify API reachability and key validity..."));
    const connectivity = await testConnectivity(providerInfo, model);
    lines.push(info(`Time: ${msHuman(connectivity.elapsedMs)}`));
    if (connectivity.pass) {
      lines.push(ok(`API reachable and authenticated`));
    } else {
      if (!connectivity.reachable) {
        lines.push(fail(`API not reachable: ${connectivity.error || "unknown error"}`));
      } else if (!connectivity.authValid) {
        lines.push(fail(`Authentication failed: ${connectivity.error || "invalid or missing API key"}`));
      } else {
        lines.push(fail(`Connectivity error: ${connectivity.error || "unknown"}`));
      }
      lines.push(warn("Skipping remaining tests \u2014 fix connectivity first"));
      lines.push(info("Tip: Check your API key is set correctly and the provider endpoint is accessible"));
      return lines.join("\n");
    }
    lines.push(section("REASONING TEST"));
    lines.push(info("Prompt: A snail climbs 3ft up a wall each day, slides 2ft back each night. Wall is 10ft. How many days?"));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);
    const reasoning = await testReasoningProvider(providerInfo, model);
    lines.push(info(`Time: ${msHuman(reasoning.elapsedMs)}`));
    reportReasoningScore(lines, reasoning);
    lines.push(info(`Response: ${sanitizeForReport(reasoning.reasoning)}`));
    lines.push(section("INSTRUCTION FOLLOWING TEST"));
    lines.push(info("Prompt: Respond with ONLY a JSON object with keys: name, can_count, sum (15+27), language"));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);
    const instructions = await testInstructionFollowingProvider(providerInfo, model);
    lines.push(info(`Time: ${msHuman(instructions.elapsedMs)}`));
    reportInstructionScore(lines, instructions);
    lines.push(info(`Output: ${sanitizeForReport(instructions.output)}`));
    lines.push(section("TOOL USAGE TEST"));
    lines.push(info(`Prompt: "What's the weather in Paris?" (with get_weather tool available)`));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);
    const toolTest = await testToolUsageProvider(providerInfo, model);
    lines.push(info(`Time: ${msHuman(toolTest.elapsedMs)}`));
    reportToolScore(lines, toolTest);
    lines.push(section("SKIPPED TESTS (OLLAMA-ONLY)"));
    lines.push(warn("Thinking test \u2014 Ollama-specific think:true option and message.thinking field"));
    lines.push(warn("ReAct parsing test \u2014 only relevant for Ollama models without native tool calling"));
    lines.push(warn("Tool support detection \u2014 Ollama-specific tool support cache"));
    lines.push(warn("Model metadata \u2014 Ollama-specific /api/tags endpoint"));
    const totalMs = Date.now() - totalStart;
    const providerTests = [
      { name: "Connectivity", pass: connectivity.pass, score: connectivity.pass ? "OK" : "FAIL" },
      { name: "Reasoning", pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", score: reasoning.score },
      { name: "Instructions", pass: instructions.pass, score: instructions.score },
      { name: "Tool Usage", pass: toolTest.pass, score: toolTest.score }
    ];
    const passed = providerTests.filter((t) => t.pass).length;
    const total = providerTests.length;
    lines.push(...formatTestSummary(providerTests, totalMs));
    lines.push(...formatRecommendation(model, passed, total, providerInfo.name));
    try {
      const historyEntry = {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        model,
        providerKind: "builtin",
        providerName: providerInfo.name,
        tests: {
          reasoning: { score: reasoning.score, pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", answer: reasoning.answer },
          thinking: { supported: false },
          toolUsage: { score: toolTest.score, pass: toolTest.pass, toolCall: toolTest.toolCall },
          reactParsing: { score: "SKIP", pass: false, toolCall: "n/a" },
          instructionFollowing: { score: instructions.score, pass: instructions.pass },
          toolSupport: { level: "native", evidence: "provider-native (not probed)" }
        },
        passedCount: passed,
        totalCount: total,
        totalMs
      };
      appendTestHistory(historyEntry);
      const regressions = detectRegression(model, historyEntry);
      if (regressions.length > 0) {
        lines.push(section("REGRESSION DETECTED"));
        for (const reg of regressions) {
          lines.push(warn(`${reg.test}: ${reg.previous} \u2192 ${reg.current}`));
        }
      }
    } catch (err) {
      debugLog("model-test", "failed to save provider test history", err);
    }
    return lines.join("\n");
  }
  async function testModel(model, ctx) {
    const providerInfo = ctx ? detectProvider(ctx) : { kind: "ollama", name: "ollama" };
    if (providerInfo.kind === "ollama") {
      return testModelOllama(model, providerInfo, ctx);
    } else if (providerInfo.kind === "builtin") {
      return testModelProvider(providerInfo, model, ctx);
    } else {
      return testModelOllama(model);
    }
  }
  pi.registerCommand("model-test", {
    description: "Test a model for reasoning, thinking, tool usage, ReAct parsing, instruction following, and tool support level. Supports both Ollama and cloud providers.",
    detailedHelp: "\n\n\u{1F50D} Model Testing Extension\n\nThis extension tests AI models across multiple dimensions:\n\u2022 Reasoning & Thinking: Logic puzzles, math problems, creative thinking\n\u2022 Tool Usage: Ability to use available tools effectively\n\u2022 Instruction Following: How well the model follows complex instructions\n\u2022 Tool Support: Native vs ReAct fallback tool calling capability\n\n\u{1F4CB} Usage Examples:\n  /model-test                    # Test current model\n  /model-test qwen3:0.6b        # Test specific model\n  /model-test --all             # Test all Ollama models\n  /model-test --help            # Show this help\n  /model-test --list           # List available models\n  /model-test --history         # Show test history\n  /model-test --clear-cache     # Clear tool support cache\n\n\u{1F527} Supported Providers:\n\u2022 Ollama (local/remote)\n\u2022 OpenRouter\n\u2022 Anthropic Claude\n\u2022 Google Gemini\n\u2022 OpenAI GPT\n\u2022 Groq\n\u2022 DeepSeek\n\u2022 Mistral\n\u2022 xAI\n\u2022 Together\n\u2022 Fireworks\n\u2022 Cohere\n\n\u{1F4A1} Tips:\n\u2022 Use --all to benchmark all your Ollama models\n\u2022 Check --history to see past test results\n\u2022 Clear cache if you encounter unexpected tool support issues\n\u2022 Results show detailed scoring and recommendations\n",
    getArgumentCompletions: async (prefix) => {
      try {
        const models = await getOllamaModels();
        return models.map((m) => ({ label: m, description: `Test ${m}` })).filter((m) => m.label.startsWith(prefix));
      } catch (err) {
        debugLog("model-test", "failed to get model completions", err);
        return [];
      }
    },
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("model-test requires TUI mode", "error");
        return;
      }
      const arg = args.trim();
      if (arg === "--help") {
        ctx.ui.notify(
          "\u{1F50D} Model Testing Extension\n\n\u{1F4CB} Usage:\n  /model-test [model]     - Test current or specific model\n  /model-test --all        - Test all Ollama models\n  /model-test --list       - List available models\n  /model-test --history    - Show test history\n  /model-test --clear-cache - Clear tool support cache\n\n\u{1F527} Examples:\n  /model-test              # Test current model\n  /model-test gpt-4        # Test specific model\n  /model-test --all        # Benchmark all Ollama models\n\n\u{1F4A1} Use tab completion to see available models",
          "info"
        );
        return;
      }
      if (arg === "--list") {
        try {
          const models = await getOllamaModels();
          const providerInfo = detectProvider(ctx);
          ctx.ui.notify(
            `\u{1F4CB} Available Models

Provider: ${providerInfo.name} (${providerInfo.kind})
Models: ${models.length}

` + models.map((m) => `\u2022 ${m}`).join("\n"),
            "info"
          );
        } catch (err) {
          ctx.ui.notify("Could not list models", "error");
        }
        return;
      }
      if (arg === "--history") {
        try {
          const history = readTestHistory();
          if (history.length === 0) {
            ctx.ui.notify("No test history found", "info");
            return;
          }
          const recent = history.slice(-10);
          const historyText = recent.map(
            (entry, i) => `${i + 1}. ${entry.model} - ${entry.timestamp}
   Score: ${entry.score}
   Duration: ${entry.durationMs}ms`
          ).join("\n\n");
          ctx.ui.notify(
            `\u{1F4CA} Test History (last 10)

${historyText}`,
            "info"
          );
        } catch (err) {
          ctx.ui.notify("Could not read test history", "error");
        }
        return;
      }
      if (arg === "--clear-cache") {
        try {
          const fs3 = __require("node:fs");
          if (fs3.existsSync(TOOL_SUPPORT_CACHE_PATH)) {
            fs3.unlinkSync(TOOL_SUPPORT_CACHE_PATH);
            ctx.ui.notify("Tool support cache cleared successfully", "info");
          } else {
            ctx.ui.notify("No cache file found to clear", "info");
          }
        } catch (err) {
          ctx.ui.notify("Could not clear cache", "error");
        }
        return;
      }
      if (arg === "--all") {
        const providerInfo = detectProvider(ctx);
        if (providerInfo.kind !== "ollama") {
          ctx.ui.notify(`--all is only supported for Ollama models. Current provider: ${providerInfo.name} (${providerInfo.kind})`, "error");
          return;
        }
        ctx.ui.notify("Testing all models \u2014 this will take a while...", "info");
        let models;
        try {
          models = await getOllamaModels();
        } catch (err) {
          debugLog("model-test", "failed to list Ollama models for --all", err);
          ctx.ui.notify("Could not list Ollama models", "error");
          return;
        }
        if (models.length === 0) {
          ctx.ui.notify("No models found in Ollama", "error");
          return;
        }
        for (const model2 of models) {
          ctx.ui.notify(`Testing ${model2}...`, "info");
          try {
            const report = await testModel(model2, ctx);
            pi.sendMessage({
              customType: "model-test-report",
              content: report,
              display: { type: "content", content: report },
              details: { model: model2, timestamp: (/* @__PURE__ */ new Date()).toISOString() }
            });
          } catch (e) {
            ctx.ui.notify(`Failed to test ${model2}: ${e.message}`, "error");
          }
        }
        ctx.ui.notify(`Done testing ${models.length} models`, "info");
        return;
      }
      const model = arg || getCurrentModel(ctx);
      if (!model) {
        ctx.ui.notify("No model specified and no model currently selected", "error");
        return;
      }
      ctx.ui.notify(`Testing ${model}...`, "info");
      try {
        const report = await testModel(model, ctx);
        pi.sendMessage({
          customType: "model-test-report",
          content: report,
          display: { type: "content", content: report },
          details: { model, timestamp: (/* @__PURE__ */ new Date()).toISOString() }
        });
      } catch (e) {
        let errorMessage = "Model test failed";
        if (e.name === "ApiError") {
          errorMessage = e.toUserMessage();
        } else if (e.name === "ExtensionTimeoutError") {
          errorMessage = e.toUserMessage();
        } else if (e.name === "SecurityError") {
          errorMessage = e.toUserMessage();
        } else if (e.name === "ConfigError") {
          errorMessage = e.toUserMessage();
        } else if (e.message) {
          errorMessage += `: ${e.message}`;
        }
        ctx.ui.notify(errorMessage, "error");
      }
    }
  });
  pi.registerTool({
    name: "model_test",
    label: "Model Test",
    description: "Test a model for reasoning ability, thinking/reasoning token support, tool usage capability, instruction following, and tool support level. Supports both Ollama and built-in cloud providers (OpenRouter, Anthropic, Google, OpenAI, etc.). Returns a detailed report with scores.",
    promptSnippet: "model_test - test a model's capabilities",
    promptGuidelines: [
      "When the user asks to test or evaluate a model, call model_test with the model name."
    ],
    parameters: {
      type: "object",
      properties: {
        model: { type: "string", description: "Model name to test (e.g. qwen3:0.6b, anthropic/claude-3.5-sonnet). If omitted, tests the current model." }
      }
    },
    execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
      const model = _params?.model || getCurrentModel(ctx);
      if (!model) {
        return {
          content: [{ type: "text", text: "No model currently selected to test." }],
          isError: true
        };
      }
      try {
        const report = await testModel(model, ctx);
        return {
          content: [{ type: "text", text: report }],
          isError: false
        };
      } catch (e) {
        let errorMessage = "Model test failed";
        if (e.name === "ApiError") {
          errorMessage = e.toUserMessage();
        } else if (e.name === "ExtensionTimeoutError") {
          errorMessage = e.toUserMessage();
        } else if (e.name === "SecurityError") {
          errorMessage = e.toUserMessage();
        } else if (e.name === "ConfigError") {
          errorMessage = e.toUserMessage();
        } else if (e.message) {
          errorMessage += `: ${e.message}`;
        }
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true
        };
      }
    }
  });
}
export {
  model_test_default as default
};
