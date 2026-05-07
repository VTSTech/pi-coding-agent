// shared/security.ts
import * as fs2 from "node:fs";
import * as path2 from "node:path";
import os2 from "node:os";

// shared/debug.ts
var DEBUG_ENABLED = process?.env?.PI_EXTENSIONS_DEBUG === "1";
function debugLog(module, message, ...args) {
  if (!DEBUG_ENABLED) return;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  console.debug(`[pi-ext:${module}] ${timestamp} ${message}`, ...args);
}

// shared/config-io.ts
import * as fs from "fs";
import * as path from "path";
import os from "os";
var PI_AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
function writeJsonConfig(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const content = JSON.stringify(data, null, 2) + "\n";
  const tmpPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, content, "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch {
    fs.writeFileSync(filePath, content, "utf-8");
  }
}
var SETTINGS_PATH = path.join(PI_AGENT_DIR, "settings.json");
var SECURITY_PATH = path.join(PI_AGENT_DIR, "security.json");
var REACT_MODE_PATH = path.join(PI_AGENT_DIR, "react-mode.json");
var MODEL_TEST_CONFIG_PATH = path.join(PI_AGENT_DIR, "model-test-config.json");

// shared/security.ts
var SETTINGS_PATH2 = SETTINGS_PATH;
var SECURITY_CONFIG_PATH = SECURITY_PATH;
var securityModeCache = null;
var securityModeCacheTime = 0;
var SECURITY_CACHE_DURATION_MS = 3e4;
function getSecurityMode() {
  const now = Date.now();
  if (securityModeCache && now - securityModeCacheTime < SECURITY_CACHE_DURATION_MS) {
    return securityModeCache;
  }
  try {
    if (!fs2.existsSync(SECURITY_CONFIG_PATH)) {
      securityModeCache = "max";
      securityModeCacheTime = now;
      return "max";
    }
    const raw = fs2.readFileSync(SECURITY_CONFIG_PATH, "utf-8");
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
    const verify = JSON.parse(fs2.readFileSync(SECURITY_CONFIG_PATH, "utf-8"));
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
var CRITICAL_COMMANDS = /* @__PURE__ */ new Set([
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
var EXTENDED_COMMANDS = /* @__PURE__ */ new Set([
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
var BLOCKED_COMMANDS = /* @__PURE__ */ new Set([
  ...CRITICAL_COMMANDS,
  ...EXTENDED_COMMANDS
]);
var BLOCKED_URL_ALWAYS = /* @__PURE__ */ new Set([
  // Cloud metadata endpoints
  "169.254.169.254",
  // AWS metadata
  "metadata.google.internal",
  // GCP metadata
  "169.254.170.2",
  // GCP metadata alternative
  "169.254.169.254",
  // Azure metadata
  "169.254.170.4",
  // Azure metadata alternative
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
var BLOCKED_URL_MAX_ONLY = /* @__PURE__ */ new Set([
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
var BLOCKED_URL_PATTERNS = /* @__PURE__ */ new Set([
  ...BLOCKED_URL_ALWAYS,
  ...BLOCKED_URL_MAX_ONLY
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
    resolved = path2.resolve(filePath);
    try {
      resolved = fs2.realpathSync(resolved);
    } catch {
    }
    const originalResolved = path2.resolve(filePath);
    if (!resolved.startsWith(originalResolved)) {
      const isInAllowedDir = allowedDirs?.some((dir) => {
        const allowedResolved = path2.resolve(dir);
        return resolved.startsWith(allowedResolved);
      }) ?? false;
      if (!isInAllowedDir) {
        return { valid: false, error: "Symlink escape attempt detected: resolved path escapes allowed boundaries" };
      }
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
    path2.join(os2.homedir(), ".ssh"),
    path2.join(os2.homedir(), ".gnupg"),
    SETTINGS_PATH2,
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
        const absDir = path2.resolve(dir);
        if (resolved.startsWith(absDir)) return { valid: true, error: "" };
      } catch {
      }
    }
  }
  return { valid: false, error: `Path not in allowed directories: ${filePath}` };
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
var INJECTION_PATTERNS = [
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
var AUDIT_DIR = path2.join(os2.homedir(), ".pi", "agent");
var AUDIT_LOG_PATH = path2.join(AUDIT_DIR, "audit.log");
var AUDIT_BUFFER_MAX_ENTRIES = 50;
var AUDIT_FLUSH_INTERVAL_MS = 500;
var _auditBuffer = [];
var _auditFlushTimer = null;
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
    if (!fs2.existsSync(AUDIT_DIR)) {
      fs2.mkdirSync(AUDIT_DIR, { recursive: true });
    }
    const batch = _auditBuffer.join("");
    fs2.appendFileSync(AUDIT_LOG_PATH, batch, "utf-8");
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
      if (fs2.existsSync(AUDIT_LOG_PATH)) {
        const stat = fs2.statSync(AUDIT_LOG_PATH);
        if (stat.size > AUDIT_LOG_MAX_SIZE) {
          const entries = readRecentAuditEntries(1e3);
          const content = entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
          fs2.writeFileSync(AUDIT_LOG_PATH, content, "utf-8");
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
    if (!fs2.existsSync(AUDIT_LOG_PATH)) return [];
    const fileSize = fs2.statSync(AUDIT_LOG_PATH).size;
    if (fileSize === 0) return [];
    const fd = fs2.openSync(AUDIT_LOG_PATH, "r");
    const bufferSize = 8192;
    const buffer = Buffer.alloc(bufferSize);
    const lines = [];
    let pos = fileSize;
    let partial = "";
    while (pos > 0 && lines.length < count) {
      const readSize = Math.min(bufferSize, pos);
      pos -= readSize;
      fs2.readSync(fd, buffer, 0, readSize, pos);
      const chunk = buffer.slice(0, readSize).toString("utf-8");
      partial = chunk + partial;
      const lineBreak = partial.lastIndexOf("\n");
      if (lineBreak !== -1) {
        const complete = partial.slice(lineBreak + 1);
        if (complete.trim()) lines.unshift(complete);
        partial = partial.slice(0, lineBreak);
      }
    }
    fs2.closeSync(fd);
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

// shared/format.ts
function section(title) {
  return `
\u2500\u2500 ${title} ${"\u2500".repeat(Math.max(1, 60 - title.length - 4))}`;
}
function ok(msg) {
  return `  \u2705 ${msg}`;
}
function fail(msg) {
  return `  \u274C ${msg}`;
}
function warn(msg) {
  return `  \u26A0\uFE0F  ${msg}`;
}
function info(msg) {
  return `  \u2139\uFE0F  ${msg}`;
}

// shared/ollama.ts
import * as path3 from "node:path";
import os3 from "node:os";
var EXTENSION_VERSION = "1.2.3";
var MODELS_JSON_PATH = path3.join(os3.homedir(), ".pi", "agent", "models.json");

// extensions/security.ts
function security_default(pi) {
  const stats = {
    blocked: 0,
    allowed: 0,
    warnings: 0,
    byRule: {}
  };
  const branding = [
    `  \u26A1 Pi Security Extension v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`
  ].join("\n");
  pi.registerCommand("security", {
    description: "Manage security mode \u2014 usage: /security mode [basic|max]",
    handler: async (args, ctx) => {
      try {
        const parts = args.trim().split(/\s+/);
        const sub = parts[0]?.toLowerCase() || "";
        if (sub === "mode") {
          const value = parts[1]?.toLowerCase();
          const currentMode = getSecurityMode();
          if (!value) {
            const lines2 = [branding];
            lines2.push(section("SECURITY MODE"));
            lines2.push(info(`Current mode: ${currentMode.toUpperCase()}`));
            lines2.push(info(`Config path: ${SECURITY_CONFIG_PATH}`));
            lines2.push(info(`Critical commands (always blocked): ${CRITICAL_COMMANDS.size}`));
            lines2.push(info(`Extended commands (max only): ${EXTENDED_COMMANDS.size}`));
            lines2.push(info(`Total blocked (max): ${CRITICAL_COMMANDS.size + EXTENDED_COMMANDS.size}`));
            lines2.push(info(`URL patterns always blocked: ${BLOCKED_URL_ALWAYS.size}`));
            lines2.push(info(`URL patterns (max only): ${BLOCKED_URL_MAX_ONLY.size}`));
            lines2.push(section("MODE DIFFERENCES"));
            lines2.push(info("Basic: critical commands blocked, localhost/127.x allowed"));
            lines2.push(info("Max: all commands blocked, full SSRF protection"));
            lines2.push(info("Off: no security enforcement, all commands allowed"));
            lines2.push(section("SWITCH MODE"));
            lines2.push(info("/security mode basic  \u2014 relax restrictions for development"));
            lines2.push(info("/security mode max    \u2014 full lockdown (default)"));
            lines2.push(info("/security mode off     \u2014 disable all security checks"));
            lines2.push(branding);
            pi.sendMessage({
              customType: "security-mode-info",
              content: lines2.join("\n"),
              display: { type: "content", content: lines2.join("\n") }
            });
            return;
          }
          if (value === "basic" || value === "max" || value === "off") {
            if (value === currentMode) {
              ctx.ui.notify(`Security mode is already ${value.toUpperCase()}`, "info");
              return;
            }
            const writeOk = setSecurityMode(value);
            if (!writeOk) {
              ctx.ui.notify(`FAILED to persist security mode: could not write ${SECURITY_CONFIG_PATH}`, "error");
              debugLog("security", `/security mode ${value}: write failed`, { path: SECURITY_CONFIG_PATH });
              return;
            }
            ctx.ui.setStatus("status-sec", value.toUpperCase());
            ctx.ui.notify(`Security mode set to ${value.toUpperCase()}`, "success");
            appendAuditEntry({
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              toolName: "security-command",
              toolCallId: "",
              action: "allowed",
              rule: "mode_change",
              detail: `Security mode changed to ${value.toUpperCase()}`
            });
            const totalCmds = CRITICAL_COMMANDS.size + EXTENDED_COMMANDS.size;
            const lines2 = [branding];
            lines2.push(section("SECURITY MODE CHANGED"));
            lines2.push(ok(`Mode: ${value.toUpperCase()}`));
            lines2.push(info(`Previous: ${currentMode.toUpperCase()}`));
            lines2.push(info(`Config: ${SECURITY_CONFIG_PATH}`));
            if (value === "basic") {
              lines2.push(warn("Extended commands are now ALLOWED: rm, sudo, npm, apt, git, curl, wget, etc."));
              lines2.push(warn("Localhost and 127.x URLs are now ALLOWED for SSRF"));
              lines2.push(ok("Critical commands remain blocked: dd, mkfs, shred, fdisk, ssh, etc."));
            } else if (value === "max") {
              lines2.push(ok(`Full lockdown active \u2014 all ${totalCmds} commands blocked`));
              lines2.push(ok("Full SSRF protection \u2014 localhost and private IPs blocked"));
            } else if (value === "off") {
              lines2.push(ok("Security enforcement disabled \u2014 all commands allowed"));
              lines2.push(ok("SSRF protection disabled \u2014 all URLs allowed"));
            }
            lines2.push(branding);
            pi.sendMessage({
              customType: "security-mode-changed",
              content: lines2.join("\n"),
              display: { type: "content", content: lines2.join("\n") }
            });
            return;
          }
          ctx.ui.notify(`Invalid mode: "${value}". Use "basic", "max", or "off".`, "error");
          return;
        }
        const lines = [branding];
        lines.push(section("SECURITY COMMANDS"));
        lines.push(info("/security mode        \u2014 show current security mode"));
        lines.push(info("/security mode basic  \u2014 relax to basic mode"));
        lines.push(info("/security mode max    \u2014 switch to max lockdown"));
        lines.push(info("/security mode off     \u2014 disable all security checks"));
        lines.push(info("/security-audit       \u2014 show security audit report"));
        lines.push(branding);
        pi.sendMessage({
          customType: "security-usage",
          content: lines.join("\n"),
          display: { type: "content", content: lines.join("\n") }
        });
      } catch (e) {
        debugLog("security", "/security command handler error", e);
        ctx.ui.notify(`/security error: ${e.message}`, "error");
      }
    }
  });
  pi.registerCompletion?.("security", {
    getCompletions: () => {
      return [
        { value: "mode", label: "mode", description: "View or change the security enforcement mode" }
      ];
    },
    getArgumentCompletions: (args) => {
      const sub = args[0]?.toLowerCase() || "";
      if (sub === "mode" && args.length === 2) {
        return [
          { value: "basic", label: "basic", description: "Relax to basic mode \u2014 only critical commands blocked" },
          { value: "max", label: "max", description: "Full lockdown \u2014 all commands blocked (default)" },
          { value: "off", label: "off", description: "Disable all security checks" }
        ];
      }
      return [];
    }
  });
  pi.on("tool_call", (event) => {
    const toolName = event.toolName;
    const input = event.input ?? {};
    const toolCallId = event.toolCallId;
    let result;
    const currentMode = getSecurityMode();
    switch (toolName) {
      case "bash":
      case "shell":
      case "run_command":
        result = checkBashToolInput(input, currentMode);
        break;
      case "read":
      case "read_file":
      case "write":
      case "write_file":
      case "edit":
      case "edit_file":
      case "list_directory":
      case "list_dir":
        result = checkFileToolInput(input, currentMode);
        break;
      case "http_get":
      case "http_post":
      case "fetch":
      case "web_search":
      case "http_request":
        result = checkHttpToolInput(input, currentMode);
        break;
      default:
        result = checkInjectionPatterns(input, currentMode);
        break;
    }
    if (!result.safe) {
      stats.blocked++;
      stats.byRule[result.rule] = (stats.byRule[result.rule] || 0) + 1;
      stats.lastBlocked = {
        tool: toolName,
        rule: result.rule,
        detail: result.detail,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      appendAuditEntry({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        toolName,
        toolCallId,
        action: "blocked",
        rule: result.rule,
        detail: result.detail,
        input: sanitizeInputForLog(input)
      });
      return {
        block: true,
        reason: `[SECURITY] ${result.detail} (rule: ${result.rule})`
      };
    }
    stats.allowed++;
    if (["bash", "shell", "write", "write_file", "edit", "edit_file"].includes(toolName)) {
      stats.warnings++;
      appendAuditEntry({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        toolName,
        toolCallId,
        action: "allowed",
        rule: result.rule || "none",
        detail: "Bash/tool executed (allowed)",
        input: sanitizeInputForLog(input)
      });
    }
  });
  pi.on("tool_result", (event) => {
    const toolName = event.toolName;
    const isError = event.isError;
    if (isError) {
      appendAuditEntry({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        toolName,
        toolCallId: event.toolCallId,
        action: "warning",
        rule: "tool_error",
        detail: "Tool execution failed",
        input: sanitizeInputForLog(event.input)
      });
    }
  });
  async function generateAuditReport() {
    const lines = [];
    lines.push(branding);
    const currentMode = getSecurityMode();
    lines.push(section("SECURITY MODE"));
    lines.push(info(`Current mode: ${currentMode.toUpperCase()}`));
    lines.push(info(`Config file: ${SECURITY_CONFIG_PATH}`));
    lines.push(section("BLOCKLIST SUMMARY"));
    lines.push(info(`Critical commands (always blocked): ${CRITICAL_COMMANDS.size}`));
    lines.push(info(`Extended commands (max only): ${EXTENDED_COMMANDS.size}`));
    lines.push(info(`Effective blocked commands: ${currentMode === "max" ? CRITICAL_COMMANDS.size + EXTENDED_COMMANDS.size : CRITICAL_COMMANDS.size}`));
    lines.push(info(`URL patterns always blocked: ${BLOCKED_URL_ALWAYS.size}`));
    lines.push(info(`URL patterns (max only): ${BLOCKED_URL_MAX_ONLY.size}`));
    lines.push(info(`Effective blocked URL patterns: ${currentMode === "max" ? BLOCKED_URL_ALWAYS.size + BLOCKED_URL_MAX_ONLY.size : BLOCKED_URL_ALWAYS.size}`));
    lines.push(section("SESSION STATISTICS"));
    lines.push(info(`Tool calls allowed: ${stats.allowed}`));
    lines.push(info(`Tool calls blocked: ${stats.blocked}`));
    lines.push(info(`Dangerous operations logged: ${stats.warnings}`));
    if (stats.blocked > 0) {
      lines.push(warn(`${stats.blocked} operation(s) were blocked by security rules`));
    }
    const ruleNames = Object.keys(stats.byRule);
    if (ruleNames.length > 0) {
      lines.push(section("BLOCKED BY RULE"));
      for (const rule of ruleNames) {
        lines.push(info(`  ${rule}: ${stats.byRule[rule]} blocked`));
      }
    }
    if (stats.lastBlocked) {
      lines.push(section("LAST BLOCKED"));
      lines.push(fail(`Tool: ${stats.lastBlocked.tool}`));
      lines.push(fail(`Rule: ${stats.lastBlocked.rule}`));
      lines.push(fail(`Detail: ${stats.lastBlocked.detail}`));
      lines.push(info(`Time: ${stats.lastBlocked.timestamp}`));
    }
    lines.push(section("ACTIVE CHECKS"));
    lines.push(info(`Command blocklist: critical always, extended in max mode`));
    lines.push(info(`Path validation: sensitive directory protection`));
    lines.push(info(`SSRF protection: ${currentMode === "max" ? "full (loopback + metadata + private)" : "metadata + private only"}`));
    lines.push(info(`Injection detection: metacharacter scanning`));
    const recentEntries = readRecentAuditEntries(20);
    if (recentEntries.length > 0) {
      lines.push(section("RECENT AUDIT LOG (last 20)"));
      for (const entry of recentEntries) {
        const ts = entry.timestamp || "?";
        const action = entry.action;
        const tool = entry.toolName;
        const rule = entry.rule;
        const detail = entry.detail;
        const mode = entry.securityMode || currentMode;
        if (action === "blocked") {
          lines.push(fail(`[${ts}][${mode.toUpperCase()}] ${tool} \u2192 BLOCKED (${rule}): ${detail}`));
        } else if (action === "warning") {
          lines.push(warn(`[${ts}][${mode.toUpperCase()}] ${tool} \u2192 WARNING (${rule}): ${detail}`));
        } else {
          lines.push(ok(`[${ts}][${mode.toUpperCase()}] ${tool} \u2192 allowed (${rule})`));
        }
      }
    }
    lines.push(section("SUMMARY"));
    if (stats.blocked === 0) {
      lines.push(ok("No security violations detected in this session"));
    } else {
      lines.push(fail(`${stats.blocked} security violation(s) blocked`));
    }
    lines.push(info(`Security mode: ${currentMode.toUpperCase()} \u2014 /security mode to change`));
    lines.push(branding);
    return lines.join("\n");
  }
  pi.registerCommand("security-audit", {
    description: "Show security audit report \u2014 blocked operations, stats, and recent log",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("Security audit requires TUI mode", "error");
        return;
      }
      try {
        const report = await generateAuditReport();
        pi.sendMessage({
          customType: "security-audit-report",
          content: report,
          display: { type: "content", content: report }
        });
      } catch (e) {
        ctx.ui.notify(`Security audit failed: ${e.message}`, "error");
      }
    }
  });
  pi.registerTool({
    name: "security_audit",
    label: "Security Audit",
    description: "Run a security audit showing blocked operations, security statistics, and recent audit log entries. Use this when the user asks about security status or wants to review security events.",
    promptSnippet: "security_audit - show security status and blocked operations",
    promptGuidelines: [
      "When the user asks about security, blocked operations, or audit log, call security_audit."
    ],
    parameters: {
      type: "object",
      properties: {}
    },
    execute: async (_toolCallId, _params, _signal, _onUpdate, _ctx) => {
      try {
        const report = await generateAuditReport();
        return {
          content: [{ type: "text", text: report }],
          isError: false
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Security audit failed: ${e.message}` }],
          isError: true
        };
      }
    }
  });
}
var SECRET_KEY_PATTERNS = [
  /key$/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /auth/i,
  /apikey/i,
  /api_key/i
];
function sanitizeInputForLog(input) {
  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") {
      sanitized[key] = value;
      continue;
    }
    if (SECRET_KEY_PATTERNS.some((p) => p.test(key))) {
      sanitized[key] = "[REDACTED]";
      continue;
    }
    if (value.length > 500) {
      sanitized[key] = value.slice(0, 500) + "... (truncated)";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
export {
  security_default as default
};
