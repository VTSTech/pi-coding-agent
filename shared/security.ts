/**
 * Shared security utilities for Pi Coding Agent extensions.
 * Ported from AgentNova core/helpers.py — security layer.
 *
 * Provides: command blocklist, path validation, SSRF protection,
 * injection detection, URL validation, audit logging.
 *
 * Written by VTSTech — https://www.vts-tech.org
 */
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

// ============================================================================
// Command Blocklist
// ============================================================================

/** Blocked shell commands — ported from AgentNova BLOCKED_COMMANDS. */
export const BLOCKED_COMMANDS: ReadonlySet<string> = new Set([
  // System modification
  "rm", "rmdir", "del", "format", "fdisk", "mkfs",
  "dd", "shred", "wipe", "srm",
  // Privilege escalation
  "sudo", "su", "doas", "pkexec", "gksudo", "kdesu",
  // Network attacks
  "nmap", "nc", "netcat", "telnet", "wget", "curl",
  "ssh", "scp", "sftp", "rsync",
  // Package management
  "apt", "apt-get", "yum", "dnf", "pacman", "pip", "npm", "yarn", "cargo",
  // Process control
  "kill", "killall", "pkill", "xkill", "systemctl", "service",
  // User management
  "useradd", "userdel", "usermod", "passwd", "adduser", "deluser",
  // Dangerous shell features
  "exec", "eval", "source", ".", "alias",
  // Filesystem
  "mount", "umount", "chown", "chmod", "chattr", "lsattr",
  // Shell escapes
  "vi", "vim", "nano", "emacs", "less", "more", "man",
]);

// ============================================================================
// SSRF Protection
// ============================================================================

/** Blocked URL hostname patterns — ported from AgentNova BLOCKED_URL_PATTERNS. */
export const BLOCKED_URL_PATTERNS: ReadonlySet<string> = new Set([
  // Loopback
  "localhost", "127.0.0.1", "0.0.0.0", "::1",
  // RFC1918 private ranges
  "10.", "192.168.",
  "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.",
  "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.",
  "172.28.", "172.29.", "172.30.", "172.31.",
  // Cloud metadata endpoints
  "169.254.169.254",
  // Internal service patterns
  "internal.", "local.", "private.", "intranet.",
]);

// ============================================================================
// Path Validation
// ============================================================================

/** System directories that file tools must not access. */
const CRITICAL_SYSTEM_DIRS = [
  "/etc", "/root", "/var", "/usr", "/bin", "/sbin", "/boot", "/dev", "/proc", "/sys",
];

/**
 * Validate a file path for security.
 * Ported from AgentNova validate_path().
 *
 * Checks: empty paths, UNC paths, path traversal, system directories.
 * Allows: /tmp, /var/tmp, /home, CWD, and custom allowed directories.
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
    path.join(os.homedir(), ".pi", "agent", "models.json"),
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

// ============================================================================
// URL Validation (SSRF Protection)
// ============================================================================

/**
 * Validate a URL for SSRF protection.
 * Ported from AgentNova is_safe_url().
 */
export function isSafeUrl(
  url: string,
  blockSsrf = true,
): { safe: boolean; error: string } {
  if (!url) return { safe: false, error: "URL cannot be empty" };

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch (e: any) {
    return { safe: false, error: `Invalid URL format: ${e.message}` };
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

  if (blockSsrf) {
    for (const pattern of BLOCKED_URL_PATTERNS) {
      if (hostname === pattern || hostname.endsWith("." + pattern) || hostname.startsWith(pattern)) {
        return { safe: false, error: `SSRF protection: blocked hostname pattern '${pattern}'` };
      }
    }
  }

  return { safe: true, error: "" };
}

// ============================================================================
// Command Sanitization & Injection Detection
// ============================================================================

/** Injection regex patterns — ported from AgentNova sanitize_command(). */
const INJECTION_PATTERNS: RegExp[] = [
  /;\s*\w+/,         // Command chaining
  /\|\s*\w+/,        // Piping to another command
  /&&\s*\w+/,        // AND chaining
  /\|\|\s*\w+/,      // OR chaining
  /`[^`]+`/,         // Command substitution (backticks)
  /\$\([^)]+\)/,     // Command substitution ($())
  /\$\{[^}]+\}/,     // Variable expansion
  />\s*\S+/,         // Output redirection
  /<\s*\S+/,         // Input redirection
  /\|(?=[^\s|])/,    // Bare pipe without space
];

/**
 * Sanitize and validate a shell command.
 * Ported from AgentNova sanitize_command().
 *
 * Returns { isSafe, error, command }.
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

  // Check against blocklist
  if (BLOCKED_COMMANDS.has(baseCmd)) {
    return { isSafe: false, error: `Blocked command: ${baseCmd}`, command: "" };
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
// Audit Logging
// ============================================================================

/** Default audit log directory. */
const AUDIT_DIR = path.join(os.homedir(), ".pi", "agent");
const AUDIT_LOG_PATH = path.join(AUDIT_DIR, "audit.log");

/** Append an audit entry to the JSON-lines log file. */
export function appendAuditEntry(entry: Record<string, unknown>): void {
  try {
    if (!fs.existsSync(AUDIT_DIR)) {
      fs.mkdirSync(AUDIT_DIR, { recursive: true });
    }
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(AUDIT_LOG_PATH, line, "utf-8");
  } catch { /* log write failure is non-critical */ }
}

/** Read recent audit entries (last N lines). */
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
  } catch {
    return [];
  }
}

// ============================================================================
// Tool Input Security Checks
// ============================================================================

/**
 * Check a bash tool call for security violations.
 * Validates the command string against blocklist and injection patterns.
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
 * Validates file_path, path, or output_path against sensitive directories.
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
 * Validates URL against blocked hostname patterns.
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
 * Checks all string values for metacharacter injection.
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