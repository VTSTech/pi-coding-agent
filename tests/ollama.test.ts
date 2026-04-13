import { describe, it, test } from "node:test";
import assert from "node:assert/strict";
import {
  isReasoningModel,
  detectModelFamily,
  BUILTIN_PROVIDERS,
} from "../shared/ollama";

// ============================================================================
// isReasoningModel
// ============================================================================

describe("isReasoningModel", () => {
  it("returns true for deepseek-r1 models", () => {
    assert.equal(isReasoningModel("deepseek-r1:1.5b"), true);
    assert.equal(isReasoningModel("deepseek-r1:32b"), true);
  });

  it("returns true for qwq models", () => {
    assert.equal(isReasoningModel("qwq:32b"), true);
    assert.equal(isReasoningModel("qwq"), true);
  });

  it("returns true for qwen3 models", () => {
    assert.equal(isReasoningModel("qwen3:0.6b"), true);
    assert.equal(isReasoningModel("qwen3:32b"), true);
  });

  it("returns true for o1 models", () => {
    assert.equal(isReasoningModel("o1"), true);
    assert.equal(isReasoningModel("o1-mini"), true);
    assert.equal(isReasoningModel("o1-preview"), true);
  });

  it("returns true for o3 models", () => {
    assert.equal(isReasoningModel("o3"), true);
    assert.equal(isReasoningModel("o3-mini"), true);
  });

  it("returns true for thinking models", () => {
    assert.equal(isReasoningModel("some-thinking-model"), true);
  });

  it("returns true for thinker models", () => {
    assert.equal(isReasoningModel("thinker:7b"), true);
  });

  it("returns false for llama3", () => {
    assert.equal(isReasoningModel("llama3:8b"), false);
    assert.equal(isReasoningModel("llama3.2:1b"), false);
  });

  it("returns false for gemma", () => {
    assert.equal(isReasoningModel("gemma:2b"), false);
    assert.equal(isReasoningModel("gemma3:4b"), false);
  });

  it("returns false for mistral", () => {
    assert.equal(isReasoningModel("mistral:7b"), false);
  });

  it("returns false for phi", () => {
    assert.equal(isReasoningModel("phi:3b"), false);
  });

  it("returns false for granite", () => {
    assert.equal(isReasoningModel("granite:3b"), false);
  });
});

// ============================================================================
// detectModelFamily
// ============================================================================

describe("detectModelFamily", () => {
  it("detects qwen3 family", () => {
    assert.equal(detectModelFamily("qwen3:0.6b"), "qwen3");
  });

  it("detects qwen35 family", () => {
    assert.equal(detectModelFamily("qwen3.5:0.8b"), "qwen35");
  });

  it("detects llama family from llama3.2", () => {
    assert.equal(detectModelFamily("llama3.2:1b"), "llama");
  });

  it("detects gemma3 family", () => {
    assert.equal(detectModelFamily("gemma3:4b"), "gemma3");
  });

  it("detects granite family", () => {
    assert.equal(detectModelFamily("granite4:350m"), "granite");
  });

  it("detects deepseek-r1 family", () => {
    assert.equal(detectModelFamily("deepseek-r1:1.5b"), "deepseek-r1");
  });

  it("detects deepseek (non-r1) family", () => {
    assert.equal(detectModelFamily("deepseek-coder:6.7b"), "deepseek");
  });

  it("returns unknown for unrecognized model names", () => {
    assert.equal(detectModelFamily("unknown-model"), "unknown");
    assert.equal(detectModelFamily("my-custom-model"), "unknown");
    assert.equal(detectModelFamily(""), "unknown");
  });

  it("detects qwen2 family from qwen2.5", () => {
    assert.equal(detectModelFamily("qwen2.5:14b"), "qwen2");
  });

  it("detects qwen2 family from qwen2", () => {
    assert.equal(detectModelFamily("qwen2:7b"), "qwen2");
  });

  it("detects gemma2 family from gemma2", () => {
    assert.equal(detectModelFamily("gemma2:9b"), "gemma2");
  });

  it("maps phi to llama family", () => {
    assert.equal(detectModelFamily("phi:3b"), "llama");
  });

  it("maps mistral to qwen2 family", () => {
    assert.equal(detectModelFamily("mistral:7b"), "qwen2");
  });

  it("detects dolphin family", () => {
    assert.equal(detectModelFamily("dolphin:2.9b"), "dolphin");
  });
});

// ============================================================================
// BUILTIN_PROVIDERS
// ============================================================================

describe("BUILTIN_PROVIDERS", () => {
  it("has required provider keys", () => {
    assert.ok("openrouter" in BUILTIN_PROVIDERS);
    assert.ok("anthropic" in BUILTIN_PROVIDERS);
    assert.ok("google" in BUILTIN_PROVIDERS);
    assert.ok("openai" in BUILTIN_PROVIDERS);
  });

  it("each provider has api, baseUrl, envKey properties", () => {
    for (const [name, config] of Object.entries(BUILTIN_PROVIDERS)) {
      assert.ok("api" in config, `${name} missing 'api' property`);
      assert.ok("baseUrl" in config, `${name} missing 'baseUrl' property`);
      assert.ok("envKey" in config, `${name} missing 'envKey' property`);
      assert.equal(typeof config.api, "string", `${name}.api must be string`);
      assert.equal(typeof config.baseUrl, "string", `${name}.baseUrl must be string`);
      assert.equal(typeof config.envKey, "string", `${name}.envKey must be string`);
    }
  });

  it("openrouter has correct configuration", () => {
    const provider = BUILTIN_PROVIDERS["openrouter"];
    assert.equal(provider.api, "openai-completions");
    assert.ok(provider.baseUrl.includes("openrouter.ai"));
    assert.equal(provider.envKey, "OPENROUTER_API_KEY");
  });

  it("anthropic has correct configuration", () => {
    const provider = BUILTIN_PROVIDERS["anthropic"];
    assert.equal(provider.api, "anthropic-messages");
    assert.ok(provider.baseUrl.includes("anthropic.com"));
    assert.equal(provider.envKey, "ANTHROPIC_API_KEY");
  });

  it("google has correct configuration", () => {
    const provider = BUILTIN_PROVIDERS["google"];
    assert.equal(provider.api, "gemini");
    assert.ok(provider.baseUrl.includes("googleapis.com"));
    assert.equal(provider.envKey, "GOOGLE_API_KEY");
  });

  it("openai has correct configuration", () => {
    const provider = BUILTIN_PROVIDERS["openai"];
    assert.equal(provider.api, "openai-completions");
    assert.ok(provider.baseUrl.includes("openai.com"));
    assert.equal(provider.envKey, "OPENAI_API_KEY");
  });
});

