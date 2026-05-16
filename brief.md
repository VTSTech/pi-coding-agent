# Codebase Brief: pca-ext (Pi Coding Agent Extensions)

**Generated:** 2026-05-16
**Project:** @vtstech/pi-coding-agent-extensions v1.3.5
**Purpose:** Pi package with custom extensions, themes, and configurations for the Pi Coding Agent

---

## Executive Summary

pca-ext is a **Pi package** containing 11 extensions, shared utilities, and a Matrix theme. It's designed for resource-constrained environments (Google Colab CPU-only, 12GB RAM) with Ollama serving small local models (0.3B–2B parameters), plus cloud provider support via OpenRouter.

**Version:** 1.3.5 (from VERSION file)
**Lines of Code:** ~11,500 (extensions + shared)
**Files Analyzed:** 38+ TypeScript files

---

## Critical Files Index

| File | Purpose | Key Functions |
|------|---------|---------------|
| `extensions/soul.ts` | SoulSpec persona management | `loadSoul()`, `saveActiveSoul()`, `loadActiveSoul()`, `listSouls()` |
| `extensions/security.ts` | Command/path/SSRF protection | `checkBashToolInput()`, `sanitizeCommand()`, `validatePath()` |
| `extensions/model-test.ts` | Model benchmarking | `runOllamaTests()`, `runCloudTests()`, `parseTestResults()` |
| `extensions/diag.ts` | System diagnostics | `runDiagnostics()`, `checkSystem()`, `checkOllama()` |
| `extensions/ollama-sync.ts` | Ollama ↔ models.json sync | `performSync()`, `fetchOllamaModels()` |
| `extensions/hex-edit.ts` | Hex stream-based editing | `hexEdit()`, `hexEditShow()`, `hexEditValidate()`, `hexEditDiff()` |
| `shared/ollama.ts` | Ollama utilities | `getOllamaBaseUrl()`, `detectProvider()`, `fetchModels()` |
| `shared/security.ts` | Security validation | `validateCommand()`, `validatePath()`, `isSafeUrl()` |
| `shared/react-parser.ts` | ReAct text parser | `parseReact()`, `extractToolCalls()`, `buildRegexPatterns()` |
| `shared/model-test-utils.ts` | Test utilities | `runReasoningTest()`, `runInstructionTest()`, `runToolUsageTest()` |
| `shared/types.ts` | Shared TypeScript types | `ToolSupportLevel`, `SecurityCheckResult`, `AuditEntry` |
| `shared/format.ts` | Formatting utilities | `formatBytes()`, `formatDuration()`, `formatDurationVerbose()` |
| `shared/config-io.ts` | Config file I/O | `readConfig()`, `writeConfig()`, `atomicWrite()` |
| `shared/debug.ts` | Debug logging | `debugLog()`, `setDebugMode()` |
| `shared/errors.ts` | Error classes | `PiError`, `SecurityError`, `OllamaError` |
| `shared/test-report.ts` | Test report formatting | `createTestReport()`, `formatScore()` |
| `shared/provider-sync.ts` | Provider sync utilities | `syncProvider()`, `addProvider()` |
| `shared/path-utils.ts` | Path utilities | `sanitizePath()`, `validatePathComponents()` |
| `package.json` | Package manifest | Defines pi.extensions, dependencies |
| `themes/matrix.json` | Matrix movie theme | Color palette for terminal UI |

---

## Architecture Overview

