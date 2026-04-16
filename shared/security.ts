/**
 * Shared security utilities for Pi Coding Agent extensions.
 * Ported from AgentNova core/helpers.py — security layer.
 *
 * Provides comprehensive security controls including:
 * - Security mode toggle (basic/max) persisted in security.json
 * - Command blocklist validation (partitioned into critical/extended)
 * - Path validation (filesystem escape prevention)
 * - SSRF protection (mode-aware — allows localhost in basic)
 * - Shell injection detection
 * - URL validation
 * - Audit logging (enriched with security mode metadata)
 *
 * @module shared/security
 * @writtenby VTSTech — https://www.vts-tech.org
 */
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { debugLog } from "./debug";
import dns from "node:dns";
import { SETTINGS_PATH as _SETTINGS_PATH, SECURITY_PATH, writeJsonConfig } from "./config-io";

// ============================================================================
// Settings Path (re-exported from config-io for backward compatibility)
// ============================================================================

/** Path to the Pi agent settings file — protected against tool-based access. */
export const SETTINGS_PATH = _SETTINGS_PATH;

// ============================================================================
// Security Mode Configuration
// ============================================================================

/**
 * Security enforcement mode.
 *
 * - `"max"`: Full lockdown. All commands blocked (critical + extended),
 *   SSRF blocks localhost/private IPs/metadata. Default when no config exists.
 * - `"basic"`: Relaxed mode. Only critical commands are blocked,
 *   SSRF allows localhost/127.x for local development.
 */
export type SecurityMode = "basic" | "max";

/** Path to the security mode configuration file. Stored separately from settings.json per project convention. */
export const SECURITY_CONFIG_PATH = SECURITY_PATH;

/** Shape of the persisted security.json file. */
interface SecurityConfig {
  mode: SecurityMode;
  lastUpdated: string;
}

/**
 * Read the current security mode from ~/.pi/agent/security.json.
 *
 * If the file is missing, corrupt, or unreadable, defaults to `"max"`.
 * This ensures fail-closed behavior — an absent config always means
 * maximum security.
 *
 * @returns The current security mode ("basic" or "max")
 *
 * @example
 * ```typescript
 * const mode = getSecurityMode();
 * if (mode === "max") {
 *   console.log("Running in maximum security mode");
 * }
 * ```
 */
export function getSecurityMode(): SecurityMode {
  try {
    if (!fs.existsSync(SECURITY_CONFIG_PATH)) return "max";
    const raw = fs.readFileSync(SECURITY_CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw) as SecurityConfig;
    if (config.mode === "basic" || config.mode === "max") return config.mode;
    return "max";
  } catch (err) {
    debugLog("security", `failed to read security config at ${SECURITY_CONFIG_PATH}`, err);
    return "max";
  }
}

/**
 * Write the security mode to ~/.pi/agent/security.json.
 *
 * Uses the atomic write-then-rename pattern from `writeJsonConfig()`
 * (shared/config-io) to prevent partial writes on crash.
 *
 * @param mode - The security mode to persist ("basic" or "max")
 * @returns `true` if the write succeeded, `false` if it failed
 *
 * @example
 * ```typescript
 * const ok = setSecurityMode("basic");
 * if (!ok) {
 *   ctx.ui.notify("Failed to write security config", "error");
 * }
 * // ~/.pi/agent/security.json → { "mode": "basic", "lastUpdated": "2026-04-13T..." }
 * ```
 */
export function setSecurityMode(mode: SecurityMode): boolean {
  try {
    const config: SecurityConfig = { mode, lastUpdated: new Date().toISOString() };
    writeJsonConfig(SECURITY_CONFIG_PATH, config);

    // Verify the write by reading it back
    const verify = JSON.parse(fs.readFileSync(SECURITY_CONFIG_PATH, "utf-8"));
    if (verify.mode !== mode) {
      debugLog("security", `security config write verification failed: expected ${mode}, got ${verify.mode}`);
      return false;
    }

    debugLog("security", `security mode set to ${mode}`, { path: SECURITY_CONFIG_PATH });
    return true;
  } catch (err) {
    debugLog("security", `failed to write security config to ${SECURITY_CONFIG_PATH}`, err);
    return false;
  }
}

// ============================================================================
// Command Blocklists — Partitioned by Security Mode
// ============================================================================

/**
 * CRITICAL_COMMANDS — always blocked regardless of security mode.
 *
 * These commands are irreversibly destructive, provide privilege escalation,
 * or enable remote/network attacks. Blocking them in basic mode would be
 * dangerous, so they are ALWAYS enforced.
 *
 * Categories:
 * - **Filesystem destruction**: mkfs, dd, shred, wipe, srm, format, fdisk
 * - **Privilege escalation** (non-sudo): su, doas, pkexec, gksudo, kdesu
 * - **Network attacks**: nmap, nc, netcat, telnet
 * - **Remote access**: ssh, scp, sftp, rsync
 * - **Process killing**: kill, killall, pkill, xkill
 * - **User management**: useradd, userdel, usermod, passwd, adduser, deluser
 * - **Dangerous shell features**: exec, eval, source, ., alias
 * - **Filesystem control**: mount, umount, chattr, lsattr
 * - **Permission modification**: chown, chmod
 */
