/**
 * Shared Ollama utilities for Pi Coding Agent extensions.
 * Eliminates getOllamaBaseUrl() duplication across model-test, ollama-sync, status.
 *
 * @module shared/ollama
 * @writtenby VTSTech — https://www.vts-tech.org
 */
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { debugLog } from "./debug";
import type { PiExtensionContext } from "./types";

// ============================================================================
// Constants
// ============================================================================

/**
 * Extension package version. Derived from the VERSION file in the repo root.
 *
 * IMPORTANT: Do NOT update this constant manually.
 * Use ./scripts/bump-version.sh <new-version> to update ALL locations:
 *   - VERSION file (source of truth)
 *   - shared/ollama.ts (EXTENSION_VERSION)
 *   - scripts/build-packages.sh (derived from VERSION at runtime)
 *   - scripts/publish-packages.sh (derived from VERSION at runtime)
 *   - package.json (version field)
 */
export const EXTENSION_VERSION = "1.2.0";

/**
 * Path to Pi's models.json configuration file.
 *
 * This file contains the provider configurations and model definitions
 * used by Pi to connect to various LLM backends (Ollama, OpenAI, etc.).
 *
 * @example
 * ```typescript
 * console.log(MODELS_JSON_PATH);
 * // Output: "/home/user/.pi/agent/models.json"
 * ```
 */
export const MODELS_JSON_PATH: string = path.join(os.homedir(), ".pi", "agent", "models.json");

// ============================================================================
// Types
// ============================================================================

/**
 * Model information returned by Ollama's /api/tags endpoint.
 *
 * Contains metadata about a pulled model including its name, size,
 * quantization level, and model family.
 *
 * @property name - The model's tag name (e.g., "qwen3:0.6b", "llama3.2:1b")
 * @property model - Alternative model identifier (often same as name)
 * @property modified_at - ISO 8601 timestamp of when the model was last modified
 * @property size - Model file size in bytes
 * @property digest - SHA256 digest of the model
 * @property details - Additional model metadata
 */
export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

/**
 * Pi's models.json configuration structure.
 *
 * Contains provider configurations keyed by provider name (e.g., "ollama", "openai").
 * Each provider has a base URL, API mode, and list of available models.
 *
 * @example
 * ```json
 * {
 *   "providers": {
 *     "ollama": {
 *       "baseUrl": "http://localhost:11434/v1",
 *       "api": "openai-completions",
 *       "models": [{ "id": "qwen3:0.6b" }]
 *     }
 *   }
 * }
 * ```
 */
export interface PiModelsJson {
  providers: Record<string, PiProviderConfig>;
}

/**
 * Configuration for a single provider in models.json.
 *
 * @property baseUrl - The base URL for the provider's API (e.g., "http://localhost:11434/v1")
 * @property api - The API mode to use (e.g., "openai-completions", "anthropic-messages")
 * @property apiKey - Optional API key for authentication
 * @property compat - Compatibility settings for non-standard APIs
 * @property models - List of models available from this provider
 */
export interface PiProviderConfig {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  compat?: Record<string, unknown>;
  models: PiModelEntry[];
}

/**
 * Entry for a single model in Pi's configuration.
 *
 * @property id - The model identifier (e.g., "qwen3:0.6b")
 * @property reasoning - Whether the model supports extended thinking/reasoning
 * @property toolSupport - Level of tool support ("native", "react", "none")
 * @property modelFamily - The model family (e.g., "qwen3", "llama", "granite")
 * @property parameterSize - Human-readable parameter count (e.g., "352M", "1.5B")
 * @property quantizationLevel - Quantization type (e.g., "Q4_K_M", "BF16")
 */
export interface PiModelEntry {
  id: string;
  reasoning?: boolean;
  toolSupport?: string;
  modelFamily?: string;
  parameterSize?: string;
  quantizationLevel?: string;
  contextLength?: number;
  estimatedSize?: { gpu: number; cpu: number };
  [key: string]: unknown;
}

// ============================================================================
// In-Memory Cache (TTL-based)
// ============================================================================

