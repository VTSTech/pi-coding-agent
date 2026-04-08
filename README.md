<div align="center">

# ⚡ Pi Coding Agent — VTSTech Extensions

**Custom extensions, themes, and configurations for the [Pi Coding Agent](https://github.com/badlogic/pi-mono)**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Pi Version](https://img.shields.io/badge/Pi-v0.65%2B-green.svg)](https://github.com/badlogic/pi-mono)

<p>
  <a href="https://github.com/VTSTech"><strong>VTSTech</strong></a> •
  <a href="https://www.vts-tech.org">Website</a> •
  <a href="#extensions">Extensions</a> •
  <a href="#themes">Themes</a> •
  <a href="#setup">Setup</a>
</p>

</div>

---

## Overview

This repository contains a collection of custom extensions, themes, and configuration files designed to enhance the [Pi Coding Agent](https://github.com/badlogic/pi-mono) framework. These tools are built and optimized for running Pi on **resource-constrained environments** such as **Google Colab (CPU-only, 12GB RAM)** with **Ollama** serving small local models (0.3B–2B parameters).

Everything here is battle-tested on real hardware with real small models — no cloud GPUs, no expensive API calls, just pure local inference on a budget.

---

## Extensions

All extensions are installed by copying them to `~/.pi/agent/extensions/` and restarting Pi.

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
- **Session** — Active model? API mode? Context window? Context usage? Thinking level?

Also registers a `self_diagnostic` tool so the AI agent can run diagnostics on command.

### 🧪 Model Benchmark (`model-test.ts`)

**Test any Ollama model for reasoning, thinking, tool usage, and instruction following.**

```bash
/model-test                     # Test current Pi model
/model-test qwen3:0.6b          # Test a specific model
/model-test --all               # Test every model in Ollama
```

Four tests per model:

| Test | Method | Scoring |
|------|--------|---------|
| **Reasoning** | "17 sheep, all but 9 die" logic puzzle — answer extracted as the last number in the response | STRONG / WEAK / FAIL |
| **Thinking** | Extended thinking/reasoning token support (`<think` tags or native API) | SUPPORTED / NOT SUPPORTED |
| **Tool Usage** | Tool call generation — detects both native Ollama `tool_calls` API and JSON tool calls embedded in text responses | STRONG / MODERATE / WEAK / FAIL |
| **Instruction Following** | JSON output format compliance with automatic repair of truncated output | STRONG / MODERATE / WEAK / FAIL |

Features:
- Calls Ollama `/api/chat` directly — no Pi agent round-trip
- Retrieves model metadata (size, params, quantization, family) from `/api/tags`
- **Auto-updates `models.json`** reasoning field based on thinking test results
- **Text-based tool call detection** — models that output tool call JSON as text (instead of using the native API) are still correctly identified and scored
- **JSON repair** — automatically fixes truncated JSON output (missing closing braces) from `num_predict` limits
- **Complete response display** — full model responses are shown with markdown code fences stripped for clean rendering
- Tab-completion for model names in the `/model-test` command
- Final recommendation: STRONG / GOOD / USABLE / WEAK

Sample output:
```
  ⚡ Pi Model Benchmark v1.0
  Written by VTSTech
  GitHub: https://github.com/VTSTech
  Website: www.vts-tech.org

── MODEL: granite4:350m ────────────────────────────
  ℹ️  Size: 676 MB  |  Params: 352.38M  |  Quant: BF16
  ℹ️  Family: granite  |  Modified: 4/8/2026

── REASONING TEST ──────────────────────────────────
  ✅ Answer: 9 — Correct with clear reasoning (STRONG)
  ℹ️  Response: The farmer has 9 sheep left.

── TOOL USAGE TEST ─────────────────────────────────
  ✅ Tool call: get_weather({"location":"Paris"}) (STRONG)

── INSTRUCTION FOLLOWING TEST ──────────────────────
  ✅ JSON output valid with correct values (STRONG)
  ℹ️  Output: {"name":"MyModel","can_count":true,"sum":42,"language":"English"}

── SUMMARY ─────────────────────────────────────────
  ✅ Reasoning: STRONG
  ❌ Thinking: NO
  ✅ Tool Usage: STRONG
  ✅ Instructions: STRONG
  ℹ️  Score: 3/4 tests passed

── RECOMMENDATION ──────────────────────────────────
  ✅ granite4:350m is a GOOD model — most capabilities work
```

### 🔄 Ollama Sync (`ollama-sync.ts`)

**Auto-populate models.json with all available Ollama models.**

```bash
/ollama-sync
```

- Queries `http://localhost:11434/api/tags` for available models
- Preserves existing provider config (baseUrl, apiKey, compat settings)
- Defaults to `openai-completions` API mode (correct for Ollama's `/v1/chat/completions` endpoint)
- Sorts models by size (smallest first)
- Auto-detects reasoning-capable models (deepseek-r1, qwq, o1, o3, think, reason)
- Merges with existing per-model settings
- Registered as both `/ollama-sync` slash command and `ollama_sync` tool

### 📊 System Monitor (`status.ts`)

**Replaces the Pi footer with a unified status bar showing system metrics, model info, and generation params.**

```
~/project · main · CPU 54% · RAM 5.2G/12.7G · Swap 128M/2.0G · granite4:350m · Resp 5m24s · temp:0.0 · max:16384 · 1.2%/128k
```

**Line 1 displays:**
- **Working directory** — compact `~`-relative path
- **Git branch** — current branch name (dimmed)
- **Thinking level** — shown when active (off is hidden)
- **Context usage** — percentage and window size (`1.2%/128k`)

**System metrics (update every 3s):**
- **CPU%** — per-core delta via `os.cpus()`
- **RAM** — used/total via `os.totalmem()` / `os.freemem()`
- **Swap** — used/total from `/proc/meminfo` (shown only when swap is active)
- **VRAM** — Ollama model currently loaded in memory via `ollama ps`
- **Response time** — agent loop duration via `agent_start`/`agent_end` events
- **Generation params** — temperature, top_p, top_k, max tokens, num_predict, context size captured via `before_provider_request` interception

Restores the default footer on session shutdown.

---

## Themes

### 🟢 Matrix (`matrix.json`)

A Matrix movie-inspired theme with neon green on pure black. Designed for terminal aesthetics and extended coding sessions.

```
/theme matrix
```

Install by copying to `~/.pi/agent/themes/matrix.json`.

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

## Setup

### Prerequisites

- [Pi Coding Agent](https://github.com/badlogic/pi-mono) installed
- [Ollama](https://ollama.com) running locally

### Install Extensions

```bash
# Clone this repo
git clone https://github.com/VTSTech/pi-coding-agent.git
cd pi-coding-agent

# Copy extensions to Pi's extension directory
cp .pi/agent/extensions/*.ts ~/.pi/agent/extensions/

# Copy theme
mkdir -p ~/.pi/agent/themes
cp .pi/agent/themes/*.json ~/.pi/agent/themes/

# Restart Pi
pi -c
```

### Quick Start

```bash
# 1. Sync your Ollama models into Pi
/ollama-sync

# 2. Reload Pi to pick up changes
/reload

# 3. Run diagnostics to verify everything
/diag

# 4. Benchmark your models
/model-test --all
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

> Use `/ollama-sync` to auto-populate the models array from your Ollama instance.

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

Benchmarks run with `/model-test` on Google Colab CPU (2x Xeon @ 2.20GHz, 12GB RAM):

| Model | Params | Quant | Reasoning | Thinking | Tools | Instructions | Score |
|-------|--------|-------|-----------|----------|-------|-------------|-------|
| `granite4:350m` | 352M | BF16 | ✅ STRONG | ❌ | ✅ STRONG | ✅ STRONG | **3/4** |
| `qwen2.5-coder:1.5b` | 1.5B | Q4_K_M | ❌ WEAK | ❌ | ✅ STRONG | ✅ STRONG | **2/4** |
| `llama3.2:1b` | 1.2B | Q8_0 | ❌ WEAK | ❌ | ✅ STRONG | ✅ STRONG | **2/4** |
| `gemma3:270m` | 268M | Q8_0 | ❌ FAIL | ❌ | ❌ FAIL | ❌ FAIL | **0/4** |
| `functiongemma:270m` | 268M | Q8_0 | — | — | — | — | — |

> Reasoning test uses the model's last number as its answer. The "all but 9 die" puzzle requires understanding that 9 survive — models that calculate 17-9=8 get WEAK, while models that correctly state 9 get STRONG. Thinking test checks for `<think` tag support or native reasoning tokens. Tool usage detects both native Ollama `tool_calls` and JSON tool calls embedded in text. Instruction following includes automatic JSON repair for truncated output.

---

## File Structure

```
.pi/
└── agent/
    ├── extensions/
    │   ├── diag.ts              # System diagnostic suite
    │   ├── model-test.ts        # Model benchmark tool
    │   ├── ollama-sync.ts       # Ollama ↔ models.json sync
    │   └── status.ts            # System resource monitor
    └── themes/
        └── matrix.json          # Matrix movie theme
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