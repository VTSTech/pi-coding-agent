# Codebase Intelligence Brief: Pi Coding Agent Extensions (VTSTech)

> Generated: 04-12-2026 | Commit: ef3e6aa | Version: 1.1.1

---

## Project Identity

| Field | Value |
|-------|-------|
| **Purpose** | Pi package providing extensions, themes, and shared utilities for the Pi Coding Agent — optimized for resource-constrained environments (Colab, budget machines) running small Ollama models (0.3B–2B) and cloud providers |
| **Tech Stack** | TypeScript (ESM), Node.js 22+, esbuild for compilation, no framework |
| **Entry Point** | Pi auto-discovers `extensions/*.ts` and `themes/*.json` from the `pi` manifest in `package.json` |
| **Build/Run** | `./scripts/build-packages.sh` (esbuild TS→ESM), `./scripts/publish-packages.sh` (npm publish); runtime: `pi install git:github.com/VTSTech/pi-coding-agent` |
| **Test Command** | No automated test suite. Testing is manual via Pi's `/model-test`, `/diag`, and `/ollama-sync` commands |
| **Total Source** | ~7,200 lines across 12 TypeScript files + 1 JSON theme |

---

## Architecture Map

```
extensions/       → Pi extension source files (8 .ts files) — auto-loaded by Pi
shared/           → Shared utility library imported by all extensions (4 .ts files)
themes/           → Pi TUI themes (1 JSON file: matrix.json)
npm-packages/     → Per-extension npm package manifests for publishing (9 packages)
  shared/         → @vtstech/pi-shared (format, ollama, security, types)
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
```

### Skip List