let _modelsJsonCache: { data: PiModelsJson; ts: number } | null = null;
let _ollamaBaseUrlCache: { data: string; ts: number } | null = null;
const CACHE_TTL_MS = 2000; // 2-second TTL

// ============================================================================
// Ollama Base URL Resolution
// ============================================================================

/**
 * Resolve the Ollama base URL using the three-tier priority chain.
 *
 * This function determines the correct Ollama API endpoint by checking
 * multiple sources in order of precedence:
 *
 * 1. **models.json** - Checks `providers.ollama.baseUrl` in Pi's config
 * 2. **OLLAMA_HOST** - Falls back to the environment variable
 * 3. **localhost** - Uses the default `http://localhost:11434`
 *
 * The function automatically strips the `/v1` suffix from URLs since
 * different endpoints need different path handling.
 *
 * @returns The resolved Ollama base URL without trailing slash
 *
 * @example
 * ```typescript
 * // With models.json configured
 * getOllamaBaseUrl();
 * // Returns: "https://abc123.trycloudflare.com"
 *
 * // With OLLAMA_HOST env var
 * process.env.OLLAMA_HOST = "192.168.1.100:11434";
 * getOllamaBaseUrl();
 * // Returns: "http://192.168.1.100:11434"
 *
 * // Default fallback
 * getOllamaBaseUrl();
 * // Returns: "http://localhost:11434"
 * ```
 */
export function getOllamaBaseUrl(): string {
  const now = Date.now();
  if (_ollamaBaseUrlCache && now - _ollamaBaseUrlCache.ts < CACHE_TTL_MS) return _ollamaBaseUrlCache.data;
  try {
    if (fs.existsSync(MODELS_JSON_PATH)) {
      const raw = fs.readFileSync(MODELS_JSON_PATH, "utf-8");
      const config = JSON.parse(raw) as PiModelsJson;
      const baseUrl = config?.providers?.["ollama"]?.baseUrl;
      if (baseUrl) {
        // baseUrl is like "https://host/v1" or "http://localhost:11434/v1" — strip /v1
        const result = baseUrl.replace(/\/v1\/?$/, "");
        _ollamaBaseUrlCache = { data: result, ts: now };
        return result;
      }
    }
  } catch (err) { debugLog("ollama", "failed to parse models.json for base URL", err); }
  if (process.env.OLLAMA_HOST) {
    const result = `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, "")}`;
    _ollamaBaseUrlCache = { data: result, ts: now };
    return result;
  }
  const fallback = "http://localhost:11434";
  _ollamaBaseUrlCache = { data: fallback, ts: now };
  return fallback;
}

// ============================================================================
// Models.json I/O
// ============================================================================

/**
 * Read and parse Pi's models.json configuration file.
 *
 * Safely reads the configuration file, returning an empty structure
 * if the file doesn't exist or contains invalid JSON.
 *
 * @returns The parsed models.json configuration, or an empty structure
 *
 * @example
 * ```typescript
 * const config = readModelsJson();
 * const ollamaModels = config.providers["ollama"]?.models || [];
 * console.log(`Found ${ollamaModels.length} Ollama models`);
 * ```
 */
export function readModelsJson(): PiModelsJson {
  const now = Date.now();
  if (_modelsJsonCache && now - _modelsJsonCache.ts < CACHE_TTL_MS) return _modelsJsonCache.data;
  try {
    if (fs.existsSync(MODELS_JSON_PATH)) {
      const raw = fs.readFileSync(MODELS_JSON_PATH, "utf-8");
      const data = JSON.parse(raw) as PiModelsJson;
      _modelsJsonCache = { data, ts: now };
      return data;
    }
  } catch (err) { debugLog("ollama", "failed to read/parse models.json", err); }
  const empty = { providers: {} };
  _modelsJsonCache = { data: empty, ts: now };
  return empty;
}

