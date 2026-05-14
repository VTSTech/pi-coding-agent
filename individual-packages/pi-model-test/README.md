# @vtstech/pi-model-test

Model benchmark extension for the [Pi Coding Agent](https://github.com/badlogic/pi-mono).

Test any model for reasoning, tool usage, and instruction following — works with Ollama and cloud providers.

```bash
# Install as part of the bundle
pi install git:github.com/VTSTech/pi-coding-agent

# Or install individually
pi install "npm:@vtstech/pi-model-test"
```

## Commands

```bash
/model-test                     Test current Pi model (auto-detects provider)
/model-test qwen3:0.6b          Test a specific model
/model-test gpt-4               Test a cloud model
/model-test --all               Test every Ollama model
/model-test --help              Show detailed help
/model-test --clear-cache       Clear tool support cache
```

## LLM Tool

The extension also registers a `model_test` tool that the AI can call directly:

```
model_test — test a model's capabilities
  Parameter: model (string, optional) — model name to test; defaults to current model
```

## Test Suite (Extended)

All providers use the same unified test flow:

### 1. Reasoning — 20 puzzles

| Category | Tests |
|----------|-------|
| Logic | `snail_wall`, `syllogism`, `if_then_chain` |
| Math | `math_sequence` |
| Spatial | `spatial_directions` |
| Commonsense | `commonsense`, `physics_1`, `physics_2`, `objects_1`, `social_1`, `animals_1`, `gk_1`, `gk_2` |
| Counter-intuitive | `bat_and_ball`, `scale_weight` |
| Causal | `cause_effect` |
| Comparative | `relative_quantities` |
| Analogy | `analogy_1`, `analogy_2` |
| Code | `code_simplify` |

Each puzzle is scored individually: **STRONG** / MODERATE / WEAK / FAIL, with an overall average.

### 2. Instruction Following

Tests whether the model can produce a valid JSON object with exact schema compliance (6 keys including nested arrays and timestamps).

Scored: **STRONG** / MODERATE / WEAK / FAIL

### 3. Tool Usage

Tests whether the model can chain multiple tool calls (`get_weather` + `calculate`) in a single response.

Scored: **STRONG** / MODERATE / WEAK / FAIL

## Features

- Auto-detects Ollama vs cloud provider (OpenRouter, Anthropic, Google, OpenAI, Groq, DeepSeek, Mistral, xAI, Together, Fireworks, Cohere)
- Uses native `fetch()` for all HTTP communication (no shell subprocess or curl dependency)
- **Streaming Ollama chat** — uses `/api/chat` with `stream: true` for earlier timeout detection and reduced memory
- Automatic remote Ollama URL resolution (reads from `models.json` on every call — picks up config changes immediately)
- Timeout resilience with exponential backoff retry on connection failures
- **Real-time progress notifications** — per-puzzle status and phase transitions shown during testing
- **Configurable test parameters** — override timeouts, delays, temperature via `~/.pi/agent/model-test-config.json`
- **Test history with regression detection** — tracks results at `~/.pi/agent/cache/model-test-history.json`, flags score degradation
- Rate limit delay between tests (configurable via `testDelayMs` in config)
- Tool support cache (`~/.pi/agent/cache/tool_support.json`) with TTL and size limits
- Enhanced JSON repair for truncated output (trailing commas, malformed Unicode, structural completion)
- Tab-completion for model names

## Configuration

Create `~/.pi/agent/model-test-config.json` to override defaults:

```json
{
  "testDelayMs": 4000,
  "defaultTimeoutMs": 300000,
  "maxRetries": 2,
  "temperature": 0.1,
  "numPredict": 1024
}
```

## Links

- [Full Documentation](https://github.com/VTSTech/pi-coding-agent#model-benchmark-model-testts)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)