# Codebase Intelligence Brief: Pi Coding Agent Extensions (VTSTech)

> Generated: 04-13-2026 | Auditor: Super-Z (GLM-5) | Commit: d0ccb66 | Version: 1.1.4-dev

---

## Project Identity

| Field | Value |
|-------|-------|
| **Purpose** | Pi package providing extensions, themes, and shared utilities for the Pi Coding Agent — optimized for resource-constrained environments (Colab, budget machines) running small Ollama models (0.3B–2B) and cloud providers |
| **Tech Stack** | TypeScript (ESM, strict), Node.js 22+, esbuild ^0.28.0 (pinned devDependency), tsconfig.json with ES2022 target, no framework |
| **Entry Point** | Pi auto-discovers `extensions/*.ts` and `themes/*.json` from the `pi` manifest in root `package.json` |
| **Build/Run** | `./scripts/build-packages.sh` (esbuild TS→ESM + npm pack), `./scripts/publish-packages.sh` (npm publish); runtime: `pi install git:github.com/VTSTech/pi-coding-agent` |
| **Test Command** | `npm test` → `tsx --test tests/*.test.ts` (4 test files: format, ollama, react-parser, security) |
| **Total Source** | ~7,393 lines across 12 TypeScript files + 1 JSON theme + 4 test files |

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
| `extensions/model-test.ts` | 1,571 | Model benchmark (Ollama + cloud) | Largest extension. Imports shared ChatFn abstraction + scoring + unified tests. Still contains Ollama-specific test functions (testReasoning, testThinking, testToolUsage, testReactParsing, testToolSupport) and provider wrappers. ReAct parsing delegates to shared react-parser module. |
| `extensions/status.ts` | 434 | Composable status bar via `ctx.ui.setStatus()` | Major rewrite in 1.1.3–1.1.4. Uses named slots (not footer overwrite). Detects local vs cloud provider to hide CPU/RAM. 11 event listeners. Pi version via `execSync("pi -v 2>&1")`. |
| `extensions/api.ts` | 751 | Runtime API mode/URL/thinking/provider switcher | `readSettings()`/`writeSettings()` for settings.json. New `/api provider set|list` sub-command for default provider management. Tab completion for modes + providers. |
| `shared/ollama.ts` | 601 | Ollama API helpers, models.json I/O, provider detection | Imported by ALL 8 extensions. TTL cache (2s), `EXTENSION_VERSION` (1.1.4-dev), `BUILTIN_PROVIDERS` (11 providers), `detectProvider()`, `fetchContextLengthsBatched()`. |
| `shared/security.ts` | 616 | Command blocklist (75+), SSRF (29 patterns), path validation, audit log | Imported by 3 extensions. `validatePath()` with `fs.realpathSync()` for symlink bypass prevention. Exported `checkBashToolInput()`, `checkFileToolInput()`, `checkHttpToolInput()`, `checkInjectionPatterns()`. `AUDIT_LOG_PATH` exported. |
| `shared/react-parser.ts` | 534 | Multi-dialect ReAct text parser (extracted from react-fallback + model-test) | 4 dialects (react, function, tool, call), dynamic pattern builder, `parseReact()`, `parseReactWithPatterns()`, `detectReactDialect()`, `fuzzyMatchToolName()`, `normalizeArguments()`, `looksLikeSchemaDump()`, `extractToolFromJson()`. |
| `extensions/diag.ts` | 534 | Full system diagnostic suite | `self_diagnostic` tool registration, 9 check categories, imports `AUDIT_LOG_PATH` from shared. Uses 3-tier provider detection. |
| `shared/model-test-utils.ts` | 463 | Shared test utilities (extracted from model-test.ts) | `CONFIG` constants, `WEATHER_TOOL_DEFINITION`, `ChatFn` abstraction, unified `testToolUsageUnified()`, `testReasoningUnified()`, `testInstructionFollowingUnified()`, scoring helpers, tool support cache. |
| `shared/format.ts` | 400 | Formatting utilities (ok/fail/warn/info, bytes, ms, percentages) | Imported by 7/8 extensions. `estimateMemory()` with dual GPU/CPU estimates, `pct()`, `fmtBytes()`, `fmtDur()`, `sanitizeForReport()`. |
| `extensions/react-fallback.ts` | 327 | ReAct text-based tool calling bridge | Slimmed to extension shell — all parsing logic extracted to shared/react-parser.ts. Registers `tool_call` bridge tool, `/react-mode` toggle, `/react-parse` command. Exports parser via `pi._reactParser`. |
| `extensions/security.ts` | 307 | Security tool registrations for Pi's tool execution hooks | Wraps shared security functions. Intercepts `tool_call` and `tool_result` events. `/security-audit` command + `security_audit` tool. |
| `extensions/ollama-sync.ts` | 326 | Ollama model sync to models.json | `/ollama-sync` command + `ollama_sync` tool, URL write-back, batched context length fetch, memory estimation per model. |
| `extensions/openrouter-sync.ts` | 282 | OpenRouter model addition to models.json | `/openrouter-sync` + `/or-sync` commands, URL query param stripping, provider creation. |
| `shared/types.ts` | 135 | TypeScript type definitions | `ToolSupportLevel`, `SecurityCheckResult`, `AuditEntry`, `ToolSupportCacheEntry`, `OllamaChatResponse`, `PiToolCallEvent`, `PiToolResultEvent`, `PiExtensionContext`. |
| `shared/debug.ts` | 32 | Debug logging utility | `debugLog()` gated by `PI_EXTENSIONS_DEBUG=1` env var. Used by shared/ollama, shared/security, status.ts. |
| `themes/matrix.json` | 80 | Matrix-inspired TUI theme | Neon green on black; 12 custom color variables, full Pi theme schema. |
| `shared/package.json` | — | Shared package manifest (canonical) | Subpath exports only (no barrel), `"type": "module"`. Exports: format, ollama, security, types. NOTE: Does NOT export debug, react-parser, or model-test-utils (build-only, bundled into extensions). |
| `scripts/build-packages.sh` | 302 | Build pipeline | esbuild TS→ESM, preflight checks, rewrites `../shared/*` → `@vtstech/pi-shared/*`, syncs to npm-packages/, packs tarballs to dist/ |
| `scripts/bump-version.sh` | 112 | Version bumper | Semi-automated version bump across all 4 locations |
| `scripts/publish-packages.sh` | 133 | npm publisher | Publishes in dependency order (shared first), supports `--dry-run` and `--tag` |