export const CRITICAL_COMMANDS: ReadonlySet<string> = new Set([
  // Filesystem destruction (irrecoverable)
  "mkfs", "dd", "shred", "wipe", "srm", "format", "fdisk",
  // Privilege escalation (non-sudo)
  "su", "doas", "pkexec", "gksudo", "kdesu",
  // Network attack tools
  "nmap", "nc", "netcat", "telnet",
  // Remote access
  "ssh", "scp", "sftp", "rsync",
  // Process killing
  "kill", "killall", "pkill", "xkill",
  // User management
  "useradd", "userdel", "usermod", "passwd", "adduser", "deluser",
  // Dangerous shell features
  "exec", "eval", "source", ".", "alias",
  // Filesystem control
  "mount", "umount", "chattr", "lsattr",
  // Permission modification
  "chown", "chmod",
]);

/**
 * EXTENDED_COMMANDS — blocked only when security mode is "max".
 *
 * These commands are useful for development workflows (package management,
 * file operations, system services) but can be dangerous in untrusted
 * contexts. In basic mode they are allowed to enable productivity in
 * resource-constrained environments like Colab or budget VMs.
 *
 * Categories:
 * - **File deletion**: rm, rmdir, del
 * - **Privilege escalation**: sudo (needed for apt install, etc. in basic)
 * - **Download tools**: wget, curl
 * - **Package management**: apt, apt-get, yum, dnf, pacman, pip, npm, yarn, cargo
 * - **System service control**: systemctl, service
 * - **Interactive editors**: vi, vim, nano, emacs, less, more, man
 * - **Version control**: git
 */
export const EXTENDED_COMMANDS: ReadonlySet<string> = new Set([
  // File deletion
  "rm", "rmdir", "del",
  // Privilege escalation
  "sudo",
  // Download tools
  "wget", "curl",
  // Package management
  "apt", "apt-get", "yum", "dnf", "pacman", "pip", "npm", "yarn", "cargo",
  // System service control
  "systemctl", "service",
  // Interactive editors (shell escape risk)
  "vi", "vim", "nano", "emacs", "less", "more", "man",
  // Version control
  "git",
]);

/**
 * Legacy full blocklist — union of CRITICAL_COMMANDS + EXTENDED_COMMANDS.
 *
 * Kept for backward compatibility with extensions that reference
 * `BLOCKED_COMMANDS.size` in audit reports or diagnostics.
 *
 * In max mode, ALL of these are blocked.
 * In basic mode, only CRITICAL_COMMANDS are enforced.
 */
export const BLOCKED_COMMANDS: ReadonlySet<string> = new Set([
  ...CRITICAL_COMMANDS,
  ...EXTENDED_COMMANDS,
]);

// ============================================================================
// SSRF Protection — Partitioned by Security Mode
// ============================================================================

/**
 * URL hostname patterns ALWAYS blocked for SSRF protection, regardless of mode.
 *
 * These are the critical patterns that must never be accessible:
 * - **Cloud metadata endpoints**: 169.254.169.254 (AWS, GCP, Azure)
 * - **RFC1918 private ranges**: 10.x, 192.168.x, 172.16-31.x
 * - **Internal service patterns**: internal., private., intranet.
 */
export const BLOCKED_URL_ALWAYS: ReadonlySet<string> = new Set([
  // Cloud metadata endpoints
  "169.254.169.254",
  // RFC1918 private ranges
  "10.", "192.168.",
  "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.",
  "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.",
  "172.28.", "172.29.", "172.30.", "172.31.",
  // IPv6-mapped IPv4 cloud metadata (always blocked)
  "::ffff:169.254.169.254",
  // Internal service patterns
  "internal.", "private.", "intranet.",
]);

/**
 * URL hostname patterns blocked ONLY in max mode.
 *
 * In basic mode these are allowed to enable local development:
 * - **Loopback addresses**: localhost, 127.x, 0.0.0.0, ::1, ::ffff variants
 * - **Local patterns**: local. (note: also covers "localhost" via startsWith)
 */
export const BLOCKED_URL_MAX_ONLY: ReadonlySet<string> = new Set([
  // Loopback addresses (full 127.0.0.0/8 range)
  "localhost", "127.", "0.0.0.0", "::1", "::ffff:127.0.0.1", "::ffff:0.0.0.0",
  // IPv6-mapped IPv4 private ranges (always blocked in max mode)
  "::ffff:10.", "::ffff:192.168.", "::ffff:172.16.", "::ffff:172.17.",
  "::ffff:172.18.", "::ffff:172.19.", "::ffff:172.20.", "::ffff:172.21.",
  "::ffff:172.22.", "::ffff:172.23.", "::ffff:172.24.", "::ffff:172.25.",
  "::ffff:172.26.", "::ffff:172.27.", "::ffff:172.28.", "::ffff:172.29.",
  "::ffff:172.30.", "::ffff:172.31.",
  // Local/internal patterns
  "local.",
]);

/**
 * Legacy full SSRF blocklist — union of ALWAYS + MAX_ONLY patterns.
 *
 * Kept for backward compatibility. Represents the effective blocklist
 * when running in max mode.
 */
export const BLOCKED_URL_PATTERNS: ReadonlySet<string> = new Set([
  ...BLOCKED_URL_ALWAYS,
  ...BLOCKED_URL_MAX_ONLY,
]);

// ============================================================================
// Path Validation
// ============================================================================

/**
 * System directories that file tools must not access.
 *
 * These directories are protected to prevent accidental or malicious
 * modification of critical system files.
 */
const CRITICAL_SYSTEM_DIRS = [
  "/etc", "/root", "/var", "/usr", "/bin", "/sbin", "/boot", "/dev", "/proc", "/sys",
];

