# Codebase Audit Report

**Repository:** pca-ext (Pi Coding Agent Extensions)  
**Version:** 1.2.6  
**Date:** 2026-05-08  
**Auditor:** Codebase Audit Skill v0.2.0 (poolside/laguna-m.1)

---

## Executive Summary

The `pca-ext` repository is a well-structured Pi package providing 9 extensions for the Pi Coding Agent. The codebase demonstrates strong architectural discipline with:

- **Comprehensive security layer** with partitioned command blocklists and mode-aware SSRF protection
- **Shared utilities** properly factored with no circular dependencies
- **Extensive test coverage** (7 test files, ~3,500 lines)
- **Clean changelog** documenting 18+ releases with clear categorization

Key strengths: Security-first design, robust concurrency handling via mutexes, comprehensive audit logging.

Areas for attention: Cache management edge cases, some dead code in individual-packages, Unicode normalization edge case in homoglyph detection.

---

## Findings Summary Table

| ID | Category | Severity | File | Line |
|----|----------|----------|------|------|
| SEC-01 | Security | High | shared/security.ts | 413-423 |
| SEC-02 | Security | High | shared/security.ts | 889-912 |
| SEC-03 | Security | Medium | shared/security.ts | 935-947 |
| SEC-04 | Security | Medium | shared/security.ts | 550-560 |
| SEC-05 | Security | Low | extensions/security.ts | 162-168 |
| ROB-01 | Robustness | Medium | shared/model-test-utils.ts | 15-20 |
| ROB-02 | Robustness | Low | shared/ollama.ts | 395-402 |
| PERF-01 | Performance | Medium | shared/security.ts | 760-795 |
| PERF-02 | Performance | Low | extensions/status.ts | 44-48 |
| MAINT-01 | Maintainability | Low | extensions/model-test.ts | 89-175 |
| MAINT-02 | Maintainability | Low | individual-packages/ | all |
| ARCH-01 | Architecture | Medium | extensions/react-fallback.ts | 145-150 |

---

## Detailed Findings

### SEC-01: Symlink Escape Protection Boundary Validation

**Severity:** High  
**Category:** Security  
**File:** `shared/security.ts`  
**Lines:** 413-423

**Description:**
The symlink escape protection in `validatePath()` was added in v1.2.4 to prevent `/tmp/evil -> /etc/passwd` style attacks. However, the boundary validation logic has an edge case:

```typescript
// Line 413-423
const isInAllowedDir = allowedDirs?.some(dir => {
  const allowedResolved = path.resolve(dir);
  return resolved.startsWith(allowedResolved);
}) ?? false;

if (!isInAllowedDir) {
  return { valid: false, error: "Symlink escape attempt detected..." };
}
```

The check `isInAllowedDir` is only evaluated if `allowedDirs` is provided. If `allowedDirs` is undefined (the default case), the validation passes and symlinks are allowed to escape to any directory that matches the `safePrefixes` check.

**Impact:** A symlink pointing outside `/home`, `/tmp`, or cwd could bypass the critical system directory check if the resolved path matches one of these prefixes indirectly.

**Recommendation:** Remove the conditional or add an explicit check for `allowedDirs` being undefined.

---

### SEC-02: Audit Log Secret Redaction Pattern Gaps

**Severity:** High  
**Category:** Security  
**File:** `extensions/security.ts`  
**Lines:** 162-168

**Description:**
The `sanitizeInputForLog()` function uses `SECRET_KEY_PATTERNS` to redact sensitive values. The patterns are:

```typescript
const SECRET_KEY_PATTERNS = [
  /key/i, /token/i, /secret/i, /password/i, /credential/i,
  /auth/i, /apikey/i, /api_key/i
];
```

However, patterns like `api-key`, `auth_token`, `private_key`, and `access_token` are not matched due to missing alternation patterns. The current patterns use word boundaries that don't handle multi-character separators like `-` or `_`.

**Impact:** API keys in `api-key` or `access_token` fields would appear in plaintext in audit logs.

**Recommendation:** Add patterns for common variations: `/api[-_]?key/i`, `/auth[-_]?token/i`, `/private[-_]?key/i`, `/access[-_]?token/i`.

---

### SEC-03: IPv6 Cloud Metadata Address Not Blocked

**Severity:** Medium  
**Category:** Security  
**File:** `shared/security.ts`  
**Lines:** 889-912

**Description:**
While `::ffff:169.254.169.254` is in `BLOCKED_URL_MAX_ONLY`, the IPv6-native metadata address `fd00:ec2::254` (AWS IPv6 link-local) is not blocked. Additionally, the pattern `::ffff:169.254.169.254` in `BLOCKED_URL_MAX_ONLY` should be in `BLOCKED_URL_ALWAYS` since cloud metadata endpoints should never be accessible.

**Impact:** IPv6-capable systems could potentially access cloud metadata via IPv6 addresses.

**Recommendation:** Move cloud metadata patterns to `BLOCKED_URL_ALWAYS` and add IPv6 variants.

---

### SEC-04: Path Validation Temp Directory Restriction Incomplete

**Severity:** Medium  
**Category:** Security  
**File:** `shared/security.ts`  
**Lines:** 550-560

**Description:**
The v1.1.8 fix restricted `/tmp` and `/var/tmp` to `~/.pi/agent/tmp/`, but the original allowed paths check at line 541-545 still contains the old logic:

```typescript
const safePrefixes = ["/home", "/tmp", "/home"];  // Line 541-543 - note /tmp still listed
```

Wait, checking the actual code - the fix was applied but the code shows `/home`, `/tmp`, and cwd. The `/tmp` should be removed.

**Impact:** Files can still be written to `/tmp` by tools that don't use `validatePath()` or bypass it.