---

## Dependency Graph

All extensions import from `shared/`. Pi provides the runtime API (`pi` object).

```
extensions/model-test.ts ──→ shared/format.ts + shared/ollama.ts + shared/types.ts
                             + shared/react-parser.ts + shared/model-test-utils.ts
extensions/react-fallback.ts ──→ shared/format.ts + shared/ollama.ts (version only)
                               + shared/react-parser.ts
extensions/api.ts ──→ shared/format.ts + shared/ollama.ts
extensions/status.ts ──→ shared/ollama.ts + shared/format.ts + shared/debug.ts
extensions/diag.ts ──→ shared/format.ts + shared/ollama.ts + shared/security.ts
extensions/security.ts ──→ shared/security.ts + shared/format.ts + shared/ollama.ts (version)
extensions/ollama-sync.ts ──→ shared/ollama.ts + shared/format.ts
extensions/openrouter-sync.ts ──→ shared/ollama.ts + shared/format.ts

shared/ollama.ts ←── imported by ALL 8 extensions (central hub)
shared/format.ts ←── imported by 7 extensions
shared/security.ts ←── imported by 3 extensions (diag, security ext)
shared/react-parser.ts ←── imported by 2 extensions (model-test, react-fallback)
shared/model-test-utils.ts ←── imported by 1 extension (model-test)
shared/debug.ts ←── imported by 2 extensions (status, indirectly via ollama + security)
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
| security | `/security-audit` | `security_audit` | `tool_call`, `tool_result` | — |
| status | — | — | 11 lifecycle events | — |
| **Totals** | **10** | **7** | **14** | **2** |

---

## Patterns & Conventions

| Aspect | Pattern |
|--------|---------|
| Module system | ESM exclusively — `"type": "module"`, `import`/`export`, `--format=esm` in esbuild |
| Type system | Strict TypeScript (`tsconfig.json` with `strict: true`, `noImplicitAny`, `strictNullChecks`). Extensions import `type { ExtensionAPI, AgentToolResult }` from `@mariozechner/pi-coding-agent`. |
| Pi extension API | `pi.registerCommand()` for slash commands, `pi.registerTool()` for LLM-callable tools, `pi.registerCompletion()` for tab completion |
| Pi events | `pi.on("session_start", ...)`, `pi.on("agent_start", ...)`, `pi.on("session_shutdown", ...)` for lifecycle hooks |
| Pi interception | `pi.intercept("before_provider_request", ...)` for capturing generation params |
| Status display | `ctx.ui.setStatus("slot-name", value)` — composable named slots (v1.1.3+), NOT `pi.setFooter()` |
| Ollama URL resolution | `models.json` provider baseUrl → `OLLAMA_HOST` env → `http://localhost:11434` (triple fallback in `getOllamaBaseUrl()`) |
| Provider detection | 3-tier: user-defined in `models.json` → built-in `BUILTIN_PROVIDERS` registry (11 providers) → unknown fallback |
| Version management | Single `EXTENSION_VERSION` in `shared/ollama.ts`, imported by all extensions |
| Build output | Flat `.build-npm/<name>/` (not scoped — no `@vtstech/` directory prefix) |
| Error handling | Try/catch with fallback values; no custom error classes (removed in 1.1.0) |
| Security model | Blocklist + validation (not sandboxing). 75+ blocked commands, 29 SSRF hostname patterns, path validation, injection detection. Exported check functions from shared. |
| Config persistence | `~/.pi/agent/settings.json` for Pi settings, `~/.pi/agent/models.json` for model config, `~/.pi/agent/react-mode.json` for ReAct toggle |
| HTTP client | Native `fetch()` exclusively — no curl subprocesses (migrated in 1.1.1 to eliminate shell injection vectors) |
| Memory estimation | `estimateMemory()` returns dual `{ gpu, cpu }` estimates. GPU: 10% overhead. CPU: context-aware `1.5 + (contextLength / 100_000)` calibrated against real Colab data. |
| Versioning strategy | GitHub and npm track the same stable version. Dev builds use `-dev` suffix dropped in 4 places before publish. |
| Debug logging | `debugLog()` from shared/debug.ts — only emits when `PI_EXTENSIONS_DEBUG=1`. Used by ollama, security, status modules. |
| Inter-extension comm | `react-fallback.ts` exports parser via `(pi as any)._reactParser`. `model-test.ts` checks for `pi._reactParser` first, falls back to direct import from `shared/react-parser`. |
| Code extraction pattern | Repeated logic is extracted to shared modules with a `ChatFn` abstraction (see `shared/model-test-utils.ts`). Extensions wrap their API-specific chat into this interface. |

