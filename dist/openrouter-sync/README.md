# @vtstech/pi-openrouter-sync

OpenRouter model sync extension for Pi Coding Agent.

Add models from OpenRouter URLs or bare model IDs directly into Pi's `models.json` configuration.

## Installation

```bash
pi install @vtstech/pi-openrouter-sync
```

## Commands

- `/openrouter-sync <url-or-id> [url-or-id ...]` — Add OpenRouter models by URL or ID
  - Alias: `/or-sync`
  - Accepts full URLs: `https://openrouter.ai/model/name:free`
  - Accepts bare IDs: `model/name:free`
  - Multiple models can be added in one command

## Tools

- `openrouter_sync` — LLM-callable tool for adding OpenRouter models

## Author

VTSTech — https://www.vts-tech.org
