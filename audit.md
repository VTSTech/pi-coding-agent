# Improvement & Enhancement Audit

**Pi Coding Agent Extensions v1.1.7**

**Repository:** github.com/VTSTech/pi-coding-agent
**Author:** VTSTech | **License:** MIT | **Date:** April 14, 2026
26 Findings | 7 Categories | Security, Robustness, Maintainability, Performance, New Features, Architecture, Testing

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Findings Summary](#findings-summary)
- [Detailed Findings](#detailed-findings)
  - [Security](#security)
  - [Robustness](#robustness)
  - [Maintainability](#maintainability)
  - [Performance](#performance)
  - [New Features](#new-features)
  - [Architecture](#architecture)
  - [Testing](#testing)
- [Priority Matrix](#priority-matrix)
- [Architecture Strengths](#architecture-strengths)

---

## Executive Summary

This audit report presents 26 findings across 7 categories for the Pi Coding Agent Extensions repository (v1.1.7) by VTSTech. The audit was conducted through a comprehensive review of all 12 extension and shared source files (10,386 lines of TypeScript), 1 JSON theme configuration, and 4 test files. Each finding includes a severity rating, detailed analysis, affected file(s), and concrete recommendations for improvement.

The findings are organized by category priority: Security (6 findings), Robustness (4), Maintainability (6), Performance (3), New Features (3), Architecture (4), and Testing (3). Of the 26 findings, 2 are rated High severity (concurrent models.json writes without mutex protection and rateLimitDelay ignoring user config overrides), 11 are Medium severity, and 13 are Low severity. The High-severity findings represent the most impactful improvements — the first affects data integrity when multiple extensions write concurrently, and the second silently breaks user-configurable behavior.

---

## Findings Summary

| ID | Severity | Category | Title |
|----|----------|----------|-------|
| SEC-01 | **High** | Security | openrouter-sync.ts Lacks Mutex Protection for models.json |
| ROB-01 | **High** | Robustness | rateLimitDelay() Ignores User Config Overrides |
| SEC-02 | Medium | Security | Audit Log Not Crash-Safe |
| SEC-03 | Medium | Security | IPv6-Mapped IPv4 SSRF Bypass |
| SEC-04 | Medium | Security | /tmp and /var/tmp Allowed in Path Validation |
| SEC-05 | Medium | Security | settings.json Contents Exposed in /diag Endpoint |
| SEC-06 | Low | Security | sanitizeCommand() Does Not Handle All Encodings |
| ROB-02 | Medium | Robustness | testToolSupport() Uses Hardcoded Timeout |
| ROB-03 | Medium | Robustness | Silent Error Swallowing Across Extensions |
| ROB-04 | Low | Robustness | fmtBytes() Off-by-One for Small Values |
| ROB-05 | Low | Robustness | execSync Blocks Event Loop in status.ts |
| MAINT-01 | Medium | Maintainability | model-test.ts at 1,735 Lines — Too Large |
| MAINT-02 | Medium | Maintainability | Pervasive any Type Usage |
| MAINT-03 | Medium | Maintainability | Duplicate readSettings/writeSettings in api.ts |
| MAINT-04 | Medium | Maintainability | testToolSupport() Duplicates ReAct Pattern Logic |
| MAINT-05 | Low | Maintainability | JSON Brace-Matching Duplication |
| MAINT-06 | Low | Maintainability | Duplicate ReAct Pattern Detection in testToolSupport() |
| PERF-01 | Low | Performance | models.json Cache Coherence Gap |
| PERF-02 | Low | Performance | Batched Context Length Fetching Not Configurable |
| PERF-03 | Low | Performance | Status Bar Polls When No Session Active |
| FEAT-01 | Medium | New Feature | Add JSON Schema Validation for Configuration Files |
| FEAT-02 | Medium | New Feature | Add Shared Typed Error Classes |
| FEAT-03 | Medium | New Feature | Implement CI/CD Pipeline |
| ARCH-01 | Medium | Architecture | Inter-Extension Communication via pi._reactParser Is Fragile |
| ARCH-02 | Medium | Architecture | Extract Shared Provider Sync Pattern |
| ARCH-03 | Medium | Architecture | Modularize ollama.ts (765 Lines) |
| ARCH-04 | Low | Architecture | Add .npmignore Files to npm-packages/ |
| TEST-01 | Medium | Testing | No Extension-Layer Test Coverage (0 of 7 Extensions) |
| TEST-02 | Medium | Testing | Key Shared Utilities Untested |
| TEST-03 | Low | Testing | No Integration Tests or CI Pipeline |

---

## Detailed Findings

### Security

#### SEC-01: openrouter-sync.ts Lacks Mutex Protection for models.json

| Property | Value |
|----------|-------|
| **Severity** | High |
| **Category** | Security |
| **File(s)** | `extensions/openrouter-sync.ts`, lines 120–151, 230–258 |

The `openrouter-sync.ts` extension performs inline read-modify-write cycles on `models.json` without using the `readModifyWriteModelsJson()` mutex wrapper that was introduced for exactly this purpose. In contrast, `ollama-sync.ts` correctly uses the mutex to prevent concurrent write conflicts. The affected code sections in `openrouter-sync.ts` directly read the file, modify the in-memory representation, and write it back without any locking mechanism. When multiple extensions attempt to update `models.json` concurrently (e.g., ollama-sync and openrouter-sync running in parallel), the non-atomic read-modify-write cycle can cause lost updates — one extension may read stale data, modify it, and overwrite changes made by another extension that committed in the interim.

Refactor `openrouter-sync.ts` to use `readModifyWriteModelsJson()` for all `models.json` modifications, following the same pattern already established in `ollama-sync.ts`.

**Impact:** Prevents silent data loss when multiple extensions write to models.json simultaneously.

---

#### SEC-02: Audit Log Not Crash-Safe

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Security |
| **File(s)** | `extensions/security.ts` |

The security extension uses a timer-based buffered write mechanism for audit logging, flushing entries every 500ms or when the buffer reaches 50 entries. If the process crashes, receives SIGKILL, or experiences an unhandled exception during the buffering period, all buffered audit entries are lost. For a security audit trail, this represents a gap in the chain of custody. Add a process exit handler (`process.on("exit")` and `process.on("SIGTERM")`) that synchronously flushes the audit buffer before the process terminates. Consider also using `appendFileSync()` for critical security events that must not be lost.

**Impact:** Closes a gap in the security audit trail where buffered entries can be lost on crash.

---

#### SEC-03: IPv6-Mapped IPv4 SSRF Bypass

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Security |
| **File(s)** | `extensions/security.ts` |

The SSRF protection checks for private IP patterns including `"10."` prefixes, but may not catch IPv6-mapped IPv4 addresses such as `::ffff:10.0.0.1`. The `isPrivateIp()` function handles some IPv6 cases, but the URL-based safety check (`isSafeUrl()`) relies on hostname resolution which may not always be performed before the access check. Ensure that all URL validation paths resolve hostnames to IP addresses before checking against the private IP blocklist. Add explicit handling for IPv6-mapped IPv4 addresses (`::ffff:0:0/96` prefix) in the `isPrivateIp()` function.

**Impact:** Closes a potential SSRF bypass vector via IPv6-mapped IPv4 address representation.

---

#### SEC-04: /tmp and /var/tmp Allowed in Path Validation

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Security |
| **File(s)** | `extensions/security.ts` |

The `validatePath()` function permits writing to `/tmp` and `/var/tmp` directories. Since these are world-readable and world-writable on most systems, files written there by the agent can be read, modified, or deleted by other processes or users on the system. Restrict file operations to a dedicated subdirectory such as `/tmp/pi-agent/` or use a user-specific temp directory. Apply directory creation with restrictive permissions (0700) to prevent unauthorized access.

**Impact:** Prevents unauthorized access to files created by the agent in shared temp directories.

---

#### SEC-05: settings.json Contents Exposed in /diag Endpoint

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Security |
| **File(s)** | `extensions/diag.ts` |

The diagnostic endpoint displays the full contents of `settings.json`, which may include sensitive API keys, authentication tokens, or other credentials. While the `/diag` endpoint is intended for debugging, exposing raw secrets in plaintext is a security risk. Implement a field-level redaction function that replaces values matching common secret patterns (keys, tokens, passwords) with masked placeholders like `[REDACTED]`. Apply this redaction before rendering the diagnostic output.

**Impact:** Prevents accidental exposure of API keys and credentials through the diagnostic endpoint.

---

#### SEC-06: sanitizeCommand() Does Not Handle All Encodings

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Security |
| **File(s)** | `extensions/security.ts` |

The command sanitizer checks for known dangerous patterns but may not catch obfuscated payloads using Unicode homoglyphs (visually similar but different characters), zero-width characters, or multi-byte encoded sequences. An attacker could potentially craft a command that bypasses the pattern matching by using these techniques. Apply Unicode NFKC normalization before pattern matching to canonicalize visually identical characters. Strip zero-width characters and control characters from input before sanitization.

**Impact:** Strengthens command sanitization against encoding-based bypass techniques.

---

### Robustness

#### ROB-01: rateLimitDelay() Ignores User Config Overrides

| Property | Value |
|----------|-------|
| **Severity** | High |
| **Category** | Robustness |
| **File(s)** | `extensions/model-test.ts`, line 74 |

The `rateLimitDelay()` function uses the raw `CONFIG.TEST_DELAY_MS` constant instead of the merged `effectiveConfig.TEST_DELAY_MS` value. The codebase provides a user-configurable `model-test-config.json` file that allows operators to override default timing parameters. However, because `rateLimitDelay()` reads directly from the static `CONFIG` object, any user customization of the test delay interval is silently ignored. Users who set a custom `TEST_DELAY_MS` in their configuration will observe no change in the actual delay between tests, undermining the configurability promise of the extension system. Replace `CONFIG.TEST_DELAY_MS` with `effectiveConfig.TEST_DELAY_MS` in the `rateLimitDelay()` function.

**Impact:** Ensures user-configurable rate-limit delays are actually respected at runtime.

---

#### ROB-02: testToolSupport() Uses Hardcoded Timeout

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Robustness |
| **File(s)** | `extensions/model-test.ts`, line 901 |

The `testToolSupport()` function uses a hardcoded timeout value of `130000ms` instead of reading from `CONFIG.TOOL_SUPPORT_TIMEOUT_MS` (or `effectiveConfig`). This means that the user-configurable timeout setting for tool support detection is bypassed entirely. Users who need to adjust the tool support timeout for slower models or network conditions will find that their configuration changes have no effect. The hardcoded 130-second timeout may be too aggressive for some configurations or too lenient for others. Replace the hardcoded `130000` with `effectiveConfig.TOOL_SUPPORT_TIMEOUT_MS`.

**Impact:** Makes the tool support detection timeout respect user configuration overrides.

---

#### ROB-03: Silent Error Swallowing Across Extensions

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Robustness |
| **File(s)** | Multiple extensions (`security.ts`, `status.ts`, `react-fallback.ts`, others) |

Many `catch` blocks throughout the codebase are empty or contain only a comment: `catch { /* ignore */ }`. While intentional suppression is sometimes appropriate, the complete absence of logging makes debugging extremely difficult when errors occur in production. Developers have no visibility into which error paths are being triggered. Replace empty catch blocks with `debugLog()` calls at minimum. For error paths that are genuinely expected to fail, add a comment explaining why suppression is safe. Consider adding a `warn`-level log for unexpected error paths so that debug mode provides full visibility.

**Impact:** Makes production debugging feasible by ensuring all error paths are at least logged in debug mode.

---

#### ROB-04: fmtBytes() Off-by-One for Small Values

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Robustness |
| **File(s)** | `shared/format.ts`, lines 158–163 |

The `fmtBytes()` utility function incorrectly formats byte values smaller than 1024. When called with `fmtBytes(512)`, the function computes `Math.floor(512 / 1024) = 0` and returns `"0K"` instead of the expected `"512B"`. The function lacks a guard clause for values below the kilobyte threshold, causing all small memory values to display as `"0K"` in the status bar. This is particularly noticeable for processes using less than 1 MB of memory. Add a check at the beginning of `fmtBytes()`: `if (b < 1024) return `${b}B`;` before proceeding to the KB calculation.

**Impact:** Fixes misleading `"0K"` display for small memory values in the status bar.

---

#### ROB-05: execSync Blocks Event Loop in status.ts

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Robustness |
| **File(s)** | `extensions/status.ts` |

The status extension uses `execSync("pi -v 2>&1")` to detect the Pi version. While the input is hardcoded and poses minimal injection risk, this pattern is inconsistent with the codebase's migration toward asynchronous `fetch()`-based operations. Synchronous execution blocks the event loop and can cause latency spikes. Migrate version detection to use an async `child_process.exec()` call or, if the Pi agent exposes a version API, use `fetch()` to retrieve it. At minimum, document why synchronous execution is acceptable in this specific context.

**Impact:** Eliminates event loop blocking from version detection, improving responsiveness.

---

### Maintainability

#### MAINT-01: model-test.ts at 1,735 Lines — Too Large

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Maintainability |
| **File(s)** | `extensions/model-test.ts` |

The `model-test.ts` file has grown to 1,735 lines, making it the largest file in the codebase by a significant margin (the next largest is `ollama.ts` at 765 lines). It contains test orchestration logic, ChatFn wrapper construction, display and reporting functions, configuration management, and ReAct pattern matching all in a single module. This makes navigation, testing, and code review unnecessarily difficult. Split into focused modules: `test-functions.ts` (orchestration), `chatfn-wrappers.ts` (ChatFn factory), `display.ts` (terminal output and reporting), and `config.ts` (configuration loading and merging). Keep the main entry point as a thin facade that re-exports from these modules.

**Impact:** Reduces the largest file from 1,735 lines to smaller, focused modules that are easier to navigate and test.

---

#### MAINT-02: Pervasive any Type Usage

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Maintainability |
| **File(s)** | `extensions/status.ts`, `extensions/security.ts`, `extensions/react-fallback.ts`, multiple files |

Many event handler callbacks use the `any` type instead of properly typed interfaces. For example, `pi.on("tool_call", (event: any) => ...)` appears in `status.ts` and `security.ts`. This defeats TypeScript's type checking and can hide runtime errors that the type system would otherwise catch at compile time. Define typed event interfaces based on Pi's ExtensionAPI types, or use type assertions with specific shapes rather than blanket `any`. At minimum, replace `any` with `unknown` and add runtime type guards where the exact shape cannot be statically determined.

**Impact:** Restores compile-time type safety for event handlers, catching errors before runtime.

---

#### MAINT-03: Duplicate readSettings/writeSettings in api.ts

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Maintainability |
| **File(s)** | `extensions/api.ts` |

The `api.ts` extension contains its own `readSettings()` and `writeSettings()` functions that duplicate the file I/O pattern used across the codebase. This violates DRY principles and creates inconsistency when the pattern needs to change (e.g., adding atomic writes). Extract the shared settings I/O pattern into a dedicated module (e.g., `shared/io.ts` or `shared/config-io.ts`) and have all extensions import from it.

**Impact:** Eliminates duplicated settings I/O code and ensures consistent behavior when the pattern changes.

---

#### MAINT-04: testToolSupport() Duplicates ReAct Pattern Logic

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Maintainability |
| **File(s)** | `extensions/model-test.ts`, lines 952–983 |

The `testToolSupport()` function contains an inline `reactPatterns` array that duplicates the pattern logic already centralized in `ALL_DIALECT_PATTERNS` from `shared/react-parser.ts`. This inline copy is not automatically synchronized with the canonical source, creating a maintenance risk. If new ReAct dialect patterns are added to `shared/react-parser.ts`, the inline copy in `testToolSupport()` will not be updated, leading to inconsistent behavior between tool support detection and actual ReAct response parsing. Import and use `ALL_DIALECT_PATTERNS` from `shared/react-parser.ts` instead of maintaining a separate inline array.

**Impact:** Eliminates a maintenance risk where ReAct pattern detection could silently drift from the canonical source.

---

#### MAINT-05: JSON Brace-Matching Duplication

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Maintainability |
| **File(s)** | `extensions/model-test.ts` (`extractBraceJson`), `shared/react-parser.ts` (`extractJsonArgs`) |

The `extractBraceJson()` function in `model-test.ts` duplicates the brace-matching logic already present in `extractJsonArgs()` from `shared/react-parser.ts`. Both functions implement the same algorithm for extracting JSON objects from text by counting opening and closing braces. Remove `extractBraceJson()` from `model-test.ts` and reuse `extractJsonArgs()` from `shared/react-parser.ts`. If the APIs differ slightly, extend the shared function to support both use cases.

**Impact:** Removes duplicated JSON extraction logic, reducing maintenance surface area.

---

#### MAINT-06: Duplicate ReAct Pattern Detection in testToolSupport()

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Maintainability |
| **File(s)** | `extensions/model-test.ts`, lines 952–983 |

Related to MAINT-04 but worth calling out separately: the `testToolSupport()` function's inline pattern array is a maintenance liability. If new ReAct dialect patterns are added to `shared/react-parser.ts`, the inline copy will not be updated, leading to inconsistent behavior between tool support detection and actual ReAct response parsing. This is the same recommendation as MAINT-04 — included here for tracking purposes as both a duplication and a drift risk.

**Impact:** See MAINT-04.

---

### Performance

#### PERF-01: models.json Cache Coherence Gap

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Performance |
| **File(s)** | `shared/mutex.ts`, `shared/ollama.ts` |

The `models.json` cache uses a 2-second TTL (time-to-live) to avoid excessive file reads. While reasonable for most operations, this can cause stale reads during rapid successive operations (e.g., running multiple provider syncs in quick succession). The current code does set the cache to null on write, but the race condition window between write and read still exists if two processes are involved. Consider implementing cache invalidation events that are emitted when `models.json` is written, allowing consumers to refresh their cache immediately rather than waiting for TTL expiry. Alternatively, use `fs.watch` or track mtime to detect external changes.

**Impact:** Eliminates the 2-second stale data window and reduces unnecessary file reads during idle periods.

---

#### PERF-02: Batched Context Length Fetching Not Configurable

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Performance |
| **File(s)** | `shared/ollama.ts` |

Context length fetching is already batched with 3 concurrent requests, which is a good default. However, this value is not configurable. Under high-latency network conditions, a smaller batch size might be more appropriate to avoid timeouts, while a larger batch size could improve throughput on fast connections. Consider implementing adaptive batch sizing based on observed connection quality or making the concurrency level configurable via `model-test-config.json`.

**Impact:** Allows users to tune context length fetching for their network conditions.

---

#### PERF-03: Status Bar Polls When No Session Active

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Performance |
| **File(s)** | `extensions/status.ts` |

The status bar updates every 5 seconds, which is a reasonable default for displaying model status information during an active session. However, this polling continues even when no active coding session is in progress, consuming unnecessary resources. Consider pausing status bar updates when no session is active and resuming when a session begins. The update interval could also be made configurable for users who prefer more or less frequent refreshes.

**Impact:** Reduces unnecessary resource consumption during idle periods.

---

### New Features

#### FEAT-01: Add JSON Schema Validation for Configuration Files

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | New Feature |
| **File(s)** | `extensions/model-test.ts`, `extensions/api.ts`, `extensions/diag.ts` |

No validation is performed when reading configuration files (`models.json`, `settings.json`, `model-test-config.json`). Malformed or unexpected configuration can cause silent failures or cryptic runtime errors. This was observed during the audit: the `rateLimitDelay()` bug (ROB-01) and the hardcoded timeout in `testToolSupport()` (ROB-02) both stem from a lack of config validation discipline. Integrating a JSON schema validation library (e.g., `zod` or `ajv`) to validate configuration files on load would provide clear error messages for invalid input and prevent these classes of bugs from recurring.

**Impact:** Prevents silent config failures and provides clear error messages for invalid configuration.

---

#### FEAT-02: Add Shared Typed Error Classes

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | New Feature |
| **File(s)** | Multiple extensions |

Error classes were removed in v1.1.0 as dead code, but extensions currently throw raw strings. This was observed across multiple files during the audit and makes error handling and categorization difficult. Introducing typed error classes such as `ExtensionError`, `ConfigError`, `ApiError`, and `TimeoutError` would enable structured error handling across the extension system. Callers could use `instanceof` checks to categorize and respond to errors appropriately, and error messages would be consistent and machine-parseable.

**Impact:** Enables structured, catchable error handling across the extension system instead of raw string throws.

---

#### FEAT-03: Implement CI/CD Pipeline

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | New Feature |
| **File(s)** | Project root |

The project currently lacks automated testing, linting, or publishing workflows. There are no integration tests that verify the interaction between extensions, shared utilities, and the Pi agent runtime, and no CI pipeline configured to automatically run existing tests, type checking, or linting on pull requests. This means regressions can be introduced without detection until manual testing is performed. Adding GitHub Actions for TypeScript type checking, unit test execution, build verification, and publish dry-runs would catch regressions early and streamline the release process.

**Impact:** Catches regressions automatically and provides confidence that changes don't break existing functionality.

---

### Architecture

#### ARCH-01: Inter-Extension Communication via pi._reactParser Is Fragile

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Architecture |
| **File(s)** | `extensions/react-fallback.ts` |

The current pattern of accessing `pi._reactParser` (via `"as any"`) is fragile and creates tight coupling between extensions. The `react-fallback.ts` extension stores parser functions on an undocumented, type-unsafe internal property. If other extensions need to access the ReAct parser, they must know about this private API. Consider implementing a proper event bus or shared state registry that extensions can use to communicate without reaching into each other's internal state. For example, `pi.registerShared('reactParser', { parseReact, detectDialect })` would allow type-safe, documented inter-extension communication.

**Impact:** Provides a clean, type-safe mechanism for extensions to share functionality with each other.

---

#### ARCH-02: Extract Shared Provider Sync Pattern

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Architecture |
| **File(s)** | `extensions/ollama-sync.ts`, `extensions/openrouter-sync.ts` |

The `ollama-sync.ts` extension extracted a reusable `performSync()` function, but `openrouter-sync.ts` implements its own inline sync logic. Creating a shared sync abstraction that both providers can use would reduce duplication and ensure consistent behavior across provider synchronization operations. This was directly observed during the audit: `ollama-sync.ts` correctly uses `readModifyWriteModelsJson()` while `openrouter-sync.ts` does raw file I/O (SEC-01). A shared sync abstraction would make it structurally harder to repeat this mistake.

**Impact:** Reduces provider sync duplication and enforces consistent behavior (including mutex usage) across providers.

---

#### ARCH-03: Modularize ollama.ts (765 Lines)

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Architecture |
| **File(s)** | `shared/ollama.ts` |

The `ollama.ts` module handles I/O, provider registration, model family detection, cache management, and retry logic in a single 765-line file. While not as large as `model-test.ts`, it combines multiple responsibilities that would benefit from separation. Splitting it into `ollama-io.ts` (fetch helpers), `provider-registry.ts` (provider detection and registration), and `cache.ts` (models.json caching and atomic writes) would improve testability and make it easier to understand each concern in isolation.

**Impact:** Improves testability and separation of concerns in the core Ollama integration module.

---

#### ARCH-04: Add .npmignore Files to npm-packages/

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Architecture |
| **File(s)** | `npm-packages/*/` |

The `npm-packages/` directories lack `.npmignore` files, meaning published packages include all files from their directories (test fixtures, internal scripts, documentation). Adding appropriate `.npmignore` files to each package directory would reduce package size and avoid shipping unnecessary files to consumers.

**Impact:** Reduces published package size and prevents shipping internal files to consumers.

---

### Testing

#### TEST-01: No Extension-Layer Test Coverage (0 of 7 Extensions)

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Testing |
| **File(s)** | `extensions/diag.ts`, `extensions/status.ts`, `extensions/api.ts`, `extensions/ollama-sync.ts`, `extensions/openrouter-sync.ts`, `extensions/react-fallback.ts`, `extensions/security.ts` |

None of the 7 extensions have any dedicated test coverage. The codebase has 4 test files covering shared utilities (mutex, retry, format, and react-parser) which provide 80% coverage for the shared layer, but the extension layer — where most of the business logic and user-facing behavior lives — is entirely untested. Adding at least basic unit tests for each extension's core functionality would significantly increase confidence in the system's correctness. Priority should be given to `security.ts` (most critical for safety) and `openrouter-sync.ts` (most recently affected by the mutex bug).

**Impact:** Closes the testing gap for the extension layer where most business logic resides.

---

#### TEST-02: Key Shared Utilities Untested

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Testing |
| **File(s)** | `shared/mutex.ts`, `shared/retry.ts`, `extensions/model-test.ts` |

While 4 of 5 shared utility files have tests, several key functions remain untested: `acquireModelsJsonLock` (mutex acquisition with timeout), `withRetry` (retry logic with exponential backoff), `appendTestHistory` / `detectRegression` (test history tracking), and `getEffectiveConfig` (user config merging and override logic — the function whose misuse caused ROB-01). Adding tests for these would directly validate the correctness of the config override mechanism and the mutex that protects shared state.

**Impact:** Validates the correctness of config merging and mutex behavior that multiple extensions depend on.

---

#### TEST-03: No Integration Tests or CI Pipeline

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Testing |
| **File(s)** | Project root |

There are no integration tests that verify the interaction between extensions, shared utilities, and the Pi agent runtime. Additionally, there is no CI pipeline configured to automatically run the existing tests, type checking, or linting on pull requests. This means regressions can be introduced without detection until manual testing is performed. See also FEAT-03 (CI/CD Pipeline) which addresses the CI gap specifically.

**Impact:** Ensures multi-extension interactions work correctly and regressions are caught automatically.

---

## Priority Matrix

| Timeline | Findings |
|----------|----------|
| **Near term (v1.1.8–v1.1.9)** | SEC-01 (openrouter-sync mutex), ROB-01 (rateLimitDelay config bug), ROB-04 (fmtBytes off-by-one) |
| **Short term (v1.1.9–v1.2.0)** | SEC-02 (crash-safe audit log), SEC-05 (/diag redaction), ROB-02 (hardcoded timeout), ROB-03 (silent error swallowing), MAINT-04 (ReAct pattern duplication), MAINT-05 (JSON brace duplication), FEAT-01 (config schema validation), FEAT-02 (typed error classes), TEST-01 (extension tests), TEST-02 (shared utility tests) |
| **Medium term (v1.2.0+)** | SEC-03 (IPv6 SSRF), SEC-04 (/tmp path restriction), SEC-06 (encoding sanitization), ROB-05 (execSync removal), MAINT-01 (split model-test.ts), MAINT-02 (any → typed), MAINT-03 (extract settings I/O), PERF-01–03 (cache, batching, polling), ARCH-01–04 (event bus, sync pattern, modularize ollama, .npmignore), FEAT-03 (CI/CD), TEST-03 (integration tests) |

---

## Architecture Strengths

Before closing, it is worth noting the repository's existing architectural strengths that should be preserved during any refactoring. The shared module architecture (`shared/`) is well-designed with clear separation of concerns: `format.ts` for display utilities, `mutex.ts` for file access coordination, `react-parser.ts` for ReAct dialect parsing, and `retry.ts` for exponential backoff. The atomic write-then-rename pattern in `writeModelsJson()` is a good foundation that just needs concurrent access protection layered on top (SEC-01).

The `readModifyWriteModelsJson()` mutex wrapper introduced for `ollama-sync.ts` demonstrates thoughtful concurrency awareness — the problem is simply that `openrouter-sync.ts` doesn't use it yet. The unified retry mechanism with configurable parameters is a solid pattern that the Ollama fetch helpers could benefit from adopting. The modular extension loading pattern, where each extension registers its own tools and commands independently, provides good isolation and makes it straightforward to add or remove functionality.

The partitioned security model in `security.ts` — with `CRITICAL_COMMANDS` always blocked and mode-dependent `EXTENDED_COMMANDS` — provides flexibility without sacrificing safety. The three-tier provider detection (models.json lookup, built-in registry, unknown fallback) in `detectProvider()` is elegant and extensible. The tool support cache with persistent JSON storage demonstrates good performance awareness. These patterns should be maintained and extended as the codebase evolves.
