# @vtstech/pi-api

API Mode Switcher extension for the [Pi Coding Agent](https://github.com/badlogic/pi-mono).

Runtime switching of API modes, base URLs, thinking settings, and compat flags in `models.json`. Supports all 10 Pi API modes.

## Install

```bash
pi install "npm:@vtstech/pi-api"
```

## Commands

```
/api                   Show current provider config (mode, URL, compat flags)
/api mode <mode>       Switch API mode (partial match supported)
/api url <url>         Switch base URL
/api think on|off|auto Toggle thinking for all models in provider
/api compat <key>      View compat flags
/api compat <key> <val> Set compat flag
/api modes             List all 10 supported API modes
/api providers         List all configured providers
/api reload            Hint to run /reload
```

## Supported API Modes

`anthropic-messages` · `openai-completions` · `openai-responses` · `azure-openai-responses` · `openai-codex-responses` · `mistral-conversations` · `google-generative-ai` · `google-gemini-cli` · `google-vertex` · `bedrock-converse-stream`

## Features

- Partial mode matching — `/api mode openai-r` matches `openai-responses`
- Auto-detect local provider — targets the first `localhost`/`ollama` provider by default
- Batch thinking toggle — set `reasoning: true/false` across all models at once
- Compat flag management — get/set `supportsDeveloperRole`, `thinkingFormat`, `maxTokensField`, etc.
- Tab-completion for sub-commands

## Links

- [Full Documentation](https://github.com/VTSTech/pi-coding-agent#api-mode-switcher-apits)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)
