<div align="center">

# ⚡ Pi Coding Agent — VTSTech Extensions

**Pi package with custom extensions, themes, and configurations for the [Pi Coding Agent](https://github.com/badlogic/pi-mono)**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Pi Version](https://img.shields.io/badge/Pi-v0.66%2B-green.svg)](https://github.com/badlogic/pi-mono)
[![Version](https://img.shields.io/badge/Package-v2.0.0-blue.svg)](package.json)
[![Pi Package](https://img.shields.io/badge/Install-pi%20install%20git-blue.svg)](#installation)

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

A [Pi package](#pi-package-format) containing extensions, themes, and configuration for the [Pi Coding Agent](https://github.com/badlogic/pi-mono). These tools are built and optimized for running Pi on **resource-constrained environments** such as **Google Colab (CPU-only, 12GB RAM)** with **Ollama** serving small local models (0.3B–2B parameters).

Everything here is battle-tested on real hardware with real small models — no cloud GPUs, no expensive API calls, just pure local inference on a budget.

**v2.0 highlights:** Security interceptor with command blocklist and SSRF protection, ReAct fallback bridge for models without native tool support, 6-test model benchmark with tool support classification, and a shared utility library eliminating code duplication across all extensions.

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
pi install git:github.com/VTSTech/pi-coding-agent@v2
```

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
- [Ollama](https://ollama.com) running locally or on a remote machine

---

## Pi Package Format

This repo is a standard Pi package. The `package.json` contains a `pi` manifest that tells Pi where to find resources:

```json
{
  "name": "@vtstech/pi-coding-agent-extensions",
  "version": "2.0.0",
  "keywords": ["pi-package", "pi-extensions", "ollama", "model-test", "status-bar", "security", "react-fallback"],
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

## Extensions

### 🔍 Diagnostics (`diag.ts`)

**Run a full system diagnostic of your Pi environment.**

```
/diag
```

Checks:
- **System** — OS, CPU, RAM usage, uptime, Node.js version
- **Disk** — Disk usage via `df -h`
- **Ollama** — Running? Version? Response latency? Models pulled? Currently loaded in VRAM? (remote Ollama detected automatically)
- **models.json** — Valid JSON? Provider config? Models listed? Cross-references with Ollama
- **Settings** — settings.json exists? Valid?
- **Extensions** — Extension files found? Active tools? (detects both local and package-loaded extensions)
- **Themes** — Theme files? Valid JSON?
- **Session** — Active model? API mode? Context window? Context usage? Thinking level?
- **Security** — Command blocklist status, SSRF protection, path validation, injection detection, live validation tests against blocklist rules, audit log status with recent entries

Also registers a `self_diagnostic` tool so the AI agent can run diagnostics on command.

### 🧪 Model Benchmark (`model-test.ts`)

**Test any Ollama model for reasoning, thinking, tool usage, ReAct parsing, and instruction following.**

```bash
/model-test                     # Test current Pi model
/model-test qwen3:0.6b          # Test a specific model
/model-test --all               # Test every model in Ollama
```

Six tests per model:

| Test | Method | Scoring |
|------|--------|---------|
| **Reasoning** | Snail wall puzzle — "climbs 3ft/day, slides 2ft/night, 10ft wall" — answer (8) never appears in the prompt, preventing false positives. Answer extracted as the last number in the response. | STRONG / WEAK / FAIL |
| **Thinking** | Extended thinking/reasoning token support (`<think` tags or native API) — "Multiply 37 × 43" prompt | SUPPORTED / NOT SUPPORTED |
| **Tool Usage** | Native tool call generation — sends Ollama `/api/chat` with `tools` array, detects structured `tool_calls` in API response | STRONG / MODERATE / WEAK / FAIL |
| **ReAct Parsing** | ReAct-style text tool calling — sends prompt with ReAct format instructions but NO native tools, parses `Thought:` / `Action:` / `Action Input:` patterns from text response. Validates JSON args extraction and handles markdown code fence wrapping. | STRONG / MODERATE / WEAK / FAIL |
| **Instruction Following** | Strict JSON output format compliance — 4 specific keys with typed values, automatic repair of truncated output | STRONG / MODERATE / WEAK / FAIL |
| **Tool Support** | Combined probe classifying the model as `native` (structured API tool_calls), `react` (text-based tool calling), or `none`. Results cached to `~/.pi/agent/cache/tool_support.json` to avoid repeated probing. | NATIVE / REACT / NONE |

Features:
- Calls Ollama `/api/chat` directly — no Pi agent round-trip
- **Automatic remote Ollama URL** — reads from `models.json`, no manual config
- **Timeout resilience** — 180s default with `--connect-timeout`, auto-retry on empty responses and connection failures (handles flaky tunnels)
- **Thinking model fallback** — if a model returns empty without `think:true`, automatically retries with thinking enabled (supports qwen3 and similar models)
- Retrieves model metadata (size, params, quantization, family) from `/api/tags`
- **Auto-updates `models.json`** reasoning field based on thinking test results
- **Markdown code fence stripping** — handles models that wrap their ReAct Action Input in ```json fences
- **JSON repair** — automatically fixes truncated JSON output (missing closing braces) from `num_predict` limits
- **Thinking token fallback** — models that put reasoning in thinking tokens (e.g., qwen3) are detected even when `content` is empty
- **Complete response display** — full model responses are shown with markdown code fences stripped for clean rendering
- **Model family detection** — identifies 20+ model families (qwen, llama, gemma, granite, phi, mistral, etc.)
- Tab-completion for model names in the `/model-test` command
- Final recommendation: STRONG / GOOD / USABLE / WEAK

Sample output:
```
 [model-test-report]

   ⚡ Pi Model Benchmark v1.1
   Written by VTSTech
   GitHub: https://github.com/VTSTech
   Website: www.vts-tech.org

 ── MODEL: qwen2.5:0.5b ─────────────────────────────────────
   ℹ️  Size: 379 MB  |  Params: 494.03M  |  Quant: Q4_K_M
   ℹ️  Family: qwen2  |  Detected: qwen2  |  Modified: 4/8/2026

 ── REASONING TEST ──────────────────────────────────────────
   ℹ️  Prompt: A snail climbs 3ft up a wall each day...
   ❌ Answer: 10 — Reasoned but wrong answer (WEAK)

 ── THINKING TEST ───────────────────────────────────────────
   ❌ Thinking/reasoning tokens: NOT SUPPORTED

 ── TOOL USAGE TEST ─────────────────────────────────────────
   ✅ Tool call: get_weather({"location":"Paris"}) (STRONG)

 ── REACT PARSING TEST ──────────────────────────────────────
   ✅ ReAct parsed: get_weather({"location":"Tokyo"}) (STRONG)
   ℹ️  Thought: To determine the weather in Tokyo...

 ── INSTRUCTION FOLLOWING TEST ──────────────────────────────
   ✅ JSON output valid with correct values (STRONG)
   ℹ️  Output: {"name":"Qwen","can_count":true,"sum":42,"language":"Chinese"}

 ── TOOL SUPPORT DETECTION ──────────────────────────────────
   ℹ️  Result: NATIVE (structured API tool_calls)

 ── SUMMARY ─────────────────────────────────────────────────
   ✅ Tool Usage: STRONG
   ✅ ReAct Parse: STRONG
   ✅ Instructions: STRONG
   ✅ Tool Support: NATIVE
   ℹ️  Score: 4/6 tests passed

 ── RECOMMENDATION ──────────────────────────────────────────
   ⚠️  qwen2.5:0.5b is USABLE — some capabilities are limited
```

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
- Auto-detects reasoning-capable models (deepseek-r1, qwq, o1, o3, think, reason)
- Merges with existing per-model settings
- Registered as both `/ollama-sync` slash command and `ollama_sync` tool

### 🔒 Security (`security.ts`)

**Intercepts all tool calls before execution — blocks dangerous commands, SSRF attacks, path traversal, and shell injection.**

Ported from the AgentNova security core. Hooks into Pi's `tool_call` and `tool_result` events to validate every operation the agent attempts.

```bash
/security-audit          # View session security stats
```

Also registers a `security_audit` tool so the agent can self-report its security status.

**Protection layers:**

| Layer | Description | Examples |
|-------|-------------|---------|
| **Command blocklist** | 65+ dangerous commands blocked | `rm`, `sudo`, `chmod`, `curl`, `wget`, `eval`, `nmap`, `ssh`, `mkfs`, `dd`, `kill -9` |
| **SSRF protection** | 30+ patterns blocking internal network access | `localhost`, `127.0.0.1`, `10.x.x.x`, `172.16-31.x.x`, `169.254.169.254` (cloud metadata), `*.internal` |
| **Path validation** | Blocks access to sensitive system paths | `/etc/passwd`, `/etc/shadow`, `/root`, `/var`, `.ssh/`, `.gnupg/`, `../` traversal, UNC paths |
| **Injection detection** | Catches shell injection patterns in arguments | `; cmd`, `\| cmd`, `` `cmd` ``, `&& cmd`, `|| cmd`, `>()`, `$(cmd)` |

**How it works:**

1. `pi.on("tool_call")` fires BEFORE any tool executes
2. The security interceptor inspects the tool name and arguments
3. If a rule matches, the call is blocked with `{ block: true, reason: "..." }`
4. `pi.on("tool_result")` fires AFTER execution — logs results and can modify output

**Audit logging** — every blocked and allowed operation is recorded to `~/.pi/agent/audit.log` as JSON-lines, enabling post-session forensic review.

### 🤖 ReAct Fallback (`react-fallback.ts`)

**Enables tool calling for models that don't support native function calling — bridges ReAct-style text output to Pi's tool system.**

Ported from the AgentNova tool parser. When a model can't use Pi's native `tool_calls` API, this extension teaches it to output tool calls as structured text that gets parsed and dispatched.

```bash
/react-mode               # Toggle ReAct fallback on/off, show bridge stats
/react-parse <text>       # Test the parser against arbitrary text input
```

**How it works:**

1. When enabled, injects ReAct format instructions into the system prompt
2. Model outputs `Thought:`, `Action:`, `Action Input:`, and `Final Answer:` blocks as text
3. The parser extracts tool calls using regex matching and JSON extraction
4. A universal `tool_call` bridge tool dispatches the extracted call to the real tool
5. Tool results are fed back to the model as `Observation:` for the next iteration

**Parsing capabilities:**

- **ReAct format** — `Thought: ... Action: tool_name Action Input: {"key": "value"} ... Final Answer: ...`
- **JSON tool calls** — extracts tool calls from JSON objects embedded in text
- **Fuzzy tool name matching** — exact, substring, word mapping, and first-4-chars prefix matching
- **Argument normalization** — alias resolution (`expr`→`expression`, `path`→`file_path`, `cmd`→`command`, etc.), power operation combination (`base^exp` → `base ** exp`)
- **Schema dump detection** — identifies when a model dumps tool schemas instead of actually calling tools
- **JSON sanitization** — Python `True/False/None` → JSON booleans, trailing comma removal, over-escaped backslash cleanup
- **Markdown fence stripping** — handles models that wrap Action Input in `` ```json `` fences

### 📊 System Monitor (`status.ts`)

**Replaces the Pi footer with a 2-line unified status bar showing system metrics, model info, generation params, and security indicators.**

```
~/.pi/agent · main · qwen3:0.6b · medium · 5.6%/128k · CPU 9% · RAM 2.2G/15.1G · qwen3:0.6b · Resp 5m24s · temp:0.0 · SEC:2
└─ tool:read_file (4.2s)
```

**Line 1 — Status overview:**
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
- **SEC:N** — count of operations blocked by the security interceptor this session

**Line 2 — Active tool timer:**
- Shows the currently executing tool name with elapsed time while the agent is working

**Security flash indicator:** When a tool call is blocked by the security interceptor, `BLOCKED:tool_name` flashes in red for 3 seconds on line 1.

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
| `brightGreen` | `#7fff00` | Accents, headings, highlights |
| `phosphor` | `#66ff33` | Links, tool titles, secondary text |
| `glowGreen` | `#00ff41` | Thinking text, quotes |
| `fadeGreen` | `#00cc33` | Muted text, borders |
| `hotGreen` | `#b2ff59` | Numbers, emphasis |
| Background | `#000000` | Pure black base |

---

## Shared Library

The `shared/` directory provides common utilities used across all extensions, eliminating code duplication and ensuring consistent behavior.

### `shared/ollama.ts` — Ollama Utilities
- **`getOllamaBaseUrl()`** — 3-tier URL resolution: `models.json` baseUrl → `OLLAMA_HOST` env → `http://localhost:11434`
- **`readModelsJson()` / `writeModelsJson()`** — read/write `~/.pi/agent/models.json` with validation
- **`fetchOllamaModels()`** — query Ollama `/api/tags` for available models
- **`detectModelFamily()`** — identify model family from name (20+ families: qwen, llama, gemma, granite, phi, mistral, deepseek, etc.)
- **`isReasoningModel()`** — detect reasoning-capable models by name patterns

### `shared/security.ts` — Security Utilities
- **Command blocklist** — 65+ dangerous commands with severity classification
- **SSRF protection** — 30+ patterns blocking internal/private network access
- **Path validation** — sensitive path detection and traversal prevention
- **Injection detection** — shell injection pattern matching
- **Audit logging** — JSON-lines output to `~/.pi/agent/audit.log`
- **Security check result** — structured results for each validation layer

### `shared/format.ts` — Formatting Helpers
- `section()`, `ok()`, `fail()`, `warn()`, `info()` — consistent output formatting
- `bytesHuman()`, `msHuman()` — human-readable size and duration formatting
- `fmtBytes()`, `fmtDur()` — compact formatting variants
- `truncate()`, `sanitizeForReport()` — text processing for reports
- `padRight()` — alignment utility

### `shared/types.ts` — TypeScript Types
- `ToolSupportLevel` — `native` | `react` | `none`
- `StepResultType`, `ApiMode`, `BackendType` — enumeration types
- `SecurityCheckResult`, `AuditEntry` — security structures
- `ToolSupportCacheEntry`, `ErrorRecoveryState` — caching and error handling types

---

## Quick Start

```bash
# 1. Install the package
pi install git:github.com/VTSTech/pi-coding-agent

# 2. Restart Pi
pi -c

# 3. Sync your Ollama models into Pi
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
| `qwen3:0.6b` | 752M | 498 MB | ✅ | ✅ | Thinking tasks |
| `qwen3.5:0.8b` | ~800M | 1.0 GB | ❌ | ✅ | Daily driver |
| `qwen2.5-coder:1.5b` | 1.5B | 940 MB | ❌ | ✅ | Code tasks |
| `llama3.2:1b` | 1.2B | 1.2 GB | ❌ | ✅ | General use |
| `qwen3.5:2b` | 2.3B | 2.7 GB | ✅ | ✅ | Best quality (fits 12GB) |

---

## Tested Models

Benchmarks run with `/model-test` on AMD Ryzen 5 2400G (4 cores, 15GB RAM) via remote Ollama over Cloudflare Tunnel. The reasoning test uses the **snail wall puzzle** (answer: 8, never appears in the prompt).

| Model | Params | Quant | Reasoning | Thinking | Tools | ReAct | Instructions | Support | Score |
|-------|--------|-------|-----------|----------|-------|-------|-------------|---------|-------|
| `qwen2.5:0.5b` | 494M | Q4_K_M | ❌ WEAK | ❌ | ✅ STRONG | ✅ STRONG | ✅ STRONG | native | **4/6** |
| `granite4:350m` | 352M | BF16 | ❌ WEAK | ❌ | ✅ STRONG | ❌ | ✅ STRONG | native | **3/6** |
| `qwen3:0.6b` | 752M | Q4_K_M | ⏳ pending | ✅ | ✅ STRONG | — | ✅ STRONG | — | **—** |
| `functiongemma:270m` | 268M | Q8_0 | ❌ WEAK | ❌ | ✅ STRONG | ❌ | ❌ FAIL | native | **2/6** |
| `qwen2.5-coder:1.5b` | 1.5B | Q4_K_M | ❌ WEAK | ❌ | ✅ STRONG | — | ✅ STRONG | native | **—** |
| `llama3.2:1b` | 1.2B | Q8_0 | ❌ WEAK | ❌ | ✅ STRONG | — | ✅ STRONG | native | **—** |
| `qwen:0.5b` | 620M | Q4_0 | ❌ WEAK | ❌ | ❌ FAIL | ❌ | ✅ MODERATE | none | **1/6** |
| `gemma3:270m` | 268M | Q8_0 | ❌ WEAK | ❌ | ❌ FAIL | ✅ MODERATE | ❌ FAIL | none | **1/6** |
| `qwen2.5-coder:0.5b` | 494M | Q4_K_M | ❌ WEAK | ❌ | ✅ MODERATE | — | ✅ STRONG | native | **—** |
| `qwen2:0.5b` | 494M | Q4_0 | ❌ WEAK | ❌ | ❌ FAIL | — | ✅ STRONG | none | **—** |
| `nchapman/dolphin3.0-llama3:1b` | 1.2B | Q4_K_M | ❌ WEAK | ❌ | ⛔ N/A | — | ✅ STRONG | none | **—** |
| `smollm:135m` | 135M | Q4_0 | ❌ WEAK | ❌ | ❌ FAIL | ❌ | ❌ FAIL | none | **0/6** |

> ⛔ = model does not support tool calls (Ollama API returns error). Scored as FAIL for tool usage. Models not yet re-tested with v1.1 (ReAct + Tool Support tests) show `—` for those columns.

---

## File Structure

```
pi-coding-agent/
├── extensions/
│   ├── diag.ts              # System diagnostic suite (v1.0)
│   ├── model-test.ts        # Model benchmark — 6 tests (v1.1)
│   ├── ollama-sync.ts       # Ollama ↔ models.json sync (v1.0)
│   ├── react-fallback.ts    # ReAct tool bridge for non-native models (v1.0)
│   ├── security.ts          # Security interceptor & audit (v1.0)
│   └── status.ts            # System monitor — 2-line status bar (v1.0)
├── shared/
│   ├── security.ts          # Command blocklist, SSRF, path validation, injection, audit
│   ├── ollama.ts            # URL resolution, models.json I/O, model family detection
│   ├── format.ts            # Output formatting, human-readable sizes/durations
│   └── types.ts             # Shared TypeScript type definitions
├── themes/
│   └── matrix.json          # Matrix movie theme
├── package.json             # Pi package manifest (v2.0.0)
├── README.md
└── LICENSE
```

---

## Data Paths

| Path | Purpose |
|------|---------|
| `~/.pi/agent/models.json` | Pi model configuration — providers, models, API settings |
| `~/.pi/agent/settings.json` | Pi user settings — default model, theme, compaction |
| `~/.pi/agent/audit.log` | Security audit log — JSON-lines, every blocked/allowed operation |
| `~/.pi/agent/cache/tool_support.json` | Tool support probe cache — `native`/`react`/`none` per model |

---

## About

<div align="center">

**Written by [VTSTech](https://github.com/VTSTech)**

[🌐 www.vts-tech.org](https://www.vts-tech.org) • [🐙 GitHub](https://github.com/VTSTech) • [📧 veritas@vts-tech.org](mailto:veritas@vts-tech.org)

<p>
  <i>Optimizing AI agent development for resource-constrained environments.</i>
</p>

</div>