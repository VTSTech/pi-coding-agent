# Codebase Intelligence Brief: Pi Coding Agent Extensions (VTSTech)

> Generated: 04-13-2026 | Auditor: Super-Z (GLM-5) | Commit: 659e405 | Version: 1.1.2

---

## Project Identity

| Field | Value |
|-------|-------|
| **Purpose** | Pi package providing extensions, themes, and shared utilities for the Pi Coding Agent — optimized for resource-constrained environments (Colab, budget machines) running small Ollama models (0.3B–2B) and cloud providers |
| **Tech Stack** | TypeScript (ESM), Node.js 22+, esbuild ^0.28.0 (pinned devDependency), no framework |
| **Entry Point** | Pi auto-discovers `extensions/*.ts` and `themes/*.json` from the `pi` manifest in root `package.json` |
| **Build/Run** | `./scripts/build-packages.sh` (esbuild TS→ESM + npm pack), `./scripts/publish-packages.sh` (npm publish); runtime: `pi install git:github.com/VTSTech/pi-coding-agent` |
| **Test Command** | No automated test suite. Testing is manual via Pi's `/model-test`, `/diag`, and `/ollama-sync` commands |
| **Total Source** | ~7,725 lines across 12 TypeScript files + 1 JSON theme |

---

## Architecture Map

