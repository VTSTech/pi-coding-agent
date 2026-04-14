# Codebase Intelligence Brief: Pi Coding Agent Extensions (VTSTech)

> Generated: 2026-04-15 | Auditor: Super-Z (GLM-5) | Commit: 6e9db45 | Version: 1.1.9

---

## Project Identity

| Field | Value |
|-------|-------|
| **Purpose** | Pi package providing extensions, themes, and shared utilities for the Pi Coding Agent — optimized for resource-constrained environments (Colab, budget machines) running small Ollama models (0.3B–2B) and cloud providers |
| **Tech Stack** | TypeScript (ESM, strict), Node.js 22+, esbuild ^0.28.0 (pinned devDep), tsconfig.json with ES2022 target, no framework |
| **Entry Point** | Pi auto-discovers `extensions/*.ts` and `themes/*.json` from the `pi` manifest in root `package.json` |
| **Build/Run** | `./scripts/build-packages.sh` (esbuild TS→ESM + npm pack), `./scripts/publish-packages.sh` (npm publish); runtime: `pi install git:github.com/VTSTech/pi-coding-agent` |
| **Test Command** | `npm test` → `tsx --test tests/*.test.ts` (6 test files, 214 tests: format, ollama, openrouter-sync, react-parser, security, shared-utils) |
| **Total Source** | ~12,354 lines across 8 extension TypeScript files + 11 shared TypeScript files + 1 JSON theme + 6 test files + build scripts |

---

## Architecture Map