```
pca-ext/
├── extensions/          # 11 extension files (api, diag, model-test, security, etc.)
│   ├── api.ts           # API mode switching
│   ├── diag.ts          # System diagnostics
│   ├── hex-edit.ts      # Hex stream-based editing
│   ├── long-term-memory.ts # LTM management
│   ├── model-test.ts    # Model benchmarking
│   ├── ollama-sync.ts   # Ollama synchronization
│   ├── openrouter-sync.ts # OpenRouter model sync
│   ├── react-fallback.ts # ReAct fallback
│   ├── security.ts       # Security enforcement
│   ├── soul.ts           # SoulSpec persona management
│   └── status.ts         # System monitor
├── shared/              # Shared utilities (types, ollama, security, debug, etc.)
│   ├── config-io.ts     # Config file I/O with atomic writes
│   ├── debug.ts         # Conditional debug logging
│   ├── errors.ts        # Error classes
│   ├── format.ts        # Shared formatting utilities
│   ├── model-test-utils.ts # Test utilities, config, history
│   ├── ollama.ts        # Ollama API helpers, provider detection, mutex, retry
│   ├── path-utils.ts    # Path validation utilities
│   ├── provider-sync.ts # Provider sync utilities
│   ├── react-parser.ts  # Multi-dialect ReAct text parser
│   ├── security.ts      # Security validation, SSRF, DNS rebinding, audit log
│   ├── test-report.ts   # Test report formatting
│   └── types.ts         # TypeScript types & error classes
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
| `soul.ts` | `/souls`, `/soul` | SoulSpec persona management with persistence |
| `status.ts` | N/A | System resource monitor in status bar |
| `hex-edit.ts` | `/hex-edit*` | Hex stream-based file editing |

---

## Provider Support

**Built-in Providers (12):** openrouter, anthropic, google, openai, groq, deepseek, mistral, xai, together, fireworks, cohere, zai

**Local Provider:** Ollama (via `/api/chat` endpoint)

**URL Resolution Priority:** CLI arg → models.json baseUrl → OLLAMA_HOST env → localhost:11434

---

## Security Model

- **Modes:** `off` | `basic` (critical blocked) | `max` (all blocked)
- **SSRF Protection:** 22 always-blocked patterns + 7 max-only patterns
- **Path Validation:** Blocks `/etc`, `/proc`, parent directory traversal
- **Audit Log:** JSON-lines at `~/.pi/agent/audit.log`
- **Unicode Homoglyph Detection:** Rejects commands where NFKC normalization changes the string
- **Shell Injection Detection:** Regex patterns for command chaining, substitution, redirection

---

## SoulSpec Persona Management (New)

**Persistent Soul Loading:**
- Active soul stored in `~/.pi/agent/.active-soul.json`
- Automatically injected into system prompt on every user prompt cycle via `before_agent_start` hook
- Supports `/soul off` to disable persistence
- Shows startup report: auto-loaded soul name or available soul count

**Progressive Disclosure:**
- `/soul <name> --level N` respects level flag (1-3)
- Level 1: Basic info only
- Level 2: Core persona (default)
- Level 3: Extended behavior and details

**Multi-location Search:**
- Global (`~/.pi/agent/souls/`)
- Project-local (`.pi/souls/`)
- Current directory (`./souls/`)

---

## Development Notes

- **TypeScript** with esbuild for bundling
- **No external runtime dependencies** (only devDependencies: esbuild, typescript, @types/node)
- **Atomic writes** for models.json (write-then-rename pattern)
- **TTL cache** (2s) for models.json and Ollama URL lookups
- **Promise-based mutex** for concurrent models.json writes
- **Test suite:** 8 test files covering core functionality (format, hex-edit, ollama, openrouter-sync, react-parser, security, shared-utils, soul)
- **Version management:** Single source of truth in VERSION file; script-based updates to all locations

---

## Key Constants

- `EXTENSION_VERSION`: 1.3.4 (in shared/ollama.ts)
- `VERSION` file: 1.3.5
- `MODELS_JSON_PATH`: `~/.pi/agent/models.json`
- `ACTIVE_SOUL_PATH`: `~/.pi/agent/.active-soul.json`
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

# Use SoulSpec persona
/soul nova-helper
/soul nova-helper --level 3
```

---

## Recent Changes (v1.3.x)

- **v1.3.5**: SoulSpec persistence across sessions, --level flag support
- **v1.3.4**: Added hex-edit extension for byte-level file editing
- **v1.3.3**: Extended reasoning test with 20 puzzles, improved error handling
- **v1.3.2**: Security mode persistence, DNS rebinding protection
- **v1.3.1**: Improved Ollama sync with remote URL support
- **v1.3.0**: Initial release with core extensions