/**
 * Write Pi's models.json configuration back to disk.
 *
 * Uses an atomic write-then-rename pattern: the new content is first written
 * to a `.tmp` sibling file, then renamed over the target. This ensures
 * concurrent readers never see a partially-written file.
 *
 * NOTE: The write-then-rename pattern provides filesystem-level atomicity
 * but does NOT protect against concurrent read-modify-write cycles (e.g.
 * two processes both read the file, mutate in memory, then write back).
 * If that becomes a concern in the future, file-based locking (e.g. `proper-lockfile`)
 * should be added around the read-modify-write sequence.
 *
 * @param data - The configuration object to write
 *
 * @example
 * ```typescript
 * const config = readModelsJson();
 * config.providers["ollama"] = {
 *   baseUrl: "http://localhost:11434/v1",
 *   models: [{ id: "qwen3:0.6b" }]
 * };
 * writeModelsJson(config);
 * ```
 */
export function writeModelsJson(data: PiModelsJson): void {
  const dir = path.dirname(MODELS_JSON_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = MODELS_JSON_PATH + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2) + "\n", "utf-8");
  fs.renameSync(tmpPath, MODELS_JSON_PATH);
  // Invalidate cache so next read picks up the written data
  _modelsJsonCache = null;
  _ollamaBaseUrlCache = null;
}

// In-memory mutex for models.json write operations
let _modelsJsonLock: Promise<void> | null = null;

/**
 * Acquire the models.json write lock.
 * Returns a release function that MUST be called when done.
 * Prevents concurrent read-modify-write cycles from different extensions.
 */
export async function acquireModelsJsonLock(): Promise<{ release: () => void }> {
  // Wait for any existing lock to be released
  while (_modelsJsonLock) {
    await _modelsJsonLock;
  }
  // Create new lock
  let releaseLock: () => void;
  _modelsJsonLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  return {
    release: () => {
      releaseLock!();
      _modelsJsonLock = null;
    },
  };
}

/**
 * Safely read, modify, and write models.json under a lock.
 * Prevents concurrent read-modify-write cycles between extensions.
 *
 * @param modifier - Function that receives the current data and returns modified data (or null to abort)
 * @returns true if the write succeeded, false if aborted
 */
export async function readModifyWriteModelsJson(
  modifier: (data: PiModelsJson) => PiModelsJson | null
): Promise<boolean> {
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

// ============================================================================
// Ollama API Helpers
// ============================================================================

/**
 * Retry configuration for Ollama API calls.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 2) */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in ms (default: 10000) */
  maxDelayMs?: number;
  /** Whether to retry on timeout (default: true) */
  retryOnTimeout?: boolean;
  /** Whether to retry on connection errors (default: true) */
  retryOnConnectionError?: boolean;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  retryOnTimeout: true,
  retryOnConnectionError: true,
};

/**
 * Calculate exponential backoff delay with jitter.
 */
function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  // Add jitter (±25%) to avoid thundering herd
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(delay + jitter));
}

/**
 * Error message patterns that indicate transient (retryable) failures.
 */
const RETRYABLE_ERROR_PATTERNS = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "fetch failed",
  "network error",
  "socket hang up",
  "Empty response",
];

/**
 * Determine if an error is retryable based on its message.
 */
function isRetryableError(error: unknown, opts: Required<RetryOptions>): boolean {
  if (error instanceof Error) {
    if (error.name === "AbortError" && opts.retryOnTimeout) return true;
    const msg = error.message;
    if (opts.retryOnConnectionError && RETRYABLE_ERROR_PATTERNS.some(p => msg.includes(p))) {
      return true;
    }
  }
  return false;
}