```
extensions/       → Pi extension source files (8 .ts files) — auto-loaded by Pi
shared/           → Shared utility library imported by all extensions (11 .ts files + package.json)
themes/           → Pi TUI themes (1 JSON file: matrix.json)
tests/            → Unit tests (6 .ts files, 214 tests total, run via tsx --test)
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
scripts/          → Build/publish/version-bump shell scripts (esbuild-based)
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
- `npm-packages/shared/*.ts` — canonical source is `shared/*.ts` only
- `npm-packages/*/.npmignore` — published package exclusion lists, not needed for code work

---

## Critical Files Index

| File | Lines | Purpose | Why It Matters |
|------|-------|---------|----------------|
| `shared/security.ts` | 1,012 | Command blocklist (66 total, partitioned), SSRF (26+ patterns + DNS rebinding), path validation, security mode toggle, audit log | Imported by 3 extensions + status. Largest shared module. `validatePath()` with `fs.realpathSync()` for symlink bypass. Crash-safe buffered audit writes. IPv6-mapped SSRF protection. Unicode NFKC normalization. |
| `extensions/model-test.ts` | 1,646 | Model benchmark (Ollama + cloud) | Largest extension. 10 test functions across 2 suites. Streaming Ollama chat. User-configurable timeouts via `getEffectiveConfig()`. Test history with regression detection. **Missing `debugLog` import** — causes ReferenceError when `PI_EXTENSIONS_DEBUG=1`. |
| `shared/ollama.ts` | 770 | Ollama API helpers, models.json I/O, provider detection, mutex, retry | Imported by ALL 8 extensions (central hub). TTL cache (2s), `EXTENSION_VERSION`, `BUILTIN_PROVIDERS` (12 providers incl. zai), `detectProvider()`, `readModifyWriteModelsJson()` mutex. **Bug: `fetchModelContextLength` debug log uses `model` instead of `modelName` (line 513).** |
| `extensions/api.ts` | 773 | Runtime API mode/URL/thinking/provider switcher | `/api` command with 8 sub-commands. Tab completion. **Uses non-atomic `writeModelsJson()` in 4 places** instead of `readModifyWriteModelsJson()`. Now resolves session provider by default (v1.1.9). |
| `extensions/diag.ts` | 570 | Full system diagnostic suite | `self_diagnostic` tool + `/diag` command. 9 check categories. Secret redaction for settings.json. Mode-aware security tests. **Bypasses `config-io.ts` — reads settings.json directly via `fs.readFileSync`.** |
| `extensions/security.ts` | 492 | Security tool registrations for Pi's tool execution hooks | Wraps shared security functions. Intercepts `tool_call` and `tool_result` events. `/security mode basic\|max` command + `/security-audit`. **`sanitizeInputForLog` only truncates, doesn't redact secrets.** |
| `extensions/status.ts` | 493 | Composable status bar via `ctx.ui.setStatus()` | 12+ event listeners. Detects local vs cloud provider. Per-tool live timing. Async Pi version detection. Session-gated polling with `.unref()`. **20+ mutable module-scoped `let` variables — no encapsulation.** |
| `shared/model-test-utils.ts` | 698 | Shared test utilities, config, history, scoring | `CONFIG` constants, `WEATHER_TOOL_DEFINITION`, `ChatFn` abstraction. User config via `model-test-config.json`. Test history with regression detection. **Zero test coverage.** |
| `shared/react-parser.ts` | 552 | Multi-dialect ReAct text parser | 4 dialects (react, function, tool, call). `detectReactDialect()` extracted from model-test.ts. `extractBraceJson()` canonical source. `fuzzyMatchToolName()`. |
| `shared/format.ts` | 402 | Output formatting, numeric display, memory estimation | `bytesHuman`, `fmtBytes` (with <1KB guard), `estimateMemory()` with context-aware CPU formula. `sanitizeForReport()`. |
| `extensions/ollama-sync.ts` | 317 | Ollama model sync to models.json | Uses `readModifyWriteModelsJson()` for mutex-protected writes. Imports `mergeModels` from `shared/provider-sync`. Batched context length fetch. |
| `extensions/react-fallback.ts` | 311 | ReAct text-based tool calling bridge | Registers `tool_call` bridge tool (conditional on `/react-mode`). **Bridge doesn't actually execute tools — returns text telling model to retry. No self-reference guard.** |
| `extensions/openrouter-sync.ts` | 297 | OpenRouter model addition to models.json | Uses `readModifyWriteModelsJson()` for mutex protection. Provider ordering. URL query param stripping. |
| `shared/errors.ts` | 80 | Typed error class hierarchy | `ExtensionError` (base), `ConfigError`, `ApiError`, `TimeoutError`, `SecurityError`, `ToolError`. Wired into api.ts and security.ts. **`TimeoutError` conflicts with global `TimeoutError` (ES2022).** |
| `shared/config-io.ts` | 92 | Centralized config file I/O | `readJsonConfig<T>()`, `writeJsonConfig()` (atomic write-then-rename), `readSettings()`, `writeSettings()`. Path constants. **`SETTINGS_PATH` and `SECURITY_PATH` duplicated with `security.ts`.** |
| `shared/provider-sync.ts` | 44 | Provider-agnostic model merge utility | `mergeModels(newModels, oldModels)` — pure function preserving user-defined fields. |
| `shared/test-report.ts` | 121 | Benchmark report formatting | `formatTestSummary()`, `formatRecommendation()`, `formatTestScore()`, branding. |
| `shared/types.ts` | 136 | TypeScript type definitions | `ToolSupportLevel`, `SecurityCheckResult`, `AuditEntry`, Pi event shapes. |
| `shared/debug.ts` | 33 | Debug logging utility | `debugLog()` gated by `PI_EXTENSIONS_DEBUG=1`. Zero overhead in production. |

---

## Request / Execution Lifecycle

Pi loads extensions via dynamic ESM import. Each extension receives a `pi` object (typed as `ExtensionAPI`) and registers commands, tools, event handlers, and completions. The lifecycle:

    1. Pi reads root package.json → discovers `pi.extensions` manifest
    2. Pi imports each extension → extension's `export default function(pi)` runs synchronously
    3. Extension calls pi.registerCommand() / pi.registerTool() / pi.on(event, handler)
    4. Session starts → status.ts creates polling intervals, security.ts loads mode
    5. User prompt → Pi routes through provider → status.ts captures metrics
    6. Agent calls tool → security.ts intercepts (can block) → tool executes → security.ts logs result
    7. Session ends → status.ts clears all slots and intervals

For Ollama sync specifically:
    1. /ollama-sync called → fetchOllamaModels() with retry → fetchContextLengthsBatched()
    2. readModifyWriteModelsJson() acquires mutex → mergeModels(new, old) → write → release
    3. models.json updated atomically under lock

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
extensions/ollama-sync.ts ──→ shared/ollama + shared/format + shared/provider-sync + shared/model-test-utils
extensions/openrouter-sync.ts ──→ shared/ollama + shared/format

shared/ollama.ts ←── imported by ALL 8 extensions (central hub)
shared/format.ts ←── imported by ALL 8 extensions
shared/debug.ts ←── imported by 4 extensions + 2 shared modules
shared/security.ts ←── imported by 3 extensions (diag, security ext, status)
shared/react-parser.ts ←── imported by 2 extensions (model-test, react-fallback)
shared/config-io.ts ←── imported by 1 extension (api)
shared/errors.ts ←── imported by 2 extensions (api, security)
shared/provider-sync.ts ←── imported by 1 extension (ollama-sync)
shared/model-test-utils.ts ←── imported by 1 extension (model-test)
shared/test-report.ts ←── imported by 1 extension (model-test)
shared/types.ts ←── imported by 1 extension (model-test) + 2 shared modules
```

