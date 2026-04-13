# Codebase Intelligence Brief: Pi Coding Agent Extensions (VTSTech)

> Generated: 04-13-2026 | Auditor: Super-Z (GLM-5) | Version: 1.1.7

---

## Project Identity

| Field | Value |
|-------|-------|
| **Purpose** | Pi package providing extensions, themes, and shared utilities for the Pi Coding Agent — optimized for resource-constrained environments (Colab, budget machines) running small Ollama models (0.3B–2B) and cloud providers |
| **Tech Stack** | TypeScript (ESM, strict), Node.js 22+, esbuild ^0.28.0 (pinned devDependency), tsconfig.json with ES2022 target, no framework |
| **Entry Point** | Pi auto-discovers `extensions/*.ts` and `themes/*.json` from the `pi` manifest in root `package.json` |
| **Build/Run** | `./scripts/build-packages.sh` (esbuild TS→ESM + npm pack), `./scripts/publish-packages.sh` (npm publish); runtime: `pi install git:github.com/VTSTech/pi-coding-agent` |
| **Test Command** | `npm test` → `tsx --test tests/*.test.ts` (4 test files: format, ollama, react-parser, security) |
| **Total Source** | ~10,386 lines across 12 TypeScript files + 1 JSON theme + 4 test files |

---

## Architecture Map