// ── ROB-01: Retry Logic Tests ────────────────────────────────────────

test("withRetry succeeds on first attempt", async () => {
  const { withRetry } = await import("../shared/ollama");
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts++;
    return "success";
  });
  assert.equal(result, "success");
  assert.equal(attempts, 1);
});

test("withRetry retries on transient errors", async () => {
  const { withRetry } = await import("../shared/ollama");
  let attempts = 0;
  const result = await withRetry(
    async () => {
      attempts++;
      if (attempts < 3) throw new Error("ECONNREFUSED");
      return "recovered";
    },
    { maxRetries: 3, baseDelayMs: 10 }
  );
  assert.equal(result, "recovered");
  assert.equal(attempts, 3);
});

test("withRetry throws after exhausting retries", async () => {
  const { withRetry } = await import("../shared/ollama");
  let attempts = 0;
  await assert.rejects(
    withRetry(
      async () => {
        attempts++;
        throw new Error("ECONNREFUSED");
      },
      { maxRetries: 2, baseDelayMs: 10 }
    ),
    /ECONNREFUSED/
  );
  assert.equal(attempts, 3); // initial + 2 retries
});

test("withRetry does not retry non-retryable errors", async () => {
  const { withRetry } = await import("../shared/ollama");
  let attempts = 0;
  await assert.rejects(
    withRetry(
      async () => {
        attempts++;
        throw new Error("API returned 403");
      },
      { maxRetries: 2, baseDelayMs: 10 }
    ),
    /API returned 403/
  );
  assert.equal(attempts, 1); // no retries for non-retryable errors
});

test("withRetry respects custom retry options", async () => {
  const { withRetry } = await import("../shared/ollama");
  let attempts = 0;
  await assert.rejects(
    withRetry(
      async () => {
        attempts++;
        throw new Error("fetch failed");
      },
      { maxRetries: 0, baseDelayMs: 10 }
    ),
    /fetch failed/
  );
  assert.equal(attempts, 1); // maxRetries=0 means no retries
});

// ── SEC-02: Concurrent Write Protection Tests ────────────────────────

test("acquireModelsJsonLock provides release function", async () => {
  const { acquireModelsJsonLock } = await import("../shared/ollama");

  const { release } = await acquireModelsJsonLock();
  // Should not throw when releasing
  release();
});

test("acquireModelsJsonLock serializes concurrent access", async () => {
  const { acquireModelsJsonLock } = await import("../shared/ollama");

  const order: number[] = [];
  const lock1Promise = acquireModelsJsonLock();
  const lock2Promise = acquireModelsJsonLock();

  // Start both waiters
  const p1 = lock1Promise.then(({ release }) => {
    order.push(1);
    release();
  });

  const p2 = lock2Promise.then(({ release }) => {
    order.push(2);
    release();
  });

  await Promise.all([p1, p2]);

  // Lock 2 should have waited for lock 1
  assert.equal(order[0], 1);
  assert.equal(order[1], 2);
});

test("readModifyWriteModelsJson reads, modifies, and writes under lock", async () => {
  const { readModifyWriteModelsJson, readModelsJson, writeModelsJson } = await import("../shared/ollama");

  // Save original state
  const originalData = readModelsJson();

  try {
    // Write known state
    writeModelsJson({ providers: { test: { models: [{ id: "test-model" }] } } });

    // Use readModifyWriteModelsJson to add a model
    const result = await readModifyWriteModelsJson((data) => {
      if (!data.providers["test"]) data.providers["test"] = { models: [] };
      data.providers["test"].models.push({ id: "new-model" } as any);
      return data;
    });

    assert.equal(result, true);

    // Verify the write
    const updated = readModelsJson();
    const models = updated.providers["test"]?.models || [];
    assert.equal(models.length, 2);
    assert.equal(models[1].id, "new-model");
  } finally {
    // Restore original state
    writeModelsJson(originalData);
  }
});

test("readModifyWriteModelsJson aborts when modifier returns null", async () => {
  const { readModifyWriteModelsJson, readModelsJson, writeModelsJson } = await import("../shared/ollama");

  const originalData = readModelsJson();

  try {
    writeModelsJson({ providers: { test: { models: [{ id: "test-model" }] } } });

    const result = await readModifyWriteModelsJson(() => null);

    assert.equal(result, false);

    // Verify no changes were made
    const current = readModelsJson();
    const models = current.providers["test"]?.models || [];
    assert.equal(models.length, 1);
  } finally {
    writeModelsJson(originalData);
  }
});