At npm publish time, relative `../shared/*` imports are rewritten to `@vtstech/pi-shared/*` (subpath imports).

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
| Provider resolution | 3-tier: explicit argument → current session provider (v1.1.9) → local Ollama detection |
| Provider registry | Hardcoded `BUILTIN_PROVIDERS` (12 providers incl. zai) — Pi doesn't expose provider metadata |
| Version management | VERSION file is single source of truth. Build/publish scripts derive at runtime. `bump-version.sh` (Bash) and `bump-version.ps1` (PowerShell) — **inconsistent: Bash skips README/CHANGELOG, PowerShell includes them** |
| Build output | Flat `.build-npm/<name>/` (not scoped) |
| Error handling | Try/catch with `debugLog()` in catch blocks. Typed errors from `shared/errors.ts`. Extensions return structured failure objects. |
| Security model | Partitioned blocklist: 41 CRITICAL (always) + 25 EXTENDED (max-mode-only). Mode-aware SSRF (19 ALWAYS + 7 MAX_ONLY). DNS rebinding protection. Unicode NFKC normalization. `validatePath()` with symlink deref. |
| Config persistence | `~/.pi/agent/` directory for all config: `settings.json`, `models.json`, `security.json`, `react-mode.json`, `model-test-config.json`. Centralized path constants in `shared/config-io.ts`. |
| Config I/O | `shared/config-io.ts` provides `readJsonConfig<T>()` / `writeJsonConfig()` (atomic write-then-rename). |
| HTTP client | Native `fetch()` exclusively — no curl subprocesses |
| Concurrency | `acquireModelsJsonLock()` / `readModifyWriteModelsJson()` for mutex-protected models.json writes. **`api.ts` bypasses mutex — uses `writeModelsJson()` directly.** |
| Retry logic | `withRetry()` in shared/ollama.ts — exponential backoff + ±25% jitter. |
| Test history | `appendTestHistory()` writes to `~/.pi/agent/cache/model-test-history.json`. Per-model (50) and total (500) entry caps. `detectRegression()` compares scores against last run. |
| Inter-extension comm | Direct imports from `shared/` — `pi._reactParser` removed in v1.1.8 |
| Code extraction | Repeated logic extracted to shared modules: react-parser, model-test-utils, provider-sync, config-io, test-report, errors |
| Debug logging | `debugLog()` from shared/debug.ts — only emits when `PI_EXTENSIONS_DEBUG=1`. **model-test.ts calls `debugLog` 8 times without importing it — ReferenceError when debugging is enabled.** |

---

## Known Landmines

- **Version bumping is inconsistent across platforms**: Bash (`bump-version.sh`) updates 4 files (VERSION, ollama.ts, 2x package.json). PowerShell (`bump-version.ps1`) updates 6 files (+ README, CHANGELOG). Different source-of-truth detection (VERSION file vs EXTENSION_VERSION in ollama.ts).