---

## Known Landmines

- **Version bumping requires updating 4 places manually**: `shared/ollama.ts` (`EXTENSION_VERSION`), `scripts/build-packages.sh` (`VERSION`), `scripts/publish-packages.sh` (`VERSION`), root `package.json` (`version`). A `scripts/bump-version.sh` helper exists for semi-automation. The build script's `sed` command auto-updates `npm-packages/*/package.json` versions from the script's `VERSION` variable. Do NOT miss any of the four.

- **No barrel export in shared** — the old `index.js` barrel was deleted. All imports use subpath: `from "@vtstech/pi-shared/ollama"`. Both `shared/package.json` and `npm-packages/shared/package.json` have `"exports"` maps with NO `"."` entry. Do not add one.

- **shared/package.json exports map is incomplete** — it exports `./format`, `./ollama`, `./security`, `./types` but NOT `./debug`, `./react-parser`, or `./model-test-utils`. These are build-only: esbuild bundles their consumers. If an npm-published extension needs them at runtime, the exports map must be updated.

- **`models.json` is the source of truth** for Ollama URL, provider config, model list, and reasoning flags. Multiple extensions read/write this file. Use `readModelsJson()`/`writeModelsJson()` from shared (with 2s TTL cache) — never raw `fs.readFileSync`. `writeModelsJson()` uses atomic write-then-rename but has NO concurrency protection for read-modify-write cycles.

