# @vtstech/pi-ollama-sync

Ollama sync extension for the [Pi Coding Agent](https://github.com/badlogic/pi-mono).

Auto-populate `models.json` with all available Ollama models — works with local and remote instances.

## Install

```bash
pi install "npm:@vtstech/pi-ollama-sync"
```

## Commands

```bash
/ollama-sync                          Sync from models.json URL (or localhost)
/ollama-sync https://your-tunnel-url  Sync from a specific remote URL
```

## Features

- Queries Ollama `/api/tags` for available models (local or remote)
- Writes the actual Ollama URL back into `models.json` so other extensions pick it up
- URL priority: CLI argument → existing `models.json` baseUrl → `OLLAMA_HOST` env → localhost
- Preserves existing provider config (apiKey, compat settings)
- Defaults to `openai-completions` API mode
- Sorts models by size (smallest first)
- Auto-detects reasoning-capable models (deepseek-r1, qwq, o1, o3, think, reason)
- Merges with existing per-model settings
- Per-model metadata in sync report (parameter size, quantization level, model family)
- Registered as both `/ollama-sync` slash command and `ollama_sync` tool

## Links

- [Full Documentation](https://github.com/VTSTech/pi-coding-agent#ollama-sync-ollama-syncts)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)
