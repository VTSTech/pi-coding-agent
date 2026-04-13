import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";

// ── Shared imports ───────────────────────────────────────────────────────
import {
  section, ok, fail, warn, info,
  msHuman, truncate, sanitizeForReport,
} from "../shared/format";
import { getOllamaBaseUrl, MODELS_JSON_PATH, detectModelFamily, readModelsJson, writeModelsJson, BUILTIN_PROVIDERS, fetchModelContextLength, EXTENSION_VERSION, detectProvider, type ProviderInfo } from "../shared/ollama";
import type { ToolSupportLevel } from "../shared/types";
import {
  ALL_DIALECT_PATTERNS,
  parseReactWithPatterns,
  detectReactDialect,
  extractBraceJson,
} from "../shared/react-parser";
import {
  CONFIG,
  WEATHER_TOOL_DEFINITION,
  scoreReasoning,
  scoreNativeToolCall,
  scoreTextToolCall,
  parseTextToolCall,
  readToolSupportCache,
  writeToolSupportCache,
  getCachedToolSupport,
  cacheToolSupport,
  readTestConfig,
  getEffectiveConfig,
  readTestHistory,
  appendTestHistory,
  detectRegression,
  type ChatFn,
  type ReasoningTestResult,
  type ToolUsageTestResult,
  type InstructionFollowingTestResult,
  type TestHistoryEntry,
  testToolUsageUnified,
  testReasoningUnified,
  testInstructionFollowingUnified,
  TOOL_SUPPORT_CACHE_PATH,
} from "../shared/model-test-utils";

/**
 * Model testing extension for Pi Coding Agent.
 * Tests models for reasoning/thinking ability, tool usage capability,
 * instruction following, and tool support level.
 *
 * Supports both Ollama (local/remote) and built-in cloud providers
 * (OpenRouter, Anthropic, Google, OpenAI, Groq, etc.).
 *
 * Usage:
 *   /model-test              — test the current Pi model
 *   /model-test qwen3:0.6b   — test a specific model
 *   /model-test --all        — test all models (Ollama only)
 */