/**
 * Execute a fetch request with exponential backoff retry logic.
 *
 * Wraps any async function with automatic retry on transient failures.
 * Uses exponential backoff with jitter to avoid thundering herd.
 *
 * @param fn - The async function to execute (typically a fetch call)
 * @param options - Retry configuration
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 *
 * @example
 * ```typescript
 * const models = await withRetry(
 *   () => fetchOllamaModels(baseUrl),
 *   { maxRetries: 2, baseDelayMs: 1000 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < opts.maxRetries && isRetryableError(error, opts)) {
        const delay = backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
        debugLog("ollama", `Retry ${attempt + 1}/${opts.maxRetries} after ${delay}ms: ${error instanceof Error ? error.message : String(error)}`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

/**
 * Fetch the list of available models from an Ollama instance.
 *
 * Queries the `/api/tags` endpoint to get all pulled models with their
 * metadata (size, quantization, family, etc.).
 *
 * @param baseUrl - The Ollama base URL (without /v1 suffix)
 * @returns Array of model objects from Ollama
 * @throws Error if the request fails or Ollama returns an error status
 *
 * @example
 * ```typescript
 * const models = await fetchOllamaModels("http://localhost:11434");
 * for (const model of models) {
 *   console.log(`${model.name}: ${model.details.parameter_size}`);
 * }
 * ```
 */
export async function fetchOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  return withRetry(async () => {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
    const data = (await res.json()) as { models?: OllamaModel[] };
    return data.models ?? [];
  });
}

/**
 * Fetch detailed model info from Ollama's /api/show endpoint.
 *
 * Returns the model's context window size (`num_ctx`), along with
 * other details like the template and system prompt. Used by
 * ollama-sync to enrich model entries with context length metadata.
 *
 * @param baseUrl - The Ollama base URL (without /v1 suffix)
 * @param modelName - The model tag name (e.g., "qwen3:0.6b")
 * @returns Context length in tokens, or undefined if unavailable
 *
 * @example
 * ```typescript
 * const ctx = await fetchModelContextLength("http://localhost:11434", "qwen3:0.6b");
 * console.log(ctx); // 8192
 * ```
 */
export async function fetchModelContextLength(
  baseUrl: string,
  modelName: string
): Promise<number | undefined> {
  return withRetry(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return undefined;
      const data = (await res.json()) as {
        model_info?: Record<string, unknown>;
        template?: string;
      };
      // Ollama uses architecture-specific keys like "qwen3.context_length"
      for (const key of Object.keys(data?.model_info ?? {})) {
        if (key.endsWith(".context_length")) {
          const val = data.model_info[key];
          if (typeof val === "number") return val;
        }
      }
      // Fallback: generic "num_ctx" key
      const numCtx = data?.model_info?.["num_ctx"];
      if (typeof numCtx === "number") return numCtx;
    } catch (err) {
      debugLog("ollama", `failed to fetch context length for ${modelName}`, err);
      return undefined;
    }
    return undefined;
  });
}

/**
 * Fetch context lengths for multiple models, processing them in small batches
 * to avoid overwhelming the connection (especially over tunnels).
 *
 * @param baseUrl - The Ollama base URL (without /v1 suffix)
 * @param modelNames - Array of model tag names
 * @param batchSize - Number of concurrent requests (default: 3)
 * @returns Map of model name to context length (undefined if unavailable)
 */
export async function fetchContextLengthsBatched(
  baseUrl: string,
  modelNames: string[],
  batchSize = 3
): Promise<Map<string, number | undefined>> {
  const result = new Map<string, number | undefined>();
  for (let i = 0; i < modelNames.length; i += batchSize) {
    const batch = modelNames.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((name) => fetchModelContextLength(baseUrl, name))
    );
    results.forEach((r, idx) => {
      result.set(batch[idx], r.status === "fulfilled" ? r.value : undefined);
    });
  }
  return result;
}

/**
 * Check if an Ollama model name suggests reasoning capability.
 *
 * Examines the model name for patterns that indicate support for
 * extended thinking/reasoning tokens (e.g., deepseek-r1, qwq, o1, o3).
 *
 * @param name - The model name to check
 * @returns `true` if the model name suggests reasoning capability
 *
 * @example
 * ```typescript
 * isReasoningModel("deepseek-r1:1.5b");  // true
 * isReasoningModel("qwq:32b");           // true
 * isReasoningModel("qwen3:0.6b");        // false (qwen3 has thinking but not in name)
 * isReasoningModel("llama3.2:1b");       // false
 * ```
 */