- **`model-test.ts` has a missing `debugLog` import**: Used 8 times in catch blocks but never imported from `shared/debug`. When `PI_EXTENSIONS_DEBUG=1` is set, every catch block in model-test.ts will throw a `ReferenceError: debugLog is not defined`, masking the original error.

- **`api.ts` uses non-atomic `writeModelsJson()` in 4 places**: `setMode`, `setUrl`, `setThink`, and `handleCompat` all do read→modify→write without mutex protection. Every other extension uses `readModifyWriteModelsJson()` for atomic writes. Concurrent sync operations can lose api.ts changes.

- **No barrel export in shared** — all imports use subpath: `from "@vtstech/pi-shared/ollama"`. Both `shared/package.json` and `npm-packages/shared/package.json` have `"exports"` maps with NO `"."` entry. Do not add one.

- **Duplicated path constants** — `SETTINGS_PATH` is defined in both `shared/config-io.ts` and `shared/security.ts`. `SECURITY_PATH`/`SECURITY_CONFIG_PATH` are the same path with different names. `MODEL_TEST_CONFIG_PATH` is in both `shared/config-io.ts` and `shared/model-test-utils.ts`.

- **`react-fallback.ts` bridge tool can call itself**: If a model sends `tool_call(name="tool_call", ...)`, the bridge fuzzy-matches to itself. No self-reference exclusion guard exists.

- **`detectModelFamily()` maps `mistral` → `"qwen2"`** — intentional (Mistral-based instruction tuning) but surprising. `phi` and `tinyllama` map to `"llama"`.

- **`isReasoningModel()` is overly broad** — includes `qwen3`, `thinker`, `thinking` which flags many non-reasoning models. Can produce false positives during `/ollama-sync`.

- **`registerBridgeTool()` can be called multiple times** — every `/react-mode` toggle calls it, potentially causing duplicate tool registration.