export default function (pi: ExtensionAPI) {

  // Use effective config (user overrides merged with defaults)
  const effectiveConfig = getEffectiveConfig();

  // ── helpers ──────────────────────────────────────────────────────────

  /**
   * Get the current Ollama base URL.
   * Re-reads on every call so /ollama-sync changes take effect immediately.
   */
  function ollamaBase(): string {
    return getOllamaBaseUrl();
  }

  /**
   * Sleep for the configured test delay to avoid rate limiting.
   * Returns the delay message line to append to the report.
   */
  async function rateLimitDelay(lines: string[]): Promise<void> {
    if (effectiveConfig.TEST_DELAY_MS > 0) {
      lines.push(info(`Waiting ${msHuman(effectiveConfig.TEST_DELAY_MS)} to avoid rate limiting...`));
      await new Promise(r => setTimeout(r, effectiveConfig.TEST_DELAY_MS));
    }
  }

  // ── ChatFn wrappers ──────────────────────────────────────────────────

  /**
   * Wrap ollamaChat into the ChatFn interface.
   * Does NOT support tools (for reasoning, instruction following tests).
   */
  function makeOllamaChatFn(useStreaming = true): ChatFn {
    return async (model, messages, _options) => {
      const chatFn = useStreaming ? ollamaChatStream : ollamaChat;
      const result = await chatFn(model, messages);
      return {
        content: result.response?.message?.content || "",
        elapsedMs: result.elapsedMs,
        raw: result.response,
      };
    };
  }

  /**
   * Wrap Ollama /api/chat into the ChatFn interface WITH tool support.
   * Does a raw fetch so tools are at the top level of the request body
   * (Ollama API requires this, unlike providerChat which handles it).
   */
  function makeOllamaToolChatFn(): ChatFn {
    return async (model, messages, options) => {
      const tools = (options?.tools as any[] | undefined) || undefined;
      const body: any = {
        model,
        messages,
        stream: false,
        options: { num_predict: CONFIG.NUM_PREDICT, temperature: CONFIG.TEMPERATURE },
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
          signal: controller.signal,
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
          toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
          elapsedMs,
          raw: parsed,
        };
      } catch (e: any) {
        clearTimeout(timeoutId);
        throw e;
      }
    };
  }

  /**
   * Wrap providerChat into the ChatFn interface.
   * Supports tools natively.
   */
  function makeProviderChatFn(providerInfo: ProviderInfo): ChatFn {
    return async (model, messages, options) => {
      const result = await providerChat(providerInfo, model, messages, {
        maxTokens: CONFIG.NUM_PREDICT,
        tools: (options?.tools as any[] | undefined),
        timeoutMs: CONFIG.PROVIDER_TOOL_TIMEOUT_MS,
      });
      return {
        content: result.content,
        toolCalls: result.toolCalls,
        elapsedMs: result.elapsedMs,
        raw: undefined,
      };
    };
  }

  /**
   * Call Ollama /api/chat and return the parsed response.
   * Uses native fetch() — no curl subprocess.
   */
  async function ollamaChat(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: Record<string, unknown> = {},
    timeoutMs = CONFIG.DEFAULT_TIMEOUT_MS,
    retries = CONFIG.MAX_RETRIES
  ): Promise<{ response: any; elapsedMs: number }> {
    const body: any = { model, messages, stream: false, options: { num_predict: CONFIG.NUM_PREDICT, temperature: CONFIG.TEMPERATURE, ...options } };
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
          signal: controller.signal,
        });
        const elapsedMs = Date.now() - start;

        if (!res.ok) {
          const errorText = await res.text().catch(() => "unknown error");
          throw new Error(`Ollama API returned ${res.status}: ${truncate(errorText, 200)}`);
        }

        const text = await res.text();
        if (!text.trim()) {
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS));
            continue;
          }
          throw new Error(`Empty response from Ollama after ${attempt + 1} attempt(s)`);
        }
        const parsed = JSON.parse(text);
        return { response: parsed, elapsedMs };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (e instanceof Error && e.name === "AbortError") {
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS));
            continue;
          }
          throw new Error(`Ollama API timed out after ${msHuman(timeoutMs)}`);
        }
        if (attempt < retries && (
          msg.includes("Empty response") || msg.includes("ECONNREFUSED") ||
          msg.includes("ECONNRESET") || msg.includes("fetch failed")
        )) {
          await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS));
          continue;
        }
        throw e;
      } finally {
        clearTimeout(timeoutId);
      }
    }
    throw new Error("Unreachable");
  }

  /**
   * Call Ollama /api/chat with streaming enabled.
   * Accumulates response chunks for progressive processing.
   * Returns the complete response once all chunks are received.
   *
   * Streaming provides:
   * - Earlier timeout detection (first token arrives quickly)
   * - Real-time progress feedback potential
   * - Reduced memory pressure for very long responses
   */
  async function ollamaChatStream(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: Record<string, unknown> = {},
    timeoutMs = CONFIG.DEFAULT_TIMEOUT_MS,
  ): Promise<{ response: any; elapsedMs: number }> {
    const body: any = { model, messages, stream: true, options: { num_predict: CONFIG.NUM_PREDICT, temperature: CONFIG.TEMPERATURE, ...options } };
    const url = `${ollamaBase()}/api/chat`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const start = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "unknown error");
        throw new Error(`Ollama API returned ${res.status}: ${truncate(errorText, 200)}`);
      }

      if (!res.body) {
        throw new Error("Ollama streaming response has no body");
      }

      // Accumulate streaming response
      let messageContent = "";
      let thinkingContent = "";
      let done = false;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;

        const chunk = decoder.decode(value, { stream: true });
        // Ollama sends NDJSON — each line is a complete JSON object
        const lines = chunk.split("\n").filter((line: string) => line.trim().length > 0);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) messageContent += parsed.message.content;
            if (parsed.message?.thinking) thinkingContent += parsed.message.thinking;
            if (parsed.done) done = true;
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }

      const elapsedMs = Date.now() - start;

      if (!messageContent.trim() && !thinkingContent.trim()) {
        throw new Error("Empty streaming response from Ollama");
      }

      // Construct a response object compatible with the non-streaming format
      const response = {
        message: {
          content: messageContent,
          thinking: thinkingContent,
          role: "assistant",
        },
        done: true,
      };

      return { response, elapsedMs };
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`Ollama API timed out after ${msHuman(timeoutMs)}`);
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Provider Chat (OpenAI-compatible) ───────────────────────────────

  /**
   * Call a cloud provider's chat completions API (OpenAI-compatible format).
   * Uses native fetch() — not curl.
   *
   * Returns a normalized response with content, optional tool_calls, and elapsedMs.
   */
  async function providerChat(
    providerInfo: ProviderInfo,
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: {
      maxTokens?: number;
      temperature?: number;
      tools?: any[];
      timeoutMs?: number;
    } = {},
  ): Promise<{ content: string; toolCalls?: any[]; elapsedMs: number; usage?: any }> {
    const { baseUrl, apiKey } = providerInfo;
    const maxTokens = options.maxTokens ?? CONFIG.NUM_PREDICT;
    const temperature = options.temperature ?? CONFIG.TEMPERATURE;
    const timeoutMs = options.timeoutMs ?? CONFIG.PROVIDER_TIMEOUT_MS;

    if (!baseUrl) throw new Error(`No base URL for provider "${providerInfo.name}"`);
    if (!apiKey) throw new Error(`No API key for provider "${providerInfo.name}". Set ${providerInfo.envKey || "the appropriate env var"}.`);

    const url = `${baseUrl}/chat/completions`;
    const body: any = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: false,
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
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
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
      const toolCalls = message.tool_calls || undefined;

      return {
        content,
        toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
        elapsedMs,
        usage: data.usage,
      };
    } catch (e: any) {
      const elapsedMs = Date.now() - start;
      if (e.name === "AbortError") {
        throw new Error(`Provider API timed out after ${msHuman(elapsedMs)}`);
      }
      throw e;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── test: connectivity (provider only) ──────────────────────────────

  /**
   * Test basic connectivity to a cloud provider's API.
   * Sends a minimal request and verifies the API is reachable and the key is valid.
   */
  async function testConnectivity(
    providerInfo: ProviderInfo,
    model: string,
  ): Promise<{
    pass: boolean;
    reachable: boolean;
    authValid: boolean;
    modelName: string;
    elapsedMs: number;
    error?: string;
  }> {
    try {
      const start = Date.now();
      const result = await providerChat(providerInfo, model, [
        { role: "user", content: "Reply with exactly: PONG" },
      ], { maxTokens: 10, timeoutMs: 30000 });
      const elapsedMs = Date.now() - start;

      const reachable = true;
      const authValid = true; // If we got here, the key is valid

      return {
        pass: reachable && authValid,
        reachable,
        authValid,
        modelName: model,
        elapsedMs,
      };
    } catch (e: any) {
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
        authValid = true; // Key works, model name might be wrong
      } else {
        // Unknown error — assume reachable but check
        reachable = true;
        authValid = false;
      }

      return {
        pass: false,
        reachable,
        authValid,
        modelName: model,
        elapsedMs: 0,
        error: msg,
      };
    }
  }

  // ── test: reasoning (Ollama) ────────────────────────────────────────

  /**
   * Test if a model can reason through a logic puzzle.
   * Ollama-specific: handles thinking models that need think:true fallback.
   * Returns { pass, reasoning, answer, elapsedMs }
   */
  async function testReasoning(model: string): Promise<{
    pass: boolean;
    score: string;
    reasoning: string;
    answer: string;
    elapsedMs: number;
  }> {
    const prompt = `A snail climbs 3 feet up a wall each day, but slides back 2 feet each night. The wall is 10 feet tall. How many days does it take the snail to reach the top? Think step by step and give the final answer on its own line like: ANSWER: <number>`;

    try {
      // Try normal request first; if it returns empty (common for thinking models like qwen3),
      // retry with think:true enabled
      let response: any, elapsedMs: number;

      try {
        const result = await ollamaChat(model, [
          { role: "user", content: prompt },
        ]);
        response = result.response;
        elapsedMs = result.elapsedMs;

        // If the model returned completely empty, it may be a thinking model
        // that requires think:true to produce any output
        const msg = response?.message?.content || "";
        const thinking = response?.message?.thinking || "";
        if (msg.trim().length === 0 && thinking.trim().length === 0) {
          throw new Error("empty — will retry with thinking");
        }
      } catch (firstErr: any) {
        if (firstErr.message?.includes("empty — will retry with thinking")) {
          // Retry with think:true for thinking models (qwen3, etc.)
          const retry = await ollamaChat(model, [
            { role: "user", content: prompt },
          ], { think: true } as any);
          response = retry.response;
          elapsedMs = retry.elapsedMs;
        } else {
          throw firstErr;
        }
      }

      let msg = response?.message?.content || "";
      const thinking = response?.message?.thinking || "";

      // If the model uses thinking tokens but produced no regular content,
      // fall back to extracting from the thinking content
      const effectiveMsg = msg.trim().length > 0 ? msg : thinking;
      if (effectiveMsg.trim().length === 0) {
        return { pass: false, score: "ERROR", reasoning: "Empty response from Ollama (no content or thinking tokens)", answer: "?", elapsedMs };
      }

      // Extract the answer using the shared scoring helper
      const allNumbers = effectiveMsg.match(/\b(\d+)\b/g) || [];
      const answer = allNumbers.length > 0 ? allNumbers[allNumbers.length - 1] : "?";
      const { score, pass } = scoreReasoning(effectiveMsg);

      // Use effectiveMsg for display; note if it came from thinking tokens
      const displayMsg = msg.trim().length > 0
        ? effectiveMsg
        : `[thinking tokens] ${effectiveMsg}`;
      return { pass, score, reasoning: displayMsg, answer, elapsedMs };
    } catch (e: any) {
      return { pass: false, score: "ERROR", reasoning: e.message, answer: "?", elapsedMs: 0 };
    }
  }

  // ── test: reasoning (provider) ──────────────────────────────────────

  /**
   * Provider-aware reasoning test. Delegates to the unified testReasoningUnified.
   */
  async function testReasoningProvider(
    providerInfo: ProviderInfo,
    model: string,
  ): Promise<ReasoningTestResult> {
    return testReasoningUnified(makeProviderChatFn(providerInfo), model);
  }

  // ── test: thinking (Ollama-only) ────────────────────────────────────

  /**
   * Test if a model supports thinking/reasoning tokens (extended thinking).
   * Sends a prompt and checks if the response includes thinking content.
   */
  async function testThinking(model: string): Promise<{
    supported: boolean;
    thinkingContent: string;
    answerContent: string;
    elapsedMs: number;
  }> {
    const prompt = "Multiply 37 by 43. Explain your reasoning step by step and give the final answer.";

    try {
      // Request thinking tokens to test if model supports extended thinking
      const { response, elapsedMs } = await ollamaChat(model, [
        { role: "user", content: prompt },
      ], { think: true } as any);

      const msg = response?.message?.content || "";
      const thinking = response?.message?.thinking || "";
      const hasThinking = !!thinking && thinking.length > CONFIG.MIN_THINKING_LENGTH;

      // Also check if model outputs <think tags
      const thinkTagMatch = msg.match(/<think[^>]*>([\s\S]*?)<\/think>/i);
      const hasThinkTags = !!thinkTagMatch;

      return {
        supported: hasThinking || hasThinkTags,
        thinkingContent: hasThinking ? thinking
          : hasThinkTags ? thinkTagMatch![1]
          : "none",
        answerContent: hasThinkTags ? msg.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, "").trim() : msg,
        elapsedMs,
      };
    } catch (e: any) {
      return { supported: false, thinkingContent: `error: ${e.message}`, answerContent: "", elapsedMs: 0 };
    }
  }

  // ── test: tool usage (Ollama) ────────────────────────────────────────

  /**
   * Test if a model can generate proper tool calls via Ollama's tool API.
   * Delegates to the unified testToolUsageUnified via makeOllamaToolChatFn.
   */
  async function testToolUsage(model: string): Promise<ToolUsageTestResult> {
    return testToolUsageUnified(makeOllamaToolChatFn(), model);
  }

  // ── test: tool usage (Provider) ──────────────────────────────────────

  /**
   * Test if a cloud provider model can generate proper tool calls.
   * Delegates to the unified testToolUsageUnified via makeProviderChatFn.
   */
  async function testToolUsageProvider(
    providerInfo: ProviderInfo,
    model: string,
  ): Promise<ToolUsageTestResult> {
    return testToolUsageUnified(makeProviderChatFn(providerInfo), model);
  }

  // ── test: ReAct parsing (Ollama-only) ──────────────────────────────

  /**
   * Test whether a model can produce parseable ReAct-format tool calls
   * (without native tool_calls API). This tests the text-based
   * "Action:" / "Action Input:" format that react-fallback.ts parses.
   *
   * Results are cached to ~/.pi/agent/cache/react_support.json to avoid
   * re-probing models on every run.
   */
  async function testReactParsing(model: string): Promise<{
    pass: boolean;
    score: string;
    toolCall: string;
    thought: string;
    response: string;
    elapsedMs: number;
    dialect?: string;  // which ReAct dialect the model used
  }> {
    // ReAct prompt — NO tools in the request, force model to use text format
    // The prompt uses the classic "Action:" / "Action Input:" format but models
    // may respond with any dialect (Function:, Tool:, Call:, etc.)
    const systemPrompt = [
      "You are a helpful assistant with access to tools.",
      "When you need to use a tool, you MUST output in this EXACT format:",
      "Thought: <your reasoning about what to do>",
      "Action: <tool_name>",
      "Action Input: <JSON object with arguments>",
      "Do NOT output anything after the Action Input line.",
      "The available tools are: get_weather (parameters: location: string), calculate (parameters: expression: string).",
    ].join("\n");

    const body: any = {
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "What's the weather like in Tokyo? Use the get_weather tool." },
      ],
      stream: false,
      options: { num_predict: CONFIG.NUM_PREDICT, temperature: CONFIG.TEMPERATURE },
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.TOOL_TEST_TIMEOUT_MS);
      const start = Date.now();
      const res = await fetch(`${ollamaBase()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
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

      // ── Multi-dialect ReAct parsing ──
      // Try all registered ReAct dialects (Action:, Function:, Tool:, Call:, etc.)
      // Uses the shared parser from react-fallback.ts via pi._reactParser if available,
      // otherwise falls back to a local inline multi-dialect implementation.
      let parsedResult: { name: string; args: string; thought: string; dialect?: string } | null = null;
      // Try using the shared parser from react-fallback extension
      const sharedParser = (pi as any)._reactParser;
      if (sharedParser?.ALL_DIALECT_PATTERNS) {
        for (const dp of sharedParser.ALL_DIALECT_PATTERNS) {
          // Use parseReactWithPatterns in tight mode (reject natural language)
          const result = sharedParser.parseReactWithPatterns(content, dp, true);
          if (result) {
            let toolName = result.name;
            // Extract args as string
            let argsStr: string;
            const rawArgs = result.args ? JSON.stringify(result.args) : "";
            if (rawArgs && rawArgs !== "{}") {
              argsStr = rawArgs;
            } else if (result.raw) {
              // Try to extract JSON from raw match
              argsStr = extractBraceJson(result.raw);
            } else {
              argsStr = "";
            }
            parsedResult = { name: toolName, args: argsStr, thought: result.thought || "", dialect: result.dialect };
            break;
          }
        }
      } else {
        // Fallback: use shared react-parser module directly
        for (const dp of ALL_DIALECT_PATTERNS) {
          const result = parseReactWithPatterns(content, dp, true);
          if (result) {
            let argsStr: string;
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
      }
      if (parsedResult) {
        let { name: toolName, args: argsStr, thought, dialect } = parsedResult;
        const argsParsed = argsStr.length > 0;
        // Score: correct tool name + valid args = STRONG, correct tool = MODERATE, wrong tool = WEAK (fail)
        let score: string;
        const isWeatherTool = toolName.toLowerCase().includes("get_weather") || toolName.toLowerCase() === "get_weather";
        if (isWeatherTool && argsParsed) {
          score = "STRONG";
        } else if (isWeatherTool) {
          score = "MODERATE";
        } else {
          score = "WEAK";
        }
        // WEAK = wrong tool entirely → not a meaningful pass
        const pass = score !== "WEAK";
        return {
          pass,
          score,
          toolCall: `${toolName}(${argsStr})`,
          thought,
          response: content,
          elapsedMs,
          dialect: dialect || "react",
        };
      }
      // No ReAct patterns found — check if model tried some other format
      // Check for alternative tag-based dialects that might have been missed
      const altTagPatterns = [
        /^\s*Function:\s*/im,
        /^\s*Tool:\s*/im,
        /^\s*Call:\s*/im,
        /<function_call/i,
        /<invoke\s/i,
      ];
      const hasAltTag = altTagPatterns.some(p => p.test(content));
      const hasToolMention = /\bget_weather\b/i.test(content) || /\btool\b/i.test(content);
      if (hasAltTag || hasToolMention) {
        const detail = hasAltTag
          ? "model used alternative tool-call tags but format was not parseable"
          : "model mentioned tool but not in ReAct format";
        return {
          pass: false,
          score: "FAIL",
          toolCall: `none — ${detail}`,
          thought: "",
          response: content,
          elapsedMs,
        };
      }
      return {
        pass: false,
        score: "FAIL",
        toolCall: "none",
        thought: "",
        response: content,
        elapsedMs,
      };
    } catch (e: any) {
      return { pass: false, score: "ERROR", toolCall: `error: ${e.message}`, thought: "", response: "", elapsedMs: 0 };
    }
  }

  // ── test: instruction following (Ollama) ────────────────────────────

  /**
   * Test basic instruction following (format compliance, role awareness).
   * Delegates to the unified testInstructionFollowingUnified via makeOllamaChatFn.
   */
  async function testInstructionFollowing(model: string): Promise<InstructionFollowingTestResult> {
    return testInstructionFollowingUnified(makeOllamaChatFn(), model);
  }

  // ── test: instruction following (Provider) ──────────────────────────

  /**
   * Provider-aware instruction following test.
   * Delegates to the unified testInstructionFollowingUnified via makeProviderChatFn.
   */
  async function testInstructionFollowingProvider(
    providerInfo: ProviderInfo,
    model: string,
  ): Promise<InstructionFollowingTestResult> {
    return testInstructionFollowingUnified(makeProviderChatFn(providerInfo), model);
  }

  // ── test: tool support detection (Ollama-only) ──────────────────────

  /**
   * Detect what level of tool support a model provides.
   * Ported from AgentNova core/tool_cache.py + core/tool_parse.py.
   *
   * Levels:
   *   - "native": Model returns tool_calls in the API response (structured tool calling)
   *   - "react":   Model outputs "Action:" / "Action Input:" patterns (ReAct format)
   *   - "none":    No tool support detected
   *
   * Results are cached to ~/.pi/agent/cache/tool_support.json to avoid
   * re-probing models on every run.
   */
  async function testToolSupport(
    model: string,
    family: string
  ): Promise<{
    level: ToolSupportLevel;
    cached: boolean;
    evidence: string;
    elapsedMs: number;
  }> {
    // 1. Check cache first
    const cached = getCachedToolSupport(model);
    if (cached) {
      return {
        level: cached.support,
        cached: true,
        evidence: `cached (tested ${cached.testedAt})`,
        elapsedMs: 0,
      };
    }

    // 2. Probe the model with a tool-calling prompt
    const tools = [WEATHER_TOOL_DEFINITION];

    const body: any = {
      model,
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant with access to tools. When you need to look up information, use the available tools. Always use tools when asked about real-time data like weather.",
        },
        { role: "user", content: "What's the weather like in Tokyo right now? Use the get_weather tool to find out." },
      ],
      tools,
      stream: false,
      options: { num_predict: 1024, temperature: 0.1 },
    };

    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), effectiveConfig.TOOL_SUPPORT_TIMEOUT_MS);
      const res = await fetch(`${ollamaBase()}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const elapsedMs = Date.now() - start;
      clearTimeout(timeoutId);

      if (!res.ok) {
        const detail = await res.text().catch(() => "unknown error");
        const level: ToolSupportLevel = "none";
        cacheToolSupport(model, level, family);
        return { level, cached: false, evidence: `API error ${res.status}: ${truncate(detail, 100)}`, elapsedMs };
      }

      const text = await res.text();
      if (!text.trim()) {
        const level: ToolSupportLevel = "none";
        cacheToolSupport(model, level, family);
        return { level, cached: false, evidence: "empty response from Ollama", elapsedMs };
      }

      const parsed = JSON.parse(text);
      const toolCalls = parsed?.message?.tool_calls;
      const content = (parsed?.message?.content || "").trim();

      // ── Check native tool support ────────────────────────────────
      // Native: the API response contains tool_calls array
      if (toolCalls && Array.isArray(toolCalls) && toolCalls.length > 0) {
        const fn = toolCalls[0].function || {};
        const fnName = fn.name || "unknown";
        let argsStr: string;
        try {
          const args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : (fn.arguments || {});
          argsStr = JSON.stringify(args);
        } catch {
          argsStr = String(fn.arguments);
        }
        const level: ToolSupportLevel = "native";
        cacheToolSupport(model, level, family);
        return {
          level,
          cached: false,
          evidence: `API returned tool_calls: ${fnName}(${argsStr})`,
          elapsedMs,
        };
      }

      // ── Check ReAct format (multi-dialect) ──────────────────────
      // Use the shared detectReactDialect() from react-parser module.
      // This checks ALL registered dialects (Action:, Function:, Tool:, Call:, etc.)
      // and keeps them in sync with the canonical source.
      const detectedDialect = detectReactDialect(content);

      if (detectedDialect) {
        const level: ToolSupportLevel = "react";
        cacheToolSupport(model, level, family);
        return {
          level,
          cached: false,
          evidence: `ReAct format detected (${detectedDialect.name} dialect) in text response`,
          elapsedMs,
        };
      }

      // ── Check for text-based tool invocation (softer signal) ─────
      // Some models output tool-like JSON or structured calls in text.
      // Strip code fences first so they don't interfere with pattern matching.
      const strippedContent = content.replace(/^\s*```\w*\s*/gm, "").replace(/```\s*$/gm, "").trim();

      const textToolPatterns = [
        /\bget_weather\b/i,                    // Model mentions the tool name
        /\bfunction_call\b/i,                  // Explicit function call marker
        /\btool_call\b/i,                      // Explicit tool call marker
        /"name"\s*:\s*"get_weather"/,          // JSON with tool name
      ];

      const hasTextToolSignal = textToolPatterns.some(p => p.test(strippedContent));

      // Check if the model output looks like a valid tool call JSON
      // (even if not using the API tool_calls mechanism)
      const hasJsonToolCall = /"name"\s*:\s*"get_weather"/i.test(strippedContent)
        && /"arguments"\s*:\s*\{/i.test(strippedContent);

      if (hasJsonToolCall) {
        // Model outputs structured tool call JSON in text — classify as react
        // since the react-fallback parser can handle this format
        const level: ToolSupportLevel = "react";
        cacheToolSupport(model, level, family);
        return {
          level,
          cached: false,
          evidence: `JSON tool call in text (no native API tool_calls — will use react-fallback)`,
          elapsedMs,
        };
      }

      // ── No tool support detected ─────────────────────────────────
      const level: ToolSupportLevel = "none";
      cacheToolSupport(model, level, family);
      const cleanContent = truncate(strippedContent, 150);
      const evidenceDetail = hasTextToolSignal
        ? `no structured tool calling (text mentions tool: ${cleanContent})`
        : `no tool calling patterns (text: ${cleanContent})`;
      return { level, cached: false, evidence: evidenceDetail, elapsedMs };
    } catch (e: any) {
      const level: ToolSupportLevel = "none";
      cacheToolSupport(model, level, family);
      return { level, cached: false, evidence: `error: ${e.message}`, elapsedMs: 0 };
    }
  }

  // ── get models to test ───────────────────────────────────────────────

  async function getOllamaModels(): Promise<string[]> {
    // Use the same Ollama base URL (could be remote) via /api/tags
    try {
      const res = await fetch(`${ollamaBase()}/api/tags`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map((m: any) => m.name).filter(Boolean);
    } catch {
      return [];
    }
  }

  function getCurrentModel(ctx: any): string | undefined {
    return ctx.model?.id;
  }

  /**
   * Update the reasoning field in models.json for a given model.
   * Returns { updated, message }.
   */
  function updateModelsJsonReasoning(model: string, hasReasoning: boolean): { updated: boolean; message: string } {
    try {
      const config = readModelsJson();

      let updated = false;
      for (const provider of Object.values(config.providers || {}) as any[]) {
        const models: any[] = provider.models || [];
        for (const m of models) {
          if (m.id === model) {
            const current = m.reasoning;
            if (current === hasReasoning) {
              return { updated: false, message: `reasoning already "${hasReasoning}" for ${model} — no change` };
            }
            m.reasoning = hasReasoning;
            updated = true;
            break;
          }
        }
        if (updated) break;
      }

      if (!updated) {
        return { updated: false, message: `${model} not found in models.json — skipped` };
      }

      writeModelsJson(config);
      const action = hasReasoning ? "set reasoning: true" : "set reasoning: false";
      return { updated: true, message: `✅ Updated ${model}: ${action}` };
    } catch (e: any) {
      return { updated: false, message: `Failed to update models.json: ${e.message}` };
    }
  }

  // ── run all tests on one model ───────────────────────────────────────

  const branding = [
    `  ⚡ Pi Model Benchmark v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`,
  ].join("\n");

  /**
   * Run the full Ollama test suite (existing behavior).
   */
  async function testModelOllama(model: string, providerInfo?: ProviderInfo, ctx?: any): Promise<string> {
    const lines: string[] = [];
    const totalStart = Date.now();

    lines.push(branding);
    lines.push(section(`MODEL: ${model}`));
    lines.push(info("Provider: Ollama (local/remote)"));

    // Show API mode and native context length
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

    // Fetch native max context from Ollama /api/show (same as ollama-sync)
    const nativeContext = await fetchModelContextLength(ollamaBase(), model);
    if (nativeContext !== undefined) {
      const ctxStr = nativeContext >= 1000 ? `${(nativeContext / 1000).toFixed(1)}k` : String(nativeContext);
      lines.push(info(`Context: ${ctxStr} tokens (native max)`));
    }

    // Get model info from Ollama /api/tags (structured JSON)
    let modelSize = "unknown";
    let modelFamily = "unknown";
    let modelParams = "unknown";
    let modelQuant = "unknown";
    let modelModified = "unknown";
    try {
      const tagsRes = await fetch(`${ollamaBase()}/api/tags`, { signal: AbortSignal.timeout(10000) });
      if (tagsRes.ok) {
        const tags = await tagsRes.json();
        const entry = (tags.models || []).find((m: any) => m.name === model);
        if (entry) {
          const details = entry.details || {};
          const sizeBytes = entry.size || 0;
          const sizeGB = sizeBytes / (1024 * 1024 * 1024);
          const sizeMB = sizeBytes / (1024 * 1024);
          modelSize = sizeGB >= 1 ? `${sizeGB.toFixed(1)} GB` : `${sizeMB.toFixed(0)} MB`;
          modelFamily = details.family || details.families?.[0] || "unknown";
          modelParams = details.parameter_size || "unknown";
          modelQuant = details.quantization_level || "unknown";
          // Format modified date
          const modDate = entry.modified_at ? new Date(entry.modified_at) : null;
          modelModified = modDate ? modDate.toLocaleDateString() : "unknown";
        }
      }
    } catch { /* ignore */ }

    // Use detected family from shared utility (falls back to Ollama-reported family)
    const detectedFamily = detectModelFamily(model);

    lines.push(info(`Size: ${modelSize}  |  Params: ${modelParams}  |  Quant: ${modelQuant}`));
    lines.push(info(`Family: ${modelFamily}  |  Detected: ${detectedFamily}  |  Modified: ${modelModified}`));

    // 1. Reasoning test
    lines.push(section("REASONING TEST"));
    lines.push(info("Prompt: A snail climbs 3ft up a wall each day, slides 2ft back each night. Wall is 10ft. How many days?"));
    lines.push(info("Testing..."));

    const reasoning = await testReasoning(model);
    lines.push(info(`Time: ${msHuman(reasoning.elapsedMs)}`));
    if (reasoning.score === "STRONG") {
      lines.push(ok(`Answer: ${reasoning.answer} — Correct with clear reasoning (${reasoning.score})`));
    } else if (reasoning.score === "MODERATE") {
      lines.push(ok(`Answer: ${reasoning.answer} — Correct but weak reasoning (${reasoning.score})`));
    } else if (reasoning.score === "WEAK") {
      lines.push(fail(`Answer: ${reasoning.answer} — Reasoned but wrong answer (${reasoning.score})`));
    } else if (reasoning.score === "FAIL") {
      lines.push(fail(`Answer: ${reasoning.answer} — No reasoning detected (${reasoning.score})`));
    } else {
      const errMsg = reasoning.reasoning.includes("<!DOCTYPE") || reasoning.reasoning.includes("<html")
        ? reasoning.reasoning.split("\n")[0].slice(0, 100) + "..." 
        : truncate(reasoning.reasoning, 300);
      lines.push(fail(`Error: ${errMsg}`));
    }
    lines.push(info(`Response: ${sanitizeForReport(reasoning.reasoning)}`));

    // 2. Thinking test
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

    // Auto-update models.json reasoning field
    lines.push(section("MODELS.JSON SYNC"));
    const reasoningUpdate = updateModelsJsonReasoning(model, thinking.supported);
    lines.push(info(reasoningUpdate.message));

    // 3. Tool usage test
    lines.push(section("TOOL USAGE TEST"));
    lines.push(info("Prompt: \"What's the weather in Paris?\" (with get_weather tool available)"));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);

    const tools = await testToolUsage(model);
    lines.push(info(`Time: ${msHuman(tools.elapsedMs)}`));
    if (tools.score === "STRONG") {
      lines.push(ok(`Tool call: ${tools.toolCall} (${tools.score})`));
      // If tool call was detected from text (not native API), show the raw output
      if (tools.response) {
        lines.push(info(`Raw response: ${sanitizeForReport(tools.response)}`));
      }
    } else if (tools.score === "MODERATE") {
      lines.push(ok(`Tool call: ${tools.toolCall} (${tools.score})`));
      if (tools.response) {
        lines.push(info(`Raw response: ${sanitizeForReport(tools.response)}`));
      }
    } else if (tools.score === "WEAK") {
      lines.push(warn(`Tool call: ${tools.toolCall} (${tools.score}) — malformed call`));
      if (tools.response) {
        lines.push(info(`Raw response: ${sanitizeForReport(tools.response)}`));
      }
    } else if (tools.score === "FAIL") {
      const hasResponse = tools.response && tools.response.trim().length > 0;
      lines.push(fail(`Tool call: none — ${hasResponse ? "model responded in text instead" : "model returned empty response"} (${tools.score})`));
      if (hasResponse) {
        lines.push(info(`Text response: ${sanitizeForReport(tools.response)}`));
      } else {
        lines.push(info("Text response: (empty)"));
      }
    } else {
      lines.push(fail(`Error: ${tools.toolCall}`));
    }

    // 4. ReAct parsing test
    lines.push(section("REACT PARSING TEST"));
    lines.push(info("Prompt: \"What's the weather in Tokyo?\" (ReAct format, no native tools)"));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);

    const react = await testReactParsing(model);
    lines.push(info(`Time: ${msHuman(react.elapsedMs)}`));
    // Show detected dialect if non-classic
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
      lines.push(warn(`ReAct parsed: ${react.toolCall} (${react.score}) — wrong tool or malformed args${dialectTag}`));
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

    // 5. Instruction following test
    lines.push(section("INSTRUCTION FOLLOWING TEST"));
    lines.push(info('Prompt: Respond with ONLY a JSON object with keys: name, can_count, sum (15+27), language'));
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

    // 6. Tool support detection
    lines.push(section("TOOL SUPPORT DETECTION"));
    lines.push(info("Probing model for tool calling capability (native / ReAct / none)"));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);

    const toolSupport = await testToolSupport(model, detectedFamily);
    lines.push(info(`Time: ${msHuman(toolSupport.elapsedMs)}`));

    const supportLabel = (level: ToolSupportLevel): string => {
      switch (level) {
        case "native": return "NATIVE (structured API tool_calls)";
        case "react":  return "REACT (Action:/Action Input: text format)";
        case "none":   return "NONE (no tool support detected)";
        default:       return "UNKNOWN";
      }
    };

    if (toolSupport.cached) {
      lines.push(info(`Result: ${supportLabel(toolSupport.level)} — from cache`));
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

    // Summary
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
      { name: "Tool Support", pass: toolSupport.level === "native" || toolSupport.level === "react", score: toolSupport.level.toUpperCase() },
    ];
    const passed = tests.filter(t => t.pass).length;
    const total = tests.length;

    for (const t of tests) {
      lines.push(t.pass ? ok(`${t.name}: ${t.score}`) : fail(`${t.name}: ${t.score}`));
    }
    lines.push(info(`Total time: ${msHuman(totalMs)}`));
    lines.push(info(`Score: ${passed}/${total} tests passed`));

    // Recommendation
    lines.push(section("RECOMMENDATION"));
    if (passed === 6) {
      lines.push(ok(`${model} is a STRONG model — full capability`));
    } else if (passed >= 5) {
      lines.push(ok(`${model} is a GOOD model — most capabilities work`));
    } else if (passed >= 4) {
      lines.push(warn(`${model} is USABLE — some capabilities are limited`));
    } else {
      lines.push(fail(`${model} is WEAK — limited capabilities for agent use`));
    }

    // Save test history
    try {
      const historyEntry: TestHistoryEntry = {
        timestamp: new Date().toISOString(),
        model,
        providerKind: "ollama",
        providerName: providerName || "ollama",
        tests: {
          reasoning: { score: reasoning.score, pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", answer: reasoning.answer },
          thinking: { supported: thinking.supported },
          toolUsage: { score: tools.score, pass: tools.score === "STRONG" || tools.score === "MODERATE", toolCall: tools.toolCall },
          reactParsing: { score: react.score, pass: react.score === "STRONG" || react.score === "MODERATE", toolCall: react.toolCall, dialect: react.dialect },
          instructionFollowing: { score: instructions.score, pass: instructions.pass },
          toolSupport: { level: toolSupport.level, evidence: toolSupport.evidence },
        },
        passedCount: passed,
        totalCount: total,
        totalMs,
      };
      appendTestHistory(historyEntry);

      // Check for regression
      const regressions = detectRegression(model, historyEntry);
      if (regressions.length > 0) {
        lines.push(section("REGRESSION DETECTED"));
        for (const reg of regressions) {
          lines.push(warn(`${reg.test}: ${reg.previous} → ${reg.current}`));
        }
      }
    } catch { /* history save is non-critical */ }

    return lines.join("\n");
  }

  /**
   * Run the cloud provider test suite (built-in providers).
   * Tests: connectivity, reasoning, instruction following, tool usage.
   * Skips: thinking, ReAct parsing, tool support detection, model metadata.
   */
  async function testModelProvider(providerInfo: ProviderInfo, model: string, ctx?: any): Promise<string> {
    const lines: string[] = [];
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

    // Show context window if available from framework
    const contextWindow = ctx?.model?.contextWindow ?? null;
    if (contextWindow !== null) {
      const ctxStr = contextWindow >= 1000 ? `${(contextWindow / 1000).toFixed(1)}k` : String(contextWindow);
      lines.push(info(`Context: ${ctxStr} tokens`));
    }

    // 1. Connectivity test
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
      lines.push(warn("Skipping remaining tests — fix connectivity first"));
      lines.push(info("Tip: Check your API key is set correctly and the provider endpoint is accessible"));
      return lines.join("\n");
    }

    // 2. Reasoning test
    lines.push(section("REASONING TEST"));
    lines.push(info("Prompt: A snail climbs 3ft up a wall each day, slides 2ft back each night. Wall is 10ft. How many days?"));
    lines.push(info("Testing..."));
    await rateLimitDelay(lines);

    const reasoning = await testReasoningProvider(providerInfo, model);
    lines.push(info(`Time: ${msHuman(reasoning.elapsedMs)}`));
    if (reasoning.score === "STRONG") {
      lines.push(ok(`Answer: ${reasoning.answer} — Correct with clear reasoning (${reasoning.score})`));
    } else if (reasoning.score === "MODERATE") {
      lines.push(ok(`Answer: ${reasoning.answer} — Correct but weak reasoning (${reasoning.score})`));
    } else if (reasoning.score === "WEAK") {
      lines.push(fail(`Answer: ${reasoning.answer} — Reasoned but wrong answer (${reasoning.score})`));
    } else if (reasoning.score === "FAIL") {
      lines.push(fail(`Answer: ${reasoning.answer} — No reasoning detected (${reasoning.score})`));
    } else {
      const errMsg = reasoning.reasoning.includes("<!DOCTYPE") || reasoning.reasoning.includes("<html")
        ? reasoning.reasoning.split("\n")[0].slice(0, 100) + "..." 
        : truncate(reasoning.reasoning, 300);
      lines.push(fail(`Error: ${errMsg}`));
    }
    lines.push(info(`Response: ${sanitizeForReport(reasoning.reasoning)}`));

    // 3. Instruction following test
    lines.push(section("INSTRUCTION FOLLOWING TEST"));
    lines.push(info('Prompt: Respond with ONLY a JSON object with keys: name, can_count, sum (15+27), language'));
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

    // 4. Tool usage test
    lines.push(section("TOOL USAGE TEST"));
    lines.push(info("Prompt: \"What's the weather in Paris?\" (with get_weather tool available)"));
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
      lines.push(warn(`Tool call: ${toolTest.toolCall} (${toolTest.score}) — malformed call`));
      if (toolTest.response) {
        lines.push(info(`Raw response: ${sanitizeForReport(toolTest.response)}`));
      }
    } else if (toolTest.score === "FAIL") {
      const hasResponse = toolTest.response && toolTest.response.trim().length > 0;
      lines.push(fail(`Tool call: none — ${hasResponse ? "model responded in text instead" : "model returned empty response"} (${toolTest.score})`));
      if (hasResponse) {
        lines.push(info(`Text response: ${sanitizeForReport(toolTest.response)}`));
      } else {
        lines.push(info("Text response: (empty)"));
      }
    } else {
      lines.push(fail(`Error: ${toolTest.toolCall}`));
    }

    // Skipped tests notice
    lines.push(section("SKIPPED TESTS (OLLAMA-ONLY)"));
    lines.push(warn("Thinking test — Ollama-specific think:true option and message.thinking field"));
    lines.push(warn("ReAct parsing test — only relevant for Ollama models without native tool calling"));
    lines.push(warn("Tool support detection — Ollama-specific tool support cache"));
    lines.push(warn("Model metadata — Ollama-specific /api/tags endpoint"));

    // Summary
    lines.push(section("SUMMARY"));
    const totalMs = Date.now() - totalStart;
    const tests = [
      { name: "Connectivity", pass: connectivity.pass, score: connectivity.pass ? "OK" : "FAIL" },
      { name: "Reasoning", pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", score: reasoning.score },
      { name: "Instructions", pass: instructions.pass, score: instructions.score },
      { name: "Tool Usage", pass: toolTest.pass, score: toolTest.score },
    ];
    const passed = tests.filter(t => t.pass).length;
    const total = tests.length;

    for (const t of tests) {
      lines.push(t.pass ? ok(`${t.name}: ${t.score}`) : fail(`${t.name}: ${t.score}`));
    }
    lines.push(info(`Total time: ${msHuman(totalMs)}`));
    lines.push(info(`Score: ${passed}/${total} tests passed`));

    // Recommendation
    lines.push(section("RECOMMENDATION"));
    if (passed === 4) {
      lines.push(ok(`${model} is a STRONG model via ${providerInfo.name} — full capability`));
    } else if (passed >= 3) {
      lines.push(ok(`${model} is a GOOD model via ${providerInfo.name} — most capabilities work`));
    } else if (passed >= 2) {
      lines.push(warn(`${model} is USABLE via ${providerInfo.name} — some capabilities are limited`));
    } else {
      lines.push(fail(`${model} is WEAK via ${providerInfo.name} — limited capabilities for agent use`));
    }

    // Save test history
    try {
      const historyEntry: TestHistoryEntry = {
        timestamp: new Date().toISOString(),
        model,
        providerKind: "builtin",
        providerName: providerInfo.name,
        tests: {
          reasoning: { score: reasoning.score, pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", answer: reasoning.answer },
          thinking: { supported: false },
          toolUsage: { score: toolTest.score, pass: toolTest.pass, toolCall: toolTest.toolCall },
          reactParsing: { score: "SKIP", pass: false, toolCall: "n/a" },
          instructionFollowing: { score: instructions.score, pass: instructions.pass },
          toolSupport: { level: "native", evidence: "provider-native (not probed)" },
        },
        passedCount: passed,
        totalCount: total,
        totalMs,
      };
      appendTestHistory(historyEntry);

      // Check for regression
      const regressions = detectRegression(model, historyEntry);
      if (regressions.length > 0) {
        lines.push(section("REGRESSION DETECTED"));
        for (const reg of regressions) {
          lines.push(warn(`${reg.test}: ${reg.previous} → ${reg.current}`));
        }
      }
    } catch { /* history save is non-critical */ }

    return lines.join("\n");
  }

  /**
   * Main entry point: detect provider and dispatch to the appropriate test suite.
   */
  async function testModel(model: string, ctx?: any): Promise<string> {
    const providerInfo = ctx ? detectProvider(ctx) : { kind: "ollama" as const, name: "ollama" };

    if (providerInfo.kind === "ollama") {
      return testModelOllama(model, providerInfo, ctx);
    } else if (providerInfo.kind === "builtin") {
      return testModelProvider(providerInfo, model, ctx);
    } else {
      // Unknown provider — try Ollama as fallback
      return testModelOllama(model);
    }
  }

  // ── Register /model-test command ─────────────────────────────────────

  pi.registerCommand("model-test", {
    description: "Test a model for reasoning, thinking, tool usage, ReAct parsing, instruction following, and tool support level. Supports both Ollama and cloud providers. Use: /model-test [model] or /model-test --all",
    getArgumentCompletions: async (prefix) => {
      try {
        const models = await getOllamaModels();
        return models.map(m => ({ label: m, description: `Test ${m}` }))
          .filter(m => m.label.startsWith(prefix));
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
        // --all only works for Ollama providers
        const providerInfo = detectProvider(ctx);
        if (providerInfo.kind !== "ollama") {
          ctx.ui.notify(`--all is only supported for Ollama models. Current provider: ${providerInfo.name} (${providerInfo.kind})`, "error");
          return;
        }

        // Test all models
        ctx.ui.notify("Testing all models — this will take a while...", "info");
        let models: string[];
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

        for (const model of models) {
          ctx.ui.notify(`Testing ${model}...`, "info");
          try {
            const report = await testModel(model, ctx);
            pi.sendMessage({
              customType: "model-test-report",
              content: report,
              display: { type: "content", content: report },
              details: { model, timestamp: new Date().toISOString() },
            });
          } catch (e: any) {
            ctx.ui.notify(`Failed to test ${model}: ${e.message}`, "error");
          }
        }
        ctx.ui.notify(`Done testing ${models.length} models`, "info");
        return;
      }

      // Test specific model
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
          details: { model, timestamp: new Date().toISOString() },
        });
      } catch (e: any) {
        ctx.ui.notify(`Model test failed: ${e.message}`, "error");
      }
    },
  });

  // ── Register model_test tool (LLM-callable) ─────────────────────────

  pi.registerTool({
    name: "model_test",
    label: "Model Test",
    description: "Test a model for reasoning ability, thinking/reasoning token support, tool usage capability, instruction following, and tool support level. Supports both Ollama and built-in cloud providers (OpenRouter, Anthropic, Google, OpenAI, etc.). Returns a detailed report with scores.",
    promptSnippet: "model_test - test a model's capabilities",
    promptGuidelines: [
      "When the user asks to test or evaluate a model, call model_test with the model name.",
    ],
    parameters: {
      type: "object",
      properties: {
        model: { type: "string", description: "Model name to test (e.g. qwen3:0.6b, anthropic/claude-3.5-sonnet). If omitted, tests the current model." },
      },
    } as any,
    execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
      const model = ((_params as any)?.model as string) || getCurrentModel(ctx);
      if (!model) {
        return {
          content: [{ type: "text", text: "No model currently selected to test." }],
          isError: true,
        } as AgentToolResult;
      }
      try {
        const report = await testModel(model, ctx);
        return {
          content: [{ type: "text", text: report }],
          isError: false,
        } as AgentToolResult;
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Model test failed: ${e.message}` }],
          isError: true,
        } as AgentToolResult;
      }
    },
  });
}
