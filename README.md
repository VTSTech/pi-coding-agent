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
- **Ollama** — Running? Version? Response latency? Models pulled? Currently loaded?
- **models.json** — Valid JSON? Provider config? Models listed? Cross-references with Ollama
- **Settings** — settings.json exists? Valid?
- **Extensions** — Extension files found? Active tools?
- **Themes** — Theme files? Valid JSON?
- **Session** — Active model? Context window? Context usage? Thinking level?

Also registers a `self_diagnostic` tool so the AI agent can run diagnostics on command.

```
  ⚡ Pi Diagnostics v1.0
  Written by VTSTech
  GitHub: https://github.com/VTSTech
  Website: www.vts-tech.org
```

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
| **Reasoning** | "17 sheep, all but 9 die" logic puzzle | STRONG / MODERATE / WEAK / FAIL |
| **Thinking** | Extended thinking/reasoning token support | SUPPORTED / NOT SUPPORTED |
| **Tool Usage** | Proper tool call generation via Ollama API | STRONG / MODERATE / WEAK / FAIL |
| **Instruction Following** | JSON output format compliance | STRONG / MODERATE / WEAK / FAIL |

Features:
- Calls Ollama `/api/chat` directly — no Pi agent round-trip
- Retrieves model metadata (size, params, quantization, family) from `/api/tags`
- **Auto-updates `models.json`** reasoning field based on thinking test results
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

── SUMMARY ──────────────────────────────────────────
  ✅ Reasoning: MODERATE
  ❌ Thinking: NO
  ✅ Tool Usage: STRONG
  ✅ Instructions: STRONG
  ℹ️  Score: 3/4 tests passed
```

### 🔄 Ollama Sync (`ollama-sync.ts`)

**Auto-populate models.json with all available Ollama models.**

```bash
/ollama-sync
```

- Queries `http://localhost:11434/api/tags` for available models
- Preserves existing provider config (baseUrl, apiKey, compat settings)
- Sorts models by size (smallest first)
- Auto-detects reasoning-capable models
- Merges with existing per-model settings
- Registered as both `/ollama-sync` slash command and `ollama_sync` tool

### 📊 System Monitor (`sysmon.ts` / `status.ts`)

*Written by VTSTech — https://github.com/VTSTech — www.vts-tech.org*

**Real-time system resource monitoring in the Pi status bar.**

```
CPU 54% · RAM 5.2G/12.7G · Resp 5m24s · max:16384
```

- CPU usage via `os.cpus()` delta (refreshes every 3s)
- RAM usage via `os.totalmem()` and `os.freemem()`
- Response time via `agent_start`/`agent_end` event timing
- Generation parameters captured via `before_provider_request` interception

---

## Themes

### 🟢 Neon Matrix (`neon-matrix.json`)

A Matrix movie-inspired theme with neon green on pure black. Designed for terminal aesthetics and extended coding sessions.

```
/theme neon-matrix
```

Install by copying to `~/.pi/agent/themes/neon-matrix.json`.

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

### Recommended models.json

```json
{
  "providers": {
    "ollama": {
      "baseUrl": "http://localhost:11434/v1",
      "api": "openai-responses",
      "apiKey": "ollama",
      "compat": {
        "supportsDeveloperRole": false,
        "supportsReasoningEffort": false
      },
      "models": [
        { "id": "granite4:350m", "reasoning": false },
        { "id": "qwen2.5-coder:0.5b-instruct-q4_k_m", "reasoning": false },
        { "id": "qwen3:0.6b", "reasoning": true },
        { "id": "qwen3.5:0.8b", "reasoning": false },
        { "id": "qwen2.5:1.5b", "reasoning": false },
        { "id": "llama3.2:1b", "reasoning": false },
        { "id": "granite3.1-moe:1b", "reasoning": false },
        { "id": "qwen3.5:2b", "reasoning": true }
      ]
    }
  }
}
```

### Recommended settings.json

Optimized for CPU-only environments with limited RAM:

```json
{
  "defaultProvider": "ollama",
  "defaultModel": "qwen3.5:0.8b",
  "defaultThinkingLevel": "off",
  "theme": "neon-matrix",
  "compaction": {
    "enabled": true,
    "reserveTokens": 2048,
    "keepRecentTokens": 8000
  }
}
```

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
| `qwen3.5:2b` | 2.3B | 2.7 GB | ✅ | ✅ | Best quality (fits 12GB) |
| `llama3.2:1b` | 1.2B | 1.3 GB | ❌ | ✅ | General use |

---

## Tested Models

Benchmarks run with `/model-test` on Google Colab CPU (2x Xeon @ 2.20GHz, 12GB RAM):

| Model | Params | Quant | Reasoning | Thinking | Tools | Instructions | Score |
|-------|--------|-------|-----------|----------|-------|-------------|-------|
| `granite4:350m` | 352M | BF16 | MODERATE | NO | STRONG | STRONG | **3/4** |
| `qwen2.5-coder:0.5b` | 494M | Q4_K_M | WEAK | NO | FAIL | STRONG | 2/4 |
| `qwen3:0.6b` | 752M | Q4_K_M | FAIL | YES | STRONG | FAIL | 2/4 |

> More benchmarks coming as models are tested. Run `/model-test --all` on your setup to generate your own!

---

## File Structure

```
.pi/
└── agent/
    ├── extensions/
    │   ├── diag.ts              # System diagnostic suite
    │   ├── model-test.ts        # Model benchmark tool
    │   ├── ollama-sync.ts       # Ollama ↔ models.json sync
    │   └── sysmon.ts            # System resource monitor
    ├── themes/
    │   └── neon-matrix.json     # Matrix movie theme
    ├── models.json              # Model provider configuration
    └── settings.json            # Pi settings
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