- `.build-npm/` — generated build output, gitignored
- `node_modules/` — no node_modules in repo (dependencies are Pi's runtime deps)
- `TESTS.md` — benchmark results, informational only
- `CHANGELOG.md` — version history, not needed for code work

---

## Critical Files Index

| File | Lines | Purpose | Why It Matters |
|------|-------|---------|----------------|
| `extensions/model-test.ts` | 2,059 | Model benchmark (Ollama + cloud) | Largest file; scoring logic, fetch-based HTTP, JSON repair, multi-provider support. Most complex extension. |
| `extensions/react-fallback.ts` | 809 | ReAct text-based tool calling bridge | Multi-dialect regex parser (4 dialects), dynamic pattern builder, disabled by default with `/react-mode` toggle |
| `extensions/api.ts` | 739 | Runtime API mode/URL/thinking switcher | Merged single completion handler (was duplicate), `readSettings()`/`writeSettings()`, `/api provider` sub-command |
| `shared/ollama.ts` | 590 | Ollama API helpers, models.json I/O, provider detection | Imported by 7/8 extensions. TTL cache (5s), `EXTENSION_VERSION`, `BUILTIN_PROVIDERS` (11 providers), `detectProvider()` |
| `shared/security.ts` | 588 | Command blocklist (65), SSRF (29 patterns), path validation, audit log | Imported by 3 extensions. `validatePath()` with `fs.realpathSync()` for symlink bypass prevention. `AUDIT_LOG_PATH` exported. |
| `extensions/status.ts` | 535 | 2-line status bar (system metrics, model info, generation params) | Session-scoped SEC counter, native fetch for Ollama `/api/ps`, `fmtTk()` for token display |
| `extensions/diag.ts` | 534 | Full system diagnostic suite | `self_diagnostic` tool registration, 9 check categories, imports `AUDIT_LOG_PATH` from shared |
| `shared/format.ts` | 384 | Formatting utilities (ok/fail/warn/info, bytes, ms, percentages) | Imported by 7/8 extensions. `estimateVram()`, `pct()`, `fmtBytes()` |
| `extensions/security.ts` | 307 | Security tool registrations for Pi's tool execution hooks | Wraps shared security functions into `checkBashToolInput`, `checkFileToolInput`, `checkHttpToolInput`, `checkInjectionPatterns` |
| `extensions/ollama-sync.ts` | 293 | Ollama model sync to models.json | `/ollama-sync` command + `ollama_sync` tool, URL write-back, VRAM estimation |
| `extensions/openrouter-sync.ts` | 282 | OpenRouter model addition to models.json | `/openrouter-sync` + `/or-sync` commands, URL query param stripping, provider creation |
| `shared/types.ts` | 74 | TypeScript type definitions | `ToolSupportLevel`, `SecurityCheckResult`, `AuditEntry`, `ToolSupportCacheEntry` |
| `themes/matrix.json` | — | Matrix-inspired TUI theme | Neon green on black; fixed missing `yellow` and `mdCodeBlock` colors in 1.1.0 |
| `npm-packages/shared/package.json` | — | Shared package manifest | ESM (`"type": "module"`), subpath exports only (no barrel). Peer dep: `@mariozechner/pi-coding-agent >=0.66` |
| `scripts/build-packages.sh` | 219 | Build pipeline | esbuild TS→ESM, rewrites `../shared/*` → `@vtstech/pi-shared/*`, syncs to npm-packages/ |

---

## Dependency Graph

All extensions import from `shared/`. Pi provides the runtime API (`pi` object).

```
extensions/model-test.ts ──→ shared/format.ts + shared/ollama.ts + shared/types.ts
extensions/react-fallback.ts ──→ shared/format.ts + shared/ollama.ts
extensions/api.ts ──→ shared/format.ts + shared/ollama.ts
extensions/status.ts ──→ shared/ollama.ts + shared/format.ts
extensions/diag.ts ──→ shared/format.ts + shared/ollama.ts + shared/security.ts
extensions/security.ts ──→ shared/security.ts + shared/format.ts + shared/ollama.ts
extensions/ollama-sync.ts ──→ shared/ollama.ts + shared/format.ts
extensions/openrouter-sync.ts ──→ shared/ollama.ts + shared/format.ts

shared/ollama.ts ←── imported by ALL 8 extensions (central hub)
shared/format.ts ←── imported by 7 extensions
shared/security.ts ←── imported by 3 extensions (diag, security, and indirectly via security.ts)
shared/types.ts ←── imported by 1 extension (model-test)
```

At npm publish time, relative `../shared/*` imports are rewritten to `@vtstech/pi-shared/*` (subpath imports). The `@vtstech/pi-shared` package is marked `--external` in esbuild — resolved at runtime via `node_modules/`, not bundled into extensions.

---

## Patterns & Conventions

| Aspect | Pattern |
|--------|---------|
| Module system | ESM exclusively — `"type": "module"`, `import`/`export`, `--format=esm` in esbuild |
| Pi extension API | `pi.registerCommand()` for slash commands, `pi.registerTool()` for LLM-callable tools, `pi.registerCompletion()` for tab completion |
| Pi events | `pi.on("agent_start", ...)`, `pi.on("message_end", ...)`, `pi.on("session_shutdown", ...)` for lifecycle hooks |
| Pi interception | `pi.intercept("before_provider_request", ...)` for capturing generation params |
| Ollama URL resolution | `models.json` provider baseUrl → `OLLAMA_HOST` env → `http://localhost:11434` (triple fallback in `getOllamaBaseUrl()`) |
| Provider detection | 3-tier: user-defined in `models.json` → built-in `BUILTIN_PROVIDERS` registry → unknown fallback |
| Version management | Single `EXTENSION_VERSION` in `shared/ollama.ts`, imported by all extensions |
| Build output | Flat `.build-npm/<name>/` (not scoped — no `@vtstech/` directory prefix) |
| Error handling | Try/catch with fallback values; no custom error classes (removed in 1.1.0) |
| Security model | Blocklist-based: 65 blocked commands, 29 SSRF hostname patterns, path validation, injection detection. All enforced via shared security module. |
| Config persistence | `~/.pi/agent/settings.json` for Pi settings, `~/.pi/agent/models.json` for model config, `~/.pi/agent/react-mode.json` for ReAct toggle |

---

## Known Landmines

- **`EXTENSION_VERSION` must be updated manually** in `shared/ollama.ts` line 1 for every release. The build scripts have their own `VERSION="1.1.1"` hardcoded too. Three places to bump: `shared/ollama.ts`, `scripts/build-packages.sh`, `scripts/publish-packages.sh`. Root `package.json` and all `npm-packages/*/package.json` versions are bumped by the build script's `sed` command.

- **No barrel export in shared** — the old `index.js` barrel was deleted (dead code / CJS-ESM mismatch). All imports use subpath: `from "@vtstech/pi-shared/ollama"`. The npm `package.json` exports map has no `"."` entry. Do not add one.

- **`models.json` is the source of truth** for Ollama URL, provider config, model list, and reasoning flags. Multiple extensions read/write this file. Use `readModelsJson()`/`writeModelsJson()` from shared (with 5s TTL cache) — never raw `fs.readFileSync`.

- **`npm-packages/shared/` has `.ts` source files** that must stay in sync with `shared/`. The build script does NOT compile from these — it compiles from `shared/*.ts` and syncs the JS output to `npm-packages/`. The `.ts` copies in npm-packages exist as pre-publish source references only.

- **esbuild is a runtime dependency** for the build scripts (`npx esbuild`) but is not declared in `package.json`. The build scripts assume `npx` can resolve it. If esbuild is not installed globally or in a local node_modules, builds will fail.

- **Pi's `pi` global object** is the only way extensions interact with Pi. It's not imported — Pi injects it as the first argument to extension entry functions. Type it as `any` or use the Pi type definitions from `@mariozechner/pi-coding-agent`.

- **Status bar overwrites Pi's footer** — `status.ts` uses `pi.setFooter()` and must restore the default on `session_shutdown`. If status crashes mid-session, the footer stays broken until restart.

- **ReAct fallback is disabled by default** — the `tool_call` bridge tool is only registered when ReAct mode is enabled via `/react-mode`. Small models that see the bridge tool when it's not wanted will attempt malformed calls.

---

## Active Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Module format | ESM only (no CJS) | Pi loads extensions via dynamic ESM import; `"type": "module"` is required |
| Shared code | Separate `@vtstech/pi-shared` npm package with subpath exports | Avoids bundling shared code into every extension; Pi resolves it at runtime from node_modules |
| HTTP client | Native `fetch()` (not curl subprocesses) | Eliminates shell injection vectors (was the fix in 1.1.1); cleaner error handling |
| Security model | Blocklist + validation (not sandboxing) | Pi extensions run with full Node.js access; security is advisory, not enforcement |
| Build tool | esbuild (not tsc) | Fast, no config needed, bundles dependencies, handles TS→JS in one pass |
| Version in source | Hardcoded `EXTENSION_VERSION` constant | Avoids runtime fs reads for version; single source of truth |
| ReAct default | Disabled | Small models attempt malformed native tool calls when they see the bridge tool |
| Provider registry | Hardcoded `BUILTIN_PROVIDERS` (11 providers) | Pi doesn't expose provider metadata; extensions need their own lookup table |

---

## What's Missing / Incomplete

- **No automated test suite** — all testing is manual via `/model-test`, `/diag`, and runtime validation. No unit tests, no CI pipeline.
- **esbuild not declared** as a dependency in `package.json` — build scripts rely on `npx esbuild` resolving it implicitly.
- **`npm-packages/shared/*.ts` drift risk** — TypeScript source copies in npm-packages can fall behind `shared/*.ts` (happened in 1.1.1, was fixed manually).
- **No tsconfig.json** — TypeScript is compiled by esbuild without a tsconfig; IDE support may show false errors.
- **Peer dependency is loose** — `@mariozechner/pi-coding-agent: ">=0.66"` doesn't pin to a specific Pi version; breaking Pi API changes could cause silent failures.
- **No `.npmignore`** — published packages include everything in their directory; build artifacts, source .ts files, and READMEs all get published.
- **`publish-packages.sh`** has been validated end-to-end — used to publish `pi-diag` (and all other packages) successfully.
- **Status bar git branch detection** reads from `execSync("git rev-parse --abbrev-ref HEAD")` which is a raw shell call — minor but inconsistent with the fetch() migration pattern.
- **No error class hierarchy** — removed in 1.1.0 (was dead code), but extensions throw raw strings or use Pi's error handling. Consider typed errors for better diagnostics.
- **CHANGELOG.md references `sanitizeForReport()` and HTML sanitization** as features from 1.1.0, but these functions no longer exist in `shared/security.ts` (they were in `shared/format.ts` and may have been moved or removed — needs verification).

---

## Quick Start for Developer

1. **Read the Critical Files Index** — start with `shared/ollama.ts` (central hub imported by everything)
2. **Understand the Pi extension API** — extensions receive a `pi` global object, register commands/tools/completions
3. **Check Known Landmines** — version bumping, models.json as source of truth, no barrel exports
4. **Follow Patterns & Conventions** — ESM only, `readModelsJson()`/`writeModelsJson()` for config, native `fetch()` for HTTP
5. **Build pipeline**: `./scripts/build-packages.sh` → esbuild compiles `shared/*.ts` and `extensions/*.ts` → rewrites imports → outputs to `.build-npm/` → syncs to `npm-packages/`
6. **Install test**: `pi install git:github.com/VTSTech/pi-coding-agent` or individual `npm:@vtstech/pi-*` packages
7. **Validation**: `/diag` for system health, `/model-test` for model capability testing, `/ollama-sync` for Ollama integration

Do NOT start by reading every file. Use the Dependency Graph above to understand coupling, then read only what you need for your specific task.
