# Tested Models

Benchmarks run with `/model-test` on AMD Ryzen 5 2400G (4 cores, 15GB RAM) via remote Ollama over Cloudflare Tunnel.

## Ollama Models — openai-completions


| Model | Reasoning | Instructions | Tool Usage | Score |
|-------|-----------|--------------|------------|-------|
| `nemotron-3-nano:4b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `qwen3:0.6b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `qwen2.5-coder:0.5b-instruct-q4_k_m` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `granite4:1b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `granite4:350m` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `qwen3:1.7b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `qwen2.5:0.5b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `llama3.2:1b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `qwen2.5-coder:1.5b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `lfm2.5-thinking:1.2b` | ✅ STRONG | ✅ STRONG | ❌ ERROR | **2/3** |
| `deepseek-r1:1.5b` | ❌ ERROR | ✅ STRONG | ✅ STRONG | **2/3** |
| `qwen3.5:2b` | ✅ STRONG | ❌ ERROR | ✅ STRONG | **2/3** |
| `qwen3.5:0.8b` | ✅ STRONG | ❌ ERROR | ❌ ERROR | **1/3** |
| `qwen:0.5b` | ❌ ERROR | ✅ STRONG | ❌ ERROR | **1/3** |
| `qwen2:0.5b` | ❌ ERROR | ✅ STRONG | ❌ ERROR | **1/3** |
| `functiongemma:270m` | ❌ FAIL | ❌ FAIL | ❌ FAIL | **0/3** |
| `deepseek-coder:1.3b` | ❌ ERROR | ❌ ERROR | ❌ ERROR | **0/3** |
| `smollm:135m` | ❌ ERROR | ❌ ERROR | ❌ ERROR | **0/3** |

> **Test Suite (v1.3.1):**
> - **Reasoning** — 20 puzzle tests (logic, math, spatial, commonsense, etc.)
> - **Instructions** — Multi-step JSON schema compliance
> - **Tool Usage** — Chained tool call generation
>
> **Tool Support Levels:**
> - `NATIVE` — Model uses Ollama's structured `tool_calls` API
> - `REACT` — Model outputs text-based `Action:` / `Action Input:` patterns
> - `NONE` — No tool support detected

---

## Cloud Providers — openai-completions

| Model | Provider | Reasoning | Instructions | Tool Usage | Score |
|-------|----------|-----------|--------------|------------|-------|
| `openai/gpt-oss-120b:free` | OpenRouter | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `openrouter/free` | OpenRouter | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `openai/gpt-oss-20b:free` | OpenRouter | ✅ MODERATE | ✅ STRONG | ✅ STRONG | **3/3** |
| `minimax/minimax-m2.5:free` | OpenRouter | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `nvidia/nemotron-3-nano-30b-a3b:free` | OpenRouter | ✅ MODERATE | ✅ STRONG | ✅ STRONG | **3/3** |
| `nvidia/nemotron-nano-9b-v2:free` | OpenRouter | ✅ | ✅ | ✅ | **3/3** |
| `poolside/laguna-m.1:free` | OpenRouter | ✅ MODERATE | ✅ STRONG | ✅ STRONG | **3/3** |
| `liquid/lfm-2.5-1.2b-thinking:free` | OpenRouter | ❌ ERROR | ✅ STRONG | ❌ ERROR | **1/3** |
| `z-ai/glm-4.5-air:free` | OpenRouter | ❌ ERROR | ✅ STRONG | ✅ STRONG | **2/3** |
| `zai/glm-4.5-flash` | ZAI | ✅ | ❌ ERROR | ✅ STRONG | **2/3** |

> Cloud provider tests use the 3-test suite (reasoning, instructions, tool usage). Ollama-specific tests are skipped.
>
> **Notes:**
> - `liquid/lfm-2.5-1.2b-thinking:free` — reasoning returns empty response; tool usage fails (no OpenRouter endpoints support tools for this model).
> - `z-ai/glm-4.5-air:free` — reasoning returns empty response from provider.
> - `zai/glm-4.5-flash` — reasoning returns empty response; instructions and tool usage work correctly (direct ZAI provider).

---

## Ollama Models — openai-responses

| Model | Reasoning | Instructions | Tool Usage | Score |
|-------|-----------|--------------|------------|-------|
| `nemotron-3-nano:4b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `llama3.2:1b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `lfm2.5-thinking:1.2b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `qwen3:0.6b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `qwen2.5:0.5b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `qwen2.5-coder:0.5b-instruct-q4_k_m` | ✅ MODERATE | ✅ STRONG | ✅ STRONG | **3/3** |
| `granite4:350m` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `qwen2.5-coder:1.5b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `deepseek-r1:1.5b` | ❌ ERROR | ✅ STRONG | ✅ STRONG | **2/3** |
| `gemma4:e2b` | ✅ STRONG | ✅ STRONG | ✅ STRONG | **3/3** |
| `qwen2.5:1.5b` | ❌ WEAK | ✅ STRONG | ✅ STRONG | **2/3** |
| `functiongemma:270m` | ✅ STRONG | ❌ FAIL | ❌ FAIL | **1/3** |
| `granite3.1-moe:1b` | ❌ FAIL | ❌ FAIL | ✅ STRONG | **1/3** |
| `qwen2:0.5b` | ❌ ERROR | ✅ STRONG | ❌ ERROR | **1/3** |
| `qwen:0.5b` | ❌ ERROR | ✅ MODERATE | ❌ ERROR | **1/3** |
| `gemma3:270m` | ❌ ERROR | ❌ FAIL | ❌ ERROR | **0/3** |
| `deepseek-coder:1.3b` | ❌ WEAK | ❌ ERROR | ❌ ERROR | **0/3** |
| `smollm:135m` | ❌ ERROR | ❌ ERROR | ❌ ERROR | **0/3** |

> Tests run with API mode set to `openai-responses`. Results may differ from `openai-completions` due to different request/response formats and tool calling behavior.

### Sample Report — `minimax/minimax-m2.5:free` via OpenRouter

```
 [model-test-report]

   ⚡ Pi Model Benchmark v1.3.1
   Written by VTSTech
   GitHub: https://github.com/VTSTech
   Website: www.vts-tech.org

 ── MODEL: minimax/minimax-m2.5:free ────────────────────────
   ℹ️  Provider: openrouter (built-in)
   ℹ️  API: openai-completions
   ℹ️  Base URL: https://openrouter.ai/api/v1
   ℹ️  API Key: ****bd46

 ── REASONING TEST (EXTENDED) ───────────────────────────────
   ℹ️  Testing 20 reasoning puzzles...
   ℹ️  Waiting 10.0s to avoid rate limiting...
   ✅ ✅ snail_wall (logic): STRONG - expected "8", got "8" [(expected: 8, got: 8)]
   ✅ ✅ math_sequence (math): STRONG - expected "162", got "162" [(expected: 162, got: 162)]
   ✅ ✅ spatial_directions (spatial): STRONG - expected "south", got "180" [(expected: south)]
   ⚠️  ❌ commonsense (commonsense): WEAK - expected "the other side", got "?" [(expected: the other side)]
   ❌ ❌ code_simplify (code): FAIL - expected "15", got "2" [(expected: 15, got: 2)]
   ✅ ✅ bat_and_ball (counterint): STRONG - expected "5", got "5" [(expected: 5, got: 5)]
   ✅ ✅ scale_weight (counterint): STRONG - expected "400", got "400" [(expected: 400, got: 400)]
   ✅ ✅ syllogism (logic): STRONG - expected "warm-blooded", got "?" [(expected: warm-blooded)]
   ✅ ✅ if_then_chain (logic): STRONG - expected "grass grows", got "1" [(expected: grass grows)]
   ✅ ✅ cause_effect (causal): STRONG - expected "grows", got "?" [(expected: grows)]
   ✅ ✅ relative_quantities (comparative): STRONG - expected "15", got "15" [(expected: 15, got: 15)]
   ⚠️  ❌ analogy_1 (analogy): WEAK - expected "room", got "?" [(expected: room)]
   ✅ ✅ analogy_2 (analogy): STRONG - expected "boot", got "?" [(expected: boot)]
   ✅ ✅ physics_1 (commonsense): STRONG - expected "bowling ball", got "80" [(expected: bowling ball)]
   ⚠️  ❌ physics_2 (commonsense): WEAK - expected "hot", got "?" [(expected: hot)]
   ✅ ✅ objects_1 (commonsense): STRONG - expected "scissors", got "?" [(expected: scissors)]
   ✅ ✅ social_1 (commonsense): STRONG - expected "polite", got "?" [(expected: polite)]
   ✅ ✅ animals_1 (commonsense): STRONG - expected "water", got "?" [(expected: water)]
   ✅ ✅ gk_1 (commonsense): STRONG - expected "mars", got "?" [(expected: mars)]
   ✅ ✅ gk_2 (commonsense): STRONG - expected "366", got "366" [(expected: 366, got: 366)]
   ✅ Average score: STRONG

 ── INSTRUCTION FOLLOWING TEST (EXTENDED) ───────────────────
   ℹ️  Testing multi-step JSON schema compliance...
   ℹ️  Waiting 10.0s to avoid rate limiting...
   ℹ️  Time: 1.4s
   ✅ JSON output valid with correct values (STRONG)
   ℹ️  Output: {"name":"MiniMax-M2.5","can_count":true,"sum":42,"language":"English","colors":["red","blue","green"],"timestamp":"2025-01-09T12:00:00Z"}

 ── TOOL USAGE TEST (EXTENDED) ──────────────────────────────
   ℹ️  Testing chained tool calls...
   ℹ️  Waiting 10.0s to avoid rate limiting...
   ℹ️  Time: 349ms
   ✅ Tool calls: get_weather (MODERATE)
   ℹ️  Response: I'll get the weather for Tokyo and calculate that multiplication for you.

 ── SUMMARY ─────────────────────────────────────────────────
   ✅ Reasoning: STRONG
   ✅ Instructions: STRONG
   ✅ Tool Usage: MODERATE
   ℹ️  Total time: 1.3m
   ℹ️  Score: 3/3 tests passed
   ℹ️  Detailed: Reasoning 16/20 tests passed, Instructions 1/1, Tool Usage 1/1

 ── RECOMMENDATION ──────────────────────────────────────────
   ✅ minimax/minimax-m2.5:free is a STRONG model via openrouter — full capability
