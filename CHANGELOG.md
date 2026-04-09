# Changelog

All notable changes to the Pi Coding Agent Extensions (`@vtstech/pi-coding-agent-extensions`) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
