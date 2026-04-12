// shared/security.ts
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
var BLOCKED_COMMANDS = /* @__PURE__ */ new Set([
  // System modification
  "rm",
  "rmdir",
  "del",
  "format",
  "fdisk",
  "mkfs",
  "dd",
  "shred",
  "wipe",
  "srm",
  // Privilege escalation
  "sudo",
  "su",
  "doas",
  "pkexec",
  "gksudo",
  "kdesu",
  // Network attacks
  "nmap",
  "nc",
  "netcat",
  "telnet",
  "wget",
  "curl",
  "ssh",
  "scp",
  "sftp",
  "rsync",
  // Package management
  "apt",
  "apt-get",
  "yum",
  "dnf",
  "pacman",
  "pip",
  "npm",
  "yarn",
  "cargo",
  // Process control
  "kill",
  "killall",
  "pkill",
  "xkill",
  "systemctl",
  "service",
  // User management
  "useradd",
  "userdel",
  "usermod",
  "passwd",
  "adduser",
  "deluser",
  // Dangerous shell features
  "exec",
  "eval",
  "source",
  ".",
  "alias",
  // Filesystem
  "mount",
  "umount",
  "chown",
  "chmod",
  "chattr",
  "lsattr",
  // Shell escapes
  "vi",
  "vim",
  "nano",
  "emacs",
  "less",
  "more",
  "man"
]);
var BLOCKED_URL_PATTERNS = /* @__PURE__ */ new Set([
  // Loopback (full 127.0.0.0/8 range)
  "localhost",
  "127.",
  "0.0.0.0",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:0.0.0.0",
  // RFC1918 private ranges
  "10.",
  "192.168.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  // Cloud metadata endpoints
  "169.254.169.254",
  // Internal service patterns
  "internal.",
  "local.",
  "private.",
  "intranet."
]);
var CRITICAL_SYSTEM_DIRS = [
  "/etc",
  "/root",
  "/var",
  "/usr",
  "/bin",
  "/sbin",
  "/boot",
  "/dev",
  "/proc",
  "/sys"
];
function validatePath(filePath, allowedDirs) {
  if (!filePath) return { valid: false, error: "Path cannot be empty" };
  if (filePath.startsWith("\\\\")) {
    return { valid: false, error: "UNC paths not allowed" };
  }
  if (filePath.includes("../") || filePath.includes("..\\")) {
    return { valid: false, error: "Path traversal detected: parent directory access not allowed" };
  }
  let resolved;
  try {
    resolved = path.resolve(filePath);
    try {
      resolved = fs.realpathSync(resolved);
    } catch {
    }
  } catch {
    return { valid: false, error: "Invalid path format" };
  }
  for (const critical of CRITICAL_SYSTEM_DIRS) {
    if (resolved.startsWith(critical + "/") || resolved === critical) {
      return { valid: false, error: `Access to system directory denied: ${critical}` };
    }
  }
  const sensitivePaths = [
    "/etc/shadow",
    "/etc/passwd",
    "/.ssh/",
    "/.gnupg/",
    path.join(os.homedir(), ".ssh"),
    path.join(os.homedir(), ".gnupg"),
    path.join(os.homedir(), ".pi", "agent", "models.json")
  ];
  for (const sensitive of sensitivePaths) {
    if (resolved.startsWith(sensitive) || resolved === sensitive) {
      return { valid: false, error: `Access to sensitive path denied: ${sensitive}` };
    }
  }
  const cwd = process.cwd();
  const safePrefixes = ["/tmp", "/var/tmp", "/home", cwd];
  for (const prefix of safePrefixes) {
    if (resolved.startsWith(prefix)) return { valid: true, error: "" };
  }
  if (allowedDirs) {
    for (const dir of allowedDirs) {
      try {
        const absDir = path.resolve(dir);
        if (resolved.startsWith(absDir)) return { valid: true, error: "" };
      } catch {
      }
    }
  }
  return { valid: false, error: `Path not in allowed directories: ${filePath}` };
}
function isSafeUrl(url, blockSsrf = true) {
  if (!url) return { safe: false, error: "URL cannot be empty" };
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { safe: false, error: `Invalid URL format: ${msg}` };
  }
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
var INJECTION_PATTERNS = [
  /;\s*\w+/,
  // Command chaining
  /\|\s*\w+/,
  // Piping to another command
  /&&\s*\w+/,
  // AND chaining
  /\|\|\s*\w+/,
  // OR chaining
  /`[^`]+`/,
  // Command substitution (backticks)
  /\$\([^)]+\)/,
  // Command substitution ($())
  /\$\{[^}]+\}/,
  // Variable expansion
  />\s*\S+/,
  // Output redirection
  /<\s*\S+/,
  // Input redirection
  /\|(?=[^\s|])/
  // Bare pipe without space
];
function sanitizeCommand(command) {
  if (!command) return { isSafe: false, error: "Command cannot be empty", command: "" };
  const parts = command.trim().split(/\s+/);
  if (!parts.length) return { isSafe: false, error: "Command cannot be empty", command: "" };
  let baseCmd = parts[0].toLowerCase();
  if (baseCmd.includes("/")) baseCmd = baseCmd.split("/").pop();
  if (baseCmd.includes("\\")) baseCmd = baseCmd.split("\\").pop();
  if (BLOCKED_COMMANDS.has(baseCmd)) {
    return { isSafe: false, error: `Blocked command: ${baseCmd}`, command: "" };
  }
  const stripped = command.replace(/\n/g, " ").replace(/\r/g, " ");
  if (stripped !== command) {
    return { isSafe: false, error: "Newline characters detected: potential command injection", command: "" };
  }
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(command)) {
      return { isSafe: false, error: `Potential injection pattern detected`, command: "" };
    }
  }
  return { isSafe: true, error: "", command };
}
var AUDIT_DIR = path.join(os.homedir(), ".pi", "agent");
var AUDIT_LOG_PATH = path.join(AUDIT_DIR, "audit.log");
function appendAuditEntry(entry) {
  try {
    if (!fs.existsSync(AUDIT_DIR)) {
      fs.mkdirSync(AUDIT_DIR, { recursive: true });
    }
    const line = JSON.stringify(entry) + "\n";
    fs.appendFileSync(AUDIT_LOG_PATH, line, "utf-8");
  } catch {
  }
}
function readRecentAuditEntries(count = 50) {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
    const content = fs.readFileSync(AUDIT_LOG_PATH, "utf-8");
    const lines = content.trim().split("\n");
    const recent = lines.slice(-count);
    return recent.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return {};
      }
    });
  } catch {
    return [];
  }
}
function checkBashToolInput(input) {
  const command = input.command ?? input.cmd ?? "";
  if (!command) return { safe: true, rule: "", detail: "" };
  const result = sanitizeCommand(command);
  if (!result.isSafe) {
    return { safe: false, rule: "command_blocklist", detail: result.error };
  }
  return { safe: true, rule: "", detail: "" };
}
function checkFileToolInput(input) {
  const filePaths = [
    input.file_path,
    input.path,
    input.output_path,
    input.filePath,
    input.inputPath
  ].filter((p) => typeof p === "string" && p.length > 0);
  for (const filePath of filePaths) {
    const result = validatePath(filePath);
    if (!result.valid) {
      return { safe: false, rule: "path_validation", detail: result.error };
    }
  }
  return { safe: true, rule: "", detail: "" };
}
function checkHttpToolInput(input) {
  const url = input.url ?? input.uri ?? input.endpoint ?? "";
  if (!url) return { safe: true, rule: "", detail: "" };
  const result = isSafeUrl(url);
  if (!result.safe) {
    return { safe: false, rule: "ssrf_protection", detail: result.error };
  }
  return { safe: true, rule: "", detail: "" };
}
function checkInjectionPatterns(input) {
  const dangerousPatterns = [
    /;\s*(rm|sudo|chmod|chown|mkfs|dd|shred)\b/,
    /\|\s*(rm|sudo|chmod|shred|mkfs)\b/,
    /\$\([^)]*\)/,
    /`[^`]+`/
  ];
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") continue;
    for (const pattern of dangerousPatterns) {
      if (pattern.test(value)) {
        return {
          safe: false,
          rule: "injection_detection",
          detail: `Suspicious pattern in argument '${key}'`
        };
      }
    }
  }
  return { safe: true, rule: "", detail: "" };
}
export {
  AUDIT_LOG_PATH,
  BLOCKED_COMMANDS,
  BLOCKED_URL_PATTERNS,
  appendAuditEntry,
  checkBashToolInput,
  checkFileToolInput,
  checkHttpToolInput,
  checkInjectionPatterns,
  isSafeUrl,
  readRecentAuditEntries,
  sanitizeCommand,
  validatePath
};
