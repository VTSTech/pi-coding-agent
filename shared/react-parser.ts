/**
 * Shared ReAct Parser for Pi Coding Agent.
 * Ported from AgentNova core/tool_parse.py + core/args_normal.py.
 *
 * This module contains the pure parsing logic for ReAct-format tool calls,
 * independent of the Pi Extension API. Extensions (react-fallback, model-test)
 * import from here to avoid code duplication.
 *
 * Written by VTSTech — https://www.vts-tech.org
 */

// ============================================================================
// JSON Sanitization (ported from AgentNova tool_parse._sanitize_model_json)
// ============================================================================

export function sanitizeModelJson(text: string): string {
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
export const REACT_DIALECTS: ReactDialect[] = [
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
export function buildDialectPatterns(d: ReactDialect) {
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

/** Type returned by buildDialectPatterns, for use as parameter types. */
export type DialectPatterns = ReturnType<typeof buildDialectPatterns>;

// Pre-build patterns for all dialects (done once at module load)
export const ALL_DIALECT_PATTERNS = REACT_DIALECTS.map(buildDialectPatterns);

// Classic ReAct patterns as default (backward compatibility shorthand)
export const CLASSIC_PATTERNS = ALL_DIALECT_PATTERNS[0];
export const THOUGHT_RE = CLASSIC_PATTERNS.thoughtRe!;
export const ACTION_RE = CLASSIC_PATTERNS.actionRe;
export const ACTION_RE_SAMELINE = CLASSIC_PATTERNS.actionReSameline;
export const ACTION_RE_LOOSE = CLASSIC_PATTERNS.actionReLoose;
export const ACTION_RE_PAREN = CLASSIC_PATTERNS.actionReParen;
export const FINAL_ANSWER_RE = CLASSIC_PATTERNS.finalAnswerRe!;

export interface ParsedToolCall {
  name: string;
  args: Record<string, unknown>;
  thought?: string;
  finalAnswer?: string;
  raw: string;
  dialect?: string;  // which ReAct dialect matched (e.g. "react", "function", "tool", "call")
}

export function extractJsonArgs(rawArgs: string): Record<string, unknown> | null {
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
  } catch { /* not valid JSON — expected for non-JSON tool arguments */ }

  // Try sanitized parse
  try {
    const sanitized = sanitizeModelJson(jsonStr);
    const parsed = JSON.parse(sanitized);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : { input: String(parsed) };
  } catch { /* sanitized parse also failed — will fall through to regex extraction */ }

  // Last resort: regex extraction for common patterns
  const exprMatch = jsonStr.match(/['"]expression['"]:\s*['"]([^'"]+)['"]/);
  if (exprMatch) return { expression: exprMatch[1] };
  const cmdMatch = jsonStr.match(/['"]command['"]:\s*['"]([^'"]+)['"]/);
  if (cmdMatch) return { command: cmdMatch[1] };

  return { input: jsonStr };
}

/**
 * Extract a raw JSON object string from text by matching balanced braces.
 * Returns the JSON substring (or empty string if none found).
 * Used by model-test for extracting Action Input arguments from ReAct responses
 * when the parsed args object is empty but raw match text may contain JSON.
 */
export function extractBraceJson(raw: string): string {
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) return "";
  let depth = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") { depth--; if (depth === 0) { jsonEnd = i; break; } }
  }
  return jsonEnd !== -1 ? raw.slice(jsonStart, jsonEnd + 1) : "";
}

export function parseReact(text: string): ParsedToolCall | null {
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
 *
 * @param text          The raw model output to parse
 * @param dp            Pre-built dialect patterns from buildDialectPatterns()
 * @param tightLoose    If true, reject natural language in loose match (for testing)
 * @param availableTools  Optional list of available tool names for loose-match resolution.
 *                       When provided, the loose match handler will try to resolve tool names
 *                       from the action text. When omitted, the loose match still runs but
 *                       won't do name resolution against real tools.
 */
export function parseReactWithPatterns(
  text: string,
  dp: DialectPatterns,
  tightLoose = false,  // if true, reject natural language in loose match (for testing)
  availableTools?: string[],  // optional: real tool names for loose-match resolution
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
    // Only when availableTools are provided (avoids dependency on Pi ExtensionAPI)
    if (looseMatch && !tightLoose && availableTools) {
      const tools = availableTools || [];
      for (const real of tools) {
        const rl = real.toLowerCase().replace(/_/g, "");
        if (toolName.toLowerCase().includes(rl)) { toolName = real; break; }
      }
      if (toolName.includes(" ")) {
        const words = toolName.split(/\s+/);
        for (const w of words) {
          const wc = w.replace(/[^a-zA-Z0-9_-]/g, "");
          if (wc.length < 3) continue;
          for (const real of tools) {
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

export function extractToolFromJson(obj: Record<string, unknown>): { name: string; args: Record<string, unknown> } | null {
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

/**
 * Minimum prefix length required for fuzzy prefix matching.
 * Prevents overly aggressive matches like "c" → "calculator" or "s" → "shell".
 */
export const FUZZY_MIN_PREFIX_LENGTH = 4;

export const WORD_MAPPINGS: Record<string, string[]> = {
  calculate: ["calculator"], calc: ["calculator"], math: ["calculator"],
  compute: ["calculator"], eval: ["calculator"], expression: ["calculator"],
  power: ["calculator"], pow: ["calculator"], sqrt: ["calculator"],
  python: ["shell"], repl: ["shell"], code: ["shell"], execute: ["shell"],
  shell: ["bash"], bash: ["bash"], cmd: ["bash"], command: ["bash"],
  ls: ["bash"], cat: ["bash"], echo: ["bash"], grep: ["bash"],
  read: ["read"], write: ["write"], file: ["read"],
  weather: ["get_weather"], search: ["bash"],
};

/**
 * Fuzzy-match a hallucinated tool name against a list of available tools.
 * Returns the best matching real tool name, or null if no match found.
 */
export function fuzzyMatchToolName(hallucinated: string, availableTools: string[]): string | null {
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

  // First N chars match — both strings must be >= FUZZY_MIN_PREFIX_LENGTH
  if (lower.length >= FUZZY_MIN_PREFIX_LENGTH) {
    for (const real of availableTools) {
      const rl = real.toLowerCase();
      if (rl.length >= FUZZY_MIN_PREFIX_LENGTH && rl.slice(0, FUZZY_MIN_PREFIX_LENGTH) === lower.slice(0, FUZZY_MIN_PREFIX_LENGTH)) return real;
    }
  }

  return null;
}

// ============================================================================
// Argument Normalization (ported from AgentNova args_normal + helpers ARG_ALIASES)
// ============================================================================

export const ARG_ALIASES: Record<string, string[]> = {
  expression: ["expr", "exp", "formula", "calculation", "math"],
  file_path: ["path", "filepath", "file", "filename", "location"],
  content: ["text", "data", "body", "value"],
  command: ["cmd", "shell", "script", "exec"],
  url: ["uri", "link", "endpoint", "address"],
  query: ["search", "term", "keywords", "q"],
  input: ["value", "arg", "parameter"],
  timeout: ["time_limit", "max_time", "seconds"],
};

export function normalizeArguments(
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

export function looksLikeSchemaDump(text: string): boolean {
  if (!text) return false;
  const indicators = [
    '{"function <nil>', '"type":"function"', '"parameters":{"type":"object"',
    '[{"type":', '"required":', '"properties":',
  ];
  const lower = text.toLowerCase();
  const matches = indicators.filter(i => lower.includes(i.toLowerCase())).length;
  return matches >= 2;
}
