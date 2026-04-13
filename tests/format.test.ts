import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bytesHuman,
  msHuman,
  fmtBytes,
  fmtDur,
  pct,
  truncate,
  estimateMemory,
  sanitizeForReport,
  section,
  ok,
  fail,
  warn,
  info,
  padRight,
} from "../shared/format";

// ============================================================================
// bytesHuman
// ============================================================================

describe("bytesHuman", () => {
  it("formats 512 bytes", () => {
    assert.equal(bytesHuman(512), "512.0B");
  });

  it("formats 1536 bytes as KB", () => {
    assert.equal(bytesHuman(1536), "1.5KB");
  });

  it("formats 1048576 bytes as MB", () => {
    assert.equal(bytesHuman(1048576), "1.0MB");
  });

  it("formats 1073741824 bytes as GB", () => {
    assert.equal(bytesHuman(1073741824), "1.0GB");
  });

  it("formats 0 bytes", () => {
    assert.equal(bytesHuman(0), "0.0B");
  });
});

// ============================================================================
// msHuman
// ============================================================================

describe("msHuman", () => {
  it("formats 500ms", () => {
    assert.equal(msHuman(500), "500ms");
  });

  it("formats 1500ms as seconds", () => {
    assert.equal(msHuman(1500), "1.5s");
  });

  it("formats 90000ms as minutes", () => {
    assert.equal(msHuman(90000), "1.5m");
  });

  it("formats 0ms", () => {
    assert.equal(msHuman(0), "0ms");
  });

  it("formats 1000ms as seconds", () => {
    assert.equal(msHuman(1000), "1.0s");
  });
});

// ============================================================================
// fmtBytes
// ============================================================================

describe("fmtBytes", () => {
  it("formats 0 as 0B", () => {
    assert.equal(fmtBytes(0), "0B");
  });

  it("formats 1048576 as 1M", () => {
    assert.equal(fmtBytes(1048576), "1M");
  });

  it("formats 1073741824 as 1.0G", () => {
    assert.equal(fmtBytes(1073741824), "1.0G");
  });

  it("formats 512 as 512B (below KB threshold)", () => {
    // ROB-04 fix: values below 1024 return bytes, not "0K"
    assert.equal(fmtBytes(512), "512B");
  });

  it("formats 2048 as 2K", () => {
    assert.equal(fmtBytes(2048), "2K");
  });
});

// ============================================================================
// fmtDur
// ============================================================================

describe("fmtDur", () => {
  it("formats 500ms", () => {
    assert.equal(fmtDur(500), "500ms");
  });

  it("formats 1500ms as seconds", () => {
    assert.equal(fmtDur(1500), "1.5s");
  });

  it("formats 90000ms as minutes and seconds", () => {
    assert.equal(fmtDur(90000), "1m30s");
  });
});

// ============================================================================
// pct
// ============================================================================

describe("pct", () => {
  it("calculates 50%", () => {
    assert.equal(pct(512, 1024), "50.0%");
  });

  it("calculates 75%", () => {
    assert.equal(pct(75, 100), "75.0%");
  });

  it("calculates 0%", () => {
    assert.equal(pct(0, 100), "0.0%");
  });

  it("handles zero total gracefully", () => {
    assert.equal(pct(0, 0), "0.0%");
  });

  it("calculates 100%", () => {
    assert.equal(pct(100, 100), "100.0%");
  });
});

// ============================================================================
// truncate
// ============================================================================

describe("truncate", () => {
  it('truncates "Hello" with max 3 to "Hel..."', () => {
    // slice(0, 3) takes first 3 chars: "Hel"
    assert.equal(truncate("Hello", 3), "Hel...");
  });

  it('returns "Short" unchanged with max 10', () => {
    assert.equal(truncate("Short", 10), "Short");
  });

  it("handles empty string", () => {
    assert.equal(truncate("", 5), "");
  });

  it("handles max length equal to string length", () => {
    assert.equal(truncate("Exact", 5), "Exact");
  });

  it("handles max length of 0", () => {
    assert.equal(truncate("Hello", 0), "...");
  });
});

// ============================================================================
// estimateMemory
// ============================================================================