/**
 * Validate a file path for security.
 *
 * Performs multiple security checks on a file path:
 * 1. Rejects empty paths
 * 2. Rejects UNC paths (Windows network paths)
 * 3. Detects path traversal attempts (../)
 * 4. Blocks access to critical system directories
 * 5. Blocks access to sensitive files (.ssh, .gnupg, etc.)
 * 6. Restricts to allowed directories
 *
 * @param filePath - The file path to validate
 * @param allowedDirs - Optional array of additional allowed directories
 * @returns Object with `valid` boolean and `error` message if invalid
 *
 * @example
 * ```typescript
 * // Valid path in allowed directory
 * validatePath("/home/user/project/file.txt");
 * // Returns: { valid: true, error: "" }
 *
 * // Invalid path traversal attempt
 * validatePath("../../../etc/passwd");
 * // Returns: { valid: false, error: "Path traversal detected..." }
 *
 * // Invalid system directory
 * validatePath("/etc/shadow");
 * // Returns: { valid: false, error: "Access to system directory denied: /etc" }
 * ```
 */
export function validatePath(
  filePath: string,
  allowedDirs?: string[],
): { valid: boolean; error: string } {
  if (!filePath) return { valid: false, error: "Path cannot be empty" };

  // Check for UNC paths
  if (filePath.startsWith("\\\\")) {
    return { valid: false, error: "UNC paths not allowed" };
  }

  // Check raw path for traversal patterns
  if (filePath.includes("../") || filePath.includes("..\\")) {
    return { valid: false, error: "Path traversal detected: parent directory access not allowed" };
  }

  // Resolve to absolute path
  let resolved: string;
  try {
    resolved = path.resolve(filePath);
    // Resolve symlinks to prevent /tmp symlink bypasses
    try { resolved = fs.realpathSync(resolved); } catch { /* path may not exist yet */ }
  } catch {
    return { valid: false, error: "Invalid path format" };
  }

  // Check against critical system directories
  for (const critical of CRITICAL_SYSTEM_DIRS) {
    if (resolved.startsWith(critical + "/") || resolved === critical) {
      return { valid: false, error: `Access to system directory denied: ${critical}` };
    }
  }

  // Check Pi-specific sensitive files
  const sensitivePaths = [
    "/etc/shadow", "/etc/passwd",
    "/.ssh/", "/.gnupg/",
    path.join(os.homedir(), ".ssh"),
    path.join(os.homedir(), ".gnupg"),
    SETTINGS_PATH,
    SECURITY_CONFIG_PATH,
    // NOTE: models.json is intentionally excluded from sensitivePaths.
    // Extensions use readModelsJson()/writeModelsJson() from shared/ollama.ts
    // for direct file I/O — not via Pi's tool system — so blocking it here
    // would prevent legitimate model configuration updates.
  ];
  for (const sensitive of sensitivePaths) {
    if (resolved.startsWith(sensitive) || resolved === sensitive) {
      return { valid: false, error: `Access to sensitive path denied: ${sensitive}` };
    }
  }

  // Allow safe paths: cwd, /home, and /tmp (standard temp directory).
  const cwd = process.cwd();
  const safePrefixes = ["/home", "/tmp", cwd];
  for (const prefix of safePrefixes) {
    if (resolved.startsWith(prefix + "/") || resolved === prefix) return { valid: true, error: "" };
  }

  // Check against custom allowed directories
  if (allowedDirs) {
    for (const dir of allowedDirs) {
      try {
        const absDir = path.resolve(dir);
        if (resolved.startsWith(absDir)) return { valid: true, error: "" };
      } catch { /* skip */ }
    }
  }

  return { valid: false, error: `Path not in allowed directories: ${filePath}` };
}

// ── IP Address Validation Utilities ──────────────────────────────────────────

/**
 * Strip the ::ffff: prefix from IPv6-mapped IPv4 addresses.
 *
 * IPv6-mapped IPv4 addresses embed an IPv4 address in the low 32 bits
 * of an IPv6 address (e.g. `::ffff:10.0.0.1` reaches the same host as `10.0.0.1`).
 * The ::ffff:0:0/96 prefix (RFC 4291) is used by dual-stack systems.
 *
 * @param ip - IP address string that may be IPv6-mapped IPv4
 * @returns The underlying IPv4 address if mapped, or the original string if not
 */
function stripIpv6Mapped(ip: string): string {
  if (ip.startsWith("::ffff:") && !ip.startsWith("::ffff:0:0")) {
    // Extract the IPv4 portion after ::ffff:
    return ip.slice(7);
  }
  return ip;
}

/**
 * Check if an IP address is a loopback address.
 * Handles IPv4 (127.0.0.0/8) and IPv6 (::1, ::ffff:127.0.0.0/104).
 */
function isLoopbackIp(ip: string): boolean {
  // Strip IPv6-mapped prefix for IPv4 comparison
  const norm = stripIpv6Mapped(ip);
  // IPv4 loopback
  if (norm.startsWith("127.") || norm === "0.0.0.0") return true;
  // IPv6 loopback
  if (ip === "::1" || ip === "::ffff:0.0.0.0") return true;
  return false;
}

/**
 * Check if an IP address is a private/RFC1918 address.
 * Handles IPv4 (10.x, 172.16-31.x, 192.168.x), cloud metadata,
 * IPv6 (fc00::/7, fe80::/10), and IPv6-mapped IPv4 (::ffff:x.x.x.x).
 */
