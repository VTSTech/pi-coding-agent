# @vtstech/pi-shared

Shared utilities for [Pi Coding Agent](https://github.com/badlogic/pi-mono) extensions by VTSTech.

This is an internal dependency — you don't need to install it directly. It's pulled in automatically when you install any `@vtstech/pi-*` extension package.

## Modules

| Module | Description |
|--------|-------------|
| `debug` | Conditional debug logging via `PI_EXTENSIONS_DEBUG=1` env var — `debugLog(module, message, ...args)` |
| `format` | Section headers, indicators (ok/fail/warn/info), numeric formatters (bytes, ms, percentages), string utilities |
| `model-test-utils` | Shared test utilities — `ChatFn` abstraction, unified test functions, scoring helpers, tool support cache, user config (`~/.pi/agent/model-test-config.json`), test history with regression detection (`~/.pi/agent/cache/model-test-history.json`) |
| `ollama` | Ollama base URL resolution, models.json I/O with TTL cache, async write mutex (`acquireModelsJsonLock`, `readModifyWriteModelsJson`), exponential backoff retry (`withRetry`), model family detection, provider detection, Ollama API helpers |
| `react-parser` | Multi-dialect ReAct text parser — 4 dialects (react, function, tool, call), `parseReact()`, `detectReactDialect()`, `fuzzyMatchToolName()` |
| `security` | Security mode toggle (`basic`/`max`), partitioned command blocklist (41 CRITICAL + 25 EXTENDED) with full-word scanning, mode-aware SSRF (22 + 7 patterns), path validation with symlink dereference, URL validation, command sanitization, DNS rebinding protection (`resolveAndCheckHostname`), buffered audit logging with mode tracking (`AUDIT_LOG_PATH` exported) |
| `types` | Type definitions (ToolSupportLevel, AuditEntry, etc.) |

## Usage

```js
import { section, ok, fail, info } from "@vtstech/pi-shared/format";
import { readModelsJson, getOllamaBaseUrl } from "@vtstech/pi-shared/ollama";
```

## Links

- [Main Repository](https://github.com/VTSTech/pi-coding-agent)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)
