/**
 * Shared test utilities for model-test extension.
 * Extracted from extensions/model-test.ts to reduce duplication between
 * Ollama-specific and Provider-specific test variants.
 *
 * @module shared/model-test-utils
 * @writtenby VTSTech — https://www.vts-tech.org
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ToolSupportLevel } from "./types";

// ============================================================================
// Configuration Constants
// ============================================================================

/**
 * Configuration constants for model testing.
 * Centralized to make tuning and maintenance easier.
 *
 * @property DEFAULT_TIMEOUT_MS - Default timeout for Ollama API calls (~16.7 min)
 * @property CONNECT_TIMEOUT_S - Connection timeout for fetch (seconds)
 * @property MAX_RETRIES - Number of retry attempts for transient failures
 * @property RETRY_DELAY_MS - Delay between retry attempts (milliseconds)
 * @property NUM_PREDICT - Default max tokens for model responses
 * @property TEMPERATURE - Default sampling temperature
 * @property MIN_THINKING_LENGTH - Minimum characters to consider thinking tokens valid
 * @property TOOL_TEST_TIMEOUT_MS - Timeout for tool usage tests
 * @property TOOL_SUPPORT_TIMEOUT_MS - Timeout for tool support detection
 * @property TAGS_TIMEOUT_MS - Timeout for /api/tags requests
 */
export const CONFIG = {
  // General API settings
  DEFAULT_TIMEOUT_MS: 999999,        // ~16.7 minutes — effectively unlimited for slow models
  CONNECT_TIMEOUT_S: 60,             // 60 seconds to establish connection
  MAX_RETRIES: 1,                    // Single retry for transient failures
  RETRY_DELAY_MS: 10000,              // 10 seconds between retries

  // Model generation settings
  NUM_PREDICT: 1024,                 // Max tokens in response
  TEMPERATURE: 0.1,                  // Low temperature for more deterministic output

  // Test-specific settings
  MIN_THINKING_LENGTH: 10,           // Minimum chars to consider thinking tokens valid
  TOOL_TEST_TIMEOUT_MS: 999999,       // Effectively unlimited for slow tool usage tests
  TOOL_SUPPORT_TIMEOUT_MS: 999999,   // Effectively unlimited for tool support detection

  // Metadata retrieval
  TAGS_TIMEOUT_MS: 15000,            // 15 seconds for /api/tags
  MODEL_INFO_TIMEOUT_MS: 30000,      // 30 seconds for model info lookup

  // Provider API settings
  PROVIDER_TIMEOUT_MS: 999999,       // Effectively unlimited for cloud provider API calls
  PROVIDER_TOOL_TIMEOUT_MS: 120000,   // 120 seconds for tool usage tests on providers

  // Rate limiting
  TEST_DELAY_MS: 10000,              // 10 seconds between tests to avoid rate limiting
} as const;

// ============================================================================
// User Configuration Overrides
// ============================================================================

const TEST_CONFIG_DIR = path.join(os.homedir(), ".pi", "agent");
export const TEST_CONFIG_PATH = path.join(TEST_CONFIG_DIR, "model-test-config.json");

/** Shape of the user configuration file. */
export interface ModelTestUserConfig {
  defaultTimeoutMs?: number;
  connectTimeoutS?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  testDelayMs?: number;
  toolTestTimeoutMs?: number;
  providerTimeoutMs?: number;
  providerToolTimeoutMs?: number;
  numPredict?: number;
  temperature?: number;
}

/**
 * Read user configuration from ~/.pi/agent/model-test-config.json.
 * Returns an empty object if the file doesn't exist or is invalid.
 */
export function readTestConfig(): ModelTestUserConfig {
  try {
    if (fs.existsSync(TEST_CONFIG_PATH)) {
      const raw = fs.readFileSync(TEST_CONFIG_PATH, "utf-8");
      return JSON.parse(raw) as ModelTestUserConfig;
    }
  } catch { /* config read/parse failure is non-critical — defaults are used */ }
  return {};
}

/**
 * Get effective test configuration by merging user overrides with defaults.
 * User values take precedence over CONFIG defaults.
 */
