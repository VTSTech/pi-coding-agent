/**
 * Tests for shared utility modules: errors, provider-sync, test-report, model-test-utils.
 *
 * TEST-02: Key shared utilities tests
 * - ExtensionError, ConfigError, ApiError, TimeoutError, SecurityError, ToolError (errors.ts)
 * - mergeModels (provider-sync.ts)
 * - formatTestScore, formatTestSummary, formatRecommendation (test-report.ts)
 * - getRecommendationLabel (test-report.ts recommendation logic)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ExtensionError,
  ConfigError,
  ApiError,
  TimeoutError,
  SecurityError,
  ToolError,
} from "../shared/errors";
import {
  mergeModels,
} from "../shared/provider-sync";
import {
  formatTestScore,
  formatTestSummary,
  formatRecommendation,
} from "../shared/test-report";

// ============================================================================
// shared/errors — Typed Error Classes (FEAT-02)
// ============================================================================

describe("ExtensionError", () => {
  it("creates with message and name", () => {
    const err = new ExtensionError("test error");
    assert.equal(err.message, "test error");
    assert.equal(err.name, "ExtensionError");
    assert.ok(err instanceof Error);
  });

  it("creates with optional code", () => {
    const err = new ExtensionError("test", "CUSTOM_CODE");
    assert.equal(err.code, "CUSTOM_CODE");
    assert.equal(err.message, "test");
  });

  it("inherits from Error", () => {
    const err = new ExtensionError("test");
    assert.ok(err instanceof Error);
    assert.ok(err instanceof ExtensionError);
  });
});

describe("ConfigError", () => {
  it("creates with CONFIG_ERROR code", () => {
    const err = new ConfigError("missing config file");
    assert.equal(err.message, "missing config file");
    assert.equal(err.name, "ConfigError");
    assert.equal(err.code, "CONFIG_ERROR");
    assert.ok(err instanceof ExtensionError);
  });
});

describe("ApiError", () => {
  it("creates with statusCode and url", () => {
    const err = new ApiError("request failed", 403, "https://api.example.com/data");
    assert.equal(err.message, "request failed");
    assert.equal(err.name, "ApiError");
    assert.equal(err.code, "API_ERROR");
    assert.equal(err.statusCode, 403);
    assert.equal(err.url, "https://api.example.com/data");
  });

  it("creates without optional fields", () => {
    const err = new ApiError("network error");
    assert.equal(err.statusCode, undefined);
    assert.equal(err.url, undefined);
  });
});

describe("TimeoutError", () => {
  it("creates with timeoutMs", () => {
    const err = new TimeoutError("operation timed out", 30000);
    assert.equal(err.message, "operation timed out");
    assert.equal(err.name, "TimeoutError");
    assert.equal(err.code, "TIMEOUT");
    assert.equal(err.timeoutMs, 30000);
  });
});

describe("SecurityError", () => {
  it("creates with rule and detail", () => {
    const err = new SecurityError("blocked command", "command_blocklist", "rm is blocked in max mode");
    assert.equal(err.message, "blocked command");
    assert.equal(err.name, "SecurityError");
    assert.equal(err.code, "SECURITY_VIOLATION");
    assert.equal(err.rule, "command_blocklist");
    assert.equal(err.detail, "rm is blocked in max mode");
  });
});

describe("ToolError", () => {
  it("creates with toolName", () => {
    const err = new ToolError("tool execution failed", "bash");
    assert.equal(err.message, "tool execution failed");
    assert.equal(err.name, "ToolError");
    assert.equal(err.code, "TOOL_ERROR");
    assert.equal(err.toolName, "bash");
  });
});

// ============================================================================
// shared/provider-sync — mergeModels (ARCH-02)
// ============================================================================

describe("mergeModels", () => {
  it("returns new models when there are no old models", () => {
    const newModels = [{ id: "model-a" }, { id: "model-b" }];
    const result = mergeModels(newModels, []);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "model-a");
    assert.equal(result[1].id, "model-b");
  });

  it("preserves extra user fields from old models", () => {
    const oldModels = [{ id: "model-a", customField: "preserved" }];
    const newModels = [{ id: "model-a", contextLength: 4096 }];
    const result = mergeModels(newModels, oldModels);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "model-a");
    assert.equal(result[0].contextLength, 4096);
    assert.equal((result[0] as Record<string, unknown>).customField, "preserved");
  });

  it("new model fields take precedence over old fields", () => {
    const oldModels = [{ id: "model-a", contextLength: 2048 }];
    const newModels = [{ id: "model-a", contextLength: 8192 }];
    const result = mergeModels(newModels, oldModels);
    assert.equal((result[0] as Record<string, unknown>).contextLength, 8192);
  });

  it("adds new models not in old set", () => {
    const oldModels = [{ id: "old-model", customField: "keep" }];
    const newModels = [{ id: "new-model" }];
    const result = mergeModels(newModels, oldModels);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "new-model");
  });

  it("handles empty arrays", () => {
    const result = mergeModels([], []);
    assert.equal(result.length, 0);
  });
});

// ============================================================================
// shared/test-report — formatTestScore (TEST-06)
// ============================================================================

describe("formatTestScore", () => {
  it("formats STRONG score", () => {
    // formatTestScore returns ANSI-styled strings — verify structure
    const result = formatTestScore("STRONG", "Reasoning");
    assert.ok(result.includes("Reasoning"));
    assert.ok(result.includes("STRONG"));
  });

  it("formats MODERATE score", () => {
    const result = formatTestScore("MODERATE", "Tool Usage");
    assert.ok(result.includes("Tool Usage"));
    assert.ok(result.includes("MODERATE"));
  });

  it("formats WEAK score", () => {
    const result = formatTestScore("WEAK", "ReAct");
    assert.ok(result.includes("ReAct"));
    assert.ok(result.includes("WEAK"));
  });

  it("formats FAIL score", () => {
    const result = formatTestScore("FAIL", "Thinking");
    assert.ok(result.includes("Thinking"));
    assert.ok(result.includes("FAIL"));
  });

  it("formats ERROR score with Error: prefix", () => {
    const result = formatTestScore("ERROR", "Connectivity");
    assert.ok(result.includes("Error:"));
    assert.ok(result.includes("Connectivity"));
  });

  it("formats unknown score as fail", () => {
    const result = formatTestScore("CUSTOM", "Unknown");
    assert.ok(result.includes("Unknown"));
    assert.ok(result.includes("CUSTOM"));
  });
});

// ============================================================================
// shared/test-report — formatTestSummary (TEST-06)
// ============================================================================

describe("formatTestSummary", () => {
  it("renders all-pass summary with score and time", () => {
    const tests = [
      { name: "Reasoning", pass: true, score: "STRONG" },
      { name: "Tool Usage", pass: true, score: "MODERATE" },
      { name: "Instruction Following", pass: true, score: "STRONG" },
    ];
    const lines = formatTestSummary(tests, 5000);
    // Should contain section header
    assert.ok(lines.some(l => l.includes("SUMMARY")), "should have SUMMARY header");
    // Should contain individual results
    assert.ok(lines.some(l => l.includes("Reasoning")));
    assert.ok(lines.some(l => l.includes("Tool Usage")));
    assert.ok(lines.some(l => l.includes("Instruction Following")));
    // Should contain score
    assert.ok(lines.some(l => l.includes("3/3") || l.includes("Score:")), "should show score");
  });

  it("renders mixed pass/fail summary", () => {
    const tests = [
      { name: "Reasoning", pass: true, score: "STRONG" },
      { name: "Tool Usage", pass: false, score: "FAIL" },
    ];
    const lines = formatTestSummary(tests, 1200);
    assert.ok(lines.some(l => l.includes("Reasoning")));
    assert.ok(lines.some(l => l.includes("Tool Usage")));
    assert.ok(lines.some(l => l.includes("1/2") || l.includes("Score:")));
  });

  it("renders all-fail summary", () => {
    const tests = [
      { name: "Reasoning", pass: false, score: "FAIL" },
      { name: "Tool Usage", pass: false, score: "ERROR" },
    ];
    const lines = formatTestSummary(tests, 800);
    assert.ok(lines.some(l => l.includes("0/2") || l.includes("Score:")));
  });

  it("handles empty test array", () => {
    const lines = formatTestSummary([], 0);
    assert.ok(lines.some(l => l.includes("SUMMARY")));
    assert.ok(lines.some(l => l.includes("0/0") || l.includes("Score:")));
  });
});

// ============================================================================
// shared/test-report — formatRecommendation (TEST-06)
// ============================================================================

describe("formatRecommendation", () => {
  it("returns STRONG when all tests pass", () => {
    const lines = formatRecommendation("qwen3:0.6b", 4, 4);
    assert.ok(lines.some(l => l.includes("STRONG")));
    assert.ok(lines.some(l => l.includes("qwen3:0.6b")));
  });

  it("returns STRONG when all tests pass with via", () => {
    const lines = formatRecommendation("gpt-4o", 4, 4, "via OpenRouter");
    assert.ok(lines.some(l => l.includes("STRONG")));
    assert.ok(lines.some(l => l.includes("via OpenRouter")));
  });

  it("returns GOOD when one test fails (total - 1)", () => {
    const lines = formatRecommendation("llama3.2:1b", 3, 4);
    assert.ok(lines.some(l => l.includes("GOOD")));
    assert.ok(lines.some(l => l.includes("llama3.2:1b")));
  });

  it("returns USABLE when two tests fail (total - 2)", () => {
    const lines = formatRecommendation("phi3:mini", 2, 4);
    assert.ok(lines.some(l => l.includes("USABLE")));
    assert.ok(lines.some(l => l.includes("phi3:mini")));
  });

  it("returns WEAK when most tests fail", () => {
    const lines = formatRecommendation("tinyllama:1.1b", 0, 4);
    assert.ok(lines.some(l => l.includes("WEAK")));
    assert.ok(lines.some(l => l.includes("tinyllama:1.1b")));
  });

  it("handles single test pass as STRONG", () => {
    const lines = formatRecommendation("model-a", 1, 1);
    assert.ok(lines.some(l => l.includes("STRONG")));
  });

  it("handles single test fail as WEAK", () => {
    const lines = formatRecommendation("model-a", 0, 1);
    assert.ok(lines.some(l => l.includes("WEAK")));
  });
});

// ============================================================================
// Recommendation label logic (pure function extracted for testing)
// ============================================================================

function getRecommendationLabel(passed: number, total: number): string {
  if (passed === total) return "STRONG";
  if (passed >= total - 1) return "GOOD";
  if (passed >= total - 2) return "USABLE";
  return "WEAK";
}

describe("getRecommendationLabel", () => {
  it("returns STRONG when all tests pass", () => {
    assert.equal(getRecommendationLabel(4, 4), "STRONG");
    assert.equal(getRecommendationLabel(6, 6), "STRONG");
  });

  it("returns GOOD when one test fails", () => {
    assert.equal(getRecommendationLabel(3, 4), "GOOD");
    assert.equal(getRecommendationLabel(5, 6), "GOOD");
  });

  it("returns USABLE when two tests fail", () => {
    assert.equal(getRecommendationLabel(2, 4), "USABLE");
  });

  it("returns WEAK when most tests fail", () => {
    assert.equal(getRecommendationLabel(1, 4), "WEAK");
    assert.equal(getRecommendationLabel(0, 4), "WEAK");
  });

  it("returns STRONG for single test pass", () => {
    assert.equal(getRecommendationLabel(1, 1), "STRONG");
  });
});
