# Codebase Intelligence Brief: @vtstech/pi-coding-agent-extensions

> Generated: 2026-04-16T02:10:00Z | Auditor: Super Z | Commit: 583e89d

---

## Project Identity

| Field | Value |
|-------|-------|
| **Purpose** | Pi Coding Agent extension package — 8 extensions, 1 theme, and shared libraries providing security, model benchmarking, diagnostics, system monitoring, and Ollama/cloud provider sync for the [Pi Coding Agent](https://github.com/badlogic/pi-mono) terminal-based AI coding agent |
| **Tech Stack** | TypeScript 6.0, ES2022 target, ESNext modules, esbuild bundler, Node.js `node:test` framework |
| **Entry Point** | `extensions/*.ts` — each file exports a default function receiving `ExtensionAPI`; Pi auto-discovers via `package.json` `pi.extensions` field |
| **Build/Run** | `npx tsc --noEmit` (typecheck), `npm test` (test), `scripts/build-packages.sh` (build npm packages), `pi install git:github.com/VTSTech/pi-coding-agent` (install) |
| **Test Command** | `npm test` — runs `tsx --test tests/*.test.ts` (~287 test cases across 6 test files) |

---

## Architecture Map

```
extensions/          → 8 Pi extension entry points (default-exported functions)
  api.ts              → API mode/URL/thinking/compat switcher — /api command
  diag.ts             → Full system diagnostic suite — /diag command + self_diagnostic tool
  model-test.ts       → Model benchmark framework — /model-test command + model_test tool
  ollama-sync.ts      → Ollama → models.json sync — /ollama-sync command + ollama_sync tool
  openrouter-sync.ts  → OpenRouter → models.json sync — /openrouter-sync command + tool
  react-fallback.ts   → ReAct bridge tool for non-native function-calling models — tool_call tool
  security.ts         → Command/path/SSRF protection layer — /security command + security_audit tool
  status.ts           → System resource monitor & TUI status bar
shared/               → 10 shared utility modules (imported by extensions)
  ollama.ts           → Ollama API helpers, models.json I/O, mutex, retry, provider registry
  security.ts         → Security validation, SSRF, DNS rebinding, audit log
  format.ts           → Terminal formatting (section headers, ok/fail/warn, bytes, time)
  config-io.ts        → Atomic JSON config read/write (settings, security, react-mode)
  debug.ts            → Conditional debug logging (PI_EXTENSIONS_DEBUG=1)
  types.ts            → TypeScript interfaces (ToolSupportLevel, AuditEntry, etc.)
  errors.ts           → Typed error hierarchy (ExtensionError → ConfigError, ApiError, etc.)
  react-parser.ts     → Multi-dialect ReAct text parser (classic, Function, Tool, Call)
  provider-sync.ts    → Model entry merge utility
  model-test-utils.ts → Shared test configuration, history, ChatFn types
  test-report.ts      → Score/report formatting (branding, summary, recommendation)
tests/                → 6 test files (~287 test cases)
themes/               → 1 theme (matrix.json — neon green on black)
npm-packages/         → Per-extension npm manifests + build output
scripts/              → Build/publish/bump-version scripts
```

### Skip List

- `node_modules/`, `.git/`, `dist/`, `.build-npm/`
- `npm-packages/*/` built `.js` artifacts (source of truth is `shared/` and `extensions/`)
- `package-lock.json`

---

## Critical Files Index

| File | Purpose | Why It Matters |
|------|---------|----------------|
| `shared/ollama.ts` | Ollama API helpers, models.json I/O, mutex, retry, provider registry, model family detection | Central hub — imported by 7 of 8 extensions. Contains `readModelsJson()`, `writeModelsJson()`, `readModifyWriteModelsJson()` (mutex-protected), `detectProvider()`, `BUILTIN_PROVIDERS` registry (12 providers), `isLocalProvider()`. Changing anything here affects nearly every extension. |
| `shared/security.ts` | Command blocklists, SSRF protection, path validation, audit log, DNS rebinding | Security backbone — imported by security.ts and diag.ts extensions. Contains `sanitizeCommand()`, `isSafeUrl()`, `validatePath()`, `appendAuditEntry()`, `readRecentAuditEntries()`. The partitioned blocklist (CRITICAL vs EXTENDED commands, ALWAYS vs MAX_ONLY URL patterns) is mode-aware. |
| `shared/react-parser.ts` | Multi-dialect ReAct text parser with fuzzy matching and argument normalization | Core parsing logic used by react-fallback.ts and model-test.ts. Contains `parseReact()`, `buildDialectPatterns()`, `fuzzyMatchToolName()`, `extractToolFromJson()`. The dialect registry (react/function/tool/call) is dynamically pattern-built. |
| `extensions/model-test.ts` | 1631-line model benchmark framework | Largest extension. Tests reasoning, tool usage (native + ReAct), thinking tokens, instruction following. Supports both Ollama and 11+ cloud providers. Auto-updates models.json reasoning field. |
| `extensions/api.ts` | 779-line API mode switcher | Most feature-rich CLI extension. 10 API modes, compat flag management, session provider detection, tab completion. `resolveProvider()` uses 3-tier fallback. |
| `extensions/security.ts` | Security interceptor extension | Hooks `tool_call` (pre-block) and `tool_result` (post-log) events. Registers `/security mode` command and `security_audit` tool. `sanitizeInputForLog()` redacts secrets. |
| `shared/config-io.ts` | Atomic JSON config read/write | Single source of truth for paths (settings.json, security.json, react-mode.json). All extensions use `readJsonConfig()`/`writeJsonConfig()` for config I/O. |
| `shared/format.ts` | Terminal formatting utilities | `section()`, `ok()`, `fail()`, `warn()`, `info()` used by every extension for consistent output. Also `bytesHuman()`, `msHuman()`, `estimateMemory()`. |

---

## Request / Execution Lifecycle

This is not a server application — it's a Pi extension package loaded into the Pi Coding Agent process. The lifecycle is:

```
1. Pi starts → loads extensions from extensions/*.ts
2. Each extension's default export runs: export default function(pi: ExtensionAPI) { ... }
3. Extensions register commands (/diag, /api, /model-test, etc.) and tools (self_diagnostic, model_test, etc.)
4. Event hooks are registered:
   - security.ts: tool_call (pre-block), tool_result (post-log)
   - status.ts: session_start, session_shutdown, agent_start, agent_end,
     before_provider_request, tool_call, tool_execution_start/end
   - react-fallback.ts: context (injects ReAct instructions into system prompt)
5. User invokes a command or the LLM calls a tool
6. Extension handler executes:
   - Reads config via shared/config-io.ts or shared/ollama.ts
   - Performs action (HTTP to Ollama/cloud, file I/O, etc.)
   - Writes results back via models.json mutex, status bar, or message
```

### Dependency Graph

```
extensions/security.ts  → shared/security.ts, shared/format.ts, shared/debug.ts, shared/ollama.ts (VERSION only)
extensions/diag.ts      → shared/ollama.ts, shared/security.ts, shared/format.ts, shared/config-io.ts, shared/debug.ts
extensions/model-test.ts → shared/ollama.ts, shared/format.ts, shared/debug.ts, shared/types.ts,
                           shared/react-parser.ts, shared/model-test-utils.ts, shared/test-report.ts
extensions/api.ts       → shared/ollama.ts, shared/format.ts, shared/config-io.ts
extensions/ollama-sync.ts → shared/ollama.ts, shared/provider-sync.ts, shared/model-test-utils.ts, shared/format.ts
extensions/openrouter-sync.ts → shared/ollama.ts, shared/format.ts
extensions/react-fallback.ts → shared/react-parser.ts, shared/format.ts, shared/debug.ts, shared/ollama.ts (VERSION only)
extensions/status.ts    → shared/ollama.ts, shared/format.ts, shared/debug.ts, shared/security.ts

shared/security.ts     → shared/debug.ts, shared/config-io.ts (paths only)
shared/ollama.ts        → shared/debug.ts, shared/types.ts
shared/react-parser.ts  → (no shared deps)
shared/config-io.ts     → shared/debug.ts
shared/format.ts        → (no shared deps)
shared/test-report.ts   → shared/format.ts, shared/ollama.ts (VERSION only)
shared/model-test-utils.ts → shared/format.ts, shared/ollama.ts
shared/errors.ts        → (no shared deps)
shared/types.ts         → (no shared deps)
shared/debug.ts         → (no shared deps)
shared/provider-sync.ts → shared/ollama.ts (types only)
```

**Central coupling point:** `shared/ollama.ts` is imported by 7/8 extensions. `shared/format.ts` by 7/8. `shared/debug.ts` by 6/8.

---

## Patterns & Conventions

| Aspect | Pattern |
|--------|---------|
| Extension structure | Default export `function(pi: ExtensionAPI) { ... }` — no classes, all logic in closure |
| Commands | `pi.registerCommand("name", { description, handler: async (_args, ctx) => { ... } })` |
| Tools | `pi.registerTool({ name, label, description, parameters, promptSnippet, promptGuidelines, execute: async (id, params, signal, onUpdate, ctx) => { ... } })` |
| Config I/O | `readJsonConfig()`/`writeJsonConfig()` from `shared/config-io.ts` — atomic write-then-rename |
| models.json writes | `readModifyWriteModelsJson(modifier)` — mutex-protected read-modify-write cycle |
| Error handling | `try/catch` with `debugLog()` in catch blocks; typed errors from `shared/errors.ts` (rarely used in practice) |
| Terminal output | `section()`, `ok()`, `fail()`, `warn()`, `info()` from `shared/format.ts` |
| Debug logging | `debugLog("module", "message", ...args)` — gated on `PI_EXTENSIONS_DEBUG=1` env var |
| Provider detection | 3-tier: models.json user-defined → BUILTIN_PROVIDERS registry → unknown fallback |
| Security modes | `basic` (critical commands blocked) vs `max` (all commands blocked + strict SSRF) — persisted in security.json |
| Version source | `VERSION` file (single source of truth), synced to `shared/ollama.ts EXTENSION_VERSION`, `package.json` |
| Pi API types | Largely untyped — Pi doesn't export stable interfaces, so `ctx`, events, and some API calls use `any` casts with eslint-disable comments |

---

## Known Landmines

- **`shared/ollama.ts` has a 2-second in-memory cache** (`_modelsJsonCache`, `_ollamaBaseUrlCache`). After writing models.json, the cache is invalidated (`_modelsJsonCache = null`). If something writes models.json without going through `writeModelsJson()`, stale cache will be served for up to 2 seconds.

- **`shared/errors.ts` is NOT exported in npm package** — `npm-packages/shared/package.json` exports map has 10 entries but `./errors` is missing. Importing `@vtstech/pi-shared/errors` from a published package will fail at runtime. The `ConfigError` import in `api.ts` works because api.ts imports from `../shared/errors` (local path), not from the npm package.

- **`extensions/react-fallback.ts` line 151 has a use-before-define bug** — the self-call guard error message references `argsJson` before it's declared on line 162. The variable will be `undefined` at runtime when the guard triggers, producing an unhelpful error message.

- **`extensions/status.ts` line 58 — variable shadows import** — `let isLocalProvider = true` shadows the imported `isLocalProvider()` function from `shared/ollama.ts`. The code works because `detectLocalProvider()` (defined later) captures the import before the shadow occurs, but renaming the local variable would prevent future confusion.

- **`tsconfig.json` has `"strict": true` + `"noImplicitAny": true`** but tsc `--noEmit` produces ~50+ errors because the Pi framework types (`@mariozechner/pi-coding-agent`) are not installed as a dev dependency. The code is written against these types but they're resolved at runtime by Pi's bundler.

- **`setSecurityMode()` in shared/security.ts writes synchronously** — uses `fs.writeFileSync` without the atomic write-then-rename pattern that `writeJsonConfig()` uses. A crash during write could corrupt security.json.

- **Build script uses GNU `sed -i`** — `scripts/build-packages.sh` line 129 uses `sed -i` which behaves differently on macOS vs Linux. The PowerShell equivalent (`bump-version.ps1`) exists but there's no macOS-compatible build script.

- **`extensions/model-test.ts` is 1631 lines** with duplicated HTTP boilerplate across 4+ fetch functions. Adding a new provider or changing HTTP behavior requires editing multiple locations.

---

## Active Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Config format | JSON files in `~/.pi/agent/` | Pi convention; no database needed for agent config |
| Write safety | Mutex (`acquireModelsJsonLock`) + atomic rename | Prevents concurrent extension writes from corrupting models.json |
| Security default | `max` mode (fail-closed) | Absent config = maximum security; prevents accidental exposure |
| Provider registry | Hardcoded `BUILTIN_PROVIDERS` map | Pi doesn't expose provider metadata; manual registry is the only option |
| Event-driven status | `pi.on()` hooks for metrics | Composable — multiple extensions can listen to same events |
| ReAct support | Bridge tool (tool_call) + system prompt injection | Models without native function calling need a runtime bridge |
| npm packages | Separate per-extension packages | Users can install only what they need |
| Retry logic | Exponential backoff with jitter (2 retries, 1s base) | Handles transient Ollama/tunnel failures without hammering |
| Branding | Inline arrays per extension | No shared branding module; each extension defines its own |

---

## What's Missing / Incomplete

- **No integration tests** — all tests are unit tests with mocked file I/O. No end-to-end tests verify that extensions work correctly when loaded by Pi.
- **`extensions/api.ts` and `extensions/status.ts` have no dedicated test files** — these are the two most complex extensions by feature count.
- **`shared/errors.ts` typed error classes are underutilized** — `ConfigError` is imported in `api.ts` but the other error classes (ApiError, SecurityError, ToolError, ExtensionTimeoutError) are rarely used in production code. Most extensions use plain `Error` or `any` catches.
- **No CI/CD pipeline** — tests run locally via `npm test` but there's no GitHub Actions or similar automated testing.
- **CHANGELOG.md is manually maintained** — entries are hand-written with specific timestamps; no automation.
- **Version bumping requires manual script execution** — `scripts/bump-version.sh` must be run separately; not integrated into git hooks or CI.