function isPrivateIp(ip: string): boolean {
  // Strip IPv6-mapped prefix for IPv4 comparison
  const norm = stripIpv6Mapped(ip);
  // IPv4 private ranges
  if (norm.startsWith("10.") || norm.startsWith("192.168.")) return true;
  // 172.16.0.0 – 172.31.255.255
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(norm)) return true;
  // Cloud metadata
  if (norm === "169.254.169.254") return true;
  // IPv6 unique local (fc00::/7) and link-local (fe80::/10)
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("fe80:")) return true;
  return false;
}

/**
 * Resolve a hostname to its IP addresses and check against blocked ranges.
 *
 * Uses dns.lookup() (not dns.resolve()) to follow the system resolver,
 * which respects /etc/hosts and nsswitch.conf. This catches DNS rebinding
 * attacks where a hostname resolves differently at check time vs request time.
 *
 * @param hostname - The hostname to resolve
 * @param blockPrivate - Whether to block private/loopback IPs
 * @returns Object with `safe` boolean and `error` message if unsafe
 */
export async function resolveAndCheckHostname(
  hostname: string,
  blockPrivate = true,
): Promise<{ safe: boolean; error: string }> {
  try {
    const addresses = await new Promise<dns.LookupAddress[]>((resolve, reject) => {
      dns.lookup(hostname, { all: true }, (err: unknown, addresses: unknown) => {
        if (err) reject(err);
        else resolve(addresses as dns.LookupAddress[]);
      });
    });

    if (!addresses || addresses.length === 0) {
      // DNS resolution failed — could be a network issue, not a security violation
      // The URL pattern checks already passed, so allow it
      return { safe: true, error: "" };
    }

    for (const addr of addresses) {
      const ip = addr.address;
      // Always block cloud metadata endpoint (including IPv6-mapped)
      const normIp = stripIpv6Mapped(ip);
      if (normIp === "169.254.169.254") {
        return { safe: false, error: `SSRF protection: hostname ${hostname} resolves to cloud metadata IP ${ip}` };
      }
      if (blockPrivate && (isLoopbackIp(ip) || isPrivateIp(ip))) {
        return { safe: false, error: `SSRF protection: hostname ${hostname} resolves to private/reserved IP ${ip} (DNS rebinding check)` };
      }
    }

    return { safe: true, error: "" };
  } catch {
    // DNS resolution failed — allow since pattern checks already passed
    return { safe: true, error: "" };
  }
}

// ============================================================================
// URL Validation (SSRF Protection — Mode-Aware)
// ============================================================================

/**
 * Validate a URL for SSRF protection.
 *
 * Checks a URL for security violations:
 * 1. Rejects empty URLs
 * 2. Validates URL format
 * 3. Only allows http and https schemes
 * 4. Always blocks Cloud Metadata IPs and RFC1918 private ranges
 * 5. In max mode, additionally blocks loopback (localhost, 127.x)
 * 6. In basic mode, allows localhost/127.x for local development
 *
 * NOTE: For stronger protection against DNS rebinding attacks, use the
 * async `resolveAndCheckHostname()` function to perform DNS resolution
 * checks AFTER calling isSafeUrl(). This catches cases where a hostname
 * resolves to a private IP at request time despite passing pattern checks.
 *
 * @param url - The URL to validate
 * @param blockSsrf - Whether to apply SSRF blocking rules (default: true)
 * @returns Object with `safe` boolean and `error` message if unsafe
 *
 * @example
 * ```typescript
 * // Valid external URL
 * isSafeUrl("https://api.example.com/data");
 * // Returns: { safe: true, error: "" }
 *
 * // Blocked cloud metadata endpoint (always)
 * isSafeUrl("http://169.254.169.254/latest/meta-data/");
 * // Returns: { safe: false, error: "SSRF protection: blocked hostname pattern '169.254.169.254'" }
 *
 * // Blocked in max mode, allowed in basic mode
 * isSafeUrl("http://localhost:8080/admin");
 * // Max: { safe: false, error: "SSRF protection: blocked hostname pattern 'localhost'" }
 * // Basic: { safe: true, error: "" }
 * ```
 */
