# Codebase Intelligence Brief: Pi Coding Agent Extensions (VTSTech)

> Generated: 04-13-2026 | Auditor: Super-Z (GLM-5) | Commit: b87ca27 | Version: 1.1.8-dev

---

## Project Identity

| Field | Value |
|-------|-------|
| **Purpose** | Pi package providing extensions, themes, and shared utilities for the Pi Coding Agent — optimized for resource-constrained environments (Colab, budget machines) running small Ollama models (0.3B–2B) and cloud providers |
| **Tech Stack** | TypeScript (ESM, strict), Node.js 22+, esbuild ^0.28.0 (pinned devDep), tsconfig.json with ES2022 target, no framework |
| **Entry Point** | Pi auto-discovers `extensions/*.ts` and `themes/*.json` from the `pi` manifest in root `package.json` |
| **Build/Run** | `./scripts/build-packages.sh` (esbuild TS→ESM + npm pack), `./scripts/publish-packages.sh` (npm publish); runtime: `pi install git:github.com/VTSTech/pi-coding-agent` |
| **Test Command** | `npm test` → `tsx --test tests/*.test.ts` (6 test files: format, ollama, openrouter-sync, react-parser, security, shared-utils) |
| **Total Source** | ~11,582 lines across 8 extension TypeScript files + 11 shared TypeScript files + 1 JSON theme + 6 test files |

---

## Architecture Map

```
extensions/       → Pi extension source files (8 .ts files) — auto-loaded by Pi
shared/           → Shared utility library imported by all extensions (11 .ts files + package.json)
themes/           → Pi TUI themes (1 JSON file: matrix.json)
tests/            → Unit tests (6 .ts files, run via tsx --test)
npm-packages/     → Per-extension npm package manifests + compiled JS for publishing (9 packages)
  shared/         → @vtstech/pi-shared (11 subpath exports: config-io, debug, errors, format,
                   model-test-utils, ollama, provider-sync, react-parser, security, test-report, types)
  api/            → @vtstech/pi-api
  diag/           → @vtstech/pi-diag
  model-test/     → @vtstech/pi-model-test
  ollama-sync/    → @vtstech/pi-ollama-sync
  openrouter-sync/→ @vtstech/pi-openrouter-sync
  react-fallback/ → @vtstech/pi-react-fallback
  security/       → @vtstech/pi-security
  status/         → @vtstech/pi-status
scripts/          → Build/publish shell scripts (esbuild-based)
VERSION           → Single source of truth for version (scripts read from this file at runtime)
.build-npm/       → esbuild output (gitignored) — flat structure, not scoped
dist/             → npm pack tarball output (gitignored) — for offline testing
```

### Skip List

