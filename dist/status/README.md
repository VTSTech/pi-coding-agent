# @vtstech/pi-status

System monitor extension for the [Pi Coding Agent](https://github.com/badlogic/pi-mono).

Adds composable named status items to the framework footer using `ctx.ui.setStatus()`. Each metric gets its own named slot so it coexists cleanly with other extensions' status items.

## Install

```bash
pi install "npm:@vtstech/pi-status"
```

## How It Works

Automatically loaded — no commands needed. Slots are rendered in the framework footer alongside framework items (model name, session tokens, context usage). All labels use dimmed coloring; all values use green highlighting.

CPU/RAM/Swap are only shown when using a local Ollama provider (not for cloud/remote). For cloud providers, system metrics are omitted.

**Example (local Ollama):**
```
CtxMax:41k RespMax:16.4k Resp 2m3s CPU 12% RAM 2.2G/15.1G SEC:MAX Prompt: 2840 chr 393 tok pi:0.66.1
```

**Example (cloud provider, basic mode):**
```
CtxMax:128k RespMax:16.4k Resp 1m22s SEC:BASIC Prompt: 2840 chr 393 tok pi:0.66.1
```

## Status Slots

Slots are updated every 5 seconds (1 second for active tool timing). Render order is deterministic — all slots are managed through `flushStatus()`.

| Slot | Description | Condition |
|------|-------------|-----------|
| **CtxMax + RespMax** | Combined: native model context window + max response tokens (e.g., `CtxMax:33k RespMax:16.4k`) | Ollama or after first provider request |
| **Resp** | Agent loop duration (e.g., `2m3s`) | After first agent cycle |
| **CPU%** | Per-core CPU usage delta | Local Ollama only |
| **RAM** | Used/total system memory | Local Ollama only |
| **Swap** | Used/total swap space | Local only, when active |
| **Generation params** | Temperature, top_p, top_k, num_predict, context size, reasoning_effort (dimmed) | After first provider request |
| **SEC** | Security mode indicator (`SEC:BASIC`/`SEC:MAX`) + session-scoped blocked count + 3s flash on block event | Always shown |
| **Active tool** | Live elapsed timer with `>` indicator | While a tool is running |
| **Prompt** | System prompt size as `chars chr tokens tok` | After first agent start |
| **Pi version** | `pi:0.66.1` (dim label + green value, always last) | Always shown |

All slots are cleared on `session_shutdown`. Metrics that the framework already provides (model name, session tokens, context usage, thinking level) are intentionally omitted to avoid duplication.

## Links

- [Full Documentation](https://github.com/VTSTech/pi-coding-agent#system-monitor-status-ts)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)