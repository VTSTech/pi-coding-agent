import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { debugLog } from "./debug";
import dns from "node:dns";
import { SETTINGS_PATH as _SETTINGS_PATH, SECURITY_PATH, writeJsonConfig } from "./config-io";
const SETTINGS_PATH = _SETTINGS_PATH;
const SECURITY_CONFIG_PATH = SECURITY_PATH;
let securityModeCache = null;
let securityModeCacheTime = 0;
const SECURITY_CACHE_DURATION_MS = 3e4;
function getSecurityMode() {
  const now = Date.now();
  if (securityModeCache && now - securityModeCacheTime < SECURITY_CACHE_DURATION_MS) {
    return securityModeCache;
  }
  try {
    if (!fs.existsSync(SECURITY_CONFIG_PATH)) {
      securityModeCache = "max";
      securityModeCacheTime = now;
      return "max";
    }
    const raw = fs.readFileSync(SECURITY_CONFIG_PATH, "utf-8");
    const config = JSON.parse(raw);
    if (config.mode === "basic" || config.mode === "max" || config.mode === "off") {
      securityModeCache = config.mode;
      securityModeCacheTime = now;
      return config.mode;
    }
    securityModeCache = "max";
    securityModeCacheTime = now;
    return "max";
  } catch (err) {
    debugLog("security", `failed to read security config at ${SECURITY_CONFIG_PATH}`, err);
    securityModeCache = "max";
    securityModeCacheTime = now;
    return "max";
  }
}
function setSecurityMode(mode) {
  try {
    const config = { mode, lastUpdated: (/* @__PURE__ */ new Date()).toISOString() };
    writeJsonConfig(SECURITY_CONFIG_PATH, config);
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
const CRITICAL_COMMANDS = /* @__PURE__ */ new Set([
  // Filesystem destruction (irrecoverable)
  "mkfs",
  "dd",
  "shred",
  "wipe",
  "srm",
  "format",
  "fdisk",
  // Privilege escalation (non-sudo)
  "su",
  "doas",
  "pkexec",
  "gksudo",
  "kdesu",
  // Network attack tools
  "nmap",
  "nc",
  "netcat",
  "telnet",
  // Remote access
  "ssh",
  "scp",
  "sftp",
  "rsync",
  // Process killing
  "kill",
  "killall",
  "pkill",
  "xkill",
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
  // Filesystem control
  "mount",
  "umount",
  "chattr",
  "lsattr",
  // Permission modification
  "chown",
  "chmod"
]);
const EXTENDED_COMMANDS = /* @__PURE__ */ new Set([
  // File deletion
  "rm",
  "rmdir",
  "del",
  // Privilege escalation
  "sudo",
  // Download tools
  "wget",
  "curl",
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
  // System service control
  "systemctl",
  "service",
  // Interactive editors (shell escape risk)
  "vi",
  "vim",
  "nano",
  "emacs",
  "less",
  "more",
  "man",
  // Version control
  "git"
]);
const BLOCKED_COMMANDS = /* @__PURE__ */ new Set([
  ...CRITICAL_COMMANDS,
  ...EXTENDED_COMMANDS
]);
const BLOCKED_URL_ALWAYS = /* @__PURE__ */ new Set([
  // Cloud metadata endpoints
  "169.254.169.254",
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
  // IPv6-mapped IPv4 cloud metadata (always blocked)
  "::ffff:169.254.169.254",
  // Internal service patterns
  "internal.",
  "private.",
  "intranet."
]);
const BLOCKED_URL_MAX_ONLY = /* @__PURE__ */ new Set([
  // Loopback addresses (full 127.0.0.0/8 range)
  "localhost",
  "127.",
  "0.0.0.0",
  "::1",
  "::ffff:127.0.0.1",
  "::ffff:0.0.0.0",
  // IPv6-mapped IPv4 private ranges (always blocked in max mode)
  "::ffff:10.",
  "::ffff:192.168.",
  "::ffff:172.16.",
  "::ffff:172.17.",
  "::ffff:172.18.",
  "::ffff:172.19.",
  "::ffff:172.20.",
  "::ffff:172.21.",
  "::ffff:172.22.",
  "::ffff:172.23.",
  "::ffff:172.24.",
  "::ffff:172.25.",
  "::ffff:172.26.",
  "::ffff:172.27.",
  "::ffff:172.28.",
  "::ffff:172.29.",
  "::ffff:172.30.",
  "::ffff:172.31.",
  // Local/internal patterns
  "local."
]);
const BLOCKED_URL_PATTERNS = /* @__PURE__ */ new Set([
  ...BLOCKED_URL_ALWAYS,
  ...BLOCKED_URL_MAX_ONLY
]);
const CRITICAL_SYSTEM_DIRS = [
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
    SETTINGS_PATH,
    SECURITY_CONFIG_PATH
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
  const cwd = process.cwd();
  const safePrefixes = ["/home", "/tmp", cwd];
  for (const prefix of safePrefixes) {
    if (resolved.startsWith(prefix + "/") || resolved === prefix) return { valid: true, error: "" };
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
function stripIpv6Mapped(ip) {
  if (ip.startsWith("::ffff:") && !ip.startsWith("::ffff:0:0")) {
    return ip.slice(7);
  }
  return ip;
}
function isLoopbackIp(ip) {
  const norm = stripIpv6Mapped(ip);
  if (norm.startsWith("127.") || norm === "0.0.0.0") return true;
  if (ip === "::1" || ip === "::ffff:0.0.0.0") return true;
  return false;
}
function isPrivateIp(ip) {
  const norm = stripIpv6Mapped(ip);
  if (norm.startsWith("10.") || norm.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(norm)) return true;
  if (norm === "169.254.169.254") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("fe80:")) return true;
  return false;
}
async function resolveAndCheckHostname(hostname, blockPrivate = true) {
  try {
    const addresses = await new Promise((resolve, reject) => {
      dns.lookup(hostname, { all: true }, (err, addresses2) => {
        if (err) reject(err);
        else resolve(addresses2);
      });
    });
    if (!addresses || addresses.length === 0) {
      return { safe: true, error: "" };
    }
    for (const addr of addresses) {
      const ip = addr.address;
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
    return { safe: true, error: "" };
  }
}
function isSafeUrl(url, blockSsrf = true, mode = "max") {
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
  const normalized = hostname.replace(/\.$/, "");
  if (/[^\x00-\x7F]/.test(normalized)) {
    return { safe: false, error: "URL hostname contains non-ASCII characters" };
  }
  if (/^0x[0-9a-f]+$/i.test(normalized) || /^0[0-7]+$/i.test(normalized)) {
    return { safe: false, error: "URL hostname uses non-decimal IP format" };
  }
  if (blockSsrf) {
    if (mode === "off") {
      return { safe: true, error: "" };
    }
    for (const pattern of BLOCKED_URL_ALWAYS) {
      if (normalized === pattern || normalized.endsWith("." + pattern) || normalized.startsWith(pattern)) {
        if (/^\d|^::/.test(pattern)) {
          const nextChar = normalized[pattern.length];
          if (nextChar && nextChar !== "/" && nextChar !== ":" && !/\d/.test(nextChar)) {
            continue;
          }
        }
        return { safe: false, error: `SSRF protection: blocked hostname pattern '${pattern}'` };
      }
    }
    if (mode === "max") {
      for (const pattern of BLOCKED_URL_MAX_ONLY) {
        if (normalized === pattern || normalized.endsWith("." + pattern) || normalized.startsWith(pattern)) {
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
const INJECTION_PATTERNS = [
  // Semicolon chaining to dangerous commands — mode-independent.
  // Unlike && (conditional), ; ALWAYS runs the second command.
  /;\s*(rm|sudo|chmod|chown|mkfs|dd|shred|kill|pkill)\b/i,
  // Command substitution (backticks) — still dangerous
  /`[^`]+`/,
  // Command substitution ($()) — still dangerous
  /\$\([^)]+\)/,
  // Variable expansion targeting sensitive env vars
  /\$\{?(?:HOME|USER|PATH|SHELL|PWD|SSH|GPG|API_KEY|TOKEN|SECRET|PASSWORD)\}?/i
];
function checkSingleCommand(command, mode) {
  const trimmed = command.trim();
  if (!trimmed) return { isSafe: true, error: "", command: "" };
  const parts = trimmed.split(/\s+/);
  let baseCmd = parts[0].toLowerCase();
  if (baseCmd.includes("/")) baseCmd = baseCmd.split("/").pop();
  if (baseCmd.includes("\\")) baseCmd = baseCmd.split("\\").pop();
  for (const raw of parts) {
    let word = raw.toLowerCase();
    if (word.includes("/")) word = word.split("/").pop();
    if (word.includes("\\")) word = word.split("\\").pop();
    if (CRITICAL_COMMANDS.has(word)) {
      return { isSafe: false, error: `Blocked command: ${word} (critical)`, command: "" };
    }
  }
  if (mode === "max" && EXTENDED_COMMANDS.has(baseCmd)) {
    return { isSafe: false, error: `Blocked command: ${baseCmd} (max mode)`, command: "" };
  }
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { isSafe: false, error: `Potential injection pattern detected in: ${trimmed}`, command: "" };
    }
  }
  return { isSafe: true, error: "", command: trimmed };
}
function sanitizeCommand(command) {
  if (!command) return { isSafe: false, error: "Command cannot be empty", command: "" };
  let normalizedCmd = command.normalize("NFKC");
  normalizedCmd = normalizedCmd.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff\u2060-\u2069]/g, "");
  const strippedForCompare = command.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\ufeff\u2060-\u2069]/g, "").normalize("NFKC");
  if (normalizedCmd !== strippedForCompare) {
    return { isSafe: false, error: `Command rejected: Unicode normalization variance detected (possible homoglyph bypass)`, command: "" };
  }
  command = normalizedCmd;
  const trimmed = command.trim();
  if (!trimmed) return { isSafe: false, error: "Command cannot be empty", command: "" };
  const newlineStripped = command.replace(/\n/g, " ").replace(/\r/g, " ");
  if (newlineStripped !== command) {
    return { isSafe: false, error: "Newline characters detected: potential command injection", command: "" };
  }
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { isSafe: false, error: `Potential injection pattern detected`, command: "" };
    }
  }
  const subCommands = [];
  let remaining = trimmed;
  const chainRegex = /&&|\|\||(?<!\|)\|(?!\|)/g;
  let match;
  let lastIndex = 0;
  while ((match = chainRegex.exec(remaining)) !== null) {
    subCommands.push(remaining.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;
  }
  subCommands.push(remaining.slice(lastIndex));
  const mode = getSecurityMode();
  for (const subCmd of subCommands) {
    const result = checkSingleCommand(subCmd, mode);
    if (!result.isSafe) {
      return { isSafe: false, error: result.error, command: "" };
    }
  }
  return { isSafe: true, error: "", command };
}
const AUDIT_DIR = path.join(os.homedir(), ".pi", "agent");
const AUDIT_LOG_PATH = path.join(AUDIT_DIR, "audit.log");
const AUDIT_BUFFER_MAX_ENTRIES = 50;
const AUDIT_FLUSH_INTERVAL_MS = 500;
let _auditBuffer = [];
let _auditFlushTimer = null;
function ensureAuditFlushTimer() {
  if (_auditFlushTimer) return;
  _auditFlushTimer = setInterval(() => {
    if (_auditBuffer.length > 0) {
      flushAuditBuffer();
    }
  }, AUDIT_FLUSH_INTERVAL_MS);
  const timerRef = _auditFlushTimer;
  if (timerRef.unref) {
    timerRef.unref();
  }
}
function flushAuditBuffer() {
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
function appendAuditEntry(entry) {
  try {
    ensureAuditFlushTimer();
    const AUDIT_LOG_MAX_SIZE = 5 * 1024 * 1024;
    try {
      if (fs.existsSync(AUDIT_LOG_PATH)) {
        const stat = fs.statSync(AUDIT_LOG_PATH);
        if (stat.size > AUDIT_LOG_MAX_SIZE) {
          const entries = readRecentAuditEntries(1e3);
          const content = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
          fs.writeFileSync(AUDIT_LOG_PATH, content, "utf-8");
        }
      }
    } catch (err) {
      debugLog("security", "audit log rotation failed", err);
    }
    const enriched = { ...entry, securityMode: getSecurityMode() };
    const line = JSON.stringify(enriched) + "\n";
    _auditBuffer.push(line);
    if (_auditBuffer.length >= AUDIT_BUFFER_MAX_ENTRIES) {
      flushAuditBuffer();
    }
  } catch (err) {
    debugLog("security", "audit log entry creation failure", err);
  }
}
function readRecentAuditEntries(count = 50) {
  try {
    if (!fs.existsSync(AUDIT_LOG_PATH)) return [];
    const fileSize = fs.statSync(AUDIT_LOG_PATH).size;
    if (fileSize === 0) return [];
    const fd = fs.openSync(AUDIT_LOG_PATH, "r");
    const bufferSize = 8192;
    const buffer = Buffer.alloc(bufferSize);
    const lines = [];
    let pos = fileSize;
    let partial = "";
    while (pos > 0 && lines.length < count) {
      const readSize = Math.min(bufferSize, pos);
      pos -= readSize;
      fs.readSync(fd, buffer, 0, readSize, pos);
      const chunk = buffer.slice(0, readSize).toString("utf-8");
      partial = chunk + partial;
      const lineBreak = partial.lastIndexOf("\n");
      if (lineBreak !== -1) {
        const complete = partial.slice(lineBreak + 1);
        if (complete.trim()) lines.unshift(complete);
        partial = partial.slice(0, lineBreak);
      }
    }
    fs.closeSync(fd);
    if (partial.trim() && lines.length < count) {
      lines.unshift(partial);
    }
    const recent = lines.slice(-count);
    return recent.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return {};
      }
    });
  } catch (err) {
    debugLog("security", "failed to read audit log", err);
    return [];
  }
}
process.on("exit", () => {
  flushAuditBuffer();
});
process.on("SIGTERM", () => {
  flushAuditBuffer();
});
function checkBashToolInput(input, mode = "max") {
  if (mode === "off") return { safe: true, rule: "", detail: "" };
  const command = input.command ?? input.cmd ?? "";
  if (!command) return { safe: true, rule: "", detail: "" };
  const result = sanitizeCommand(command, mode);
  if (!result.isSafe) {
    return { safe: false, rule: "command_blocklist", detail: result.error };
  }
  return { safe: true, rule: "", detail: "" };
}
function checkFileToolInput(input, mode = "max") {
  if (mode === "off") return { safe: true, rule: "", detail: "" };
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
function checkHttpToolInput(input, mode = "max") {
  if (mode === "off") return { safe: true, rule: "", detail: "" };
  const url = input.url ?? input.uri ?? input.endpoint ?? "";
  if (!url) return { safe: true, rule: "", detail: "" };
  const result = isSafeUrl(url, mode);
  if (!result.safe) {
    return { safe: false, rule: "ssrf_protection", detail: result.error };
  }
  return { safe: true, rule: "", detail: "" };
}
function checkInjectionPatterns(input, mode = "max") {
  if (mode === "off") return { safe: true, rule: "", detail: "" };
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
  BLOCKED_URL_ALWAYS,
  BLOCKED_URL_MAX_ONLY,
  BLOCKED_URL_PATTERNS,
  CRITICAL_COMMANDS,
  EXTENDED_COMMANDS,
  SECURITY_CONFIG_PATH,
  SETTINGS_PATH,
  appendAuditEntry,
  checkBashToolInput,
  checkFileToolInput,
  checkHttpToolInput,
  checkInjectionPatterns,
  flushAuditBuffer,
  getSecurityMode,
  isSafeUrl,
  readRecentAuditEntries,
  resolveAndCheckHostname,
  sanitizeCommand,
  setSecurityMode,
  validatePath
};
