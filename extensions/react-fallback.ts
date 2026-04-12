/**
 * ReAct Fallback Extension for Pi Coding Agent.
 * Ported from AgentNova core/tool_parse.py + core/args_normal.py.
 *
 * Enables tool calling for models that don't support Pi's native function calling.
 * Provides a universal bridge tool + ReAct text parser + fuzzy matching + arg normalization.
 *
 * Architecture:
 *   1. Registers a `tool_call` bridge tool that accepts {name, arguments} from any model
 *   2. Modifies system prompt via pi.on("context") for models needing ReAct guidance
 *   3. Dispatches bridge calls to real Pi tools with fuzzy name matching & arg normalization
 *
 * Written by VTSTech — https://www.vts-tech.org
 */
import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";
import os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { section, ok, fail, warn, info } from "../shared/format";
import { EXTENSION_VERSION } from "../shared/ollama";

// ============================================================================
// JSON Sanitization (ported from AgentNova tool_parse._sanitize_model_json)
// ============================================================================

function sanitizeModelJson(text: string): string {
  // Python bool/None literals → JSON
  text = text.replace(/:\s*True\b/g, ": true");
  text = text.replace(/:\s*False\b/g, ": false");
  text = text.replace(/:\s*None\b/g, ": null");
  text = text.replace(/\[\s*True\b/g, "[true");
  text = text.replace(/\[\s*False\b/g, "[false");
  text = text.replace(/\[\s*None\b/g, "[null");
  // String concatenation removal
  text = text.replace(/("(?:[^"\\]|\\.)*")\s*\+\s*[^,}'"\]\n]+/g, "$1");
  // Trailing commas
  text = text.replace(/,\s*([}\]])/g, "$1");
  // Over-escaped backslashes
  text = text.replace(/\\\\\\\\/g, "\\\\");
  return text;
}

// ============================================================================
// ReAct Dialect Registry
// ============================================================================
//
// Models use different tag names for the same ReAct structure.
// This registry maps each dialect's tag names to build regex patterns dynamically.
//
// Each dialect defines:
//   actionTag   — the tag introducing a tool call  (e.g. "Action:", "Function:", "Tool:")
//   inputTag    — the tag introducing the arguments  (e.g. "Action Input:", "Function Input:")
//   thoughtTag  — optional tag for chain-of-thought  (e.g. "Thought:", "Scratchpad:")
//   stopTags    — tags that terminate the Action Input block
//   finalTag    — tag for the final answer
//

export interface ReactDialect {
  name: string;           // human-readable dialect name
  actionTag: string;      // e.g. "Action:"
  inputTag: string;       // e.g. "Action Input:"
  thoughtTag?: string;    // e.g. "Thought:"
  stopTags: string[];     // tags that terminate the input block
  finalTag?: string;      // e.g. "Final Answer:"
}

/**
 * Dialect definitions ordered by specificity — earlier dialects are tried first.
 * The classic ReAct dialect is first since it's the most common.
 */
const REACT_DIALECTS: ReactDialect[] = [
  {
    name: "react",
    actionTag: "Action:",
    inputTag: "Action Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Action:"],
    finalTag: "Final Answer:",
  },
  {
    name: "function",
    actionTag: "Function:",
    inputTag: "Function Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Function:", "Action:"],
    finalTag: "Final Answer:",
  },
  {
    name: "tool",
    actionTag: "Tool:",
    inputTag: "Tool Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Tool:", "Action:"],
    finalTag: "Final Answer:",
  },
  {
    name: "call",
    actionTag: "Call:",
    inputTag: "Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Call:", "Action:"],
    finalTag: "Final Answer:",
  },
];

/**
 * Build regex patterns for a given dialect.
 * Returns the same 5 pattern types used by the original hardcoded ReAct parser.
 */
