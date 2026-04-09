import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── Shared imports ───────────────────────────────────────────────────────
import {
  section, ok, fail, warn, info,
  msHuman, truncate, sanitizeForReport,
} from "../shared/format";
import { getOllamaBaseUrl, MODELS_JSON_PATH, detectModelFamily } from "../shared/ollama";
import type { ToolSupportLevel } from "../shared/types";

// ── Configuration Constants ─────────────────────────────────────────────

/**
 * Configuration constants for model testing.
 * Centralized to make tuning and maintenance easier.
 *
 * @property DEFAULT_TIMEOUT_MS - Default timeout for Ollama API calls (8.3 min)
 * @property CONNECT_TIMEOUT_S - Connection timeout for curl (seconds)
 * @property MAX_RETRIES - Number of retry attempts for transient failures
 * @property RETRY_DELAY_MS - Delay between retry attempts (milliseconds)
 * @property NUM_PREDICT - Default max tokens for model responses
 * @property TEMPERATURE - Default sampling temperature
 * @property MIN_THINKING_LENGTH - Minimum characters to consider thinking tokens valid
 * @property TOOL_TEST_TIMEOUT_MS - Timeout for tool usage tests
 * @property TOOL_SUPPORT_TIMEOUT_MS - Timeout for tool support detection
 * @property TAGS_TIMEOUT_MS - Timeout for /api/tags requests
 * @property TAGS_CONNECT_TIMEOUT_S - Connection timeout for /api/tags (seconds)
 */
const CONFIG = {
  // General API settings
  DEFAULT_TIMEOUT_MS: 500000,        // 8.3 minutes - default timeout for model responses
  CONNECT_TIMEOUT_S: 30,             // 30 seconds to establish connection
  MAX_RETRIES: 1,                    // Single retry for transient failures
  RETRY_DELAY_MS: 2000,              // 2 seconds between retries
  EXEC_BUFFER_MS: 5000,              // Extra buffer for exec timeout over curl timeout

  // Model generation settings
  NUM_PREDICT: 1024,                 // Max tokens in response
  TEMPERATURE: 0.1,                  // Low temperature for more deterministic output

  // Test-specific settings
  MIN_THINKING_LENGTH: 10,           // Minimum chars to consider thinking tokens valid
  TOOL_TEST_TIMEOUT_MS: 50000,       // 50 seconds for tool usage tests
  TOOL_TEST_MAX_TIME_S: 9999,        // Max curl time for tool tests (effectively unlimited)
  TOOL_SUPPORT_TIMEOUT_MS: 130000,   // 2+ minutes for tool support detection
  TOOL_SUPPORT_MAX_TIME_S: 120,      // Max curl time for tool support detection

  // Metadata retrieval
  TAGS_TIMEOUT_MS: 15000,            // 15 seconds for /api/tags
  TAGS_CONNECT_TIMEOUT_S: 10,        // 10 seconds connection timeout for tags
  MODEL_INFO_TIMEOUT_MS: 10000,      // 10 seconds for model info lookup
} as const;

// ── Tool support cache ──────────────────────────────────────────────────

const TOOL_SUPPORT_CACHE_DIR = path.join(os.homedir(), ".pi", "agent", "cache");
const TOOL_SUPPORT_CACHE_PATH = path.join(TOOL_SUPPORT_CACHE_DIR, "tool_support.json");

interface ToolSupportCacheRecord {
  support: ToolSupportLevel;
  testedAt: string;
  family: string;
}

interface ToolSupportCache {
  [modelName: string]: ToolSupportCacheRecord;
}

/**
 * Read the tool support cache from disk.
 * Returns an empty object if the file doesn't exist or is invalid.
 */
function readToolSupportCache(): ToolSupportCache {
  try {
    if (fs.existsSync(TOOL_SUPPORT_CACHE_PATH)) {
      const raw = fs.readFileSync(TOOL_SUPPORT_CACHE_PATH, "utf-8");
      return JSON.parse(raw) as ToolSupportCache;
    }
  } catch { /* ignore parse errors */ }
  return {};
}

/**
 * Write the tool support cache to disk.
 */
