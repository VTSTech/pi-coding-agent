# PCA-EXT Project Brief

**Generated:** 2026-05-07  
**Project:** pca-ext (@vtstech/pi-coding-agent-extensions)  
**Version:** 1.2.3  
**Type:** Pi Coding Agent extensions package  
**Repository:** https://github.com/VTSTech/pi-coding-agent

## Project Overview

A comprehensive Pi package providing 9 extensions for the Pi Coding Agent, optimized for resource-constrained environments like Google Colab (CPU-only, 12GB RAM) with Ollama local models and cloud providers. Extensions include security, diagnostics, model benchmarking, synchronization tools, and system monitoring.

## Tech Stack

- **Language:** TypeScript (strict mode, ES2022 target)
- **Runtime:** Node.js
- **Build:** esbuild for bundling, npm workspaces
- **Package Format:** Pi package with individual npm packages
- **Testing:** tsx test runner

## Directory Structure

```
pca-ext/
├── extensions/          # 9 main extension files
├── shared/             # Shared utilities and types
├── individual-packages/ # Source for npm packages
├── themes/             # UI themes (Matrix theme)
├── dist/               # Built packages
├── scripts/            # Build and version scripts
└── tests/              # Test files
```

## Critical Files Index

### Core Extensions (extensions/)
- **api.ts** (30KB) - API mode switcher, URL management, thinking settings
- **diag.ts** (29KB) - System diagnostic suite with security validation
- **model-test.ts** (66KB) - Model benchmarking for Ollama and cloud providers
- **security.ts** (21KB) - Command/path/SSRF protection with 3 security modes
- **soul.ts** (25KB) - SoulSpec persona management with progressive disclosure
- **status.ts** (19KB) - System resource monitor with status bar integration
- **ollama-sync.ts** (11KB) - Ollama ↔ models.json synchronization
- **openrouter-sync.ts** (11KB) - OpenRouter → models.json synchronization
- **react-fallback.ts** (13KB) - ReAct fallback for non-native tool models

### Shared Utilities (shared/)
- **ollama.ts** (27KB) - Ollama API helpers, provider detection, retry logic
- **security.ts** (45KB) - Security validation, SSRF protection, audit logging
- **model-test-utils.ts** (26KB) - Test utilities, config, history management
- **react-parser.ts** (21KB) - Multi-dialect ReAct text parser
- **types.ts** (4KB) - TypeScript types and error classes

### Configuration
- **package.json** - Pi package manifest with extensions/themes paths
- **tsconfig.json** - Strict TypeScript configuration
- **package-workspace.json** - npm workspace configuration

## Entry Points

### Primary Entry Points
- **Pi Package:** `pi install git:github.com/VTSTech/pi-coding-agent`
- **Individual Extensions:** `pi install npm:@vtstech/pi-<extension>`

### CLI Commands
- `/diag` - System diagnostic suite
- `/model-test [model]` - Model benchmarking
- `/security mode [basic|max|off]` - Security mode toggle
- `/souls` / `/soul <name>` - SoulSpec persona management
- `/ollama-sync [url]` - Ollama model synchronization
- `/openrouter-sync <ids...>` - OpenRouter model synchronization
- `/api [mode|url|think]` - API configuration

## Key Features

### Security Layer
- 3 security modes: basic, max, off
- 41 critical command blocks + 25 extended blocks
- SSRF protection with 22 always-blocked + 7 max-only URL patterns
- Path validation with symlink dereferencing
- Audit logging to ~/.pi/agent/audit.log

### Model Testing
- Supports Ollama and 11 cloud providers (OpenRouter, Anthropic, Google, etc.)
- 6 test categories for Ollama, 4 for cloud providers
- Automatic provider detection and URL resolution
- Tool support caching and thinking token fallback

### System Integration
- Status bar integration with CPU/RAM/swap monitoring
- Progressive disclosure for personas (Level 1-3)
- Remote Ollama support via tunnel URL auto-detection
- Matrix theme with neon green aesthetics

## Known Landmines

1. **ReAct Mode Default:** ReAct fallback is disabled by default (persistent config at ~/.pi/agent/react-mode.json)
2. **Security Mode Default:** Starts in max mode if ~/.pi/agent/security.json doesn't exist
3. **Remote Ollama:** URLs are auto-saved to models.json after sync
4. **Tool Support:** Some models require ReAct mode to function properly
5. **Memory Constraints:** Ollama models optimized for 12GB RAM environments

## Request Lifecycle

1. **Extension Loading:** Pi discovers extensions/ and themes/ directories
2. **Security Check:** Commands validated against security mode and blocklists
3. **Provider Resolution:** models.json → built-in registry → fallback
4. **Tool Execution:** Security validation → tool execution → audit logging
5. **Status Updates:** System metrics updated every 5s (1s during active tools)

## Configuration Files

- **~/.pi/agent/security.json** - Security mode and audit settings
- **~/.pi/agent/react-mode.json** - ReAct fallback toggle
- **~/.pi/agent/cache/tool_support.json** - Model tool support cache
- **models.json** - Provider and model configuration
- **~/.pi/agent/audit.log** - Security audit log (JSON Lines)