export function isSafeUrl(
  url: string,
  blockSsrf = true,
): { safe: boolean; error: string } {
  if (!url) return { safe: false, error: "URL cannot be empty" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { safe: false, error: `Invalid URL format: ${msg}` };
  }

  // Check scheme
  const scheme = parsed.protocol.replace(":", "").toLowerCase();
  if (scheme !== "http" && scheme !== "https") {
    return { safe: false, error: `URL scheme not allowed: ${parsed.protocol}` };
  }

  if (!parsed.hostname) {
    return { safe: false, error: "URL must have a hostname" };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Normalize hostname: strip trailing dots, reject non-ASCII hostnames
  const normalized = hostname.replace(/\.$/, "");
  if (/[^\x00-\x7F]/.test(normalized)) {
    return { safe: false, error: "URL hostname contains non-ASCII characters" };
  }

  // Reject hex/octal IP representations
  if (/^0x[0-9a-f]+$/i.test(normalized) || /^0[0-7]+$/i.test(normalized)) {
    return { safe: false, error: "URL hostname uses non-decimal IP format" };
  }

  if (blockSsrf) {
    const mode = getSecurityMode();

    // ALWAYS block: cloud metadata, RFC1918, internal patterns
    for (const pattern of BLOCKED_URL_ALWAYS) {
      if (normalized === pattern || normalized.endsWith("." + pattern) || normalized.startsWith(pattern)) {
        // For IP-like patterns, anchor to prevent false positives
        // e.g. "10." should not match "10.example.com" but should match "10.0.0.1"
        if (/^\d|^::/.test(pattern)) {
          const nextChar = normalized[pattern.length];
          if (nextChar && nextChar !== "/" && nextChar !== ":" && !/\d/.test(nextChar)) {
            continue;
          }
        }
        return { safe: false, error: `SSRF protection: blocked hostname pattern '${pattern}'` };
      }
    }

    // MAX ONLY block: loopback addresses (allowed in basic mode)
    if (mode === "max") {
      for (const pattern of BLOCKED_URL_MAX_ONLY) {
        if (normalized === pattern || normalized.endsWith("." + pattern) || normalized.startsWith(pattern)) {
          // For IP-like patterns, anchor to prevent false positives
          if (/^\d|^::/.test(pattern)) {
            const nextChar = normalized[pattern.length];
            if (nextChar && nextChar !== "/" && nextChar !== ":" && !/\d/.test(nextChar)) {
              continue;
            }
          }
          return { safe: false, error: `SSRF protection: blocked hostname pattern '${pattern}' (max mode)` };
        }
      }
    }
  }

  return { safe: true, error: "" };
}

// ============================================================================
// Command Sanitization & Injection Detection (Mode-Aware)
// ============================================================================

/**
 * Regex patterns for detecting shell injection attempts.
 *
 * These patterns detect dangerous constructs that cannot be safely handled
 * by per-command blocklist checking:
 *
 * - Semicolon chaining (;) is ALWAYS blocked when followed by dangerous
 *   commands, regardless of security mode. Unlike && and || (which are
 *   conditional), semicolon unconditionally executes the next command,
 *   making it the primary shell injection vector.
 * - Command substitution (backticks, $()) is always dangerous.
 * - Sensitive variable expansion targets env vars that could leak secrets.
 *
 * NOTE: && and || chaining is handled by sanitizeCommand() which splits
 * the command and checks each sub-command against the blocklists. This
 * allows safe chains like "npm test && npm run build" while still
 * blocking "ls && sudo rm -rf /" (second sub-command fails blocklist).
 *
 * NOTE: Pipes (|) are also handled by split-and-check. "cat file | sudo"
 * is blocked because "sudo" hits the critical blocklist.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // Semicolon chaining to dangerous commands — mode-independent.
  // Unlike && (conditional), ; ALWAYS runs the second command.
  /;\s*(rm|sudo|chmod|chown|mkfs|dd|shred|kill|pkill)\b/i,
  // Command substitution (backticks) — still dangerous
  /`[^`]+`/,
  // Command substitution ($()) — still dangerous
  /\$\([^)]+\)/,
  // Variable expansion targeting sensitive env vars
  /\$\{?(?:HOME|USER|PATH|SHELL|PWD|SSH|GPG|API_KEY|TOKEN|SECRET|PASSWORD)\}?/i,
];

/**
 * Check a single command (no chaining operators) against the blocklists.
 *
 * This is the core blocklist check used for each sub-command when
 * command chaining is detected. It also handles SEC-01: rejects
 * commands where Unicode normalization changed the input.
 *
 * @param command - A single command string (no &&, ||, ;, | operators)
 * @param mode - Current security mode
 * @returns Object with `isSafe`, `error`, and `command`
 */
function checkSingleCommand(
  command: string,
  mode: SecurityMode,
): { isSafe: boolean; error: string; command: string } {
  const trimmed = command.trim();
  if (!trimmed) return { isSafe: true, error: "", command: "" };

  const parts = trimmed.split(/\s+/);

  let baseCmd = parts[0].toLowerCase();
  // Remove path prefixes (e.g. /usr/bin/rm → rm, C:\Windows\System32\cmd → cmd)
  if (baseCmd.includes("/")) baseCmd = baseCmd.split("/").pop()!;
  if (baseCmd.includes("\\")) baseCmd = baseCmd.split("\\").pop()!;

  // Check against critical blocklist (always blocked) — scan ALL words,
  // not just the first. This catches "sudo chmod" where sudo is extended
  // but chmod is critical.
  for (const raw of parts) {
    let word = raw.toLowerCase();
    if (word.includes("/")) word = word.split("/").pop()!;
    if (word.includes("\\")) word = word.split("\\").pop()!;
    if (CRITICAL_COMMANDS.has(word)) {
      return { isSafe: false, error: `Blocked command: ${word} (critical)`, command: "" };
    }
  }

  // Check base command against extended blocklist (mode-dependent)
  if (mode === "max" && EXTENDED_COMMANDS.has(baseCmd)) {
    return { isSafe: false, error: `Blocked command: ${baseCmd} (max mode)`, command: "" };
  }

  // Check for injection patterns in this sub-command
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { isSafe: false, error: `Potential injection pattern detected in: ${trimmed}`, command: "" };
    }
  }

  return { isSafe: true, error: "", command: trimmed };
}