describe("estimateMemory", () => {
  it('estimates memory for 7B Q4_K_M with 32768 context', () => {
    const result = estimateMemory("7B", "Q4_K_M", 32768);
    assert.ok(result !== undefined, "should return a result");
    assert.ok(result.gpu > 0, "gpu estimate should be positive");
    assert.ok(result.cpu > 0, "cpu estimate should be positive");
    assert.ok(result.cpu > result.gpu, "cpu estimate should exceed gpu (KV cache overhead)");
  });

  it("estimates memory for 350M BF16", () => {
    const result = estimateMemory("350M", "BF16", 32768);
    assert.ok(result !== undefined);
    assert.ok(result.gpu > 0);
    assert.ok(result.cpu > 0);
  });

  it("returns undefined for unparseable parameter size", () => {
    const result = estimateMemory("not-a-number", "Q4_K_M");
    assert.equal(result, undefined);
  });

  it("returns undefined for empty parameter size", () => {
    const result = estimateMemory("", "Q4_K_M");
    assert.equal(result, undefined);
  });

  it("estimates without context length (uses fallback multiplier)", () => {
    const result = estimateMemory("3B", "Q4_K_M");
    assert.ok(result !== undefined);
    assert.ok(result.gpu > 0);
    assert.ok(result.cpu > result.gpu);
  });

  it("GPU estimate is base * 1.1 (10% overhead)", () => {
    const result = estimateMemory("1B", "F16");
    assert.ok(result !== undefined);
    // 1B params * 16 bits / 8 = 2e9 bytes, gpu = ceil(2e9 * 1.1) = 2200000000
    assert.equal(result.gpu, 2200000000);
  });

  it("CPU estimate increases with larger context window", () => {
    const resultSmall = estimateMemory("3B", "Q4_K_M", 8192);
    const resultLarge = estimateMemory("3B", "Q4_K_M", 131072);
    assert.ok(resultSmall !== undefined);
    assert.ok(resultLarge !== undefined);
    assert.ok(resultLarge.cpu > resultSmall.cpu);
    // GPU should be the same (weights don't change)
    assert.equal(resultSmall.gpu, resultLarge.gpu);
  });
});

// ============================================================================
// sanitizeForReport
// ============================================================================

describe("sanitizeForReport", () => {
  it("strips markdown code fences", () => {
    const input = "```json\n{\"key\": \"value\"}\n```";
    const result = sanitizeForReport(input);
    assert.ok(!result.includes("```"));
    assert.ok(result.includes("\"key\""));
  });

  it("strips code fences with language identifier", () => {
    const input = "```typescript\nconst x = 1;\n```";
    const result = sanitizeForReport(input);
    assert.ok(!result.includes("```"));
    assert.ok(result.includes("const x = 1"));
  });

  it("truncates HTML content", () => {
    const htmlContent = `<!DOCTYPE html>
<html>
<head><title>Error</title></head>
<body>
<h1>502 Bad Gateway</h1>
<p>The server is down</p>
<p>Line 5</p>
<p>Line 6</p>
</body>
</html>`;
    const result = sanitizeForReport(htmlContent);
    assert.ok(result.includes("HTML response truncated"));
  });

  it("does not truncate normal text under line limit", () => {
    const text = "Line 1\nLine 2\nLine 3";
    const result = sanitizeForReport(text);
    assert.equal(result, text);
  });

  it("collapses excessive blank lines", () => {
    const input = "Hello\n\n\n\n\nWorld";
    const result = sanitizeForReport(input);
    assert.ok(!result.includes("\n\n\n"));
    assert.ok(result.includes("Hello"));
    assert.ok(result.includes("World"));
  });

  it("handles empty string", () => {
    const result = sanitizeForReport("");
    assert.equal(result, "");
  });
});

// ============================================================================
// Section & indicator helpers
// ============================================================================

describe("section", () => {
  it("creates a formatted section header", () => {
    const result = section("TEST");
    assert.ok(result.includes("TEST"));
    assert.ok(result.includes("─"));
  });

  it("starts with a newline", () => {
    const result = section("X");
    assert.ok(result.startsWith("\n"));
  });
});

describe("ok", () => {
  it("formats success message", () => {
    const result = ok("done");
    assert.ok(result.includes("done"));
    assert.ok(result.includes("  "));
  });
});

describe("fail", () => {
  it("formats failure message", () => {
    const result = fail("error");
    assert.ok(result.includes("error"));
  });
});

describe("warn", () => {
  it("formats warning message", () => {
    const result = warn("caution");
    assert.ok(result.includes("caution"));
  });
});

describe("info", () => {
  it("formats info message", () => {
    const result = info("note");
    assert.ok(result.includes("note"));
  });
});

describe("padRight", () => {
  it("pads short string to target length", () => {
    assert.equal(padRight("ab", 5), "ab   ");
  });

  it("returns long string unchanged", () => {
    assert.equal(padRight("toolong", 5), "toolong");
  });

  it("handles zero padding", () => {
    assert.equal(padRight("test", 4), "test");
  });
});
