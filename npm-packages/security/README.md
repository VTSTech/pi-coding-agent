# @vtstech/pi-security

Security extension for the [Pi Coding Agent](https://github.com/badlogic/pi-mono).

Command, path, and network security layer for Pi's tool execution. Automatically loaded — no commands needed.

## Install

```bash
pi install "npm:@vtstech/pi-security"
```

## Protection

- **65 blocked commands** — system modification, privilege escalation, network attacks, package management, process control, shell escapes
- **SSRF protection** — 27 blocked hostname patterns (loopback, RFC1918 private ranges, cloud metadata endpoints)
- **Path validation** — prevents filesystem escape and access to critical system directories
- **Shell injection detection** — regex patterns for command chaining, substitution, and redirection
- **Audit logging** — JSON-lines audit log at `~/.pi/agent/audit.log`

## Links

- [Full Documentation](https://github.com/VTSTech/pi-coding-agent#security-securityts)
- [Changelog](https://github.com/VTSTech/pi-coding-agent/blob/main/CHANGELOG.md)

## License

MIT — [VTSTech](https://www.vts-tech.org)
