# @vtstech/pi-shared

Shared utilities for [Pi Coding Agent](https://github.com/badlogic/pi-mono) extensions by VTSTech.

This is an internal dependency — you don't need to install it directly. It's pulled in automatically when you install any `@vtstech/pi-*` extension package.

## Modules

| Module | Description |
|--------|-------------|
| `format` | Section headers, indicators (ok/fail/warn/info), numeric formatters (bytes, ms, percentages), string utilities |
| `ollama` | Ollama base URL resolution, models.json I/O with TTL cache, model family detection, provider detection, Ollama API helpers |
| `security` | Security mode toggle (`basic`/`max`), partitioned command blocklist (41 CRITICAL + 25 EXTENDED), mode-aware SSRF (19 + 7 patterns), path validation with symlink dereference, URL validation, command sanitization, audit logging with mode tracking (`AUDIT_LOG_PATH` exported) |
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