/**
 * Sanitize and validate a shell command.
 *
 * Performs comprehensive security checks on a command string:
 * 1. Rejects empty commands
 * 2. Normalizes Unicode and strips control characters
 * 3. Rejects Unicode normalization variance (SEC-01 — obfuscation detection)
 * 4. Detects newline injection
 * 5. Checks for semicolon injection (mode-independent, always blocked)
 * 6. Splits on conditional chaining operators (&&, ||) and pipes (|),
 *    then checks each sub-command individually against the blocklists
 *
 * Chaining behavior by operator:
 * - `;` (semicolon): ALWAYS blocked when followed by dangerous commands.
 *   Semicolon unconditionally executes the next command, making it the
 *   primary injection vector. This is mode-independent.
 * - `&&` and `||` (conditional): Split and check each sub-command.
 *   Allows safe chains like "npm test && npm run build" while still
 *   blocking "ls && sudo rm -rf /" (second sub-command fails blocklist).
 * - `|` (pipe): Split and check each sub-command. Allows "cat file | grep"
 *   while blocking "cat file | sudo tee /tmp/pwned".
 *
 * @param command - The command string to validate
 * @returns Object with `isSafe`, `error`, and sanitized `command`
 *
 * @example
 * ```typescript
 * // Safe command (both modes)
 * sanitizeCommand("ls -la /home/user");
 * // Returns: { isSafe: true, error: "", command: "ls -la /home/user" }
 *
 * // Safe && chain (both modes)
 * sanitizeCommand("echo hello && ls");
 * // Returns: { isSafe: true, error: "", command: "echo hello && ls" }
 *
 * // Semicolon injection — always blocked regardless of mode
 * sanitizeCommand("ls; rm -rf /");
 * // Returns: { isSafe: false, error: "Potential injection pattern detected", command: "" }
 *
 * // Critical command — always blocked
 * sanitizeCommand("dd if=/dev/zero of=/dev/sda");
 * // Returns: { isSafe: false, error: "Blocked command: dd (critical)", command: "" }
 *
 * // Extended command — blocked only in max mode
 * sanitizeCommand("npm install lodash");
 * // Max: { isSafe: false, error: "Blocked command: npm (max mode)", command: "" }
 * // Basic: { isSafe: true, error: "", command: "npm install lodash" }
 *
 * // && chain with blocked sub-command
 * sanitizeCommand("ls && sudo rm -rf /");
 * // Returns: { isSafe: false, error: "Blocked command: sudo (critical)", command: "" }
 *
 * // Safe pipe
 * sanitizeCommand("cat file.txt | grep pattern");
 * // Returns: { isSafe: true, error: "", command: "cat file.txt | grep pattern" }
 * ```
 */
export function sanitizeCommand(
  command: string,
): { isSafe: boolean; error: string; command: string } {
  if (!command) return { isSafe: false, error: "Command cannot be empty", command: "" };

  // ── Unicode normalization & control character stripping (SEC-06) ──
  // Normalize to NFKC to canonicalize visually identical characters
  // (e.g. fullwidth Latin 'ｒｍ' → ASCII 'rm', Cyrillic 'о' → Latin 'o').
  // This prevents homoglyph-based bypasses where lookalike Unicode characters
  // are used to spell blocked commands.
  let normalizedCmd = command.normalize("NFKC");

  // Strip zero-width characters and control characters (except space).
  // Zero-width joiners (\u200d), non-joiners (\u200c), spaces (\u200b),
  // and other invisible characters can be injected between letters of
  // blocked command names to evade pattern matching.
  normalizedCmd = normalizedCmd.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff\u2060-\u2069]/g, "");

  // Reject if normalization changed the command — indicates obfuscation attempt
  // (SEC-01 fix: changed from debugLog to actual rejection)
  const strippedForCompare = command.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff\u2060-\u2069]/g, "").normalize("NFKC");
  if (normalizedCmd !== strippedForCompare) {
    return { isSafe: false, error: `Command rejected: Unicode normalization variance detected (possible homoglyph bypass)`, command: "" };
  }

  // Use normalized command for all subsequent checks
  command = normalizedCmd;

  const trimmed = command.trim();
  if (!trimmed) return { isSafe: false, error: "Command cannot be empty", command: "" };

  // Check for newlines/carriage returns
  const newlineStripped = command.replace(/\n/g, " ").replace(/\r/g, " ");
  if (newlineStripped !== command) {
    return { isSafe: false, error: "Newline characters detected: potential command injection", command: "" };
  }

  // ── Check for semicolon injection (mode-independent, always blocked) ──
  // Unlike && and || (conditional), semicolon unconditionally executes the
  // next command. This is checked BEFORE the split-and-check logic so that
  // "ls; rm -rf /" is blocked even in basic mode (where rm is allowed
  // as a standalone command).
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { isSafe: false, error: `Potential injection pattern detected`, command: "" };
    }
  }

  // ── Split on conditional chaining operators (&&, ||) and pipes (|) ──
  // We do NOT split on semicolons — those are handled above by the
  // injection pattern check. For && || |, we split and check each
  // sub-command individually against the blocklists.
  const subCommands: string[] = [];
  let remaining = trimmed;

  // Use a regex that matches &&, ||, or | (in that priority order)
  // to split while preserving the operator structure.
  const chainRegex = /&&|\|\||(?<!\|)\|(?!\|)/g;
  let match;
  let lastIndex = 0;
  while ((match = chainRegex.exec(remaining)) !== null) {
    // Push the sub-command before this operator
    subCommands.push(remaining.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;
  }
  // Push the final sub-command after the last operator
  subCommands.push(remaining.slice(lastIndex));

  const mode = getSecurityMode();

  // Check each sub-command against the blocklists
  for (const subCmd of subCommands) {
    const result = checkSingleCommand(subCmd, mode);
    if (!result.isSafe) {
      return { isSafe: false, error: result.error, command: "" };
    }
  }

  return { isSafe: true, error: "", command };
}

// ============================================================================
// Audit Logging (Mode-Aware)
// ============================================================================

/** Default audit log directory. */
const AUDIT_DIR = path.join(os.homedir(), ".pi", "agent");

/** Path to the audit log file. Exported for use by diag.ts and other extensions. */
export const AUDIT_LOG_PATH = path.join(AUDIT_DIR, "audit.log");

// ── Audit Log Rate Limiting ──────────────────────────────────────────

