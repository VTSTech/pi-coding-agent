# @vtstech/pi-status

System monitor / status bar extension for the [Pi Coding Agent](https://github.com/badlogic/pi-mono).

Replaces the Pi footer with a unified status bar showing system metrics, model info, and generation params.

## Install

```bash
pi install "npm:@vtstech/pi-status"
```

## How It Works

Automatically loaded — no commands needed. Displays a 2-line status bar at the bottom of the Pi interface.

**Line 1 (conf):**
```
qwen3.5:0.8b · ~/.pi/agent · medium · CPU 9%
```

**Line 2 (load):**
```
qwen3.5:0.8b · M:33k · S:9.0%/128k · RAM 2.2G/15.1G · Resp 5m24s · temp:0.0 · max:16384
```

CPU/RAM/Swap are only shown when using a local Ollama provider (not for cloud/remote).

## What's Displayed

- **Working directory** — compact `~`-relative path
- **Git branch** — current branch name (cached)
- **Active model** — the model Pi is currently using
- **Thinking level** — shown when active (off is hidden)
- **Context usage** — percentage and window size (`5.6%/128k`)
- **CPU%** — per-core delta (updates every 3s)
- **RAM** — used/total
- **Swap** — shown only when active
- **Loaded model** — Ollama model in memory via `/api/ps` (cached 15s)
- **Response time** — agent loop duration
- **Generation params** — temperature, top_p, top_k, max tokens, num_predict, context size
- **Security indicator** — 3s flash on blocked tools + persistent blocked count
- **Active tool timing** — live elapsed timer for running tool

## Links

- [Full Documentation](https://github.com/VTSTech/pi-coding-agent#system-monitor-status-ts)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)