```

### Sample Report — `zai/glm-4.5-flash` via ZAI

```
 [model-test-report]

   ⚡ Pi Model Benchmark v1.3.1
   Written by VTSTech
   GitHub: https://github.com/VTSTech
   Website: www.vts-tech.org

── MODEL: glm-4.5-flash ────────────────────────────────────
   ℹ️  Provider: zai (built-in)
   ℹ️  API: openai-completions
   ℹ️  Base URL: https://open.bigmodel.cn/api/paas/v4
   ℹ️  API Key: ****9C6W
   ℹ️  Context: 128.0k tokens

── REASONING TEST (EXTENDED) ───────────────────────────────
   ℹ️  Testing 20 reasoning puzzles...
   ℹ️  Waiting 10.0s to avoid rate limiting...
   ℹ️  Time: 21.8s
   ❌ Error: Empty response
   ℹ️  Response: Empty response

── INSTRUCTION FOLLOWING TEST (EXTENDED) ───────────────────
   ℹ️  Testing multi-step JSON schema compliance...
   ℹ️  Waiting 10.0s to avoid rate limiting...
   ℹ️  Time: 7.8s
   ✅ JSON output valid with correct values (STRONG)
   ℹ️  Output: {"name":"GPT-4","can_count":true,"sum":42,"language":"English"}