export function isReasoningModel(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("deepseek-r1") ||
    lower.includes("qwq") ||
    /\bo1\b/.test(lower) ||
    /\bo3\b/.test(lower) ||
    lower.includes("qwen3") ||
    lower.includes("reasoning") ||
    lower.includes("thinker") ||
    lower.includes("thinking")
  );
}

// ============================================================================
// Built-in Provider Registry
// ============================================================================

/**
 * Known built-in providers that Pi supports out of the box.
 *
 * Pi has two provider layers:
 *   1. Built-in providers (openrouter, anthropic, google, etc.) configured by Pi internally
 *   2. User-defined providers in models.json (e.g. ollama)
 *
 * The ExtensionAPI does not expose a getProviderConfig() method, so we maintain a
 * lookup table for known built-in providers. Used by diag.ts, model-test.ts, and
 * api.ts for provider detection and display.
 *
 * Each entry maps provider name to its API mode, base URL, and the env var
 * that Pi reads for the API key.
 */
export const BUILTIN_PROVIDERS: Record<string, { api: string; baseUrl: string; envKey: string }> = {
  openrouter:    { api: "openai-completions", baseUrl: "https://openrouter.ai/api/v1",      envKey: "OPENROUTER_API_KEY" },
  anthropic:     { api: "anthropic-messages", baseUrl: "https://api.anthropic.com/v1",      envKey: "ANTHROPIC_API_KEY" },
  google:        { api: "gemini",             baseUrl: "https://generativelanguage.googleapis.com", envKey: "GOOGLE_API_KEY" },
  openai:        { api: "openai-completions", baseUrl: "https://api.openai.com/v1",         envKey: "OPENAI_API_KEY" },
  groq:          { api: "openai-completions", baseUrl: "https://api.groq.com/v1",           envKey: "GROQ_API_KEY" },
  deepseek:      { api: "openai-completions", baseUrl: "https://api.deepseek.com/v1",       envKey: "DEEPSEEK_API_KEY" },
  mistral:       { api: "openai-completions", baseUrl: "https://api.mistral.ai/v1",         envKey: "MISTRAL_API_KEY" },
  xai:           { api: "openai-completions", baseUrl: "https://api.x.ai/v1",               envKey: "XAI_API_KEY" },
  together:      { api: "openai-completions", baseUrl: "https://api.together.xyz/v1",       envKey: "TOGETHER_API_KEY" },
  fireworks:     { api: "openai-completions", baseUrl: "https://api.fireworks.ai/inference/v1", envKey: "FIREWORKS_API_KEY" },
  cohere:        { api: "cohere-chat",        baseUrl: "https://api.cohere.com/v1",         envKey: "COHERE_API_KEY" },
  zai:           { api: "openai-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4", envKey: "ZAI_API_KEY" },
};

// ============================================================================
// Model Family Detection
// ============================================================================

/**
 * Detect the model family from a model name.
 *
 * Ported from AgentNova's `core/model_family_config.py` `detect_family()`.
 * Uses substring matching against known model name patterns to determine
 * the family for template/prompt selection purposes.
 *
 * The order of checks matters: more specific patterns (e.g., "qwen3.5")
 * are checked before general ones (e.g., "qwen").
 *
 * @param modelName - The model name to analyze
 * @returns The detected family identifier, or "unknown" if no match
 *
 * @example
 * ```typescript
 * detectModelFamily("qwen3.5:0.8b");     // "qwen35"
 * detectModelFamily("qwen3:0.6b");       // "qwen3"
 * detectModelFamily("llama3.2:1b");      // "llama"
 * detectModelFamily("granite4:350m");    // "granite"
 * detectModelFamily("glm-4:flash");      // "glm"
 * detectModelFamily("unknown-model");    // "unknown"
 * ```
 */
export function detectModelFamily(modelName: string): string {
  const name = modelName.toLowerCase();

  // Order matters: longer/more-specific prefixes first
  const families: [string, string][] = [
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
    ["codestral", "qwen2"],
  ];

  for (const [prefix, family] of families) {
    if (name.includes(prefix)) return family;
  }
  return "unknown";
}