```
extensions/       → Pi extension source files (8 .ts files) — auto-loaded by Pi
shared/           → Shared utility library imported by all extensions (7 .ts files + package.json)
themes/           → Pi TUI themes (1 JSON file: matrix.json)
tests/            → Unit tests (4 .ts files, run via tsx --test)
npm-packages/     → Per-extension npm package manifests + compiled JS for publishing (9 packages)
  shared/         → @vtstech/pi-shared (format, ollama, security, types, debug, react-parser, model-test-utils) — NO .ts source files
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

---

## Critical Files Index

| File | Lines | Purpose | Why It Matters |
|------|-------|---------|----------------|
| `extensions/model-test.ts` | 1,735 | Model benchmark (Ollama + cloud) | Largest extension. Imports shared ChatFn abstraction + scoring + unified tests + test history. Has Ollama-specific test functions and provider wrappers. Added streaming (`ollamaChatStream`), connectivity test, and test history tracking in 1.1.7. Uses `getEffectiveConfig()` for user-overridable timeouts. `rateLimitDelay()` uses raw `CONFIG` (not effective config). |
| `shared/security.ts` | 944 | Command blocklist (66 total, partitioned), SSRF (26+ patterns + DNS rebinding), path validation, security mode toggle, audit log | Imported by 3 extensions + status. Added `resolveAndCheckHostname()` for DNS rebinding protection, buffered audit log writes (500ms / 50-entry), `readRecentAuditEntries()`, `checkInjectionPatterns()`. Partitioned SSRF: 19 ALWAYS_BLOCKED + 7 MAX_ONLY. `validatePath()` with `fs.realpathSync()` for symlink bypass prevention. |
| `extensions/status.ts` | 466 | Composable status bar via `ctx.ui.setStatus()` | 11+ event listeners. Detects local vs cloud provider to hide CPU/RAM. Added `tool_execution_start`/`end` events for per-tool live timing (1s interval). `CtxMax + RespMax` combined slot from native Ollama context + payload's `max_completion_tokens`. Generation params from `before_provider_request` payload. Pi version via `execSync("pi -v 2>&1")`. |
| `shared/model-test-utils.ts` | 691 | Shared test utilities, config, history, scoring | `CONFIG` constants, `WEATHER_TOOL_DEFINITION`, `ChatFn` abstraction, unified tests (`testToolUsageUnified`, `testReasoningUnified`, `testInstructionFollowingUnified`). Added: user config via `model-test-config.json` with `getEffectiveConfig()`, test history with regression detection (`appendTestHistory`, `detectRegression`), in-memory tool support cache. |
| `shared/ollama.ts` | 764 | Ollama API helpers, models.json I/O, provider detection, mutex, retry | Imported by ALL 8 extensions. TTL cache (2s), `EXTENSION_VERSION` (1.1.7-dev), `BUILTIN_PROVIDERS` (11 providers), `detectProvider()`, `fetchContextLengthsBatched()`. Added: `acquireModelsJsonLock()`/`readModifyWriteModelsJson()` (in-memory mutex), `withRetry()` with exponential backoff + jitter, `detectModelFamily()` (ported from AgentNova), `RETRYABLE_ERROR_PATTERNS`. Build script now reads version from `VERSION` file. |
| `extensions/api.ts` | 751 | Runtime API mode/URL/thinking/provider switcher | `readSettings()`/`writeSettings()` for settings.json. `/api provider set|list` sub-command for default provider management with auto-model selection. Tab completion for modes + providers + thinking values. `handleProvider()` with show/set/list/shorthand modes. |
| `shared/react-parser.ts` | 534 | Multi-dialect ReAct text parser | 4 dialects (react, function, tool, call), dynamic pattern builder, `parseReact()`, `parseReactWithPatterns()` with optional `availableTools` for loose-match resolution, `detectReactDialect()`, `fuzzyMatchToolName()`, `normalizeArguments()`. |
| `extensions/diag.ts` | 543 | Full system diagnostic suite | `self_diagnostic` tool registration, 9 check categories, imports `AUDIT_LOG_PATH` from shared. Uses 3-tier provider detection. Remote Ollama probing via HTTP instead of CLI. |
| `extensions/security.ts` | 485 | Security tool registrations for Pi's tool execution hooks | Wraps shared security functions. Intercepts `tool_call` and `tool_result` events. `/security mode basic|max` command, `/security-audit` command + `security_audit` tool. Tab completion via `pi.registerCompletion()`. Session stats tracking. |
| `extensions/ollama-sync.ts` | 326 | Ollama model sync to models.json | Extracted `performSync()` core logic (shared between command + tool). `/ollama-sync` command + `ollama_sync` tool, URL write-back, batched context length fetch, memory estimation per model, metadata (params, quant, family). |
| `extensions/openrouter-sync.ts` | 282 | OpenRouter model addition to models.json | `/openrouter-sync` + `/or-sync` commands, URL query param stripping, provider creation. `ensureProviderOrder()` to position openrouter above ollama. NOTE: Does NOT use the extracted `performSync()` pattern — has its own inline sync logic. |
| `extensions/react-fallback.ts` | 327 | ReAct text-based tool calling bridge | Registers `tool_call` bridge tool (only when enabled via `/react-mode`), `/react-parse` command. Exports parser via `pi._reactParser`. `context` event handler appends ReAct instructions to system prompt when enabled. |
| `shared/types.ts` | 135 | TypeScript type definitions | `ToolSupportLevel`, `SecurityCheckResult`, `AuditEntry`, `ToolSupportCacheEntry`, `OllamaChatResponse`, `PiToolCallEvent`, `PiToolResultEvent`, `PiExtensionContext`. |
| `shared/debug.ts` | 32 | Debug logging utility | `debugLog()` gated by `PI_EXTENSIONS_DEBUG=1` env var. Used by shared/ollama, shared/security, status.ts. |
| `themes/matrix.json` | 80 | Matrix-inspired TUI theme | Neon green on black; 12 custom color variables, full Pi theme schema. |
| `shared/package.json` | — | Shared package manifest (canonical) | Subpath exports only (no barrel), `"type": "module"`. Exports ALL 7 modules. NO `"."` entry — do not add one. |
| `scripts/build-packages.sh` | 309 | Build pipeline | esbuild TS→ESM, preflight checks, reads VERSION file as single source of truth, rewrites `../shared/*` → `@vtstech/pi-shared/*`, syncs to npm-packages/, packs tarballs to dist/ |
| `scripts/bump-version.sh` | 112 | Version bumper | Semi-automated version bump across all locations (VERSION, EXTENSION_VERSION, package.json) |
| `scripts/publish-packages.sh` | 133 | npm publisher | Publishes in dependency order (shared first), supports `--dry-run` and `--tag` |

---

## Dependency Graph

All extensions import from `shared/`. Pi provides the runtime API (`pi` object).

```
extensions/model-test.ts ──→ shared/format.ts + shared/ollama.ts + shared/types.ts
                             + shared/react-parser.ts + shared/model-test-utils.ts
extensions/react-fallback.ts ──→ shared/format.ts + shared/ollama (version only)
                               + shared/react-parser.ts
extensions/api.ts ──→ shared/format.ts + shared/ollama.ts
extensions/status.ts ──→ shared/ollama.ts + shared/format.ts + shared/debug.ts
                      + shared/security.ts (getSecurityMode only)
extensions/diag.ts ──→ shared/format.ts + shared/ollama.ts + shared/security.ts
extensions/security.ts ──→ shared/security.ts + shared/format.ts + shared/ollama (version)
                        + shared/debug.ts
extensions/ollama-sync.ts ──→ shared/ollama.ts + shared/format.ts
extensions/openrouter-sync.ts ──→ shared/ollama.ts + shared/format.ts

shared/ollama.ts ←── imported by ALL 8 extensions (central hub)
shared/format.ts ←── imported by 7 extensions
shared/security.ts ←── imported by 3 extensions (diag, security ext, status for getSecurityMode)
shared/react-parser.ts ←── imported by 2 extensions (model-test, react-fallback)
shared/model-test-utils.ts ←── imported by 1 extension (model-test)
shared/debug.ts ←── imported by 2 extensions (status, security ext) + 2 shared modules (ollama, security)
shared/types.ts ←── imported by 1 extension (model-test) + 2 shared modules (model-test-utils, react-parser)
```

At npm publish time, relative `../shared/*` imports are rewritten to `@vtstech/pi-shared/*` (subpath imports). The `@vtstech/pi-shared` package is marked `--external` in esbuild — resolved at runtime via `node_modules/`, not bundled into extensions.

### Extension Registration Summary

| Extension | Commands | Tools | Events | Completions |
|-----------|----------|-------|--------|-------------|
| api | `/api`, `/api provider` | — | — | `/api` tab completion (sub-commands + args) |
| diag | `/diag` | `self_diagnostic` | — | — |
| model-test | `/model-test` | `model_test` | — | — |
| ollama-sync | `/ollama-sync` | `ollama_sync` | — | `/ollama-sync` URL arg completion |
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
| Type system | Strict TypeScript (`tsconfig.json` with `strict: true`, `noImplicitAny`, `strictNullChecks`). Extensions import `type { ExtensionAPI, AgentToolResult }` from `@mariozechner/pi-coding-agent`. |
| Pi extension API | `pi.registerCommand()` for slash commands, `pi.registerTool()` for LLM-callable tools, `pi.registerCompletion()` for tab completion |
| Pi events | `pi.on("session_start", ...)`, `pi.on("agent_start", ...)`, `pi.on("session_shutdown", ...)`, `pi.on("before_provider_request", ...)`, `pi.on("tool_execution_start/end", ...)` for lifecycle hooks |
| Pi interception | `pi.on("tool_call", ...)` returns `{ block: true, reason }` to prevent tool execution; `pi.on("tool_result", ...)` for post-execution logging |
| Status display | `ctx.ui.setStatus("slot-name", value)` — composable named slots (v1.1.3+), NOT `pi.setFooter()`. All slots flushed from `flushStatus()` for deterministic ordering. |
| Ollama URL resolution | `models.json` provider baseUrl → `OLLAMA_HOST` env → `http://localhost:11434` (triple fallback in `getOllamaBaseUrl()`) |
| Provider detection | 3-tier: user-defined in `models.json` → built-in `BUILTIN_PROVIDERS` registry (11 providers) → unknown fallback |
| Version management | VERSION file is single source of truth. `EXTENSION_VERSION` in `shared/ollama.ts` derived at build time. Build scripts read VERSION. `package.json` version updated by bump-version.sh. |
| Build output | Flat `.build-npm/<name>/` (not scoped — no `@vtstech/` directory prefix) |
| Error handling | Try/catch with fallback values; no custom error classes (removed in 1.1.0) |
| Security model | Blocklist + validation (not sandboxing). 66 blocked commands (41 CRITICAL + 25 EXTENDED), 26 SSRF hostname patterns (19 ALWAYS + 7 MAX_ONLY), DNS rebinding protection, path validation, injection detection. Mode-aware: basic/max toggle. Exported check functions from shared. |
| Config persistence | `~/.pi/agent/settings.json` for Pi settings, `~/.pi/agent/models.json` for model config, `~/.pi/agent/security.json` for security mode, `~/.pi/agent/react-mode.json` for ReAct toggle, `~/.pi/agent/model-test-config.json` for test user overrides |
| HTTP client | Native `fetch()` exclusively — no curl subprocesses (migrated in 1.1.1 to eliminate shell injection vectors) |
| Memory estimation | `estimateMemory()` returns dual `{ gpu, cpu }` estimates. GPU: 10% overhead. CPU: context-aware `1.5 + (contextLength / 100_000)` calibrated against real Colab data. |
| Versioning strategy | GitHub and npm track the same stable version. Dev builds use `-dev` suffix dropped in 3 places before publish (VERSION, EXTENSION_VERSION, package.json). |
| Debug logging | `debugLog()` from shared/debug.ts — only emits when `PI_EXTENSIONS_DEBUG=1`. Used by ollama, security, status modules. |
| Inter-extension comm | `react-fallback.ts` exports parser via `(pi as any)._reactParser`. `model-test.ts` checks for `pi._reactParser` first, falls back to direct import from `shared/react-parser`. |
| Code extraction pattern | Repeated logic is extracted to shared modules with a `ChatFn` abstraction (see `shared/model-test-utils.ts`). Extensions wrap their API-specific chat into this interface. |
| Tab completion depth | `pi.registerCompletion()` used for multi-arg depth-aware completion (api, security). `registerCommand`'s `getArgumentCompletions` only supports single-level — silently drops unmatched tokens. |
| Concurrency | `acquireModelsJsonLock()` / `readModifyWriteModelsJson()` provide in-memory mutex for models.json read-modify-write cycles. Must be used when doing non-atomic read-then-write. |
| Retry logic | `withRetry()` in shared/ollama.ts wraps async functions with exponential backoff + jitter. `RETRYABLE_ERROR_PATTERNS` for transient failure detection. Used by `fetchOllamaModels()` and `fetchModelContextLength()`. |
| Test history | `appendTestHistory()` writes to `~/.pi/agent/cache/model-test-history.json` with per-model (50) and total (500) entry limits. `detectRegression()` compares scores against last run. |
| User config | `readTestConfig()` reads `~/.pi/agent/model-test-config.json` for user-overridable test parameters. `getEffectiveConfig()` merges user values with defaults. |

---

## Known Landmines

- **Version bumping requires updating 3 places**: VERSION file (source of truth), `shared/ollama.ts` (`EXTENSION_VERSION`), root `package.json` (`version`). The build scripts read VERSION at runtime and auto-update `npm-packages/*/package.json`. A `scripts/bump-version.sh` helper exists for semi-automation. NOTE: In 1.1.7+, the build scripts no longer hardcode VERSION — they read from the VERSION file. Do NOT manually update the scripts.

- **No barrel export in shared** — the old `index.js` barrel was deleted. All imports use subpath: `from "@vtstech/pi-shared/ollama"`. Both `shared/package.json` and `npm-packages/shared/package.json` have `"exports"` maps with NO `"."` entry. Do not add one.

- **`models.json` is the source of truth** for Ollama URL, provider config, model list, and reasoning flags. Multiple extensions read/write this file. Use `readModelsJson()`/`writeModelsJson()` from shared (with 2s TTL cache) — never raw `fs.readFileSync`. `writeModelsJson()` uses atomic write-then-rename. **Use `readModifyWriteModelsJson()` for any read-modify-write cycle** to prevent lost-write races between extensions.

- **`npm-packages/shared/` must NOT contain `.ts` files** — the build script's preflight guard will fail if it finds any. Canonical source is `shared/*.ts` only.

- **esbuild is a declared devDependency** — pinned at `^0.28.0` with a `package-lock.json`. Run `npm install` before building. The preflight guard checks for esbuild availability and fails fast.

- **Pi's `pi` global object** is the only way extensions interact with Pi. Extensions import `type { ExtensionAPI }` from `@mariozechner/pi-coding-agent` for type safety.

- **Status bar uses composable slots** — `status.ts` uses `ctx.ui.setStatus("slot-name", value)` with unique slot names (NOT `pi.setFooter()`). All slots flushed from `flushStatus()`. All cleared on `session_shutdown`. If status crashes mid-session, stale slots persist until restart.

- **ReAct fallback is disabled by default** — the `tool_call` bridge tool is only registered when ReAct mode is enabled via `/react-mode`. Small models that see the bridge tool when it's not wanted will attempt malformed calls.

- **Build script uses temp files for import rewriting** — `build_extension()` creates `${ext_name}.temp.ts` with rewritten imports before esbuild compilation. This causes the default export to be named `*_temp_default` in compiled output (e.g., `diag_temp_default as default`). Cosmetic only.

- **`model-test.ts` still has an inline ReAct parser fallback** — checks for `pi._reactParser` first, falls back to direct import. No more inline copy of the parser logic (refactored in 1.1.3). The JSON extraction in `testReactParsing()` still has inline brace-matching duplicating `extractJsonArgs()`.

- **`status.ts` Pi version detection** uses `execSync("pi -v 2>&1", { encoding: "utf-8", timeout: 5000 })` — a raw shell call, inconsistent with the `fetch()` migration pattern used elsewhere.

- **`PiModelEntry.estimatedSize` is `{ gpu: number; cpu: number }`** (changed in 1.1.2 from plain `number`). Any code reading `estimatedSize` must access `.gpu` and `.cpu` properties.

- **`isReasoningModel()` is overly broad** — includes `qwen3`, `thinker`, `thinking` which will flag many non-reasoning models. Used for auto-detecting reasoning during `/ollama-sync` but can produce false positives.

- **`registerCommand`'s `getArgumentCompletions` silently drops tokens** — only supports a single argument level. Multi-arg completion requires `pi.registerCompletion()` separately (see `/api` and `/security` patterns).

- **Security mode defaults to `max`** — if `security.json` doesn't exist, `getSecurityMode()` returns `"max"`. `validatePath()` blocks access to `security.json` via the sensitive paths list.

- **`detectModelFamily()` maps some models to wrong families** — `mistral` maps to `"qwen2"` and `codestral` maps to `"qwen2"`. This is intentional (Mistral-based instruction tuning) but may be surprising. `phi` and `tinyllama` map to `"llama"`.

- **`rateLimitDelay()` in model-test.ts uses raw `CONFIG.TEST_DELAY_MS`**, not the effective config. This means user overrides to `TEST_DELAY_MS` in `model-test-config.json` do NOT affect rate limit delays. Likely a bug.

- **openrouter-sync.ts does NOT use the extracted `performSync()` pattern** — ollama-sync.ts extracted `performSync()` as a shared core function, but openrouter-sync.ts has inline sync logic duplicating the read-modify-write pattern. This means openrouter-sync does NOT benefit from the `readModifyWriteModelsJson()` mutex.

- **Audit log uses timer-based buffered writes** — entries are buffered in memory and flushed every 500ms or at 50 entries. If the Node.js process crashes, entries in the buffer are lost. This is a trade-off for reduced disk I/O.

---

## Active Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Module format | ESM only (no CJS) | Pi loads extensions via dynamic ESM import; `"type": "module"` is required |
| Shared code | Separate `@vtstech/pi-shared` npm package with subpath exports | Avoids bundling shared code into every extension; Pi resolves it at runtime from node_modules |
| HTTP client | Native `fetch()` (not curl subprocesses) | Eliminates shell injection vectors (was the fix in 1.1.1); cleaner error handling |
| Security model | Blocklist + validation (not sandboxing) | Pi extensions run with full Node.js access; security is advisory, not enforcement |
| Build tool | esbuild (not tsc) | Fast, no config needed, bundles dependencies, handles TS→JS in one pass |
| Type checking | `tsc --noEmit` via tsconfig.json (separate from build) | esbuild handles compilation; tsc provides IDE-compatible type checking without emitting |
| Version in source | Hardcoded `EXTENSION_VERSION` constant | Avoids runtime fs reads for version; single source of truth is VERSION file |
| ReAct default | Disabled | Small models attempt malformed native tool calls when they see the bridge tool |
| Provider registry | Hardcoded `BUILTIN_PROVIDERS` (11 providers) | Pi doesn't expose provider metadata; extensions need their own lookup table |
| esbuild dependency | Pinned devDependency with lockfile | Reproducible builds, no implicit version resolution, works offline |
| Drift prevention | Build preflight guard + no .ts in npm-packages/shared | Automated detection prevents shared source drift |
| Pre-publish testing | npm pack tarballs in dist/ | Offline installable packages for testing without publishing to npm |
| Memory estimation | Context-aware CPU formula calibrated to Colab | Flat multipliers are wrong for CPU inference where KV cache dominates |
| Status display | Composable named slots via `ctx.ui.setStatus()` | Replaced footer overwrite in 1.1.3; coexists with other extensions |
| Prompt measurement | `measurePromptFromPayload()` from `before_provider_request` event | Works with any Pi version; primary `ctx.getSystemPrompt()` tried first |
| Test runner | `tsx --test` | No build step needed for tests; runs TypeScript directly |
| Code deduplication | Extract shared logic into shared/ modules | react-parser and model-test-utils extracted in 1.1.3–1.1.4; ChatFn abstraction eliminates duplication |
| Concurrency | In-memory mutex via `acquireModelsJsonLock()` | Prevents lost-write races between extensions doing read-modify-write on models.json |
| Retry logic | `withRetry()` with exponential backoff + jitter | Handles transient failures in Ollama connections (ECONNREFUSED, ETIMEDOUT, etc.) |
| Test history | Per-model history with regression detection | Enables tracking model quality over time; `detectRegression()` catches score degradation |
| User config | `model-test-config.json` with `getEffectiveConfig()` | Allows users to override timeouts and delays without changing source code |

---

## What's Missing / Incomplete

- **Test coverage is thin** — only 4 test files exist (format, ollama, react-parser, security). No tests for model-test unified functions, diag, status, api, ollama-sync, or openrouter-sync. No CI pipeline. Tests are 1,891 lines total but don't cover the new 1.1.7 features (mutex, retry, history, user config).

- **Peer dependency is loose** — `@mariozechner/pi-coding-agent: ">=0.66"` doesn't pin to a specific Pi version; breaking Pi API changes could cause silent failures.

- **No `.npmignore`** — published packages include everything in their directory; build artifacts, READMEs all get published.

- **No error class hierarchy** — removed in 1.1.0 (was dead code), but extensions throw raw strings or use Pi's error handling. Consider typed errors for better diagnostics.

- **`status.ts` Pi version detection** uses `execSync("pi -v 2>&1")` — a raw shell call, inconsistent with the `fetch()` migration pattern used elsewhere.

- **`isReasoningModel()` false positives** — overly broad pattern matching (includes `qwen3`, `thinker`, `thinking`) flags many non-reasoning models during `/ollama-sync`.

- **JSON brace-matching duplication in model-test.ts** — `testReactParsing()` has inline brace-matching code that duplicates `extractJsonArgs()` from react-parser.ts.

- **`rateLimitDelay()` bug** — uses raw `CONFIG.TEST_DELAY_MS` instead of effective config, so user overrides don't take effect.

- **openrouter-sync.ts doesn't use mutex** — inline read-modify-write on models.json doesn't benefit from `readModifyWriteModelsJson()` mutex protection.

- **Audit log not crash-safe** — timer-based buffered writes (500ms) can lose entries if process crashes. Synchronous `appendFileSync` is still used for `setSecurityMode()` and `readRecentAuditEntries()` but the main `appendAuditEntry()` uses buffered async writes.

---

## Quick Start for Developer

1. **Read the Critical Files Index** — start with `shared/ollama.ts` (central hub imported by everything)
2. **Understand the Pi extension API** — extensions receive a `pi` global object typed as `ExtensionAPI`, register commands/tools/completions
3. **Check Known Landmines** — version bumping (3 places + VERSION file), models.json as source of truth, no barrel exports, registerCommand single-arg completion limitation
4. **Follow Patterns & Conventions** — ESM only, `readModelsJson()`/`writeModelsJson()` for config, native `fetch()` for HTTP, `ctx.ui.setStatus()` for status display, `pi.registerCompletion()` for multi-arg tab completion
5. **Use mutex for models.json writes** — call `readModifyWriteModelsJson()` instead of manual read→modify→write
6. **Build pipeline**: `npm install` → `./scripts/build-packages.sh all` → esbuild compiles → rewrites imports → outputs to `.build-npm/` → syncs to `npm-packages/` → packs tarballs to `dist/`
7. **Type checking**: `npm run typecheck` → `tsc --noEmit` (strict mode)
8. **Tests**: `npm test` → `tsx --test tests/*.test.ts`
9. **Pre-publish test flow**: publish shared prerelease → `pi install npm:/path/to/dist/<pkg>.tgz` → symlink `~/.npm-global/lib/node_modules/@vtstech/pi-<name>` to `~/.pi/agent/extensions/pi-<name>` → `pi`
10. **Install as bundle**: `pi install git:github.com/VTSTech/pi-coding-agent` (loads all extensions from source)
11. **Validation**: `/diag` for system health, `/model-test` for model capability testing, `/ollama-sync` for Ollama integration

Do NOT start by reading every file. Use the Dependency Graph above to understand coupling, then read only what you need for your specific task.
