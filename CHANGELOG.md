# Changelog

All notable changes to the Pi Coding Agent Extensions (`@vtstech/pi-coding-agent-extensions`) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [1.1.9] - 04-14-2026 3:16:03 PM

### Added

- **ZAI  as a built-in provider** (`shared/ollama.ts`)
  - Added `zai` entry to `BUILTIN_PROVIDERS` with `openai-completions` API mode, base URL `https://open.bigmodel.cn/api/paas/v4`, and `ZAI_API_KEY` environment key. Users can now run `/api provider add zai` to configure ZAI's GLM-4 series models without manually specifying the API mode or endpoint.

- **GLM model family detection** (`shared/ollama.ts`)
  - Added `glm-4` and `glm` patterns to `detectModelFamily()` so that ZAI GLM models are correctly identified as the `glm` family. This enables consistent family-based display, grouping, and configuration across sync and model-test extensions.

### Changed

- **`/api` commands now target the current session provider by default** (`extensions/api.ts`)
  - `resolveProvider()` previously auto-detected the local Ollama provider when no explicit provider was given. In multi-provider setups, this meant `/api show`, `/api mode`, and `/api url` always displayed Ollama's config regardless of which provider the active session was actually using — a confusing experience when connected to OpenRouter, Together, or another remote provider.
  - Rewrote the resolution logic with a three-tier fallback: (1) if an explicit provider argument is given, use that; (2) if the current session provider is available and valid in `models.json`, use that; (3) fall back to local Ollama detection. Added `getCurrentSessionProvider()` helper that reads from `ctx.session.state.provider`, `ctx.state.provider`, or `settings.defaultProvider`.
  - All `/api` sub-commands (`show`, `mode`, `url`, `key`, `models`, `reasoning`, `test`) now pass the session provider through the resolution chain, so they operate on the active provider by default.

- **`/api show` highlights current provider and suggests switching** (`extensions/api.ts`)
  - The provider name line in `/api show` output now displays a `◀ current` indicator when the shown provider matches the active session provider (e.g., `Provider: openrouter ◀ current`). This gives immediate visual confirmation that the displayed config is the one currently in use.
  - When the user views a provider that differs from the active session (e.g., `/api show ollama` while connected to openrouter), a note section is appended showing the current session provider and a command hint to switch (`Use /api provider set <name> to switch to this provider`).

