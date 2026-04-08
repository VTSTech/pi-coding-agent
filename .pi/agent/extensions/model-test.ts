import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Model testing extension for Pi Coding Agent.
 * Tests Ollama models for reasoning/thinking ability and tool usage capability
 * by calling the Ollama API directly (bypasses Pi's agent loop).
 *
 * Usage:
 *   /model-test              — test the current Pi model
 *   /model-test qwen3:0.6b   — test a specific model
 *   /model-test --all        — test all models in Ollama
 */
export default function (pi: ExtensionAPI) {

  const OLLAMA_BASE = "http://localhost:11434";

  // ── helpers ──────────────────────────────────────────────────────────

  function section(title: string): string {
    return `\n── ${title} ${"─".repeat(Math.max(1, 60 - title.length - 4))}`;
  }
  function ok(msg: string): string { return `  ✅ ${msg}`; }
  function fail(msg: string): string { return `  ❌ ${msg}`; }
  function warn(msg: string): string { return `  ⚠️  ${msg}`; }
  function info(msg: string): string { return `  ℹ️  ${msg}`; }

  function msHuman(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  function truncate(s: string, max: number): string {
    return s.length > max ? s.slice(0, max) + "..." : s;
  }

  /**
   * Strip markdown code fences and escape remaining backticks
   * so they don't create unwanted code blocks in the report output.
   */
  function sanitizeForReport(s: string): string {
    // Remove code fence lines: ```json, ```text, ``` with trailing spaces/newlines
    // Match ``` at start of line (with optional whitespace), optional lang tag, trailing whitespace to EOL
    let cleaned = s.replace(/^\s*```[a-zA-Z]*[ \t]*\n?/gm, '');
    // Remove any remaining standalone ``` (e.g. closing fences)
    cleaned = cleaned.replace(/^\s*```[ \t]*\n?/gm, '');
    // Normalize excessive whitespace (but keep single newlines)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    return cleaned;
  }

  /**
   * Call Ollama /api/chat and return the parsed response.
   */
  async function ollamaChat(
    model: string,
    messages: Array<{ role: string; content: string }>,
    options: Record<string, unknown> = {},
    timeoutMs = 120000
  ): Promise<{ response: any; elapsedMs: number }> {
    const start = Date.now();
    const body: any = { model, messages, stream: false, options: { num_predict: 512, temperature: 0.0, ...options } };
    const result = await pi.exec("curl", [
      "-s", "-X", "POST",
      `${OLLAMA_BASE}/api/chat`,
      "-H", "Content-Type: application/json",
      "-d", JSON.stringify(body),
    ], { timeout: timeoutMs });
    const elapsedMs = Date.now() - start;

    if (result.code !== 0) {
      throw new Error(`curl exited ${result.code}: ${result.stderr}`);
    }
    if (!result.stdout.trim()) throw new Error("Empty response from Ollama");
    const parsed = JSON.parse(result.stdout);
    return { response: parsed, elapsedMs };
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
    const prompt = `A farmer has 17 sheep. All but 9 die. How many sheep does the farmer have left? Think step by step and give the final answer on its own line like: ANSWER: <number>`;

    try {
      const { response, elapsedMs } = await ollamaChat(model, [
        { role: "user", content: prompt },
      ]);

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

      const isCorrect = answer === "9";

      // Check for reasoning patterns (step-by-step, because, therefore, etc.)
      // Note: "17 -" alone is NOT reasoning, it's just restating the problem
      const reasoningPatterns = ["because", "therefore", "since", "step", "subtract", "minus",
        "remaining", "alive", "survive", "find the", "left"];
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
    const prompt = "What is 37 × 43? Show your work.";

    try {
      // Request thinking tokens to test if model supports extended thinking
      const { response, elapsedMs } = await ollamaChat(model, [
        { role: "user", content: prompt },
      ], { think: true } as any);

      const msg = response?.message?.content || "";
      const thinking = response?.message?.thinking || "";
      const hasThinking = !!thinking && thinking.length > 10;

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
      options: { num_predict: 1024, temperature: 0.1 },
    };

    try {
      const start = Date.now();
      const result = await pi.exec("curl", [
        "-s", "-X", "POST",
        `${OLLAMA_BASE}/api/chat`,
        "-H", "Content-Type: application/json",
        "-d", JSON.stringify(body),
      ], { timeout: 240000 });
      const elapsedMs = Date.now() - start;

      if (result.code !== 0) {
        return { pass: false, score: "ERROR", hasToolCalls: false, toolCall: `curl error: ${result.stderr}`, response: "", elapsedMs };
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
    const prompt = `You must respond with ONLY a JSON object, nothing else. No markdown, no explanation, no backticks. Just the raw JSON.

Create a JSON object with these exact keys:
- "name": your model name
- "can_count": true
- "sum": the result of 15 + 27
- "language": the language you are responding in`;

    try {
      const { response, elapsedMs } = await ollamaChat(model, [
        { role: "user", content: prompt },
      ], { num_predict: 512 });

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

  // ── get models to test ───────────────────────────────────────────────

  async function getOllamaModels(): Promise<string[]> {
    const result = await pi.exec("ollama", ["list"], { timeout: 15000 });
    if (result.code !== 0) return [];
    return result.stdout
      .trim()
      .split("\n")
      .slice(1)
      .map(l => l.trim().split(/\s+/)[0])
      .filter(Boolean);
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
    `  ⚡ Pi Model Benchmark v1.0`,
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

    lines.push(info(`Size: ${modelSize}  |  Params: ${modelParams}  |  Quant: ${modelQuant}`));
    lines.push(info(`Family: ${modelFamily}  |  Modified: ${modelModified}`));

    // 1. Reasoning test
    lines.push(section("REASONING TEST"));
    lines.push(info("Prompt: \"A farmer has 17 sheep. All but 9 die. How many left?\""));
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
      lines.push(fail(`Error: ${reasoning.reasoning}`));
    }
    lines.push(info(`Response: ${sanitizeForReport(reasoning.reasoning)}`));

    // 2. Thinking test
    lines.push(section("THINKING TEST"));
    lines.push(info("Checking for extended thinking/reasoning tokens..."));

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

    // 4. Instruction following test
    lines.push(section("INSTRUCTION FOLLOWING TEST"));
    lines.push(info("Prompt: Respond with ONLY a JSON object with name, sum (15+27), etc."));
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

    // Summary
    lines.push(section("SUMMARY"));
    const totalMs = Date.now() - totalStart;
    const tests = [
      { name: "Reasoning", pass: reasoning.score === "STRONG" || reasoning.score === "MODERATE", score: reasoning.score },
      { name: "Thinking", pass: thinking.supported, score: thinking.supported ? "YES" : "NO" },
      { name: "Tool Usage", pass: tools.pass, score: tools.score },
      { name: "Instructions", pass: instructions.pass, score: instructions.score },
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
      lines.push(ok(`${model} is a STRONG model — full capability`));
    } else if (passed >= 3) {
      lines.push(ok(`${model} is a GOOD model — most capabilities work`));
    } else if (passed >= 2) {
      lines.push(warn(`${model} is USABLE — some capabilities are limited`));
    } else {
      lines.push(fail(`${model} is WEAK — limited capabilities for agent use`));
    }
    return lines.join("\n");
  }

  // ── Register /model-test command ─────────────────────────────────────

  pi.registerCommand("model-test", {
    description: "Test a model for reasoning, thinking, tool usage, and instruction following. Use: /model-test [model] or /model-test --all",
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
    description: "Test an Ollama model for reasoning ability, thinking/reasoning token support, tool usage capability, and instruction following. Returns a detailed report with scores.",
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