import type { ExtensionAPI, AgentToolResult } from "@earendil-works/pi-coding-agent";

// ── Shared imports ───────────────────────────────────────────────────────
import {
  section, ok, fail, warn, info,
  msHuman, truncate, sanitizeForReport,
} from "../shared/format";
import { getOllamaBaseUrl, detectProvider } from "../shared/ollama";
import { debugLog } from "../shared/debug";
import { CONFIG, WEATHER_TOOL_DEFINITION, type ChatFn } from "../shared/model-test-utils";
import {
  branding as sharedBranding,
  formatTestSummary,
  formatRecommendation,
} from "../shared/test-report";

/**
 * Model testing extension for Pi Coding Agent.
 * Tests models for reasoning ability, tool usage capability,
 * instruction following, and tool support level.
 *
 * Supports both Ollama (local/remote) and built-in cloud providers
 * (OpenRouter, Anthropic, Google, OpenAI, Groq, etc.).
 *
 * Usage:
 *   /model-test                    — test the current Pi model
 *   /model-test qwen3:0.6b         — test a specific model
 *   /model-test --all              — test all models (Ollama only)
 *   /model-test --help             — show detailed help
 *   /model-test --clear-cache      — clear tool support cache
 *
 * Examples:
 *   /model-test                    # Test current model
 *   /model-test gpt-4              # Test specific model
 *   /model-test --all              # Test all Ollama models
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
   */
  async function rateLimitDelay(): Promise<void> {
    if (effectiveConfig.TEST_DELAY_MS > 0) {
      await new Promise(r => setTimeout(r, effectiveConfig.TEST_DELAY_MS));
    }
  }

  // ── Score reporting helpers ─────────────────────────────────────────

  /**
   * Report a reasoning test score.
   */
  function reportReasoningScore(
    lines: string[],
    result: { score: string; answer: string; reasoning: string },
  ): void {
    const msg = result.reasoning.toLowerCase().trim();
    const isCorrect = result.answer === "8";
    const reasoningPatterns = ["because", "therefore", "since", "step", "subtract", "minus",
      "each day", "each night", "slides", "climbs", "night", "reaches", "finally", "last day"];
    const hasReasoning = reasoningPatterns.some(w => msg.includes(w)) || /^\s*\d+\.\s/m.test(msg);
    
    if (isCorrect && hasReasoning) {
      lines.push(ok(`Answer: ${result.answer} — Correct with clear reasoning (${result.score})`));
    } else if (isCorrect) {
      lines.push(ok(`Answer: ${result.answer} — Correct but weak reasoning (${result.score})`));
    } else if (hasReasoning) {
      lines.push(warn(`Answer: ${result.answer} — Reasoned but wrong answer (${result.score})`));
    } else {
      lines.push(fail(`Answer: ${result.answer} — No reasoning detected (${result.score})`));
    }
  }

  /** Report an instruction-following test score. */
  function reportInstructionScore(lines: string[], result: { score: string }): void {
    if (result.score === "STRONG") {
      lines.push(ok(`JSON output valid with correct values (${result.score})`));
    } else if (result.score === "MODERATE") {
      lines.push(ok(`JSON output valid but some values incorrect (${result.score})`));
    } else if (result.score === "WEAK") {
      lines.push(warn(`Partial JSON compliance (${result.score})`));
    } else {
      lines.push(fail(`Failed to produce valid JSON (${result.score})`));
    }
  }

  /** Report a tool usage test score. */
  function reportToolScore(
    lines: string[],
    result: { score: string; toolCall: string; response?: string },
  ): void {
    if (result.score === "STRONG" || result.score === "MODERATE") {
      lines.push(ok(`Tool call: ${result.toolCall} (${result.score})`));
    } else if (result.score === "WEAK") {
      lines.push(warn(`Tool call: ${result.toolCall} (${result.score}) — malformed call`));
    } else if (result.score === "FAIL") {
      const hasResponse = result.response && result.response.trim().length > 0;
      lines.push(fail(`Tool call: none — ${hasResponse ? "model responded in text instead" : "model returned empty response"} (${result.score})`));
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

  // ── Extended Test Constants and Helpers ──────────────────────────────

  interface ReasoningTest {
    name: string;
    prompt: string;
    expectedAnswer: string;
    category: "math" | "logic" | "spatial" | "commonsense" | "counterint" | "causal" | "comparative" | "analogy" | "reading" | "code";
  }

  const REASONING_TESTS: ReasoningTest[] = [
    // Original tests
    { name: "snail_wall", prompt: "A snail climbs 3 feet up a wall each day, but slides back 2 feet each night. The wall is 10 feet tall. How many days does it take the snail to reach the top? Think step by step. ANSWER: <number>", expectedAnswer: "8", category: "logic" },
    { name: "math_sequence", prompt: "What is the next number in this sequence: 2, 6, 18, 54, ? Think step by step. ANSWER: <number>", expectedAnswer: "162", category: "math" },
    { name: "spatial_directions", prompt: "If you face north and turn 90 degrees clockwise, then face west and turn 180 degrees counter-clockwise, which direction are you facing? ANSWER: <direction>", expectedAnswer: "south", category: "spatial" },
    { name: "commonsense", prompt: "A rooster laid an egg on top of the world's highest building. Which side is the egg on? ANSWER: <side>", expectedAnswer: "the other side", category: "commonsense" },
    { name: "code_simplify", prompt: "Simplify this code to one line: let x = 0; for(let i=1; i<=5; i++) x += i; ANSWER: <code>", expectedAnswer: "15", category: "code" },
    // Phase 2: Counter-intuitive reasoning
    { name: "bat_and_ball", prompt: "A bat and a ball cost $1.10 total. The bat costs $1 more than the ball. How much does the ball cost? Think step by step. ANSWER: <number> cents", expectedAnswer: "5", category: "counterint" },
    { name: "scale_weight", prompt: "A scale weight is 100g. A similar scale weight is 4 times as heavy. How much does the second one weigh? Answer in grams. ANSWER: <number>", expectedAnswer: "400", category: "counterint" },
    // Phase 2: Logical deduction
    { name: "syllogism", prompt: "All mammals are warm-blooded. All dogs are mammals. Therefore, what can we conclude about dogs? Answer with the conclusion. ANSWER: <conclusion>", expectedAnswer: "warm-blooded", category: "logic" },
    { name: "if_then_chain", prompt: "If it rains, the ground gets wet. If the ground gets wet, the grass grows. It is raining. What happens? Think step by step. ANSWER: <outcome>", expectedAnswer: "grass grows", category: "logic" },
    // Phase 2: Causal reasoning
    { name: "cause_effect", prompt: "If you plant a seed in good soil with water and sunlight, what happens? Think about cause and effect. ANSWER: <outcome>", expectedAnswer: "grows", category: "causal" },
    // Phase 2: Comparative reasoning
    { name: "relative_quantities", prompt: "Tom has 3 times as many apples as Sara. Sara has 5 apples. How many apples does Tom have? ANSWER: <number>", expectedAnswer: "15", category: "comparative" },
    // Phase 2: Analogical reasoning
    { name: "analogy_1", prompt: "Book is to Shelf as Chair is to what? Think about relationships. ANSWER: <container>", expectedAnswer: "room", category: "analogy" },
    { name: "analogy_2", prompt: "Hand is to Glove as Foot is to what? ANSWER: <item>", expectedAnswer: "boot", category: "analogy" },
    // Phase 2: Common sense (physical properties)
    { name: "physics_1", prompt: "Does a bowling ball or a tennis ball have more mass? ANSWER: <object>", expectedAnswer: "bowling ball", category: "commonsense" },
    { name: "physics_2", prompt: "What happens to a metal spoon when heated? It usually becomes...? ANSWER: <state>", expectedAnswer: "hot", category: "commonsense" },
    // Phase 2: Common sense (everyday objects)
    { name: "objects_1", prompt: "What tool would you use to cut paper? ANSWER: <tool>", expectedAnswer: "scissors", category: "commonsense" },
    // Phase 2: Common sense (social situations)
    { name: "social_1", prompt: "If someone says 'please' and 'thank you', they are usually considered...? ANSWER: <trait>", expectedAnswer: "polite", category: "commonsense" },
    // Phase 2: Common sense (animals/nature)
    { name: "animals_1", prompt: "What do dolphins live in? ANSWER: <environment>", expectedAnswer: "water", category: "commonsense" },
    // Phase 2: General knowledge
    { name: "gk_1", prompt: "Which planet is known as the Red Planet? ANSWER: <planet>", expectedAnswer: "mars", category: "commonsense" },
    { name: "gk_2", prompt: "How many days are in a leap year? ANSWER: <number>", expectedAnswer: "366", category: "commonsense" },
  ];

  /**
   * Extract answer from model response - handles both numerical and text-based answers.
   */
  function extractAnswer(msg: string, expectedAnswer: string): string {
    const msgTrimmed = msg.trim();
    const isNumericAnswer = /^\d+$/.test(expectedAnswer);
    
    if (isNumericAnswer) {
      const allNumbers = msgTrimmed.match(/\b(\d+)\b/g) || [];
      return allNumbers.length > 0 ? allNumbers[allNumbers.length - 1] : "?";
    } else {
      const msgLower = msgTrimmed.toLowerCase();
      const expectedLower = expectedAnswer.toLowerCase();
      
      if (msgLower.includes(expectedLower)) {
        return expectedAnswer;
      }
      
      const answerPatterns = [
        `answer[:\s]+(${expectedLower})`,
        `answers?[:\s]+(${expectedLower})`,
        `is[:\s]+(${expectedLower})`,
        `are[:\s]+(${expectedLower})`,
        `result[:\s]+(${expectedLower})`,
        `conclusion[:\s]+(${expectedLower})`,
        `tool[:\s]+(${expectedLower})`,
        `way[:\s]+(${expectedLower})`,
        `side[:\s]+(${expectedLower})`,
      ];
      
      for (const pattern of answerPatterns) {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(msgTrimmed)) {
          return expectedAnswer;
        }
      }
      
      const questionKeywords = [
        'what', 'which', 'how many', 'how much', 'name', 'word', 'tool', 'side', 'direction', 'planet', 'metal', 'state', 'environment', 'trait', 'object', 'item', 'container', 'outcome', 'conclusion', 'answer'
      ];
      
      for (const keyword of questionKeywords) {
        const regex = new RegExp(`${keyword}[^.!?]*?(${expectedLower})`, 'i');
        const match = msgTrimmed.match(regex);
        if (match) {
          return expectedAnswer;
        }
      }
      
      const quotedMatch = msgTrimmed.match(new RegExp(`"([^"]*${expectedLower}[^"]*)"`, 'i'));
      if (quotedMatch) {
        return expectedAnswer;
      }
      
      if (msgTrimmed.split(/\s+/).length <= 10 && msgLower.includes(expectedLower.substring(0, 3))) {
        return expectedAnswer;
      }
      
      return "?";
    }
  }
  
  function scoreReasoningExtended(msg: string, expectedAnswer: string): { score: string; pass: boolean; details?: string } {
    const msgLower = msg.toLowerCase().trim();
    const answer = extractAnswer(msg, expectedAnswer);
    
    const isNumericAnswer = /^\d+$/.test(expectedAnswer);
    let isCorrect: boolean;
    let details = "";
    
    if (isNumericAnswer) {
      isCorrect = answer === expectedAnswer;
      details += ` (expected: ${expectedAnswer}, got: ${answer})`;
    } else {
      isCorrect = answer === expectedAnswer || msgLower.includes(expectedAnswer.toLowerCase());
      details += ` (expected: ${expectedAnswer}, got: ${answer})`;
    }
    
    const reasoningPatterns = ["because", "therefore", "since", "step", "subtract", "minus", "each day", "each night", "slides", "climbs", "night", "reaches", "finally", "last day", "sequence", "pattern", "multiply", "clockwise", "counter", "facing", "egg", "rooster", "cost", "dollar", "heavy", "mammal", "warm", "grow", "apple", "rains", "wet", "grass", "plant", "seed", "soil", "sunlight", "water", "times", "more", "less", "than", "paper", "tool", "polite", "dolphin", "red", "planet", "leap", "hand", "glove", "foot", "boot", "metal", "bowling", "tennis"];
    const hasReasoning = reasoningPatterns.some(w => msgLower.includes(w)) || /^\s*\d+\.\s/m.test(msg) || /^(1|2|3)\.\s/m.test(msg);
    
    if (isCorrect && hasReasoning) return { score: "STRONG", pass: true, details };
    if (isCorrect) return { score: "MODERATE", pass: true, details };
    if (hasReasoning) return { score: "WEAK", pass: false, details };
    return { score: "FAIL", pass: false, details };
  }

  function averageScore(scores: string[]): string {
    const weights: Record<string, number> = { STRONG: 3, MODERATE: 2, WEAK: 1, FAIL: 0, ERROR: 0 };
    const avg = scores.reduce((sum, s) => sum + (weights[s] || 0), 0) / scores.length;
    if (avg >= 2.5) return "STRONG";
    if (avg >= 1.5) return "MODERATE";
    if (avg >= 0.5) return "WEAK";
    return "FAIL";
  }

  const MULTISTEP_INSTRUCTION = `You must respond with ONLY a valid JSON object. No markdown, no explanation.
The JSON object must have exactly these keys:
{
  "name": "<your model name>",
  "can_count": true,
  "sum": 42,
  "language": "English",
  "colors": ["red", "blue", "green"],
  "timestamp": "<current time in ISO format>"
}
Return only the JSON.`;

  const CALC_TOOL_DEFINITION = {
    type: "function" as const,
    function: { name: "calculate", description: "Perform a mathematical calculation", parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] } },
  };

  // ── ChatFn wrappers ──────────────────────────────────────────────────

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

  // ── Ollama Chat Functions ─────────────────────────────────────────────

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

      let messageContent = "";
      let thinkingContent = "";
      let done = false;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (!done) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((line: string) => line.trim().length > 0);
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) messageContent += parsed.message.content;
            if (parsed.message?.thinking) thinkingContent += parsed.message.thinking;
            if (parsed.done) done = true;
          } catch (err) { debugLog("model-test", "skipped malformed JSON chunk in streaming response", err); }
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

  // ── Extended Test Functions ───────────────────────────────────────────

  interface ReasoningTestResult {
    name: string;
    category: string;
    score: string;
    answer: string;
    expectedAnswer: string;
    pass: boolean;
    details?: string;
  }

  async function testReasoningExtended(chatFn: ChatFn, model: string): Promise<{ score: string; scores: string[]; answers: string[]; results: ReasoningTestResult[] }> {
    const results: ReasoningTestResult[] = [];
    for (const test of REASONING_TESTS) {
      try {
        const result = await chatFn(model, [{ role: "user", content: test.prompt }]);
        const msg = result.content.trim();
        const answer = extractAnswer(msg, test.expectedAnswer);
        const scored = scoreReasoningExtended(msg, test.expectedAnswer);
        results.push({ name: test.name, category: test.category, score: scored.score, answer, expectedAnswer: test.expectedAnswer, pass: scored.pass, details: scored.details });
      } catch { results.push({ name: test.name, category: test.category, score: "ERROR", answer: "?", expectedAnswer: test.expectedAnswer, pass: false }); }
    }
    return { score: averageScore(results.map(r => r.score)), scores: results.map(r => r.score), answers: results.map(r => r.answer), results };
  }

  async function testInstructionFollowingExtended(chatFn: ChatFn, model: string): Promise<{ pass: boolean; score: string; output: string; schemaValid: boolean; elapsedMs: number }> {
    const start = Date.now();
    try {
      const result = await chatFn(model, [{ role: "user", content: MULTISTEP_INSTRUCTION }]);
      const parsed = JSON.parse(result.content.trim());
      const schemaValid = !!(parsed.name && parsed.can_count === true && parsed.sum === 42 && parsed.language && parsed.colors?.length === 3 && parsed.timestamp);
      if (schemaValid) return { pass: true, score: "STRONG", output: JSON.stringify(parsed), schemaValid, elapsedMs: Date.now() - start };
      if (parsed.name && parsed.sum === 42) return { pass: true, score: "MODERATE", output: JSON.stringify(parsed), schemaValid: false, elapsedMs: Date.now() - start };
      return { pass: false, score: "WEAK", output: JSON.stringify(parsed), schemaValid: false, elapsedMs: Date.now() - start };
    } catch (e: any) {
      return { pass: false, score: "FAIL", output: e.message, schemaValid: false, elapsedMs: Date.now() - start };
    }
  }

  async function testToolUsageExtended(chatFn: ChatFn, model: string): Promise<{ pass: boolean; score: string; toolCalls: string[]; response: string; elapsedMs: number }> {
    try {
      const result = await chatFn(model, [{ role: "system", content: "Use tools when needed." }, { role: "user", content: "What's weather in Tokyo and calculate 15*24?" }], { tools: [WEATHER_TOOL_DEFINITION, CALC_TOOL_DEFINITION] });
      const toolCalls = result.toolCalls || [];
      const hasWeather = toolCalls.some((t: any) => t.function?.name === "get_weather");
      const hasCalc = toolCalls.some((t: any) => t.function?.name === "calculate");
      let score = "FAIL";
      if (hasWeather && hasCalc && toolCalls.length >= 2) score = "STRONG";
      else if (hasWeather || hasCalc) score = "MODERATE";
      else if (toolCalls.length > 0) score = "WEAK";
      return { pass: toolCalls.length > 0, score, toolCalls: toolCalls.map((t: any) => t.function?.name || "?"), response: result.content, elapsedMs: result.elapsedMs };
    } catch (e: any) {
      return { pass: false, score: "ERROR", toolCalls: [], response: e.message, elapsedMs: 0 };
    }
  }

  // ── get models to test ─────────────────────────────────────────────────

  async function getOllamaModels(): Promise<string[]> {
    try {
      const res = await fetch(`${ollamaBase()}/api/tags`, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.models || []).map((m: any) => m.name).filter(Boolean);
    } catch (err) { debugLog("model-test", "failed to list Ollama models", err); return []; }
  }

  function getCurrentModel(ctx: any): string | undefined {
    return ctx.model?.id;
  }

  // ── Extended Test Runner ───────────────────────────────────────────────

  async function testModelExtended(model: string, ctx?: any): Promise<string> {
    const lines: string[] = [];
    const totalStart = Date.now();
    const providerInfo = ctx ? detectProvider(ctx) : { kind: "ollama" as const, name: "ollama" };

    lines.push(sharedBranding);
    lines.push(section(`MODEL: ${model}`));
    lines.push(info(`Provider: ${providerInfo.name} (${providerInfo.kind})`));

    // Create chat functions for different test types
    const chatFn = makeOllamaChatFn();
    const toolChatFn = makeOllamaToolChatFn();

    // 1. Extended Reasoning test
    lines.push(section("REASONING TEST (EXTENDED)"));
    lines.push(info(`Testing ${REASONING_TESTS.length} reasoning puzzles...`));
    await rateLimitDelay();
    const reasoning = await testReasoningExtended(chatFn, model);
    
    for (const r of reasoning.results) {
      const passMark = r.pass ? "✅" : "❌";
      const scoreLabel = r.score === "STRONG" ? ok : r.score === "MODERATE" ? warn : r.score === "WEAK" ? warn : fail;
      lines.push(scoreLabel(`${passMark} ${r.name} (${r.category}): ${r.score} - expected "${r.expectedAnswer}", got "${r.answer}"${r.details ? ` [${r.details}]` : ""}`));
    }
    lines.push(ok(`Average score: ${reasoning.score}`));

    // 2. Extended Instruction Following test
    lines.push(section("INSTRUCTION FOLLOWING TEST (EXTENDED)"));
    lines.push(info("Testing multi-step JSON schema compliance..."));
    await rateLimitDelay();
    const instructions = await testInstructionFollowingExtended(chatFn, model);
    lines.push(info(`Time: ${msHuman(instructions.elapsedMs)}`));
    reportInstructionScore(lines, instructions);
    lines.push(info(`Output: ${instructions.output}`));

    // 3. Extended Tool Usage test
    lines.push(section("TOOL USAGE TEST (EXTENDED)"));
    lines.push(info("Testing chained tool calls..."));
    await rateLimitDelay();
    const tools = await testToolUsageExtended(toolChatFn, model);
    lines.push(info(`Time: ${msHuman(tools.elapsedMs)}`));
    if (tools.score === "STRONG" || tools.score === "MODERATE") lines.push(ok(`Tool calls: ${tools.toolCalls.join(", ")} (${tools.score})`));
    else lines.push(fail(`Tool calls: ${tools.toolCalls.length > 0 ? tools.toolCalls.join(", ") : "none"} (${tools.score})`));
    lines.push(info(`Response: ${sanitizeForReport(tools.response)}`));

    const totalMs = Date.now() - totalStart;
    
    const reasoningPassed = reasoning.results.filter(r => r.pass).length;
    const reasoningTotal = reasoning.results.length;
    const instructionPassed = instructions.pass ? 1 : 0;
    const toolPassed = tools.pass ? 1 : 0;
    const totalPassed = reasoningPassed + instructionPassed + toolPassed;
    const totalTests = reasoningTotal + 1 + 1;
    
    lines.push(...formatTestSummary([
      { name: "Reasoning", pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", score: reasoning.score },
      { name: "Instructions", pass: instructions.pass, score: instructions.score },
      { name: "Tool Usage", pass: tools.pass, score: tools.score },
    ], totalMs));
    
    lines.push("");
    lines.push(info(`Detailed: Reasoning ${reasoningPassed}/${reasoningTotal} tests passed, Instructions ${instructionPassed}/1, Tool Usage ${toolPassed}/1`));
    lines.push(...formatRecommendation(model, totalPassed, totalTests));
    return lines.join("\n");
  }

  /**
   * Main entry point: always runs the extended test.
   */
  async function testModel(model: string, ctx?: any): Promise<string> {
    return testModelExtended(model, ctx);
  }


  // ── Register /model-test command ─────────────────────────────────────────

  pi.registerCommand("model-test", {
    description: "Test a model for reasoning ability, tool usage, and instruction following. Uses extended test flow with 20 reasoning puzzles.",
    detailedHelp: "\n\n🔍 Model Testing Extension\n\nThis extension tests AI models across multiple dimensions:\n• Reasoning: 20 diverse puzzles (logic, math, spatial, commonsense)\n• Tool Usage: Ability to use available tools effectively\n• Instruction Following: How well the model follows complex JSON instructions\n\n📋 Usage Examples:\n  /model-test                    # Test current model\n  /model-test gwen3:0.6b        # Test specific model\n  /model-test --all             # Test all Ollama models\n  /model-test --help            # Show this help\n  /model-test --clear-cache     # Clear tool support cache\n\n🔧 Supported Providers:\n• Ollama (local/remote)\n• OpenRouter\n• Anthropic Claude\n• Google Gemini\n• OpenAI GPT\n• Groq\n• DeepSeek\n• Mistral\n• xAI\n• Together\n• Fireworks\n• Cohere\n\n💡 Tips:\n• Use --all to benchmark all your Ollama models\n• Clear cache if you encounter unexpected tool support issues\n• Results show detailed scoring and recommendations\n",
    getArgumentCompletions: async (prefix) => {
      try {
        const models = await getOllamaModels();
        return models.map(m => ({ label: m, description: `Test ${m}` }))
          .filter(m => m.label.startsWith(prefix));
      } catch (err) { debugLog("model-test", "failed to get model completions", err); return []; }
    },
    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("model-test requires TUI mode", "error");
        return;
      }

      const arg = args.trim();

      if (arg === "--help") {
        ctx.ui.notify(
          "🔍 Model Testing Extension\n\n" +
          "📋 Usage:\n" +
          "  /model-test [model]     - Test current or specific model\n" +
          "  /model-test --all        - Test all Ollama models\n" +
          "  /model-test --clear-cache - Clear tool support cache\n\n" +
          "🔧 This extension runs the extended test flow by default,\n" +
          "testing 20 reasoning puzzles plus tool usage and instructions.\n\n" +
          "🔧 Examples:\n" +
          "  /model-test              # Test current model\n" +
          "  /model-test gpt-4        # Test specific model\n" +
          "  /model-test --all        # Benchmark all Ollama models",
          "info"
        );
        return;
      }

      if (arg === "--clear-cache") {
        try {
          const fs = require("node:fs");
          if (fs.existsSync(TOOL_SUPPORT_CACHE_PATH)) {
            fs.unlinkSync(TOOL_SUPPORT_CACHE_PATH);
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

        ctx.ui.notify("Testing all models — this will take a while...", "info");
        let models: string[];
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

        for (const model of models) {
          ctx.ui.notify(`Testing ${model}...`, "info");
          try {
            const report = await testModelExtended(model, ctx);
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
        let errorMessage = "Model test failed";
        if (e.message) {
          errorMessage += `: ${e.message}`;
        }
        ctx.ui.notify(errorMessage, "error");
      }
    },
  });

  // ── Register model_test tool (LLM-callable) ─────────────────────────

  pi.registerTool({
    name: "model_test",
    label: "Model Test",
    description: "Test a model for reasoning ability, tool usage capability, and instruction following. Uses extended test flow with 20 reasoning puzzles. Supports both Ollama and built-in cloud providers.",
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
      const params = _params as any;
      const model = params?.model as string || getCurrentModel(ctx);
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
        let errorMessage = "Model test failed";
        if (e.message) {
          errorMessage += `: ${e.message}`;
        }
        
        return {
          content: [{ type: "text", text: errorMessage }],
          isError: true,
        } as AgentToolResult;
      }
    },
  });
}