- **`openrouter-sync.test.ts` re-implements source logic inline** — `parseModelIds` and `ensureProviderOrder` are copied inline instead of imported (they're non-exported local functions). Tests pass even if source drifts.

- **`tsconfig.json` excludes test files** — `tests/**/*.ts` is not in the `include` array, so `npm run typecheck` (tsc --noEmit) won't type-check tests.

- **Build scripts use `sed -i` (GNU-only)** — fails on macOS without `gsed`. No compatibility shim.

- **Audit log grows unbounded** — `appendAuditEntry()` never rotates the log file. Over time `audit.log` can consume significant disk space.

- **`sanitizeCommand` comment/code mismatch** — comment says "Reject if normalization changed the command — indicates obfuscation attempt" but code only logs a warning and continues processing.

- **Security mode defaults to `max`** — if `security.json` doesn't exist, `getSecurityMode()` returns `"max"`. `validatePath()` blocks access to `security.json` via the sensitive paths list.

- **`resolveAndCheckHostname` returns `safe: true` on DNS errors** — intentional for resilience but may allow requests to unresolvable hostnames.

- **`status.ts` has 20+ mutable module-scoped `let` variables** — no encapsulation, making the code difficult to reason about.

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
| Provider resolution | 3-tier with session provider priority (v1.1.9) | `/api` commands now target the active session provider by default |
| ReAct default | Disabled | Small models attempt malformed native tool calls when they see the bridge tool |
| Provider registry | Hardcoded `BUILTIN_PROVIDERS` (12 providers incl. zai) | Pi doesn't expose provider metadata |
| Inter-extension comm | Direct shared imports | `pi._reactParser` removed in v1.1.8 — cleaner, type-safe |
| Concurrency | In-memory mutex via `acquireModelsJsonLock()` | Prevents lost-write races between extensions (api.ts is an exception) |
| Retry logic | `withRetry()` with exponential backoff + jitter | Handles transient Ollama connection failures |
| Error hierarchy | Typed classes from `shared/errors.ts` | Replaced raw string throws; enables `instanceof` error handling |
| Config I/O | Centralized in `shared/config-io.ts` | Atomic write-then-rename pattern for crash safety |
| Provider sync | Shared `mergeModels()` from `shared/provider-sync.ts` | Eliminated duplication between ollama-sync and openrouter-sync |
| Audit logging | Buffered writes (500ms/50 entries) + crash-safe flush | Reduced disk I/O; `process.on("exit")` handler prevents data loss |
| Temp directory | `~/.pi/agent/tmp/` (restricted) | NOTE: SEC-04 fix was reverted per user request — `/tmp` is re-allowed |

---

## What's Missing / Incomplete

- **`api.ts` bypasses models.json mutex** — uses `writeModelsJson()` directly in 4 places instead of `readModifyWriteModelsJson()`
- **`model-test.ts` missing `debugLog` import** — 8 calls to unimported function will crash when debugging is enabled
- **Duplicated path constants across shared modules** — `SETTINGS_PATH`, `SECURITY_PATH`/`SECURITY_CONFIG_PATH` each defined in 2 files
- **`model-test.ts` still large at 1,646 lines** — score-reporting pattern duplicated ~12 times between Ollama and provider test suites
- **Zero test coverage for `config-io.ts`** — atomic write-then-rename, settings I/O, path constants all untested
- **Zero test coverage for `model-test-utils.ts`** — 15+ exported functions including scoring, caching, regression detection all untested
- **No JSON schema validation for config files** — malformed config causes silent fallback to defaults
- **No CI/CD pipeline** — no automated testing, linting, or publishing workflows
- **`ollama.ts` monolithic at 770 lines** — combines I/O, caching, locking, retry, provider detection, model family detection
- **`openrouter-sync.test.ts` re-implements source logic** — `parseModelIds` and `ensureProviderOrder` tested via inline copies
- **No integration tests** — all tests are unit-level; no end-to-end tests covering extension interactions
- **`bump-version.sh` and `bump-version.ps1` are inconsistent** — different file lists and source-of-truth detection
- **Build scripts lack macOS compatibility** — `sed -i` is GNU-only
- **Audit log never rotated** — unbounded file growth
- **`security.ts` `sanitizeInputForLog` doesn't redact secrets** — only truncates; contrasts with `diag.ts` which has proper `redactValue()`

---

## Quick Start for Developer

1. **Read the Critical Files Index** — start with `shared/ollama.ts` (central hub imported by everything)
2. **Understand the Pi extension API** — extensions receive a `pi` global object typed as `ExtensionAPI`, register commands/tools/completions
3. **Check Known Landmines** — missing debugLog import (model-test.ts), api.ts mutex bypass, version bump inconsistency, no barrel exports, duplicated path constants
4. **Follow Patterns & Conventions** — ESM only, `readModifyWriteModelsJson()` for models.json writes (except api.ts), native `fetch()` for HTTP, `ctx.ui.setStatus()` for status, `debugLog()` for catch blocks (but remember to import it!)
5. **Use mutex for models.json writes** — `readModifyWriteModelsJson()` instead of manual read→modify→write
6. **Use shared/config-io for settings I/O** — don't roll your own `readSettings`/`writeSettings` (though `diag.ts` does)
7. **Use shared/errors for typed exceptions** — `ConfigError`, `SecurityError`, etc. instead of raw strings
8. **Build pipeline**: `npm install` → `./scripts/build-packages.sh all` → `.build-npm/` → `npm-packages/` → `dist/`
9. **Type checking**: `npm run typecheck` → `tsc --noEmit` (note: test files excluded from tsconfig)
10. **Tests**: `npm test` → `tsx --test tests/*.test.ts` (214 tests across 6 files)
11. **Install as bundle**: `pi install git:github.com/VTSTech/pi-coding-agent`
12. **Validation**: `/diag` for health, `/model-test` for benchmarks, `/ollama-sync` for Ollama

Do NOT start by reading every file. Use the Dependency Graph to understand coupling, then read only what you need for your specific task.
