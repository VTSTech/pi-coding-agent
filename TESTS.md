# Tested Models

Benchmarks run with `/model-test` on AMD Ryzen 5 2400G (4 cores, 15GB RAM) via remote Ollama over Cloudflare Tunnel.

## Ollama Models

| Model | Tools | ReAct | Instructions | Tool Support | Score |
|-------|-------|-------|--------------|--------------|-------|
| `qwen3:0.6b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | NATIVE | **5/6** |
| `qwen2.5-coder:0.5b-instruct-q4_k_m` | ✅ STRONG | ✅ STRONG | ✅ STRONG | REACT | **5/6** |
| `granite4:350m` | ✅ STRONG | ✅ MODERATE | ✅ STRONG | NATIVE | **4/6** |
| `qwen3:1.7b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | NATIVE | **4/6** |
| `qwen3.5:0.8b` | ✅ STRONG | ❌ ERROR | ❌ ERROR | NATIVE | **2/6** |
| `qwen2.5:0.5b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | NATIVE | **4/6** |
| `llama3.2:1b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | NATIVE | **4/6** |
| `qwen2.5-coder:1.5b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | REACT | **4/6** |
| `deepseek-r1:1.5b` | ❌ ERROR | ❌ ERROR | ✅ STRONG | NONE | **3/6** |
| `qwen:0.5b` | ❌ ERROR | ✅ STRONG | ✅ MODERATE | NONE | **2/6** |
| `qwen2:0.5b` | ❌ ERROR | ✅ STRONG | ✅ STRONG | NONE | **2/6** |
| `nchapman/dolphin3.0-qwen2.5:0.5b` | ❌ ERROR | ✅ STRONG | ✅ STRONG | NONE | **2/6** |
| `functiongemma:270m` | ✅ STRONG | ❌ FAIL | ❌ FAIL | NATIVE | **2/6** |
| `nchapman/dolphin3.0-llama3:1b` | ❌ ERROR | ✅ STRONG | ✅ STRONG | NONE | **2/6** |
| `deepseek-coder:1.3b` | ❌ ERROR | ❌ FAIL | ✅ STRONG | NONE | **1/6** |
| `gemma3:270m` | ❌ ERROR | ✅ MODERATE | ❌ FAIL | NONE | **1/6** |
| `ishumilin/deepseek-r1-coder-tools:1.5b` | ❌ FAIL | ❌ FAIL | ❌ ERROR | NONE | **0/6** |
| `smollm:135m` | ❌ ERROR | ❌ FAIL | ❌ FAIL | NONE | **0/6** |

> **Tool Support Levels:**
> - `NATIVE` — Model uses Ollama's structured `tool_calls` API
> - `REACT` — Model outputs text-based `Action:` / `Action Input:` patterns
> - `NONE` — No tool support detected

---

## Cloud Providers

| Model | Provider | Connectivity | Reasoning | Instructions | Tool Usage | Score |
|-------|----------|-------------|-----------|--------------|------------|-------|
| `openai/gpt-oss-120b:free` | OpenRouter | ✅ 1.9s | ✅ STRONG | ✅ STRONG | ✅ STRONG | **4/4** |
| `z-ai/glm-4.5-air:free` | OpenRouter | ✅ 1.1s | ❌ ERROR | ✅ STRONG | ✅ STRONG | **3/4** |

> Cloud provider tests use the 4-test suite (connectivity, reasoning, instructions, tool usage). Ollama-specific tests are skipped.

### Sample Report — `z-ai/glm-4.5-air:free` via OpenRouter

```
 [model-test-report]

   ⚡ Pi Model Benchmark v1.0.6
   Written by VTSTech
   GitHub: https://github.com/VTSTech
   Website: www.vts-tech.org

 ── MODEL: z-ai/glm-4.5-air:free ────────────────────────────
   ℹ️  Provider: openrouter (built-in)
   ℹ️  API: openai-completions
   ℹ️  Base URL: https://openrouter.ai/api/v1
   ℹ️  API Key: ****bd46

 ── CONNECTIVITY TEST ───────────────────────────────────────
   ℹ️  Sending minimal request to verify API reachability and key validity...
   ℹ️  Time: 1.1s
   ✅ API reachable and authenticated

 ── REASONING TEST ──────────────────────────────────────────
   ℹ️  Prompt: A snail climbs 3ft up a wall each day, slides 2ft back each night. Wall is 10ft. How many days?
   ℹ️  Testing...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 4.5s
   ❌ Error: Empty response from provider
   ℹ️  Response: Empty response from provider

 ── INSTRUCTION FOLLOWING TEST ──────────────────────────────
   ℹ️  Prompt: Respond with ONLY a JSON object with keys: name, can_count, sum (15+27), language
   ℹ️  Testing...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 3.9s
   ✅ JSON output valid with correct values (STRONG)
   ℹ️  Output: {"name":"GPT-4","can_count":true,"sum":42,"language":"English"}

 ── TOOL USAGE TEST ─────────────────────────────────────────
   ℹ️  Prompt: "What's the weather in Paris?" (with get_weather tool available)
   ℹ️  Testing...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 10.1s
   ✅ Tool call: get_weather({"location":"Paris"}) (STRONG)
   ℹ️  Raw response: I'll get the current weather in Paris for you.

 ── SKIPPED TESTS (OLLAMA-ONLY) ─────────────────────────────
   ⚠️  Thinking test — Ollama-specific think:true option and message.thinking field
   ⚠️  ReAct parsing test — only relevant for Ollama models without native tool calling
   ⚠️  Tool support detection — Ollama-specific tool support cache
   ⚠️  Model metadata — Ollama-specific /api/tags endpoint

 ── SUMMARY ─────────────────────────────────────────────────
   ✅ Connectivity: OK
   ❌ Reasoning: ERROR
   ✅ Instructions: STRONG
   ✅ Tool Usage: STRONG
   ℹ️  Total time: 2.9m
   ℹ️  Score: 3/4 tests passed

 ── RECOMMENDATION ──────────────────────────────────────────
   ✅ z-ai/glm-4.5-air:free is a GOOD model via openrouter — most capabilities work
```
