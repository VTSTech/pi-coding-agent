# Tested Models

Benchmarks run with `/model-test` on AMD Ryzen 5 2400G (4 cores, 15GB RAM) via remote Ollama over Cloudflare Tunnel.

> **Test Suite (v1.3.1):**
> - **Reasoning** — 20 puzzle tests (logic, math, spatial, commonsense, etc.)
> - **Instructions** — Multi-step JSON schema compliance
> - **Tool Usage** — Chained tool call generation

---

## Ollama Models — openai-completions

| Model | Reasoning | Instructions | Tool Usage | Score |
|-------|-----------|--------------|------------|-------|
| `granite4:350m` | MODERATE | FAIL | STRONG | **2/3** |

> **Notes:**
> - `granite4:350m` — reasoning is MODERATE (10/20 tests), instructions FAIL due to JSON parsing error, tool usage is STRONG.

---

## Cloud Providers — openai-completions

| Model | Provider | Reasoning | Instructions | Tool Usage | Score |
|-------|----------|-----------|--------------|------------|-------|
| `zai/glm-4.5-flash` | ZAI | ❌ ERROR | ✅ STRONG | ✅ STRONG | **2/3** |
| `poolside/laguna-xs.2:free` | OpenRouter | ✅ MODERATE | ✅ STRONG | ✅ STRONG | **3/3** |

> **Notes:**
> - `zai/glm-4.5-flash` — reasoning returns empty response; instructions and tool usage work correctly (direct ZAI provider).
> - `poolside/laguna-xs.2:free` — all tests pass via OpenRouter.

---

### Sample Report — `poolside/laguna-xs.2:free` via OpenRouter

```
 [model-test-report]

   ⚡ Pi Model Benchmark v1.3.1
   Written by VTSTech
   GitHub: https://github.com/VTSTech
   Website: www.vts-tech.org

── MODEL: laguna-xs.2:free ─────────────────────────────────
   ℹ️  Provider: openrouter (built-in)
   ℹ️  API: openai-completions
   ℹ️  Base URL: https://openrouter.ai/api/v1
   ℹ️  API Key: ****bd46

── REASONING TEST (EXTENDED) ───────────────────────────────
   ℹ️  Testing 20 reasoning puzzles...
   ℹ️  Waiting 10.0s to avoid rate limiting...
   ✅ ✅ snail_wall (logic): STRONG - expected "8", got "8"
   ✅ ✅ math_sequence (math): STRONG - expected "162", got "162"
   ✅ ✅ spatial_directions (spatial): STRONG - expected "south", got "south"
   ✅ ✅ commonsense (commonsense): STRONG - expected "the other side", got "the other side"
   ✅ ✅ code_simplify (code): STRONG - expected "15", got "15"
   ✅ ✅ bat_and_ball (counterint): STRONG - expected "5", got "5"
   ✅ ✅ scale_weight (counterint): STRONG - expected "400", got "400"
   ✅ ✅ syllogism (logic): STRONG - expected "warm-blooded", got "warm-blooded"
   ✅ ✅ if_then_chain (logic): STRONG - expected "grass grows", got "grass grows"
   ✅ ✅ cause_effect (causal): STRONG - expected "grows", got "grows"
   ✅ ✅ relative_quantities (comparative): STRONG - expected "15", got "15"
   ✅ ✅ analogy_1 (analogy): STRONG - expected "room", got "room"
   ✅ ✅ analogy_2 (analogy): STRONG - expected "boot", got "boot"
   ✅ ✅ physics_1 (commonsense): STRONG - expected "bowling ball", got "bowling ball"
   ✅ ✅ physics_2 (commonsense): STRONG - expected "hot", got "hot"
   ✅ ✅ objects_1 (commonsense): STRONG - expected "scissors", got "scissors"
   ✅ ✅ social_1 (commonsense): STRONG - expected "polite", got "polite"
   ✅ ✅ animals_1 (commonsense): STRONG - expected "water", got "water"
   ✅ ✅ gk_1 (commonsense): STRONG - expected "mars", got "mars"
   ✅ ✅ gk_2 (commonsense): STRONG - expected "366", got "366"
   ✅ Average score: STRONG

── INSTRUCTION FOLLOWING TEST (EXTENDED) ───────────────────
   ℹ️  Testing multi-step JSON schema compliance...
   ℹ️  Waiting 10.0s to avoid rate limiting...
   ℹ️  Time: 1.4s
   ✅ JSON output valid with correct values (STRONG)
   ℹ️  Output: {"name":"LagunaXS2","can_count":true,"sum":42,"language":"English","colors":["red","blue","green"],"timestamp":"2025-01-09T12:00:00Z"}

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
   ℹ️  Detailed: Reasoning 20/20 tests passed, Instructions 1/1, Tool Usage 1/1

── RECOMMENDATION ──────────────────────────────────────────
   ✅ laguna-xs.2:free is a STRONG model via openrouter — full capability
```