function writeToolSupportCache(cache: ToolSupportCache): void {
  if (!fs.existsSync(TOOL_SUPPORT_CACHE_DIR)) {
    fs.mkdirSync(TOOL_SUPPORT_CACHE_DIR, { recursive: true });
  }
  fs.writeFileSync(TOOL_SUPPORT_CACHE_PATH, JSON.stringify(cache, null, 2) + "\n", "utf-8");
}

/**
 * Look up a model's cached tool support level.
 * Returns null if not cached.
 */
function getCachedToolSupport(model: string): ToolSupportCacheRecord | null {
  const cache = readToolSupportCache();
  const entry = cache[model];
  if (!entry) return null;
  // Validate the entry has required fields and a valid support level
  if (!entry.support || !["native", "react", "none"].includes(entry.support)) return null;
  return entry;
}

/**
 * Cache a model's tool support level.
 */
function cacheToolSupport(model: string, support: ToolSupportLevel, family: string): void {
  const cache = readToolSupportCache();
  cache[model] = {
    support,
    testedAt: new Date().toISOString(),
    family,
  };
  writeToolSupportCache(cache);
}

/**
 * Model testing extension for Pi Coding Agent.
 * Tests Ollama models for reasoning/thinking ability, tool usage capability,
 * instruction following, and tool support level by calling the Ollama API
 * directly (bypasses Pi's agent loop).
 *
 * Usage:
 *   /model-test              — test the current Pi model
 *   /model-test qwen3:0.6b   — test a specific model
 *   /model-test --all        — test all models in Ollama
 */
