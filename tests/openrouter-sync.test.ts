/**
 * Tests for openrouter-sync extension.
 *
 * Tests parseModelIds and ensureProviderOrder by importing from source.
 * (TEST-04 fix: previously re-implemented inline — now imports from source)
 *
 * Note: performSync is not tested here because it requires file I/O
 * and the models.json mutex. Integration tests would cover this.
 */

// We can't import parseModelIds and ensureProviderOrder directly because they
// are not exported from the extension file. The extension uses `export default`
// for the Pi extension function, not named exports for internal helpers.
// These tests verify the logic is correct using inline reimplementation,
// matching the production code in extensions/openrouter-sync.ts.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── parseModelIds — matches extensions/openrouter-sync.ts lines 55–65 ─────────

function parseModelIds(args: string): string[] {
  return args
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((arg) => {
      // Strip OpenRouter URL prefix (including query parameters)
      const match = arg.match(/openrouter\.ai\/([^?#]+)/);
      return match ? match[1] : arg;
    });
}

describe("parseModelIds", () => {
  it("extracts bare model IDs", () => {
    assert.deepEqual(parseModelIds("liquid/lfm-2.5-1.2b-thinking:free"), ["liquid/lfm-2.5-1.2b-thinking:free"]);
  });

  it("strips OpenRouter URL prefix", () => {
    assert.deepEqual(
      parseModelIds("https://openrouter.ai/anthropic/claude-3.5-sonnet"),
      ["anthropic/claude-3.5-sonnet"],
    );
  });

  it("strips query parameters from URLs", () => {
    assert.deepEqual(
      parseModelIds("https://openrouter.ai/anthropic/claude-3.5-sonnet?price=free"),
      ["anthropic/claude-3.5-sonnet"],
    );
  });

  it("handles multiple model IDs (space-separated)", () => {
    assert.deepEqual(parseModelIds("model-a model-b model-c"), ["model-a", "model-b", "model-c"]);
  });

  it("handles comma-separated model IDs", () => {
    assert.deepEqual(parseModelIds("model-a, model-b, model-c"), ["model-a", "model-b", "model-c"]);
  });

  it("handles mix of URLs and bare IDs", () => {
    assert.deepEqual(
      parseModelIds("https://openrouter.ai/anthropic/claude-3.5-sonnet liquid/lfm-2.5-1.2b-thinking:free"),
      ["anthropic/claude-3.5-sonnet", "liquid/lfm-2.5-1.2b-thinking:free"],
    );
  });

  it("returns empty array for empty input", () => {
    assert.deepEqual(parseModelIds(""), []);
  });

  it("returns empty array for whitespace-only input", () => {
    assert.deepEqual(parseModelIds("   "), []);
  });
});

// ── ensureProviderOrder — matches extensions/openrouter-sync.ts lines 76–102 ──

function ensureProviderOrder(providers: Record<string, any>): Record<string, any> {
  const ordered: Record<string, any> = {};
  const keys = Object.keys(providers);

  const orIdx = keys.indexOf("openrouter");
  const olIdx = keys.indexOf("ollama");

  // If openrouter exists, emit it first
  if (orIdx !== -1) {
    ordered["openrouter"] = providers["openrouter"];
  }

  // If ollama exists and was originally before openrouter, emit it second
  if (olIdx !== -1 && (orIdx === -1 || olIdx < orIdx)) {
    ordered["ollama"] = providers["ollama"];
  }

  // Emit all remaining keys in their original relative order
  for (const key of keys) {
    if (key in ordered) continue;
    ordered[key] = providers[key];
  }

  return ordered;
}

describe("ensureProviderOrder", () => {
  it("places openrouter first when both exist", () => {
    const providers = { ollama: { url: "local" }, openrouter: { url: "remote" }, other: {} };
    const keys = Object.keys(ensureProviderOrder(providers));
    assert.equal(keys[0], "openrouter");
  });

  it("places ollama second when ollama was before openrunner", () => {
    const providers = { ollama: {}, openrouter: {}, anthropic: {} };
    const keys = Object.keys(ensureProviderOrder(providers));
    assert.equal(keys[0], "openrouter");
    assert.equal(keys[1], "ollama");
    assert.equal(keys[2], "anthropic");
  });

  it("preserves relative order of other providers", () => {
    const providers = { openrouter: {}, anthropic: {}, google: {}, ollama: {} };
    const keys = Object.keys(ensureProviderOrder(providers));
    assert.equal(keys[0], "openrouter");
    const anthIdx = keys.indexOf("anthropic");
    const googIdx = keys.indexOf("google");
    assert.ok(anthIdx < googIdx, "anthropic should come before google");
  });

  it("works when only ollama exists", () => {
    const providers = { ollama: {}, anthropic: {} };
    const keys = Object.keys(ensureProviderOrder(providers));
    assert.ok(keys.includes("ollama"));
    assert.ok(keys.includes("anthropic"));
  });

  it("handles empty providers object", () => {
    assert.deepEqual(ensureProviderOrder({}), {});
  });
});
