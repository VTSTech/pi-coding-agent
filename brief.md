# Codebase Brief: pca-ext (Pi Coding Agent Extensions)

**Generated:** 2026-05-13  
**Project:** @vtstech/pi-coding-agent-extensions v1.3.2  
**Purpose:** Pi package with custom extensions, themes, and configurations for the Pi Coding Agent

---

## Executive Summary

pca-ext is a **Pi package** containing 10 extensions, shared utilities, and a Matrix theme. It's designed for resource-constrained environments (Google Colab CPU-only, 12GB RAM) with Ollama serving small local models (0.3B–2B parameters), plus cloud provider support via OpenRouter.

**Version:** 1.3.2 (from VERSION file)  
**Lines of Code:** ~11,302 (extensions + shared)  
**Files Analyzed:** 35+ TypeScript files

---

## Critical Files Index

| File | Purpose | Key Functions |
|------|---------|---------------|
| `extensions/security.ts` | Command/path/SSRF protection | `checkBashToolInput()`, `sanitizeCommand()`, `validatePath()` |
| `extensions/model-test.ts` | Model benchmarking | `runOllamaTests()`, `runCloudTests()` |
| `extensions/diag.ts` | System diagnostics | `runDiagnostics()` |
| `extensions/ollama-sync.ts` | Ollama ↔ models.json sync | `performSync()`, `fetchOllamaModels()` |
| `extensions/react-fallback.ts` | ReAct tool calling bridge | `parseReact()`, `executeAction()` |
| `shared/ollama.ts` | Ollama utilities | `getOllamaBaseUrl()`, `detectProvider()` |
| `shared/types.ts` | Shared TypeScript types | `ToolSupportLevel`, `SecurityCheckResult` |
| `shared/security.ts` | Security validation | `validateCommand()`, `validatePath()`, `isSafeUrl()` |
| `package.json` | Package manifest | Defines pi.extensions, dependencies |
| `themes/matrix.json` | Matrix movie theme | Color palette for terminal UI |

---

## Architecture Overview

```
pca-ext/
├── extensions/          # 10 extension files (api, diag, model-test, security, etc.)
│   ├── api.ts           # API mode switching
│   ├── diag.ts          # System diagnostics  
│   ├── model-test.ts    # Model benchmarking
│   ├── ollama-sync.ts   # Ollama synchronization
│   ├── openrouter-sync.ts # OpenRouter model sync
│   ├── react-fallback.ts # ReAct fallback
│   ├── security.ts       # Security enforcement
│   ├── soul.ts           # SoulSpec personas
│   ├── status.ts         # System monitor
│   └── long-term-memory.ts # LTM management
├── shared/              # Shared utilities (types, ollama, security, debug)
├── individual-packages/ # Extractable npm packages (@vtstech/pi-*)
├── themes/              # Matrix theme
├── scripts/             # Build scripts (build-tgz.sh, bump-version.sh)
└── package.json         # Pi package manifest
```

**Key Pattern:** Extensions are self-contained but share utilities from `shared/`. Each extension is also extractable as an individual npm package under `@vtstech/pi-*` scope.

---

## Extension Details

| Extension | Command | Purpose |
|-----------|---------|---------|
| `api.ts` | `/api` | Runtime API mode switching (10 modes supported) |
| `diag.ts` | `/diag` | Full system diagnostics (system, disk, Ollama, models.json) |
| `long-term-memory.ts` | N/A | Long-term memory management |
| `model-test.ts` | `/model-test` | Benchmark models (reasoning, tool usage, instruction following) |
| `ollama-sync.ts` | `/ollama-sync` | Sync Ollama models to models.json |
| `openrouter-sync.ts` | `/openrouter-sync`, `/or-sync` | Add OpenRouter models to models.json |
| `react-fallback.ts` | N/A | Text-based tool calling for non-native models |
| `security.ts` | `/security` | Command/path/SSRF protection (3 modes: basic/max/off) |
| `soul.ts` | `/souls`, `/soul` | SoulSpec persona management |
| `status.ts` | N/A | System resource monitor in status bar |

---

## Provider Support

**Built-in Providers (12):** openrouter, anthropic, google, openai, groq, deepseek, mistral, xai, together, fireworks, cohere, zai

**Local Provider:** Ollama (via `/api/chat` endpoint)

**URL Resolution Priority:** CLI arg → models.json baseUrl → OLLAMA_HOST env → localhost:11434

---

## Security Model

- **Modes:** `off` | `basic` (critical blocked) | `max` (all blocked)
- **SSRF Protection:** 22 always-blocked patterns + 10 max-only patterns
- **Path Validation:** Blocks `/etc`, `/proc`, parent directory traversal
- **Audit Log:** JSON-lines at `~/.pi/agent/audit.log`
- **Unicode Homoglyph Detection:** Rejects commands where NFKC normalization changes the string

---

## Development Notes

- **TypeScript** with esbuild for bundling
- **No external runtime dependencies** (only devDependencies: esbuild, typescript, @types/node)
- **Atomic writes** for models.json (write-then-rename pattern)
- **TTL cache** (2s) for models.json and Ollama URL lookups
- **Promise-based mutex** for concurrent models.json writes

---

## Key Constants

- `EXTENSION_VERSION`: 1.3.1 (in shared/ollama.ts)
- `VERSION` file: 1.3.2
- `MODELS_JSON_PATH`: `~/.pi/agent/models.json`
- `CACHE_TTL_MS`: 2000 (2 seconds)

---

## Quick Start

```bash
# Install
pi install git:github.com/VTSTech/pi-coding-agent

# Sync Ollama models
/ollama-sync

# Run diagnostics
/diag

# Benchmark models
/model-test --all
```

---

## Recent Changes (v1.3.x)

- Added `off` security mode for development
- Improved DNS rebinding protection in SSRF checks
- Added retry logic with exponential backoff for Ollama API calls
- Added promise-based mutex for concurrent models.json writes
- Added context length detection batching
- Added memory estimation for GPU/CPU