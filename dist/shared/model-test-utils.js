import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { debugLog } from "./debug";
const CONFIG = {
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
const TEST_CONFIG_DIR = path.join(os.homedir(), ".pi", "agent");
const TEST_CONFIG_PATH = path.join(TEST_CONFIG_DIR, "model-test-config.json");
function readTestConfig() {
  try {
    if (fs.existsSync(TEST_CONFIG_PATH)) {
      const raw = fs.readFileSync(TEST_CONFIG_PATH, "utf-8");
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
const WEATHER_TOOL_DEFINITION = {
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
const TOOL_SUPPORT_CACHE_DIR = path.join(os.homedir(), ".pi", "agent", "cache");
const TOOL_SUPPORT_CACHE_PATH = path.join(TOOL_SUPPORT_CACHE_DIR, "tool_support.json");
let _toolSupportCacheInMemory = null;
function readToolSupportCache() {
  try {
    if (fs.existsSync(TOOL_SUPPORT_CACHE_PATH)) {
      const raw = fs.readFileSync(TOOL_SUPPORT_CACHE_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
  }
  return {};
}
function writeToolSupportCache(cache) {
  if (!fs.existsSync(TOOL_SUPPORT_CACHE_DIR)) {
    fs.mkdirSync(TOOL_SUPPORT_CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(TOOL_SUPPORT_CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf-8");
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
const TEST_HISTORY_DIR = path.join(os.homedir(), ".pi", "agent", "cache");
const TEST_HISTORY_PATH = path.join(TEST_HISTORY_DIR, "model-test-history.json");
const MAX_HISTORY_PER_MODEL = 50;
const MAX_HISTORY_TOTAL = 500;
function readTestHistory() {
  try {
    if (fs.existsSync(TEST_HISTORY_PATH)) {
      const raw = fs.readFileSync(TEST_HISTORY_PATH, "utf-8");
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
  if (!fs.existsSync(TEST_HISTORY_DIR)) {
    fs.mkdirSync(TEST_HISTORY_DIR, { recursive: true });
  }
  fs.writeFileSync(TEST_HISTORY_PATH, JSON.stringify(trimmedHistory, null, 2) + "\n", "utf-8");
}
function appendTestHistory(entry) {
  const history = readTestHistory();
  if (!history[entry.model]) {
    history[entry.model] = [];
  }
  history[entry.model].push(entry);
  writeTestHistory(history);
}
function getModelHistory(model, limit = 10) {
  const history = readTestHistory();
  const entries = history[model] || [];
  return entries.slice(-limit);
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
const REASONING_PROMPT = `A snail climbs 3 feet up a wall each day, but slides back 2 feet each night. The wall is 10 feet tall. How many days does it take the snail to reach the top? Think step by step and give the final answer on its own line like: ANSWER: <number>`;
const TOOL_SYSTEM_PROMPT = "You are a helpful assistant. Use the available tools when needed.";
const TOOL_USER_PROMPT = "What's the weather like in Paris right now?";
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
export {
  CONFIG,
  TEST_CONFIG_PATH,
  TOOL_SUPPORT_CACHE_PATH,
  WEATHER_TOOL_DEFINITION,
  appendTestHistory,
  cacheToolSupport,
  cleanupToolSupportCache,
  detectRegression,
  ensureCacheClean,
  getCachedToolSupport,
  getEffectiveConfig,
  getModelHistory,
  parseTextToolCall,
  readTestConfig,
  readTestHistory,
  readToolSupportCache,
  scoreNativeToolCall,
  scoreReasoning,
  scoreTextToolCall,
  testInstructionFollowingUnified,
  testReasoningUnified,
  testToolUsageUnified,
  writeTestHistory,
  writeToolSupportCache
};
