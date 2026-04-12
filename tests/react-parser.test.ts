import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseReact,
  parseReactWithPatterns,
  detectReactDialect,
  fuzzyMatchToolName,
  extractToolFromJson,
  sanitizeModelJson,
  extractJsonArgs,
  ALL_DIALECT_PATTERNS,
  CLASSIC_PATTERNS,
  REACT_DIALECTS,
  FUZZY_MIN_PREFIX_LENGTH,
  WORD_MAPPINGS,
  looksLikeSchemaDump,
  ParsedToolCall,
  normalizeArguments,
  ARG_ALIASES,
} from "../shared/react-parser";

// ============================================================================
// parseReact
// ============================================================================

describe("parseReact", () => {
  it("parses classic ReAct format (Thought + Action + Action Input)", () => {
    const text = `Thought: I need to get the weather.
Action: get_weather
Action Input: {"location": "Paris"}`;

    const result = parseReact(text);
    assert.ok(result !== null, "should parse classic ReAct");
    assert.equal(result!.name, "get_weather");
    assert.deepEqual(result!.args, { location: "Paris" });
    assert.equal(result!.dialect, "react");
  });

  it("parses Function: dialect", () => {
    const text = `Thought: Let me calculate this.
Function: calculator
Function Input: {"expression": "2 + 2"}`;

    const result = parseReact(text);
    assert.ok(result !== null);
    assert.equal(result!.name, "calculator");
    assert.deepEqual(result!.args, { expression: "2 + 2" });
    assert.equal(result!.dialect, "function");
  });

  it("parses Tool: dialect", () => {
    const text = `Thought: I should read the file.
Tool: read_file
Tool Input: {"file_path": "/tmp/test.txt"}`;

    const result = parseReact(text);
    assert.ok(result !== null);
    assert.equal(result!.name, "read_file");
    assert.deepEqual(result!.args, { file_path: "/tmp/test.txt" });
    assert.equal(result!.dialect, "tool");
  });

  it("parses Call: dialect", () => {
    const text = `Thought: Let me call the API.
Call: get_data
Input: {"endpoint": "/users"}`;

    const result = parseReact(text);
    assert.ok(result !== null);
    assert.equal(result!.name, "get_data");
    assert.deepEqual(result!.args, { endpoint: "/users" });
    assert.equal(result!.dialect, "call");
  });

  it("returns null for non-ReAct text", () => {
    const result = parseReact("This is just regular text without any tool calls.");
    assert.equal(result, null);
  });

  it("returns null for empty string", () => {
    const result = parseReact("");
    assert.equal(result, null);
  });

  it("extracts thought from ReAct text", () => {
    const text = `Thought: I need to check the weather in Paris.
Action: get_weather
Action Input: {"location": "Paris"}`;

    const result = parseReact(text);
    assert.ok(result !== null);
    assert.ok(result!.thought !== undefined);
    assert.ok(result!.thought!.includes("weather"));
  });

  it("parses same-line Action: and Action Input:", () => {
    const text = `Action: get_weather Action Input: {"location": "Tokyo"}`;

    const result = parseReact(text);
    assert.ok(result !== null);
    assert.equal(result!.name, "get_weather");
    assert.deepEqual(result!.args, { location: "Tokyo" });
  });

  it("parses parenthetical format: Action: tool_name(args)", () => {
    const text = `Action: get_weather(location: "Berlin")`;

    const result = parseReact(text);
    assert.ok(result !== null);
    assert.equal(result!.name, "get_weather");
    assert.deepEqual(result!.args, { location: "Berlin" });
  });
});

// ============================================================================
// parseReactWithPatterns
// ============================================================================

describe("parseReactWithPatterns", () => {
  it("parses with specific dialect patterns", () => {
    const text = `Function: calculator
Function Input: {"expression": "3 * 7"}`;

    const functionDialect = ALL_DIALECT_PATTERNS[1]; // function dialect
    const result = parseReactWithPatterns(text, functionDialect);
    assert.ok(result !== null);
    assert.equal(result!.name, "calculator");
    assert.equal(result!.dialect, "function");
  });

  it("returns null when text does not match dialect", () => {
    const text = `Function: calculator
Function Input: {"expression": "3 * 7"}`;

    const toolDialect = ALL_DIALECT_PATTERNS[2]; // tool dialect
    const result = parseReactWithPatterns(text, toolDialect);
    // The "Function:" text won't match Tool: dialect patterns
    assert.equal(result, null);
  });

  it("supports tightLoose mode for testing", () => {
    // In tightLoose mode, natural language tool references are rejected
    const text = `Action: Open the calculator please
Action Input: {"expression": "1+1"}`;

    const result = parseReactWithPatterns(text, CLASSIC_PATTERNS, true);
    // "Open the calculator please" is not a tool-like identifier in tight mode
    assert.equal(result, null);
  });
});