export function getEffectiveConfig(): typeof CONFIG {
  const userConfig = readTestConfig();
  return {
    ...CONFIG,
    DEFAULT_TIMEOUT_MS: (userConfig.defaultTimeoutMs ?? CONFIG.DEFAULT_TIMEOUT_MS) as typeof CONFIG.DEFAULT_TIMEOUT_MS,
    CONNECT_TIMEOUT_S: (userConfig.connectTimeoutS ?? CONFIG.CONNECT_TIMEOUT_S) as typeof CONFIG.CONNECT_TIMEOUT_S,
    MAX_RETRIES: (userConfig.maxRetries ?? CONFIG.MAX_RETRIES) as typeof CONFIG.MAX_RETRIES,
    RETRY_DELAY_MS: (userConfig.retryDelayMs ?? CONFIG.RETRY_DELAY_MS) as typeof CONFIG.RETRY_DELAY_MS,
    TEST_DELAY_MS: (userConfig.testDelayMs ?? CONFIG.TEST_DELAY_MS) as typeof CONFIG.TEST_DELAY_MS,
    TOOL_TEST_TIMEOUT_MS: (userConfig.toolTestTimeoutMs ?? CONFIG.TOOL_TEST_TIMEOUT_MS) as typeof CONFIG.TOOL_TEST_TIMEOUT_MS,
    PROVIDER_TIMEOUT_MS: (userConfig.providerTimeoutMs ?? CONFIG.PROVIDER_TIMEOUT_MS) as typeof CONFIG.PROVIDER_TIMEOUT_MS,
    PROVIDER_TOOL_TIMEOUT_MS: (userConfig.providerToolTimeoutMs ?? CONFIG.PROVIDER_TOOL_TIMEOUT_MS) as typeof CONFIG.PROVIDER_TOOL_TIMEOUT_MS,
    NUM_PREDICT: (userConfig.numPredict ?? CONFIG.NUM_PREDICT) as typeof CONFIG.NUM_PREDICT,
    TEMPERATURE: (userConfig.temperature ?? CONFIG.TEMPERATURE) as typeof CONFIG.TEMPERATURE,
  };
}

// ============================================================================
// Weather Tool Definition (shared across all tool tests)
// ============================================================================

/**
 * Standard get_weather tool schema used by all tool usage tests.
 * Previously copy-pasted in 3+ places — now a single shared constant.
 */
export const WEATHER_TOOL_DEFINITION = {
  type: "function" as const,
  function: {
    name: "get_weather",
    description: "Get the current weather for a location",
    parameters: {
      type: "object",
      properties: {
        location: { type: "string", description: "City name" },
        unit: { type: "string", enum: ["celsius", "fahrenheit"] },
      },
      required: ["location"],
    },
  },
};

// ============================================================================
// Scoring Helpers
// ============================================================================

/** Score a reasoning response based on correctness and reasoning patterns. */
export function scoreReasoning(msg: string): { score: string; pass: boolean } {
  const allNumbers = msg.match(/\b(\d+)\b/g) || [];
  const answer = allNumbers.length > 0 ? allNumbers[allNumbers.length - 1] : "?";
  const isCorrect = answer === "8";

  const reasoningPatterns = ["because", "therefore", "since", "step", "subtract", "minus",
    "each day", "each night", "slides", "climbs", "night", "reaches", "finally", "last day"];
  const hasReasoningWords = reasoningPatterns.some(w => msg.toLowerCase().includes(w));
  const hasNumberedSteps = /^\s*\d+\.\s/m.test(msg);
  const hasReasoning = hasReasoningWords || hasNumberedSteps;

  if (isCorrect && hasReasoning) return { score: "STRONG", pass: true };
  if (isCorrect) return { score: "MODERATE", pass: true };
  if (hasReasoning) return { score: "WEAK", pass: false };
  return { score: "FAIL", pass: false };
}

/** Score a native tool call response. */
export function scoreNativeToolCall(fnName: string, args: Record<string, unknown>): { score: string; pass: boolean } {
  const hasCorrectTool = fnName === "get_weather";
  const hasLocation = typeof args.location === "string" && (args.location as string).toLowerCase().includes("paris");
  const unitValid = args.unit === undefined ||
    (typeof args.unit === "string" && ["celsius", "fahrenheit"].includes((args.unit as string).toLowerCase()));

  if (hasCorrectTool && hasLocation && unitValid) return { score: "STRONG", pass: true };
  if (hasCorrectTool && hasLocation) return { score: "MODERATE", pass: true };
  return { score: "WEAK", pass: false };
}

