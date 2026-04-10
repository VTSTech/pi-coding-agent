<div align="center">

# ⚡ Pi Coding Agent — VTSTech's Extensions

**Pi package with custom extensions, themes, and configurations for the [Pi Coding Agent](https://github.com/badlogic/pi-mono)**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Pi Version](https://img.shields.io/badge/Pi-v0.66%2B-green.svg)](https://github.com/badlogic/pi-mono)
[![Pi Package](https://img.shields.io/badge/Install-pi%20install%20git-blue.svg)](#installation)
[![Version](https://img.shields.io/badge/Version-v1.0.7-orange.svg)](CHANGELOG.md)

<p>
  <a href="https://github.com/VTSTech"><strong>VTSTech</strong></a> •
  <a href="https://www.vts-tech.org">Website</a> •
  <a href="#extensions">Extensions</a> •
  <a href="#themes">Themes</a> •
  <a href="#installation">Install</a>
</p>

</div>

---

## Overview

A [Pi package](#pi-package-format) containing extensions, themes, and configuration for the [Pi Coding Agent](https://github.com/badlogic/pi-mono). These tools are built and optimized for running Pi on **resource-constrained environments** such as **Google Colab (CPU-only, 12GB RAM)** with **Ollama** serving small local models (0.3B–2B parameters), as well as with **cloud providers** like OpenRouter, Anthropic, Google, OpenAI, Groq, DeepSeek, and more.

Everything here is battle-tested on real hardware with real models — from small local Ollama models on budget machines to cloud providers via OpenRouter.

---

## Installation

### Pi Package (recommended)

```bash
pi install git:github.com/VTSTech/pi-coding-agent
```

Pi clones the repo, auto-discovers the `extensions/` and `themes/` directories, and loads everything automatically. Restart Pi and you're done.

Update to the latest version:
```bash
pi update
```

Pin to a specific tag:
```bash
pi install git:github.com/VTSTech/pi-coding-agent@v1.0.7
```

### Individual npm packages

Each extension is published separately to npm. Install only what you need:

```bash
# Install individual extensions
pi install "npm:@vtstech/pi-api"
pi install "npm:@vtstech/pi-diag"
pi install "npm:@vtstech/pi-model-test"
pi install "npm:@vtstech/pi-ollama-sync"
pi install "npm:@vtstech/pi-react-fallback"
pi install "npm:@vtstech/pi-security"
pi install "npm:@vtstech/pi-status"

# Or install everything as one bundle via GitHub
pi install git:github.com/VTSTech/pi-coding-agent
```

> All extensions depend on `@vtstech/pi-shared` which is installed automatically as a dependency.

### Manual install

```bash
git clone https://github.com/VTSTech/pi-coding-agent.git
cd pi-coding-agent
cp extensions/*.ts ~/.pi/agent/extensions/
cp themes/*.json ~/.pi/agent/themes/
pi -c
```

### Prerequisites

- [Pi Coding Agent](https://github.com/badlogic/pi-mono) v0.66+ installed
- [Ollama](https://ollama.com) running locally or on a remote machine (for Ollama features)
- API key for any supported cloud provider (for cloud provider features)

---

## Pi Package Format

This repo is a standard Pi package. The `package.json` contains a `pi` manifest that tells Pi where to find resources:

```json
{
  "name": "@vtstech/pi-coding-agent-extensions",
  "version": "1.0.7",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions"],
    "themes": ["./themes"]
  }
}
```

Pi auto-discovers from conventional directories (`extensions/`, `themes/`, `skills/`, `prompts/`) even without the manifest. The manifest is included for explicit declaration.

---

## 🔌 Remote Ollama Support

All extensions support **remote Ollama instances** out of the box — no extra configuration needed. The Ollama URL is resolved automatically from `models.json`:

```
models.json ollama provider baseUrl  →  OLLAMA_HOST env var  →  http://localhost:11434
```

This means you can:
- Run Ollama on a separate machine and tunnel it (e.g., Cloudflare Tunnel, Tailscale, SSH)
- Use `/ollama-sync https://your-tunnel-url` to sync models from a remote instance
- The sync writes the remote URL back into `models.json` so all other extensions (`model-test`, `status`, `diag`) automatically use it
- Set `OLLAMA_HOST` as an environment variable fallback if no `models.json` config exists

---

## ☁️ Cloud Provider Support

Model testing and diagnostics work with **cloud providers** out of the box. The extensions auto-detect the active provider and adapt their behavior:

**Supported providers** (built-in registry):

| Provider | API Mode | Base URL |
|----------|----------|----------|
| OpenRouter | openai-completions | `https://openrouter.ai/api/v1` |
| Anthropic | anthropic-messages | `https://api.anthropic.com` |
| Google | gemini | `https://generativelanguage.googleapis.com` |
| OpenAI | openai-completions | `https://api.openai.com/v1` |
| Groq | openai-completions | `https://api.groq.com` |
| DeepSeek | openai-completions | `https://api.deepseek.com` |
| Mistral | openai-completions | `https://api.mistral.ai` |
| xAI | openai-completions | `https://api.x.ai` |
| Together | openai-completions | `https://api.together.xyz` |
| Fireworks | openai-completions | `https://api.fireworks.ai/inference/v1` |
| Cohere | cohere-chat | `https://api.cohere.com` |

Provider detection uses a three-tier lookup: user-defined providers in `models.json` → built-in provider registry → unknown fallback.

---

## Extensions

### 🔍 Diagnostics (`diag.ts`)

**Run a full system diagnostic of your Pi environment.**

```
/diag
```

Checks:
- **System** — OS, CPU, RAM usage, uptime, Node.js version
- **Disk** — Disk usage via `df -h`
- **Ollama** — Running? Version? Response latency? Models pulled? Currently loaded in VRAM?
- **models.json** — Valid JSON? Provider config? Models listed? Cross-references with Ollama
- **Settings** — settings.json exists? Valid?
- **Extensions** — Extension files found? Active tools?
- **Themes** — Theme files? Valid JSON?
- **Session** — Active model? API mode? Provider? Base URL? Context window? Context usage? Thinking level?
- **Security** — Audit log status, blocked command count

Also registers a `self_diagnostic` tool so the AI agent can run diagnostics on command.

### 🧪 Model Benchmark (`model-test.ts`)

**Test any model for reasoning, tool usage, and instruction following — works with Ollama and cloud providers.**

```bash
/model-test                     # Test current Pi model (auto-detects provider)
/model-test qwen3:0.6b          # Test a specific Ollama model
/model-test --all               # Test every Ollama model
```

The extension auto-detects whether the active model is on **Ollama** or a **cloud provider** (OpenRouter, Anthropic, Google, OpenAI, Groq, DeepSeek, Mistral, xAI, Together, Fireworks, Cohere) and runs the appropriate test suite.

#### Ollama Test Suite (6 tests)

| Test | Method | Scoring |
|------|--------|---------|
| **Reasoning** | Snail wall puzzle — "climbs 3ft/day, slides 2ft/night, 10ft wall" — answer (8) never appears in the prompt, preventing false positives. Answer extracted as the last number in the response. | STRONG / MODERATE / WEAK / FAIL |
| **Thinking** | Extended thinking/reasoning token support (`<think` tags or native API) — "Multiply 37 × 43" prompt | SUPPORTED / NOT SUPPORTED |
| **Tool Usage** | Tool call generation — detects both native Ollama `tool_calls` API and JSON tool calls embedded in text responses | STRONG / MODERATE / WEAK / FAIL |
| **ReAct Parse** | Text-based tool calling without native API — tests `Action:` / `Action Input:` pattern parsing | STRONG / MODERATE / WEAK / FAIL |
| **Instruction Following** | Strict JSON output format compliance — 4 specific keys with typed values, automatic repair of truncated output | STRONG / MODERATE / WEAK / FAIL |
| **Tool Support** | Probes model for tool calling capability level (native API, ReAct text, or none) — cached for future runs | NATIVE / REACT / NONE |

#### Cloud Provider Test Suite (4 tests)

| Test | Method | Scoring |
|------|--------|---------|
| **Connectivity** | Verifies API reachability and authentication — sends a ping request, expects a response within 30s | OK / FAIL |
| **Reasoning** | Same snail wall puzzle, sent via OpenAI-compatible chat completions API | STRONG / MODERATE / WEAK / FAIL |
| **Instruction Following** | Strict JSON output format compliance — 4 specific keys with typed values | STRONG / MODERATE / WEAK / FAIL |
| **Tool Usage** | Tool call generation using OpenAI function calling format | STRONG / MODERATE / WEAK / FAIL |

Ollama-specific tests (thinking, ReAct parsing, tool support cache, model metadata) are skipped for cloud providers.

Features:
- **Automatic provider detection** — classifies the active model as `ollama`, `builtin`, or `unknown` using a three-tier lookup (models.json → built-in registry → fallback)
- **Built-in provider registry** — 11 known cloud providers with API modes, base URLs, and env var keys
- Calls Ollama `/api/chat` or cloud provider APIs directly — no Pi agent round-trip
- **Automatic remote Ollama URL** — reads from `models.json`, no manual config
- **Timeout resilience** — 180s default with `--connect-timeout`, auto-retry on empty responses and connection failures (handles flaky tunnels)
- **Rate limit delay** — configurable delay (default 30s) between tests to avoid upstream rate limiting on free-tier providers
- **Thinking model fallback** — if a model returns empty without `think:true`, automatically retries with thinking enabled (supports qwen3 and similar models)
- Retrieves model metadata (size, params, quantization, family) from `/api/tags`
- **Auto-updates `models.json`** reasoning field based on thinking test results
- **Tool support cache** — persistent cache at `~/.pi/agent/cache/tool_support.json` avoids re-probing on every run
- **Text-based tool call detection** — models that output tool call JSON as text (instead of using the native API) are still correctly identified and scored
- **JSON repair** — automatically fixes truncated JSON output (missing closing braces) from `num_predict` limits
- **Thinking token fallback** — models that put reasoning in thinking tokens (e.g., qwen3) are detected even when `content` is empty
- **Complete response display** — full model responses are shown with markdown code fences stripped for clean rendering
- Tab-completion for model names in the `/model-test` command
- Final recommendation: STRONG / GOOD / USABLE / WEAK

Sample output (cloud provider):
```
 [model-test-report]

   ⚡ Pi Model Benchmark v1.0.5
   Written by VTSTech
   GitHub: https://github.com/VTSTech
   Website: www.vts-tech.org

 ── MODEL: openai/gpt-oss-120b:free ─────────────────────────
   ℹ️  Provider: openrouter (built-in)
   ℹ️  API: openai-completions
   ℹ️  Base URL: https://openrouter.ai/api/v1
   ℹ️  API Key: ****d9ef

 ── CONNECTIVITY TEST ───────────────────────────────────────
   ℹ️  Sending minimal request to verify API reachability and key validity...
   ℹ️  Time: 1.9s
   ✅ API reachable and authenticated

 ── REASONING TEST ──────────────────────────────────────────
   ℹ️  Prompt: A snail climbs 3ft up a wall each day, slides 2ft back
             each night. Wall is 10ft. How many days?
   ℹ️  Testing...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 693ms
   ✅ Answer: 8 — Correct with clear reasoning (STRONG)
   ℹ️  Response: The snail gains a net of (3 - 2 = 1) foot each
             full day-night cycle.

 - After 7 full days (and nights) it has risen (7 × 1 = 7) feet.
 - At the start of the 8th day it is 7 feet up. It climbs 3 feet
   during that day, reaching (7 + 3 = 10) feet, the top of the
   wall. Once it reaches the top it does not slide back.

 Thus, the snail reaches the top on the 8th day.

 ANSWER: 8

 ── INSTRUCTION FOLLOWING TEST ──────────────────────────────
   ℹ️  Prompt: Respond with ONLY a JSON object with keys: name,
             can_count, sum (15+27), language
   ℹ️  Testing...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 525ms
   ✅ JSON output valid with correct values (STRONG)
   ℹ️  Output: {"name":"ChatGPT","can_count":true,
             "sum":42,"language":"English"}

 ── TOOL USAGE TEST ─────────────────────────────────────────
   ℹ️  Prompt: "What's the weather in Paris?" (with get_weather
             tool available)
   ℹ️  Testing...
   ℹ️  Waiting 30.0s to avoid rate limiting...
   ℹ️  Time: 518ms
   ✅ Tool call: get_weather({"location":"Paris",
             "unit":"celsius"}) (STRONG)

 ── SKIPPED TESTS (OLLAMA-ONLY) ─────────────────────────────
   ⚠️  Thinking test — Ollama-specific think:true option
   ⚠️  ReAct parsing test — only relevant for Ollama models
   ⚠️  Tool support detection — Ollama-specific tool support cache
   ⚠️  Model metadata — Ollama-specific /api/tags endpoint

 ── SUMMARY ─────────────────────────────────────────────────
   ✅ Connectivity: OK
   ✅ Reasoning: STRONG
   ✅ Instructions: STRONG
   ✅ Tool Usage: STRONG
   ℹ️  Total time: 1.7m
   ℹ️  Score: 4/4 tests passed

 ── RECOMMENDATION ──────────────────────────────────────────
   ✅ openai/gpt-oss-120b:free is a STRONG model via openrouter
```

### 🔀 API Mode Switcher (`api.ts`)

**Runtime switching of API modes, base URLs, thinking settings, and compat flags in `models.json`.**

Supports all 10 Pi API modes:
`anthropic-messages` · `openai-completions` · `openai-responses` · `azure-openai-responses` · `openai-codex-responses` · `mistral-conversations` · `google-generative-ai` · `google-gemini-cli` · `google-vertex` · `bedrock-converse-stream`

```bash
/api                   # Show current provider config (mode, URL, compat flags)
/api mode <mode>       # Switch API mode (partial match supported)
/api url <url>         # Switch base URL
/api think on|off|auto # Toggle thinking for all models in provider
/api compat <key>      # View compat flags
/api compat <key> <val> # Set compat flag
/api modes             # List all 10 supported API modes
/api providers         # List all configured providers
/api reload            # Hint to run /reload
```

**Features:**
- **Partial mode matching** — `/api mode openai-r` matches `openai-responses`
- **Auto-detect local provider** — targets the first `localhost`/`ollama` provider by default
- **Batch thinking toggle** — set `reasoning: true/false` across all models at once
- **Compat flag management** — get/set `supportsDeveloperRole`, `thinkingFormat`, `maxTokensField`, etc.
- Tab-completion for sub-commands

### 🔒 Security (`security.ts`)

**Command, path, and network security layer for Pi's tool execution.**

Automatically loaded — no commands needed. Protects against:

- **65 blocked commands** — system modification, privilege escalation, network attacks, package management, process control, shell escapes
- **SSRF protection** — 27 blocked hostname patterns (loopback, RFC1918 private ranges, cloud metadata endpoints)
- **Path validation** — prevents filesystem escape and access to critical system directories
- **Shell injection detection** — regex patterns for command chaining, substitution, and redirection
- **Audit logging** — JSON-lines audit log at `~/.pi/agent/audit.log`

### 🔄 ReAct Fallback (`react-fallback.ts`)

**Text-based tool calling bridge for models without native function calling support.**

Automatically loaded — no commands needed. When a model lacks native tool calling:

- Parses `Thought:`, `Action:`, `Action Input:` patterns from model output
- Multiple regex strategies including parenthetical style and loose matching
- Bridges text-based tool calls into Pi's native tool execution pipeline

### 🔄 Ollama Sync (`ollama-sync.ts`)

**Auto-populate models.json with all available Ollama models — works with local and remote instances.**

```bash
/ollama-sync                                    # Sync from models.json URL (or localhost)
/ollama-sync https://your-tunnel-url            # Sync from a specific remote URL
```

- Queries Ollama `/api/tags` for available models (local or remote)
- **Writes the actual Ollama URL back** into `models.json` so other extensions pick it up automatically
- URL priority: CLI argument → existing `models.json` baseUrl → `OLLAMA_HOST` env → localhost
- Preserves existing provider config (apiKey, compat settings)
- Defaults to `openai-completions` API mode (correct for Ollama's `/v1/chat/completions` endpoint)
- Sorts models by size (smallest first)
- Auto-detects reasoning-capable models (deepseek-r1, qwq, qwen3, o1, o3, think, reason)
- Merges with existing per-model settings
- Per-model metadata in sync report (parameter size, quantization level, model family)
- Registered as both `/ollama-sync` slash command and `ollama_sync` tool

### 📊 System Monitor (`status.ts`)

**Replaces the Pi footer with a unified status bar showing system metrics, model info, and generation params.**

```
~/.pi/agent · main · qwen3:0.6b · medium · 5.6%/128k · CPU 9% · RAM 2.2G/15.1G · qwen3:0.6b · Resp 5m24s · temp:0.0 · max:16384
```

**Displays:**
- **Working directory** — compact `~`-relative path
- **Git branch** — current branch name via framework API with `git rev-parse` fallback (cached)
- **Active model** — the model Pi is currently using from agent context
- **Thinking level** — shown when active (off is hidden)
- **Context usage** — percentage and window size (`5.6%/128k`)
- **CPU%** — per-core delta via `os.cpus()` (updates every 3s)
- **RAM** — used/total via `os.totalmem()` / `os.freemem()`
- **Swap** — used/total from `/proc/meminfo` (shown only when swap is active)
- **Loaded model** — Ollama model currently in memory via `/api/ps` (works with remote Ollama, cached 15s)
- **Response time** — agent loop duration via `agent_start`/`agent_end` events
- **Generation params** — temperature, top_p, top_k, max tokens, num_predict, context size captured via `before_provider_request` interception
- **Security indicator** — 3s flash on blocked tools + persistent blocked count from audit log
- **Active tool timing** — live elapsed timer for the currently running tool

Restores the default footer on session shutdown. Automatically truncates to terminal width with ANSI-safe clipping.

---

## Themes

### 🟢 Matrix (`matrix.json`)

A Matrix movie-inspired theme with neon green on pure black. Designed for terminal aesthetics and extended coding sessions.

```
/theme matrix
```

**Color palette:**

| Token | Color | Usage |
|-------|-------|-------|
| `green` | `#39ff14` | Primary text — neon green |
| `brightGreen` | `#7fff00` | Accents, headings, inline code, highlights |
| `phosphor` | `#66ff33` | Links, tool titles, code block text, secondary text |
| `glowGreen` | `#00ff41` | Thinking text, quotes |
| `fadeGreen` | `#00cc33` | Muted text, borders |
| `hotGreen` | `#b2ff59` | Numbers, emphasis |
| `yellow` | `#eeff00` | Status bar active tool timer |
| Background | `#000000` | Pure black base |

---

## Quick Start

```bash
# 1. Install the package
pi install git:github.com/VTSTech/pi-coding-agent

# 2. Restart Pi
pi -c

# 3. Sync your Ollama models into Pi (or use a cloud provider)
/ollama-sync                              # Local Ollama
/ollama-sync https://your-tunnel-url      # Remote Ollama (e.g., Cloudflare Tunnel)

# 4. Reload Pi to pick up model changes
/reload

# 5. Run diagnostics to verify everything
/diag

# 6. Benchmark your models
/model-test --all
```

### Remote Ollama Setup

If Ollama is running on a different machine, expose it via a tunnel and point Pi at it:

```bash
# On the Ollama machine — create a tunnel (example with cloudflared)
cloudflared tunnel --url http://localhost:11434

# In Pi — sync models from the tunnel URL
/ollama-sync https://your-tunnel-url.trycloudflare.com
```

The URL gets saved to `models.json` and all extensions use it automatically. No need to set `OLLAMA_HOST` or pass the URL again.

### Cloud Provider Setup

Pi handles cloud providers natively — just set your API key in the environment and select a model:

```bash
export OPENROUTER_API_KEY="sk-or-..."

# In Pi — select a cloud model
/model openrouter/openai/gpt-oss-120b:free

# Test it
/model-test
```

### Recommended models.json

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-completions",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": []
    }
  }
}
```

> Use `/ollama-sync` to auto-populate the models array and set the correct `baseUrl` from your Ollama instance.

### Recommended settings.json

Optimized for CPU-only environments with limited RAM:

```json
{
  "defaultProvider": "ollama",
  "defaultModel": "granite4:350m",
  "defaultThinkingLevel": "off",
  "theme": "matrix",
  "compaction": {
    "enabled": true,
    "reserveTokens": 2048,
    "keepRecentTokens": 8000
  }
}
```

---

## Supported API Modes

Pi supports multiple API backends via the `api` field in `models.json`. For Ollama, use **`openai-completions`** which maps to Ollama's native `/v1/chat/completions` endpoint. Other available modes:

| API Mode | Use Case |
|----------|----------|
| `openai-completions` | Ollama, OpenAI-compatible `/v1/chat/completions` |
| `openai-responses` | OpenAI Responses API (`/v1/responses`) |
| `anthropic-messages` | Anthropic native API |
| `google-generative-ai` | Gemini API |
| `google-vertex` | Google Vertex AI |
| `mistral-conversations` | Mistral API |
| `bedrock-converse-stream` | Amazon Bedrock |

See [Pi's AI package docs](https://github.com/badlogic/pi-mono/tree/main/packages/ai#apis-models-and-providers) for the full list.

---

## Google Colab Setup

These extensions are optimized for running Pi on **Google Colab with CPU-only and 12GB RAM**. Here's the recommended Ollama launch configuration:

```python
import subprocess, os

# Install Ollama
subprocess.run(["curl", "-fsSL", "https://ollama.com/install.sh"], check=True)

# Environment tuning for CPU-only 12GB
os.environ["OLLAMA_HOST"] = "0.0.0.0:11434"
os.environ["CONTEXT_LENGTH"] = "4096"         # Reduce from 262k default
os.environ["MAX_LOADED_MODELS"] = "1"          # Only one model in memory
os.environ["KEEP_ALIVE"] = "2m"                # Unload after 2min idle
os.environ["KV_CACHE_TYPE"] = "f16"            # Use f16 for KV cache
os.environ["OLLAMA_MODELS"] = "/tmp/ollama"    # Store in tmpfs (RAM disk)
os.environ["BATCH_SIZE"] = "512"               # Smaller batches for CPU
os.environ["NO_CUDA"] = "1"                    # Force CPU mode

# Start Ollama
subprocess.Popen(["ollama", "serve"])
```

### Recommended Models (12GB RAM)

| Model | Params | Size | Reasoning | Tools | Best For |
|-------|--------|------|-----------|-------|----------|
| `granite4:350m` | 352M | 676 MB | ❌ | ✅ | Fast tasks, tool calling |
| `qwen3:0.6b` | 752M | 498 MB | ❌ | ✅ | Small footprint, native tools |
| `qwen3.5:0.8b` | ~800M | 1.0 GB | ❌ | ✅ | Daily driver |
| `qwen2.5-coder:1.5b` | 1.5B | 940 MB | ❌ | ✅ | Code tasks |
| `llama3.2:1b` | 1.2B | 1.2 GB | ❌ | ✅ | General use |
| `qwen3.5:2b` | 2.3B | 2.7 GB | ✅ | ✅ | Best quality (fits 12GB) |

---

## Tested Models

See [TESTS.md](TESTS.md) for full benchmark results across all tested Ollama and cloud provider models.

---

## File Structure

```
pi-coding-agent/
├── extensions/
│   ├── api.ts                # API mode switcher — modes, URLs, thinking, compat flags
│   ├── diag.ts              # System diagnostic suite
│   ├── model-test.ts        # Model benchmark — Ollama & cloud providers
│   ├── ollama-sync.ts       # Ollama ↔ models.json sync
│   ├── react-fallback.ts    # ReAct fallback for non-native tool models
│   ├── security.ts          # Command/path/SSRF protection
│   └── status.ts            # System resource monitor & status bar
├── shared/
│   ├── format.ts            # Shared formatting utilities
│   ├── ollama.ts            # Ollama API helpers & provider detection
│   ├── security.ts          # Security validation functions
│   └── types.ts             # TypeScript types & error classes
├── themes/
│   └── matrix.json          # Matrix movie theme
├── npm-packages/            # Per-extension npm package manifests
│   ├── shared/              # @vtstech/pi-shared
│   ├── api/                 # @vtstech/pi-api
│   ├── diag/                # @vtstech/pi-diag
│   ├── model-test/          # @vtstech/pi-model-test
│   ├── ollama-sync/         # @vtstech/pi-ollama-sync
│   ├── react-fallback/      # @vtstech/pi-react-fallback
│   ├── security/            # @vtstech/pi-security
│   └── status/              # @vtstech/pi-status
├── scripts/
│   ├── build-packages.sh    # Build all npm packages (esbuild TS→ESM)
│   └── publish-packages.sh  # Publish to npm (shared first, then extensions)
├── CHANGELOG.md             # Version history
├── TESTS.md                 # Model benchmark results
├── package.json             # Pi package manifest
├── README.md
└── LICENSE
```

---

## About

<div align="center">

**Written by [VTSTech](https://github.com/VTSTech)**

[🌐 www.vts-tech.org](https://www.vts-tech.org) • [🐙 GitHub](https://github.com/VTSTech) • [📧 veritas@vts-tech.org](mailto:veritas@vts-tech.org)

<p>
  <i>Optimizing AI agent development for resource-constrained environments.</i>
</p>

</div>