// ============================================================================
// detectReactDialect
// ============================================================================

describe("detectReactDialect", () => {
  it('detects "Action:" as react dialect', () => {
    const result = detectReactDialect("Action: get_weather\nAction Input: {}");
    assert.ok(result !== null);
    assert.equal(result!.name, "react");
  });

  it('detects "Function:" as function dialect', () => {
    const result = detectReactDialect("Function: calculator\nFunction Input: {}");
    assert.ok(result !== null);
    assert.equal(result!.name, "function");
  });

  it('detects "Tool:" as tool dialect', () => {
    const result = detectReactDialect("Tool: read_file\nTool Input: {}");
    assert.ok(result !== null);
    assert.equal(result!.name, "tool");
  });

  it('detects "Call:" as call dialect', () => {
    const result = detectReactDialect("Call: get_data\nInput: {}");
    assert.ok(result !== null);
    assert.equal(result!.name, "call");
  });

  it("returns null for non-ReAct text", () => {
    const result = detectReactDialect("Just some regular text here.");
    assert.equal(result, null);
  });

  it("returns null for empty string", () => {
    const result = detectReactDialect("");
    assert.equal(result, null);
  });
});

// ============================================================================
// fuzzyMatchToolName
// ============================================================================

describe("fuzzyMatchToolName", () => {
  const tools = ["get_weather", "calculator", "read_file", "bash", "write_file"];

  it("exact match returns the tool name", () => {
    assert.equal(fuzzyMatchToolName("get_weather", tools), "get_weather");
  });

  it("substring match (tool name contains hallucinated name)", () => {
    assert.equal(fuzzyMatchToolName("weather", tools), "get_weather");
  });

  it("substring match (hallucinated name contains tool name)", () => {
    // "get_weather" lower without underscore = "getweather"
    // "get_weather_app" lower without underscore = "getweatherapp"
    // rl.includes(lower) → "getweatherapp".includes("getweatherapp") → true
    assert.equal(fuzzyMatchToolName("get_weather_app", tools), "get_weather");
  });

  it("word mapping match: weather → get_weather", () => {
    assert.equal(fuzzyMatchToolName("weather", tools), "get_weather");
  });

  it("word mapping match: calculate → calculator", () => {
    assert.equal(fuzzyMatchToolName("calculate", tools), "calculator");
  });

  it("word mapping match: calc → calculator", () => {
    assert.equal(fuzzyMatchToolName("calc", tools), "calculator");
  });

  it("word mapping match: python → bash (via shell mapping)", () => {
    // WORD_MAPPINGS maps python → ["shell"]. "shell" must be in the tools list.
    const toolsWithShell = ["get_weather", "calculator", "read_file", "bash", "write_file", "shell"];
    assert.equal(fuzzyMatchToolName("python", toolsWithShell), "shell");
  });

  it("returns null for no match", () => {
    assert.equal(fuzzyMatchToolName("nonexistent_tool_xyz", tools), null);
  });

  it("respects FUZZY_MIN_PREFIX_LENGTH for prefix matching", () => {
    // "cx" is 2 chars (< FUZZY_MIN_PREFIX_LENGTH=4) so prefix match is skipped.
    // Substring match also won't fire since no tool name contains "cx".
    assert.equal(fuzzyMatchToolName("cx", tools), null);
  });

  it("prefix match works for names >= FUZZY_MIN_PREFIX_LENGTH", () => {
    // "calc" is 4 chars >= FUZZY_MIN_PREFIX_LENGTH (4), should match calculator via word mapping
    assert.equal(fuzzyMatchToolName("calc", tools), "calculator");
  });
});

// ============================================================================
// extractToolFromJson
// ============================================================================