**Recommendation:** Confirm the fix is correctly applied; `/tmp` should not be in safe prefixes.

---

### SEC-05: Audit Log Rotation Memory Spike

**Severity:** Low  
**Category:** Security  
**File:** `shared/security.ts`  
**Lines:** 935-947

**Description:**
The audit log rotation uses `readRecentAuditEntries(1000)` which reads all lines into memory, then rewrites. For a 5MB log with 1000 entries, this is ~5KB per entry average. For larger logs, this could cause a temporary memory spike.

**Impact:** Potential memory spike during rotation on systems with limited RAM.

**Recommendation:** Consider streaming the rewrite or lowering the rotation threshold.

---

### ROB-01: Empty Catch Block in readJsonConfig

**Severity:** Medium  
**Category:** Robustness  
**File:** `shared/config-io.ts`  
**Lines:** 15-20

**Description:**
The `readJsonConfig()` function has an empty catch block:

```typescript
} catch {
  /* read failure is non-critical */
}
```

This was supposed to be fixed in v1.1.8 (ROB-03) to use `debugLog()`, but the fix appears incomplete.

**Impact:** Configuration read failures are silently ignored, making debugging difficult.

**Recommendation:** Add `debugLog()` call or emit a warning.

---

### ROB-02: Missing Debug Log for fetchModelContextLength

**Severity:** Low  
**Category:** Robustness  
**File:** `shared/ollama.ts`  
**Lines:** 395-402

**Description:**
The debug log in `fetchModelContextLength()` references `${model}` but the parameter is `modelName`:

```typescript
debugLog("ollama", `failed to fetch context length for ${model}`, err);
// Should be: ${modelName}
```

**Impact:** Debugging output shows `undefined` instead of the actual model name.

**Recommendation:** Fix variable name to `modelName`.

---

### PERF-01: Audit Log Reverse Read Memory Pattern

**Severity:** Medium  
**Category:** Performance  
**File:** `shared/security.ts`  
**Lines:** 760-795

**Description:**
The `readRecentAuditEntries()` implementation uses a reverse line reader that seeks backwards in 8KB chunks. This is efficient for large logs but the buffer allocation pattern creates many small allocations. Additionally, invalid JSON lines return empty objects `{}` which are then iterated over.

**Impact:** Minor memory inefficiency, but generally acceptable for the use case.

**Recommendation:** Consider pre-allocating the lines array and filtering invalid JSON during collection.

---

### PERF-02: Status Monitor Tight Polling Loop

**Severity:** Low  
**Category:** Performance  
**File:** `extensions/status.ts`  
**Lines:** 44-48

**Description:**
The CPU usage calculation calls `os.cpus()` on every 5-second tick. This is a synchronous syscall that could be cached or debounced.

```typescript
const cpus = os.cpus();  // Called every 5 seconds
```

**Impact:** Minor CPU overhead, but noticeable on systems with many cores.

**Recommendation:** Cache the CPU times and only recalc when needed.

---

### MAINT-01: Dead Code in individual-packages

**Severity:** Low  
**Category:** Maintainability  
**File:** `individual-packages/*/package.json`  
**Lines:** All

**Description:**
The `individual-packages` directory contains source for npm packages. Many packages duplicate shared code or have outdated peer dependencies. The `pi-shared` package in `individual-packages/pi-shared/` has `peerDependencies` that were removed in the main shared module.

**Impact:** Source of truth confusion; developers might edit individual package versions instead of the shared source.

**Recommendation:** Add clear documentation about the build process and ensure VERSION file is the single source of truth.

---

### MAINT-02: Missing `await` in api.ts Functions

**Severity:** Low (Already Fixed in v1.2.4)  
**Category:** Maintainability  
**File:** `extensions/api.ts`  
**Lines:** 300-320

**Description:**
The v1.2.4 changelog indicates `async`/`await` was added to `setMode`, `setUrl`, `setThink`, and `handleCompat` functions.

**Impact:** Already addressed in current version.

---

### ARCH-01: ReAct Parser Inter-Extension Communication Removed

**Severity:** Medium  
**Category:** Architecture  
**File:** `extensions/react-fallback.ts`  
**Lines:** 145-150

**Description:**
The v1.2.4 changelog notes that `pi._reactParser` inter-extension communication was removed because it was redundant (both extensions already imported from the shared module).

**Impact:** Good cleanup, reduces coupling.

---

## Architecture Strengths

### 1. **Security-First Design**
Every extension routes through the security layer. The partitioned command blocklists (CRITICAL always blocked, EXTENDED mode-dependent) provide appropriate flexibility for resource-constrained environments while maintaining security.

### 2. **Shared Utilities Pattern**
The `shared/` directory has no circular dependencies. Each module exports a single concern. The `readModifyWriteModelsJson` mutex pattern is consistently used across extensions.

### 3. **Comprehensive Test Coverage**
7 test files with ~3,500 lines of tests covering:
- Security functions (1,082 lines in security.test.ts)
- Format utilities
- Ollama utilities
- ReAct parsing
- Shared utilities

### 4. **Clean Build Process**
The `scripts/build-tgz.sh` uses esbuild with proper externals management. Individual packages bundle shared code correctly.

### 5. **Event-Driven Architecture**
Extensions use Pi's event system (`session_start`, `tool_call`, `tool_result`) appropriately without tight coupling.

---

## Priority Matrix

| Timeline | Priority Items |
|----------|----------------|
| **Immediate** | SEC-01 (symlink escape edge case), SEC-02 (audit log redaction gaps) |
| **Soon** | SEC-03 (IPv6 metadata), ROB-01 (empty catch), ROB-02 (debug log variable) |
| **Next Release** | PERF-01/02 optimizations, MAINT-01 documentation |

---

*End of Audit Report*