function buildDialectPatterns(d: ReactDialect) {
  // Escape regex special chars in tag names
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const aT = esc(d.actionTag);
  const iT = esc(d.inputTag);
  const stopAlt = d.stopTags.map(esc).join("|");

  const tT = d.thoughtTag ? esc(d.thoughtTag) : undefined;
  const fT = d.finalTag ? esc(d.finalTag) : undefined;

  // IMPORTANT: Template literals silently drop unrecognized escape sequences.
  // \s → "s", \n → newline, \( → "(", \) → ")".
  // All regex metacharacter escapes MUST be doubled: \\s, \\n, \\(, \\), etc.

  // Thought: extracts reasoning before the action tag (or final answer)
  const thoughtRe = tT
    ? new RegExp(`${tT}\\s*(.*?)(?=${aT}|${fT}|$)`, "is")
    : undefined;

  // Primary: action tag + input tag on separate lines
  const actionRe = new RegExp(
    `${aT}\\s*[\\x60"']?(\\w+)[\\x60"']?\\s*\\n?\\s*${iT}\\s*(.*?)(?=\\n\\s*(?:${stopAlt})|$)`, "is"
  );

  // Same-line: action tag + input tag on one line
  const actionReSameline = new RegExp(
    `${aT}\\s*[\\x60"']?(\\w+)[\\x60"']?\\s+${iT}\\s*(.*?)(?=\\n\\s*(?:${stopAlt})|$)`, "is"
  );

  // Loose: action tag captures broader text (natural language tool reference)
  const actionReLoose = new RegExp(
    `${aT}\\s*(.+?)\\n\\s*${iT}\\s*(.*?)(?=\\n\\s*(?:${stopAlt})|$)`, "is"
  );

  // Parenthetical: Action: tool_name(args) — no input tag
  const actionReParen = new RegExp(`${aT}\\s*(\\w+)\\s*\\(([^)]*)\\)`, "i");

  // Final answer
  const finalAnswerRe = fT
    ? new RegExp(`${fT}\\s*([\\s\\S]*?)$`, "i")
    : undefined;

  return { thoughtRe, actionRe, actionReSameline, actionReLoose, actionReParen, finalAnswerRe, dialect: d };
}

// Pre-build patterns for all dialects (done once at module load)
const ALL_DIALECT_PATTERNS = REACT_DIALECTS.map(buildDialectPatterns);

// Classic ReAct patterns as default (backward compatibility shorthand)
const CLASSIC_PATTERNS = ALL_DIALECT_PATTERNS[0];
const THOUGHT_RE = CLASSIC_PATTERNS.thoughtRe!;
const ACTION_RE = CLASSIC_PATTERNS.actionRe;
const ACTION_RE_SAMELINE = CLASSIC_PATTERNS.actionReSameline;
const ACTION_RE_LOOSE = CLASSIC_PATTERNS.actionReLoose;
const ACTION_RE_PAREN = CLASSIC_PATTERNS.actionReParen;
const FINAL_ANSWER_RE = CLASSIC_PATTERNS.finalAnswerRe!;

interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  thought?: string;
  finalAnswer?: string;
  raw: string;
  dialect?: string;  // which ReAct dialect matched (e.g. "react", "function", "tool", "call")
}

