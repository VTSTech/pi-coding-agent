# PCA-EXT Project Brief

**Generated:** 2026-05-07  
**Project:** pca-ext (@vtstech/pi-coding-agent-extensions)  
**Version:** 1.2.5  
**Type:** Pi Coding Agent extensions package  
**Repository:** https://github.com/VTSTech/pi-coding-agent

## Project Overview

A comprehensive Pi package providing 9 extensions for the Pi Coding Agent, optimized for resource-constrained environments like Google Colab (CPU-only, 12GB RAM) with Ollama local models and cloud providers. Extensions include security, diagnostics, model benchmarking, synchronization tools, and system monitoring. All extensions battle-tested on real hardware with local Ollama models and cloud providers.

## Tech Stack

- **Language:** TypeScript (strict mode, ES2022 target)
- **Runtime:** Node.js
- **Build:** esbuild for bundling, npm workspaces
- **Package Format:** Pi package with individual npm packages
- **Testing:** tsx test runner
- **Framework:** Pi Coding Agent v0.66+ (@earendil-works/pi-coding-agent)

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
- **api.ts** (30KB) - API mode switcher, URL management, thinking settings, compat flags
- **diag.ts** (29KB) - System diagnostic suite with security validation
- **model-test.ts** (66KB) - Model benchmarking for Ollama and 11 cloud providers
- **security.ts** (21KB) - Command/path/SSRF protection with 3 security modes
- **soul.ts** (25KB) - SoulSpec persona management with progressive disclosure
- **status.ts** (19KB) - System resource monitor with status bar integration
- **ollama-sync.ts** (11KB) - Ollama ↔ models.json synchronization
- **openrouter-sync.ts** (11KB) - OpenRouter → models.json synchronization
- **react-fallback.ts** (13KB) - ReAct fallback for non-native tool models

### Shared Utilities (shared/)
- **ollama.ts** (27KB) - Ollama API helpers, provider detection, retry logic
- **security.ts** (46KB) - Security validation, SSRF protection, audit logging
- **model-test-utils.ts** (31KB) - Test utilities, config, history management
- **react-parser.ts** (21KB) - Multi-dialect ReAct text parser
- **types.ts** (4KB) - TypeScript types and error classes
- **format.ts** (13KB) - Shared formatting utilities

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
- 41 critical commands always blocked + 25 extended commands (max mode)
- SSRF protection with 22 always-blocked + 7 max-only URL patterns
- Path validation with symlink dereferencing and boundary checking
- Shell injection detection with regex patterns
- Audit logging to ~/.pi/agent/audit.log (JSON Lines)
- Fixed symlink escape vulnerability in v1.2.4

### Model Testing
- Supports Ollama and 11 cloud providers (OpenRouter, Anthropic, Google, OpenAI, Groq, DeepSeek, Mistral, xAI, Together, Fireworks, Cohere)
- 6 test categories for Ollama, 4 for cloud providers
- Automatic provider detection and URL resolution
- Tool support caching with persistent storage
- Thinking token fallback for models like qwen3
- JSON repair for truncated responses

### System Integration
- Status bar integration with CPU/RAM/swap monitoring (local Ollama only)
- Progressive disclosure for personas (Level 1-3)
- Remote Ollama support via tunnel URL auto-detection
- Matrix theme with neon green aesthetics
- Cross-platform build system with PowerShell/bash scripts

### Package Management
- Individual npm packages under @vtstech scope
- Shared utilities bundled into each package
- Version synchronization across all packages
- Automated build scripts for cross-platform publishing

## Known Landmines

1. **ReAct Mode Default:** ReAct fallback is disabled by default (persistent config at ~/.pi/agent/react-mode.json)
2. **Security Mode Default:** Starts in max mode if ~/.pi/agent/security.json doesn't exist
3. **Remote Ollama:** URLs are auto-saved to models.json after sync
4. **Tool Support:** Some models require ReAct mode to function properly
5. **Memory Constraints:** Ollama models optimized for 12GB RAM environments
6. **Framework Migration:** Recently migrated from @mariozechner to @earendil-works packages

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
- **VERSION** - Single source of truth for package version

## Recent Changes (v1.2.5)

- **Framework Migration:** Updated all peer dependencies from @mariozechner to @earendil-works packages
- **Build System:** Enhanced cross-platform publishing scripts with dist folder support
- **Version Consistency:** Fixed version skew between source and built packages
- **Security:** Fixed symlink escape vulnerability in path validation (v1.2.4)

## Google Colab Optimization

Extensions optimized for CPU-only 12GB RAM environments with recommended Ollama settings:
- CONTEXT_LENGTH: 4096 (reduced from 262k)
- MAX_LOADED_MODELS: 1
- KV_CACHE_TYPE: f16
- BATCH_SIZE: 512
- NO_CUDA: 1