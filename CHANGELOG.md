# Changelog

All notable changes to the Pi Coding Agent Extensions (`@vtstech/pi-coding-agent-extensions`) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
