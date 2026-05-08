# Pi Coding Agent Extensions — Intelligence Brief

*Generated: 2026-05-08*
*Codebase: pca-ext (v1.2.6)*

---

## Project Overview

`@vtstech/pi-coding-agent-extensions` is a **Pi Package** providing custom extensions, themes, and configurations for the [Pi Coding Agent](https://github.com/badlogic/pi-mono). It's optimized for resource-constrained environments like Google Colab (CPU-only, 12GB RAM) with Ollama serving small local models (0.3B–2B parameters), and cloud providers via OpenRouter.

**Primary Use Cases:**
- Model benchmarking across Ollama and 11 cloud providers
- Security layer (command blocklist, SSRF protection, path validation)
- System diagnostics and resource monitoring
- ReAct fallback for non-native tool models
- SoulSpec persona management

---

## Architecture

```
pca-ext/
├── extensions/          # 9 main extension files (default exports)
│   ├── model-test.ts    # Model benchmark suite (Ollama + cloud providers)
│   ├── security.ts      # Security layer (commands, SSRF, paths)
│   ├── diag.ts          # System diagnostics suite
│   ├── status.ts        # Resource monitor + status bar
│   ├── api.ts           # API mode switcher (mode, URL, thinking, compat)
│   ├── ollama-sync.ts   # Ollama ↔ models.json sync
│   ├── openrouter-sync.ts # OpenRouter → models.json sync
│   ├── react-fallback.ts # Text-based tool calling bridge
│   └── soul.ts          # SoulSpec persona loader
├── shared/              # Shared utilities (no relative imports across shared/)
│   ├── security.ts      # Core security logic (1,230 lines)
│   ├── ollama.ts        # Ollama/Provider utilities (789 lines)
│   ├── model-test-utils.ts # Test utilities (812 lines)
│   ├── format.ts        # ANSI formatting helpers (401 lines)
│   ├── react-parser.ts  # Multi-dialect ReAct parser (552 lines)
│   ├── types.ts         # TypeScript types
│   ├── errors.ts        # Typed error classes
│   └── config-io.ts     # JSON config read/write helpers
├── tests/               # 6 test files (ts-test)
├── themes/              # Matrix JSON theme
└── individual-packages/ # Source for 9 npm packages
```

---

## Critical Files Index

### Extensions (Entry Points)

| File | Purpose | Key Functions |
|------|---------|---------------|
| `extensions/model-test.ts` | Model benchmarking | `testModelOllama()`, `testModelProvider()`, `testReasoning()`, `testToolUsage()` |
| `extensions/security.ts` | Security layer | `sanitizeCommand()`, `validatePath()`, `isSafeUrl()` |
| `extensions/diag.ts` | System diagnostics | `runDiagnostics()` |
| `extensions/status.ts` | Status bar | `updateMetrics()`, `renderStatusBar()` |
| `extensions/api.ts` | API switcher | `setMode()`, `setUrl()`, `setThink()` |
| `extensions/ollama-sync.ts` | Ollama sync | `syncOllamaModels()` |
| `extensions/openrouter-sync.ts` | OpenRouter sync | `syncOpenRouterModels()` |
| `extensions/react-fallback.ts` | ReAct fallback | `parseReactText()` |
| `extensions/soul.ts` | SoulSpec personas | `loadSoul()`, `listSouls()` |

### Shared Modules

| File | Lines | Purpose | Critical Constants |
|------|-------|---------|-------------------|
| `shared/security.ts` | 1,230 | Security validation | `CRITICAL_COMMANDS` (41), `EXTENDED_COMMANDS` (25), `BLOCKED_URL_ALWAYS` (22), `BLOCKED_URL_MAX_ONLY` (7) |
| `shared/ollama.ts` | 789 | Provider detection, mutexes | `EXTENSION_VERSION`, `BUILTIN_PROVIDERS` (11 providers), `acquireModelsJsonLock()` |
| `shared/model-test-utils.ts` | 812 | Test helpers, cache | `CONFIG`, `WEATHER_TOOL_DEFINITION`, `readToolSupportCache()` |
| `shared/react-parser.ts` | 552 | ReAct dialect parsing | `ALL_DIALECT_PATTERNS`, `parseReactWithPatterns()` |
| `shared/format.ts` | 401 | ANSI formatting | `ok()`, `fail()`, `warn()`, `info()`, `section()` |

---

## Security Model

### Command Blocklist (Partitioned)

| Mode | Commands Blocked |
|------|------------------|
| **Always Blocked (CRITICAL)** | 41 commands (mkfs, dd, shred, rm, sudo, wget, curl, apt, npm, ssh, kill, chmod, chown, etc.) |
| **Max Mode Only (EXTENDED)** | 25 additional commands (rm, del, sudo, wget, curl, apt, pip, npm, systemctl, vi, git) |
| **Basic Mode** | CRITICAL only; localhost URLs allowed |
| **Off Mode** | All security checks bypassed |

### SSRF Protection

- **Always Blocked:** Cloud metadata IPs (169.254.169.254), RFC1918 ranges (10.x, 192.168.x, 172.16-31.x)
- **Max Mode Only:** localhost, 127.x, 0.0.0.0, ::1
- **DNS Rebinding:** Detected via `resolveAndCheckHostname()`

### Path Validation

- Blocked: `/etc`, `/root`, `/usr`, `/bin`, `/sbin`, `/boot`, `/dev`, `/proc`, `/sys`, `/var`
- Sensitive: `.ssh/`, `.gnupg/`, shadow, passwd
- **Symlink Escapes:** Detected via `fs.realpathSync()` boundary validation (SEC-01 fix)
- Allowed: `/home`, `/tmp`, cwd (basic) or `~/.pi/agent/tmp/` (SEC-04)

---

## Known Landmines

### 1. **Empty `brief.md` causes audit loop** 
If `brief.md` exists but is empty/whitespace, audit mode runs instead of load mode. The file at `/workspace/brief.md` was 0 bytes.

### 2. **Security: Off mode path validation not bypassed for all operations**
While `checkBashToolInput`, `checkFileToolInput`, and `checkHttpToolInput` all check `mode === "off"` early, custom tools calling shared validators directly must pass the mode parameter. Some internal callers may miss this.

### 3. **Race condition window in models.json updates**
The `readModifyWriteModelsJson` mutex prevents concurrent access, but if a process reads `models.json` directly (bypassing the API) while a sync is in progress, it may see partial state.

### 4. **Context window display discrepancy**
`status.ts` shows "CtxMax + RespMax" combined, but native context length is fetched via `/api/show` in `ollama-sync.ts`. The display value may differ from what Ollama actually uses if `num_ctx` is set in model options.

### 5. **Tool support cache can grow unbounded before cleanup**
Cache cleanup triggers at 90% of `MAX_CACHE_SIZE` (1000), but with concurrent extensions adding entries, the cache could temporarily exceed limits before the next check.

### 6. **ReAct parsing dialect detection order matters**
`ALL_DIALECT_PATTERNS` checks dialects in order. If a model mixes patterns (e.g., "Action:" then "Function:"), only the first match is used.

---

## Request Lifecycle

### Ollama Model Test Flow

```
/model-test qwen3:0.6b
    └─► ExtensionAPI slash command
        └─► getCurrentModel() → "qwen3:0.6b"
        └─► detectProvider() → {kind: "ollama", ...}
        └─► testModelOllama()
            ├─► testReasoning() → ollamaChat() → /api/chat
            ├─► testThinking() → ollamaChat({think:true}) → /api/chat
            ├─► testToolUsage() → makeOllamaToolChatFn() → /api/chat with tools
            ├─► testReactParsing() → /api/chat (no tools)
            ├─► testInstructionFollowing() → ollamaChat() → /api/chat
            └─► testToolSupport() → /api/chat, cache to ~/.pi/agent/cache/tool_support.json
        └─► updateModelsJsonReasoning() → readModifyWriteModelsJson()
```

### Security Check Flow (Bash Tool)

```
bash tool call
    └─► checkBashToolInput()
        ├─► sanitizeCommand()
        │   ├─► Unicode normalize (NFKC)
        │   ├─► Strip control chars
        │   ├─► Check injection patterns (;, $(), backticks)
        │   ├─► Split on &&, ||, |
        │   └─► Check each sub-command against CRITICAL/EXTENDED blocklists
        └─► appendAuditEntry() → buffered write to ~/.pi/agent/audit.log
```

---

## Development Quick Reference

```bash
# Run tests
npm run test

# Type check
npm run typecheck

# Build individual packages (scripts/build-tgz.sh)
# Install from git
pi install git:github.com/VTSTech/pi-coding-agent

# Install individual npm packages
pi install npm:@vtstech/pi-model-test
```

---

## Extension Points

| Hook | Purpose | Extensions Using |
|------|---------|------------------|
| `session_start` | Initialize per-session state | status, security, model-test |
| `session_shutdown` | Cleanup timers, flush buffers | status, security |
| `tool_call` | Pre-validate tool inputs | security |
| `tool_result` | Post-process results | status (timing) |
| `agent_start` / `agent_end` | Track duration | status (Resp timer) |

---

*End of Brief*
*For detailed findings, see `audit.md`*