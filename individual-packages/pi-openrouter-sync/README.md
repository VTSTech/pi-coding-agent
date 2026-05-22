# @vtstech/pi-openrouter-sync

OpenRouter model sync extension for Pi Coding Agent.

Add models from OpenRouter URLs or bare model IDs directly into Pi's `models.json` configuration.

```bash
# Install as part of the bundle
pi install git:github.com/VTSTech/pi-coding-agent

# Or install individually
pi install "npm:@vtstech/pi-openrouter-sync
```

## Commands

- `/openrouter-sync <url-or-id> [url-or-id ...]` — Add OpenRouter models by URL or ID
  - Alias: `/or-sync`
  - Accepts full URLs: `https://openrouter.ai/model/name:free`
  - Accepts bare IDs: `model/name:free`
  - Multiple models can be added in one command

## Tools

- `openrouter_sync` — LLM-callable tool for adding OpenRouter models

## Features
- Strips query parameters and fragments from URLs before extracting model name
- Creates `openrouter` provider in models.json if missing (inherits baseUrl/api from built-in provider registry)
- Appends models, never removes existing entries
- Reorders providers so openrouter sits above ollama
- **Enhanced error handling** - Improved debugging and error messages throughout the extension

## Author

VTSTech — https://www.vts-tech.org
