# @vtstech/pi-diag

Diagnostics extension for the [Pi Coding Agent](https://github.com/badlogic/pi-mono).

Run a full system diagnostic of your Pi environment — system info, Ollama status, models.json validation, extension listing, security posture, and more.

## Install

```bash
pi install "npm:@vtstech/pi-diag"
```

## Commands

```
/diag    Run full system diagnostic
```

## Checks

- **System** — OS, CPU, RAM usage, uptime, Node.js version
- **Disk** — Disk usage via `df -h`
- **Ollama** — Running? Version? Response latency? Models pulled? Currently loaded in VRAM?
- **models.json** — Valid JSON? Provider config? Models listed? Cross-references with Ollama
- **Settings** — settings.json exists? Valid?
- **Extensions** — Extension files found? Active tools?
- **Themes** — Theme files? Valid JSON?
- **Session** — Active model? API mode? Provider? Base URL? Context window? Context usage? Thinking level?
- **Security** — Audit log status, blocked command count

Also registers a `self_diagnostic` tool so the AI agent can run diagnostics on command.

## Links

- [Full Documentation](https://github.com/VTSTech/pi-coding-agent#diagnostics-diagts)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)
