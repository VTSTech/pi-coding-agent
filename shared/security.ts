/**
 * Shared security utilities for Pi Coding Agent extensions.
 * Ported from AgentNova core/helpers.py — security layer.
 *
 * Provides comprehensive security controls including:
 * - Command blocklist validation
 * - Path validation (filesystem escape prevention)
 * - SSRF protection (internal IP blocking)
 * - Shell injection detection
 * - URL validation
 * - Audit logging
 *
 * @module shared/security
 * @writtenby VTSTech — https://www.vts-tech.org
 */
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

// ============================================================================
// Command Blocklist
// ============================================================================

/**
 * Set of blocked shell commands that should never be executed.
 *
 * Ported from AgentNova's `BLOCKED_COMMANDS` configuration.
 * Commands are blocked based on their base name (path prefixes are stripped).
 *
 * Categories:
 * - **System modification**: rm, rmdir, format, fdisk, mkfs, dd, shred
 * - **Privilege escalation**: sudo, su, doas, pkexec
 * - **Network attacks**: nmap, nc, netcat, telnet
 * - **Package management**: apt, yum, dnf, pacman, pip, npm
 * - **Process control**: kill, killall, systemctl
 * - **User management**: useradd, userdel, passwd
 * - **Dangerous shell features**: exec, eval, source
 * - **Filesystem**: mount, umount, chown, chmod
 * - **Shell escapes**: vi, vim, nano, emacs, less, more
 *
 * @example
 * ```typescript
 * if (BLOCKED_COMMANDS.has("rm")) {
 *   console.log("rm command is blocked");
 * }
 * ```
 */
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

/**
 * Set of blocked URL hostname patterns for SSRF protection.
 *
 * Ported from AgentNova's `BLOCKED_URL_PATTERNS` configuration.
 * These patterns are matched against URL hostnames to prevent
 * Server-Side Request Forgery attacks.
 *
 * Categories:
 * - **Loopback**: localhost, 127.0.0.1, 0.0.0.0, ::1
 * - **RFC1918 private ranges**: 10.x, 192.168.x, 172.16-31.x
 * - **Cloud metadata endpoints**: 169.254.169.254 (AWS, GCP, Azure)
 * - **Internal service patterns**: internal., local., private., intranet.
 *
 * @example
 * ```typescript
 * // Check if a URL hostname matches a blocked pattern
 * const hostname = "169.254.169.254";
 * for (const pattern of BLOCKED_URL_PATTERNS) {
 *   if (hostname === pattern || hostname.startsWith(pattern)) {
 *     console.log(`Blocked: matches ${pattern}`);
 *   }
 * }
 * ```
 */
export const BLOCKED_URL_PATTERNS: ReadonlySet<string> = new Set([
  // Loopback
  "localhost", "127.0.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1",
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
 *
 * Checks a URL for security violations:
 * 1. Rejects empty URLs
 * 2. Validates URL format
 * 3. Only allows http and https schemes
 * 4. Blocks hostnames matching SSRF patterns
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
 * // Blocked internal URL
 * isSafeUrl("http://localhost:8080/admin");
 * // Returns: { safe: false, error: "SSRF protection: blocked hostname pattern 'localhost'" }
 *
 * // Blocked cloud metadata endpoint
 * isSafeUrl("http://169.254.169.254/latest/meta-data/");
 * // Returns: { safe: false, error: "SSRF protection: blocked hostname pattern '169.254.169.254'" }
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

/**
 * Regex patterns for detecting shell injection attempts.
 *
 * These patterns detect common shell metacharacter sequences that
 * could be used to inject additional commands.
 */
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
 *
 * Performs comprehensive security checks on a command string:
 * 1. Rejects empty commands
 * 2. Extracts and checks the base command against blocklist
 * 3. Detects newline injection
 * 4. Checks for shell metacharacter injection patterns
 *
 * @param command - The command string to validate
 * @returns Object with `isSafe`, `error`, and sanitized `command`
 *
 * @example
 * ```typescript
 * // Safe command
 * sanitizeCommand("ls -la /home/user");
 * // Returns: { isSafe: true, error: "", command: "ls -la /home/user" }
 *
 * // Blocked command
 * sanitizeCommand("rm -rf /");
 * // Returns: { isSafe: false, error: "Blocked command: rm", command: "" }
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

/** Path to the audit log file. Exported for use by diag.ts and other extensions. */
export const AUDIT_LOG_PATH = path.join(AUDIT_DIR, "audit.log");

/**
 * Append an audit entry to the JSON-lines log file.
 *
 * Each entry is written as a single line of JSON, making the log
 * easy to parse and analyze. Log write failures are silently
 * ignored since logging is non-critical.
 *
 * @param entry - The audit entry to write
 *
 * @example
 * ```typescript
 * appendAuditEntry({
 *   timestamp: new Date().toISOString(),
 *   toolName: "bash",
 *   action: "blocked",
 *   rule: "command_blocklist",
 *   detail: "Blocked command: rm",
 * });
 * ```
 */
export function appendAuditEntry(entry: Record<string, unknown>): void {
  try {
    if (!fs.existsSync(AUDIT_DIR)) {
      fs.mkdirSync(AUDIT_DIR, { recursive: true });
    }
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(AUDIT_LOG_PATH, line, "utf-8");
  } catch { /* log write failure is non-critical */ }
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
 *     console.log(`Blocked: ${entry.toolName} - ${entry.detail}`);
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
  } catch {
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
 * Server-Side Request Forgery attacks.
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