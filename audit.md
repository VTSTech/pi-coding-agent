# Improvement & Enhancement Audit

**Pi Coding Agent Extensions v1.1.9**

**Repository:** https://github.com/VTSTech/pi-coding-agent
**Author:** VTSTech (Nigel Todman) | **License:** MIT | **Date:** 2026-04-15
23 Findings | 6 Categories | Security, Robustness, Maintainability, Performance, Architecture, Testing

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Findings Summary](#findings-summary)
- [Detailed Findings](#detailed-findings)
  - [Security](#security)
  - [Robustness](#robustness)
  - [Maintainability](#maintainability)
  - [Performance](#performance)
  - [Architecture](#architecture)
  - [Testing](#testing)
- [Priority Matrix](#priority-matrix)
- [Architecture Strengths](#architecture-strengths)

---

## Executive Summary

This audit covers the Pi Coding Agent Extensions codebase at commit `6e9db45` (v1.1.9), spanning 12,354 lines across 8 extension modules, 11 shared utility modules, 6 test files, and build scripts. The project provides a comprehensive suite of Pi framework extensions including model benchmarking, Ollama and OpenRouter sync, security enforcement, status monitoring, diagnostics, API configuration, and a ReAct text-based tool calling bridge.

The audit identified 23 findings across 6 categories: 4 High severity, 12 Medium severity, and 7 Low severity. The most critical finding is a missing `debugLog` import in `model-test.ts` that causes runtime crashes when debug logging is enabled — a regression likely introduced during v1.1.8's empty catch block fixes. The second most impactful cluster involves `api.ts` bypassing the models.json mutex in 4 places, creating race conditions with other extensions. On the positive side, the codebase demonstrates excellent security engineering (partitioned blocklists, Unicode normalization, DNS rebinding protection, crash-safe audit logging), clean module extraction patterns, and comprehensive test coverage for the security and format modules (111 tests). However, two critical shared modules — `config-io.ts` and `model-test-utils.ts` — have zero test coverage despite containing core infrastructure logic.

---

## Findings Summary

| ID | Severity | Category | Title |
|----|----------|----------|-------|
| SEC-01 | **High** | Security | `sanitizeCommand` logs but doesn't reject Unicode normalization variance |
| SEC-02 | Medium | Security | `sanitizeInputForLog` truncates but doesn't redact API keys |
| SEC-03 | Low | Security | Audit log grows unbounded — no rotation mechanism |
| SEC-04 | Low | Security | `isSafeUrl` prefix matching can false-positive on hostnames like `10.example.com` |
| ROB-01 | **High** | Robustness | Missing `debugLog` import in model-test.ts — ReferenceError when debugging enabled |
| ROB-02 | **High** | Robustness | `api.ts` uses non-atomic `writeModelsJson()` in 4 places — race condition with mutex |
| ROB-03 | Medium | Robustness | `fetchModelContextLength` debug log references undefined `model` variable |
| ROB-04 | Medium | Robustness | `react-fallback.ts` bridge tool has no self-reference guard — infinite loop risk |
| ROB-05 | Medium | Robustness | `status.ts` reads `/proc/meminfo` synchronously every 5 seconds — blocks event loop |
| ROB-06 | Low | Robustness | `bump-version.sh` and `bump-version.ps1` are inconsistent — different file lists |
| MAINT-01 | **High** | Maintainability | Score-reporting pattern duplicated ~12 times in model-test.ts |
| MAINT-02 | Medium | Maintainability | Provider existence check duplicated 4 times in api.ts |
| MAINT-03 | Medium | Maintainability | Duplicated path constants across config-io.ts and security.ts |
| MAINT-04 | Medium | Maintainability | `diag.ts` reads settings.json directly — bypasses config-io.ts abstraction |
| MAINT-05 | Medium | Maintainability | `model-test.ts` imports unused `writeModelsJson` |
| MAINT-06 | Low | Maintainability | `TimeoutError` in errors.ts conflicts with global ES2022 `TimeoutError` |
| MAINT-07 | Low | Maintainability | `config-io.ts` `readJsonConfig` manually checks env var instead of using `debugLog` |
| PERF-01 | Medium | Performance | Audit log `readRecentAuditEntries` reads entire file then slices — O(n) memory |
| ARCH-01 | Medium | Architecture | `model-test.ts` at 1,646 lines — single file with 5+ responsibilities |
| ARCH-02 | Medium | Architecture | `api.ts` `/api show` and `diag.ts` both duplicate local-provider detection |
| ARCH-03 | Low | Architecture | Branding array duplicated identically across all 8 extension files |
| TEST-01 | **High** | Testing | Zero test coverage for `config-io.ts` — atomic I/O untested |
| TEST-02 | **High** | Testing | Zero test coverage for `model-test-utils.ts` — scoring/caching untested |

---

## Detailed Findings

### Security

#### SEC-01: `sanitizeCommand` logs but doesn't reject Unicode normalization variance

| Property | Value |
|----------|-------|
| **Severity** | High |
| **Category** | Security |
| **File(s)** | `shared/security.ts` (lines ~671–673) |

The `sanitizeCommand()` function performs NFKC Unicode normalization before pattern matching to defeat homoglyph bypass attacks (e.g., fullwidth Latin, Cyrillic lookalikes). The JSDoc comment explicitly states: "Reject if normalization changed the command — indicates obfuscation attempt." However, the actual code only logs a `debugLog` warning and continues processing the normalized command.

In practice, the practical impact is partially mitigated because the normalized command still passes through the standard CRITICAL_COMMANDS check, so a homoglyph `ｒｍ -rf /` would be normalized to `rm -rf /` and blocked. However, the comment-to-code mismatch is a maintenance hazard: a future developer reading the comment would assume rejection happens, and the logging-only behavior could mask sophisticated multi-stage obfuscation attempts that combine normalization with other bypass techniques.

The fix is straightforward: change the `debugLog` call to throw a `SecurityError` (or at minimum, return a blocked result from `sanitizeCommand`). The caller already handles rejection from the command blocklist, so the rejection path is well-established.

**Impact:** Closing the comment/code gap prevents future bypass attempts that combine Unicode normalization with other techniques.

#### SEC-02: `sanitizeInputForLog` truncates but doesn't redact API keys

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Security |
| **File(s)** | `extensions/security.ts` (lines ~481–491) |

The `sanitizeInputForLog()` function in the security extension truncates values longer than 500 characters but does not apply secret redaction. Contrast this with `diag.ts`'s `redactValue()` function which checks key names against secret patterns (`key`, `token`, `secret`, `password`, `auth`, `apikey`, `api_key`) and replaces matching values with `[REDACTED]`, plus truncates long alphanumeric strings that look like API keys.

When the security extension logs tool call arguments (via the `tool_result` event handler), any API key shorter than 500 characters passed as a tool argument is logged in full plaintext. The audit log entries in `shared/security.ts` use `appendAuditEntry()` which stores the full tool name and arguments without redaction.

The fix is to import and apply `redactValue()` from `diag.ts` (or extract it to `shared/security.ts` or `shared/format.ts`) and apply it in `sanitizeInputForLog()` before truncation.

**Impact:** Prevents API key leakage in security audit logs and tool call logging.

#### SEC-03: Audit log grows unbounded — no rotation mechanism

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Security |
| **File(s)** | `shared/security.ts` (`appendAuditEntry`, `readRecentAuditEntries`) |

`appendAuditEntry()` appends JSON entries to `~/.pi/agent/audit.log` indefinitely. `readRecentAuditEntries()` reads the entire file into memory, splits by newlines, then slices the last N entries. Over time, with heavy tool usage (every blocked command, every tool result), the audit log can grow to megabytes. The O(n) memory consumption of `readRecentAuditEntries` compounds this — reading a 10MB audit log just to get the last 50 entries allocates and garbage-collects a large string array.

The fix is to add a maximum file size (e.g., 5MB) check in `appendAuditEntry()`: when exceeded, read the last N entries, write them to a new file, and replace. Alternatively, use a structured logging library with built-in rotation.

**Impact:** Prevents unbounded disk usage and O(n) memory spikes in audit log readers.

#### SEC-04: `isSafeUrl` prefix matching can false-positive on hostnames

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Security |
| **File(s)** | `shared/security.ts` (line ~573) |

`isSafeUrl()` uses `normalized.startsWith(pattern)` for RFC1918 private range patterns like `"10."`, `"192.168."`, `"172.16."`–`"172.31."`. The `"10."` pattern would match a hostname like `10.example.com` even though it's a public domain. Similarly, `"192.168."` would match `192.168.example.com`.

In practice, hostnames containing IP-like prefixes are extremely rare, and the SSRF protection also includes `resolveAndCheckHostname()` for DNS-level verification. The false positive would only cause a legitimate request to be blocked (conservative behavior), not allowed. However, if a user encounters this, there's no override mechanism in the URL blocklist.

The fix is to anchor the IP patterns more precisely — e.g., check that the character after the pattern is a `/`, `:`, or end-of-string — or switch to IP address parsing before comparison.

**Impact:** Prevents false-positive blocking of legitimate hostnames that start with IP-like prefixes.

---

### Robustness

#### ROB-01: Missing `debugLog` import in model-test.ts — ReferenceError when debugging enabled

| Property | Value |
|----------|-------|
| **Severity** | High |
| **Category** | Robustness |
| **File(s)** | `extensions/model-test.ts` (lines 306, 899, 983, 1107, 1325, 1504, 1534, 1558) |

`model-test.ts` calls `debugLog("model-test", ...)` in 8 catch blocks but never imports `debugLog` from `../shared/debug`. When `PI_EXTENSIONS_DEBUG` is not set, this is harmless because `debugLog` is never called at runtime (the env var check in `shared/debug.ts` gates the function body). However, when a developer or user sets `PI_EXTENSIONS_DEBUG=1` to debug an issue, every catch block in model-test.ts will throw `ReferenceError: debugLog is not defined`, masking the original error and crashing the extension.

This was likely introduced during the v1.1.8 ROB-03 fix that replaced empty catch blocks with `debugLog()` calls across the codebase — the agent performing the fix added the calls but missed the import in model-test.ts.

The fix is a one-line addition: `import { debugLog } from "../shared/debug";` at the top of the file.

**Impact:** Prevents runtime crashes when debug logging is enabled, allowing developers to actually debug model-test issues.

#### ROB-02: `api.ts` uses non-atomic `writeModelsJson()` in 4 places — race condition with mutex

| Property | Value |
|----------|-------|
| **Severity** | High |
| **Category** | Robustness |
| **File(s)** | `extensions/api.ts` (lines 21, 241, 292, 359, 458) |

`api.ts` imports `writeModelsJson` from `shared/ollama` and uses it directly in 4 functions: `setMode()`, `setUrl()`, `setThink()`, and `handleCompat()`. Each of these functions performs a read-modify-write cycle: `readModelsJson()` → modify in memory → `writeModelsJson()`. This pattern is not protected by the mutex that `readModifyWriteModelsJson()` provides.

Every other extension that writes to `models.json` uses the atomic `readModifyWriteModelsJson()` wrapper: `ollama-sync.ts`, `openrouter-sync.ts`, and `model-test.ts` (for `updateModelsJsonReasoning`). If `/api mode openai` runs concurrently with `/ollama-sync`, the api.ts write can clobber the sync's changes (or vice versa).

The fix is to replace all 4 occurrences of the `readModelsJson → modify → writeModelsJson` pattern with `readModifyWriteModelsJson((config) => { ... return modifiedConfig; })`. The `writeModelsJson` import can then be removed as it's otherwise unused.

**Impact:** Prevents lost configuration changes during concurrent operations on models.json.

#### ROB-03: `fetchModelContextLength` debug log references undefined `model` variable

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Robustness |
| **File(s)** | `shared/ollama.ts` (line 513) |

The `fetchModelContextLength(baseUrl, modelName)` function has a debug log statement: `debugLog("ollama", \`failed to fetch context length for ${model}\`, err)`. The parameter name is `modelName`, not `model`, so when debugging is enabled, the log message shows `"failed to fetch context length for undefined"` — not helpful for identifying which model failed.

This is a one-word fix: change `${model}` to `${modelName}`.

**Impact:** Produces meaningful debug output for diagnosing context length fetch failures.

#### ROB-04: `react-fallback.ts` bridge tool has no self-reference guard — infinite loop risk

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Robustness |
| **File(s)** | `extensions/react-fallback.ts` (lines ~147–160) |

The `tool_call` bridge tool accepts arbitrary tool names and uses `fuzzyMatchToolName()` to resolve them against registered tools. If a model sends `tool_call(name="tool_call", args={...})`, the bridge will fuzzy-match to itself (since "tool_call" is its own registered name) and return a message telling the model to "call the real tool" — which is itself, creating a potential infinite loop.

The security extension's `tool_call` interceptor may catch this in max mode (since `tool_call` is a known tool name), but in basic mode or if the model uses a variant name that fuzzy-matches to `tool_call`, the loop can occur.

The fix is to add an early return in the bridge tool handler: if the resolved tool name equals `"tool_call"` (or whatever the bridge tool is named), return an error message instead of the retry instruction.

**Impact:** Prevents infinite tool call loops when a model inadvertently calls the bridge tool recursively.

#### ROB-05: `status.ts` reads `/proc/meminfo` synchronously every 5 seconds — blocks event loop

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Robustness |
| **File(s)** | `extensions/status.ts` (line ~117, `getSwap()`) |

The `getSwap()` function uses `fs.readFileSync("/proc/meminfo", "utf-8")` to read swap usage on Linux. This is called inside `updateMetrics()` which runs every 5 seconds via `setInterval`. While `/proc/meminfo` is a virtual filesystem (no disk I/O), the synchronous read still blocks the event loop during the read syscall. On a system under memory pressure, procfs reads can take longer than expected.

The fix is to migrate to `fs.promises.readFile("/proc/meminfo", "utf-8")` and make `getSwap()` async, updating `updateMetrics()` to `await` it. The `flushStatus()` caller already handles async operations.

**Impact:** Eliminates event loop blocking from swap metrics polling.

#### ROB-06: `bump-version.sh` and `bump-version.ps1` are inconsistent

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Robustness |
| **File(s)** | `scripts/bump-version.sh`, `scripts/bump-version.ps1` |

The two version-bump scripts produce different results. The Bash script updates 4 files (VERSION, shared/ollama.ts, root package.json, shared/package.json) and reads VERSION as the source of truth. The PowerShell script updates 6 files (same 4 + README.md + CHANGELOG.md) and reads `EXTENSION_VERSION` from `shared/ollama.ts` as the source of truth. The CHANGELOG update in the PowerShell script is commented out (dead code). This means a version bump on Linux misses README.md and CHANGELOG.md updates, while a version bump on Windows reads from a different source.

The fix is to align both scripts to the same file list and source-of-truth detection. Given that VERSION is documented as the single source of truth, the Bash script's approach is correct; the PowerShell script should be updated to match.

**Impact:** Ensures consistent version bumps across platforms.

---

### Maintainability

#### MAINT-01: Score-reporting pattern duplicated ~12 times in model-test.ts

| Property | Value |
|----------|-------|
| **Severity** | High |
| **Category** | Maintainability |
| **File(s)** | `extensions/model-test.ts` (lines in `testModelOllama` and `testModelProvider`) |

Both `testModelOllama()` (~200 lines) and `testModelProvider()` (~200 lines) contain nearly identical score-reporting blocks for each test category (reasoning, tool usage, ReAct parsing, instruction following). Each block follows this pattern:

```typescript
if (reasoning.score === "STRONG") { lines.push(ok(`...`)); }
else if (reasoning.score === "MODERATE") { lines.push(ok(`...`)); }
else if (reasoning.score === "WEAK") { lines.push(fail(`...`)); }
else if (reasoning.score === "FAIL") { lines.push(fail(`...`)); }
else { lines.push(warn(`...`)); }
```

This 5-line pattern repeats for 4 test categories in each function, totaling ~40 lines of duplication. If the scoring labels change or a new tier is added, 8 locations must be updated. The `formatTestScore()` function in `shared/test-report.ts` already provides per-score formatting — using it here would eliminate most of the duplication.

The fix is to extract a `reportScore(lines, testName, result)` helper that formats the score line using `formatTestScore()`, then call it for each test in both functions.

**Impact:** Reduces model-test.ts by ~40 lines and eliminates a maintenance synchronization point.

#### MAINT-02: Provider existence check duplicated 4 times in api.ts

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Maintainability |
| **File(s)** | `extensions/api.ts` (`setMode`, `setUrl`, `setThink`, `handleCompat`) |

Four functions in api.ts repeat the same pattern: look up the provider in `config.providers[name]`, check if it's null, and if so, call `ctx.ui.notify("Provider not found: ...", "error")` and return. Each copy is 3–4 lines. If the error message or notification behavior changes, all 4 must be updated.

The fix is to extract a `requireProvider(config, name, ctx)` helper that returns the provider config or sends the error notification and returns null.

**Impact:** Reduces api.ts by ~12 lines and centralizes provider validation logic.

#### MAINT-03: Duplicated path constants across config-io.ts and security.ts

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Maintainability |
| **File(s)** | `shared/config-io.ts` (lines 70, 59), `shared/security.ts` (lines 28, 45) |

`SETTINGS_PATH` is defined in both `config-io.ts` (as `SETTINGS_PATH`) and `security.ts` (also as `SETTINGS_PATH`). `SECURITY_PATH` in `config-io.ts` and `SECURITY_CONFIG_PATH` in `security.ts` point to the same file (`~/.pi/agent/security.json`) but use different names. `MODEL_TEST_CONFIG_PATH` is in both `config-io.ts` and `model-test-utils.ts`.

While the values are currently identical, if someone changes one but not the other, extensions would silently reference different paths. The fix is to have `config-io.ts` be the single source of truth for all `~/.pi/agent/` paths, and have other modules import from it.

**Impact:** Eliminates path constant duplication, preventing silent path drift.

#### MAINT-04: `diag.ts` reads settings.json directly — bypasses config-io.ts abstraction

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Maintainability |
| **File(s)** | `extensions/diag.ts` (line 272) |

`diag.ts` reads `settings.json` via `JSON.parse(fs.readFileSync(settingsPath, "utf-8"))` instead of using `readSettings()` from `shared/config-io.ts`. This bypasses the centralized config I/O layer that other extensions use. If `readSettings()` is later enhanced (e.g., adding validation, caching, or migration logic), the diagnostic's direct read would miss those improvements.

The fix is to replace the direct read with `import { readSettings } from "../shared/config-io"` and use `readSettings()`.

**Impact:** Ensures diagnostic uses the same config reading path as all other extensions.

#### MAINT-05: `model-test.ts` imports unused `writeModelsJson`

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Maintainability |
| **File(s)** | `extensions/model-test.ts` (line 8) |

`model-test.ts` imports `writeModelsJson` from `shared/ollama` but never calls it. The extension only uses `readModifyWriteModelsJson()` for atomic writes (for `updateModelsJsonReasoning`). The unused import was likely left behind after the ARCH-06 fix in v1.1.8 that migrated to the mutex-protected pattern.

The fix is to remove `writeModelsJson` from the import statement.

**Impact:** Removes dead import that could cause false positives in bundler tree-shaking analysis.

#### MAINT-06: `TimeoutError` in errors.ts conflicts with global ES2022 `TimeoutError`

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Maintainability |
| **File(s)** | `shared/errors.ts` |

TypeScript's ES2022 lib includes `globalThis.TimeoutError`. The custom `TimeoutError` in `shared/errors.ts` extends `ExtensionError` (not the global `Error`), so `instanceof globalThis.TimeoutError` would return `false` for instances of the custom class. This name collision could confuse developers who expect standard behavior.

The fix is to rename to `ExtensionTimeoutError` to avoid the collision.

**Impact:** Eliminates naming confusion with the built-in `TimeoutError`.

#### MAINT-07: `config-io.ts` `readJsonConfig` manually checks env var instead of using `debugLog`

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Maintainability |
| **File(s)** | `shared/config-io.ts` (lines 39–41) |

The `readJsonConfig()` catch block manually checks `process.env.PI_EXTENSIONS_DEBUG === "1"` and calls `console.debug()` directly, instead of using the `debugLog()` function from `shared/debug.ts`. Every other module in the codebase uses `debugLog()` for debug output. The manual check means the debug output format is inconsistent and won't include the module name prefix that `debugLog()` provides.

The fix is to import `debugLog` from `./debug` and use it in the catch block.

**Impact:** Ensures consistent debug logging format across all modules.

---

### Performance

#### PERF-01: Audit log `readRecentAuditEntries` reads entire file then slices

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Performance |
| **File(s)** | `shared/security.ts` (`readRecentAuditEntries`) |

`readRecentAuditEntries(count)` reads the entire audit log file into memory, splits by newlines into an array, then slices the last `count` entries. For a large audit log (e.g., 5MB = ~50,000 entries), this allocates a ~5MB string, splits it into ~50,000 substrings, then discards ~49,950 of them. The memory spike is proportional to the file size, not the requested entry count.

The fix is to use a reverse line reader that seeks to the end of the file and reads backwards, stopping after `count` entries. Node.js doesn't have a built-in reverse line reader, but a simple implementation using `fs.open` + `fs.read` with a seek-to-end approach would work. Alternatively, use a write-ahead log format with fixed-size entries and indexed offsets.

**Impact:** Reduces memory consumption for audit log reading from O(file_size) to O(requested_entries).

---

### Architecture

#### ARCH-01: `model-test.ts` at 1,646 lines — single file with 5+ responsibilities

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Architecture |
| **File(s)** | `extensions/model-test.ts` |

`model-test.ts` is the largest file in the codebase by a wide margin (next largest is `api.ts` at 773 lines). It contains 5 distinct responsibilities: (1) Ollama HTTP chat client (with streaming), (2) provider HTTP chat client, (3) 10+ test function implementations, (4) model metadata management (context length, reasoning flags), and (5) command/tool registration and score reporting. The v1.1.8 extraction of `test-report.ts`, `model-test-utils.ts`, and `react-parser.ts` reduced it from ~1,735 lines but the file is still too large.

The fix is to split into at least 3 modules: a chat client module (Ollama + provider HTTP wrappers), a test runner module (test functions), and the main module (command/tool registration + score reporting). The chat clients could potentially be further extracted to `shared/` since `ollama-sync.ts` has its own `fetchOllamaModels()` that duplicates some HTTP patterns.

**Impact:** Improves maintainability by giving each module a single responsibility.

#### ARCH-02: `api.ts` `/api show` and `diag.ts` both duplicate local-provider detection

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Architecture |
| **File(s)** | `extensions/api.ts` (`getLocalProvider`), `extensions/diag.ts` (provider detection in diagnostics) |

Both `api.ts` and `diag.ts` independently implement logic to detect whether the current provider is "local" (Ollama) or "cloud." `api.ts` has `getLocalProvider(config)` which checks if the first provider's `baseUrl` contains `localhost` or `127.0.0.1`. `diag.ts` has its own inline version that checks the current provider's base URL against similar patterns. `status.ts` also has `detectLocalProvider()` with a third implementation.

Three independent implementations of "is this provider local?" creates a maintenance risk — if the heuristic changes (e.g., adding `0.0.0.0` or `[::1]`), all three must be updated.

The fix is to extract `isLocalProvider(providerConfig)` to `shared/ollama.ts` alongside `detectProvider()` and import it in all three extensions.

**Impact:** Consolidates local-provider detection logic, preventing heuristic drift.

#### ARCH-03: Branding array duplicated identically across all 8 extension files

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Architecture |
| **File(s)** | All 8 extension files |

Every extension builds the same branding array: `[section("Pi Coding Agent Extensions"), info(`v${EXTENSION_VERSION}`)]`. This 2-line pattern appears in `api.ts`, `diag.ts`, `model-test.ts`, `ollama-sync.ts`, `openrouter-sync.ts`, `react-fallback.ts`, `security.ts`, and `status.ts`. The `test-report.ts` module exports a `branding` constant that some files import, but the format differs (it includes GitHub and website URLs).

The fix is to export a `getBranding()` function from `shared/format.ts` that returns the standard 2-element branding array. Extensions that need the extended version (with URLs) can import `branding` from `test-report.ts`.

**Impact:** Eliminates 8 copies of the same branding code.

---

### Testing

#### TEST-01: Zero test coverage for `config-io.ts` — atomic I/O untested

| Property | Value |
|----------|-------|
| **Severity** | High |
| **Category** | Testing |
| **File(s)** | `shared/config-io.ts` (all exports untested) |

`config-io.ts` exports 4 functions (`readJsonConfig`, `writeJsonConfig`, `readSettings`, `writeSettings`) and 4 path constants. It implements the atomic write-then-rename pattern that was specifically fixed in v1.1.8 (MAINT-07) because the previous non-atomic implementation was a crash-safety risk. Despite this being a critical infrastructure module used by `api.ts`, it has zero test coverage.

The atomic write pattern (write to `.tmp`, then `fs.renameSync`) has specific failure modes: cross-filesystem renames that fall back to direct writes, permission errors on the `.tmp` file, and race conditions during the rename window. None of these are tested.

The fix is to create `tests/config-io.test.ts` with tests covering: `readJsonConfig` with valid JSON, malformed JSON (fallback to default), missing file (fallback); `writeJsonConfig` atomic write (verify `.tmp` file is created and renamed); `writeJsonConfig` cross-filesystem fallback; `readSettings`/`writeSettings` round-trip; path constants matching expected values.

**Impact:** Validates the atomic write-then-rename pattern that was specifically introduced to prevent config corruption.

#### TEST-02: Zero test coverage for `model-test-utils.ts` — scoring/caching untested

| Property | Value |
|----------|-------|
| **Severity** | High |
| **Category** | Testing |
| **File(s)** | `shared/model-test-utils.ts` (all exports untested) |

`model-test-utils.ts` exports 15+ functions including scoring logic (`scoreReasoning`, `scoreNativeToolCall`, `scoreTextToolCall`), caching (`readToolSupportCache`, `writeToolSupportCache`, `getCachedToolSupport`, `cacheToolSupport`), test history (`readTestHistory`, `appendTestHistory`, `detectRegression`), and configuration (`readTestConfig`, `getEffectiveConfig`). The scoring functions are the most critical — they determine model benchmark ratings (STRONG/MODERATE/WEAK/FAIL), and the ROB-01/ROB-02 bugs in v1.1.8 were directly related to configuration handling in this module.

Despite being the shared foundation for all model testing, it has zero test coverage. The `scoreReasoning`, `scoreNativeToolCall`, and `scoreTextToolCall` functions contain complex conditional logic for classifying model responses — exactly the kind of logic that benefits most from unit tests.

The fix is to create `tests/model-test-utils.test.ts` covering: all 3 scoring functions with various response qualities; `getEffectiveConfig` with user overrides and defaults; `detectRegression` with improving and degrading scores; cache read/write round-trip with temp files; history append and trimming; `readTestConfig` with valid and invalid JSON.

**Impact:** Prevents regressions in model scoring and configuration handling — the exact type of bug that v1.1.8 fixed.

---

## Priority Matrix

| Timeline | Findings |
|----------|----------|
| **Near term (v1.2.0–v1.2.1)** | ROB-01 (add missing debugLog import), ROB-02 (migrate api.ts to readModifyWriteModelsJson), ROB-03 (fix undefined `model` variable), MAINT-05 (remove unused writeModelsJson import) |
| **Short term (v1.2.1–v1.2.3)** | SEC-01 (sanitizeCommand rejection), SEC-02 (secret redaction in security logs), MAINT-01 (score-reporting extraction), MAINT-03 (consolidate path constants), MAINT-04 (diag.ts use readSettings), TEST-01 (config-io tests), TEST-02 (model-test-utils tests) |
| **Medium term (v1.3.0+)** | ARCH-01 (split model-test.ts), ARCH-02 (consolidate local-provider detection), ARCH-03 (shared branding), ROB-04 (bridge tool self-reference guard), ROB-05 (async getSwap), PERF-01 (reverse audit log reader), SEC-03 (audit log rotation), MAINT-02 (provider existence helper), MAINT-06 (rename TimeoutError), MAINT-07 (use debugLog in config-io), ROB-06 (align bump scripts), SEC-04 (anchor IP patterns) |

---

## Architecture Strengths

The Pi Coding Agent Extensions codebase demonstrates several architectural strengths that should be preserved during improvement work:

**Clean shared module extraction.** The `shared/` library is well-organized with 11 modules covering distinct concerns (format, security, ollama, types, config, debug, react-parser, model-test-utils, test-report, provider-sync, errors). Each module has a clear single responsibility, zero circular dependencies, and no external runtime dependencies (Node.js built-ins only). The extraction of `react-parser.ts`, `test-report.ts`, `provider-sync.ts`, `config-io.ts`, and `errors.ts` in v1.1.7–1.1.8 eliminated significant duplication and created reusable building blocks.

**Mutex-protected concurrent writes.** The `acquireModelsJsonLock()` / `readModifyWriteModelsJson()` pattern in `shared/ollama.ts` is an elegant in-memory mutex built on a Promise chain. It correctly serializes concurrent writes to `models.json` from multiple extensions without external dependencies. The `readModifyWriteModelsJson(modifier)` convenience wrapper with null-abort support is well-designed API ergonomics.

**Defense-in-depth security model.** The security system operates at multiple layers: command blocklist (sanitization), SSRF URL blocking (pattern matching + DNS resolution), path validation (symlink dereferencing), injection detection (pattern matching), and audit logging. The mode-aware partitioning (basic/max) is a thoughtful design that balances security with usability for different environments. The NFKC Unicode normalization and zero-width character stripping in `sanitizeCommand` are sophisticated defenses against homoglyph bypass attempts rarely seen in extension-level code.

**Atomic file writes with crash safety.** Both `writeModelsJson()` (in `shared/ollama.ts`) and `writeJsonConfig()` (in `shared/config-io.ts`) implement write-to-temp-then-rename patterns with appropriate fallbacks for cross-filesystem moves. The audit log has crash-safe flush via `process.on("exit")` and `process.on("SIGTERM")` handlers. These patterns show careful attention to data integrity.

**Comprehensive security test suite.** `tests/security.test.ts` (66 tests) covers mode-aware command blocking, SSRF URL validation, path traversal, injection detection, DNS rebinding protection, Unicode normalization, and audit log buffering. The tests use `after()` hooks to restore security mode, ensuring test isolation. This is the most thorough test file in the suite and serves as a model for testing security-sensitive logic.

**Provider-agnostic test abstraction.** The `ChatFn` type in `shared/model-test-utils.ts` abstracts provider differences into a simple `(messages, options) => Promise<response>` interface. This allows the same test functions (reasoning, tool usage, instruction following) to run against both local Ollama models and remote cloud providers without modification. The unified test functions (`testReasoningUnified`, `testToolUsageUnified`, `testInstructionFollowingUnified`) further consolidate this pattern.