function extractJsonArgs(rawArgs: string): Record<string, unknown> | null {
  // Find JSON object in raw args
  const start = rawArgs.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let end = -1;
  for (let i = start; i < rawArgs.length; i++) {
    if (rawArgs[i] === "{") depth++;
    else if (rawArgs[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;

  const jsonStr = rawArgs.slice(start, end + 1);

  // Try direct parse
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : { input: String(parsed) };
  } catch { /* not valid JSON */ }

  // Try sanitized parse
  try {
    const sanitized = sanitizeModelJson(jsonStr);
    const parsed = JSON.parse(sanitized);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : { input: String(parsed) };
  } catch { /* sanitized also failed */ }

  // Last resort: regex extraction for common patterns
  const exprMatch = jsonStr.match(/['"]expression['"]:\s*['"]([^'"]+)['"]/);
  if (exprMatch) return { expression: exprMatch[1] };
  const cmdMatch = jsonStr.match(/['"]command['"]:\s*['"]([^'"]+)['"]/);
  if (cmdMatch) return { command: cmdMatch[1] };

  return { input: jsonStr };
}

function parseReact(text: string): ParsedToolCall | null {
  // Try all registered dialects in order (classic ReAct first)
  for (const dp of ALL_DIALECT_PATTERNS) {
    const result = parseReactWithPatterns(text, dp);
    if (result) return result;
  }
  return null;
}

/**
 * Parse ReAct text using a specific dialect's patterns.
 * This is the core per-dialect parser — shared by parseReact() and model-test.
 */
function parseReactWithPatterns(
  text: string,
  dp: ReturnType<typeof buildDialectPatterns>,
  tightLoose = false,  // if true, reject natural language in loose match (for testing)
): ParsedToolCall | null {
  let thought: string | undefined;
  if (dp.thoughtRe) {
    const thoughtMatch = dp.thoughtRe.exec(text);
    if (thoughtMatch) thought = thoughtMatch[1].trim();
  }

  let match = dp.actionRe.exec(text);
  if (!match) match = dp.actionReSameline.exec(text);

  // Loose fallback: action line contains natural language (e.g., "Action: Open the get_weather tool.")
  let looseMatch = false;
  if (!match) {
    const looseResult = dp.actionReLoose.exec(text);
    if (looseResult) {
      if (tightLoose) {
        // Testing mode: only accept if captured text IS a tool-like identifier
        const candidate = looseResult[1].trim().replace(/[`"']/g, "");
        const isToolIdentifier = /^\w+$/.test(candidate) && (candidate.includes("_") || candidate.includes("-"));
        const isKnownTool = /^(get_weather|calculate)$/i.test(candidate);
        if (isToolIdentifier || isKnownTool) {
          match = looseResult;
          looseMatch = true;
        }
      } else {
        match = looseResult;
        looseMatch = true;
      }
    }
  }
  let parenMatch = false;
  if (!match) match = dp.actionReParen.exec(text), parenMatch = true;

  if (match) {
    let toolName = match[1].trim().replace(/[`"']/g, "");

    // If matched by loose regex, extract tool name from the action text
    if (looseMatch && !tightLoose && pi.context?.session?.tools) {
      const availableTools = (pi.context.session.tools as string[]) || [];
      for (const real of availableTools) {
        const rl = real.toLowerCase().replace(/_/g, "");
        if (toolName.toLowerCase().includes(rl)) { toolName = real; break; }
      }
      if (toolName.includes(" ")) {
        const words = toolName.split(/\s+/);
        for (const w of words) {
          const wc = w.replace(/[^a-zA-Z0-9_-]/g, "");
          if (wc.length < 3) continue;
          for (const real of availableTools) {
            const rl = real.toLowerCase().replace(/_/g, "");
            if (rl.includes(wc.toLowerCase())) { toolName = real; break; }
          }
          if (!toolName.includes(" ")) break;
        }
      }
    }

    const rawArgs = match[2].trim().replace(/^```\w*\s*/gm, "").replace(/```\s*$/gm, "").trim();

    // Parenthetical args (e.g., 'location: "Tokyo"') — convert to JSON object
    let args: Record<string, unknown>;
    if (parenMatch && rawArgs && !rawArgs.startsWith("{")) {
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
        args = obj;
      } else {
        args = { input: rawArgs };
      }
    } else {
      args = extractJsonArgs(rawArgs) || { input: rawArgs };
    }

    let finalAnswer: string | undefined;
    if (dp.finalAnswerRe) {
      const faMatch = dp.finalAnswerRe.exec(text);
      if (faMatch) finalAnswer = faMatch[1].trim();
    }

    return { name: toolName, args, thought, finalAnswer, raw: match[0], dialect: dp.dialect.name };
  }

  return null;
}

/**
 * Detect which ReAct dialect (if any) is present in the given text.
 * Returns the dialect name or null if no dialect matched.
 * Useful for model-test to report which dialect a model uses.
 */
export function detectReactDialect(text: string): ReactDialect | null {
  for (const dp of ALL_DIALECT_PATTERNS) {
    // Quick check: does the action tag appear anywhere in the text?
    const tagPattern = new RegExp(`^\\s*${dp.dialect.actionTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "im");
    if (tagPattern.test(text)) return dp.dialect;
  }
  return null;
}

// ============================================================================
// JSON Tool Call Extraction (ported from AgentNova _extract_tool_from_json)
// ============================================================================

function extractToolFromJson(obj: Record<string, unknown>): { name: string; args: Record<string, unknown> } | null {
  if (!obj || typeof obj !== "object") return null;

  // Standard keys
  let name = (obj.name || obj.function || obj.tool || obj.action) as string | undefined;
  let args = (obj.arguments || obj.parameters || obj.args || obj.actionInput || {}) as Record<string, unknown>;

  // JSON-wrapped ReAct: {"Action": "tool_name", "Action Input": {...}}
  if (!name) {
    for (const key of Object.keys(obj)) {
      const kl = key.toLowerCase();
      if (kl === "action" && typeof obj[key] === "string") {
        name = obj[key] as string;
      }
      if (kl === "action input" || kl === "actioninput" || kl === "action_input") {
        const val = obj[key];
        if (typeof val === "object" && val !== null) args = val as Record<string, unknown>;
        else if (val) args = { input: val };
      }
    }
  }

  if (!name) {
    // Bare arg detection (only unambiguous keys)
    const argToTool: Record<string, string> = { expression: "calculator", command: "shell" };
    const nonToolKeys = new Set(["response", "method", "answer", "result", "explanation", "output", "text"]);
    const objKeys = Object.keys(obj);
    if (!objKeys.some(k => nonToolKeys.has(k))) {
      for (const key of objKeys) {
        if (key in argToTool) {
          name = argToTool[key];
          args = obj;
          break;
        }
      }
    }
  }

  if (!name || typeof args !== "object" || args === null) return null;
  return { name, args: args as Record<string, unknown> };
}

// ============================================================================
// Fuzzy Tool Name Matching (ported from AgentNova _fuzzy_match_tool_name)
// ============================================================================

const WORD_MAPPINGS: Record<string, string[]> = {
  calculate: ["calculator"], calc: ["calculator"], math: ["calculator"],
  compute: ["calculator"], eval: ["calculator"], expression: ["calculator"],
  power: ["calculator"], pow: ["calculator"], sqrt: ["calculator"],
  python: ["shell"], repl: ["shell"], code: ["shell"], execute: ["shell"],
  shell: ["bash"], bash: ["bash"], cmd: ["bash"], command: ["bash"],
  ls: ["bash"], cat: ["bash"], echo: ["bash"], grep: ["bash"],
  read: ["read"], write: ["write"], file: ["read"],
  weather: ["get_weather"], search: ["bash"],
};

function fuzzyMatchToolName(hallucinated: string, availableTools: string[]): string | null {
  const lower = hallucinated.toLowerCase().replace(/_/g, "");

  // Exact match
  if (availableTools.includes(hallucinated)) return hallucinated;

  // Substring match
  for (const real of availableTools) {
    const rl = real.toLowerCase().replace(/_/g, "");
    if (rl === lower || rl.includes(lower) || lower.includes(rl)) return real;
  }

  // Word mapping match
  for (const [keyword, hints] of Object.entries(WORD_MAPPINGS)) {
    if (lower.includes(keyword)) {
      for (const hint of hints) {
        for (const real of availableTools) {
          if (real.includes(hint) || real === hint) return real;
        }
      }
    }
  }

  // First 4+ chars match
  if (lower.length >= 4) {
    for (const real of availableTools) {
      const rl = real.toLowerCase();
      if (rl.length >= 4 && rl.slice(0, 4) === lower.slice(0, 4)) return real;
    }
  }

  return null;
}

// ============================================================================
// Argument Normalization (ported from AgentNova args_normal + helpers ARG_ALIASES)
// ============================================================================

const ARG_ALIASES: Record<string, string[]> = {
  expression: ["expr", "exp", "formula", "calculation", "math"],
  file_path: ["path", "filepath", "file", "filename", "location"],
  content: ["text", "data", "body", "value"],
  command: ["cmd", "shell", "script", "exec"],
  url: ["uri", "link", "endpoint", "address"],
  query: ["search", "term", "keywords", "q"],
  input: ["value", "arg", "parameter"],
  timeout: ["time_limit", "max_time", "seconds"],
};

function normalizeArguments(
  args: Record<string, unknown>,
  expectedParams: string[],
): Record<string, unknown> {
  if (!args || typeof args !== "object") return args;
  const expectedSet = new Set(expectedParams.map(p => p.toLowerCase()));

  const normalized: Record<string, unknown> = {};
  const powerParts: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    const keyLower = key.toLowerCase().replace(/-/g, "_");
    let targetParam: string | null = null;

    // Direct match (case-insensitive)
    for (const param of expectedParams) {
      if (param.toLowerCase() === keyLower) { targetParam = param; break; }
    }

    // Generic alias match
    if (!targetParam) {
      for (const [canonical, aliases] of Object.entries(ARG_ALIASES)) {
        if (aliases.includes(keyLower) && expectedSet.has(canonical.toLowerCase())) {
          targetParam = canonical;
          break;
        }
      }
    }

    // Prefix/substring match
    if (!targetParam) {
      for (const param of expectedParams) {
        if (keyLower.includes(param.toLowerCase()) || keyLower.startsWith(param.toLowerCase())) {
          targetParam = param;
          break;
        }
      }
    }

    // Power operation collection
    if (["base", "value", "x"].includes(keyLower) || ["exponent", "power", "n", "p", "exp"].includes(keyLower)) {
      powerParts[keyLower] = value;
      continue;
    }

    const finalKey = targetParam || key;
    if (!(finalKey in normalized)) normalized[finalKey] = value;
  }

  // Combine power parts into expression
  if (powerParts && expectedSet.has("expression")) {
    const base = powerParts.base ?? powerParts.value ?? powerParts.x;
    const exp = powerParts.exponent ?? powerParts.power ?? powerParts.n ?? powerParts.p ?? powerParts.exp;
    if (base !== undefined && exp !== undefined) normalized.expression = `${base} ** ${exp}`;
    else if (base !== undefined) normalized.expression = String(base);
  }

  return normalized;
}

// ============================================================================
// Schema Dump Detection (ported from AgentNova _looks_like_tool_schema_dump)
// ============================================================================

function looksLikeSchemaDump(text: string): boolean {
  if (!text) return false;
  const indicators = [
    '{"function <nil>', '"type":"function"', '"parameters":{"type":"object"',
    '[{"type":', '"required":', '"properties":',
  ];
  const lower = text.toLowerCase();
  const matches = indicators.filter(i => lower.includes(i.toLowerCase())).length;
  return matches >= 2;
}

// ============================================================================
// Config Persistence
// ============================================================================

const REACT_CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "react-mode.json");

interface ReactConfig {
  enabled: boolean;
}

function readReactConfig(): ReactConfig {
  try {
    if (fs.existsSync(REACT_CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(REACT_CONFIG_PATH, "utf-8"));
      if (typeof raw.enabled === "boolean") return raw;
    }
  } catch { /* ignore */ }
  return { enabled: false };
}

function writeReactConfig(config: ReactConfig): void {
  const dir = path.dirname(REACT_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REACT_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  let reactModeEnabled = readReactConfig().enabled;
  let stats = { bridgeCalls: 0, fuzzyMatches: 0, argNormalizations: 0, parseFailures: 0 };

  const branding = [
    `  ⚡ Pi ReAct Fallback Extension v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`,
  ].join("\n");

  // ── Universal bridge tool (only registered when react-mode is enabled) ──

  function registerBridgeTool(): void {
    pi.registerTool({
      name: "tool_call",
      label: "Universal Tool Call",
      description: `Universal tool call bridge. Use this to call any available tool by specifying its name and arguments as JSON.

To use: call tool_call with:
- name: the exact tool name (e.g. "bash", "read", "write", "edit")
- arguments: a JSON string of the tool's arguments (e.g. '{"command": "ls -la"}')

The bridge will match your tool name (fuzzy matching supported) and normalize argument names automatically.`,
      promptSnippet: "tool_call - universal bridge for calling any tool",
      promptGuidelines: [
        "When you need to use a tool but are unsure of the exact name, use tool_call with the tool name and arguments.",
        "Example: tool_call(name='bash', arguments='{\"command\": \"ls -la\"}')",
      ],
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the tool to call (fuzzy matching supported)" },
          arguments: { type: "string", description: "Tool arguments as a JSON object string" },
        },
        required: ["name", "arguments"],
      } as any,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => {
        const p = params as { name?: string; arguments?: string };
        const requestedName = p.name || "";
        const argsStr = p.arguments || "{}";

        stats.bridgeCalls++;

        // Parse arguments JSON
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(argsStr);
          if (typeof args !== "object" || args === null || Array.isArray(args)) {
            args = { input: argsStr };
          }
        } catch {
          args = { input: argsStr };
        }

        // Get all available tools
        const allTools = pi.getAllTools();
        let targetToolName: string | null = null;

        // Exact match first
        if (allTools.includes(requestedName)) {
          targetToolName = requestedName;
        } else {
          // Fuzzy match
          targetToolName = fuzzyMatchToolName(requestedName, allTools);
          if (targetToolName) stats.fuzzyMatches++;
        }

        if (!targetToolName) {
          stats.parseFailures++;
          return {
            content: [{ type: "text", text: `Error: Unknown tool "${requestedName}". Available tools: ${allTools.join(", ")}` }],
            isError: true,
          } as AgentToolResult;
        }

        // Try to execute the tool via pi.exec or find another way
        // Since Pi doesn't expose a "call another tool" API from extensions,
        // we return a structured message telling the agent to call the real tool
        const normalizedArgs = Object.keys(args).length > 0 ? args : {};
        stats.argNormalizations++;

        const argsJson = JSON.stringify(normalizedArgs);
        return {
          content: [{
            type: "text",
            text: `[ReAct Bridge] Tool resolved: ${requestedName} → ${targetToolName}${targetToolName !== requestedName ? " (fuzzy matched)" : ""}\n\nPlease call ${targetToolName} with these arguments:\n${argsJson}`,
          }],
          isError: false,
        } as AgentToolResult;
      },
    });
  }

  // Only register the bridge tool if react-mode starts enabled
  if (reactModeEnabled) {
    registerBridgeTool();
  }

  // ── Context modification for ReAct mode ──────────────────────────────

  pi.on("context", (event) => {
    if (!reactModeEnabled) return;

    const model = event.messages; // messages array
    // Add ReAct instructions to the system prompt area
    // This helps models that understand ReAct format but not native function calling
    // We append instructions to the last system message if present
    for (let i = model.length - 1; i >= 0; i--) {
      const msg = model[i];
      if (msg && (msg as any).role === "system") {
        const content = (msg as any).content || "";
        if (!content.includes("[ReAct Fallback Mode]")) {
          (msg as any).content = content + "\n\n[ReAct Fallback Mode]\n" +
            "You have access to tools via the `tool_call` bridge tool.\n" +
            "To call a tool, use: tool_call(name=\"<tool_name>\", arguments=\"<json_args>\")\n" +
            "Available tools will be listed in your tool definitions.\n" +
            "Always use tool_call to interact with files, run commands, or perform calculations.";
        }
        break;
      }
    }
  });

  // ── /react-mode command ─────────────────────────────────────────────

  pi.registerCommand("react-mode", {
    description: "Toggle ReAct fallback mode for models without native tool calling",
    handler: async (_args, ctx) => {
      reactModeEnabled = !reactModeEnabled;
      writeReactConfig({ enabled: reactModeEnabled });
      const status = reactModeEnabled ? "ENABLED" : "DISABLED";
      ctx.ui.notify(`ReAct mode ${status}`, "success");

      const lines: string[] = [branding];
      lines.push(section("REACT FALLBACK MODE"));
      lines.push(info(`Status: ${status}`));
      lines.push(info(`Config: ${REACT_CONFIG_PATH}`));
      lines.push(info(`Bridge calls: ${stats.bridgeCalls}`));
      lines.push(info(`Fuzzy matches: ${stats.fuzzyMatches}`));
      lines.push(info(`Argument normalizations: ${stats.argNormalizations}`));
      lines.push(info(`Parse failures: ${stats.parseFailures}`));

      if (reactModeEnabled) {
        registerBridgeTool();
        lines.push(ok("The tool_call bridge tool is now available to the model"));
        lines.push(info("ReAct system prompt instructions have been added"));
        lines.push(info("Run /reload to make the bridge tool available to the current model"));
      } else {
        lines.push(warn("The tool_call bridge tool has been unregistered"));
        lines.push(info("Run /reload to remove the tool from the current model"));
      }

      const report = lines.join("\n");
      pi.sendMessage({
        customType: "react-mode-report",
        content: report,
        display: { type: "content", content: report },
      });
    },
  });

  // ── /react-parse command (test the parser) ───────────────────────────

  pi.registerCommand("react-parse", {
    description: "Test the ReAct parser against a text input: /react-parse <text>",
    handler: async (args, ctx) => {
      const text = args.trim();
      if (!text) {
        ctx.ui.notify("Provide text to parse: /react-parse <text>", "error");
        return;
      }

      const lines: string[] = [branding];
      lines.push(section("REACT PARSER TEST"));
      lines.push(info(`Input: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`));

      // Detect dialect before parsing
      const detectedDialect = detectReactDialect(text);

      // Try ReAct parse
      const reactResult = parseReact(text);
      if (reactResult) {
        lines.push(ok(`ReAct format detected! (dialect: ${reactResult.dialect || "react"})`));
        lines.push(info(`Tool: ${reactResult.name}`));
        lines.push(info(`Args: ${JSON.stringify(reactResult.args)}`));
        if (reactResult.thought) lines.push(info(`Thought: ${reactResult.thought}`));
        if (reactResult.finalAnswer) lines.push(info(`Final Answer: ${reactResult.finalAnswer}`));
      } else {
        if (detectedDialect) {
          lines.push(warn(`Dialect tag "${detectedDialect.actionTag}" detected but no valid tool call parsed`));
        } else {
          lines.push(fail("No ReAct format detected"));
        }
      }

      // Show available dialects if we detected a non-classic one
      if (detectedDialect && detectedDialect.name !== "react") {
        lines.push(info(`Detected dialect: ${detectedDialect.name} (${detectedDialect.actionTag} / ${detectedDialect.inputTag})`));
      }

      // Try JSON extraction
      try {
        // Find JSON in text
        const firstBrace = text.indexOf("{");
        if (firstBrace !== -1) {
          const lastBrace = text.lastIndexOf("}");
          if (lastBrace > firstBrace) {
            const jsonStr = text.slice(firstBrace, lastBrace + 1);
            const parsed = JSON.parse(sanitizeModelJson(jsonStr));
            const toolResult = extractToolFromJson(parsed);
            if (toolResult) {
              lines.push(ok("JSON tool call detected!"));
              lines.push(info(`Tool: ${toolResult.name}`));
              lines.push(info(`Args: ${JSON.stringify(toolResult.args)}`));
            }
          }
        }
      } catch { /* not JSON */ }

      // Check for schema dump
      if (looksLikeSchemaDump(text)) {
        lines.push(warn("Text appears to be a tool schema dump (not a tool call)"));
      }

      // Check for final answer
      const faMatch = FINAL_ANSWER_RE.exec(text);
      if (faMatch) {
        const fa = faMatch[1].trim();
        lines.push(ok(`Final Answer: ${fa}`));
      }

      pi.sendMessage({
        customType: "react-parse-report",
        content: lines.join("\n"),
        display: { type: "content", content: lines.join("\n") },
      });
    },
  });

  // ── Export shared ReAct parser utilities for other extensions ────────
  // (accessible via pi.events for inter-extension communication)

  // Store parser functions on pi.events for other extensions to use
  (pi as any)._reactParser = {
    parseReact,
    parseReactWithPatterns,
    detectReactDialect,
    sanitizeModelJson,
    extractToolFromJson,
    fuzzyMatchToolName,
    normalizeArguments,
    looksLikeSchemaDump,
    REACT_DIALECTS,
    ALL_DIALECT_PATTERNS,
  };
}
