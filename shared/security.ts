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

// ============================================================================
// Settings Path
// ============================================================================

/** Path to the Pi agent settings file — protected against tool-based access. */
export const SETTINGS_PATH = path.join(os.homedir(), ".pi", "agent", "settings.json");

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
export const SECURITY_CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "security.json");

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
 * Creates the `~/.pi/agent/` directory if it does not already exist.
 * The file is written atomically (writeFileSync) to prevent partial writes.
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
  const configDir = path.dirname(SECURITY_CONFIG_PATH);
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    const config: SecurityConfig = { mode, lastUpdated: new Date().toISOString() };
    fs.writeFileSync(SECURITY_CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");

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

  // Allow standard safe paths
  const cwd = process.cwd();
  const safePrefixes = ["/tmp", "/var/tmp", "/home", cwd];
  for (const prefix of safePrefixes) {
    if (resolved.startsWith(prefix)) return { valid: true, error: "" };
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
 * Check if an IP address is a loopback address.
 * Handles IPv4 (127.0.0.0/8) and IPv6 (::1, ::ffff:127.0.0.0/104).
 */
function isLoopbackIp(ip: string): boolean {
  // IPv4 loopback
  if (ip.startsWith("127.") || ip === "0.0.0.0") return true;
  // IPv6 loopback
  if (ip === "::1" || ip === "::ffff:0.0.0.0") return true;
  // IPv4-mapped IPv6 loopback
  if (ip.startsWith("::ffff:127.")) return true;
  return false;
}

/**
 * Check if an IP address is a private/RFC1918 address.
 * Handles IPv4 (10.x, 172.16-31.x, 192.168.x) and IPv6 (fc00::/7, fe80::/10).
 */
function isPrivateIp(ip: string): boolean {
  // IPv4 private ranges
  if (ip.startsWith("10.") || ip.startsWith("192.168.")) return true;
  // 172.16.0.0 – 172.31.255.255
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  // Cloud metadata
  if (ip === "169.254.169.254") return true;
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
      // Always block cloud metadata endpoint
      if (ip === "169.254.169.254") {
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
        return { safe: false, error: `SSRF protection: blocked hostname pattern '${pattern}'` };
      }
    }

    // MAX ONLY block: loopback addresses (allowed in basic mode)
    if (mode === "max") {
      for (const pattern of BLOCKED_URL_MAX_ONLY) {
        if (normalized === pattern || normalized.endsWith("." + pattern) || normalized.startsWith(pattern)) {
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
 * These patterns detect common shell metacharacter sequences that
 * could be used to inject additional commands.
 */
const INJECTION_PATTERNS: RegExp[] = [
  // Command chaining with dangerous commands only
  /;\s*(rm|sudo|chmod|chown|mkfs|dd|shred|kill|pkill)\b/i,
  // Piping to dangerous commands
  /\|\s*(rm|sudo|chmod|chown|shred|mkfs)\b/i,
  // AND chaining with dangerous commands
  /&&\s*(rm|sudo|chmod|chown|mkfs|dd|shred|kill)\b/i,
  // Command substitution (backticks) — still dangerous
  /`[^`]+`/,
  // Command substitution ($()) — still dangerous
  /\$\([^)]+\)/,
  // Variable expansion targeting sensitive env vars
  /\$\{?(?:HOME|USER|PATH|SHELL|PWD|SSH|GPG|API_KEY|TOKEN|SECRET|PASSWORD)\}?/i,
  // Bare pipe without space (likely injection, not intentional piping)
  /\|(?=[^\s|])/,
];

/**
 * Sanitize and validate a shell command.
 *
 * Performs comprehensive security checks on a command string:
 * 1. Rejects empty commands
 * 2. Extracts and checks the base command against blocklists
 *    - CRITICAL_COMMANDS are always blocked
 *    - EXTENDED_COMMANDS are blocked only in max mode
 * 3. Detects newline injection
 * 4. Checks for shell metacharacter injection patterns
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
 * // Critical command — always blocked
 * sanitizeCommand("dd if=/dev/zero of=/dev/sda");
 * // Returns: { isSafe: false, error: "Blocked command: dd (critical)", command: "" }
 *
 * // Extended command — blocked only in max mode
 * sanitizeCommand("npm install lodash");
 * // Max: { isSafe: false, error: "Blocked command: npm (max mode)", command: "" }
 * // Basic: { isSafe: true, error: "", command: "npm install lodash" }
 *
 * // Injection attempt
 * sanitizeCommand("ls; rm -rf /");
 * // Returns: { isSafe: false, error: "Potential injection pattern detected", command: "" }
 * ```
 */
export function sanitizeCommand(
  command: string,
): { isSafe: boolean; error: string; command: string } {
  if (!command) return { isSafe: false, error: "Command cannot be empty", command: "" };

  // Parse base command
  const parts = command.trim().split(/\s+/);
  if (!parts.length) return { isSafe: false, error: "Command cannot be empty", command: "" };

  let baseCmd = parts[0].toLowerCase();

  // Remove path prefixes
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
  const mode = getSecurityMode();
  if (mode === "max" && EXTENDED_COMMANDS.has(baseCmd)) {
    return { isSafe: false, error: `Blocked command: ${baseCmd} (max mode)`, command: "" };
  }

  // Check for newlines/carriage returns
  const stripped = command.replace(/\n/g, " ").replace(/\r/g, " ");
  if (stripped !== command) {
    return { isSafe: false, error: "Newline characters detected: potential command injection", command: "" };
  }

  // Check for injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(command)) {
      return { isSafe: false, error: `Potential injection pattern detected`, command: "" };
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
    const content = fs.readFileSync(AUDIT_LOG_PATH, "utf-8");
    const lines = content.trim().split("\n");
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