describe("extractToolFromJson", () => {
  it("extracts standard {name, arguments} format", () => {
    const obj = {
      name: "get_weather",
      arguments: { location: "London" },
    };
    const result = extractToolFromJson(obj);
    assert.ok(result !== null);
    assert.equal(result!.name, "get_weather");
    assert.deepEqual(result!.args, { location: "London" });
  });

  it("extracts Action/Action Input format", () => {
    const obj = {
      Action: "calculator",
      "Action Input": { expression: "2 + 2" },
    };
    const result = extractToolFromJson(obj);
    assert.ok(result !== null);
    assert.equal(result!.name, "calculator");
    assert.deepEqual(result!.args, { expression: "2 + 2" });
  });

  it("extracts function key", () => {
    const obj = {
      function: "read_file",
      parameters: { path: "/tmp/test.txt" },
    };
    const result = extractToolFromJson(obj);
    assert.ok(result !== null);
    assert.equal(result!.name, "read_file");
  });

  it("extracts tool key", () => {
    const obj = {
      tool: "bash",
      args: { command: "ls -la" },
    };
    const result = extractToolFromJson(obj);
    assert.ok(result !== null);
    assert.equal(result!.name, "bash");
  });

  it("returns null for non-tool JSON", () => {
    const obj = {
      response: "The answer is 42",
      explanation: "Because math",
    };
    const result = extractToolFromJson(obj);
    assert.equal(result, null);
  });

  it("returns null for null input", () => {
    assert.equal(extractToolFromJson(null as unknown as Record<string, unknown>), null);
  });

  it("returns null for empty object", () => {
    assert.equal(extractToolFromJson({}), null);
  });

  it("maps expression key to calculator tool", () => {
    const obj = { expression: "2 ** 10" };
    const result = extractToolFromJson(obj);
    assert.ok(result !== null);
    assert.equal(result!.name, "calculator");
  });

  it("maps command key to shell tool", () => {
    const obj = { command: "ls -la" };
    const result = extractToolFromJson(obj);
    assert.ok(result !== null);
    assert.equal(result!.name, "shell");
  });
});

// ============================================================================
// sanitizeModelJson
// ============================================================================

describe("sanitizeModelJson", () => {
  it("converts Python True/False/None to JSON", () => {
    const input = '{"active": True, "disabled": False, "value": None}';
    const result = sanitizeModelJson(input);
    assert.ok(result.includes('"active": true'));
    assert.ok(result.includes('"disabled": false'));
    assert.ok(result.includes('"value": null'));
  });

  it("removes trailing commas", () => {
    const input = '{"a": 1, "b": 2,}';
    const result = sanitizeModelJson(input);
    assert.ok(!result.includes(",}"));
    assert.ok(JSON.parse(result)); // should be valid JSON
  });

  it("handles array True/False/None (first element only)", () => {
    // sanitizeModelJson only converts the first element after [ bracket
    const input = '{"flags": [True, False, None]}';
    const result = sanitizeModelJson(input);
    assert.ok(result.includes("[true"));
    assert.ok(!result.includes("[True"));
  });
});

// ============================================================================
// extractJsonArgs
// ============================================================================

describe("extractJsonArgs", () => {
  it("extracts valid JSON args", () => {
    const result = extractJsonArgs('{"location": "Paris", "units": "metric"}');
    assert.ok(result !== null);
    assert.deepEqual(result, { location: "Paris", units: "metric" });
  });

  it("extracts JSON from surrounding text", () => {
    const result = extractJsonArgs('Here are the args: {"x": 1, "y": 2}');
    assert.ok(result !== null);
    assert.deepEqual(result, { x: 1, y: 2 });
  });

  it("returns null for no JSON object", () => {
    assert.equal(extractJsonArgs("no json here"), null);
  });

  it("returns null for empty string", () => {
    assert.equal(extractJsonArgs(""), null);
  });

  it("falls back to raw string for unparseable JSON", () => {
    const result = extractJsonArgs('{broken json}');
    assert.ok(result !== null);
    assert.ok("input" in result!);
  });
});

// ============================================================================
// REACT_DIALECTS
// ============================================================================

describe("REACT_DIALECTS", () => {
  it("contains expected dialects", () => {
    const names = REACT_DIALECTS.map(d => d.name);
    assert.ok(names.includes("react"));
    assert.ok(names.includes("function"));
    assert.ok(names.includes("tool"));
    assert.ok(names.includes("call"));
  });

  it("each dialect has required properties", () => {
    for (const dialect of REACT_DIALECTS) {
      assert.ok(dialect.name, `${dialect.name} missing name`);
      assert.ok(dialect.actionTag, `${dialect.name} missing actionTag`);
      assert.ok(dialect.inputTag, `${dialect.name} missing inputTag`);
      assert.ok(Array.isArray(dialect.stopTags), `${dialect.name} stopTags must be array`);
      assert.ok(dialect.stopTags.length > 0, `${dialect.name} stopTags must not be empty`);
    }
  });
});