- `.build-npm/` — generated build output, gitignored
- `dist/` — npm pack tarballs, gitignored
- `node_modules/` — no node_modules in repo (dependencies are Pi's runtime deps)
- `TESTS.md` — benchmark results, informational only
- `CHANGELOG.md` — version history, not needed for code work
- `npm-packages/shared/*.ts` — DELETED. Canonical source is `shared/*.ts` only.
- `npm-packages/*/.npmignore` — published package exclusion lists, not needed for code work

---

## Critical Files Index

| File | Lines | Purpose | Why It Matters |
|------|-------|---------|----------------|
| `shared/security.ts` | 1,011 | Command blocklist (66 total, partitioned), SSRF (26+ patterns + DNS rebinding), path validation, security mode toggle, audit log | Imported by 3 extensions + status. Largest shared module. `validatePath()` with `fs.realpathSync()` for symlink bypass. Crash-safe buffered audit writes. IPv6-mapped SSRF protection. Unicode NFKC normalization. |
| `extensions/model-test.ts` | 1,640 | Model benchmark (Ollama + cloud) | Largest extension. 10 test functions across 2 suites. Streaming Ollama chat. User-configurable timeouts via `getEffectiveConfig()`. Test history with regression detection. |
| `shared/ollama.ts` | 765 | Ollama API helpers, models.json I/O, provider detection, mutex, retry | Imported by ALL 8 extensions (central hub). TTL cache (2s), `EXTENSION_VERSION`, `BUILTIN_PROVIDERS` (11), `detectProvider()`, `readModifyWriteModelsJson()` mutex. |
| `extensions/api.ts` | 732 | Runtime API mode/URL/thinking/provider switcher | `/api` command with 8 sub-commands. Tab completion for modes + providers. Uses `shared/config-io` for settings I/O. |
| `extensions/diag.ts` | 569 | Full system diagnostic suite | `self_diagnostic` tool + `/diag` command. 9 check categories. Secret redaction for settings.json. Mode-aware security tests. |
| `extensions/security.ts` | 492 | Security tool registrations for Pi's tool execution hooks | Wraps shared security functions. Intercepts `tool_call` and `tool_result` events. `/security mode basic|max` command + `/security-audit` command + `security_audit` tool. |
| `extensions/status.ts` | 492 | Composable status bar via `ctx.ui.setStatus()` | 11+ event listeners. Detects local vs cloud provider. Per-tool live timing. Async Pi version detection. Session-gated polling with `.unref()`. |
| `shared/model-test-utils.ts` | 692 | Shared test utilities, config, history, scoring | `CONFIG` constants, `WEATHER_TOOL_DEFINITION`, `ChatFn` abstraction. User config via `model-test-config.json`. Test history with regression detection. |
| `shared/react-parser.ts` | 552 | Multi-dialect ReAct text parser | 4 dialects (react, function, tool, call). `detectReactDialect()` extracted from model-test.ts. `extractBraceJson()` canonical source. `fuzzyMatchToolName()`. |
| `shared/format.ts` | 401 | Output formatting, numeric display, memory estimation | `bytesHuman`, `fmtBytes` (with <1KB guard), `estimateMemory()` with context-aware CPU formula. `sanitizeForReport()`. |
| `extensions/ollama-sync.ts` | 313 | Ollama model sync to models.json | Uses `readModifyWriteModelsJson()` for mutex-protected writes. Imports `mergeModels` from `shared/provider-sync`. Batched context length fetch. |
| `extensions/react-fallback.ts` | 311 | ReAct text-based tool calling bridge | Registers `tool_call` bridge tool (conditional on `/react-mode`). Exports parser via direct import (no more `pi._reactParser`). |
| `extensions/openrouter-sync.ts` | 298 | OpenRouter model addition to models.json | Now uses `readModifyWriteModelsJson()` for mutex protection. Provider ordering. URL query param stripping. |
| `shared/errors.ts` | 79 | Typed error class hierarchy | `ExtensionError` (base), `ConfigError`, `ApiError`, `TimeoutError`, `SecurityError`, `ToolError`. Wired into api.ts and security.ts. |
| `shared/config-io.ts` | 77 | Centralized config file I/O | `readJsonConfig<T>()`, `writeJsonConfig()`, `readSettings()`, `writeSettings()`. Path constants for all Pi agent config files. |
| `shared/provider-sync.ts` | 43 | Provider-agnostic model merge utility | `mergeModels(newModels, oldModels)` — pure function preserving user-defined fields. Used by both sync extensions. |
| `shared/test-report.ts` | 120 | Benchmark report formatting | `formatTestSummary()`, `formatRecommendation()`, `formatTestScore()`, branding. Extracted from model-test.ts. |
| `shared/types.ts` | 135 | TypeScript type definitions | `ToolSupportLevel`, `SecurityCheckResult`, `AuditEntry`, `ToolSupportCacheEntry`, `OllamaChatResponse`, Pi event shapes. |
| `shared/debug.ts` | 32 | Debug logging utility | `debugLog()` gated by `PI_EXTENSIONS_DEBUG=1`. Zero overhead in production. |
| `themes/matrix.json` | 80 | Matrix-inspired TUI theme | Neon green on black; 12 custom color variables. |
| `scripts/build-packages.sh` | 309 | Build pipeline | esbuild TS→ESM, preflight checks, reads VERSION file, rewrites imports, syncs to npm-packages/, packs tarballs. |

---

## Dependency Graph

All extensions import from `shared/`. Pi provides the runtime API (`pi` object).

```
extensions/model-test.ts ──→ shared/format + shared/ollama + shared/types
                             + shared/react-parser + shared/model-test-utils + shared/test-report
extensions/react-fallback.ts ──→ shared/format + shared/ollama (version only)
                               + shared/react-parser + shared/debug
extensions/api.ts ──→ shared/format + shared/ollama + shared/config-io + shared/errors
extensions/status.ts ──→ shared/ollama + shared/format + shared/debug + shared/security (mode only)
extensions/diag.ts ──→ shared/format + shared/ollama + shared/security + shared/debug
extensions/security.ts ──→ shared/security + shared/format + shared/ollama (version) + shared/debug + shared/errors
extensions/ollama-sync.ts ──→ shared/ollama + shared/format + shared/provider-sync
extensions/openrouter-sync.ts ──→ shared/ollama + shared/format

shared/ollama.ts ←── imported by ALL 8 extensions (central hub)
shared/format.ts ←── imported by ALL 8 extensions
shared/debug.ts ←── imported by 4 extensions + 2 shared modules
shared/security.ts ←── imported by 3 extensions (diag, security ext, status)
shared/react-parser.ts ←── imported by 2 extensions (model-test, react-fallback)
shared/config-io.ts ←── imported by 1 extension (api)
shared/errors.ts ←── imported by 2 extensions (api, security) — both import unused types
shared/provider-sync.ts ←── imported by 1 extension (ollama-sync)
shared/model-test-utils.ts ←── imported by 1 extension (model-test)
shared/test-report.ts ←── imported by 1 extension (model-test)
shared/types.ts ←── imported by 1 extension (model-test) + 2 shared modules
```

At npm publish time, relative `../shared/*` imports are rewritten to `@vtstech/pi-shared/*` (subpath imports). The `@vtstech/pi-shared` package is marked `--external` in esbuild — resolved at runtime via `node_modules/`.

### Extension Registration Summary

| Extension | Commands | Tools | Events | Completions |
|-----------|----------|-------|--------|-------------|
| api | `/api`, `/api provider` | — | — | `/api` tab completion (sub-commands + args) |
| diag | `/diag` | `self_diagnostic` | — | — |
| model-test | `/model-test` | `model_test` | — | model name completion |
| ollama-sync | `/ollama-sync` | `ollama_sync` | — | URL arg completion |
| openrouter-sync | `/openrouter-sync`, `/or-sync` | `openrouter_sync` | — | — |
| react-fallback | `/react-mode`, `/react-parse` | `tool_call` (conditional) | `context` | — |
| security | `/security`, `/security-audit` | `security_audit` | `tool_call`, `tool_result` | `/security` tab completion |
| status | — | — | 12+ lifecycle events | — |
| **Totals** | **12** | **7** | **15+** | **3** |

---

## Patterns & Conventions

| Aspect | Pattern |
|--------|---------|
| Module system | ESM exclusively — `"type": "module"`, `import`/`export`, `--format=esm` in esbuild |
| Type system | Strict TypeScript (`strict: true`, `noImplicitAny`, `strictNullChecks`). Extensions import `type { ExtensionAPI }` from `@mariozechner/pi-coding-agent`. |
| Pi extension API | `pi.registerCommand()` for slash commands, `pi.registerTool()` for LLM-callable tools, `pi.registerCompletion()` for tab completion |
| Pi events | `pi.on("session_start/start/shutdown", ...)`, `pi.on("before_provider_request", ...)`, `pi.on("tool_call/tool_result", ...)`, `pi.on("tool_execution_start/end", ...)` |
| Pi interception | `pi.on("tool_call", ...)` returns `{ block: true, reason }` to prevent tool execution; `pi.on("tool_result", ...)` for post-execution logging |
| Status display | `ctx.ui.setStatus("slot-name", value)` — composable named slots, NOT `pi.setFooter()`. Slots flushed from `flushStatus()`. Cleared on `session_shutdown`. |
| Ollama URL resolution | `models.json` provider baseUrl → `OLLAMA_HOST` env → `http://localhost:11434` (triple fallback) |
| Provider detection | 3-tier: user-defined in `models.json` → built-in `BUILTIN_PROVIDERS` (11 providers) → unknown fallback |
| Version management | VERSION file is single source of truth. `EXTENSION_VERSION` in `shared/ollama.ts` derived at build time. Build scripts read VERSION at runtime. |
| Build output | Flat `.build-npm/<name>/` (not scoped) |
| Error handling | Try/catch with `debugLog()` in catch blocks. Structured typed errors from `shared/errors.ts` (ExtensionError hierarchy). Extensions return structured failure objects for test functions. |
| Security model | Partitioned blocklist: 41 CRITICAL (always) + 25 EXTENDED (max-mode-only). Mode-aware SSRF (19 ALWAYS + 7 MAX_ONLY). DNS rebinding protection. Unicode NFKC normalization. `validatePath()` with symlink deref. |
| Config persistence | `~/.pi/agent/` directory for all config: `settings.json`, `models.json`, `security.json`, `react-mode.json`, `model-test-config.json`. Centralized path constants in `shared/config-io.ts`. |
| Config I/O | `shared/config-io.ts` provides `readJsonConfig<T>()` / `writeJsonConfig()`. Note: `writeJsonConfig` uses `writeFileSync` directly, not atomic write-then-rename despite docstring claim. |
| HTTP client | Native `fetch()` exclusively — no curl subprocesses (migrated in 1.1.1) |
| Memory estimation | `estimateMemory()` returns `{ gpu, cpu }`. GPU: 10% overhead. CPU: context-aware `1.5 + (contextLength / 100_000)` calibrated against Colab data. |
| Concurrency | `acquireModelsJsonLock()` / `readModifyWriteModelsJson()` for mutex-protected models.json writes. Used by ollama-sync and openrouter-sync. |
| Retry logic | `withRetry()` in shared/ollama.ts — exponential backoff + ±25% jitter. `RETRYABLE_ERROR_PATTERNS` for transient failure detection. |
| Test history | `appendTestHistory()` writes to `~/.pi/agent/cache/model-test-history.json`. Per-model (50) and total (500) entry caps. `detectRegression()` compares scores against last run. |
| User config | `readTestConfig()` reads `model-test-config.json`. `getEffectiveConfig()` merges user values with `CONFIG` defaults. All test timeouts now use effective config. |
| Inter-extension comm | Direct imports from `shared/` — `pi._reactParser` pattern removed in 1.1.8. No more `(pi as any)` for cross-extension data sharing. |
| Code extraction | Repeated logic extracted to shared modules: react-parser (4 dialects), model-test-utils (ChatFn), provider-sync (mergeModels), config-io (settings I/O), test-report (formatting), errors (typed hierarchy). |
| Tab completion | `pi.registerCompletion()` for multi-arg depth-aware completion (api, security). `registerCommand`'s `getArgumentCompletions` only supports single-level. |
| Debug logging | `debugLog()` from shared/debug.ts — only emits when `PI_EXTENSIONS_DEBUG=1`. All empty catch blocks replaced with debugLog calls in 1.1.8. |

---

## Known Landmines

- **Version bumping requires updating 3 places**: VERSION file (source of truth), `shared/ollama.ts` (`EXTENSION_VERSION`), root `package.json` (`version`). Build scripts derive from VERSION at runtime. Use `scripts/bump-version.sh` for semi-automation.

- **No barrel export in shared** — all imports use subpath: `from "@vtstech/pi-shared/ollama"`. Both `shared/package.json` and `npm-packages/shared/package.json` have `"exports"` maps with NO `"."` entry. Do not add one.

- **`models.json` is the source of truth** for Ollama URL, provider config, model list, and reasoning flags. Use `readModelsJson()`/`writeModelsJson()` from shared (with 2s TTL cache) — never raw `fs.readFileSync`. Use `readModifyWriteModelsJson()` for any read-modify-write cycle.

- **`config-io.ts` docstring is misleading** — claims `writeJsonConfig` uses "write-then-rename for crash safety" but implementation uses plain `writeFileSync`. Any code relying on atomicity from this function will be disappointed.

- **Duplicated path constants** — `SETTINGS_PATH` is defined in both `shared/config-io.ts` (line 56) and `shared/security.ts` (line 28). `SECURITY_CONFIG_PATH` is duplicated between `shared/config-io.ts` (line 59) and `shared/security.ts` (line 45). `MODEL_TEST_CONFIG_PATH` is in both `shared/config-io.ts` and `shared/model-test-utils.ts`. `~/.pi/agent` base path is independently constructed in 4+ files. A single source of truth would prevent drift.

- **`updateModelsJsonReasoning` in model-test.ts still uses `readModelsJson`/`writeModelsJson` without mutex** — while both sync extensions now correctly use `readModifyWriteModelsJson()`, the model-test extension's reasoning field update bypasses the mutex during test execution.

- **Unused imports** — `ConfigError` in api.ts, `SecurityError` in security.ts, `bytesHuman` in security.ts, `padRight` in diag.ts, `writeModelsJson` in openrouter-sync.ts. Dead code that should be cleaned up.

- **`model-test.ts` is still 1,640 lines** — only reduced by ~95 lines from 1.1.7. `test-report.ts` extraction was a start, but more extraction is needed. `showConfig` in api.ts also duplicates local-detection logic.

- **`detectModelFamily()` maps `mistral` → `"qwen2"` and `codestral` → `"qwen2"`** — intentional (Mistral-based instruction tuning) but surprising. `phi` and `tinyllama` map to `"llama"`.

- **`isReasoningModel()` is still overly broad** — includes `qwen3`, `thinker`, `thinking` which flags many non-reasoning models. Can produce false positives during `/ollama-sync`.

- **`registerBridgeTool()` in react-fallback.ts can be called multiple times** — every `/react-mode` toggle to on calls `registerBridgeTool()`, potentially causing duplicate tool registration.

- **Test files re-implement source logic inline** — `openrouter-sync.test.ts` and `shared-utils.test.ts` both copy `parseModelIds` and `ensureProviderOrder` inline instead of importing from source. Any drift between test copies and production code goes undetected.

- **Security mode defaults to `max`** — if `security.json` doesn't exist, `getSecurityMode()` returns `"max"`. `validatePath()` blocks access to `security.json` via the sensitive paths list.

- **`resolveAndCheckHostname` catches ALL DNS errors and returns `safe: true`** — a DNS failure is treated as "not a security violation." Intentional for resilience but may be surprising.

- **`config-io.ts` readJsonConfig has an empty catch block** — silently swallows all read/parse errors, returning `defaultValue`. No debugLog call.

---

## Active Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Module format | ESM only (no CJS) | Pi loads extensions via dynamic ESM import; `"type": "module"` is required |
| Shared code | Separate `@vtstech/pi-shared` npm package with subpath exports | Avoids bundling shared code into every extension; Pi resolves at runtime |
| HTTP client | Native `fetch()` (not curl) | Eliminates shell injection vectors; cleaner error handling |
| Security model | Partitioned blocklist + validation (not sandboxing) | Mode-aware (basic/max); Pi extensions run with full Node.js access |
| Build tool | esbuild (not tsc) | Fast, bundles deps, TS→JS in one pass |
| Version source | VERSION file at repo root | Single source of truth; build/publish scripts derive at runtime |
| ReAct default | Disabled | Small models attempt malformed native tool calls when they see the bridge tool |
| Provider registry | Hardcoded `BUILTIN_PROVIDERS` (11 providers) | Pi doesn't expose provider metadata |
| Inter-extension comm | Direct shared imports | `pi._reactParser` removed in 1.1.8 — cleaner, type-safe |
| Concurrency | In-memory mutex via `acquireModelsJsonLock()` | Prevents lost-write races between extensions |
| Retry logic | `withRetry()` with exponential backoff + jitter | Handles transient Ollama connection failures |
| Error hierarchy | Typed classes from `shared/errors.ts` | Replaced raw string throws; enables `instanceof` error handling |
| Config I/O | Centralized in `shared/config-io.ts` | Eliminated duplicated readSettings/writeSettings across extensions |
| Provider sync | Shared `mergeModels()` from `shared/provider-sync.ts` | Eliminated duplication between ollama-sync and openrouter-sync |
| Test report formatting | Extracted to `shared/test-report.ts` | Reduced model-test.ts size; pure presentation layer |
| Status display | Composable named slots via `ctx.ui.setStatus()` | Coexists with other extensions; session-gated polling |
| Audit logging | Buffered writes (500ms/50 entries) + crash-safe flush | Reduced disk I/O; `process.on("exit")` handler prevents data loss |
| Temp directory | `~/.pi/agent/tmp/` (restricted) | NOTE: SEC-04 fix was reverted per user request — `/tmp` is re-allowed |

---

## What's Missing / Incomplete

- **`config-io.ts` writeJsonConfig is not atomic** — docstring claims "write-then-rename" but uses plain `writeFileSync`. No `.tmp` + `rename` pattern.

- **Duplicated path constants across shared modules** — `SETTINGS_PATH`, `SECURITY_CONFIG_PATH`, `MODEL_TEST_CONFIG_PATH` each defined in 2 files. `~/.pi/agent` base constructed independently in 4+ files.

- **`model-test.ts` still large at 1,640 lines** — test-report extraction was partial. `showConfig` in api.ts also has duplication.

- **No JSON schema validation for config files** — malformed config causes silent failures. `readJsonConfig` silently falls back to defaults.

- **No CI/CD pipeline** — no automated testing, linting, or publishing workflows.

- **`ollama.ts` still monolithic at 765 lines** — combines I/O, caching, locking, retry, provider detection, model family detection.

- **Test files re-implement source logic** — `parseModelIds` and `ensureProviderOrder` are tested via inline copies, not imports from source.

- **`updateModelsJsonReasoning` bypasses mutex** — uses `readModelsJson`/`writeModelsJson` directly instead of `readModifyWriteModelsJson()`.

- **Unused imports** — ConfigError (api.ts), SecurityError (security.ts), bytesHuman (security.ts), padRight (diag.ts), writeModelsJson (openrouter-sync.ts).

- **No integration tests** — all tests are unit-level; no end-to-end tests covering extension interactions.

- **`models.json` cache coherence** — 2s TTL can cause stale reads during rapid operations.

- **`getEffectiveConfig`/`readTestConfig` are untested** — the function whose misuse caused the original ROB-01 bug has no dedicated test.

---

## Quick Start for Developer

1. **Read the Critical Files Index** — start with `shared/ollama.ts` (central hub imported by everything)
2. **Understand the Pi extension API** — extensions receive a `pi` global object typed as `ExtensionAPI`, register commands/tools/completions
3. **Check Known Landmines** — version bumping (3 places), models.json mutex requirement, no barrel exports, config-io false atomicity, duplicated path constants
4. **Follow Patterns & Conventions** — ESM only, `readModifyWriteModelsJson()` for models.json writes, native `fetch()` for HTTP, `ctx.ui.setStatus()` for status, `debugLog()` for catch blocks
5. **Use mutex for models.json writes** — `readModifyWriteModelsJson()` instead of manual read→modify→write
6. **Use shared/config-io for settings I/O** — don't roll your own `readSettings`/`writeSettings`
7. **Use shared/errors for typed exceptions** — `ConfigError`, `SecurityError`, etc. instead of raw strings
8. **Build pipeline**: `npm install` → `./scripts/build-packages.sh all` → `.build-npm/` → `npm-packages/` → `dist/`
9. **Type checking**: `npm run typecheck` → `tsc --noEmit` (strict mode)
10. **Tests**: `npm test` → `tsx --test tests/*.test.ts`
11. **Install as bundle**: `pi install git:github.com/VTSTech/pi-coding-agent`
12. **Validation**: `/diag` for health, `/model-test` for benchmarks, `/ollama-sync` for Ollama

Do NOT start by reading every file. Use the Dependency Graph to understand coupling, then read only what you need for your specific task.