/** Maximum entries to buffer before forcing a flush. */
const AUDIT_BUFFER_MAX_ENTRIES = 50;

/** Maximum interval between automatic flushes (ms). */
const AUDIT_FLUSH_INTERVAL_MS = 500;

/** In-memory buffer for batched audit entries. */
let _auditBuffer: string[] = [];

/** Timer ID for the periodic flush. */
let _auditFlushTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Ensure the periodic flush timer is running.
 * Starts the timer on first call; subsequent calls are no-ops.
 */
function ensureAuditFlushTimer(): void {
  if (_auditFlushTimer) return;
  _auditFlushTimer = setInterval(() => {
    if (_auditBuffer.length > 0) {
      flushAuditBuffer();
    }
  }, AUDIT_FLUSH_INTERVAL_MS);
  // Allow the Node.js process to exit even if the timer is active
  // unref() is a Node.js Timer extension not in the DOM typings
  const timerRef = _auditFlushTimer as unknown as { unref?: () => void };
  if (timerRef.unref) {
    timerRef.unref();
  }
}

/**
 * Flush the audit buffer to disk.
 * Writes all buffered entries as a single appendFileSync call.
 * Called automatically by the timer or when the buffer is full.
 */
export function flushAuditBuffer(): void {
  if (_auditBuffer.length === 0) return;
  try {
    if (!fs.existsSync(AUDIT_DIR)) {
      fs.mkdirSync(AUDIT_DIR, { recursive: true });
    }
    const batch = _auditBuffer.join("");
    fs.appendFileSync(AUDIT_LOG_PATH, batch, "utf-8");
  } catch (err) {
    debugLog("security", "audit buffer flush failure", err);
  }
  _auditBuffer = [];
}

/**
 * Append an audit entry to the JSON-lines log file.
 *
 * Each entry is written as a single line of JSON, making the log
 * easy to parse and analyze. The current security mode is automatically
 * injected into the entry metadata.
 *
 * Entries are buffered and flushed in batches to reduce disk I/O:
 * - Buffer flushes automatically every 500ms
 * - Buffer flushes immediately when it reaches 50 entries
 * - Manual flush available via flushAuditBuffer()
 *
 * @param entry - The audit entry to write (enriched with securityMode)
 *
 * @example
 * ```typescript
 * appendAuditEntry({
 *   timestamp: new Date().toISOString(),
 *   toolName: "bash",
 *   action: "blocked",
 *   rule: "command_blocklist",
 *   detail: "Blocked command: rm (max mode)",
 * });
 * // Written line includes: { ..., "securityMode": "max" }
 * ```
 */
export function appendAuditEntry(entry: Record<string, unknown>): void {
  try {
    ensureAuditFlushTimer();

    // Rotate audit log if it exceeds 5MB (SEC-03)
    const AUDIT_LOG_MAX_SIZE = 5 * 1024 * 1024;
    try {
      if (fs.existsSync(AUDIT_LOG_PATH)) {
        const stat = fs.statSync(AUDIT_LOG_PATH);
        if (stat.size > AUDIT_LOG_MAX_SIZE) {
          const entries = readRecentAuditEntries(1000);
          const content = entries.map(e => JSON.stringify(e)).join("\n") + "\n";
          fs.writeFileSync(AUDIT_LOG_PATH, content, "utf-8");
        }
      }
    } catch (err) { debugLog("security", "audit log rotation failed", err); }

    const enriched = { ...entry, securityMode: getSecurityMode() };
    const line = JSON.stringify(enriched) + "\n";
    _auditBuffer.push(line);

    // Force flush if buffer is full
    if (_auditBuffer.length >= AUDIT_BUFFER_MAX_ENTRIES) {
      flushAuditBuffer();
    }
  } catch (err) { debugLog("security", "audit log entry creation failure", err); }
}

/**
 * Read recent audit entries from the log file.
 *
 * Reads the last N lines from the JSON-lines audit log and
 * parses each line as JSON. Invalid lines are returned as
 * empty objects.
 *
 * @param count - Maximum number of entries to return (default: 50)
 * @returns Array of parsed audit entries
 *
 * @example
 * ```typescript
 * const recent = readRecentAuditEntries(10);
 * for (const entry of recent) {
 *   if (entry.action === "blocked") {
 *     console.log(`[${entry.securityMode}] Blocked: ${entry.toolName} - ${entry.detail}`);
 *   }
 * }
 * ```
 */
export function readRecentAuditEntries(count = 50): Array<Record<string, unknown>> {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
    const fileSize = fs.statSync(AUDIT_LOG_PATH).size;
    if (fileSize === 0) return [];

    // Read from the end of the file to avoid O(n) memory for large logs.
    // Opens the file, seeks backwards in chunks, and collects complete lines
    // until we have `count` entries or reach the beginning.
    const fd = fs.openSync(AUDIT_LOG_PATH, "r");
    const bufferSize = 8192;
    const buffer = Buffer.alloc(bufferSize);
    const lines: string[] = [];
    let pos = fileSize;
    let partial = "";

    while (pos > 0 && lines.length < count) {
      const readSize = Math.min(bufferSize, pos);
      pos -= readSize;
      fs.readSync(fd, buffer, 0, readSize, pos);
      const chunk = buffer.slice(0, readSize).toString("utf-8");

      // Prepend to partial (reading backwards)
      partial = chunk + partial;

      // Extract complete lines from the end of partial
      const lineBreak = partial.lastIndexOf("\n");
      if (lineBreak !== -1) {
        const complete = partial.slice(lineBreak + 1);
        if (complete.trim()) lines.unshift(complete);
        partial = partial.slice(0, lineBreak);
      }
    }
    fs.closeSync(fd);

    // Don't forget the last partial line
    if (partial.trim() && lines.length < count) {
      lines.unshift(partial);
    }

    const recent = lines.slice(-count);
    return recent.map(line => {
      try { return JSON.parse(line); }
      catch { return {}; }
    });
  } catch (err) {
    debugLog("security", "failed to read audit log", err);
    return [];
  }
}