/** Score a text-based tool call parsed from model content. */
export function scoreTextToolCall(fnName: string, args: Record<string, unknown>): { score: string; pass: boolean } {
  const isWeatherTool = fnName === "get_weather";
  const hasLocation = typeof args.location === "string" && (args.location as string).toLowerCase().includes("paris");

  if (isWeatherTool && hasLocation) return { score: "STRONG", pass: true };
  if (isWeatherTool) return { score: "MODERATE", pass: true };
  return { score: "WEAK", pass: false };
}

/** Parse tool call JSON from model text content. Returns null if no valid tool call found. */
export function parseTextToolCall(content: string): { fnName: string; args: Record<string, unknown> } | null {
  const firstBrace = content.indexOf('{');
  if (firstBrace === -1) return null;
  const lastBrace = content.lastIndexOf('}');
  if (lastBrace <= firstBrace) return null;

  const jsonCandidate = content.slice(firstBrace, lastBrace + 1);
  let textToolParsed: any = null;
  try { textToolParsed = JSON.parse(jsonCandidate); } catch { return null; }

  if (!textToolParsed || typeof textToolParsed.name !== "string") return null;
  const rawArgs = textToolParsed.arguments || { ...textToolParsed };
  const { name: _, ...fnArgs } = rawArgs;
  return { fnName: textToolParsed.name, args: fnArgs };
}

// ============================================================================
// Tool Support Cache
// ============================================================================

const TOOL_SUPPORT_CACHE_DIR = path.join(os.homedir(), ".pi", "agent", "cache");
export const TOOL_SUPPORT_CACHE_PATH = path.join(TOOL_SUPPORT_CACHE_DIR, "tool_support.json");

export interface ToolSupportCacheRecord {
  support: ToolSupportLevel;
  testedAt: string;
  family: string;
}

export interface ToolSupportCache {
  [modelName: string]: ToolSupportCacheRecord;
}

/** In-memory cache to avoid redundant disk reads for tool support lookups. */
let _toolSupportCacheInMemory: ToolSupportCache | null = null;

/**
 * Read the tool support cache from disk.
 * Returns an empty object if the file doesn't exist or is invalid.
 */
export function readToolSupportCache(): ToolSupportCache {
  try {
    if (fs.existsSync(TOOL_SUPPORT_CACHE_PATH)) {
      const raw = fs.readFileSync(TOOL_SUPPORT_CACHE_PATH, "utf-8");
      return JSON.parse(raw) as ToolSupportCache;
    }
  } catch { /* cache read/parse failure is non-critical — cache will be rebuilt */ }
  return {};
}

/**
 * Write the tool support cache to disk.
 */