- **`npm-packages/shared/` must NOT contain `.ts` files** — the build script's preflight guard will fail if it finds any. Canonical source is `shared/*.ts` only. The build compiles from `shared/*.ts` and syncs compiled `.js` + `package.json` to `npm-packages/shared/`.

- **esbuild is a declared devDependency** — pinned at `^0.28.0` with a `package-lock.json`. Run `npm install` before building. The preflight guard checks for esbuild availability and fails fast with a clear message if missing.

- **Pi's `pi` global object** is the only way extensions interact with Pi. Extensions import `type { ExtensionAPI }` from `@mariozechner/pi-coding-agent` for type safety. Pi injects it as the first argument to extension entry functions.

- **Status bar uses composable slots** — `status.ts` uses `ctx.ui.setStatus("slot-name", value)` with unique slot names (NOT `pi.setFooter()`). All slots are cleared on `session_shutdown`. If status crashes mid-session, stale slots persist until restart.

- **ReAct fallback is disabled by default** — the `tool_call` bridge tool is only registered when ReAct mode is enabled via `/react-mode`. Small models that see the bridge tool when it's not wanted will attempt malformed calls.

- **Build script uses temp files for import rewriting** — `build_extension()` creates `${ext_name}.temp.ts` with rewritten imports before esbuild compilation. This causes the default export to be named `*_temp_default` in compiled output (e.g., `diag_temp_default as default`). This is cosmetic only — `as default` makes it work correctly.

- **`model-test.ts` still has an inline ReAct parser fallback** — checks for `pi._reactParser` first, falls back to direct import of `shared/react-parser`. No more inline copy of the parser logic (refactored in 1.1.3). However, the JSON extraction logic in `testReactParsing()` still duplicates the brace-matching from `extractJsonArgs()`.

- **`status.ts` git branch detection** uses `execSync("pi -v 2>&1", { encoding: "utf-8", timeout: 5000 })` — a raw shell call, inconsistent with the `fetch()` migration pattern used elsewhere. Captures stderr to handle `pi -v` outputting there.

- **`PiModelEntry.estimatedSize` is `{ gpu: number; cpu: number }`** (changed in 1.1.2 from plain `number`). Any code reading `estimatedSize` must access `.gpu` and `.cpu` properties. The `ollama-sync` display shows both values.

- **`isReasoningModel()` is overly broad** — includes `qwen3`, `thinker`, `thinking` which will flag many non-reasoning models. The `isReasoningModel()` check is used for auto-detecting reasoning capability during `/ollama-sync` but can produce false positives.

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
| Version in source | Hardcoded `EXTENSION_VERSION` constant | Avoids runtime fs reads for version; single source of truth |
| ReAct default | Disabled | Small models attempt malformed native tool calls when they see the bridge tool |
| Provider registry | Hardcoded `BUILTIN_PROVIDERS` (11 providers) | Pi doesn't expose provider metadata; extensions need their own lookup table |
| esbuild dependency | Pinned devDependency with lockfile | Reproducible builds, no implicit version resolution, works offline |
| Drift prevention | Build preflight guard + no .ts in npm-packages/shared | Automated detection prevents shared source drift from recurring |
| Pre-publish testing | npm pack tarballs in dist/ | Offline installable packages for testing without publishing to npm |
| Memory estimation | Context-aware CPU formula calibrated to Colab | Flat multipliers are wrong for CPU inference where KV cache dominates; `1.5 + (ctx/100k)` matches real-world observations |
| Status display | Composable named slots via `ctx.ui.setStatus()` | Replaced footer overwrite in 1.1.3; coexists with other extensions; no namespace conflicts |
| Test runner | `tsx --test` | No build step needed for tests; runs TypeScript directly; no test framework dependency |
| Code deduplication | Extract shared logic into shared/ modules | react-parser and model-test-utils extracted in 1.1.3–1.1.4; ChatFn abstraction eliminates Ollama/provider test duplication |