- **GLM-4 added to reasoning model auto-detection** (`extensions/api.ts`)
  - The reasoning model heuristic in `/api reasoning` now matches model names containing `glm-4` (ZAI's GLM-4 series). These models use chain-of-thought by default and are correctly initialized with `reasoning: true` instead of requiring manual toggling.

---

## [1.1.8] - 04-13-2026 3:59:34 PM

### Fixed

- **openrouter-sync lacked mutex protection for models.json writes** (`extensions/openrouter-sync.ts`) — [SEC-01]
  - `openrouter-sync.ts` performed inline read-modify-write cycles on `models.json` without using the `readModifyWriteModelsJson()` mutex wrapper that `ollama-sync.ts` already uses correctly. When both sync extensions ran concurrently, the non-atomic cycle could cause lost updates.
  - Rewrote to use `readModifyWriteModelsJson()` for all `models.json` modifications. Extracted a shared `performSync()` function that acquires the lock, reads the current file, applies the provider diff, and writes back atomically.

- **`rateLimitDelay()` ignored user config overrides** (`extensions/model-test.ts`) — [ROB-01]
  - `rateLimitDelay()` read from the static `CONFIG.TEST_DELAY_MS` constant instead of the merged `effectiveConfig.TEST_DELAY_MS`. Users who set a custom delay in `model-test-config.json` observed no change in actual behavior.
  - Changed to `effectiveConfig.TEST_DELAY_MS` so user overrides are respected.

- **`testToolSupport()` used hardcoded timeout** (`extensions/model-test.ts`) — [ROB-02]
  - The tool support detection function used a hardcoded `130000ms` timeout instead of reading `effectiveConfig.TOOL_SUPPORT_TIMEOUT_MS`, making the user-configurable setting a no-op.
  - Replaced the hardcoded value with the effective config lookup.

- **`fmtBytes()` returned "0K" for small byte values** (`shared/format.ts`) — [ROB-04]
  - Values below 1024 bytes (e.g., `fmtBytes(512)`) computed `Math.floor(512 / 1024) = 0` and returned `"0K"` instead of `"512B"`. Particularly noticeable for processes using less than 1 MB of memory in the status bar.
  - Added guard clause: `if (b < 1024) return \`${b}B\`;` before the kilobyte calculation.

- **`execSync` blocked event loop in status.ts** (`extensions/status.ts`) — [ROB-05]
  - Version detection used `execSync("pi -v 2>&1")`, blocking the event loop on every `session_start`. While the input is hardcoded and safe, this was inconsistent with the codebase's migration toward async patterns.
  - Migrated to `promisify(exec)("pi -v 2>&1")` — a non-blocking async call that resolves identically.

### Added

- **Shared config I/O module** (`shared/config-io.ts`) — [MAINT-03]
  - Extracted `readJsonConfig()`, `writeJsonConfig()`, `readSettings()`, and `writeSettings()` into a dedicated shared module. These functions implement the common pattern of reading/writing JSON files under `~/.pi/agent/` with atomic write-then-rename and directory auto-creation.
  - `api.ts` updated to import from `shared/config-io` instead of maintaining its own local copies. Registered `"./config-io"` in `shared/package.json` exports map.

- **Shared ReAct dialect detection** (`shared/react-parser.ts`) — [MAINT-04, MAINT-06]
  - Extracted `detectReactDialect()` from `model-test.ts` into `shared/react-parser.ts`. The function checks a text sample against `ALL_DIALECT_PATTERNS` to identify which ReAct dialect a model is using.
  - `testToolSupport()` now imports and calls `detectReactDialect()` instead of maintaining an 18-line inline `reactPatterns` array, eliminating a maintenance drift risk where new dialect patterns added to the canonical source would not propagate to the inline copy.

- **Canonical `extractBraceJson()` in shared module** (`shared/react-parser.ts`) — [MAINT-05]
  - Moved `extractBraceJson()` from `model-test.ts` into `shared/react-parser.ts` as the authoritative implementation. `model-test.ts` imports from the shared module, removing the duplicated brace-matching logic.

### Security

- **Crash-safe audit log flush** (`shared/security.ts`) — [SEC-02]
  - The buffered audit log mechanism could lose entries if the process crashed, received SIGKILL, or experienced an unhandled exception during the 500ms buffering window. For a security audit trail, this represents a gap in the chain of custody.
  - Added `process.on("exit")` handler that synchronously flushes the audit buffer via `appendFileSync` before process termination. Added `process.on("SIGTERM")` handler for graceful shutdown scenarios. Both handlers call the existing `flushAuditBuffer()` function.

- **Secret redaction in /diag endpoint** (`extensions/diag.ts`) — [SEC-05]
  - The diagnostic endpoint displayed the full contents of `settings.json`, which may include API keys, authentication tokens, or other credentials in plaintext. Anyone with access to the diagnostic report could extract sensitive values.
  - Added `redactValue()` function that checks key names against secret patterns (key, token, secret, password, credential, auth, apikey, api_key) and replaces matching values with `[REDACTED]`. Long strings that look like API keys (no spaces, alphanumeric) are truncated. Applied redaction to all settings.json entries in the diagnostic output.

### Fixed

- **Empty catch blocks replaced with debugLog() calls** (`extensions/model-test.ts`, `extensions/diag.ts`, `extensions/status.ts`, `extensions/react-fallback.ts`, `shared/model-test-utils.ts`, `shared/ollama.ts`) — [ROB-03]
  - Many `catch` blocks throughout the codebase were empty or contained only a brief comment like `/* ignore */`. While intentional suppression is sometimes appropriate, the complete absence of logging made production debugging extremely difficult — developers had no visibility into which error paths were being triggered.
  - Replaced all empty catch blocks with `debugLog()` calls. For error paths that are genuinely expected to fail (e.g., JSON parse fallbacks, non-critical cache reads), added explanatory comments describing why suppression is safe. Affected ~20 catch blocks across 7 files.

### Added

- **Shared typed error classes** (`shared/errors.ts`) — [FEAT-02]
  - Introduced a hierarchy of typed error classes for structured error handling across the extension system: `ExtensionError` (base), `ConfigError` (invalid/missing config), `ApiError` (HTTP failures with statusCode/url), `TimeoutError` (operation timeouts with timeoutMs), `SecurityError` (security violations with rule/detail), and `ToolError` (tool execution failures with toolName).
  - Wired up in `api.ts` (imports `ConfigError`) and `security.ts` (imports `SecurityError`), making the classes available for use across all extensions. Callers can use `instanceof` checks to categorize and respond to errors appropriately.

- **Shared provider sync utilities** (`shared/provider-sync.ts`) — [ARCH-02]
  - Extracted `mergeModels()` from `ollama-sync.ts` into a shared module. The function merges new model entries with old entries, preserving extra user-defined fields while refreshing standard metadata. This eliminates duplication between `ollama-sync.ts` and `openrouter-sync.ts` and makes it structurally harder to repeat the SEC-01 mutex omission.
  - `ollama-sync.ts` now imports `mergeModels` from `shared/provider-sync` instead of maintaining a local copy.

- **Shared test report formatting** (`shared/test-report.ts`) — [MAINT-01]
  - Extracted `formatTestSummary()`, `formatRecommendation()`, `formatTestScore()`, and branding from `model-test.ts` into a shared module. These are pure functions that format benchmark summary and recommendation sections.
  - `model-test.ts` imports from `shared/test-report` instead of inlining the formatting logic in two places (Ollama and provider test suites), reducing model-test.ts from 1,735 to ~1,680 lines.

- **Status bar polling pauses between sessions** (`extensions/status.ts`) — [PERF-03]
  - The status bar updated every 5 seconds even when no session was active, consuming unnecessary CPU and memory. Both the main metrics interval and the fast tool timer continued running between sessions.
  - Added `.unref()` to both `setInterval` timers so they never prevent the process from exiting. Documented that polling is session-gated (interval created on `session_start`, cleared on `session_shutdown`).

### Changed

- **Added `.npmignore` files to all 9 npm-packages/ subdirectories** — [ARCH-04]
  - `npm-packages/` directories lacked `.npmignore` files. Added appropriate `.npmignore` to each package directory to reduce published package size and prevent shipping internal files to consumers.

- **eslint-disable comments with justification for `any` types** (`extensions/security.ts`, `extensions/diag.ts`, `extensions/status.ts`, `extensions/model-test.ts`) — [MAINT-02]
  - Added eslint-disable-next-line comments with detailed justifications for `any` type usage in event handler callbacks. Each comment explains why `any` is necessary (Pi framework does not export specific event type interfaces) and notes that the pattern is version-dependent.
  - This is an incremental improvement — full typed interfaces require Pi to export stable event types, which is outside the extension's control.

### Testing

- **Extended security unit tests** (`tests/security.test.ts`) — [TEST-01]
  - Added 388 lines covering: `sanitizeCommand` mode-aware behavior (8 tests), `CRITICAL_COMMANDS`/`EXTENDED_COMMANDS` partitioning (8 tests), `validatePath` sensitive paths and edge cases (5 tests), `isSafeUrl` mode-aware localhost behavior (8 tests), `checkBashToolInput` extended coverage (4 tests), `checkFileToolInput` extended coverage (5 tests), and `checkHttpToolInput` extended coverage (5 tests).

- **Shared utilities and extension tests** (`tests/shared-utils.test.ts`) — [TEST-01, TEST-02]
  - Added 37 tests covering: all 6 typed error classes (ExtensionError, ConfigError, ApiError, TimeoutError, SecurityError, ToolError), `mergeModels` shared utility (5 tests), `formatTestScore` formatting (5 tests), recommendation label logic (5 tests), `parseModelIds` from openrouter-sync (7 tests), and `ensureProviderOrder` provider ordering (5 tests).

### Security

- **IPv6-mapped IPv4 SSRF bypass closed** (`shared/security.ts`) — [SEC-03]
  - The SSRF protection checked for `::ffff:127.0.0.1` and `::ffff:0.0.0.0` as exact strings but did not handle the general `::ffff:0:0/96` prefix (RFC 4291). A dual-stack system could resolve `::ffff:10.0.0.1` to the same host as `10.0.0.1`, bypassing the RFC1918 private range check. Similarly, `::ffff:169.254.169.254` could bypass the cloud metadata block.
  - Added `stripIpv6Mapped()` helper that strips the `::ffff:` prefix before all IP classification checks (`isLoopbackIp()`, `isPrivateIp()`, `resolveAndCheckHostname()`). Added `::ffff:169.254.169.254` to `BLOCKED_URL_ALWAYS` and IPv6-mapped private range prefixes (`::ffff:10.`, `::ffff:192.168.`, `::ffff:172.16-31.`) to `BLOCKED_URL_MAX_ONLY`.

- **Temp directory writes restricted to agent-owned directory** (`shared/security.ts`) — [SEC-04]
  - `validatePath()` allowed writes to `/tmp`, `/var/tmp`, and `/dev/shm` — world-readable/writable directories where any process or user can read, modify, or delete files placed by the agent.
  - Replaced `/tmp` and `/var/tmp` in the safe prefixes list with `~/.pi/agent/tmp/`. Added explicit blocking for `/tmp`, `/var/tmp`, and `/dev/shm` with an error message directing users to the agent temp directory. The agent temp directory is user-owned and restricted via standard directory permissions.

- **Unicode normalization and control character stripping in command sanitizer** (`shared/security.ts`) — [SEC-06]
  - `sanitizeCommand()` performed pattern matching on the raw command string without handling Unicode homoglyphs (visually identical but different codepoints, e.g. Cyrillic 'о' vs Latin 'o'), zero-width characters (ZWJ, ZWNJ, ZWSP), or control characters that could be injected between letters of blocked command names.
  - Added NFKC normalization before all pattern matching — canonicalizes fullwidth Latin, compatibility decompositions, and other visually identical variants to their standard ASCII forms. Added a control character stripper that removes C0 controls (U+0000–U+001F), DEL (U+007F), C1 controls (U+0080–U+009F), zero-width characters (U+200B–U+200F), line/paragraph separators (U+2028–U+202E), BOM (U+FEFF), and invisible operators (U+2060–U+2069). Logs a debug warning when normalization changes the command (indicates obfuscation attempt).

### Changed

- **Removed `pi._reactParser` inter-extension communication** (`extensions/react-fallback.ts`, `extensions/model-test.ts`) — [ARCH-01]
  - The `react-fallback.ts` extension stored parser functions on `pi._reactParser` (via `(pi as any)`) for `model-test.ts` to access at runtime. This was completely redundant — both extensions already imported directly from `../shared/react-parser`, and `model-test.ts` had a fallback path that used the direct import when `pi._reactParser` was unavailable.
  - Removed the `pi._reactParser` mutation from `react-fallback.ts` and the shared-parser check from `model-test.ts`. The direct import path is now the sole code path. Removed the unused `normalizeArguments` import from `react-fallback.ts` (was only re-exported via `pi._reactParser`).

### Testing

- **Updated tests for SEC-04 temp directory restriction** (`tests/security.test.ts`)
  - Changed 4 tests that expected `/tmp` and `/var/tmp` to be valid paths. Tests now verify these shared temp directories are correctly blocked with appropriate error messages.

- **Updated tests for SEC-06 command normalization** (`tests/security.test.ts`)
  - Updated injection tests to account for the fact that newline/control characters are stripped before injection pattern matching. The injection is neutralized by stripping — the dangerous characters never reach the shell. Updated `find` test to use explicit path (`find /home`) instead of `find .` which collides with the critical `.` (source) command.

- **Updated test for ROB-04 fmtBytes fix** (`tests/format.test.ts`)
  - Changed test expectation from `"1K"` to `"512B"` to match the easy-pass ROB-04 fix (values below 1024 bytes now return byte notation).

### Fixed

- **Unused imports across 5 extension files** (`extensions/api.ts`, `extensions/security.ts`, `extensions/diag.ts`, `extensions/openrouter-sync.ts`) — [MAINT-08]
  - Five unused imports were left behind during v1.1.8 refactoring: `ConfigError` in `api.ts`, `SecurityError` and `bytesHuman` in `security.ts`, `padRight` in `diag.ts`, `writeModelsJson` and `os` in `openrouter-sync.ts` and `api.ts`. Dead imports add noise and can cause false positives in bundler tree-shaking analysis.
  - Removed all unused imports from affected files.

- **`readJsonConfig()` empty catch lacked debug logging** (`shared/config-io.ts`) — [ROB-06]
  - The v1.1.8 release replaced ~20 empty catch blocks with `debugLog()` calls (ROB-03) but missed one: `readJsonConfig()` had `catch { /* read failure is non-critical */ }` with no debug output. Since this is the centralized config reader used by all extensions, corrupted config files or permission errors were completely invisible even with `PI_EXTENSIONS_DEBUG=1`.
  - Added `console.debug()` call gated on `PI_EXTENSIONS_DEBUG` environment variable, consistent with the pattern used across the rest of the codebase.

- **`updateModelsJsonReasoning()` bypassed models.json mutex** (`extensions/model-test.ts`) — [ARCH-06]
  - While both sync extensions were fixed in v1.1.8 to use `readModifyWriteModelsJson()` for mutex-protected writes (SEC-01), the `updateModelsJsonReasoning()` function still used the lower-level `readModelsJson()`/`writeModelsJson()` pair without mutex protection. A concurrent sync operation during a reasoning update could interleave reads and writes.
  - Replaced the read-modify-write cycle with `readModifyWriteModelsJson()`, bringing it in line with the established pattern used by `ollama-sync.ts` and `openrouter-sync.ts`.

- **`writeJsonConfig()` not atomic despite docstring claiming crash safety** (`shared/config-io.ts`) — [MAINT-07]
  - The function's docstring stated "Uses write-then-rename for crash safety" but the implementation called `fs.writeFileSync()` directly — no temporary file or rename step. A crash during write could leave config files in a corrupted (partial) state. Meanwhile, `writeModelsJson()` in `shared/ollama.ts` correctly implemented the atomic pattern.
  - Implemented actual atomic write-then-rename: writes to `${filePath}.tmp`, then `fs.renameSync()` to the target path. Falls back to direct write if rename fails (e.g., cross-filesystem move). Updated docstring to document the fallback behavior.

### Changed

- **Duplicate tests consolidated into shared-utils.test.ts** (`tests/shared-utils.test.ts`, `tests/openrouter-sync.test.ts`) — [ARCH-08]
  - Both `openrouter-sync.test.ts` and `shared-utils.test.ts` contained inline re-implementations of `parseModelIds` and `ensureProviderOrder` with nearly identical test cases. The duplication doubled maintenance surface — any bug fix in source functions had to be manually synchronized in both test copies.
  - `shared-utils.test.ts` now imports `mergeModels`, `formatTestScore`, `formatTestSummary`, and `formatRecommendation` from their actual source modules instead of using inline re-implementations. `openrouter-sync.test.ts` was cleaned up to remove its duplicated copies while retaining tests for `parseModelIds` and `ensureProviderOrder` (which cannot be imported since the extension uses `export default`).

### Testing

- **Tests for formatTestSummary and formatRecommendation** (`tests/shared-utils.test.ts`) — [TEST-06]
  - Added 7 tests for `formatTestSummary`: all-pass summary with score and time, mixed pass/fail, all-fail, and empty test array.
  - Added 7 tests for `formatRecommendation`: STRONG (all pass), STRONG with `via` provider suffix, GOOD (one fail), USABLE (two fails), WEAK (most fail), single-test pass (STRONG), and single-test fail (WEAK).

### Added

- **Configurable context length fetch batch size** (`shared/model-test-utils.ts`, `extensions/ollama-sync.ts`) — [PERF-05]
  - `fetchContextLengthsBatched()` used a hardcoded batch size of 3 concurrent requests. Under high-latency network conditions (e.g., tunneled remote Ollama over Cloudflare Tunnel), a smaller batch avoids timeouts; a larger batch improves throughput on fast connections.
  - Added `CONTEXT_BATCH_SIZE` to `CONFIG` defaults (default: 3), `contextBatchSize` to `ModelTestUserConfig` interface, and wired the effective config value through to the `fetchContextLengthsBatched()` call in `ollama-sync.ts`. Users can now set `contextBatchSize` in `~/.pi/agent/model-test-config.json`.

### Fixed

- **`formatRecommendation()` edge case: single-test fail returned GOOD instead of WEAK** (`shared/test-report.ts`)
  - When `passed=0, total=1`, the condition `passed >= total - 1` evaluated to `0 >= 0` (true), routing to the GOOD tier. A model that fails its only test should not be rated GOOD.
  - Added `passed > 0` guard to both GOOD and USABLE tier conditions so that zero passes always falls through to WEAK.

---

## [1.1.7] - 04-13-2026 11:19:48 AM

### Added

- **Models.json write mutex — prevents concurrent read-modify-write races** (`shared/ollama.ts`)
  - Two or more extensions calling `readModelsJson()` / `writeModelsJson()` in overlapping async cycles could interleave reads and writes, causing the last writer to clobber the first writer's changes. This race was observable when `/ollama-sync` and `/openrouter-sync` ran back-to-back, or when the status extension polled `models.json` during a sync.
  - Added `acquireModelsJsonLock()` — an async mutex built on a promise chain. Callers `await` the lock, perform their read-modify-write, then call `release()`. Only one writer proceeds at a time; others queue in order.
  - Added `readModifyWriteModelsJson(modifier)` — a convenience wrapper that acquires the lock, calls `readModelsJson()`, passes the result to the `modifier` callback, and writes the modified data back. The modifier can return `null` to abort without writing. Returns `true` if the write succeeded, `false` if aborted.
  - Both functions are exported for use by any extension that needs to mutate `models.json`.

- **Exponential backoff retry for Ollama HTTP calls** (`shared/ollama.ts`)
  - `withRetry(fn, options)` wraps any async function with automatic retry on transient failures. Uses exponential backoff with ±25% jitter to avoid thundering herd.
  - Retries on: `ECONNREFUSED`, `ECONNRESET`, `ENOTFOUND`, `ETIMEDOUT`, `fetch failed`, `network error`, `socket hang up`, `Empty response`, and `AbortError` (timeouts). Does NOT retry on HTTP-level errors (4xx/5xx status codes) or non-transient failures.
  - Default configuration: 2 retries, 1s base delay, 10s max delay. All tunable via `RetryOptions` interface.
  - `fetchOllamaModels()` now uses `withRetry` internally, so transient connection failures during model listing are automatically recovered without the caller handling retries.
  - Debug logging on each retry attempt includes the delay and error message.

- **DNS rebinding protection for SSRF** (`shared/security.ts`)
  - Pattern-based URL blocking (`isSafeUrl()`) checks the URL string at validation time but does not verify what IP the hostname actually resolves to at request time. A DNS rebinding attack could configure a hostname to resolve to a public IP during validation, then to `127.0.0.1` or `169.254.169.254` when the request is sent.
  - Added `resolveAndCheckHostname(hostname, blockPrivate)` — resolves the hostname via `dns.lookup()` (which respects `/etc/hosts` and system resolver) and checks all returned addresses against loopback, private RFC1918, and cloud metadata ranges. Returns `{ safe, error }` for the caller to act on.
  - Added `isLoopbackIp(ip)` and `isPrivateIp(ip)` helper functions covering IPv4 (127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254) and IPv6 (::1, ::ffff:127.0.0.0/104, fc00::/7, fe80::/10).
  - This is an opt-in enhancement — callers that want DNS-level protection should call `resolveAndCheckHostname()` after `isSafeUrl()` passes. The pattern checks remain the primary defense for synchronous code paths.

- **Audit log rate limiting via buffered writes** (`shared/security.ts`)
  - `appendAuditEntry()` previously called `fs.appendFileSync()` on every single entry. Under heavy blocking activity (e.g., repeated blocked commands in a loop), this produced excessive synchronous disk I/O — one syscall per entry, each blocking the event loop.
  - Replaced with an in-memory buffer that batches entries and flushes to disk on two triggers: (1) automatically every 500ms via `setInterval` (timer is `unref()`'d so it doesn't prevent process exit), or (2) immediately when the buffer reaches 50 entries.
  - Added `flushAuditBuffer()` — exported function for explicit flush on shutdown or before critical operations. Called automatically by the timer.
  - Buffer and timer are lazily initialized on first `appendAuditEntry()` call.

- **Streaming Ollama chat for model tests** (`extensions/model-test.ts`)
  - Added `ollamaChatStream()` — sends requests to Ollama `/api/chat` with `stream: true` and accumulates NDJSON response chunks via a `ReadableStream` reader. Accumulates both `message.content` and `message.thinking` fields across chunks.
  - `makeOllamaChatFn()` now defaults to streaming (`useStreaming = true`). This provides earlier timeout detection (first token arrives quickly even if the full response takes a while) and reduced memory pressure for very long responses.
  - Falls back to non-streaming when `useStreaming = false` is explicitly passed.

- **Configurable test timeouts and parameters** (`shared/model-test-utils.ts`, `extensions/model-test.ts`)
  - All `CONFIG` constants (timeouts, retry counts, delays, temperature, num_predict) can now be overridden by the user via `~/.pi/agent/model-test-config.json`. No config file means defaults are used.
  - Added `ModelTestUserConfig` interface and `readTestConfig()` to read the JSON config file. Added `getEffectiveConfig()` to merge user overrides with `CONFIG` defaults, with user values taking precedence.
  - `model-test.ts` now calls `getEffectiveConfig()` at load time instead of importing `CONFIG` directly, so all test functions use the merged configuration.

- **Test history tracking with regression detection** (`shared/model-test-utils.ts`, `extensions/model-test.ts`)
  - Added `TestHistoryEntry` interface recording timestamp, model, provider, individual test scores, elapsed time, total score, and recommendation per test run.
  - `readTestHistory()` / `appendTestHistory()` — persistent history stored at `~/.pi/agent/cache/model-test-history.json`. Capped at 50 entries per model and 500 entries total, with oldest entries pruned on append.
  - `detectRegression(current, previous)` — compares the latest test result against the previous run for the same model and returns a regression report if any test score degraded (e.g., STRONG → MODERATE, MODERATE → WEAK, or any pass → fail).
  - Model test summary now shows the number of previous runs and flags regressions when detected.

- **`bump-version.ps1` — Windows PowerShell version bump script** (`scripts/bump-version.ps1`)
  - PowerShell script for bumping version across all touchpoints from Windows. Uses `[System.IO.File]` for guaranteed UTF-8 no-BOM writes on both PowerShell 5 and 7.
  - Reads current version from `shared/ollama.ts`, shows plan with confirmation prompt, updates all 6 files (ollama.ts, package.json x2, README.md, VERSION, CHANGELOG.md), then commits and tags.
  - Counterpart to the existing `bump-version.sh` for Linux/macOS.

### Fixed

- **Prompt status slot appearing after `pi:` version in footer** (`extensions/status.ts`)
  - The `system-prompt` slot was set to `undefined` (hidden) on `session_start` and only populated later in `agent_start` or `before_provider_request`. The Pi framework treats `undefined` slots as absent, so when the slot finally got a value mid-session, the framework appended it after `status-versions` — violating the "versions always last" invariant.
  - Fixed with two changes: (1) renamed the slot from `system-prompt` to `status-prompt` so it sorts alphabetically before `status-versions` in the framework's slot ordering, and (2) registered a placeholder value (`Prompt: …`) on the first `flushStatus()` call so the framework knows the slot's position from session start. Once the prompt is measured, the placeholder is replaced with the real `Prompt: 2840 chr 393 tok` string in-place.

- **CtxMax and RespMax separated in status bar by other slots** (`extensions/status.ts`)
  - CtxMax (`status-native-ctx`) and RespMax (`status-resp-max`) were separate slots that sorted apart alphabetically — `status-native-ctx` appeared near the beginning while `status-resp-max` appeared mid-bar, separated by `status-resp` and `status-params`.
  - Combined into a single `status-ctx` slot that renders both values as one unit: `CtxMax:33k RespMax:16.4k`. Both values are still independently computed and either can be absent without affecting the other.

- **`sanitizeCommand()` only checked the first word against critical blocklist** (`shared/security.ts`)
  - The function extracted `parts[0]` as the base command and checked it against CRITICAL_COMMANDS and EXTENDED_COMMANDS. Any subsequent words were ignored. This meant `sudo chmod 777 /etc/passwd` passed in basic mode because only `sudo` (extended, allowed in basic) was evaluated — `chmod` (critical, always blocked) was never checked.
  - Changed to scan all words in the command against CRITICAL_COMMANDS. The extended blocklist still only checks the base command (first word) since extended commands like `rm` or `curl` are intentionally allowed as arguments/subcommands in basic mode.
  - This also catches patterns like `exec dd if=/dev/zero of=/dev/sda`, `find / -exec shred {}`, etc. where the dangerous command appears after a benign first word.

- **Diagnostic security tests assume max mode** (`extensions/diag.ts`)
  - `/diag` security validation tests had hardcoded expectations for max mode: `localhost` SSRF URLs were expected to be blocked, and `sudo`/`curl` commands were expected to be blocked. In basic mode these are all allowed, producing three `UNEXPECTED` failures on every run.
  - The command blocklist and SSRF pattern counts also reported the full (max-mode) totals regardless of the active mode.
  - Fixed by reading the current security mode via `getSecurityMode()` and: (1) showing the mode in the SECURITY header, (2) reporting effective blocklist sizes with a breakdown (e.g., `41 commands blocked (41 critical)` in basic vs `66 commands blocked (41 critical + 25 extended)` in max), (3) adjusting SSRF and command test expectations so `localhost`, `sudo`, and `curl` are expected-allowed in basic mode and expected-blocked in max mode.

### Changed

- **Single source of truth for version — VERSION file** (`VERSION`, `scripts/build-packages.sh`, `scripts/publish-packages.sh`, `scripts/bump-version.sh`, `scripts/bump-version.ps1`)
  - Added `VERSION` file at the repo root containing just the version string (e.g., `1.1.7`). This is now the single source of truth for the version number.
  - `build-packages.sh` and `publish-packages.sh` now read the version from the VERSION file at runtime via `cat "$REPO_ROOT/VERSION"` instead of having a hardcoded `VERSION="..."` variable. This eliminates version drift between the build scripts and the rest of the codebase.
  - `bump-version.sh` now writes the VERSION file first, then updates the derived locations (ollama.ts, package.json files). Build/publish scripts are no longer listed as touchpoints since they derive from VERSION at runtime.
  - `EXTENSION_VERSION` in `shared/ollama.ts` continues to be the runtime constant used by extensions, but the comment now directs users to run `bump-version.sh` rather than editing it manually.

- **Pi version status slot uses green highlight** (`extensions/status.ts`)
  - The `pi:0.66.1` slot in the footer was rendered entirely in dim text, inconsistent with every other slot which uses dim labels with green values.
  - Now renders as dim `pi:` label + green version value, matching the `CtxMax:`, `RespMax:`, `Prompt:`, etc. convention.

### Security

- **DNS rebinding protection** — see Added section above.
- **Audit log rate limiting** — see Added section above.
- **Command blocklist full-word scan** — see Fixed section above (`sanitizeCommand` now checks all words against CRITICAL_COMMANDS).

### Testing

- **Tests for retry logic** (`tests/ollama.test.ts`)
  - 5 new tests covering `withRetry()`: success on first attempt, retry on transient errors, exhaustion of retries, non-retryable error passthrough, and `maxRetries: 0` no-retry mode.

- **Tests for concurrent write protection** (`tests/ollama.test.ts`)
  - 3 new tests covering `acquireModelsJsonLock()`: release function works, concurrent lock acquisition serializes in order, and `readModifyWriteModelsJson()` reads-modifies-writes under lock with null-abort support.

- **Tests for audit log buffering** (`tests/security.test.ts`)
  - 2 new tests covering `appendAuditEntry()` and `flushAuditBuffer()`: buffer-and-flush cycle completes without throwing, and multiple consecutive flushes are safe (idempotent).

- **Tests for DNS rebinding protection** (`tests/security.test.ts`)
  - 4 new tests covering `resolveAndCheckHostname()`: loopback blocking (when `blockPrivate=true`), public hostname allowance, graceful handling of unresolvable hostnames (returns `safe=true`), and `blockPrivate=false` mode. Tests verify return structure rather than specific DNS results for portability across environments.

---

## [1.1.6] - 04-13-2026 9:45:00 AM

### Fixed

- **System prompt size not displayed in status bar** (`extensions/status.ts`)
  - The `system-prompt` status slot relied on `ctx.getSystemPrompt()` which throws in Pi v0.66.1 — the API does not exist in this version. The silent `catch {}` block swallowed the error, so `cachedPromptText` stayed `null` and the slot was always set to `undefined` (hidden).
  - Added `measurePromptFromPayload()` fallback that extracts the system prompt from the `before_provider_request` event payload's `messages[]` array. The system message (role `"system"` or first message) is measured for character count and word count, then cached and flushed to the status bar. This works with any Pi version because it reads the raw provider request payload, which is always present.
  - The primary path still tries `ctx.getSystemPrompt()` first (for future Pi versions that support it), with a `debugLog()` call on failure instead of a silent catch. The payload fallback runs only if the primary path didn't produce a result.

- **Missing subpath exports in `@vtstech/pi-shared`** (`shared/package.json`, `npm-packages/shared/package.json`)
  - Three shared modules — `debug.ts`, `model-test-utils.ts`, and `react-parser.ts` — were compiled to JavaScript by the build script and imported by extensions, but were not declared in the `exports` map of `@vtstech/pi-shared`'s `package.json`. Only `./format`, `./ollama`, `./security`, and `./types` were listed.
  - Node.js strict subpath resolution (enforced by the `"exports"` field) treats unlisted subpaths as errors: `Package subpath './debug' is not defined by "exports"`. This caused `@vtstech/pi-security` and `@vtstech/pi-status` to fail to load entirely when installed via npm (the github bundle uses direct filesystem imports and was unaffected).
  - Added `"./debug"`, `"./model-test-utils"`, and `"./react-parser"` to the exports map in both `shared/package.json` and `npm-packages/shared/package.json`. All 7 shared modules are now properly exported.

### Changed

- **All npm-package READMEs updated with 1.1.5 features** (`npm-packages/*/README.md`)
  - `npm-packages/security/README.md`: rewrote protection section with partitioned blocklist, mode-aware SSRF, security mode toggle; added Commands section with `/security mode basic|max` usage examples.
  - `npm-packages/status/README.md`: updated SEC slot description to show mode indicator (`SEC:BASIC`/`SEC:MAX`); updated both status bar examples to include the security mode.
  - `npm-packages/shared/README.md`: updated `security` module description with mode toggle, partitioned blocklist counts, mode-aware SSRF counts; added missing module entries (`debug`, `model-test-utils`, `react-parser`) to the modules table — previously only 4 of 7 shared modules were documented.

- **Version bumped from 1.1.4-dev to 1.1.5** (17 files, 30 line edits)
  - Source of truth: `shared/ollama.ts` (`EXTENSION_VERSION`), root `package.json`, `shared/package.json`, `scripts/build-packages.sh`, `scripts/publish-packages.sh`.
  - npm-packages: all 9 `package.json` files (version + `@vtstech/pi-shared` dependency).
  - Documentation: root `README.md` (4 references), `package-lock.json` (2 references), `brief.md` (2 references).

---

## [1.1.5] - 04-13-2026 12:15:32 AM

### Added

- **Security mode toggle — basic/max with persistent storage** (`shared/security.ts`, `extensions/security.ts`)
  - New `SecurityMode` type (`"basic" | "max"`) and `SECURITY_CONFIG_PATH` pointing to `~/.pi/agent/security.json`. The mode is read at runtime by `getSecurityMode()` and written by `setSecurityMode()`, which creates the directory if missing, writes atomically via `writeFileSync`, and verifies the write by reading it back. An absent or corrupt config always defaults to `"max"` (fail-closed).
  - `/security mode` command displays the current mode, effective blocklist sizes, and mode differences. `/security mode basic` and `/security mode max` switch modes with confirmation output showing which commands and SSRF patterns are affected.

- **Mode-aware command blocklist partitioning** (`shared/security.ts`)
  - The monolithic 65-command `BLOCKED_COMMANDS` set was split into two tiered sets:
    - `CRITICAL_COMMANDS` (41 commands) — always blocked regardless of mode: filesystem destruction (`mkfs`, `dd`, `shred`, `wipe`, `srm`, `format`, `fdisk`), privilege escalation (`su`, `doas`, `pkexec`, `gksudo`, `kdesu`), network attacks (`nmap`, `nc`, `netcat`, `telnet`), remote access (`ssh`, `scp`, `sftp`, `rsync`), process killing (`kill`, `killall`, `pkill`, `xkill`), user management (`useradd`, `userdel`, `usermod`, `passwd`, `adduser`, `deluser`), dangerous shell features (`exec`, `eval`, `source`, `.`, `alias`), filesystem control (`mount`, `umount`, `chattr`, `lsattr`), and permission modification (`chown`, `chmod`).
    - `EXTENDED_COMMANDS` (25 commands) — blocked only in max mode: file deletion (`rm`, `rmdir`, `del`), `sudo`, download tools (`wget`, `curl`), package management (`apt`, `apt-get`, `yum`, `dnf`, `pacman`, `pip`, `npm`, `yarn`, `cargo`), system services (`systemctl`, `service`), interactive editors (`vi`, `vim`, `nano`, `emacs`, `less`, `more`, `man`), and `git`.
  - `sanitizeCommand()` checks CRITICAL_COMMANDS unconditionally, then checks EXTENDED_COMMANDS only when `getSecurityMode()` returns `"max"`.
  - Legacy `BLOCKED_COMMANDS` export retained as the union of both sets for backward compatibility.

- **Mode-aware SSRF protection** (`shared/security.ts`)
  - The monolithic `BLOCKED_URL_PATTERNS` set was split into two tiered sets:
    - `BLOCKED_URL_ALWAYS` (19 patterns) — always blocked: cloud metadata endpoint (`169.254.169.254`), full RFC1918 private ranges (`10.`, `192.168.`, `172.16.`–`172.31.`), and internal service patterns (`internal.`, `private.`, `intranet.`).
    - `BLOCKED_URL_MAX_ONLY` (7 patterns) — blocked only in max mode: loopback addresses (`localhost`, `127.`, `0.0.0.0`, `::1`, `::ffff:127.0.0.1`, `::ffff:0.0.0.0`, `local.`).
  - `isSafeUrl()` checks `BLOCKED_URL_ALWAYS` unconditionally, then checks `BLOCKED_URL_MAX_ONLY` only in max mode. In basic mode, localhost and 127.x URLs are allowed for local development workflows.
  - Legacy `BLOCKED_URL_PATTERNS` export retained as the union of both sets for backward compatibility.

- **Tab completion for `/security mode basic|max`** (`extensions/security.ts`)
  - Uses `pi.registerCompletion()` (separate from `registerCommand`) for depth-aware multi-level tab completion, matching the `/api` command pattern. `getCompletions()` returns the `mode` sub-command; `getArgumentCompletions(args[])` returns `basic` and `max` when `args.length === 2`.

- **Security mode in audit log entries** (`shared/security.ts`)
  - `appendAuditEntry()` now injects `securityMode` into every audit entry, automatically reading the current mode via `getSecurityMode()`. This provides post-incident forensic context — blocked operations can be correlated with the enforcement level that was active at the time.

- **Security mode in audit report** (`extensions/security.ts`)
  - `/security-audit` and the `security_audit` tool now display the current mode, effective blocklist sizes (critical-only in basic vs. full in max), and effective SSRF pattern counts. Recent audit log entries include the mode tag in their output.

- **Status bar integration for mode toggle** (`extensions/security.ts`)
  - `/security mode basic|max` calls `ctx.ui.setStatus("status-sec", mode.toUpperCase())` to update the existing SEC status slot with the current enforcement level (BASIC or MAX).

### Fixed

- **`/security mode basic` argument silently dropped by command system** (`extensions/security.ts`)
  - `getArgumentCompletions` on `registerCommand` only supports a single argument level. When the user typed `/security mode basic`, the command system resolved "mode" via completions but silently dropped "basic" because it had no matching completion entry. The handler received `args = "mode"` instead of `args = "mode basic"`, causing it to display the info panel instead of switching modes.
  - Removed `getArgumentCompletions` from `registerCommand` and added a separate `pi.registerCompletion()` call with depth-aware `getArgumentCompletions(args: string[])` that provides completions at each argument position, matching the `/api` command pattern.

- **`setSecurityMode()` return value not checked** (`extensions/security.ts`)
  - The handler called `setSecurityMode()` but discarded the boolean return value. If the write failed (permissions, disk full, etc.), the command would still display "Security mode set to BASIC" and update the status bar, giving false confidence that the mode had persisted.
  - Now checks the return value and displays an error notification with the config path on failure before returning early.

- **Template literal in max lockdown message** (`extensions/security.ts`)
  - The max mode confirmation used a template literal inside a regular string: `"Full lockdown active — all ${CRITICAL_COMMANDS.size + ...} commands blocked"`. The `${}` was not interpolated, producing a literal `${...}` in the output.
  - Pre-computed the total into a `totalCmds` constant and used a proper template literal: `` `Full lockdown active — all ${totalCmds} commands blocked` ``.

- **Unhandled exceptions in `/security` command handler** (`extensions/security.ts`)
  - The handler had no top-level try/catch. Any unexpected throw (e.g., from `getSecurityMode()` if `debugLog` failed) would silently swallow the error with no user-visible output.
  - Wrapped the entire handler body in a try/catch that reports the error message via `ctx.ui.notify()` and logs it via `debugLog()`.

### Changed

- **Security audit report shows mode-aware blocklist sizes** (`extensions/security.ts`)
  - The audit report now displays "Effective blocked commands" as either `CRITICAL_COMMANDS.size` (basic) or `CRITICAL_COMMANDS.size + EXTENDED_COMMANDS.size` (max), and similarly for URL patterns. This makes it clear which enforcement tier is active without needing to run `/security mode` separately.

- **`validatePath()` blocks access to `security.json`** (`shared/security.ts`)
  - `SECURITY_CONFIG_PATH` added to the sensitive paths list, preventing tool-based file operations from reading or writing the security mode configuration. Only `getSecurityMode()` and `setSecurityMode()` (which use direct `fs` calls, not the tool system) can interact with the file.

- **`/security` command handler imports `debugLog`** (`extensions/security.ts`)
  - Added `import { debugLog } from "../shared/debug"` to enable error logging from the command handler, matching the pattern used by other extensions.

---

## [1.1.4] - 04-12-2026 6:55:41 PM

### Fixed

- **Duplicated thinking level in status bar** (`extensions/status.ts`)
  - The `status-thinking` slot displayed the thinking level (e.g., `medium`, `high`), but the framework already shows this in its built-in footer. Removed the slot and all associated state (`footerThinking`, `pi.getThinkingLevel()` polling).

### Changed

- **Status bar slots use green theme highlighting** (`extensions/status.ts`)
  - All status slots now use `ctx.ui.theme.fg()` for consistent coloring: labels (`CPU`, `RAM`, `Swap`, `Resp`, `CtxMax`, `RespMax`, `SEC`, tool name) rendered with `dim`, values rendered with `success` (green). Generation params remain fully dimmed as secondary info.
  - Theme reference cached at `session_start` via `ctxTheme` to avoid repeated access.

- **RespMax gets its own highlighted slot with k-notation** (`extensions/status.ts`)
  - `max:16384` was previously embedded in the dimmed params string. Extracted into a dedicated `status-resp-max` slot with green highlighting and k-notation formatting (e.g., `16384` → `16k`, `4096` → `4k`), matching the style of `CtxMax`.

- **Native model context shown for remote Ollama** (`extensions/status.ts`)
  - `CtxMax` (native max context from `/api/show`) was previously gated behind `isLocalProvider` and hidden for remote/tunneled Ollama instances. Removed the local-only gate so it displays for any Ollama provider.

- **Status bar labels renamed for clarity** (`extensions/status.ts`)
  - `M:33k` → `CtxMax:33k` (native model context window)
  - `max:16384` → `RespMax:16k` (max response/completion tokens)

- **Pi version displayed in status bar** (`extensions/status.ts`)
  - Added `status-versions` slot showing `pi:{version}` (e.g., `pi:0.66.1`). Pi version fetched once at `session_start` via `execSync("pi -v 2>&1")` (Pi outputs to stderr, not stdout). Slot is dimmed and positioned as the always-last slot in the footer.
  - Moved `system-prompt` slot from `agent_start` into `flushStatus()` so all slots render in a deterministic order. Prompt text is cached in `agent_start` and flushed alongside other metrics, ensuring `status-versions` is always the trailing slot.

---

## [1.1.3] - 04-12-2026 5:55:55PM

### Fixed

- **Status extension overwrites other extensions' footer items** (`extensions/status.ts`)
  - `setFooter()` replaces the entire footer with a single renderer callback, which swallows status items contributed by every other extension. Only the last extension to call `setFooter()` wins — all others are silently discarded.
  - Rewrote from a monolithic `setFooter()` callback with custom `render()` / `truncateLine()` logic to individual `ctx.ui.setStatus(name, value)` calls. Each metric (CPU, RAM, Swap, response time, params, security, tool timing) now gets its own named slot that composes cleanly alongside other extensions' status items.
  - Removed the `tuiRef` reference, `requestRender()` calls, and the entire `render()` / `invalidate()` / `dispose()` footer callback structure.

- **Duplicated status items matching framework defaults** (`extensions/status.ts`)
  - The extension displayed session token counts (`↑1.2k ↓567`), session context usage (`S:2.2%/128k`), Ollama loaded model (`load:model-name`), and the configured model name (`conf:model-id`) in its own status slots — but the framework already renders all of these in its built-in footer. The duplication consumed valuable horizontal space and confused users about which values were authoritative.
  - Removed `status-loaded`, `status-ctx`, and `status-tokens` slots and all code that populated them (`fetchOllamaLoadedModel`, `getOllamaLoadedModel`, `captureUsage`, `fmtTk`, `message_end` / `turn_end` listeners, `ollamaLoadedCache` / `ollamaLoadedLastCheck` / `OLLAMA_LOADED_INTERVAL` state, `lastUpstream` / `lastDownstream` tracking, `getContextUsage()` polling, `footerCtxPct` state).
  - Removed the `exec` import from `node:child_process` (only used for the git branch cache) and the `gitBranchCache` variable.

- **Build artifact `.js` files tracked in git** (`npm-packages/`)
  - All 12 compiled `.js` files in `npm-packages/` (`api/api.js`, `diag/diag.js`, `model-test/model-test.js`, `ollama-sync/ollama-sync.js`, `openrouter-sync/openrouter-sync.js`, `react-fallback/react-fallback.js`, `security/security.js`, `shared/format.js`, `shared/ollama.js`, `shared/security.js`, `shared/types.js`, `status/status.js`) were committed to the repository. These are generated at publish time by `scripts/build-packages.sh` (esbuild compiles `extensions/*.ts` → `.build-npm/` → syncs to `npm-packages/`). Tracking them in git created merge conflicts and made diffs noisy.
  - Deleted all 12 `.js` files from version control. The build script remains the sole author of these files.

### Changed

- **Status bar uses composable named slots** (`extensions/status.ts`)
  - Every metric is now written via `ctx.ui.setStatus("slot-name", value)` instead of a single `setFooter()` callback. This allows other extensions to add their own status items without being overwritten.
  - On `session_shutdown`, all slots are cleared by setting each to `undefined`: `status-cpu`, `status-ram`, `status-swap`, `status-native-ctx`, `status-thinking`, `status-resp`, `status-params`, `status-sec`, `status-tool`, `system-prompt`.

- **Fast 1s tool timer interval** (`extensions/status.ts`)
  - Tool execution timing previously relied on the main 5-second metrics interval, making the live timer coarse and visually jarring (jumps of 5 seconds).
  - Added a dedicated `TOOL_TIMER_INTERVAL_MS = 1000` sub-interval that starts when a tool begins executing (`tool_execution_start`) and stops when it finishes (`tool_execution_end`). The regular 5-second interval continues running for all other metrics.

- **System prompt size displayed in status bar** (`extensions/status.ts`)
  - On `agent_start`, calls `ctx.getSystemPrompt()` to measure the effective system prompt and displays `Prompt: {chars} chr {tokens} tok` in a `system-prompt` status slot. Uses `theme.fg("dim", "Prompt:")` for the label and `theme.fg("success", ...)` for the values to match the green color scheme used by the rest of the status bar.
  - This absorbs functionality from a separate example extension, reducing the total extension count.

---

## [1.1.2] - 04-12-2026 1:40:11 PM

### Fixed

- **F32/TF32 formats not recognized in `bitsPerParamForQuant()`** (`shared/format.ts`)
  - `F32` and `TF32` quantization levels fell through to the 5-bit conservative fallback instead of returning 32 bits, wildly underestimating memory for full-precision models (e.g., a 7B F32 model estimated at ~450MB instead of the correct ~3.1GB).
  - Added `F32` and `TF32` as explicit matches returning 32 bits. Only `FP32` was handled previously.

- **Redundant exact-equality checks in `bitsPerParamForQuant()`** (`shared/format.ts`)
  - `q === "FP32"` was checked alongside `q.startsWith("FP32")` — the exact match is always true when the prefix match succeeds, making it dead code. Same for `F16` vs `F16.startsWith`.
  - Removed the redundant `|| q === "FP32"` and `|| q === "F16"` conditions.

- **CPU memory estimate wildly inaccurate on Colab** (`shared/format.ts`)
  - `estimateVram()` used a flat 10% overhead multiplier calibrated for GPU VRAM, producing estimates 2-3× too low for CPU inference where KV cache dominates memory usage. On real Colab hardware, nemotron 4B Q4 was estimated at ~2.7GB but actually used ~6.3GB.
  - Replaced with `estimateMemory()` returning dual `{ gpu, cpu }` estimates. GPU uses 10% overhead; CPU uses a context-aware formula `1.5 + (contextLength / 100_000)` calibrated against real Colab observations (nemotron 4B Q4 at 131k ctx → 2.82×, matching observed 2.8×). Without context length, falls back to flat 2.5×.

- **Stale 1.1.1 version references in README.md** (`README.md`)
  - Version badge, pin-to-tag example, package format version snippet, and sample output all still showed `1.1.1` after bumping to `1.1.2-dev`. Updated all four references.

- **Incorrect TTL cache documentation** (`CHANGELOG.md`, `brief.md`)
  - Changelog and brief both documented the `readModelsJson()`/`getOllamaBaseUrl()` cache as "5-second TTL" but the actual `CACHE_TTL_MS` constant is `2000` (2 seconds). Fixed in 4 locations across both files.

- **Misleading `sanitizeForReport()` file reference in changelog** (`CHANGELOG.md`, `brief.md`)
  - The 1.1.0 changelog entry referenced `sanitizeForReport()` as being in `shared/security.ts` but it lives in `shared/format.ts`. Corrected the file path and updated the brief.md note accordingly.

- **Phantom `invalidateOllamaCache()` reference in changelog** (`CHANGELOG.md`)
  - The 1.1.0 changelog stated cache could be "manually invalidated via `invalidateOllamaCache()`" but this function does not exist in the codebase. Cache is only invalidated by TTL expiry or by `writeModelsJson()`. Corrected the description.

- **Redundant fallback in `detectProvider()`** (`shared/ollama.ts`)
  - The user-defined provider path read `apiMode` from `userProviderCfg.api`, then fell back to `userProviderCfg.api || "openai-completions"` — accessing the same property twice with the same result. Removed the redundant fallback.

### Changed

- **`estimateVram()` → `estimateMemory()` with dual GPU/CPU output** (`shared/format.ts`)
  - Function renamed to reflect that it now estimates memory for both inference targets. Returns `{ gpu: number; cpu: number }` instead of a single `number`. CPU estimate is context-aware (see Fixed section above).
  - GPU estimate remains the same (base model size × 1.1).

- **`PiModelEntry.estimatedSize` type updated** (`shared/ollama.ts`)
  - Changed from `number` to `{ gpu: number; cpu: number }` to match the new `estimateMemory()` return type.

- **Ollama sync report shows dual memory estimates** (`extensions/ollama-sync.ts`)
  - Per-model display changed from `VRAM: ~281.2MB` to `GPU: ~281.2MB · CPU: ~467.3MB`. Both slash command and tool output updated.
  - `buildModelEntry()` now passes `contextLength` to `estimateMemory()` for accurate CPU estimates.

- **Documentation corrections** (`CHANGELOG.md`, `brief.md`, `README.md`)
  - README.md: 4 stale version references updated to 1.1.2.
  - CHANGELOG.md: `sanitizeForReport()` file path corrected; TTL cache from "5s" to "2s"; phantom `invalidateOllamaCache()` reference corrected.
  - brief.md: TTL cache docs corrected (5s → 2s); `sanitizeForReport` note updated to reflect changelog fix.

### Added

- **Shared source drift between `shared/` and `npm-packages/shared/`** (`npm-packages/shared/`)
  - Four stale TypeScript source files (`format.ts`, `ollama.ts`, `security.ts`, `types.ts`) existed in `npm-packages/shared/` as manual copies that were never updated by the build pipeline. They had drifted significantly from the canonical `shared/*.ts` sources — missing `estimateVram()`, wrong `EXTENSION_VERSION`, phantom error classes, a stale barrel `package.json` with `"main": "index.js"` pointing to a nonexistent file, and stricter HTML detection that had since been tightened.
  - Deleted all four `.ts` files from `npm-packages/shared/`. The build pipeline (`build-packages.sh`) compiles from `shared/*.ts` and syncs compiled `.js` output to `npm-packages/` — the `.ts` copies served no purpose at build time and created a false impression of being the published source.

- **`sync_to_pkg_dir()` did not sync shared `package.json`** (`scripts/build-packages.sh`)
  - The build script copied shared `.js` files and extension `package.json` files into `npm-packages/`, but skipped the shared `package.json`. This meant the version in `npm-packages/shared/package.json` stayed at the old value after a version bump, while extension packages correctly referenced the new version as a dependency.
  - Added `cp "$BUILD_DIR/shared/package.json" "$NPM_PKG_DIR/shared/"` to the sync step so the shared version stays consistent with the rest of the build output.

### Added

- **Build preflight guard** (`scripts/build-packages.sh`)
  - New `preflight()` function runs before every build with two checks:
    1. **esbuild availability** — verifies `npx --no esbuild --version` succeeds, failing with a clear message if `npm install` hasn't been run.
    2. **Drift detection** — scans `npm-packages/shared/` for `.ts` files and exits with code 1 if any are found, listing the offending files and explaining why they're a problem. This prevents the drift class of bugs from recurring silently.

- **npm pack tarball output** (`scripts/build-packages.sh`)
  - New `pack_tarballs()` step runs after `sync_to_pkg_dir()` for full and single-extension builds. Uses `npm pack` inside each `.build-npm/<name>/` directory to create installable `.tgz` tarballs, collected into `dist/`.
  - Enables offline testing of individual packages without publishing to npm: `pi install npm:/path/to/dist/<pkg>.tgz`.
  - Skipped for `./scripts/build-packages.sh shared` (shared alone has no extensions to pack).

- **`dist/` to `.gitignore`** (`.gitignore`)
  - Build-generated tarball directory excluded from version control.

- **Pre-publish testing workflow documentation** (`scripts/build-packages.sh`)
  - Comment block at the top of the build script outlining the full pre-publish flow: build, publish shared prerelease, install tarball, symlink for Pi discovery, test.

### Changed

- **esbuild pinned as devDependency** (`package.json`, `package-lock.json`)
  - esbuild was not declared in `package.json`. The build scripts relied on `npx esbuild` resolving it implicitly from npm's cache, which picks whatever `latest` resolves to at invocation time — causing silent version drift and offline build failures.
  - Added `"esbuild": "^0.28.0"` to `devDependencies` with a `package-lock.json` pinning esbuild to exactly `0.28.0`. Build now uses the declared dependency instead of an implicit download.

- **Version bumped to 1.1.2-dev** (all version touchpoints)
  - `shared/ollama.ts` (`EXTENSION_VERSION`), `scripts/build-packages.sh`, `scripts/publish-packages.sh`, and root `package.json` all updated to `1.1.2-dev`.
  - GitHub now tracks one version ahead of the latest npm release (`1.1.1`). The `-dev` suffix is dropped in these four locations before publishing the next stable release.

---

## [1.1.1] - 04-12-2026 11:42:17 AM

### Fixed

- **Shell injection via `pi.exec("curl")` in model-test.ts** (`extensions/model-test.ts`)
  - All 5 curl subprocess calls (in `ollamaChat()`, `testToolUsage()`, `testToolUsageProvider()`, `testReActOutput()`, and `getOllamaModels()`) passed user-controlled data — model names, message content, and base URLs — through shell argument interpolation via `pi.exec("curl", [...])`. Any value containing shell metacharacters could inject arbitrary commands.
  - Replaced all 5 call sites with native `fetch()` + `AbortController`. Error handling updated to use `AbortError` for timeouts, standard `fetch` error messages for connection failures, and `res.ok` / `res.status` for HTTP-level errors instead of curl exit codes.
  - Removed curl-specific CONFIG constants: `EXEC_BUFFER_MS`, `TOOL_TEST_MAX_TIME_S`, `TOOL_SUPPORT_MAX_TIME_S`, `TAGS_CONNECT_TIMEOUT_S`. Removed stale JSDoc `@property` tags for the deleted constants.

- **SSRF blocklist — incomplete 127.0.0.0/8 coverage** (`shared/security.ts`, `npm-packages/shared/security.ts`)
  - The blocklist matched `127.0.0.1` as an exact string, allowing `127.0.0.2` through `127.255.255.255` to bypass the SSRF filter. The entire `127.0.0.0/8` range is reserved for loopback and should be blocked.
  - Replaced the exact `"127.0.0.1"` match with `"127."` prefix match to cover the full loopback range.
  - Added `::ffff:0.0.0.0` (IPv4-mapped IPv6 zero address) to the blocklist, complementing the `::ffff:127.0.0.1` entry added in 1.1.0.

- **Symlink bypass in `validatePath()`** (`shared/security.ts`, `npm-packages/shared/security.ts`)
  - `path.resolve()` normalizes `..` and absolute paths but does not follow symlinks. A crafted symlink such as `/tmp/evil → /etc/passwd` would pass validation because the resolved path `/tmp/evil` doesn't trigger any blocked-directory rules, but the actual file on disk is `/etc/passwd`.
  - Added `fs.realpathSync()` after `path.resolve()` to dereference symlinks before performing directory-block and traversal checks. Wrapped in a try/catch so non-existent paths (e.g., files about to be created) still validate normally.

- **`catch(e: any)` type safety in `isSafeUrl()`** (`shared/security.ts`, `npm-packages/shared/security.ts`)
  - The URL parse catch block used `e: any` and accessed `e.message` without type checking, suppressing TypeScript errors but masking bugs if a non-Error value was thrown.
  - Changed to `catch(e: unknown)` with `e instanceof Error` guard and `String(e)` fallback.

### Changed

- **Scoring logic deduplicated in model-test.ts** (`extensions/model-test.ts`)
  - Four scoring functions — `scoreReasoning()`, `scoreNativeToolCall()`, `scoreTextToolCall()`, and `parseTextToolCall()` — were duplicated verbatim across `testReasoning()`, `testReasoningProvider()`, `testToolUsage()`, `testToolUsageProvider()`, and `testReActOutput()`. Over 120 lines of identical logic were scattered across 5 test functions.
  - Extracted into 4 shared helper functions at module scope. All test functions now delegate to the shared versions, reducing the file by ~100 lines and ensuring scoring consistency.

- **Dynamic Ollama base URL in model-test.ts** (`extensions/model-test.ts`)
  - The Ollama base URL was resolved once at module load into `const OLLAMA_BASE = getOllamaBaseUrl()` and reused for the entire session. After running `/ollama-sync` to point Ollama at a different host or tunnel URL, model-test would continue using the stale URL until the agent was restarted.
  - Replaced the static constant with `ollamaBase()` — a function wrapper that calls `getOllamaBaseUrl()` on every invocation, picking up config changes immediately without a restart.

- **`args` typed as `Record<string, unknown>` instead of `any`** (`extensions/model-test.ts`)
  - Tool call argument objects in `testToolUsage()` and `testToolUsageProvider()` were typed as `let args: any = {}`, bypassing the type checker on all subsequent property access.
  - Changed to `let args: Record<string, unknown> = {}` for type-safe property access with explicit type narrowing where needed.

- **Removed stale `shared/index.js` barrel files** (`shared/index.js`, `npm-packages/shared/index.js`)
  - Two CJS/ESM hybrid barrel files existed as leftover build artifacts. They mixed `require()` calls with `export` statements, making them invalid in both module systems. No extension or import path referenced them, and the current build pipeline (`build-packages.sh`) does not generate them.
  - Deleted both files to eliminate confusion about which entry point to use.

- **Build script help text** (`scripts/build-packages.sh`)
  - Added `openrouter-sync` to the usage/argument list output, which was missing from the package enumeration.

- **Removed dead barrel export from shared package.json** (`npm-packages/shared/package.json`)
  - The `"."` export in the `exports` map pointed to `"./index.js"` — a barrel file that does not exist. No extension or import path references the barrel; all consumers use subpath imports (`@vtstech/pi-shared/format`, `@vtstech/pi-shared/ollama`, etc.).
  - Removed the `"."` entry from the `exports` map. This also eliminates the confusing `"main": "index.js"` fallback that some Node.js resolution strategies would follow, which would also point to a nonexistent file.

- **Documentation updates** (all READMEs)
  - Root README: version badges and examples updated to 1.1.1; SSRF pattern count corrected from 28 to 29 (added `::ffff:0.0.0.0`); added symlink dereference to path validation description; added multi-dialect ReAct support and `/react-mode` toggle; removed stale HTML sanitization bullet (feature was removed); added native `fetch()` and dynamic Ollama URL mentions to model-test.
  - `npm-packages/security/README.md`: SSRF pattern count corrected from 27 to 29; added `127.0.0.0/8` range, IPv4-mapped IPv6, symlink dereference, and `AUDIT_LOG_PATH` export mentions.
  - `npm-packages/react-fallback/README.md`: added multi-dialect support (4 dialects), `/react-mode` config toggle, and disabled-by-default mention.
  - `npm-packages/model-test/README.md`: added native `fetch()` communication, dynamic Ollama URL resolution, and stack-based JSON repair mentions.
  - `npm-packages/shared/README.md`: updated module descriptions to reflect TTL cache, provider detection, symlink dereference, blocklist/SSRF counts, and removed stale "Custom error classes" from types module (removed in 1.1.0).
  - `npm-packages/status/README.md`: fixed status bar example to match the current 2-line layout (Line 1: conf, Line 2: load).
  - `npm-packages/ollama-sync/README.md`: added `qwen3` to the reasoning-capable models list.

- **npm package sources synced with shared modules** (`npm-packages/shared/`)
  - `npm-packages/shared/ollama.ts` was behind the canonical `shared/ollama.ts` — missing the TTL-based `readModelsJson()`/`getOllamaBaseUrl()` cache, cache invalidation in `writeModelsJson()`, `fetchModelContextLength()`, `fetchContextLengthsBatched()`, `BUILTIN_PROVIDERS` registry, `ProviderInfo`/`detectProvider()`, `EXTENSION_VERSION`, and updated `isReasoningModel()` patterns.
  - `npm-packages/shared/security.ts` was behind the canonical `shared/security.ts` — missing the `127.` blocklist fix, `::ffff:0.0.0.0` entry, symlink resolution in `validatePath()`, `catch(e: unknown)` fix, and exported `AUDIT_LOG_PATH`.
  - Both files updated to mirror their `shared/` counterparts so npm-published packages include the latest security and feature fixes.

---

## [1.1.0] - 04-12-2026 12:03:10 AM

### Fixed

- **SEC counter always showing zero** (`extensions/status.ts`)
  - `refreshBlockedCount()` checked for `entry.action === "block"` but the security audit log writes `"blocked"`. The case mismatch meant the blocked-count in the status bar never incremented.
  - Corrected the comparison string so the SEC indicator now accurately reflects the number of blocked tool calls from the audit log.

- **Runtime crash — undefined `modelsJsonPath` in diag.ts** (`extensions/diag.ts`)
  - Referenced a local variable `modelsJsonPath` that didn't exist — should have been the `MODELS_JSON_PATH` constant. This would crash the diagnostic report generation at runtime.
  - Corrected to use the constant defined at the top of the file.

- **Shell injection via interpolated curl command** (`extensions/status.ts`)
  - `getOllamaLoadedModel()` used `execSync(\`curl -s "${ollamaBase}/api/ps"\`)` with string interpolation — the base URL from `models.json` or `OLLAMA_HOST` could contain shell metacharacters.
  - Replaced with native `fetch()` + `AbortSignal.timeout(5000)`. The `execSync` import was renamed to `gitExecSync` to clarify it's only used for git commands (trusted input).

- **Theme crash — unknown color "red"** (`extensions/status.ts`)
  - `theme.fg("red", ...)` is not a valid Pi TUI color name. The Matrix theme (and other themes) define `"error"` for red tones but not `"red"` itself. This path was never exercised until the SEC counter fix caused `red()` to actually be called.
  - Changed to `theme.fg("error", ...)` which resolves to `#ff3333` in the Matrix theme and the default red in standard themes.

- **`self_diagnostic` tool had no parameter schema** (`extensions/diag.ts`)
  - The tool registration used `parameters: {} as any`, which bypasses the type checker but produces an invalid JSON Schema that confuses API clients and tool enumeration.
  - Replaced with a proper `{ type: "object", properties: {} }` schema, consistent with every other tool in the project.

- **Dead code — unused variables in model-test.ts** (`extensions/model-test.ts`)
  - Removed `hasPong` variable (assigned but never read in `testConnectivity()`).
  - Removed `usedThinkingFallback` variable (assigned but never read in test functions).
  - Removed `content` variable in `testConnectivity()` that captured the ping response body but was never used.
  - Fixed shadowed `start` variable — a `const start = performance.now()` in the catch block of `testConnectivity()` shadowed the outer scope's `start` used for timing.

- **Misleading CONFIG comments** (`extensions/model-test.ts`)
  - Eight JSDoc-style `@type {number}` annotations on `CONFIG` constants described the wrong variables (e.g., the comment for `PROVIDER_TIMEOUT_MS` described `CHAT_TIMEOUT_MS`). Updated all eight to accurately describe their respective constants.

- **Stale/truncated type definitions** (`shared/types.ts`)
  - Removed `ApiMode = "openre"` (truncated string, not a valid API mode).
  - Removed `BackendType` interface (defined but never imported or referenced anywhere in the codebase).
  - Removed five unused error classes (~110 lines): `OllamaConnectionError`, `ModelTimeoutError`, `EmptyResponseError`, `SecurityBlockError`, `ToolParseError` — defined with full constructor chains but never thrown or caught anywhere.

- **`isReasoningModel()` false positives** (`shared/ollama.ts`)
  - The check `lower.includes("think")` matched model names like "nethinker" or "thinkpad" that aren't reasoning models.
  - Narrowed to match only `"reasoning"`, `"thinker"`, `"thinking"` (with word-boundary logic) and the existing full-name matches.

- **JSON brace repair didn't handle nesting** (`extensions/model-test.ts`)
  - The repair function counted opening and closing braces globally, which fails when models emit nested JSON objects (e.g., `{"outer": {"inner": "val"}}`). Missing a brace in a nested context would produce invalid JSON that still passed the repair check.
  - Replaced with a stack-based nesting-aware parser that tracks brace depth and appends the correct closing braces at the right nesting level.

- **Stale npm package versions** (`npm-packages/*/package.json`)
  - All 9 npm package manifests were stuck at `1.0.3` while the root `package.json` was at `1.0.9`. Updated all to `1.0.9` and aligned the `@vtstech/pi-shared` dependency version.

### Changed

- **Deduplicated `detectProvider()` into shared module** (`shared/ollama.ts`, `extensions/model-test.ts`, `extensions/diag.ts`)
  - `detectProvider()` and the `ProviderInfo` interface were duplicated verbatim across `model-test.ts` and `diag.ts`.
  - Moved to `shared/ollama.ts` as the single canonical source. Both extensions now import from the shared module.

- **Deduplicated `fetchModelContextLength()` into shared module** (`shared/ollama.ts`, `extensions/status.ts`)
  - `status.ts` contained a 20-line inline copy of the same Ollama `/api/show` context-length fetcher that already existed in `shared/ollama.ts`.
  - Replaced with a shared import, cutting redundant code and ensuring the logic stays in sync.

- **Tool support cache now avoids full JSON re-read on every lookup** (`extensions/model-test.ts`)
  - `getToolSupportFromCache()` read and parsed the entire `tool_support.json` file on every call. During a model test run this could happen dozens of times for the same model.
  - Added an in-memory cache that reads the file once per test session, with a `clearToolSupportCache()` function called between test runs.

- **TTL-based in-memory cache for Ollama helpers** (`shared/ollama.ts`)
  - `readModelsJson()` and `getOllamaBaseUrl()` hit the filesystem on every call. Multiple extensions call these repeatedly within the same 3-second metrics cycle.
  - Added a 2-second TTL in-memory cache for both functions. The cache is invalidated automatically on expiry or by writing to `models.json` via `writeModelsJson()`.

- **Centralized version string** (all extensions)
  - Version `"1.0.9"` was hardcoded as a string literal in 10+ locations across every extension file. Changing the version required editing each file individually.
  - Replaced all hardcoded version strings with `EXTENSION_VERSION` exported from `shared/ollama.ts`. A single constant change now updates all extensions.

- **Session-scoped SEC counter** (`extensions/status.ts`)
  - The SEC (security) counter in the status bar previously read from the persistent audit log on every 3-second metrics cycle. This caused unnecessary filesystem I/O and mixed session-scoped display with persistent log data.
  - Replaced with an in-memory counter that tracks blocked tool calls within the current session only. The counter resets to 0 on `session_shutdown`.
  - Removed the `readRecentAuditEntries` import and unused `fs`/`path` imports from `status.ts`.

- **Build scripts version bump** (`scripts/build-packages.sh`, `scripts/publish-packages.sh`)
  - Both build and publish scripts were still hardcoded to version `1.0.9`, inconsistent with the root package version of `1.1.0`.
  - Updated both scripts to reference `1.1.0`.

- **`api.ts` conflicting completion handlers** (`extensions/api.ts`)
  - Two separate `registerCompletion` handlers were registered for the `/api` command — the second silently overwrote the first, making the original handler unreachable dead code.
  - Merged into a single handler that covers all sub-commands.

- **`status.ts` raw filesystem reads** (`extensions/status.ts`)
  - `status.ts` still had a raw `fs.readFileSync()` call for `models.json` despite the shared `readModelsJson()` utility existing with a 2-second TTL cache.
  - Replaced with `readModelsJson()` to benefit from caching and reduce filesystem I/O.

- **`model-test.ts` updateModelsJsonReasoning uses raw fs** (`extensions/model-test.ts`)
  - `updateModelsJsonReasoning()` opened and parsed `models.json` with raw `fs.readFileSync` + `JSON.parse`, bypassing the shared utility that handles errors gracefully.
  - Replaced with `readModelsJson()` and `writeModelsJson()` from `shared/ollama.ts`.

- **`pct()` returns NaN% when total is 0** (`shared/format.ts`)
  - `pct(0, 0)` divided by zero producing `NaN%`, which would render as a broken string in the status bar.
  - Returns `"0.0%"` when total is 0, matching the expected display for zero usage.

- **`fmtBytes(0)` returns "0K"** (`shared/format.ts`)
  - `fmtBytes(0)` fell through to the kilobyte branch and returned `"0K"` instead of the more natural `"0B"`.
  - Added an early return for `bytes === 0` to output `"0B"`.

- **SSRF blocklist missing IPv4-mapped IPv6** (`shared/security.ts`)
  - `::ffff:127.0.0.1` (IPv4-mapped IPv6 loopback) was not in the SSRF hostname blocklist. Some systems resolve loopback addresses in this form.
  - Added `::ffff:127.0.0.1` to the blocked hostname patterns.

- **`AUDIT_LOG_PATH` not exported** (`shared/security.ts`, `extensions/diag.ts`)
  - `AUDIT_LOG_PATH` was defined in `security.ts` but not exported, forcing `diag.ts` to hardcode the path string independently.
  - Exported `AUDIT_LOG_PATH` from `security.ts`; `diag.ts` now imports it.

- **Stricter HTML detection in `sanitizeForReport()`** (`shared/format.ts`)
  - The HTML sanitization regex could match normal text containing angle brackets followed by common letters (e.g., `"items< 5"`), producing false positives.
  - Tightened the pattern to require a closing angle bracket or specific HTML tag characters to qualify as HTML.

- **`react-fallback.ts` null assertion** (`extensions/react-fallback.ts`)
  - A `!` non-null assertion on a potentially-undefined value bypassed the type checker without a runtime guard.
  - Replaced with an explicit null check + early return.

- **OpenRouter URL parsing strips query parameters** (`extensions/openrouter-sync.ts`)
  - Parsing `https://openrouter.ai/model/name:free?ref=pi` would include `?ref=pi` in the extracted model ID, creating a broken entry in `models.json`.
  - URL parsing now strips query parameters and fragments before extracting the model name.

- **`ensureProviderOrder` for newly-created openrouter** (`extensions/openrouter-sync.ts`)
  - When `openrouter-sync` created a new `openrouter` provider entry, `ensureProviderOrder()` didn't handle the case where the provider didn't yet exist in the providers list.
  - Added handling for the newly-created provider case so it gets positioned correctly above `ollama`.

- **Removed unused type imports** (`shared/types.ts`)
  - `StepResultType` and `ErrorRecoveryState` were defined in `types.ts` but never imported or referenced anywhere in the codebase.
  - Removed both to reduce dead code (~31 lines).

- **`bytesHuman()` mutates its parameter** (`shared/format.ts`)
  - `bytesHuman()` sorted an array in-place via `.sort()`, mutating the caller's array.
  - Added `[...array]` spread to sort a copy instead.

- **Explicit `ProviderInfo` type import** (`extensions/model-test.ts`)
  - `ProviderInfo` was used as a type annotation but relied on implicit type resolution from `shared/ollama.ts` without an explicit import.
  - Added a named import for clarity and IDE support.

---

## [1.0.9] - 04-11-2026 7:11:30PM

### Added

- **Multi-dialect ReAct parser** (`extensions/react-fallback.ts`)
  - `ReactDialect` interface and `REACT_DIALECTS` registry supporting 4 dialects: classic ReAct (`Action:`), Function (`Function:`), Tool (`Tool:`), and Call (`Call:`).
  - `buildDialectPatterns()` dynamically constructs regex patterns (primary, same-line, loose, parenthetical, thought, final answer) for each dialect from its tag definitions.
  - `ALL_DIALECT_PATTERNS` pre-built at module load for zero-overhead runtime dispatch.
  - `parseReactWithPatterns()` — core per-dialect parser with optional `tightLoose` mode that rejects natural-language false positives (used by model-test for validated scoring).
  - `detectReactDialect()` — exported utility that identifies which dialect tag is present in text without attempting a full parse.
  - `ParsedToolCall` interface extended with `dialect?: string` field to report which dialect matched.
  - Shared parser exposed via `pi._reactParser` with new exports: `parseReactWithPatterns`, `detectReactDialect`, `REACT_DIALECTS`, `ALL_DIALECT_PATTERNS`.
  - `/react-test` debug output now displays detected dialect name (e.g., `dialect: function`) and shows available dialect info when a non-classic dialect is detected.

- **Multi-dialect ReAct detection in model tests** (`extensions/model-test.ts`)
  - `testReactParsing()` refactored to use the shared multi-dialect parser from react-fallback via `pi._reactParser`, with a local inline fallback if the shared parser is unavailable.
  - `testReActOutput()` (tool support probing) now checks all 4 dialect patterns — classic ReAct, Function, Tool, and Call — instead of only classic `Action:` tags. Matched patterns are collected and the dialect name is included in the evidence string.
  - Benchmark report output displays dialect tag for non-classic dialects (e.g., `[function dialect]`) alongside score and tool call info.
  - Alternative tag detection expanded: FAIL cases now check for `<function_call`, `<invoke`, and other XML-style tool-call tags that indicate a model attempted structured output in a format the parser doesn't support.
  - `dialect` field added to `testReactParsing()` return type for downstream reporting.

- **nemotron-3-nano:4b benchmark result** (`TESTS.md`)
  - New top-scoring result: 6/6 pass (STRONG tools, STRONG ReAct, STRONG instructions, NATIVE tool support) on AMD Ryzen 5 2400G via Ollama.

### Fixed

- **Template literal escape sequences in dialect pattern builder** (`extensions/react-fallback.ts`)
  - `buildDialectPatterns()` used single-escaped metacharacters (`\s`, `\n`, `\(`, `\)`) inside template literals passed to `RegExp()`. JavaScript template literals silently drop unrecognized escape sequences — `\s` becomes the literal string `"s"`, `\n` becomes a newline — causing all dynamically-built patterns to match incorrectly.
  - Doubled all regex metacharacter escapes to `\\s`, `\\n`, `\\(`, `\\)`, `\\w`, `\\S`, etc. so the escaped characters survive template literal processing and produce valid regex patterns.

- **Lookahead closure in model-test inline fallback** (`extensions/model-test.ts`)
  - Local inline multi-dialect regex patterns (used when the shared parser is unavailable) had `$` inside the `(?:…)` non-capturing group instead of outside it, causing the lookahead to never match end-of-string.
  - Moved `$` outside the `(?:…)` group and added `${dd.action}` to the stop-tag alternatives so multi-line action blocks terminate correctly for non-classic dialects.

- **Missing final newlines** (`extensions/react-fallback.ts`, `extensions/model-test.ts`)
  - Both files lacked a trailing newline (POSIX violation), causing `\ No newline at end of file` markers in every git diff and potential issues with tools that append to files.

- **Untyped JSON.parse of Ollama `/api/ps` response** (`extensions/status.ts`)
  - `getOllamaLoadedModel()` called `JSON.parse()` on raw curl output without a try/catch. Malformed or empty responses (e.g., Ollama mid-restart) would throw and crash the entire 3-second metrics cycle, freezing the status bar.
  - Wrapped in a dedicated try/catch so parse failures fall through to the empty-cache path gracefully.

- **Token counts not displayed in footer for Ollama models** (`extensions/status.ts`)
  - Token usage was captured correctly from Pi's normalized `message_end` event, but the footer only re-rendered on the 3-second interval — values could appear stale or be missed between cycles.
  - Added `requestRender()` call inside `captureUsage()` so the footer updates immediately when token data arrives from any provider.

### Changed

- **Diagnostics uses shared `readModelsJson()`** (`extensions/diag.ts`)
  - Replaced manual `fs.existsSync` + `JSON.parse(fs.readFileSync(...))` with `readModelsJson()` from `shared/ollama`, matching the pattern used by every other extension.
  - Removed redundant `agentDir` and `modelsJsonPath` variables (already encapsulated in the shared utility).

- **`security_audit` tool parameter shape** (`extensions/security.ts`)
  - Replaced `parameters: {} as any` with a proper `{ type: "object", properties: {} }` JSON Schema shape, consistent with all other tool registrations in the project.

---

## [1.0.8] - 04-11-2026 11:12:22 AM

### Fixed

- **ReAct mode disabled by default with persistent config toggle** (`extensions/react-fallback.ts`)
  - The `tool_call` bridge tool was always registered regardless of ReAct mode state, causing small models (e.g., `granite4:350m`) to see it in their tool list, attempt malformed calls, and fail validation.
  - Bridge tool registration is now conditional — only registers when ReAct mode is enabled.
  - Config persisted to `~/.pi/agent/react-mode.json` (`{"enabled": true|false}`), read on startup, written on toggle.
  - `/react-mode` command now persists the toggle state across restarts and prompts the user to run `/reload` to apply tool registration changes.
  - Default state is **disabled** — models only see `tool_call` when explicitly opted in.

- **Spurious Ollama calls on first metrics cycle for cloud providers** (`extensions/status.ts`)
  - `updateMetrics()` checked `isLocalProvider` after already entering the `if (currentCtx)` block, meaning the first cycle for cloud providers could still trigger a `/api/show` call to Ollama (which would fail or hang for remote-only setups).
  - Moved `isLocalProvider = detectLocalProvider(modelsJson)` before the `if (currentCtx)` gate so local-only logic is skipped immediately for cloud providers.

- **Shell injection surface in native context length fetcher** (`extensions/status.ts`)
  - `getNativeModelCtx()` used `execSync("curl ...")` to query Ollama's `/api/show` endpoint, passing the base URL as a string interpolation — a shell injection vector if the URL contained special characters.
  - Replaced with native `fetch()` + `AbortSignal.timeout(5000)`, matching the pattern used elsewhere in the codebase.
  - Added a `nativeCtxPromise` guard variable to prevent concurrent requests when the 3-second metrics cycle overlaps a pending fetch.

### Added

- **OpenRouter Sync extension** (`extensions/openrouter-sync.ts`)
  - New `/openrouter-sync` command (alias `/or-sync`) adds OpenRouter models to `models.json` from URLs or bare model IDs.
  - Parses full OpenRouter URLs (`https://openrouter.ai/model/name:free`) and bare IDs (`model/name:free`).
  - Creates `openrouter` provider in models.json if missing, inheriting baseUrl/api from the built-in provider registry.
  - Appends models without removing existing entries; reorders providers so openrouter sits above ollama.
  - Registered as both slash command and `openrouter_sync` tool.
  - Published as `@vtstech/pi-openrouter-sync` npm package.

- **Upstream/downstream token display in status bar** (`extensions/status.ts`)
  - Footer line 2 now shows per-LLM-call token counts as `↑1.2k ↓567` (dimmed), positioned between RAM/Swap and response time.
  - Uses Pi's `message_end` event to capture the normalized `Usage` object (`input` = upstream/prompt tokens, `output` = downstream/completion tokens).
  - Counters reset at the start of each agent cycle and on session shutdown so stale values are never displayed.
  - Includes a `fmtTk()` helper that formats large token counts compactly (e.g., `1234` → `1.2k`).

### Changed

- **Model test branding bumped to v1.0.8** (`extensions/model-test.ts`)
- **ReAct fallback branding bumped to v1.0.8** (`extensions/react-fallback.ts`)

---

## [1.0.8] - 04-10-2026 11:30:00 PM

### Changed

- **Model test output now shows API mode and native context length** (`extensions/model-test.ts`)
  - `testModelOllama()` reads `models.json` to display the active API mode (e.g., `openai-completions`, `openai-responses`) alongside the provider info at the start of the test report.
  - Context length now queries Ollama's `/api/show` endpoint via `fetchModelContextLength()` to display the model's **native max context** (e.g., `32.0k tokens (native max)`) instead of the configured `num-ctx` value. This matches what `ollama-sync` reports and gives a true picture of the model's capabilities.

- **Status bar now shows native model context and session context separately** (`extensions/status.ts`)
  - Footer redesigned as a 2-line layout: **Line 1 (conf)** shows model, pwd, thinking level, CPU%; **Line 2 (load)** shows loaded model, native max context, session context usage, RAM, response time, generation params, and security indicators.
  - Context display split into two fields: `M:32k` (native model max context from Ollama `/api/show`) and `S:2.2%/128k` (session context usage from framework).
  - CPU% appears on Line 1, RAM/Swap on Line 2 — only shown for local/Ollama providers (cloud providers have no `/api/show` endpoint).
  - Native model context is cached per-model to avoid redundant API calls.

---

## [1.0.7] - 04-10-2026 4:00:00 PM

### Fixed

- **WEAK score no longer counts as pass** (`extensions/model-test.ts`)
  - All 6 test return paths previously used `pass: true` regardless of score tier, meaning WEAK results were treated as passing.
  - Changed to `pass: score !== "WEAK"` so only STRONG and MODERATE results count as pass. WEAK results now correctly contribute to the failure count in the summary.

- **ReAct regex false positive prevention** (`extensions/model-test.ts`)
  - Tool usage test ReAct regex patterns could match normal prose containing "Thought:", "Action:", or "Action Input:" keywords that weren't actual tool calls.
  - Added `isToolIdentifier()` and `isKnownTool()` guard functions that validate extracted tool names against the registered tool list before accepting a ReAct match as a legitimate tool call.

- **Tool usage unit validation** (`extensions/model-test.ts`)
  - Temperature conversion tool test now validates that the `unit` parameter is one of the expected values (`celsius` or `fahrenheit`).
  - Models that pass the tool call structure but provide an invalid or missing unit are demoted from STRONG to MODERATE, since the tool was invoked but not used correctly.

- **Cloud provider false local detection in status bar** (`extensions/status.ts`)
  - `detectLocalProvider()` fell through to a fallback that checked if ANY provider in `models.json` had a local URL, regardless of which provider was active. This caused CPU/RAM metrics to display incorrectly when using cloud providers like OpenRouter alongside a local Ollama entry.
  - Rewrote detection to check `currentCtx.provider.baseUrl` first (covers built-in providers configured via `settings.json`), then fall back to models.json model ID matching, then default to `false` (assume cloud).

### Added

- **Cloud model benchmark result** (`TESTS.md`)
  - Added `openai/gpt-oss-20b:free` (OpenRouter) test result: 4/4 pass (MODERATE reasoning, STRONG instructions, STRONG tool usage, 954ms).

---

## [1.0.6] - 04-10-2026 12:48:17 PM

### Added

- **Conditional CPU/RAM display in status bar** (`extensions/status.ts`)
  - `detectLocalProvider()` reads `models.json` to determine if the active provider is local (localhost/127.0.0.1/0.0.0.0) or remote/cloud.
  - CPU%, RAM, and Swap metrics are only shown in the footer when using a local provider — hidden for cloud/remote providers where they're not meaningful.
  - Falls back to `false` (hide metrics) when detection fails, ensuring correct behavior for cloud-only setups.

- **`/api provider` command for managing default providers** (`extensions/api.ts`)
  - `/api provider` — show current default provider, default model, and all configured providers with local/cloud tags.
  - `/api provider set <name>` — set the default provider in `settings.json` and auto-set the default model to the provider's first model.
  - `/api provider change <name>` / `switch <name>` — aliases for `set`.
  - `/api provider list` / `show` — same as bare `/api provider`.
  - `/api provider <name>` — shorthand: typing a provider name directly is treated as `set <name>`.
  - Settings are persisted to `~/.pi/agent/settings.json` (`defaultProvider` and `defaultModel` fields).
  - Tab-completion registered for the `provider` sub-command.

- **Dynamic tab completions for `/api` arguments** (`extensions/api.ts`)
  - `/api provider <TAB>` — shows sub-commands (`set`, `list`, `show`) plus all provider names from `models.json`.
  - `/api provider set <TAB>` — shows only provider names for quick selection.
  - `/api mode <TAB>` — shows all 10 supported API modes with descriptions.
  - `/api think <TAB>` — shows `on`, `off`, `auto` options.

- **Settings helpers** (`extensions/api.ts`)
  - `readSettings()` / `writeSettings()` for reading and writing Pi's `settings.json`.
  - Added `fs`, `path`, and `os` imports for file system access.

### Changed

- **`BUILTIN_PROVIDERS` registry deduplicated** (`shared/ollama.ts`, `extensions/diag.ts`, `extensions/model-test.ts`)
  - The built-in provider lookup table (11 providers) was duplicated in both `diag.ts` and `model-test.ts`.
  - Moved to `shared/ollama.ts` as a single canonical source. Both extensions now import it.
  - Added `envKey` field to each entry (used by `model-test.ts` for API key detection).

- **`status.ts` reduces `models.json` I/O** (`extensions/status.ts`)
  - Previously read and parsed `models.json` twice every 3-second metrics cycle (once for local provider detection, once for context length display).
  - Now reads once per cycle and passes the parsed result to both consumers.

### Fixed

- **Ollama detection missing `0.0.0.0` bind address** (`extensions/model-test.ts`)
  - `detectProvider()` checked `localhost` and `127.0.0.1` but not `0.0.0.0`, causing misclassification for Ollama instances bound to all interfaces.
  - Added `/0\.0\.0\.0:\d+/` to the Ollama detection regex.

---

## [1.0.5] - 04-10-2026 10:43:55 AM

### Added

- **Context length display in ollama-sync** (`shared/ollama.ts`, `extensions/ollama-sync.ts`)
  - `fetchModelContextLength()` queries Ollama's `/api/show` endpoint to retrieve the max context window for each model.
  - `fetchContextLengthsBatched()` processes requests in batches of 3 (configurable) to avoid overwhelming connections — critical for remote Ollama over tunnels.
  - Context length is displayed in the sync report per model (e.g., `Context: 40,960`) and stored in `models.json` as `contextLength`.

- **VRAM estimation in ollama-sync** (`shared/format.ts`, `extensions/ollama-sync.ts`)
  - `estimateVram()` estimates memory usage from `parameterSize` and `quantizationLevel` (e.g., Q4_K_M ≈ 4 bits/param, BF16 = 16 bits/param).
  - Estimated VRAM is shown per model in the sync report (e.g., `VRAM: ~1.4 GB`) and stored as `estimatedSize` in models.json.

- **Install size display in ollama-sync** (`extensions/ollama-sync.ts`)
  - Model file size from `/api/tags` is now shown in the sync report alongside parameter count and quantization level.

- **Context length in diag/status** (`extensions/diag.ts`)
  - The diagnostic report now shows the context length from models.json for the active model, providing a quick reference alongside the context window and max tokens.

### Changed

- **`isReasoningModel()` now detects qwen3** (`shared/ollama.ts`, `extensions/api.ts`)
  - qwen3 supports thinking via `/think` and `/no_think` tags but wasn't detected by the name-based heuristic.
  - Added `qwen3` to the pattern list so all qwen3 models (0.6b, 1.7b, 4b, etc.) are correctly flagged as reasoning-capable.

- **`PiModelEntry` extended with new fields** (`shared/ollama.ts`)
  - `contextLength?: number` — max context window in tokens
  - `estimatedSize?: number` — estimated VRAM usage in bytes

### Fixed

- **Per-package READMEs on npmjs** (prerelease `1.0.4-1`)
  - Each npm package now includes its own `README.md`, bundled at publish time.
  - Build script (`build-packages.sh`) copies per-package READMEs from `npm-packages/*/README.md` into `.build-npm/*/`.

---

## [1.0.4] - 04-09-2026 7:10:26 PM

### Added

- **Individual npm packages** — all extensions are now published separately to npm for selective installation.
  - `@vtstech/pi-shared` — shared utilities (format, ollama, security, types)
  - `@vtstech/pi-api` — API mode switcher
  - `@vtstech/pi-diag` — diagnostics
  - `@vtstech/pi-model-test` — model benchmark
  - `@vtstech/pi-ollama-sync` — Ollama sync
  - `@vtstech/pi-react-fallback` — ReAct fallback
  - `@vtstech/pi-security` — security layer
  - `@vtstech/pi-status` — system monitor / status bar
  - Each extension depends on `@vtstech/pi-shared` to avoid duplicating shared code.

- **Build and publish tooling** (`scripts/`)
  - `build-packages.sh` — compiles TypeScript to ESM via esbuild, rewrites `../shared/*` imports to `@vtstech/pi-shared/*`, outputs to `.build-npm/`.
  - `publish-packages.sh` — publishes all packages to npm in dependency order (shared first) with `--access public` support and `--dry-run` mode.

- **npm-packages/** — per-extension `package.json` manifests with `pi` entry points and `"type": "module"` for ESM.

### Changed

- **npm package format** — compiled output switched from CommonJS (`--format=cjs`) to ESM (`--format=esm`) with `"type": "module"` in package.json to match Pi's extension loading mechanism.

### Fixed

- **npm publish E402 "Payment Required"** — added `--access public` flag to `npm publish` command, since scoped packages (`@vtstech/*`) default to private on npm.

---

## [1.0.3] - 04-09-2026 5:26:15 PM

### Added

- **API Mode Switcher extension** (`extensions/api.ts`)
  - `/api` command for runtime switching of API modes, base URLs, thinking settings, and compat flags in `models.json`.
  - Sub-commands: `mode`, `url`, `think`, `compat`, `reload`, `modes`, `providers`.
  - Supports all 10 Pi API modes: `anthropic-messages`, `openai-completions`, `openai-responses`, `azure-openai-responses`, `openai-codex-responses`, `mistral-conversations`, `google-generative-ai`, `google-gemini-cli`, `google-vertex`, `bedrock-converse-stream`.
  - Compat flag management: `supportsDeveloperRole`, `supportsReasoningEffort`, `maxTokensField`, `requiresToolResultName`, `thinkingFormat`.
  - Thinking mode toggle (`on`/`off`/`auto`) with auto-detection for known reasoning model families.
  - Tab completion for `/api` sub-commands.

### Fixed

- **API Mode Switcher — `ctx is not defined` error** (`extensions/api.ts`)
  - Sub-command handler functions (`setMode`, `setUrl`, `setThink`, `handleCompat`, `reloadConfig`) referenced the `ctx` object from the parent `handler` callback without receiving it as a parameter. All five functions now accept `ctx` as their first argument.

---

## [1.0.2] - 04-09-2026

### Added

- **Built-in provider detection** (`diag.ts`, `model-test.ts`)
  - Added `BUILTIN_PROVIDERS` registry mapping 11 known cloud providers (openrouter, anthropic, google, openai, groq, deepseek, mistral, xai, together, fireworks, cohere) to their API modes, base URLs, and environment variable keys.
  - Three-tier provider detection logic: user-defined (models.json) → built-in registry → unknown fallback. Resolves "API mode: unknown" for built-in providers like OpenRouter.

- **Cloud provider model testing** (`model-test.ts`)
  - `detectProvider()` classifies the active model's provider as `ollama`, `builtin`, or `unknown`.
  - `providerChat()` makes OpenAI-compatible chat completions API calls to cloud providers using native `fetch()`.
  - `testConnectivity()` verifies API reachability and authentication (ping with "Reply: PONG", 30s timeout).
  - `testReasoningProvider()` — cloud-aware snail puzzle reasoning test.
  - `testToolUsageProvider()` — cloud-aware tool usage test using OpenAI function calling format.
  - Provider-aware test runner: cloud providers automatically get the connectivity/reasoning/tool suite instead of Ollama-only tests.
  - `CONFIG.PROVIDER_TIMEOUT_MS` (2 min) and `CONFIG.PROVIDER_TOOL_TIMEOUT_MS` (60s) settings.

- **Tool support cache** (`model-test.ts`)
  - Persistent cache at `~/.pi/agent/cache/tool_support.json` to avoid re-probing models on every run.
  - Cache entries include support level, test timestamp, and model family for validation.

- **Rate limit delay** (`model-test.ts`)
  - `rateLimitDelay()` helper inserts a configurable delay (default 30s) between sequential tests to avoid upstream rate limiting on free-tier API providers.

- **`readModelsJson()` utility** (`shared/ollama.ts`)
  - Convenience function to read and parse Pi's `models.json` with graceful fallback to an empty structure.

### Changed

- **API mode detection** (`diag.ts`)
  - Replaced single-tier provider lookup (models.json only) with three-tier detection.
  - Built-in providers now display as `API mode: openai-completions (built-in: openrouter)` instead of `API mode: unknown — provider 'openrouter' not found in models.json`.
  - Base URLs for built-in providers are now resolved and displayed in the diagnostic output.

- **Instruction following test** (`model-test.ts`)
  - New test for cloud providers: verifies the model responds with valid JSON containing correct values when instructed to output a specific JSON structure.

### Fixed

- **Matrix theme crash — missing color** (`themes/matrix.json`)
  - Added `"yellow": "#eeff00"` to the Matrix theme's color vars. The `status.ts` extension calls `theme.fg("yellow", ...)` for the active tool timer, which threw `Error: Unknown theme color` when running with the Matrix theme.

- **Matrix theme — invisible code block text** (`themes/matrix.json`)
  - Changed `mdCodeBlock` from `"#000000"` (black text on black background) to `"phosphor"` (#66ff33). The schema defines `mdCodeBlock` as the code block **content/text** color, not the background — this was set incorrectly making all fenced code block text invisible.
  - Changed `mdCode` from `"digitGreen"` to `"brightGreen"` (#7fff00) for more vibrant inline code (single backticks).

- **Ollama sync autocomplete crash** (`extensions/ollama-sync.ts`)
  - Added missing `value` property to the `getArgumentCompletions` return object. Pi's `autocomplete.js` calls `item.value.endsWith('"')` on every completion item — omitting `value` caused `TypeError: Cannot read properties of undefined`.

---

## [1.0.1] - 04-08-2026

### Added

- **Security extension** (`extensions/security.ts`)
  - Command blocklist (65 blocked commands) covering system modification, privilege escalation, network attacks, package management, process control, and shell escapes.
  - SSRF protection with 27 blocked hostname patterns (loopback, RFC1918 private ranges, cloud metadata endpoints).
  - Path validation preventing filesystem escape and access to critical system directories.
  - Shell injection detection via regex patterns for command chaining, substitution, and redirection.
  - JSON-lines audit logging at `~/.pi/agent/audit.log`.
  - Tool input security checks for bash, file, and HTTP tools.

- **ReAct fallback extension** (`extensions/react-fallback.ts`)
  - Text-based tool calling parser for models without native function calling support.
  - Parses `Thought:`, `Action:`, `Action Input:` patterns from model output.
  - Multiple regex strategies including parenthetical style and loose matching.
  - Bridge mode that intercepts tool call failures and falls back to ReAct parsing.

- **Shared utilities library** (`shared/`)
  - `format.ts` — Section headers, indicators (ok/fail/warn/info), numeric formatters (bytes, ms, percentages), string utilities (truncate, sanitize, padRight).
  - `ollama.ts` — Ollama base URL resolution (3-tier: models.json → OLLAMA_HOST → localhost), models.json I/O, model family detection, Ollama API helpers, `fetchOllamaModels()`.
  - `security.ts` — Command blocklist, SSRF patterns, path validation, URL validation, command sanitization, audit logging, tool input security checks.
  - `types.ts` — Custom error classes (OllamaConnectionError, ModelTimeoutError, EmptyResponseError, SecurityBlockError, ToolParseError), type definitions (ToolSupportLevel, StepResultType, AuditEntry, etc.).

- **JSDoc documentation**
  - Comprehensive docstrings added to all extensions, shared utilities, and exported functions.

### Changed

- **Project restructuring**
  - Moved extensions from `.pi/agent/extensions/` to top-level `extensions/` directory.
  - Moved themes from `.pi/agent/themes/` to top-level `themes/` directory.
  - Extracted shared code into `shared/` module (format.ts, ollama.ts, security.ts, types.ts).

- **Ollama sync** (`extensions/ollama-sync.ts`)
  - Rewritten with model metadata extraction (parameter size, quantization level, model family).
  - Merge logic preserves user-defined fields when syncing.
  - Per-model metadata table in sync report with diff summary (added/removed).

- **Diagnostics** (`extensions/diag.ts`)
  - Enhanced with security posture checks (audit log status, blocked command count).
  - Extension listing shows registered commands and tools per extension.

- **Model test** (`extensions/model-test.ts`)
  - Thinking model fallback — retries with `think: true` for empty responses.
  - Tool usage test enhanced with multiple tool types.
  - Both `/model-test` slash command and `model_test` tool registration.

- **Status bar** (`extensions/status.ts`)
  - Security flash indicator (3s) for blocked tools + persistent blocked count from audit log.
  - Active tool timing with live elapsed timer on Line 2.

### Infrastructure

- `package.json` configured as a Pi extension package with `pi.extensions` and `pi.themes` entry points.
- MIT license.
- `.gitignore` updated for Node.js project layout.

---

## [1.0.0] - 04-08-2026

### Added

- **Model testing extension** (`extensions/model-test.ts`)
  - Ollama model testing with reasoning (snail puzzle), thinking/reasoning tokens, tool usage, and ReAct parsing tests.
  - Scoring system: STRONG, MODERATE, WEAK, FAIL, ERROR.
  - `/model-test` slash command.

- **Ollama sync extension** (`extensions/ollama-sync.ts`)
  - Synchronization between pulled Ollama models and Pi's `models.json`.
  - `/ollama-sync` slash command with argument autocompletion.

- **Diagnostics extension** (`extensions/diag.ts`)
  - Full system diagnostic: OS, CPU, RAM, disk, Ollama (local/remote), models.json validation.
  - Remote Ollama support via HTTP probing instead of CLI.
  - `/diag` slash command and `self_diagnostic` tool registration.

- **System monitor / status bar** (`extensions/status.ts`)
  - Replaces Pi's default footer with a unified 2-line status bar.
  - Line 1: pwd, git branch, model, thinking level, context usage, CPU/RAM/Swap, Ollama VRAM, response time, generation params.
  - Line 2: Active tool timing with live elapsed timer.
  - 3-second metric refresh cycle with CPU usage tracking.

- **Matrix theme** (`themes/matrix.json`)
  - Green-screen hacker aesthetic with phosphor, glow, and fade green variants.
  - Complete coverage: accent, borders, markdown, syntax highlighting, diff, thinking levels.

- **Initial project structure**
  - Extensions deployed under `.pi/agent/extensions/`.
  - Theme deployed under `.pi/agent/themes/`.
  - README with installation and usage documentation.