// ============================================================================
// Provider Detection
// ============================================================================

/**
 * Kind of provider: local Ollama, built-in cloud, or unknown.
 */
export type ProviderKind = "ollama" | "builtin" | "unknown";

/**
 * Information about the active provider, detected from Pi's context and models.json.
 *
 * @property kind - The provider kind (ollama, builtin, or unknown)
 * @property name - Provider name (e.g. "ollama", "openrouter", "anthropic")
 * @property apiMode - API mode (e.g. "openai-completions", "ollama")
 * @property baseUrl - API base URL
 * @property envKey - Environment variable for API key
 * @property apiKey - Actual API key value (if available)
 */
export interface ProviderInfo {
  kind: ProviderKind;
  name: string;
  apiMode?: string;
  baseUrl?: string;
  envKey?: string;
  apiKey?: string;
}

/**
 * Detect whether the current model is on an Ollama provider, a built-in
 * provider, or an unknown provider. Uses 3-tier logic:
 *   1. User-defined provider in models.json
 *   2. Known built-in provider
 *   3. Unknown provider
 *
 * @param ctx - Pi's extension context (from session_start event)
 * @returns Provider information including kind, name, API details, and key
 */
export function detectProvider(ctx: PiExtensionContext): ProviderInfo {
  const model = ctx.model;
  if (!model) return { kind: "unknown", name: "none" };

  const providerName = model.provider || "";
  if (!providerName) return { kind: "unknown", name: "none" };

  // Tier 1: Check if provider is defined in models.json
  const modelsJson = readModelsJson();
  const userProviderCfg = (modelsJson.providers || {})[providerName];
  if (userProviderCfg) {
    const baseUrl = userProviderCfg.baseUrl || "";
    const apiMode = userProviderCfg.api || "";
    const apiKey = userProviderCfg.apiKey || "";

    // Check if it's an Ollama provider (user-defined Ollama in models.json)
    const isOllama = /ollama/i.test(providerName) ||
      /localhost:\d+/.test(baseUrl) ||
      /127\.0\.0\.1:\d+/.test(baseUrl) ||
      /0\.0\.0\.0:\d+/.test(baseUrl) ||
      /\/api\/chat/.test(baseUrl) ||
      apiMode === "ollama";

    if (isOllama) {
      return { kind: "ollama", name: providerName, apiMode: "ollama", baseUrl, apiKey };
    }

    // User-defined non-Ollama provider (treat as Ollama-style if it has /api/chat)
    if (/\/api\/chat/.test(baseUrl)) {
      return { kind: "ollama", name: providerName, apiMode: "ollama", baseUrl, apiKey };
    }

    // User-defined provider with custom config — treat as built-in style
    return {
      kind: "builtin",
      name: providerName,
      apiMode: apiMode || "openai-completions",
      baseUrl,
      apiKey,
    };
  }

  // Tier 2: Check built-in providers
  const builtin = BUILTIN_PROVIDERS[providerName];
  if (builtin) {
    const apiKey = process.env[builtin.envKey] || "";
    return {
      kind: "builtin",
      name: providerName,
      apiMode: builtin.api,
      baseUrl: builtin.baseUrl,
      envKey: builtin.envKey,
      apiKey,
    };
  }

  // Tier 3: Unknown provider
  return { kind: "unknown", name: providerName };
}

// ============================================================================
// Local Provider Detection
// ============================================================================

/**
 * Check if a provider URL indicates a local (on-machine) provider.
 * Used by api.ts, status.ts, and diag.ts to determine whether
 * system metrics (CPU/RAM/Swap) are meaningful.
 *
 * @param baseUrl - The provider's base URL (e.g. "http://localhost:11434/v1")
 * @param providerName - Optional provider name (e.g. "ollama")
 * @returns `true` if the provider is local, `false` otherwise
 */
export function isLocalProvider(baseUrl: string, providerName?: string): boolean {
  if (providerName === "ollama") return true;
  const url = baseUrl || "";
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0");
}