// ── Crash-safe audit log flush ───────────────────────────────────────────

// Ensure audit buffer is flushed synchronously on process exit.
// process.on("exit") callbacks run synchronously and cannot use async APIs,
// so we call flushAuditBuffer() directly (which uses appendFileSync).
// Note: process.on("exit") does NOT support async operations or process.exit().
process.on("exit", () => {
  flushAuditBuffer();
});

// Handle SIGTERM (graceful shutdown) — flush then let the process exit.
process.on("SIGTERM", () => {
  flushAuditBuffer();
});

// ============================================================================
// Tool Input Security Checks
// ============================================================================

/**
 * Check a bash tool call for security violations.
 *
 * Validates the command string against the blocklist and injection
 * patterns. Returns a security check result indicating whether
 * the operation should be allowed.
 *
 * @param input - The tool input object containing a "command" or "cmd" field
 * @returns Object with `safe`, `rule`, and `detail` fields
 *
 * @example
 * ```typescript
 * const result = checkBashToolInput({ command: "ls -la" });
 * if (!result.safe) {
 *   console.log(`Blocked by ${result.rule}: ${result.detail}`);
 * }
 * ```
 */
export function checkBashToolInput(
  input: Record<string, unknown>,
): { safe: boolean; rule: string; detail: string } {
  const command = (input.command ?? input.cmd ?? "") as string;
  if (!command) return { safe: true, rule: "", detail: "" };

  const result = sanitizeCommand(command);
  if (!result.isSafe) {
    return { safe: false, rule: "command_blocklist", detail: result.error };
  }
  return { safe: true, rule: "", detail: "" };
}

/**
 * Check a file tool call for path violations.
 *
 * Validates all recognized path fields (file_path, path, output_path,
 * filePath, inputPath) against sensitive directories and allowed paths.
 *
 * @param input - The tool input object containing path fields
 * @returns Object with `safe`, `rule`, and `detail` fields
 *
 * @example
 * ```typescript
 * const result = checkFileToolInput({ file_path: "/etc/passwd" });
 * // Returns: { safe: false, rule: "path_validation", detail: "Access to system directory denied: /etc" }
 * ```
 */
export function checkFileToolInput(
  input: Record<string, unknown>,
): { safe: boolean; rule: string; detail: string } {
  const filePaths = [
    input.file_path, input.path, input.output_path,
    input.filePath, input.inputPath,
  ].filter((p): p is string => typeof p === "string" && p.length > 0);

  for (const filePath of filePaths) {
    const result = validatePath(filePath);
    if (!result.valid) {
      return { safe: false, rule: "path_validation", detail: result.error };
    }
  }
  return { safe: true, rule: "", detail: "" };
}

/**
 * Check an HTTP tool call for SSRF violations.
 *
 * Validates the URL against blocked hostname patterns to prevent
 * Server-Side Request Forgery attacks. Respects the current security
 * mode — in basic mode, localhost/127.x URLs are allowed.
 *
 * @param input - The tool input object containing a "url" or "uri" field
 * @returns Object with `safe`, `rule`, and `detail` fields
 *
 * @example
 * ```typescript
 * const result = checkHttpToolInput({ url: "http://169.254.169.254/" });
 * // Returns: { safe: false, rule: "ssrf_protection", detail: "SSRF protection: blocked..." }
 * ```
 */
export function checkHttpToolInput(
  input: Record<string, unknown>,
): { safe: boolean; rule: string; detail: string } {
  const url = (input.url ?? input.uri ?? input.endpoint ?? "") as string;
  if (!url) return { safe: true, rule: "", detail: "" };

  const result = isSafeUrl(url);
  if (!result.safe) {
    return { safe: false, rule: "ssrf_protection", detail: result.error };
  }
  return { safe: true, rule: "", detail: "" };
}

/**
 * Scan any tool's arguments for shell injection patterns.
 *
 * Checks all string values in the input object for dangerous
 * metacharacter sequences that could be used for injection attacks.
 *
 * @param input - The tool input object to scan
 * @returns Object with `safe`, `rule`, and `detail` fields
 *
 * @example
 * ```typescript
 * const result = checkInjectionPatterns({
 *   expression: "1 + $(cat /etc/passwd)"
 * });
 * // Returns: { safe: false, rule: "injection_detection", detail: "Suspicious pattern in argument 'expression'" }
 * ```
 */
export function checkInjectionPatterns(
  input: Record<string, unknown>,
): { safe: boolean; rule: string; detail: string } {
  const dangerousPatterns: RegExp[] = [
    /;\s*(rm|sudo|chmod|chown|mkfs|dd|shred)\b/,
    /\|\s*(rm|sudo|chmod|shred|mkfs)\b/,
    /\$\([^)]*\)/,
    /`[^`]+`/,
  ];

  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") continue;
    for (const pattern of dangerousPatterns) {
      if (pattern.test(value)) {
        return {
          safe: false,
          rule: "injection_detection",
          detail: `Suspicious pattern in argument '${key}'`,
        };
      }
    }
  }
  return { safe: true, rule: "", detail: "" };
}