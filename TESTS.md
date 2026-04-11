# Tested Models

Benchmarks run with `/model-test` on AMD Ryzen 5 2400G (4 cores, 15GB RAM) via remote Ollama over Cloudflare Tunnel.

## Ollama Models — openai-completions


| Model | Tools | ReAct | Instructions | Tool Support | Score |
|-------|-------|-------|--------------|--------------|-------|
| `qwen3:0.6b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | NATIVE | **5/6** |
| `qwen2.5-coder:0.5b-instruct-q4_k_m` | ✅ STRONG | ✅ STRONG | ✅ STRONG | REACT | **5/6** |
| `granite4:350m` | ✅ STRONG | ✅ MODERATE | ✅ STRONG | NATIVE | **4/6** |
| `qwen3:1.7b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | NATIVE | **4/6** |
| `qwen2.5:0.5b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | NATIVE | **4/6** |
| `llama3.2:1b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | NATIVE | **4/6** |
| `qwen2.5-coder:1.5b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | REACT | **4/6** |
| `deepseek-r1:1.5b` | ❌ ERROR | ❌ ERROR | ✅ STRONG | NONE | **3/6** |
| `qwen3.5:0.8b` | ✅ STRONG | ❌ ERROR | ❌ ERROR | NATIVE | **2/6** |
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

## Cloud Providers — openai-completions (default API mode)

| Model | Provider | Connectivity | Reasoning | Instructions | Tool Usage | Score |
|-------|----------|-------------|-----------|--------------|------------|-------|
| `openai/gpt-oss-120b:free` | OpenRouter | ✅ 1.9s | ✅ STRONG | ✅ STRONG | ✅ STRONG | **4/4** |
| `openai/gpt-oss-20b:free` | OpenRouter | ✅ 954ms | ✅ MODERATE | ✅ STRONG | ✅ STRONG | **4/4** |
| `minimax/minimax-m2.5:free` | OpenRouter | ✅ 4.1s | ✅ STRONG | ✅ STRONG | ✅ STRONG | **4/4** |
| `nvidia/nemotron-3-nano-30b-a3b:free` | OpenRouter | ✅ 449ms | ✅ MODERATE | ✅ STRONG | ✅ STRONG | **4/4** |
| `z-ai/glm-4.5-air:free` | OpenRouter | ✅ 1.1s | ❌ ERROR | ✅ STRONG | ✅ STRONG | **3/4** |

> Cloud provider tests use the 4-test suite (connectivity, reasoning, instructions, tool usage). Ollama-specific tests are skipped.

---

## Ollama Models — openai-responses

| Model | Tools | ReAct | Instructions | Tool Support | Score |
|-------|-------|-------|--------------|--------------|-------|
| `llama3.2:1b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | NATIVE | **5/6** |
| `qwen3:0.6b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | NATIVE | **4/6** |
| `qwen2.5:0.5b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | NATIVE | **4/6** |
| `qwen2.5-coder:0.5b-instruct-q4_k_m` | ✅ MODERATE | ✅ STRONG | ✅ STRONG | REACT | **4/6** |
| `granite4:350m` | ✅ STRONG | ✅ MODERATE | ✅ STRONG | NATIVE | **4/6** |
| `qwen2.5:1.5b` | ❌ WEAK | ✅ STRONG | ✅ STRONG | NATIVE | **3/6** |
| `functiongemma:270m` | ✅ STRONG | ❌ FAIL | ❌ FAIL | NATIVE | **2/6** |
| `qwen2:0.5b` | ❌ ERROR | ✅ STRONG | ✅ STRONG | NONE | **2/6** |
| `qwen:0.5b` | ❌ ERROR | ✅ STRONG | ✅ MODERATE | NONE | **2/6** |
| `gemma3:270m` | ❌ ERROR | ✅ MODERATE | ❌ FAIL | NONE | **1/6** |
| `smollm:135m` | ❌ ERROR | ❌ FAIL | ❌ FAIL | NONE | **0/6** |

