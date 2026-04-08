/**
 * Shared Ollama utilities for Pi Coding Agent extensions.
 * Eliminates getOllamaBaseUrl() duplication across model-test, ollama-sync, status.
 *
 * Written by VTSTech — https://www.vts-tech.org
 */
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

// ── Constants ────────────────────────────────────────────────────────────

/** Path to Pi's models.json config. */
export const MODELS_JSON_PATH = path.join(os.homedir(), ".pi", "agent", "models.json");

// ── Types ────────────────────────────────────────────────────────────────

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

export interface PiModelsJson {
  providers: Record<string, PiProviderConfig>;
}

export interface PiProviderConfig {
  baseUrl?: string;
  api?: string;
  apiKey?: string;
  compat?: Record<string, unknown>;
  models: PiModelEntry[];
}

export interface PiModelEntry {
  id: string;
  reasoning?: boolean;
  toolSupport?: string;
  modelFamily?: string;
  parameterSize?: string;
  quantizationLevel?: string;
  [key: string]: unknown;
}

// ── Ollama base URL resolution ───────────────────────────────────────────

/**
 * Resolve the Ollama base URL using the three-tier priority chain:
 *   1. models.json → providers.ollama.baseUrl (strip /v1)
 *   2. OLLAMA_HOST environment variable
 *   3. http://localhost:11434
 */
export function getOllamaBaseUrl(): string {
  try {
    if (fs.existsSync(MODELS_JSON_PATH)) {
      const raw = fs.readFileSync(MODELS_JSON_PATH, "utf-8");
      const config = JSON.parse(raw) as PiModelsJson;
      const baseUrl = config?.providers?.["ollama"]?.baseUrl;
      if (baseUrl) {
        // baseUrl is like "https://host/v1" or "http://localhost:11434/v1" — strip /v1
        return baseUrl.replace(/\/v1\/?$/, "");
      }
    }
  } catch { /* ignore parse errors */ }
  if (process.env.OLLAMA_HOST) {
    return `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, "")}`;
  }
  return "http://localhost:11434";
}

// ── Models.json I/O ─────────────────────────────────────────────────────

/** Read and parse models.json. Returns empty structure if not found. */
export function readModelsJson(): PiModelsJson {
  try {
    if (fs.existsSync(MODELS_JSON_PATH)) {
      const raw = fs.readFileSync(MODELS_JSON_PATH, "utf-8");
      return JSON.parse(raw) as PiModelsJson;
    }
  } catch { /* ignore */ }
  return { providers: {} };
}

/** Write models.json back to disk. */
export function writeModelsJson(data: PiModelsJson): void {
  const dir = path.dirname(MODELS_JSON_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(MODELS_JSON_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

// ── Ollama API helpers ───────────────────────────────────────────────────

/** Fetch model list from Ollama /api/tags using native fetch. */
export async function fetchOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  const res = await fetch(`${baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = (await res.json()) as { models?: OllamaModel[] };
  return data.models ?? [];
}

/** Check if an Ollama model name suggests reasoning capability. */
export function isReasoningModel(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("deepseek-r1") ||
    lower.includes("qwq") ||
    lower.includes("o1") ||
    lower.includes("o3") ||
    lower.includes("think") ||
    lower.includes("reason")
  );
}

// ── Model family detection ───────────────────────────────────────────────

/**
 * Detect model family from model name.
 * Ported from AgentNova core/model_family_config.py — detect_family().
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
