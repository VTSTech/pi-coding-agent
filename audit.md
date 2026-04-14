# Improvement & Enhancement Audit

**Pi Coding Agent Extensions v1.1.8-dev**

**Repository:** github.com/VTSTech/pi-coding-agent
**Author:** VTSTech | **License:** MIT | **Date:** April 14, 2026
15 Findings | 6 Categories | Maintainability, Architecture, Performance, New Features, Testing, Robustness

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [Findings Summary](#findings-summary)
- [Detailed Findings](#detailed-findings)
  - [Maintainability](#maintainability)
  - [Architecture](#architecture)
  - [Performance](#performance)
  - [New Features](#new-features)
  - [Testing](#testing)
  - [Robustness](#robustness)
- [Priority Matrix](#priority-matrix)
- [Architecture Strengths](#architecture-strengths)

---

## Executive Summary

This audit covers the Pi Coding Agent Extensions repository at commit `b87ca27` (v1.1.8-dev), which represents significant progress since the v1.1.7 audit. The previous audit identified 26 findings across 7 categories; this refresh evaluates the current state after the v1.1.8 release, which addressed 22 of those findings. The most impactful previous findings — mutex protection for openrouter-sync (SEC-01), rateLimitDelay config bug (ROB-01), crash-safe audit logging (SEC-02), IPv6 SSRF bypass (SEC-03), secret redaction (SEC-05), Unicode normalization (SEC-06), fmtBytes off-by-one (ROB-04), execSync blocking (ROB-05), empty catch blocks (ROB-03), and inter-extension communication (ARCH-01) — have all been resolved.

The remaining 15 findings in this audit reflect the natural evolution of a maturing codebase: duplicated path constants, a non-atomic config writer whose docstring claims otherwise, an untested config merge function, test files that re-implement source logic instead of importing, and the absence of CI/CD. No High-severity findings remain. The distribution is 1 Medium and 14 Low, indicating the codebase has moved from a remediation phase into a polish phase.

---

## Findings Summary

| ID | Severity | Category | Title |
|----|----------|----------|-------|
| MAINT-07 | Medium | Maintainability | config-io.ts writeJsonConfig Not Atomic Despite Docstring |
| ARCH-05 | Low | Architecture | Duplicated Path Constants Across 4+ Shared Modules |
| MAINT-08 | Low | Maintainability | Unused Imports Across 5 Extension Files |
| MAINT-09 | Low | Maintainability | model-test.ts Still at 1,640 Lines |
| ARCH-06 | Low | Architecture | updateModelsJsonReasoning Bypasses Mutex |
| TEST-04 | Low | Testing | Test Files Re-Implement Source Logic Instead of Importing |
| TEST-05 | Low | Testing | getEffectiveConfig and readTestConfig Have No Dedicated Tests |
| TEST-06 | Low | Testing | formatTestSummary and formatRecommendation Untested |
| ROB-06 | Low | Robustness | config-io.ts readJsonConfig Has Empty Catch Without debugLog |
| FEAT-04 | Low | New Feature | No JSON Schema Validation for Configuration Files |
| FEAT-05 | Low | New Feature | No CI/CD Pipeline |
| ARCH-07 | Low | Architecture | ollama.ts Still Monolithic at 765 Lines |
| PERF-04 | Low | Performance | models.json 2s TTL Cache Can Cause Stale Reads |
| ARCH-08 | Low | Architecture | Duplicate Tests for parseModelIds and ensureProviderOrder |
| PERF-05 | Low | Performance | Batched Context Length Fetching Not Configurable |

No findings in: **Security** (all previous findings resolved; SEC-04 temp directory fix was intentionally reverted per user request).

---

## Detailed Findings

### Maintainability

#### MAINT-07: config-io.ts writeJsonConfig Not Atomic Despite Docstring

| Property | Value |
|----------|-------|
| **Severity** | Medium |
| **Category** | Maintainability |
| **File(s)** | `shared/config-io.ts`, lines 44–47 |

The `writeJsonConfig()` function's docstring states "Uses write-then-rename for crash safety" but the implementation simply calls `fs.writeFileSync(filePath, JSON.stringify(data, null, 2))` with no temporary file or rename step. This means any crash or interruption during the write can leave the config file in a corrupted (partial) state. The `writeModelsJson()` function in `shared/ollama.ts` correctly implements atomic write-then-rename (write to `.tmp` then rename), but `writeJsonConfig()` does not follow this established pattern despite its documentation claiming it does. This is the single Medium-severity finding because a developer trusting the docstring would assume crash safety that does not exist, potentially leading to corrupted configuration files on crash.

Implement actual atomic write-then-rename: write to `${filePath}.tmp`, then `fs.rename()` to the target path. This matches the pattern already used in `writeModelsJson()` and is a straightforward fix.

**Impact:** Prevents config file corruption from partial writes during crashes or interruptions.

---

#### MAINT-08: Unused Imports Across 5 Extension Files

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Maintainability |
| **File(s)** | `extensions/api.ts` (`ConfigError`), `extensions/security.ts` (`SecurityError`, `bytesHuman`), `extensions/diag.ts` (`padRight`), `extensions/openrouter-sync.ts` (`writeModelsJson`) |

Five unused imports were introduced or left behind during refactoring. `ConfigError` was imported into `api.ts` when the typed error classes were added (FEAT-02) but is never referenced. `SecurityError` was similarly imported into `security.ts` but the extension uses `debugLog` and `ctx.ui.notify` for error handling instead of throwing. `bytesHuman` and `padRight` are unused formatter imports in `security.ts` and `diag.ts` respectively. `writeModelsJson` is a dead import in `openrouter-sync.ts` after the migration to `readModifyWriteModelsJson()`. Unused imports add noise, confuse readers about dependencies, and can cause false positives in bundler tree-shaking analysis.

Remove all five unused imports.

**Impact:** Cleans up dead code and reduces confusion about actual module dependencies.

---

#### MAINT-09: model-test.ts Still at 1,640 Lines

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Maintainability |
| **File(s)** | `extensions/model-test.ts` |

The v1.1.8 release extracted `formatTestSummary()`, `formatRecommendation()`, and branding into `shared/test-report.ts` (MAINT-01 from previous audit), reducing model-test.ts from 1,735 to 1,640 lines — a reduction of only 95 lines (~5%). The file remains the largest in the codebase by a significant margin (the next largest is `shared/security.ts` at 1,011 lines). It still contains test orchestration, two full ChatFn wrapper factories (Ollama streaming/non-streaming + provider), display/reporting, and configuration management in a single module. Further extraction opportunities include: `chatfn-wrappers.ts` (ChatFn factory for Ollama and provider), `test-functions.ts` (individual test functions), and `display.ts` (report formatting and output).

Continue the extraction pattern established in 1.1.8 by splitting out the ChatFn factory functions and individual test functions into focused modules.

**Impact:** Further reduces the largest file into navigable, testable modules.

---

### Architecture

#### ARCH-05: Duplicated Path Constants Across 4+ Shared Modules

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Architecture |
| **File(s)** | `shared/config-io.ts` (lines 56–62), `shared/security.ts` (lines 28–45), `shared/model-test-utils.ts`, `shared/ollama.ts` |

The `~/.pi/agent` base directory path is independently constructed via `path.join(os.homedir(), ".pi", "agent", ...)` in at least four shared modules. Specific constants are duplicated: `SETTINGS_PATH` is defined in both `shared/config-io.ts` (line 56) and `shared/security.ts` (line 28) with identical values. `SECURITY_CONFIG_PATH` appears in both `shared/config-io.ts` (line 59) and `shared/security.ts` (line 45). `MODEL_TEST_CONFIG_PATH` is defined in both `shared/config-io.ts` (line 62) and `shared/model-test-utils.ts`. This creates a drift risk: if the config directory location ever changes, all four files must be updated in lockstep. The `shared/config-io.ts` module was specifically created to centralize config path management, but the other modules continue to define their own copies.

Define a single `AGENT_DIR` constant in `shared/config-io.ts` (e.g., `path.join(os.homedir(), ".pi", "agent")`) and export all path constants from there. Update `shared/security.ts`, `shared/model-test-utils.ts`, and `shared/ollama.ts` to import from `shared/config-io` instead of constructing paths independently.

**Impact:** Eliminates path constant duplication and prevents drift if the config directory ever moves.

---

#### ARCH-06: updateModelsJsonReasoning Bypasses Mutex

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Architecture |
| **File(s)** | `extensions/model-test.ts`, function `updateModelsJsonReasoning` |

While both sync extensions (`ollama-sync.ts` and `openrouter-sync.ts`) were fixed in v1.1.8 to use `readModifyWriteModelsJson()` for mutex-protected writes (SEC-01), the `updateModelsJsonReasoning()` function in `model-test.ts` still uses the lower-level `readModelsJson()`/`writeModelsJson()` pair without mutex protection. During a model test run that updates the reasoning field, a concurrent sync operation could interleave with the read-modify-write, causing the reasoning update to be lost or the sync's model list to be partially overwritten. The risk is low because reasoning updates are infrequent (only when test results change) and typically don't overlap with sync operations, but it violates the established pattern.

Replace `readModelsJson()`/`writeModelsJson()` in `updateModelsJsonReasoning()` with `readModifyWriteModelsJson()`.

**Impact:** Ensures all models.json mutations use consistent mutex protection.

---

#### ARCH-07: ollama.ts Still Monolithic at 765 Lines

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Architecture |
| **File(s)** | `shared/ollama.ts` |

The `ollama.ts` module handles multiple distinct responsibilities: models.json I/O with caching and atomic writes, in-memory mutex for concurrent access, retry logic with exponential backoff, Ollama API helpers, model family detection, provider registry, and provider detection. At 765 lines, it combines 6+ concerns that would benefit from separation. Splitting into focused modules (e.g., `ollama-io.ts` for fetch helpers, `provider-registry.ts` for detection and built-in providers, `cache.ts` for TTL cache and atomic writes, `retry.ts` already partially exists conceptually within `withRetry`) would improve testability and navigation. However, since this module is stable and well-tested, this is strictly a maintainability improvement with no correctness impact.

Consider splitting during the next major refactoring cycle. Priority: mutex/cache logic first (most complex), then provider detection.

**Impact:** Improves separation of concerns and testability of the core Ollama integration module.

---

#### ARCH-08: Duplicate Tests for parseModelIds and ensureProviderOrder

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Architecture |
| **File(s)** | `tests/openrouter-sync.test.ts`, `tests/shared-utils.test.ts` |

Both `tests/openrouter-sync.test.ts` and `tests/shared-utils.test.ts` contain inline re-implementations of `parseModelIds` (7 and 8 tests respectively) and `ensureProviderOrder` (6 and 5 tests respectively). The test logic is duplicated rather than importing the actual functions from source, and both files test the same behavior with nearly identical test cases. This duplication doubles the maintenance surface and means any bug fix to the source function must be manually synchronized in both test copies — a process that is error-prone and unlikely to be followed.

Consolidate the duplicate tests into `shared-utils.test.ts` by importing `parseModelIds` and `ensureProviderOrder` from their actual source modules. Remove the re-implemented copies and duplicated tests from `openrouter-sync.test.ts`.

**Impact:** Eliminates test duplication and ensures tests validate actual production code rather than inline copies.

---

### Performance

#### PERF-04: models.json 2s TTL Cache Can Cause Stale Reads

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Performance |
| **File(s)** | `shared/ollama.ts`, TTL cache implementation |

The `models.json` cache uses a 2-second TTL to avoid excessive file reads. While the cache is correctly invalidated on writes (set to null), the 2-second window between a write from one extension and a read from another can still produce stale data if both operations happen within the same TTL window. In practice, this rarely causes issues because the mutex serializes write operations, but read-only consumers that don't participate in the mutex (e.g., status bar polling) can see stale data for up to 2 seconds after a write. For most use cases this is acceptable, but for scenarios where real-time consistency matters (e.g., displaying newly synced models immediately), this gap is noticeable.

Consider using `fs.watch` or tracking file mtime to invalidate the cache on external changes, or reduce the TTL for read-heavy scenarios.

**Impact:** Reduces the stale data window from 2 seconds to near-zero for read-only consumers.

---

#### PERF-05: Batched Context Length Fetching Not Configurable

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Performance |
| **File(s)** | `shared/ollama.ts`, `fetchContextLengthsBatched()` |

Context length fetching uses a hardcoded batch size of 3 concurrent requests. Under high-latency network conditions (e.g., tunneled remote Ollama over Cloudflare Tunnel), a smaller batch might avoid timeouts, while a larger batch could improve throughput on fast connections. The value is not configurable via `model-test-config.json` or any other mechanism. This is a minor optimization opportunity — the current default works well for most scenarios, but power users on constrained networks may benefit from tuning.

Make the concurrency level configurable via `model-test-config.json` with the current 3 as default.

**Impact:** Allows users with constrained network conditions to tune fetch parallelism.

---

### New Features

#### FEAT-04: No JSON Schema Validation for Configuration Files

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | New Feature |
| **File(s)** | `shared/config-io.ts`, `extensions/model-test.ts`, `extensions/api.ts` |

No validation is performed when reading configuration files (`models.json`, `settings.json`, `model-test-config.json`, `security.json`, `react-mode.json`). Malformed or unexpected configuration silently falls back to defaults via `readJsonConfig()`'s empty catch block, producing no error message. While the v1.1.8 release added typed error classes and centralized config I/O, no schema validation layer was added. Integrating a lightweight validation library (e.g., `zod` or manual schema checks) would provide clear error messages for invalid input. The previous audit rated this Medium (FEAT-01), but since the centralized config I/O module now exists and the most critical config bugs (ROB-01, ROB-02) have been fixed, the urgency is reduced.

Add basic shape validation to `readJsonConfig<T>()` that checks for required keys and value types, returning specific error messages when validation fails.

**Impact:** Provides actionable error messages when configuration files are malformed instead of silent fallback.

---

#### FEAT-05: No CI/CD Pipeline

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | New Feature |
| **File(s)** | Project root |

The project still lacks automated testing, linting, or publishing workflows. There is no GitHub Actions configuration, no pre-commit hooks, and no automated quality gates. The existing 6 test files with ~353 test cases provide solid unit coverage, but they must be run manually. The previous audit rated this Medium (FEAT-03), but since the test suite has been significantly expanded in v1.1.8, the baseline is stronger. Adding GitHub Actions for TypeScript type checking, unit test execution, build verification, and publish dry-runs would catch regressions automatically.

Add a GitHub Actions workflow that runs on push/PR: `npm run typecheck`, `npm test`, `./scripts/build-packages.sh all`.

**Impact:** Catches regressions automatically and provides confidence that changes don't break existing functionality.

---

### Testing

#### TEST-04: Test Files Re-Implement Source Logic Instead of Importing

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Testing |
| **File(s)** | `tests/openrouter-sync.test.ts`, `tests/shared-utils.test.ts` |

Both test files contain inline re-implementations of production functions rather than importing from source. `tests/openrouter-sync.test.ts` re-implements `parseModelIds` (URL/model ID extraction) and `ensureProviderOrder` (provider key reordering). `tests/shared-utils.test.ts` re-implements the same two functions plus `mergeModels`, `formatTestScore`, and `getRecommendationLabel`. This means the tests validate the test author's understanding of the logic, not the actual production code. If the source implementation changes but the test copy isn't updated, the test will pass despite the production code being different — a false sense of security.

Refactor tests to import functions from their actual source modules. For `parseModelIds` and `ensureProviderOrder`, this may require extracting them from the extension files into `shared/` or making them exported. For `mergeModels`, `formatTestScore`, and `getRecommendationLabel`, they are already in shared modules and can be imported directly.

**Impact:** Ensures tests validate actual production code rather than inline copies that may drift.

---

#### TEST-05: getEffectiveConfig and readTestConfig Have No Dedicated Tests

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Testing |
| **File(s)** | `shared/model-test-utils.ts` (functions `readTestConfig`, `getEffectiveConfig`) |

The `getEffectiveConfig()` function merges user overrides from `model-test-config.json` with the frozen `CONFIG` defaults, and was the root cause of the ROB-01 bug (rateLimitDelay ignoring user config). Despite this, the function has no dedicated test coverage. `readTestConfig()` — which reads and parses the JSON config file — is also untested. Both functions are declared in the `shared-utils.test.ts` header comment as planned tests but were never implemented. Adding tests for these functions would directly validate the config merge logic and prevent regression of the ROB-01 class of bugs.

Add tests for: config file not found (returns defaults), valid config file (overrides applied), partial config file (missing keys get defaults), invalid JSON (falls back to defaults), and type mismatch handling (string where number expected).

**Impact:** Validates the config merge logic that caused the ROB-01 bug and prevents similar regressions.

---

#### TEST-06: formatTestSummary and formatRecommendation Untested

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Testing |
| **File(s)** | `shared/test-report.ts` (functions `formatTestSummary`, `formatRecommendation`) |

The `formatTestSummary()` and `formatRecommendation()` functions were extracted from `model-test.ts` into `shared/test-report.ts` in v1.1.8, but no tests were written for them. These functions produce the terminal output for the benchmark summary and recommendation sections, and handle edge cases like all-pass, all-fail, and mixed results. While they are pure formatting functions with no side effects (low risk), their untested status means any refactoring of the formatting logic could introduce visual regressions that go unnoticed. The `formatTestScore` function IS tested in `shared-utils.test.ts`, but the higher-level summary and recommendation formatters are not.

Add tests for `formatTestSummary` and `formatRecommendation` covering: all tests passed, all failed, mixed results, empty test array, and the recommendation label logic for each tier (STRONG/GOOD/USABLE/WEAK).

**Impact:** Ensures benchmark report formatting remains correct after refactoring.

---

### Robustness

#### ROB-06: config-io.ts readJsonConfig Has Empty Catch Without debugLog

| Property | Value |
|----------|-------|
| **Severity** | Low |
| **Category** | Robustness |
| **File(s)** | `shared/config-io.ts`, line 37 |

The v1.1.8 release replaced ~20 empty catch blocks across the codebase with `debugLog()` calls (ROB-03), but missed one: `readJsonConfig()` in `shared/config-io.ts` has `catch { /* read failure is non-critical */ }` with no `debugLog()` call. This is the centralized config reader used by all extensions that import from `config-io`. While the comment explains why suppression is acceptable (the caller receives a defaultValue), the lack of logging means that config file read failures are completely invisible even in debug mode. A corrupted `settings.json` or permission-denied error on `security.json` would be silently swallowed with no diagnostic output.

Add `debugLog("config-io", "Failed to read config: " + filePath, error)` to the catch block, consistent with the pattern established across the rest of the codebase in v1.1.8.

**Impact:** Provides debug-mode visibility into config file read failures that are currently completely invisible.

---

## Priority Matrix

| Timeline | Findings |
|----------|----------|
| **Near term (v1.1.8–v1.1.9)** | MAINT-07 (config-io atomic write), ROB-06 (readJsonConfig debugLog), MAINT-08 (unused imports) |
| **Short term (v1.1.9–v1.2.0)** | ARCH-05 (duplicated paths), ARCH-06 (updateModelsJsonReasoning mutex), TEST-04 (test reimplementation), TEST-05 (getEffectiveConfig tests), TEST-06 (test-report tests), ARCH-08 (duplicate tests) |
| **Medium term (v1.2.0+)** | MAINT-09 (split model-test.ts), ARCH-07 (modularize ollama.ts), FEAT-04 (config schema validation), FEAT-05 (CI/CD pipeline), PERF-04 (cache coherence), PERF-05 (configurable batching) |

---

## Architecture Strengths

The v1.1.8 release represents a significant maturation of the codebase architecture. Several patterns that were strengths in the previous audit have been reinforced and extended.

The **shared module layer** has grown from 7 to 11 subpath exports with the addition of `config-io`, `errors`, `provider-sync`, and `test-report`. Each extraction followed a clear pattern: identify duplicated or tightly-coupled logic, extract to a pure function module, and update consumers to import from the shared location. The `shared/config-io.ts` module eliminated the duplicated `readSettings`/`writeSettings` pattern that existed in `api.ts`. The `shared/provider-sync.ts` module eliminated the model merge duplication between `ollama-sync.ts` and `openrouter-sync.ts`. The `shared/errors.ts` module replaced raw string throws with a structured, catchable error hierarchy.

The **security layer** in `shared/security.ts` has been hardened with four significant improvements: crash-safe audit log flushing via `process.on("exit")` handler, IPv6-mapped IPv4 SSRF bypass protection, Unicode NFKC normalization for homoglyph attack prevention, and restricted temp directory writes. The partitioned security model (41 CRITICAL always blocked + 25 EXTENDED max-only) with mode-aware SSRF patterns provides flexible enforcement without sacrificing safety. The `validatePath()` function with `fs.realpathSync()` symlink dereferencing prevents classic path traversal bypasses. The DNS rebinding protection via `dns.lookup()` adds defense-in-depth against time-of-check-to-time-of-use attacks.

The **concurrency model** established in v1.1.7 with `readModifyWriteModelsJson()` has been correctly adopted by both sync extensions in v1.1.8. The mutex pattern — an in-memory promise chain — is simple, effective, and correctly prevents lost-write races when multiple extensions modify `models.json` concurrently.

The **testing infrastructure** has grown substantially. Test count increased from ~80 to ~353 across 6 test files (2 new: `openrouter-sync.test.ts` and `shared-utils.test.ts`). The `security.test.ts` file expanded to 1,079 lines with 146 tests covering all major security subsystems. The `shared-utils.test.ts` added 37 tests covering the new typed error classes, provider sync, and test report formatting. All empty catch blocks were replaced with `debugLog()` calls, making error paths observable in debug mode.

The **inter-extension communication** was cleaned up by removing the `pi._reactParser` hack in favor of direct imports from `shared/react-parser`. This eliminated the fragile `(pi as any)._reactParser` pattern and the fallback logic in `model-test.ts`, making the communication path explicit and type-safe.
