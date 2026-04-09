# Changelog

All notable changes to the Pi Coding Agent Extensions (`@vtstech/pi-coding-agent-extensions`) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.2] - Unreleased

### Added

- **Built-in provider detection** (`diag.ts`, `model-test.ts`)
  - Added `BUILTIN_PROVIDERS` registry mapping 11 known cloud providers (openrouter, anthropic, google, openai, groq, deepseek, mistral, xai, together, fireworks, cohere) to their API modes, base URLs, and environment variable keys.
  - Three-tier provider detection logic: user-defined (models.json) → built-in registry → unknown fallback. This resolves the issue where `diag.ts` reported "API mode: unknown" for built-in providers like OpenRouter.

- **Cloud provider model testing** (`model-test.ts`)
  - New `detectProvider()` function that classifies the active model's provider as `ollama`, `builtin`, or `unknown` using the same three-tier detection as `diag.ts`.
  - New `providerChat()` function for making OpenAI-compatible chat completions API calls to cloud providers using native `fetch()`.
  - New `testConnectivity()` test that verifies API reachability and authentication for cloud providers (ping with "Reply: PONG", 30s timeout).
  - New `testReasoningProvider()` — cloud-aware version of the snail puzzle reasoning test, using `providerChat()` instead of Ollama's `/api/chat`.
  - New `testToolUsageProvider()` — cloud-aware version of the tool usage test using OpenAI function calling format.
  - Provider-aware main test runner: when the active model is on a built-in provider (not Ollama), the extension automatically runs the cloud provider test suite (connectivity, reasoning, tool usage) instead of the Ollama-only tests.
  - `CONFIG.PROVIDER_TIMEOUT_MS` (2 min) and `CONFIG.PROVIDER_TOOL_TIMEOUT_MS` (60s) settings for cloud provider API timeouts.

- **Tool support cache** (`model-test.ts`)
  - Persistent cache at `~/.pi/agent/cache/tool_support.json` to avoid re-probing models on every run.
  - `readToolSupportCache()`, `writeToolSupportCache()`, `getCachedToolSupport()`, and `cacheToolSupport()` utilities.
  - Cache entries include support level, test timestamp, and model family for validation.

- **`readModelsJson()` utility** (`shared/ollama.ts`)
  - Convenience function to read and parse Pi's `models.json` with graceful fallback to an empty structure.

### Changed

- **API mode detection** (`diag.ts`)
  - Replaced single-tier provider lookup (models.json only) with three-tier detection.
  - Built-in providers now display as `API mode: openai-completions (built-in: openrouter)` instead of `API mode: unknown — provider 'openrouter' not found in models.json`.
  - Base URLs for built-in providers are now resolved and displayed in the diagnostic output.

### Fixed

- **Matrix theme crash** (`themes/matrix.json`)
  - Added `"yellow": "#eeff00"` to the Matrix theme's color vars. The `status.ts` extension calls `theme.fg("yellow", ...)` for the active tool timer, which threw `Error: Unknown theme color` when running with the Matrix theme.

- **Terminal slow startup** (documented fix)
  - Identified `source <(openclaw completion --shell bash)` in `.bashrc` as the cause of slow terminal launches (spawns Node.js process on every terminal open). Fix: comment out the line or generate a static completion file.

---

## [1.0.0] - 2026-04

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

- **Model testing extension** (`extensions/model-test.ts`)
  - Ollama model testing with reasoning (snail puzzle), thinking/reasoning tokens, tool usage, and ReAct parsing tests.
  - Scoring system: STRONG, MODERATE, WEAK, FAIL, ERROR.
  - Thinking model fallback (retries with `think: true` for empty responses).
  - `/model-test` slash command and `model_test` tool registration.

- **Ollama sync extension** (`extensions/ollama-sync.ts`)
  - Automatic synchronization between pulled Ollama models and Pi's `models.json`.
  - `/ollama-sync` slash command for manual triggering.

- **Diagnostics extension** (`extensions/diag.ts`)
  - Full system diagnostic: OS, CPU, RAM, disk, Ollama (local/remote), models.json validation, extension listing, theme validation, security posture checks.
  - Remote Ollama support via HTTP probing instead of CLI.
  - `/diag` slash command and `self_diagnostic` tool registration.

- **System monitor / status bar** (`extensions/status.ts`)
  - Replaces Pi's default footer with a unified 2-line status bar.
  - Line 1: pwd, git branch, model, thinking level, context usage, CPU/RAM/Swap, Ollama VRAM, response time, generation params, security indicators.
  - Line 2: Active tool timing with live elapsed timer.
  - 3-second metric refresh cycle with CPU usage tracking.
  - Security flash indicator (3s) for blocked tools + persistent blocked count from audit log.

- **Matrix theme** (`themes/matrix.json`)
  - Green-screen hacker aesthetic with phosphor, glow, and fade green variants.
  - Complete coverage: accent, borders, markdown, syntax highlighting, diff, thinking levels.

- **Shared utilities** (`shared/`)
  - `format.ts` — Section headers, indicators (ok/fail/warn/info), numeric formatters (bytes, ms, percentages), string utilities (truncate, sanitize, padRight).
  - `ollama.ts` — Ollama base URL resolution (3-tier: models.json → OLLAMA_HOST → localhost), models.json I/O, model family detection, Ollama API helpers.
  - `security.ts` — Command blocklist, SSRF patterns, path validation, URL validation, command sanitization, audit logging, tool input security checks.
  - `types.ts` — Custom error classes (OllamaConnectionError, ModelTimeoutError, EmptyResponseError, SecurityBlockError, ToolParseError), type definitions (ToolSupportLevel, StepResultType, AuditEntry, etc.).

### Infrastructure

- `package.json` configured as a Pi extension package with `pi.extensions` and `pi.themes` entry points.
- MIT license.