```
extensions/       → Pi extension source files (8 .ts files) — auto-loaded by Pi
shared/           → Shared utility library imported by all extensions (4 .ts files + package.json)
themes/           → Pi TUI themes (1 JSON file: matrix.json)
npm-packages/     → Per-extension npm package manifests + compiled JS for publishing (9 packages)
  shared/         → @vtstech/pi-shared (format, ollama, security, types) — NO .ts source files
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
- `npm-packages/shared/*.ts` — DELETED in 1.1.2. Canonical source is `shared/*.ts` only.

---

## Critical Files Index

| File | Lines | Purpose | Why It Matters |
|------|-------|---------|----------------|
| `extensions/model-test.ts` | 2,059 | Model benchmark (Ollama + cloud) | Largest file; scoring logic, fetch-based HTTP, JSON repair, multi-provider support, inline ReAct parser fallback. Most complex extension. |
| `extensions/react-fallback.ts` | 809 | ReAct text-based tool calling bridge | Multi-dialect regex parser (4 dialects: classic, function, tool, call), dynamic pattern builder, disabled by default with `/react-mode` toggle |
| `extensions/api.ts` | 739 | Runtime API mode/URL/thinking switcher | Merged single completion handler (was duplicate), `readSettings()`/`writeSettings()`, `/api provider` sub-command |
| `shared/ollama.ts` | 590 | Ollama API helpers, models.json I/O, provider detection | Imported by ALL 8 extensions. TTL cache (2s), `EXTENSION_VERSION`, `BUILTIN_PROVIDERS` (11 providers), `detectProvider()` |
| `shared/security.ts` | 588 | Command blocklist (65), SSRF (29 patterns), path validation, audit log | Imported by 3 extensions. `validatePath()` with `fs.realpathSync()` for symlink bypass prevention. `AUDIT_LOG_PATH` exported. |
| `extensions/status.ts` | 535 | 2-line status bar (system metrics, model info, generation params) | Session-scoped SEC counter, native fetch for Ollama `/api/ps`, `fmtTk()` for token display. 11 event listeners. |
| `extensions/diag.ts` | 534 | Full system diagnostic suite | `self_diagnostic` tool registration, 9 check categories, imports `AUDIT_LOG_PATH` from shared |
| `shared/format.ts` | 400 | Formatting utilities (ok/fail/warn/info, bytes, ms, percentages) | Imported by 7/8 extensions. `estimateMemory()` with dual GPU/CPU estimates, `pct()`, `fmtBytes()`, `sanitizeForReport()` |
| `extensions/security.ts` | 307 | Security tool registrations for Pi's tool execution hooks | Wraps shared security functions into `checkBashToolInput`, `checkFileToolInput`, `checkHttpToolInput`, `checkInjectionPatterns`. Intercepts `tool_call` and `tool_result` events. |
| `extensions/ollama-sync.ts` | 293 | Ollama model sync to models.json | `/ollama-sync` command + `ollama_sync` tool, URL write-back, context-aware memory estimation |
| `extensions/openrouter-sync.ts` | 282 | OpenRouter model addition to models.json | `/openrouter-sync` + `/or-sync` commands, URL query param stripping, provider creation |
| `shared/types.ts` | 74 | TypeScript type definitions | `ToolSupportLevel`, `SecurityCheckResult`, `AuditEntry`, `ToolSupportCacheEntry` |
| `themes/matrix.json` | — | Matrix-inspired TUI theme | Neon green on black; 12 custom color variables, full Pi theme schema |
| `shared/package.json` | — | Shared package manifest (canonical) | Subpath exports only (no barrel), `"type": "module"`. Synced to npm-packages by build script. |
| `scripts/build-packages.sh` | ~302 | Build pipeline | esbuild TS→ESM, preflight checks, rewrites `../shared/*` → `@vtstech/pi-shared/*`, syncs to npm-packages/, packs tarballs to dist/ |
| `scripts/publish-packages.sh` | ~133 | npm publisher | Publishes in dependency order (shared first), supports `--dry-run` and `--tag` |

---

## Dependency Graph

All extensions import from `shared/`. Pi provides the runtime API (`pi` object).

```
extensions/model-test.ts ──→ shared/format.ts + shared/ollama.ts + shared/types.ts
extensions/react-fallback.ts ──→ shared/format.ts + shared/ollama.ts (version only)
extensions/api.ts ──→ shared/format.ts + shared/ollama.ts
extensions/status.ts ──→ shared/ollama.ts + shared/format.ts
extensions/diag.ts ──→ shared/format.ts + shared/ollama.ts + shared/security.ts
extensions/security.ts ──→ shared/security.ts + shared/format.ts + shared/ollama.ts (version)
extensions/ollama-sync.ts ──→ shared/ollama.ts + shared/format.ts
extensions/openrouter-sync.ts ──→ shared/ollama.ts + shared/format.ts

shared/ollama.ts ←── imported by ALL 8 extensions (central hub)
shared/format.ts ←── imported by 7 extensions
shared/security.ts ←── imported by 3 extensions (diag, security ext)
shared/types.ts ←── imported by 1 extension (model-test)
```

At npm publish time, relative `../shared/*` imports are rewritten to `@vtstech/pi-shared/*` (subpath imports). The `@vtstech/pi-shared` package is marked `--external` in esbuild — resolved at runtime via `node_modules/`, not bundled into extensions.

### Extension Registration Summary

| Extension | Commands | Tools | Events | Completions |
|-----------|----------|-------|--------|-------------|
| api | `/api` | — | — | `/api` tab completion |
| diag | `/diag` | `self_diagnostic` | — | — |
| model-test | `/model-test` | `model_test` | — | — |
| ollama-sync | `/ollama-sync` | `ollama_sync` | — | — |
| openrouter-sync | `/openrouter-sync` | `openrouter_sync` | — | — |
| react-fallback | `/react-mode`, `/react-parse` | `tool_call` (conditional) | `context` | — |
| security | `/security-audit` | `security_audit` | `tool_call`, `tool_result` | — |
| status | — | — | 11 lifecycle events | — |
| **Totals** | **9** | **7** | **14** | **1** |

---

## Patterns & Conventions

| Aspect | Pattern |
|--------|---------|
| Module system | ESM exclusively — `"type": "module"`, `import`/`export`, `--format=esm` in esbuild |
| Pi extension API | `pi.registerCommand()` for slash commands, `pi.registerTool()` for LLM-callable tools, `pi.registerCompletion()` for tab completion |
| Pi events | `pi.on("agent_start", ...)`, `pi.on("message_end", ...)`, `pi.on("session_shutdown", ...)` for lifecycle hooks |
| Pi interception | `pi.intercept("before_provider_request", ...)` for capturing generation params |
| Ollama URL resolution | `models.json` provider baseUrl → `OLLAMA_HOST` env → `http://localhost:11434` (triple fallback in `getOllamaBaseUrl()`) |
| Provider detection | 3-tier: user-defined in `models.json` → built-in `BUILTIN_PROVIDERS` registry (11 providers) → unknown fallback |
| Version management | Single `EXTENSION_VERSION` in `shared/ollama.ts`, imported by all extensions |
| Build output | Flat `.build-npm/<name>/` (not scoped — no `@vtstech/` directory prefix) |
| Error handling | Try/catch with fallback values; no custom error classes (removed in 1.1.0) |
| Security model | Blocklist-based: 65 blocked commands, 29 SSRF hostname patterns, path validation, injection detection. All enforced via shared security module. |
| Config persistence | `~/.pi/agent/settings.json` for Pi settings, `~/.pi/agent/models.json` for model config, `~/.pi/agent/react-mode.json` for ReAct toggle |
| HTTP client | Native `fetch()` exclusively — no curl subprocesses (migrated in 1.1.1 to eliminate shell injection vectors) |
| Memory estimation | `estimateMemory()` returns dual `{ gpu, cpu }` estimates. GPU: 10% overhead. CPU: context-aware `1.5 + (contextLength / 100_000)` calibrated against real Colab data. |
| Versioning strategy | GitHub and npm track the same stable version. Dev builds use `-dev` suffix dropped in 4 places before publish. |

---

## Known Landmines

- **Version bumping requires updating 4 places manually**: `shared/ollama.ts` (`EXTENSION_VERSION`), `scripts/build-packages.sh` (`VERSION`), `scripts/publish-packages.sh` (`VERSION`), root `package.json` (`version`). The build script's `sed` command auto-updates `npm-packages/*/package.json` versions from the script's `VERSION` variable. Do NOT miss any of the four.

- **No barrel export in shared** — the old `index.js` barrel was deleted. All imports use subpath: `from "@vtstech/pi-shared/ollama"`. Both `shared/package.json` and `npm-packages/shared/package.json` have `"exports"` maps with NO `"."` entry. Do not add one.

- **`models.json` is the source of truth** for Ollama URL, provider config, model list, and reasoning flags. Multiple extensions read/write this file. Use `readModelsJson()`/`writeModelsJson()` from shared (with 2s TTL cache) — never raw `fs.readFileSync`.

- **`npm-packages/shared/` must NOT contain `.ts` files** — the build script's preflight guard will fail if it finds any. Canonical source is `shared/*.ts` only. The build compiles from `shared/*.ts` and syncs compiled `.js` + `package.json` to `npm-packages/shared/`.

- **esbuild is a declared devDependency** — pinned at `^0.28.0` with a `package-lock.json`. Run `npm install` before building. The preflight guard checks for esbuild availability and fails fast with a clear message if missing.

- **Pi's `pi` global object** is the only way extensions interact with Pi. It's not imported — Pi injects it as the first argument to extension entry functions. Type it as `any` or use the Pi type definitions from `@mariozechner/pi-coding-agent`.

- **Status bar overwrites Pi's footer** — `status.ts` uses `pi.setFooter()` and must restore the default on `session_shutdown`. If status crashes mid-session, the footer stays broken until restart.

- **ReAct fallback is disabled by default** — the `tool_call` bridge tool is only registered when ReAct mode is enabled via `/react-mode`. Small models that see the bridge tool when it's not wanted will attempt malformed calls.

- **Build script uses temp files for import rewriting** — `build_extension()` creates `${ext_name}.temp.ts` with rewritten imports before esbuild compilation. This causes the default export to be named `*_temp_default` in compiled output (e.g., `diag_temp_default as default`). This is cosmetic only — `as default` makes it work correctly.

- **`model-test.ts` has an inline ReAct parser fallback** (~50 lines duplicating logic from `react-fallback.ts`) — attempts `pi._reactParser` first, falls back to inline copy if unavailable. Any changes to the ReAct parser in react-fallback.ts must be mirrored here.

- **`status.ts` git branch detection** uses `execSync("git rev-parse --abbrev-ref HEAD")` — a raw shell call, inconsistent with the fetch() migration pattern used elsewhere.

- **`PiModelEntry.estimatedSize` is now `{ gpu: number; cpu: number }`** (changed in 1.1.2 from plain `number`). Any code reading `estimatedSize` must access `.gpu` and `.cpu` properties. The `ollama-sync` display shows both values.

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
| esbuild dependency | Pinned devDependency with lockfile | Reproducible builds, no implicit version resolution, works offline |
| Drift prevention | Build preflight guard + no .ts in npm-packages/shared | Automated detection prevents shared source drift from recurring |
| Pre-publish testing | npm pack tarballs in dist/ | Offline installable packages for testing without publishing to npm |
| Memory estimation | Context-aware CPU formula calibrated to Colab | Flat multipliers are wrong for CPU inference where KV cache dominates; `1.5 + (ctx/100k)` matches real-world observations |

---

## What's Missing / Incomplete

- **No automated test suite** — all testing is manual via `/model-test`, `/diag`, and runtime validation. No unit tests, no CI pipeline.
- **No tsconfig.json** — TypeScript is compiled by esbuild without a tsconfig; IDE support may show false errors.
- **Peer dependency is loose** — `@mariozechner/pi-coding-agent: ">=0.66"` doesn't pin to a specific Pi version; breaking Pi API changes could cause silent failures.
- **No `.npmignore`** — published packages include everything in their directory; build artifacts, READMEs all get published.
- **No error class hierarchy** — removed in 1.1.0 (was dead code), but extensions throw raw strings or use Pi's error handling. Consider typed errors for better diagnostics.
- **Duplicated code in model-test.ts** — inline ReAct parser fallback (~50 lines) duplicates `react-fallback.ts`. Also has Ollama-specific + provider-generic variants of nearly every test function (reasoning, tool usage, connectivity), leading to significant duplication.
- **`status.ts` git branch detection** uses `execSync("git rev-parse --abbrev-ref HEAD")` — a raw shell call, inconsistent with the fetch() migration pattern used elsewhere.

---

## Quick Start for Developer

1. **Read the Critical Files Index** — start with `shared/ollama.ts` (central hub imported by everything)
2. **Understand the Pi extension API** — extensions receive a `pi` global object, register commands/tools/completions
3. **Check Known Landmines** — version bumping (4 places), models.json as source of truth, no barrel exports
4. **Follow Patterns & Conventions** — ESM only, `readModelsJson()`/`writeModelsJson()` for config, native `fetch()` for HTTP
5. **Build pipeline**: `npm install` → `./scripts/build-packages.sh all` → esbuild compiles → rewrites imports → outputs to `.build-npm/` → syncs to `npm-packages/` → packs tarballs to `dist/`
6. **Pre-publish test flow**: publish shared prerelease → `pi install npm:/path/to/dist/<pkg>.tgz` → symlink `~/.npm-global/lib/node_modules/@vtstech/pi-<name>` to `~/.pi/agent/extensions/pi-<name>` → `pi`
7. **Install as bundle**: `pi install git:github.com/VTSTech/pi-coding-agent` (loads all extensions from source)
8. **Validation**: `/diag` for system health, `/model-test` for model capability testing, `/ollama-sync` for Ollama integration

Do NOT start by reading every file. Use the Dependency Graph above to understand coupling, then read only what you need for your specific task.
