// shared/react-parser.ts
function sanitizeModelJson(text) {
  text = text.replace(/:\s*True\b/g, ": true");
  text = text.replace(/:\s*False\b/g, ": false");
  text = text.replace(/:\s*None\b/g, ": null");
  text = text.replace(/\[\s*True\b/g, "[true");
  text = text.replace(/\[\s*False\b/g, "[false");
  text = text.replace(/\[\s*None\b/g, "[null");
  text = text.replace(/("(?:[^"\\]|\\.)*")\s*\+\s*[^,}'"\]\n]+/g, "$1");
  text = text.replace(/,\s*([}\]])/g, "$1");
  text = text.replace(/\\\\\\\\/g, "\\\\");
  return text;
}
var REACT_DIALECTS = [
  {
    name: "react",
    actionTag: "Action:",
    inputTag: "Action Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Action:"],
    finalTag: "Final Answer:"
  },
  {
    name: "function",
    actionTag: "Function:",
    inputTag: "Function Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Function:", "Action:"],
    finalTag: "Final Answer:"
  },
  {
    name: "tool",
    actionTag: "Tool:",
    inputTag: "Tool Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Tool:", "Action:"],
    finalTag: "Final Answer:"
  },
  {
    name: "call",
    actionTag: "Call:",
    inputTag: "Input:",
    thoughtTag: "Thought:",
    stopTags: ["Observation:", "Thought:", "Final Answer:", "Call:", "Action:"],
    finalTag: "Final Answer:"
  }
];
function buildDialectPatterns(d) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const aT = esc(d.actionTag);
  const iT = esc(d.inputTag);
  const stopAlt = d.stopTags.map(esc).join("|");
  const tT = d.thoughtTag ? esc(d.thoughtTag) : void 0;
  const fT = d.finalTag ? esc(d.finalTag) : void 0;
  const thoughtRe = tT ? new RegExp(`${tT}\\s*(.*?)(?=${aT}|${fT}|$)`, "is") : void 0;
  const actionRe = new RegExp(
    `${aT}\\s*[\\x60"']?(\\w+)[\\x60"']?\\s*\\n?\\s*${iT}\\s*(.*?)(?=\\n\\s*(?:${stopAlt})|$)`,
    "is"
  );
  const actionReSameline = new RegExp(
    `${aT}\\s*[\\x60"']?(\\w+)[\\x60"']?\\s+${iT}\\s*(.*?)(?=\\n\\s*(?:${stopAlt})|$)`,
    "is"
  );
  const actionReLoose = new RegExp(
    `${aT}\\s*(.+?)\\n\\s*${iT}\\s*(.*?)(?=\\n\\s*(?:${stopAlt})|$)`,
    "is"
  );
  const actionReParen = new RegExp(`${aT}\\s*(\\w+)\\s*\\(([^)]*)\\)`, "i");
  const finalAnswerRe = fT ? new RegExp(`${fT}\\s*([\\s\\S]*?)$`, "i") : void 0;
  return { thoughtRe, actionRe, actionReSameline, actionReLoose, actionReParen, finalAnswerRe, dialect: d };
}
var ALL_DIALECT_PATTERNS = REACT_DIALECTS.map(buildDialectPatterns);
var CLASSIC_PATTERNS = ALL_DIALECT_PATTERNS[0];
var THOUGHT_RE = CLASSIC_PATTERNS.thoughtRe;
var ACTION_RE = CLASSIC_PATTERNS.actionRe;
var ACTION_RE_SAMELINE = CLASSIC_PATTERNS.actionReSameline;
var ACTION_RE_LOOSE = CLASSIC_PATTERNS.actionReLoose;
var ACTION_RE_PAREN = CLASSIC_PATTERNS.actionReParen;
var FINAL_ANSWER_RE = CLASSIC_PATTERNS.finalAnswerRe;
function extractJsonArgs(rawArgs) {
  const start = rawArgs.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < rawArgs.length; i++) {
    if (rawArgs[i] === "{") depth++;
    else if (rawArgs[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const jsonStr = rawArgs.slice(start, end + 1);
  try {
    const parsed = JSON.parse(jsonStr);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : { input: String(parsed) };
  } catch {
  }
  try {
    const sanitized = sanitizeModelJson(jsonStr);
    const parsed = JSON.parse(sanitized);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : { input: String(parsed) };
  } catch {
  }
  const exprMatch = jsonStr.match(/['"]expression['"]:\s*['"]([^'"]+)['"]/);
  if (exprMatch) return { expression: exprMatch[1] };
  const cmdMatch = jsonStr.match(/['"]command['"]:\s*['"]([^'"]+)['"]/);
  if (cmdMatch) return { command: cmdMatch[1] };
  return { input: jsonStr };
}
function extractBraceJson(raw) {
  const jsonStart = raw.indexOf("{");
  if (jsonStart === -1) return "";
  let depth = 0;
  let jsonEnd = -1;
  for (let i = jsonStart; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") {
      depth--;
      if (depth === 0) {
        jsonEnd = i;
        break;
      }
    }
  }
  return jsonEnd !== -1 ? raw.slice(jsonStart, jsonEnd + 1) : "";
}
function parseReact(text) {
  for (const dp of ALL_DIALECT_PATTERNS) {
    const result = parseReactWithPatterns(text, dp);
    if (result) return result;
  }
  return null;
}
function parseReactWithPatterns(text, dp, tightLoose = false, availableTools) {
  let thought;
  if (dp.thoughtRe) {
    const thoughtMatch = dp.thoughtRe.exec(text);
    if (thoughtMatch) thought = thoughtMatch[1].trim();
  }
  let match = dp.actionRe.exec(text);
  if (!match) match = dp.actionReSameline.exec(text);
  let looseMatch = false;
  if (!match) {
    const looseResult = dp.actionReLoose.exec(text);
    if (looseResult) {
      if (tightLoose) {
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
    if (looseMatch && !tightLoose && availableTools) {
      const tools = availableTools || [];
      for (const real of tools) {
        const rl = real.toLowerCase().replace(/_/g, "");
        if (toolName.toLowerCase().includes(rl)) {
          toolName = real;
          break;
        }
      }
      if (toolName.includes(" ")) {
        const words = toolName.split(/\s+/);
        for (const w of words) {
          const wc = w.replace(/[^a-zA-Z0-9_-]/g, "");
          if (wc.length < 3) continue;
          for (const real of tools) {
            const rl = real.toLowerCase().replace(/_/g, "");
            if (rl.includes(wc.toLowerCase())) {
              toolName = real;
              break;
            }
          }
          if (!toolName.includes(" ")) break;
        }
      }
    }
    const rawArgs = match[2].trim().replace(/^```\w*\s*/gm, "").replace(/```\s*$/gm, "").trim();
    let args;
    if (parenMatch && rawArgs && !rawArgs.startsWith("{")) {
      const pairs = rawArgs.match(/(\w+)\s*:\s*("[^"]*"|'[^']*'|\S+)/g);
      if (pairs) {
        const obj = {};
        for (const p of pairs) {
          const colonIdx = p.indexOf(":");
          const key = p.slice(0, colonIdx).trim();
          let val = p.slice(colonIdx + 1).trim();
          if (val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
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
    let finalAnswer;
    if (dp.finalAnswerRe) {
      const faMatch = dp.finalAnswerRe.exec(text);
      if (faMatch) finalAnswer = faMatch[1].trim();
    }
    return { name: toolName, args, thought, finalAnswer, raw: match[0], dialect: dp.dialect.name };
  }
  return null;
}
function detectReactDialect(text) {
  for (const dp of ALL_DIALECT_PATTERNS) {
    const tagPattern = new RegExp(`^\\s*${dp.dialect.actionTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "im");
    if (tagPattern.test(text)) return dp.dialect;
  }
  return null;
}
function extractToolFromJson(obj) {
  if (!obj || typeof obj !== "object") return null;
  let name = obj.name || obj.function || obj.tool || obj.action;
  let args = obj.arguments || obj.parameters || obj.args || obj.actionInput || {};
  if (!name) {
    for (const key of Object.keys(obj)) {
      const kl = key.toLowerCase();
      if (kl === "action" && typeof obj[key] === "string") {
        name = obj[key];
      }
      if (kl === "action input" || kl === "actioninput" || kl === "action_input") {
        const val = obj[key];
        if (typeof val === "object" && val !== null) args = val;
        else if (val) args = { input: val };
      }
    }
  }
  if (!name) {
    const argToTool = { expression: "calculator", command: "shell" };
    const nonToolKeys = /* @__PURE__ */ new Set(["response", "method", "answer", "result", "explanation", "output", "text"]);
    const objKeys = Object.keys(obj);
    if (!objKeys.some((k) => nonToolKeys.has(k))) {
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
  return { name, args };
}
var FUZZY_MIN_PREFIX_LENGTH = 4;
var WORD_MAPPINGS = {
  calculate: ["calculator"],
  calc: ["calculator"],
  math: ["calculator"],
  compute: ["calculator"],
  eval: ["calculator"],
  expression: ["calculator"],
  power: ["calculator"],
  pow: ["calculator"],
  sqrt: ["calculator"],
  python: ["shell"],
  repl: ["shell"],
  code: ["shell"],
  execute: ["shell"],
  shell: ["bash"],
  bash: ["bash"],
  cmd: ["bash"],
  command: ["bash"],
  ls: ["bash"],
  cat: ["bash"],
  echo: ["bash"],
  grep: ["bash"],
  read: ["read"],
  write: ["write"],
  file: ["read"],
  weather: ["get_weather"],
  search: ["bash"]
};
function fuzzyMatchToolName(hallucinated, availableTools) {
  const lower = hallucinated.toLowerCase().replace(/_/g, "");
  if (availableTools.includes(hallucinated)) return hallucinated;
  for (const real of availableTools) {
    const rl = real.toLowerCase().replace(/_/g, "");
    if (rl === lower || rl.includes(lower) || lower.includes(rl)) return real;
  }
  for (const [keyword, hints] of Object.entries(WORD_MAPPINGS)) {
    if (lower.includes(keyword)) {
      for (const hint of hints) {
        for (const real of availableTools) {
          if (real.includes(hint) || real === hint) return real;
        }
      }
    }
  }
  if (lower.length >= FUZZY_MIN_PREFIX_LENGTH) {
    for (const real of availableTools) {
      const rl = real.toLowerCase();
      if (rl.length >= FUZZY_MIN_PREFIX_LENGTH && rl.slice(0, FUZZY_MIN_PREFIX_LENGTH) === lower.slice(0, FUZZY_MIN_PREFIX_LENGTH)) return real;
    }
  }
  return null;
}
var ARG_ALIASES = {
  expression: ["expr", "exp", "formula", "calculation", "math"],
  file_path: ["path", "filepath", "file", "filename", "location"],
  content: ["text", "data", "body", "value"],
  command: ["cmd", "shell", "script", "exec"],
  url: ["uri", "link", "endpoint", "address"],
  query: ["search", "term", "keywords", "q"],
  input: ["value", "arg", "parameter"],
  timeout: ["time_limit", "max_time", "seconds"]
};
function normalizeArguments(args, expectedParams) {
  if (!args || typeof args !== "object") return args;
  const expectedSet = new Set(expectedParams.map((p) => p.toLowerCase()));
  const normalized = {};
  const powerParts = {};
  for (const [key, value] of Object.entries(args)) {
    const keyLower = key.toLowerCase().replace(/-/g, "_");
    let targetParam = null;
    for (const param of expectedParams) {
      if (param.toLowerCase() === keyLower) {
        targetParam = param;
        break;
      }
    }
    if (!targetParam) {
      for (const [canonical, aliases] of Object.entries(ARG_ALIASES)) {
        if (aliases.includes(keyLower) && expectedSet.has(canonical.toLowerCase())) {
          targetParam = canonical;
          break;
        }
      }
    }
    if (!targetParam) {
      for (const param of expectedParams) {
        if (keyLower.includes(param.toLowerCase()) || keyLower.startsWith(param.toLowerCase())) {
          targetParam = param;
          break;
        }
      }
    }
    if (["base", "value", "x"].includes(keyLower) || ["exponent", "power", "n", "p", "exp"].includes(keyLower)) {
      powerParts[keyLower] = value;
      continue;
    }
    const finalKey = targetParam || key;
    if (!(finalKey in normalized)) normalized[finalKey] = value;
  }
  if (powerParts && expectedSet.has("expression")) {
    const base = powerParts.base ?? powerParts.value ?? powerParts.x;
    const exp = powerParts.exponent ?? powerParts.power ?? powerParts.n ?? powerParts.p ?? powerParts.exp;
    if (base !== void 0 && exp !== void 0) normalized.expression = `${base} ** ${exp}`;
    else if (base !== void 0) normalized.expression = String(base);
  }
  return normalized;
}
function looksLikeSchemaDump(text) {
  if (!text) return false;
  const indicators = [
    '{"function <nil>',
    '"type":"function"',
    '"parameters":{"type":"object"',
    '[{"type":',
    '"required":',
    '"properties":'
  ];
  const lower = text.toLowerCase();
  const matches = indicators.filter((i) => lower.includes(i.toLowerCase())).length;
  return matches >= 2;
}
export {
  ACTION_RE,
  ACTION_RE_LOOSE,
  ACTION_RE_PAREN,
  ACTION_RE_SAMELINE,
  ALL_DIALECT_PATTERNS,
  ARG_ALIASES,
  CLASSIC_PATTERNS,
  FINAL_ANSWER_RE,
  FUZZY_MIN_PREFIX_LENGTH,
  REACT_DIALECTS,
  THOUGHT_RE,
  WORD_MAPPINGS,
  buildDialectPatterns,
  detectReactDialect,
  extractBraceJson,
  extractJsonArgs,
  extractToolFromJson,
  fuzzyMatchToolName,
  looksLikeSchemaDump,
  normalizeArguments,
  parseReact,
  parseReactWithPatterns,
  sanitizeModelJson
};