> Tests run with API mode set to `openai-responses`. Results may differ from `openai-completions` due to different request/response formats and tool calling behavior.

### Sample Report — `minimax/minimax-m2.5:free` via OpenRouter

```
 [model-test-report]

   ⚡ Pi Model Benchmark v1.0.7
   Written by VTSTech
   GitHub: https://github.com/VTSTech
   Website: www.vts-tech.org

 ── MODEL: minimax/minimax-m2.5:free ────────────────────────
   ℹ️  Provider: openrouter (built-in)
   ℹ️  API: openai-completions
   ℹ️  Base URL: https://openrouter.ai/api/v1
   ℹ️  API Key: ****bd46

 ── CONNECTIVITY TEST ───────────────────────────────────────
   ℹ️  Sending minimal request to verify API reachability and key validity...
   ℹ️  Time: 4.1s
   ✅ API reachable and authenticated

 ── REASONING TEST ──────────────────────────────────────────
   ℹ️  Prompt: A snail climbs 3ft up a wall each day, slides 2ft back each night. Wall is 10ft. How many days?
   ℹ️  Testing...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 498ms
   ✅ Answer: 8 — Correct with clear reasoning (STRONG)
   ℹ️  Response: Step-by-step reasoning

 1. Each day the snail climbs 3 ft during daylight.
 2. Each night it slides down 2 ft.
 3. The net gain after a full day-and-night cycle is 3 ft - 2 ft = 1 ft.
 4. Let d be the day on which the snail reaches the top.
    - Before the climb on day d, the snail has already completed d - 1 full cycles,
      so its height is ((d-1) x 1) ft.
    - On day d it climbs an additional 3 ft, reaching height ((d-1) + 3) ft.
 5. The wall is 10 ft tall, so we need (d-1) + 3 >= 10.
 6. Solving: d + 2 >= 10 => d >= 8.
 7. The smallest integer satisfying this is d = 8.

 Check: After 7 days (7 x 1 ft net) the snail is at 7 ft.
 On day 8 it climbs 3 ft, reaching 7 ft + 3 ft = 10 ft, exactly the top.

 ANSWER: 8

 ── INSTRUCTION FOLLOWING TEST ──────────────────────────────
   ℹ️  Prompt: Respond with ONLY a JSON object with keys: name, can_count, sum (15+27), language
   ℹ️  Testing...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 770ms
   ✅ JSON output valid with correct values (STRONG)
   ℹ️  Output: {"name":"MiniMax-M2.5","can_count":true,"sum":42,"language":"English"}

 ── TOOL USAGE TEST ─────────────────────────────────────────
   ℹ️  Prompt: "What's the weather in Paris?" (with get_weather tool available)
   ℹ️  Testing...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 1.6s
   ✅ Tool call: get_weather({"location":"Paris"}) (STRONG)

 ── SKIPPED TESTS (OLLAMA-ONLY) ─────────────────────────────
   ⚠️  Thinking test — Ollama-specific think:true option and message.thinking field
   ⚠️  ReAct parsing test — only relevant for Ollama models without native tool calling
   ⚠️  Tool support detection — Ollama-specific tool support cache
   ⚠️  Model metadata — Ollama-specific /api/tags endpoint

 ── SUMMARY ─────────────────────────────────────────────────
   ✅ Connectivity: OK
   ✅ Reasoning: STRONG
   ✅ Instructions: STRONG
   ✅ Tool Usage: STRONG
   ℹ️  Total time: 2.8m
   ℹ️  Score: 4/4 tests passed

 ── RECOMMENDATION ──────────────────────────────────────────
   ✅ minimax/minimax-m2.5:free is a STRONG model via openrouter — full capability
```

### Sample Report — `z-ai/glm-4.5-air:free` via OpenRouter

```
 [model-test-report]

   ⚡ Pi Model Benchmark v1.0.7
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