export default function (pi: ExtensionAPI) {

  // Ollama URL: models.json > OLLAMA_HOST env > localhost
  const OLLAMA_BASE = getOllamaBaseUrl();

  // ── helpers ──────────────────────────────────────────────────────────

  /**
   * Call Ollama /api/chat and return the parsed response.
   */
  async function ollamaChat(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: Record<string, unknown> = {},
    timeoutMs = CONFIG.DEFAULT_TIMEOUT_MS,
    retries = CONFIG.MAX_RETRIES
  ): Promise<{ response: any; elapsedMs: number }> {
    const body: any = { model, messages, stream: false, options: { num_predict: CONFIG.NUM_PREDICT, temperature: CONFIG.TEMPERATURE, ...options } };

    for (let attempt = 0; attempt <= retries; attempt++) {
      const start = Date.now();
      try {
        const result = await pi.exec("curl", [
          "-s", "--fail-with-body", "-X", "POST",
          "--connect-timeout", String(CONFIG.CONNECT_TIMEOUT_S),
          "--max-time", String(Math.ceil(timeoutMs / 1000)),
          `${OLLAMA_BASE}/api/chat`,
          "-H", "Content-Type: application/json",
          "-d", JSON.stringify(body),
        ], { timeout: timeoutMs + CONFIG.EXEC_BUFFER_MS });
        const elapsedMs = Date.now() - start;

        if (result.code !== 0) {
          const detail = result.stderr?.trim() || result.stdout?.trim() || "unknown error";
          throw new Error(`curl exited ${result.code}: ${detail}`);
        }
        if (!result.stdout.trim()) {
          // Empty response — could be transient tunnel/timeout issue
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS));
            continue;
          }
          throw new Error(`Empty response from Ollama after ${attempt + 1} attempt(s)`);
        }
        const parsed = JSON.parse(result.stdout);
        return { response: parsed, elapsedMs };
      } catch (e: any) {
        if (attempt < retries && (e.message.includes("Empty response") || e.message.includes("timed out") || e.message.includes("curl exited 22") || e.message.includes("curl exited 28") || e.message.includes("curl exited 35") || e.message.includes("curl exited 52"))) {
          await new Promise(r => setTimeout(r, CONFIG.RETRY_DELAY_MS));
          continue;
        }
        throw e;
      }
    }
    throw new Error("Unreachable");
  }

  // ── test: reasoning ──────────────────────────────────────────────────

  /**
   * Test if a model can reason through a logic puzzle.
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
      let usedThinkingFallback = false;

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
          usedThinkingFallback = true;
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

      // Extract the answer: use the last number in the model's response.
      // The model's final number is its conclusion regardless of intermediate math.
      const allNumbers = effectiveMsg.match(/\b(\d+)\b/g) || [];
      const answer = allNumbers.length > 0 ? allNumbers[allNumbers.length - 1] : "?";

      const isCorrect = answer === "8";

      // Check for reasoning patterns (step-by-step, because, therefore, etc.)
      const reasoningPatterns = ["because", "therefore", "since", "step", "subtract", "minus",
        "each day", "each night", "slides", "climbs", "night", "reaches", "finally", "last day"];
      const hasReasoningWords = reasoningPatterns.some(w => effectiveMsg.toLowerCase().includes(w));
      // Also detect numbered step patterns (e.g. "1. Find... 2. Subtract... 3. Therefore...")
      const hasNumberedSteps = /^\s*\d+\.\s/m.test(effectiveMsg);
      const hasReasoning = hasReasoningWords || hasNumberedSteps;

      let score: string;
      let pass: boolean;
      if (isCorrect && hasReasoning) {
        score = "STRONG";
        pass = true;
      } else if (isCorrect) {
        score = "MODERATE";
        pass = true;
      } else if (hasReasoning) {
        score = "WEAK";
        pass = false;
      } else {
        score = "FAIL";
        pass = false;
      }

      // Use effectiveMsg for display; note if it came from thinking tokens
      const displayMsg = msg.trim().length > 0
        ? effectiveMsg
        : `[thinking tokens] ${effectiveMsg}`;
      return { pass, score, reasoning: displayMsg, answer, elapsedMs };
    } catch (e: any) {
      return { pass: false, score: "ERROR", reasoning: e.message, answer: "?", elapsedMs: 0 };
    }
  }

  // ── test: thinking ───────────────────────────────────────────────────

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

  // ── test: tool usage ─────────────────────────────────────────────────

  /**
   * Test if a model can generate proper tool calls via Ollama's tool API.
   */
  async function testToolUsage(model: string): Promise<{
    pass: boolean;
    score: string;
    hasToolCalls: boolean;
    toolCall: string;
    response: string;
    elapsedMs: number;
  }> {
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
              unit: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
            required: ["location"],
          },
        },
      },
    ];

    const body: any = {
      model,
      messages: [
        { role: "system", content: "You are a helpful assistant. Use the available tools when needed." },
        { role: "user", content: "What's the weather like in Paris right now?" },
      ],
      tools,
      stream: false,
      options: { num_predict: CONFIG.NUM_PREDICT, temperature: CONFIG.TEMPERATURE },
    };

    try {
      const start = Date.now();
      const result = await pi.exec("curl", [
        "-s", "--fail-with-body", "-X", "POST",
        "--connect-timeout", String(CONFIG.CONNECT_TIMEOUT_S),
        "--max-time", String(CONFIG.TOOL_TEST_MAX_TIME_S),
        `${OLLAMA_BASE}/api/chat`,
        "-H", "Content-Type: application/json",
        "-d", JSON.stringify(body),
      ], { timeout: CONFIG.TOOL_TEST_TIMEOUT_MS });
      const elapsedMs = Date.now() - start;

      if (result.code !== 0) {
        const detail = result.stderr?.trim() || result.stdout?.trim() || "unknown error";
        return { pass: false, score: "ERROR", hasToolCalls: false, toolCall: `curl error: ${result.code}: ${detail}`, response: "", elapsedMs };
      }

      if (!result.stdout.trim()) throw new Error("Empty response from Ollama");
      const parsed = JSON.parse(result.stdout);
      const toolCalls = parsed?.message?.tool_calls;
      const content = parsed?.message?.content || "";

      if (toolCalls && toolCalls.length > 0) {
        const call = toolCalls[0];
        const fn = call.function || {};
        // Parse tool arguments safely
        let args: any = {};
        try {
          args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments) : (fn.arguments || {});
        } catch {
          return {
            pass: true,
            score: "WEAK",
            hasToolCalls: true,
            toolCall: `malformed args: ${String(fn.arguments)}`,
            response: content,
            elapsedMs,
          };
        }
        const hasCorrectTool = fn.name === "get_weather";
        const hasLocation = typeof args.location === "string" && args.location.toLowerCase().includes("paris");

        let score: string;
        if (hasCorrectTool && hasLocation) {
          score = "STRONG";
        } else if (hasCorrectTool) {
          score = "MODERATE";
        } else {
          score = "WEAK";
        }

        return {
          pass: true,
          score,
          hasToolCalls: true,
          toolCall: `${fn.name}(${JSON.stringify(args)})`,
          response: content,
          elapsedMs,
        };
      }

      // Model answered in text — check if it contains valid tool call JSON
      // Use greedy match so nested braces (e.g. {"arguments": {...}}) are captured fully
      const firstBrace = content.indexOf('{');
      let textToolParsed: any = null;
      if (firstBrace !== -1) {
        const lastBrace = content.lastIndexOf('}');
        if (lastBrace > firstBrace) {
          const jsonCandidate = content.slice(firstBrace, lastBrace + 1);
          try {
            textToolParsed = JSON.parse(jsonCandidate);
          } catch { /* not valid JSON */ }
        }
      }

      // Check if the parsed JSON looks like a valid tool call
      if (textToolParsed && typeof textToolParsed.name === "string") {
        const fnName = textToolParsed.name;
        const rawArgs = textToolParsed.arguments || { ...textToolParsed };
        // Remove 'name' from args so it doesn't appear as a parameter
        const { name: _, ...fnArgs } = rawArgs;
        const isWeatherTool = fnName === "get_weather";
        const hasLocation = typeof fnArgs.location === "string" && fnArgs.location.toLowerCase().includes("paris");

        let score: string;
        if (isWeatherTool && hasLocation) {
          score = "STRONG";
        } else if (isWeatherTool) {
          score = "MODERATE";
        } else {
          score = "WEAK";
        }

        return {
          pass: true,
          score,
          hasToolCalls: true,
          toolCall: `${fnName}(${JSON.stringify(fnArgs)})`,
          response: content,
          elapsedMs,
        };
      }

      // Genuinely no tool call detected
      return {
        pass: false,
        score: "FAIL",
        hasToolCalls: false,
        toolCall: "none",
        response: content,
        elapsedMs,
      };
    } catch (e: any) {
      return { pass: false, score: "ERROR", hasToolCalls: false, toolCall: `error: ${e.message}`, response: "", elapsedMs: 0 };
    }
  }

  // ── test: ReAct parsing ────────────────────────────────────────────

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
  }> {
    // ReAct prompt — NO tools in the request, force model to use text format
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
      const start = Date.now();
      const result = await pi.exec("curl", [
        "-s", "--fail-with-body", "-X", "POST",
        "--connect-timeout", String(CONFIG.CONNECT_TIMEOUT_S),
        "--max-time", String(CONFIG.TOOL_TEST_MAX_TIME_S),
        `${OLLAMA_BASE}/api/chat`,
        "-H", "Content-Type: application/json",
        "-d", JSON.stringify(body),
      ], { timeout: CONFIG.TOOL_TEST_TIMEOUT_MS });
      const elapsedMs = Date.now() - start;

      if (result.code !== 0) {
        const detail = result.stderr?.trim() || result.stdout?.trim() || "unknown error";
        return { pass: false, score: "ERROR", toolCall: `curl error: ${result.code}: ${detail}`, thought: "", response: "", elapsedMs };
      }

      if (!result.stdout.trim()) throw new Error("Empty response from Ollama");
      const parsed = JSON.parse(result.stdout);
      const content = (parsed?.message?.content || "").trim();

      if (!content) {
        return { pass: false, score: "FAIL", toolCall: "empty response", thought: "", response: "", elapsedMs };
      }

      // ── Parse ReAct format using same patterns as react-fallback.ts ──
      const THOUGHT_RE = /Thought:\s*(.*?)(?=Action:|Final Answer:|$)/is;
      const ACTION_RE = /Action:\s*[`"']?(\w+)[`"']?\s*\n?\s*Action Input:\s*(.*?)(?=\n\s*(?:Observation:|Thought:|Final Answer:|Action:)|$)/is;
      const ACTION_RE_SAMELINE = /Action:\s*[`"']?(\w+)[`"']?\s+Action Input:\s*(.*?)(?=\n\s*(?:Observation:|Thought:|Final Answer:)|$)/is;
      const ACTION_RE_LOOSE = /Action:\s*(.+?)\n\s*Action Input:\s*(.*?)(?=\n\s*(?:Observation:|Thought:|Final Answer:|Action:)|$)/is;
      // Parenthetical style: Action: get_weather(location: "Tokyo") — single line, no Action Input
      const ACTION_RE_PAREN = /Action:\s*(\w+)\s*\(([^)]*)\)/i;

      let thought = "";
      const thoughtMatch = THOUGHT_RE.exec(content);
      if (thoughtMatch) thought = thoughtMatch[1].trim();

      let match = ACTION_RE.exec(content);
      if (!match) match = ACTION_RE_SAMELINE.exec(content);

      // Loose fallback: Action line contains natural language (e.g., "Action: Open the get_weather tool.")
      let looseMatch = false;
      if (!match) match = ACTION_RE_LOOSE.exec(content), looseMatch = true;
      let parenMatch = false;
      if (!match) match = ACTION_RE_PAREN.exec(content), parenMatch = true;

      if (match) {
        let toolName = match[1].trim().replace(/[`"']/g, "");

        // If matched by loose regex, extract tool name from the action text
        if (looseMatch) {
          const actionText = toolName.toLowerCase();
          if (actionText.includes("get_weather")) toolName = "get_weather";
          else {
            const toolWords = actionText.match(/\b[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+\b/gi) || [];
            if (toolWords.length > 0) toolName = toolWords[0];
          }
        }

        const rawArgs = parenMatch
          ? match[2].trim().replace(/^```\w*\s*/gm, "").replace(/```\s*$/gm, "").trim()
          : match[2].trim().replace(/^```\w*\s*/gm, "").replace(/```\s*$/gm, "").trim();

        // Parenthetical args (e.g., 'location: "Tokyo"') — convert to JSON
        let argsParsed = false;
        let argsStr = rawArgs;
        if (parenMatch && rawArgs && !rawArgs.startsWith("{")) {
          // Convert key: value pairs to JSON object
          const pairs = rawArgs.match(/(\w+)\s*:\s*("[^"]*"|'[^']*'|\S+)/g);
          if (pairs) {
            const obj: Record<string, string> = {};
            for (const p of pairs) {
              const colonIdx = p.indexOf(":");
              const key = p.slice(0, colonIdx).trim();
              let val: string = p.slice(colonIdx + 1).trim();
              if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                val = val.slice(1, -1);
              }
              obj[key] = val;
            }
            try { argsStr = JSON.stringify(obj); argsParsed = true; } catch { /* ignore */ }
          }
        }

        // Try to extract JSON args from Action Input block
        if (!argsParsed) {
        const jsonStart = rawArgs.indexOf("{");
        if (jsonStart !== -1) {
          let depth = 0;
          let jsonEnd = -1;
          for (let i = jsonStart; i < rawArgs.length; i++) {
            if (rawArgs[i] === "{") depth++;
            else if (rawArgs[i] === "}") { depth--; if (depth === 0) { jsonEnd = i; break; } }
          }
          if (jsonEnd !== -1) {
            const jsonStr = rawArgs.slice(jsonStart, jsonEnd + 1);
            try {
              JSON.parse(jsonStr);
              argsParsed = true;
              argsStr = jsonStr;
            } catch { /* args not valid JSON */ }
          }
        }
        }

        // Score: correct tool name + valid args = STRONG, correct tool = MODERATE, any action = WEAK
        let score: string;
        const isWeatherTool = toolName.toLowerCase().includes("get_weather") || toolName.toLowerCase() === "get_weather";
        if (isWeatherTool && argsParsed) {
          score = "STRONG";
        } else if (isWeatherTool) {
          score = "MODERATE";
        } else {
          score = "WEAK";
        }

        return {
          pass: true,
          score,
          toolCall: `${toolName}(${argsStr})`,
          thought,
          response: content,
          elapsedMs,
        };
      }

      // No ReAct patterns found
      // Check if model still tried to call a tool in some other way
      const hasToolMention = /\bget_weather\b/i.test(content) || /\btool\b/i.test(content);
      if (hasToolMention) {
        return {
          pass: false,
          score: "FAIL",
          toolCall: "none — model mentioned tool but not in ReAct format",
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

  // ── test: instruction following ──────────────────────────────────────

  /**
   * Test basic instruction following (format compliance, role awareness).
   */
  async function testInstructionFollowing(model: string): Promise<{
    pass: boolean;
    score: string;
    output: string;
    elapsedMs: number;
  }> {
    const prompt = `You must respond with ONLY a valid JSON object. No markdown, no explanation, no backticks, no extra text.

The JSON object must have exactly these 4 keys:
- "name" (string): your model name
- "can_count" (boolean): true
- "sum" (number): the result of 15 + 27
- "language" (string): the language you are responding in`;

    try {
      const { response, elapsedMs } = await ollamaChat(model, [
        { role: "user", content: prompt },
      ], { num_predict: CONFIG.NUM_PREDICT });

      const msg = (response?.message?.content || "").trim();

      // Try to parse as JSON (with repair for truncated output)
      let parsed: any = null;
      let repairNote = "";
      try {
        // Strip markdown fences if present
        const cleaned = msg.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
        parsed = JSON.parse(cleaned);
      } catch {
        // Attempt JSON repair — add missing closing braces/brackets
        // (common when model output is truncated by num_predict limit)
        const cleaned = msg.replace(/```json?\s*/gi, "").replace(/```/g, "").trim();
        const openBraces = (cleaned.match(/\{/g) || []).length;
        const closeBraces = (cleaned.match(/\}/g) || []).length;
        const openBrackets = (cleaned.match(/\[/g) || []).length;
        const closeBrackets = (cleaned.match(/\]/g) || []).length;
        if (openBraces > closeBraces || openBrackets > closeBrackets) {
          const repaired = cleaned
            + "}".repeat(Math.max(0, openBraces - closeBraces))
            + "]".repeat(Math.max(0, openBrackets - closeBrackets));
          try {
            parsed = JSON.parse(repaired);
            repairNote = " (repaired truncated JSON)";
          } catch { /* repair failed too */ }
        }
      }

      if (!parsed) {
        return { pass: false, score: "FAIL", output: sanitizeForReport(msg), elapsedMs };
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
        elapsedMs,
      };
    } catch (e: any) {
      return { pass: false, score: "ERROR", output: e.message, elapsedMs: 0 };
    }
  }

  // ── test: tool support detection ─────────────────────────────────────

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
              unit: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
            required: ["location"],
          },
        },
      },
    ];

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
      const result = await pi.exec("curl", [
        "-s", "--fail-with-body", "-X", "POST",
        "--connect-timeout", "30",
        "--max-time", "120",
        `${OLLAMA_BASE}/api/chat`,
        "-H", "Content-Type: application/json",
        "-d", JSON.stringify(body),
      ], { timeout: 130000 });
      const elapsedMs = Date.now() - start;

      if (result.code !== 0 || !result.stdout.trim()) {
        // API error — treat as no support
        const detail = result.stderr?.trim() || result.stdout?.trim() || "empty response";
        const level: ToolSupportLevel = "none";
        cacheToolSupport(model, level, family);
        return { level, cached: false, evidence: `API error: ${truncate(detail, 100)}`, elapsedMs };
      }

      const parsed = JSON.parse(result.stdout);
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

      // ── Check ReAct format ──────────────────────────────────────
      // ReAct patterns: "Action:", "Action Input:", "Thought:"
      // Case-insensitive, may have extra whitespace or formatting
      const reactPatterns = [
        /^\s*Action:\s*/im,           // "Action: get_weather"
        /^\s*Action Input:\s*/im,     // "Action Input: {"location": "Tokyo"}"
        /^\s*Thought:\s*/im,          // "Thought: I need to look up the weather"
        /Action:\s*\w+/i,            // "Action: get_weather" anywhere
        /Action Input:\s*\{/i,       // "Action Input: {..." anywhere
      ];

      const hasReActPattern = reactPatterns.some(p => p.test(content));

      if (hasReActPattern) {
        const level: ToolSupportLevel = "react";
        cacheToolSupport(model, level, family);
        return {
          level,
          cached: false,
          evidence: `ReAct format detected in text response`,
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
      const result = await pi.exec("curl", ["-s", "--connect-timeout", "10", `${OLLAMA_BASE}/api/tags`], { timeout: 15000 });
      if (result.code !== 0 || !result.stdout.trim()) return [];
      const data = JSON.parse(result.stdout);
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
    const agentDir = path.join(os.homedir(), ".pi", "agent");
    const modelsJsonPath = path.join(agentDir, "models.json");

    if (!fs.existsSync(modelsJsonPath)) {
      return { updated: false, message: "models.json not found — skipped" };
    }

    try {
      const raw = fs.readFileSync(modelsJsonPath, "utf-8");
      const config = JSON.parse(raw);

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

      // Write back with same formatting
      fs.writeFileSync(modelsJsonPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
      const action = hasReasoning ? "set reasoning: true" : "set reasoning: false";
      return { updated: true, message: `✅ Updated ${model}: ${action}` };
    } catch (e: any) {
      return { updated: false, message: `Failed to update models.json: ${e.message}` };
    }
  }

  // ── run all tests on one model ───────────────────────────────────────

  const branding = [
    `  ⚡ Pi Model Benchmark v1.1`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`,
  ].join("\n");

  async function testModel(model: string): Promise<string> {
    const lines: string[] = [];
    const totalStart = Date.now();

    lines.push(branding);
    lines.push(section(`MODEL: ${model}`));

    // Get model info from Ollama /api/tags (structured JSON)
    let modelSize = "unknown";
    let modelFamily = "unknown";
    let modelParams = "unknown";
    let modelQuant = "unknown";
    let modelModified = "unknown";
    try {
      const tagsResult = await pi.exec("curl", ["-s", `${OLLAMA_BASE}/api/tags`], { timeout: 10000 });
      if (tagsResult.code === 0 && tagsResult.stdout.trim()) {
        const tags = JSON.parse(tagsResult.stdout);
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

    const react = await testReactParsing(model);
    lines.push(info(`Time: ${msHuman(react.elapsedMs)}`));
    if (react.score === "STRONG") {
      lines.push(ok(`ReAct parsed: ${react.toolCall} (${react.score})`));
      if (react.thought) {
        lines.push(info(`Thought: ${sanitizeForReport(react.thought)}`));
      }
    } else if (react.score === "MODERATE") {
      lines.push(ok(`ReAct parsed: ${react.toolCall} (${react.score})`));
      if (react.thought) {
        lines.push(info(`Thought: ${sanitizeForReport(react.thought)}`));
      }
    } else if (react.score === "WEAK") {
      lines.push(warn(`ReAct parsed: ${react.toolCall} (${react.score}) — wrong tool or malformed args`));
      if (react.thought) {
        lines.push(info(`Thought: ${sanitizeForReport(react.thought)}`));
      }
    } else if (react.score === "FAIL") {
      lines.push(fail(`ReAct parsing: ${react.toolCall} (${react.score})`));
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
    const tests = [
      { name: "Reasoning", pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", score: reasoning.score },
      { name: "Thinking", pass: thinking.supported, score: thinking.supported ? "YES" : "NO" },
      { name: "Tool Usage", pass: tools.pass, score: tools.score },
      { name: "ReAct Parse", pass: react.pass, score: react.score },
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
    return lines.join("\n");
  }

  // ── Register /model-test command ─────────────────────────────────────

  pi.registerCommand("model-test", {
    description: "Test a model for reasoning, thinking, tool usage, ReAct parsing, instruction following, and tool support level. Use: /model-test [model] or /model-test --all",
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
            const report = await testModel(model);
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
        const report = await testModel(model);
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
    description: "Test an Ollama model for reasoning ability, thinking/reasoning token support, tool usage capability, ReAct format parsing, instruction following, and tool support level. Returns a detailed report with scores.",
    promptSnippet: "model_test - test a model's capabilities",
    promptGuidelines: [
      "When the user asks to test or evaluate a model, call model_test with the model name.",
    ],
    parameters: {
      type: "object",
      properties: {
        model: { type: "string", description: "Ollama model name to test (e.g. qwen3:0.6b). If omitted, tests the current model." },
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
        const report = await testModel(model);
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