# @vtstech/pi-security

Security extension for the [Pi Coding Agent](https://github.com/badlogic/pi-mono).

Command, path, and network security layer for Pi's tool execution with a configurable security mode. Automatically loaded.

## Install

```bash
pi install "npm:@vtstech/pi-security"
```

## Protection

- **Partitioned command blocklist** — 41 CRITICAL commands (always blocked: system modification, privilege escalation, network attacks, shell escapes) + 25 EXTENDED commands (blocked in max mode: package management, process control, development tools)
- **Mode-aware SSRF protection** — 19 ALWAYS_BLOCKED URL patterns (loopback, RFC1918 private ranges, cloud metadata endpoints) + 7 MAX_ONLY patterns (localhost by name, broadcast, link-local, current network) that are allowed in basic mode
- **Security mode toggle** — switch between `basic` and `max` modes at runtime; persisted to `~/.pi/agent/security.json`
- **Path validation** — prevents filesystem escape and access to critical system directories; symlinks are dereferenced via `fs.realpathSync()` to block `/tmp/evil → /etc/passwd` bypasses
- **Shell injection detection** — regex patterns for command chaining, substitution, and redirection
- **Audit logging** — JSON-lines audit log at `~/.pi/agent/audit.log` with security mode recorded per entry (path exported as `AUDIT_LOG_PATH`)

## Commands

```bash
/security mode basic    # Relaxed — CRITICAL commands blocked, localhost URLs allowed
/security mode max      # Full lockdown — all 66 commands blocked, strict SSRF
```

**Default mode: `max`**. The current mode is shown in the status bar as `SEC:BASIC` or `SEC:MAX`.

## Links

- [Full Documentation](https://github.com/VTSTech/pi-coding-agent#security-securityts)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)