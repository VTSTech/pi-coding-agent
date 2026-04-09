# @vtstech/pi-model-test

Model benchmark extension for the [Pi Coding Agent](https://github.com/badlogic/pi-mono).

Test any model for reasoning, tool usage, and instruction following — works with Ollama and cloud providers.

## Install

```bash
pi install "npm:@vtstech/pi-model-test"
```

## Commands

```bash
/model-test                     Test current Pi model (auto-detects provider)
/model-test qwen3:0.6b          Test a specific Ollama model
/model-test --all               Test every Ollama model
```

## Test Suites

### Ollama (6 tests)

| Test | Scoring |
|------|---------|
| Reasoning (snail puzzle) | STRONG / MODERATE / WEAK / FAIL |
| Thinking token support | SUPPORTED / NOT SUPPORTED |
| Tool usage (native + text) | STRONG / MODERATE / WEAK / FAIL |
| ReAct parsing | STRONG / MODERATE / WEAK / FAIL |
| Instruction following (JSON) | STRONG / MODERATE / WEAK / FAIL |
| Tool support detection | NATIVE / REACT / NONE |

### Cloud Providers (4 tests)

| Test | Scoring |
|------|---------|
| Connectivity | OK / FAIL |
| Reasoning | STRONG / MODERATE / WEAK / FAIL |
| Instruction following | STRONG / MODERATE / WEAK / FAIL |
| Tool usage (function calling) | STRONG / MODERATE / WEAK / FAIL |

## Features

- Auto-detects Ollama vs cloud provider (OpenRouter, Anthropic, Google, OpenAI, Groq, DeepSeek, Mistral, xAI, Together, Fireworks, Cohere)
- Automatic remote Ollama URL resolution
- Timeout resilience with auto-retry on empty responses
- Rate limit delay between tests (configurable)
- Thinking model fallback (retries with `think: true`)
- Tool support cache (`~/.pi/agent/cache/tool_support.json`)
- JSON repair for truncated output
- Tab-completion for model names

## Links

- [Full Documentation](https://github.com/VTSTech/pi-coding-agent#model-benchmark-model-testts)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)
