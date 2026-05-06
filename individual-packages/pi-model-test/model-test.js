// .build-npm/model-test/model-test.temp.ts
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
import { getOllamaBaseUrl, detectModelFamily, readModelsJson, readModifyWriteModelsJson, fetchModelContextLength, detectProvider } from "@vtstech/pi-shared/ollama";
import { debugLog } from "@vtstech/pi-shared/debug";
import {
  ALL_DIALECT_PATTERNS,
  parseReactWithPatterns,
  detectReactDialect,
  extractBraceJson
} from "@vtstech/pi-shared/react-parser";
import {
  CONFIG,
  WEATHER_TOOL_DEFINITION,
  scoreReasoning,
  getCachedToolSupport,
  cacheToolSupport,
  getEffectiveConfig,
  appendTestHistory,
  detectRegression,
  testToolUsageUnified,
  testReasoningUnified,
  testInstructionFollowingUnified,
  TOOL_SUPPORT_CACHE_PATH
} from "@vtstech/pi-shared/model-test-utils";
import {
  branding as sharedBranding,
  formatTestSummary,
  formatRecommendation
} from "@vtstech/pi-shared/test-report";
function model_test_temp_default(pi) {
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
    lines.push(sharedBranding);
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
    lines.push(sharedBranding);
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
    description: "Test a model for reasoning, thinking, tool usage, ReAct parsing, instruction following, and tool support level. Supports both Ollama and cloud providers. Use: /model-test [model] or /model-test --all",
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