── TOOL USAGE TEST (EXTENDED) ──────────────────────────────
   ℹ️  Testing chained tool calls...
   ℹ️  Waiting 10.0s to avoid rate limiting...
   ℹ️  Time: 3.8s
   ✅ Tool call: get_weather (STRONG)
   ℹ️  Response: I'll get the current weather in Paris for you.

── SKIPPED TESTS (OLLAMA-ONLY) ─────────────────────────────
   ⚠️  Thinking test — Ollama-specific think:true option and message.thinking field
   ⚠️  ReAct parsing test — only relevant for Ollama models without native tool calling
   ⚠️  Tool support detection — Ollama-specific tool support cache
   ⚠️  Model metadata — Ollama-specific /api/tags endpoint

── SUMMARY ─────────────────────────────────────────────────
   ❌ Reasoning: ERROR
   ✅ Instructions: STRONG
   ✅ Tool Usage: STRONG
   ℹ️  Total time: 1.1m
   ℹ️  Score: 2/3 tests passed

── RECOMMENDATION ──────────────────────────────────────────
   ✅ glm-4.5-flash is a GOOD model via zai — most capabilities work
```

### Sample Report — `z-ai/glm-4.5-air:free` via OpenRouter

```
 [model-test-report]

   ⚡ Pi Model Benchmark v1.3.1
   Written by VTSTech
   GitHub: https://github.com/VTSTech
   Website: www.vts-tech.org

 ── MODEL: z-ai/glm-4.5-air:free ────────────────────────────
   ℹ️  Provider: openrouter (built-in)
   ℹ️  API: openai-completions
   ℹ️  Base URL: https://openrouter.ai/api/v1
   ℹ️  API Key: ****bd46

 ── REASONING TEST (EXTENDED) ───────────────────────────────
   ℹ️  Testing 20 reasoning puzzles...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 4.5s
   ❌ Error: Empty response from provider
   ℹ️  Response: Empty response from provider

 ── INSTRUCTION FOLLOWING TEST (EXTENDED) ───────────────────
   ℹ️  Testing multi-step JSON schema compliance...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 3.9s
   ✅ JSON output valid with correct values (STRONG)
   ℹ️  Output: {"name":"GPT-4","can_count":true,"sum":42,"language":"English"}

 ── TOOL USAGE TEST (EXTENDED) ──────────────────────────────
   ℹ️  Testing chained tool calls...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 10.1s
   ✅ Tool call: get_weather (STRONG)
   ℹ️  Response: I'll get the current weather in Paris for you.

 ── SKIPPED TESTS (OLLAMA-ONLY) ─────────────────────────────
   ⚠️  Thinking test — Ollama-specific think:true option and message.thinking field
   ⚠️  ReAct parsing test — only relevant for Ollama models without native tool calling
   ⚠️  Tool support detection — Ollama-specific tool support cache
   ⚠️  Model metadata — Ollama-specific /api/tags endpoint

 ── SUMMARY ─────────────────────────────────────────────────
   ❌ Reasoning: ERROR
   ✅ Instructions: STRONG
   ✅ Tool Usage: STRONG
   ℹ️  Total time: 2.9m
   ℹ️  Score: 2/3 tests passed

 ── RECOMMENDATION ──────────────────────────────────────────
   ✅ z-ai/glm-4.5-air:free is a GOOD model via openrouter — most capabilities work
```