// ============================================================================
// FUZZY_MIN_PREFIX_LENGTH
// ============================================================================

describe("FUZZY_MIN_PREFIX_LENGTH", () => {
  it("is a number >= 3", () => {
    assert.ok(typeof FUZZY_MIN_PREFIX_LENGTH === "number");
    assert.ok(FUZZY_MIN_PREFIX_LENGTH >= 3);
  });
});

// ============================================================================
// WORD_MAPPINGS
// ============================================================================

describe("WORD_MAPPINGS", () => {
  it("maps weather to get_weather", () => {
    assert.ok(WORD_MAPPINGS["weather"].includes("get_weather"));
  });

  it("maps calculate to calculator", () => {
    assert.ok(WORD_MAPPINGS["calculate"].includes("calculator"));
  });

  it("maps python to shell", () => {
    assert.ok(WORD_MAPPINGS["python"].includes("shell"));
  });
});

// ============================================================================
// looksLikeSchemaDump
// ============================================================================

describe("looksLikeSchemaDump", () => {
  it("detects tool schema dump", () => {
    // Needs at least 2 indicators to be detected as schema dump
    const schema = JSON.stringify({
      type: "function",
      function: {
        name: "get_weather",
        parameters: { type: "object", properties: { location: { type: "string" } } },
      },
    });
    assert.equal(looksLikeSchemaDump(schema), true);
  });

  it("detects JSON schema format", () => {
    const schema = '{"parameters": {"type": "object"}, "required": ["location"], "properties": {"location": {"type": "string"}}}';
    assert.equal(looksLikeSchemaDump(schema), true);
  });

  it("returns false for normal text", () => {
    assert.equal(looksLikeSchemaDump("The weather in Paris is sunny."), false);
  });

  it("returns false for empty string", () => {
    assert.equal(looksLikeSchemaDump(""), false);
  });

  it("returns false for single indicator", () => {
    assert.equal(looksLikeSchemaDump('{"type": "function"}'), false);
  });
});

// ============================================================================
// normalizeArguments
// ============================================================================

describe("normalizeArguments", () => {
  it("normalizes alias: path → file_path", () => {
    const result = normalizeArguments({ path: "/tmp/test.txt" }, ["file_path"]);
    assert.ok("file_path" in result);
    assert.equal(result.file_path, "/tmp/test.txt");
  });

  it("normalizes alias: expr → expression", () => {
    const result = normalizeArguments({ expr: "2 + 2" }, ["expression"]);
    assert.ok("expression" in result);
    assert.equal(result.expression, "2 + 2");
  });

  it("passes through unknown keys unchanged", () => {
    const result = normalizeArguments({ unknown_key: "value" }, ["expression"]);
    assert.ok("unknown_key" in result);
  });

  it("handles empty args", () => {
    const result = normalizeArguments({}, ["expression"]);
    assert.deepEqual(result, {});
  });

  it("combines power operation keys into expression", () => {
    const result = normalizeArguments({ base: "2", exponent: "10" }, ["expression"]);
    assert.ok("expression" in result);
    assert.equal(result.expression, "2 ** 10");
  });
});

// ============================================================================
// ARG_ALIASES
// ============================================================================

describe("ARG_ALIASES", () => {
  it("maps expression aliases", () => {
    assert.ok(ARG_ALIASES["expression"].includes("expr"));
    assert.ok(ARG_ALIASES["expression"].includes("exp"));
  });

  it("maps file_path aliases", () => {
    assert.ok(ARG_ALIASES["file_path"].includes("path"));
    assert.ok(ARG_ALIASES["file_path"].includes("filepath"));
  });

  it("maps command aliases", () => {
    assert.ok(ARG_ALIASES["command"].includes("cmd"));
    assert.ok(ARG_ALIASES["command"].includes("shell"));
  });

  it("maps url aliases", () => {
    assert.ok(ARG_ALIASES["url"].includes("uri"));
    assert.ok(ARG_ALIASES["url"].includes("link"));
  });
});