export function writeToolSupportCache(cache: ToolSupportCache): void {
  if (!fs.existsSync(TOOL_SUPPORT_CACHE_DIR)) {
    fs.mkdirSync(TOOL_SUPPORT_CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(TOOL_SUPPORT_CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}

/**
 * Look up a model's cached tool support level.
 * Returns null if not cached.
 */
export function getCachedToolSupport(model: string): ToolSupportCacheRecord | null {
  const cache = _toolSupportCacheInMemory || readToolSupportCache();
  if (!_toolSupportCacheInMemory) _toolSupportCacheInMemory = cache;
  const entry = cache[model];
  if (!entry) return null;
  // Validate the entry has required fields and a valid support level
  if (!entry.support || !["native", "react", "none"].includes(entry.support)) return null;
  return entry;
}

/**
 * Cache a model's tool support level.
 */
export function cacheToolSupport(model: string, support: ToolSupportLevel, family: string): void {
  const cache = _toolSupportCacheInMemory || readToolSupportCache();
  cache[model] = {
    support,
    testedAt: new Date().toISOString(),
    family,
  };
  _toolSupportCacheInMemory = cache; // keep in-memory cache in sync
  writeToolSupportCache(cache);
}

// ============================================================================
// Test History Tracking
// ============================================================================

const TEST_HISTORY_DIR = path.join(os.homedir(), ".pi", "agent", "cache");
const TEST_HISTORY_PATH = path.join(TEST_HISTORY_DIR, "model-test-history.json");

/** Maximum number of history entries to keep per model. */
const MAX_HISTORY_PER_MODEL = 50;

/** Maximum total history entries across all models. */
const MAX_HISTORY_TOTAL = 500;

/**
 * A single test history entry, stored per model per run.
 */
export interface TestHistoryEntry {
  /** ISO 8601 timestamp of when the test was run */
  timestamp: string;
  /** Model identifier */
  model: string;
  /** Provider kind (ollama, builtin, unknown) */
  providerKind: string;
  /** Provider name */
  providerName: string;
  /** Individual test scores */
  tests: {
    reasoning: { score: string; pass: boolean; answer?: string };
    thinking: { supported: boolean };
    toolUsage: { score: string; pass: boolean; toolCall: string };
    reactParsing: { score: string; pass: boolean; toolCall: string; dialect?: string };
    instructionFollowing: { score: string; pass: boolean };
    toolSupport: { level: string; evidence: string };
  };
  /** Summary: number of tests passed */
  passedCount: number;
  /** Summary: total number of tests */
  totalCount: number;
  /** Total time in ms */
  totalMs: number;
}

/** Shape of the history file on disk. */
export interface TestHistoryFile {
  [modelName: string]: TestHistoryEntry[];
}

/**
 * Read test history from disk.
 * Returns an empty object if the file doesn't exist or is invalid.
 */
export function readTestHistory(): TestHistoryFile {
  try {
    if (fs.existsSync(TEST_HISTORY_PATH)) {
      const raw = fs.readFileSync(TEST_HISTORY_PATH, "utf-8");
      return JSON.parse(raw) as TestHistoryFile;
    }
  } catch { /* history read/parse failure is non-critical — returns empty history */ }
  return {};
}

/**
 * Write test history to disk.
 * Enforces per-model and total entry limits.
 */
export function writeTestHistory(history: TestHistoryFile): void {
  // Enforce per-model limits
  for (const model of Object.keys(history)) {
    if (history[model].length > MAX_HISTORY_PER_MODEL) {
      history[model] = history[model].slice(-MAX_HISTORY_PER_MODEL);
    }
  }

  // Enforce total limit
  let totalEntries = 0;
  const modelsByRecency = Object.entries(history)
    .map(([model, entries]) => ({
      model,
      entries,
      lastEntry: entries[entries.length - 1]?.timestamp || "",
    }))
    .sort((a, b) => b.lastEntry.localeCompare(a.lastEntry));

  const trimmedHistory: TestHistoryFile = {};
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

  if (!fs.existsSync(TEST_HISTORY_DIR)) {
    fs.mkdirSync(TEST_HISTORY_DIR, { recursive: true });
  }
  fs.writeFileSync(TEST_HISTORY_PATH, JSON.stringify(trimmedHistory, null, 2) + "\n", "utf-8");
}

/**
 * Append a test result entry to the history.
 * Handles creating new model entries and updating existing ones.
 */
export function appendTestHistory(entry: TestHistoryEntry): void {
  const history = readTestHistory();
  if (!history[entry.model]) {
    history[entry.model] = [];
  }
  history[entry.model].push(entry);
  writeTestHistory(history);
}

/**
 * Get the recent test history for a specific model.
 * @param model - Model name
 * @param limit - Maximum entries to return (default: 10)
 */
export function getModelHistory(model: string, limit = 10): TestHistoryEntry[] {
  const history = readTestHistory();
  const entries = history[model] || [];
  return entries.slice(-limit);
}

/**
 * Detect if a model's test scores have regressed compared to its last run.
 * Returns null if there's no previous run, or an object describing the regression.
 */
export function detectRegression(
  model: string,
  current: TestHistoryEntry,
): Array<{ test: string; previous: string; current: string }> {
  const history = readTestHistory();
  const entries = history[model] || [];
  if (entries.length < 2) return []; // No previous run to compare

  const previous = entries[entries.length - 2]; // Second-to-last entry
  const regressions: Array<{ test: string; previous: string; current: string }> = [];

  const scoreOrder = ["STRONG", "MODERATE", "WEAK", "FAIL", "ERROR", "NO", "YES"];
  const scoreRank = (s: string): number => {
    const idx = scoreOrder.indexOf(s);
    return idx >= 0 ? idx : 99;
  };

  // Compare reasoning
  if (scoreRank(current.tests.reasoning.score) > scoreRank(previous.tests.reasoning.score)) {
    regressions.push({ test: "Reasoning", previous: previous.tests.reasoning.score, current: current.tests.reasoning.score });
  }
  // Compare tool usage
  if (scoreRank(current.tests.toolUsage.score) > scoreRank(previous.tests.toolUsage.score)) {
    regressions.push({ test: "Tool Usage", previous: previous.tests.toolUsage.score, current: current.tests.toolUsage.score });
  }
  // Compare ReAct parsing
  if (scoreRank(current.tests.reactParsing.score) > scoreRank(previous.tests.reactParsing.score)) {
    regressions.push({ test: "ReAct Parsing", previous: previous.tests.reactParsing.score, current: current.tests.reactParsing.score });
  }
  // Compare instruction following
  if (scoreRank(current.tests.instructionFollowing.score) > scoreRank(previous.tests.instructionFollowing.score)) {
    regressions.push({ test: "Instructions", previous: previous.tests.instructionFollowing.score, current: current.tests.instructionFollowing.score });
  }
  // Compare tool support
  const supportRank = (s: string): number => s === "native" ? 0 : s === "react" ? 1 : 2;
  if (supportRank(current.tests.toolSupport.level) > supportRank(previous.tests.toolSupport.level)) {
    regressions.push({ test: "Tool Support", previous: previous.tests.toolSupport.level, current: current.tests.toolSupport.level });
  }

  return regressions;
}

// ============================================================================
// ChatFn Abstraction
// ============================================================================

/**
 * Abstraction over Ollama and Provider chat APIs.
 * Callers wrap their specific chat implementation into this shape.
 */
export type ChatFn = (
  model: string,
  messages: Array<{ role: string; content: string }>,
  options?: Record<string, unknown>,
) => Promise<{ content: string; toolCalls?: any[]; elapsedMs: number; raw?: any }>;

// ============================================================================
// Test Result Types
// ============================================================================

/** Result from a reasoning test. */
export interface ReasoningTestResult {
  pass: boolean;
  score: string;
  reasoning: string;
  answer: string;
  elapsedMs: number;
}

/** Result from a tool usage test. */
export interface ToolUsageTestResult {
  pass: boolean;
  score: string;
  hasToolCalls: boolean;
  toolCall: string;
  response: string;
  elapsedMs: number;
}

/** Result from an instruction following test. */
export interface InstructionFollowingTestResult {
  pass: boolean;
  score: string;
  output: string;
  elapsedMs: number;
}

// ============================================================================
// Unified Test Functions
// ============================================================================

const REASONING_PROMPT = `A snail climbs 3 feet up a wall each day, but slides back 2 feet each night. The wall is 10 feet tall. How many days does it take the snail to reach the top? Think step by step and give the final answer on its own line like: ANSWER: <number>`;

const TOOL_SYSTEM_PROMPT = "You are a helpful assistant. Use the available tools when needed.";
const TOOL_USER_PROMPT = "What's the weather like in Paris right now?";

/**
 * Unified tool usage test.
 * Works with any chat backend that conforms to the ChatFn interface.
 * The caller passes tools, timeout, etc. via the options parameter.
 */
export async function testToolUsageUnified(
  chatFn: ChatFn,
  model: string,
  options?: { tools?: any[]; timeoutMs?: number; systemPrompt?: string },
): Promise<ToolUsageTestResult> {
  const tools = options?.tools || [WEATHER_TOOL_DEFINITION];
  const systemPrompt = options?.systemPrompt || TOOL_SYSTEM_PROMPT;

  try {
    const result = await chatFn(model, [
      { role: "system", content: systemPrompt },
      { role: "user", content: TOOL_USER_PROMPT },
    ], { tools });

    const content = result.content;
    const toolCalls = result.toolCalls;

    if (toolCalls && toolCalls.length > 0) {
      const call = toolCalls[0];
      const fn = call.function || {};
      let args: Record<string, unknown> = {};
      try {
        args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : (fn.arguments || {});
      } catch {
        // Arguments are not valid JSON — still count as tool usage (WEAK)
        return {
          pass: true,
          score: "WEAK",
          hasToolCalls: true,
          toolCall: `malformed args: ${String(fn.arguments)}`,
          response: content,
          elapsedMs: result.elapsedMs,
        };
      }
      const { score, pass } = scoreNativeToolCall(fn.name || "", args);

      return {
        pass,
        score,
        hasToolCalls: true,
        toolCall: `${fn.name}(${JSON.stringify(args)})`,
        response: content,
        elapsedMs: result.elapsedMs,
      };
    }

    // Model answered in text — check if it contains valid tool call JSON
    const textParsed = parseTextToolCall(content);
    if (textParsed) {
      const { score, pass } = scoreTextToolCall(textParsed.fnName, textParsed.args);

      return {
        pass,
        score,
        hasToolCalls: true,
        toolCall: `${textParsed.fnName}(${JSON.stringify(textParsed.args)})`,
        response: content,
        elapsedMs: result.elapsedMs,
      };
    }

    return {
      pass: false,
      score: "FAIL",
      hasToolCalls: false,
      toolCall: "none",
      response: content,
      elapsedMs: result.elapsedMs,
    };
  } catch (e: any) {
    return { pass: false, score: "ERROR", hasToolCalls: false, toolCall: `error: ${e.message}`, response: "", elapsedMs: 0 };
  }
}

/**
 * Unified reasoning test.
 * Works with any chat backend that conforms to the ChatFn interface.
 */
export async function testReasoningUnified(
  chatFn: ChatFn,
  model: string,
): Promise<ReasoningTestResult> {
  try {
    const result = await chatFn(model, [
      { role: "user", content: REASONING_PROMPT },
    ]);

    const msg = result.content.trim();
    if (msg.length === 0) {
      return { pass: false, score: "ERROR", reasoning: "Empty response", answer: "?", elapsedMs: result.elapsedMs };
    }

    const allNumbers = msg.match(/\b(\d+)\b/g) || [];
    const answer = allNumbers.length > 0 ? allNumbers[allNumbers.length - 1] : "?";
    const { score, pass } = scoreReasoning(msg);

    return { pass, score, reasoning: msg, answer, elapsedMs: result.elapsedMs };
  } catch (e: any) {
    return { pass: false, score: "ERROR", reasoning: e.message, answer: "?", elapsedMs: 0 };
  }
}

/**
 * Unified instruction following test.
 * Works with any chat backend that conforms to the ChatFn interface.
 */
export async function testInstructionFollowingUnified(
  chatFn: ChatFn,
  model: string,
): Promise<InstructionFollowingTestResult> {
  const prompt = `You must respond with ONLY a valid JSON object. No markdown, no explanation, no backticks, no extra text.

The JSON object must have exactly these 4 keys:
- "name" (string): your model name
- "can_count" (boolean): true
- "sum" (number): the result of 15 + 27
- "language" (string): the language you are responding in`;

  try {
    const result = await chatFn(model, [
      { role: "user", content: prompt },
    ]);

    const msg = result.content.trim();

    // Try to parse as JSON (with repair for truncated output)
    let parsed: any = null;
    let repairNote = "";
    try {
      const cleaned = msg.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // Not valid JSON — attempt repair via brace/bracket matching
      const cleaned = msg.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
      let braceDepth = 0, bracketDepth = 0;
      let inString = false, escapeNext = false;
      for (let i = 0; i < cleaned.length; i++) {
        const c = cleaned[i];
        if (escapeNext) { escapeNext = false; continue; }
        if (c === '\\') { if (inString) escapeNext = true; continue; }
        if (c === '"') { inString = !inString; continue; }
        if (inString) continue;
        if (c === '{') braceDepth++;
        else if (c === '}') braceDepth = Math.max(0, braceDepth - 1);
        else if (c === '[') bracketDepth++;
        else if (c === ']') bracketDepth = Math.max(0, bracketDepth - 1);
      }
      if (braceDepth > 0 || bracketDepth > 0) {
        const repaired = cleaned
          + "}".repeat(braceDepth)
          + "]".repeat(bracketDepth);
        try {
          parsed = JSON.parse(repaired);
          repairNote = " (repaired truncated JSON)";
        } catch { /* repair failed too */ }
      }
    }

    if (!parsed) {
      return { pass: false, score: "FAIL", output: msg, elapsedMs: result.elapsedMs };
    }

    const hasKeys = parsed.name && parsed.can_count !== undefined && parsed.sum !== undefined && parsed.language;
    const correctSum = parsed.sum === 42;
    const hasCorrectCount = parsed.can_count === true;

    let score: string;
    if (hasKeys && correctSum && hasCorrectCount) {
      score = "STRONG";
    } else if (hasKeys && (correctSum || hasCorrectCount)) {
      score = "MODERATE";
    } else if (parsed.sum !== undefined || parsed.name) {
      score = "WEAK";
    } else {
      score = "FAIL";
    }

    return {
      pass: hasKeys,
      score,
      output: JSON.stringify(parsed) + repairNote,
      elapsedMs: result.elapsedMs,
    };
  } catch (e: any) {
    return { pass: false, score: "ERROR", output: e.message, elapsedMs: 0 };
  }
}
