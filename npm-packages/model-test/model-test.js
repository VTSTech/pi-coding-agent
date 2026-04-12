// .build-npm/model-test/model-test.temp.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  section,
  ok,
  fail,
  warn,
  info,
  msHuman,
  truncate,
  sanitizeForReport
} from "@vtstech/pi-shared/format";
import { getOllamaBaseUrl, detectModelFamily, readModelsJson, writeModelsJson, fetchModelContextLength, EXTENSION_VERSION, detectProvider } from "@vtstech/pi-shared/ollama";
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
  // Rate limiting
  TEST_DELAY_MS: 1e4
  // 10 seconds between tests to avoid rate limiting
};
var TOOL_SUPPORT_CACHE_DIR = path.join(os.homedir(), ".pi", "agent", "cache");
var TOOL_SUPPORT_CACHE_PATH = path.join(TOOL_SUPPORT_CACHE_DIR, "tool_support.json");
var _toolSupportCacheInMemory = null;
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
  writeToolSupportCache(cache);
}
function model_test_temp_default(pi) {
  function ollamaBase() {
    return getOllamaBaseUrl();
  }
  async function rateLimitDelay(lines) {
    if (CONFIG.TEST_DELAY_MS > 0) {
      lines.push(info(`Waiting ${msHuman(CONFIG.TEST_DELAY_MS)} to avoid rate limiting...`));
      await new Promise((r) => setTimeout(r, CONFIG.TEST_DELAY_MS));
    }
  }
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
    const prompt = `A snail climbs 3 feet up a wall each day, but slides back 2 feet each night. The wall is 10 feet tall. How many days does it take the snail to reach the top? Think step by step and give the final answer on its own line like: ANSWER: <number>`;
    try {
      const result = await providerChat(providerInfo, model, [
        { role: "user", content: prompt }
      ]);
      const msg = result.content.trim();
      if (msg.length === 0) {
        return { pass: false, score: "ERROR", reasoning: "Empty response from provider", answer: "?", elapsedMs: result.elapsedMs };
      }
      const allNumbers = msg.match(/\b(\d+)\b/g) || [];
      const answer = allNumbers.length > 0 ? allNumbers[allNumbers.length - 1] : "?";
      const { score, pass } = scoreReasoning(msg);
      return { pass, score, reasoning: msg, answer, elapsedMs: result.elapsedMs };
    } catch (e) {
      return { pass: false, score: "ERROR", reasoning: e.message, answer: "?", elapsedMs: 0 };
    }
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
    const tools = [
      {
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
      }
    ];
    const body = {
      model,
      messages: [
        { role: "system", content: "You are a helpful assistant. Use the available tools when needed." },
        { role: "user", content: "What's the weather like in Paris right now?" }
      ],
      tools,
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
        return { pass: false, score: "ERROR", hasToolCalls: false, toolCall: `fetch error: ${res.status}`, response: "", elapsedMs };
      }
      const text = await res.text();
      if (!text.trim()) throw new Error("Empty response from Ollama");
      const parsed = JSON.parse(text);
      const toolCalls = parsed?.message?.tool_calls;
      const content = parsed?.message?.content || "";
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
            elapsedMs
          };
        }
        const { score, pass } = scoreNativeToolCall(fn.name || "", args);
        return {
          pass,
          score,
          hasToolCalls: true,
          toolCall: `${fn.name}(${JSON.stringify(args)})`,
          response: content,
          elapsedMs
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
          elapsedMs
        };
      }
      return {
        pass: false,
        score: "FAIL",
        hasToolCalls: false,
        toolCall: "none",
        response: content,
        elapsedMs
      };
    } catch (e) {
      return { pass: false, score: "ERROR", hasToolCalls: false, toolCall: `error: ${e.message}`, response: "", elapsedMs: 0 };
    }
  }
  async function testToolUsageProvider(providerInfo, model) {
    const tools = [
      {
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
      }
    ];
    try {
      const result = await providerChat(providerInfo, model, [
        { role: "system", content: "You are a helpful assistant. Use the available tools when needed." },
        { role: "user", content: "What's the weather like in Paris right now?" }
      ], {
        maxTokens: CONFIG.NUM_PREDICT,
        tools,
        timeoutMs: CONFIG.PROVIDER_TOOL_TIMEOUT_MS
      });
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
      const sharedParser = pi._reactParser;
      if (sharedParser?.ALL_DIALECT_PATTERNS) {
        for (const dp of sharedParser.ALL_DIALECT_PATTERNS) {
          const result = sharedParser.parseReactWithPatterns(content, dp, true);
          if (result) {
            let toolName = result.name;
            let argsStr;
            const rawArgs = result.args ? JSON.stringify(result.args) : "";
            if (rawArgs && rawArgs !== "{}") {
              argsStr = rawArgs;
            } else if (result.raw) {
              const jsonStart = result.raw.indexOf("{");
              if (jsonStart !== -1) {
                let depth = 0, jsonEnd = -1;
                for (let i = jsonStart; i < result.raw.length; i++) {
                  if (result.raw[i] === "{") depth++;
                  else if (result.raw[i] === "}") {
                    depth--;
                    if (depth === 0) {
                      jsonEnd = i;
                      break;
                    }
                  }
                }
                argsStr = jsonEnd !== -1 ? result.raw.slice(jsonStart, jsonEnd + 1) : "";
              } else {
                argsStr = "";
              }
            } else {
              argsStr = "";
            }
            parsedResult = { name: toolName, args: argsStr, thought: result.thought || "", dialect: result.dialect };
            break;
          }
        }
      } else {
        const dialectDefs = [
          { name: "react", action: "Action:", input: "Action Input:" },
          { name: "function", action: "Function:", input: "Function Input:" },
          { name: "tool", action: "Tool:", input: "Tool Input:" },
          { name: "call", action: "Call:", input: "Input:" }
        ];
        for (const dd of dialectDefs) {
          const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const aT = esc(dd.action);
          const iT = esc(dd.input);
          const primaryRe = new RegExp(`${aT}\\s*[\\x60"']?(\\w+)[\\x60"']?\\s*\\n?\\s*${iT}\\s*([\\s\\S]*?)(?=\\n\\s*(?:Observation:|Thought:|Final Answer:|${dd.action})|$)`, "is");
          const sameRe = new RegExp(`${aT}\\s*[\\x60"']?(\\w+)[\\x60"']?\\s+${iT}\\s*([\\s\\S]*?)(?=\\n\\s*(?:Observation:|Thought:|Final Answer:|${dd.action})|$)`, "is");
          const parenRe = new RegExp(`${aT}\\s*(\\w+)\\s*\\(([^)]*)\\)`, "i");
          let m = primaryRe.exec(content) || sameRe.exec(content);
          let isParen = false;
          if (!m) {
            m = parenRe.exec(content);
            isParen = true;
          }
          if (m) {
            const toolName = m[1].trim().replace(/[`"']/g, "");
            const rawArgs = m[2].trim().replace(/^```\w*\s*/gm, "").replace(/```\s*$/gm, "").trim();
            let argsStr = "";
            if (isParen && rawArgs && !rawArgs.startsWith("{")) {
              const pairs = rawArgs.match(/(\w+)\s*:\s*("[^"]*"|'[^']*'|\S+)/g);
              if (pairs) {
                const obj = {};
                for (const p of pairs) {
                  const ci = p.indexOf(":");
                  let v = p.slice(ci + 1).trim();
                  if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
                  obj[p.slice(0, ci).trim()] = v;
                }
                argsStr = JSON.stringify(obj);
              } else {
                argsStr = rawArgs;
              }
            } else {
              const js = rawArgs.indexOf("{");
              if (js !== -1) {
                let d = 0, je = -1;
                for (let i = js; i < rawArgs.length; i++) {
                  if (rawArgs[i] === "{") d++;
                  else if (rawArgs[i] === "}") {
                    d--;
                    if (d === 0) {
                      je = i;
                      break;
                    }
                  }
                }
                argsStr = je !== -1 ? rawArgs.slice(js, je + 1) : rawArgs;
              } else {
                argsStr = rawArgs;
              }
            }
            let thought = "";
            const thoughtRe = /Thought:\s*(.*?)(?=Action:|Function:|Tool:|Call:|Final Answer:|$)/is;
            const tm = thoughtRe.exec(content);
            if (tm) thought = tm[1].trim();
            parsedResult = { name: toolName, args: argsStr, thought, dialect: dd.name };
            break;
          }
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
    const prompt = `You must respond with ONLY a valid JSON object. No markdown, no explanation, no backticks, no extra text.

The JSON object must have exactly these 4 keys:
- "name" (string): your model name
- "can_count" (boolean): true
- "sum" (number): the result of 15 + 27
- "language" (string): the language you are responding in`;
    try {
      const { response, elapsedMs } = await ollamaChat(model, [
        { role: "user", content: prompt }
      ], { num_predict: CONFIG.NUM_PREDICT });
      const msg = (response?.message?.content || "").trim();
      let parsed = null;
      let repairNote = "";
      try {
        const cleaned = msg.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        const cleaned = msg.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
        let braceDepth = 0, bracketDepth = 0;
        let inString = false, escapeNext = false;
        for (let i = 0; i < cleaned.length; i++) {
          const c = cleaned[i];
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
          const repaired = cleaned + "}".repeat(braceDepth) + "]".repeat(bracketDepth);
          try {
            parsed = JSON.parse(repaired);
            repairNote = " (repaired truncated JSON)";
          } catch {
          }
        }
      }
      if (!parsed) {
        return { pass: false, score: "FAIL", output: sanitizeForReport(msg), elapsedMs };
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
        elapsedMs
      };
    } catch (e) {
      return { pass: false, score: "ERROR", output: e.message, elapsedMs: 0 };
    }
  }
  async function testInstructionFollowingProvider(providerInfo, model) {
    const prompt = `You must respond with ONLY a valid JSON object. No markdown, no explanation, no backticks, no extra text.

The JSON object must have exactly these 4 keys:
- "name" (string): your model name
- "can_count" (boolean): true
- "sum" (number): the result of 15 + 27
- "language" (string): the language you are responding in`;
    try {
      const result = await providerChat(providerInfo, model, [
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
        let braceDepth = 0, bracketDepth = 0;
        let inString = false, escapeNext = false;
        for (let i = 0; i < cleaned.length; i++) {
          const c = cleaned[i];
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
          const repaired = cleaned + "}".repeat(braceDepth) + "]".repeat(bracketDepth);
          try {
            parsed = JSON.parse(repaired);
            repairNote = " (repaired truncated JSON)";
          } catch {
          }
        }
      }
      if (!parsed) {
        return { pass: false, score: "FAIL", output: sanitizeForReport(msg), elapsedMs: result.elapsedMs };
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
    const tools = [
      {
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
      }
    ];
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
      const timeoutId = setTimeout(() => controller.abort(), 13e4);
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
        } catch {
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
      const reactPatterns = [
        // Classic ReAct
        /^\s*Action:\s*/im,
        /^\s*Action Input:\s*/im,
        /^\s*Thought:\s*/im,
        /Action:\s*\w+/i,
        /Action Input:\s*\{/i,
        // Function dialect
        /^\s*Function:\s*/im,
        /^\s*Function Input:\s*/im,
        /Function:\s*\w+/i,
        // Tool dialect
        /^\s*Tool:\s*/im,
        /^\s*Tool Input:\s*/im,
        /Tool:\s*\w+/i,
        // Call dialect
        /^\s*Call:\s*/im,
        /^\s*Input:\s*/im,
        /Call:\s*\w+/i
      ];
      const matchedPatterns = [];
      for (const p of reactPatterns) {
        if (p.test(content)) matchedPatterns.push(p.source);
      }
      if (matchedPatterns.length > 0) {
        let dialectName = "react";
        if (/Function:/i.test(content)) dialectName = "function";
        else if (/Tool:/i.test(content)) dialectName = "tool";
        else if (/Call:/i.test(content)) dialectName = "call";
        const level2 = "react";
        cacheToolSupport(model, level2, family);
        return {
          level: level2,
          cached: false,
          evidence: `ReAct format detected (${dialectName} dialect) in text response`,
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
    } catch {
      return [];
    }
  }
  function getCurrentModel(ctx) {
    return ctx.model?.id;
  }
  function updateModelsJsonReasoning(model, hasReasoning) {
    try {
      const config = readModelsJson();
      let updated = false;
      for (const provider of Object.values(config.providers || {})) {
        const models = provider.models || [];
        for (const m of models) {
          if (m.id === model) {
            const current = m.reasoning;
            if (current === hasReasoning) {
              return { updated: false, message: `reasoning already "${hasReasoning}" for ${model} \u2014 no change` };
            }
            m.reasoning = hasReasoning;
            updated = true;
            break;
          }
        }
        if (updated) break;
      }
      if (!updated) {
        return { updated: false, message: `${model} not found in models.json \u2014 skipped` };
      }
      writeModelsJson(config);
      const action = hasReasoning ? "set reasoning: true" : "set reasoning: false";
      return { updated: true, message: `\u2705 Updated ${model}: ${action}` };
    } catch (e) {
      return { updated: false, message: `Failed to update models.json: ${e.message}` };
    }
  }
  const branding = [
    `  \u26A1 Pi Model Benchmark v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`
  ].join("\n");
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
    } catch {
    }
    const detectedFamily = detectModelFamily(model);
    lines.push(info(`Size: ${modelSize}  |  Params: ${modelParams}  |  Quant: ${modelQuant}`));
    lines.push(info(`Family: ${modelFamily}  |  Detected: ${detectedFamily}  |  Modified: ${modelModified}`));
    lines.push(section("REASONING TEST"));
    lines.push(info("Prompt: A snail climbs 3ft up a wall each day, slides 2ft back each night. Wall is 10ft. How many days?"));
    lines.push(info("Testing..."));
    const reasoning = await testReasoning(model);
    lines.push(info(`Time: ${msHuman(reasoning.elapsedMs)}`));
    if (reasoning.score === "STRONG") {
      lines.push(ok(`Answer: ${reasoning.answer} \u2014 Correct with clear reasoning (${reasoning.score})`));
    } else if (reasoning.score === "MODERATE") {
      lines.push(ok(`Answer: ${reasoning.answer} \u2014 Correct but weak reasoning (${reasoning.score})`));
    } else if (reasoning.score === "WEAK") {
      lines.push(fail(`Answer: ${reasoning.answer} \u2014 Reasoned but wrong answer (${reasoning.score})`));
    } else if (reasoning.score === "FAIL") {
      lines.push(fail(`Answer: ${reasoning.answer} \u2014 No reasoning detected (${reasoning.score})`));
    } else {
      const errMsg = reasoning.reasoning.includes("<!DOCTYPE") || reasoning.reasoning.includes("<html") ? reasoning.reasoning.split("\n")[0].slice(0, 100) + "..." : truncate(reasoning.reasoning, 300);
      lines.push(fail(`Error: ${errMsg}`));
    }
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
    if (tools.score === "STRONG") {
      lines.push(ok(`Tool call: ${tools.toolCall} (${tools.score})`));
      if (tools.response) {
        lines.push(info(`Raw response: ${sanitizeForReport(tools.response)}`));
      }
    } else if (tools.score === "MODERATE") {
      lines.push(ok(`Tool call: ${tools.toolCall} (${tools.score})`));
      if (tools.response) {
        lines.push(info(`Raw response: ${sanitizeForReport(tools.response)}`));
      }
    } else if (tools.score === "WEAK") {
      lines.push(warn(`Tool call: ${tools.toolCall} (${tools.score}) \u2014 malformed call`));
      if (tools.response) {
        lines.push(info(`Raw response: ${sanitizeForReport(tools.response)}`));
      }
    } else if (tools.score === "FAIL") {
      const hasResponse = tools.response && tools.response.trim().length > 0;
      lines.push(fail(`Tool call: none \u2014 ${hasResponse ? "model responded in text instead" : "model returned empty response"} (${tools.score})`));
      if (hasResponse) {
        lines.push(info(`Text response: ${sanitizeForReport(tools.response)}`));
      } else {
        lines.push(info("Text response: (empty)"));
      }
    } else {
      lines.push(fail(`Error: ${tools.toolCall}`));
    }
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
    if (instructions.score === "STRONG") {
      lines.push(ok(`JSON output valid with correct values (${instructions.score})`));
    } else if (instructions.score === "MODERATE") {
      lines.push(ok(`JSON output valid but some values incorrect (${instructions.score})`));
    } else if (instructions.score === "WEAK") {
      lines.push(warn(`Partial JSON compliance (${instructions.score})`));
    } else {
      lines.push(fail(`Failed to produce valid JSON (${instructions.score})`));
    }
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
    lines.push(section("SUMMARY"));
    const totalMs = Date.now() - totalStart;
    const toolPass = tools.score === "STRONG" || tools.score === "MODERATE";
    const reactPass = react.score === "STRONG" || react.score === "MODERATE";
    const tests = [
      { name: "Reasoning", pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", score: reasoning.score },
      { name: "Thinking", pass: thinking.supported, score: thinking.supported ? "YES" : "NO" },
      { name: "Tool Usage", pass: toolPass, score: tools.score },
      { name: "ReAct Parse", pass: reactPass, score: react.score },
      { name: "Instructions", pass: instructions.pass, score: instructions.score },
      { name: "Tool Support", pass: toolSupport.level === "native" || toolSupport.level === "react", score: toolSupport.level.toUpperCase() }
    ];
    const passed = tests.filter((t) => t.pass).length;
    const total = tests.length;
    for (const t of tests) {
      lines.push(t.pass ? ok(`${t.name}: ${t.score}`) : fail(`${t.name}: ${t.score}`));
    }
    lines.push(info(`Total time: ${msHuman(totalMs)}`));
    lines.push(info(`Score: ${passed}/${total} tests passed`));
    lines.push(section("RECOMMENDATION"));
    if (passed === 6) {
      lines.push(ok(`${model} is a STRONG model \u2014 full capability`));
    } else if (passed >= 5) {
      lines.push(ok(`${model} is a GOOD model \u2014 most capabilities work`));
    } else if (passed >= 4) {
      lines.push(warn(`${model} is USABLE \u2014 some capabilities are limited`));
    } else {
      lines.push(fail(`${model} is WEAK \u2014 limited capabilities for agent use`));
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
    if (reasoning.score === "STRONG") {
      lines.push(ok(`Answer: ${reasoning.answer} \u2014 Correct with clear reasoning (${reasoning.score})`));
    } else if (reasoning.score === "MODERATE") {
      lines.push(ok(`Answer: ${reasoning.answer} \u2014 Correct but weak reasoning (${reasoning.score})`));
    } else if (reasoning.score === "WEAK") {
      lines.push(fail(`Answer: ${reasoning.answer} \u2014 Reasoned but wrong answer (${reasoning.score})`));
    } else if (reasoning.score === "FAIL") {
      lines.push(fail(`Answer: ${reasoning.answer} \u2014 No reasoning detected (${reasoning.score})`));
    } else {
      const errMsg = reasoning.reasoning.includes("<!DOCTYPE") || reasoning.reasoning.includes("<html") ? reasoning.reasoning.split("\n")[0].slice(0, 100) + "..." : truncate(reasoning.reasoning, 300);
      lines.push(fail(`Error: ${errMsg}`));
    }
    lines.push(info(`Response: ${sanitizeForReport(reasoning.reasoning)}`));
    lines.push(section("INSTRUCTION FOLLOWING TEST"));
    lines.push(info("Prompt: Respond with ONLY a JSON object with keys: name, can_count, sum (15+27), language"));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);
    const instructions = await testInstructionFollowingProvider(providerInfo, model);
    lines.push(info(`Time: ${msHuman(instructions.elapsedMs)}`));
    if (instructions.score === "STRONG") {
      lines.push(ok(`JSON output valid with correct values (${instructions.score})`));
    } else if (instructions.score === "MODERATE") {
      lines.push(ok(`JSON output valid but some values incorrect (${instructions.score})`));
    } else if (instructions.score === "WEAK") {
      lines.push(warn(`Partial JSON compliance (${instructions.score})`));
    } else {
      lines.push(fail(`Failed to produce valid JSON (${instructions.score})`));
    }
    lines.push(info(`Output: ${sanitizeForReport(instructions.output)}`));
    lines.push(section("TOOL USAGE TEST"));
    lines.push(info(`Prompt: "What's the weather in Paris?" (with get_weather tool available)`));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);
    const toolTest = await testToolUsageProvider(providerInfo, model);
    lines.push(info(`Time: ${msHuman(toolTest.elapsedMs)}`));
    if (toolTest.score === "STRONG") {
      lines.push(ok(`Tool call: ${toolTest.toolCall} (${toolTest.score})`));
      if (toolTest.response) {
        lines.push(info(`Raw response: ${sanitizeForReport(toolTest.response)}`));
      }
    } else if (toolTest.score === "MODERATE") {
      lines.push(ok(`Tool call: ${toolTest.toolCall} (${toolTest.score})`));
      if (toolTest.response) {
        lines.push(info(`Raw response: ${sanitizeForReport(toolTest.response)}`));
      }
    } else if (toolTest.score === "WEAK") {
      lines.push(warn(`Tool call: ${toolTest.toolCall} (${toolTest.score}) \u2014 malformed call`));
      if (toolTest.response) {
        lines.push(info(`Raw response: ${sanitizeForReport(toolTest.response)}`));
      }
    } else if (toolTest.score === "FAIL") {
      const hasResponse = toolTest.response && toolTest.response.trim().length > 0;
      lines.push(fail(`Tool call: none \u2014 ${hasResponse ? "model responded in text instead" : "model returned empty response"} (${toolTest.score})`));
      if (hasResponse) {
        lines.push(info(`Text response: ${sanitizeForReport(toolTest.response)}`));
      } else {
        lines.push(info("Text response: (empty)"));
      }
    } else {
      lines.push(fail(`Error: ${toolTest.toolCall}`));
    }
    lines.push(section("SKIPPED TESTS (OLLAMA-ONLY)"));
    lines.push(warn("Thinking test \u2014 Ollama-specific think:true option and message.thinking field"));
    lines.push(warn("ReAct parsing test \u2014 only relevant for Ollama models without native tool calling"));
    lines.push(warn("Tool support detection \u2014 Ollama-specific tool support cache"));
    lines.push(warn("Model metadata \u2014 Ollama-specific /api/tags endpoint"));
    lines.push(section("SUMMARY"));
    const totalMs = Date.now() - totalStart;
    const tests = [
      { name: "Connectivity", pass: connectivity.pass, score: connectivity.pass ? "OK" : "FAIL" },
      { name: "Reasoning", pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", score: reasoning.score },
      { name: "Instructions", pass: instructions.pass, score: instructions.score },
      { name: "Tool Usage", pass: toolTest.pass, score: toolTest.score }
    ];
    const passed = tests.filter((t) => t.pass).length;
    const total = tests.length;
    for (const t of tests) {
      lines.push(t.pass ? ok(`${t.name}: ${t.score}`) : fail(`${t.name}: ${t.score}`));
    }
    lines.push(info(`Total time: ${msHuman(totalMs)}`));
    lines.push(info(`Score: ${passed}/${total} tests passed`));
    lines.push(section("RECOMMENDATION"));
    if (passed === 4) {
      lines.push(ok(`${model} is a STRONG model via ${providerInfo.name} \u2014 full capability`));
    } else if (passed >= 3) {
      lines.push(ok(`${model} is a GOOD model via ${providerInfo.name} \u2014 most capabilities work`));
    } else if (passed >= 2) {
      lines.push(warn(`${model} is USABLE via ${providerInfo.name} \u2014 some capabilities are limited`));
    } else {
      lines.push(fail(`${model} is WEAK via ${providerInfo.name} \u2014 limited capabilities for agent use`));
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
    description: "Test a model for reasoning, thinking, tool usage, ReAct parsing, instruction following, and tool support level. Supports both Ollama and cloud providers. Use: /model-test [model] or /model-test --all",
    getArgumentCompletions: async (prefix) => {
      try {
        const models = await getOllamaModels();
        return models.map((m) => ({ label: m, description: `Test ${m}` })).filter((m) => m.label.startsWith(prefix));
      } catch {
        return [];
      }
    },
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("model-test requires TUI mode", "error");
        return;
      }
      const arg = args.trim();
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
        } catch {
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
        ctx.ui.notify(`Model test failed: ${e.message}`, "error");
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
        return {
          content: [{ type: "text", text: `Model test failed: ${e.message}` }],
          isError: true
        };
      }
    }
  });
}
export {
  model_test_temp_default as default
};