---

## What's Missing / Incomplete

- **Test coverage is thin** — only 4 test files exist (format, ollama, react-parser, security). No tests for model-test unified functions, diag, status, api, ollama-sync, or openrouter-sync. No CI pipeline.
- **shared/package.json exports map is incomplete** — `./debug`, `./react-parser`, `./model-test-utils` are not exported. Currently fine because esbuild bundles them, but would break if consumers need them at runtime.
- **Peer dependency is loose** — `@mariozechner/pi-coding-agent: ">=0.66"` doesn't pin to a specific Pi version; breaking Pi API changes could cause silent failures.
- **No `.npmignore`** — published packages include everything in their directory; build artifacts, READMEs all get published.
- **No error class hierarchy** — removed in 1.1.0 (was dead code), but extensions throw raw strings or use Pi's error handling. Consider typed errors for better diagnostics.
- **`status.ts` Pi version detection** uses `execSync("pi -v 2>&1")` — a raw shell call, inconsistent with the `fetch()` migration pattern used elsewhere.
- **`isReasoningModel()` false positives** — overly broad pattern matching (includes `qwen3`, `thinker`, `thinking`) flags many non-reasoning models during `/ollama-sync`.
- **JSON brace-matching duplication in model-test.ts** — `testReactParsing()` has inline brace-matching code that duplicates `extractJsonArgs()` from react-parser.ts.
- **No concurrency protection on models.json writes** — `writeModelsJson()` uses atomic rename but doesn't protect against concurrent read-modify-write cycles between extensions.

---

## Quick Start for Developer

1. **Read the Critical Files Index** — start with `shared/ollama.ts` (central hub imported by everything)
2. **Understand the Pi extension API** — extensions receive a `pi` global object typed as `ExtensionAPI`, register commands/tools/completions
3. **Check Known Landmines** — version bumping (4 places), models.json as source of truth, no barrel exports, incomplete shared exports map
4. **Follow Patterns & Conventions** — ESM only, `readModelsJson()`/`writeModelsJson()` for config, native `fetch()` for HTTP, `ctx.ui.setStatus()` for status display
5. **Build pipeline**: `npm install` → `./scripts/build-packages.sh all` → esbuild compiles → rewrites imports → outputs to `.build-npm/` → syncs to `npm-packages/` → packs tarballs to `dist/`
6. **Type checking**: `npm run typecheck` → `tsc --noEmit` (strict mode)
7. **Tests**: `npm test` → `tsx --test tests/*.test.ts`
8. **Pre-publish test flow**: publish shared prerelease → `pi install npm:/path/to/dist/<pkg>.tgz` → symlink `~/.npm-global/lib/node_modules/@vtstech/pi-<name>` to `~/.pi/agent/extensions/pi-<name>` → `pi`
9. **Install as bundle**: `pi install git:github.com/VTSTech/pi-coding-agent` (loads all extensions from source)
10. **Validation**: `/diag` for system health, `/model-test` for model capability testing, `/ollama-sync` for Ollama integration

Do NOT start by reading every file. Use the Dependency Graph above to understand coupling, then read only what you need for your specific task.
