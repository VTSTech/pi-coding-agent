// extensions/diag.ts
import * as fs4 from "node:fs";
import * as os4 from "node:os";
import * as path4 from "node:path";

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
function bytesHuman(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let b = bytes;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(1)}${units[i]}`;
}
function msHuman(ms) {
  if (ms < 1e3) return `${ms.toFixed(0)}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${(ms / 6e4).toFixed(1)}m`;
}
function pct(used, total) {
  if (total === 0) return "0.0%";
  return `${(used / total * 100).toFixed(1)}%`;
}

// shared/ollama.ts
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

// shared/debug.ts
var DEBUG_ENABLED = process?.env?.PI_EXTENSIONS_DEBUG === "1";
function debugLog(module, message, ...args) {
  if (!DEBUG_ENABLED) return;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  console.debug(`[pi-ext:${module}] ${timestamp} ${message}`, ...args);
}

// shared/ollama.ts
var EXTENSION_VERSION = "1.2.7";
var MODELS_JSON_PATH = path.join(os.homedir(), ".pi", "agent", "models.json");
var _modelsJsonCache = null;
var _ollamaBaseUrlCache = null;
var CACHE_TTL_MS = 2e3;
function getOllamaBaseUrl() {
  const now = Date.now();
  if (_ollamaBaseUrlCache && now - _ollamaBaseUrlCache.ts < CACHE_TTL_MS) return _ollamaBaseUrlCache.data;
  try {
    if (fs.existsSync(MODELS_JSON_PATH)) {
      const raw = fs.readFileSync(MODELS_JSON_PATH, "utf-8");
      const config = JSON.parse(raw);
      const baseUrl = config?.providers?.["ollama"]?.baseUrl;
      if (baseUrl) {
        const result = baseUrl.replace(/\/v1\/?$/, "");
        _ollamaBaseUrlCache = { data: result, ts: now };
        return result;
      }
    }
  } catch (err) {
    debugLog("ollama", "failed to parse models.json for base URL", err);
  }
  if (process.env.OLLAMA_HOST) {
    const result = `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, "")}`;
    _ollamaBaseUrlCache = { data: result, ts: now };
    return result;
  }
  const fallback = "http://localhost:11434";
  _ollamaBaseUrlCache = { data: fallback, ts: now };
  return fallback;
}
function readModelsJson() {
  const now = Date.now();
  if (_modelsJsonCache && now - _modelsJsonCache.ts < CACHE_TTL_MS) return _modelsJsonCache.data;
  try {
    if (fs.existsSync(MODELS_JSON_PATH)) {
      const raw = fs.readFileSync(MODELS_JSON_PATH, "utf-8");
      const data = JSON.parse(raw);
      _modelsJsonCache = { data, ts: now };
      return data;
    }
  } catch (err) {
    debugLog("ollama", "failed to read/parse models.json", err);
  }
  const empty = { providers: {} };
  _modelsJsonCache = { data: empty, ts: now };
  return empty;
}
var BUILTIN_PROVIDERS = {
  openrouter: { api: "openai-completions", baseUrl: "https://openrouter.ai/api/v1", envKey: "OPENROUTER_API_KEY" },
  anthropic: { api: "anthropic-messages", baseUrl: "https://api.anthropic.com/v1", envKey: "ANTHROPIC_API_KEY" },
  google: { api: "gemini", baseUrl: "https://generativelanguage.googleapis.com", envKey: "GOOGLE_API_KEY" },
  openai: { api: "openai-completions", baseUrl: "https://api.openai.com/v1", envKey: "OPENAI_API_KEY" },
  groq: { api: "openai-completions", baseUrl: "https://api.groq.com/v1", envKey: "GROQ_API_KEY" },
  deepseek: { api: "openai-completions", baseUrl: "https://api.deepseek.com/v1", envKey: "DEEPSEEK_API_KEY" },
  mistral: { api: "openai-completions", baseUrl: "https://api.mistral.ai/v1", envKey: "MISTRAL_API_KEY" },
  xai: { api: "openai-completions", baseUrl: "https://api.x.ai/v1", envKey: "XAI_API_KEY" },
  together: { api: "openai-completions", baseUrl: "https://api.together.xyz/v1", envKey: "TOGETHER_API_KEY" },
  fireworks: { api: "openai-completions", baseUrl: "https://api.fireworks.ai/inference/v1", envKey: "FIREWORKS_API_KEY" },
  cohere: { api: "cohere-chat", baseUrl: "https://api.cohere.com/v1", envKey: "COHERE_API_KEY" },
  zai: { api: "openai-completions", baseUrl: "https://open.bigmodel.cn/api/paas/v4", envKey: "ZAI_API_KEY" }
};
function isLocalProvider(baseUrl, providerName) {
  if (providerName === "ollama") return true;
  const url = baseUrl || "";
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0");
}

// shared/security.ts
import * as fs3 from "node:fs";
import * as path3 from "node:path";
import os3 from "node:os";

// shared/config-io.ts
import * as fs2 from "fs";
import * as path2 from "path";
import os2 from "os";
var PI_AGENT_DIR = path2.join(os2.homedir(), ".pi", "agent");
function readJsonConfig(filePath, defaultValue = {}) {
  try {
    if (fs2.existsSync(filePath)) {
      return JSON.parse(fs2.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    debugLog("config-io", `failed to read config: ${filePath}`, err);
  }
  return defaultValue;
}
var SETTINGS_PATH = path2.join(PI_AGENT_DIR, "settings.json");
var SECURITY_PATH = path2.join(PI_AGENT_DIR, "security.json");
var REACT_MODE_PATH = path2.join(PI_AGENT_DIR, "react-mode.json");
var MODEL_TEST_CONFIG_PATH = path2.join(PI_AGENT_DIR, "model-test-config.json");
function readSettings() {
  return readJsonConfig(SETTINGS_PATH);
}

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
    if (!fs3.existsSync(SECURITY_CONFIG_PATH)) {
      securityModeCache = "max";
      securityModeCacheTime = now;
      return "max";
    }
    const raw = fs3.readFileSync(SECURITY_CONFIG_PATH, "utf-8");
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
    resolved = path3.resolve(filePath);
    try {
      resolved = fs3.realpathSync(resolved);
    } catch {
    }
    const originalResolved = path3.resolve(filePath);
    if (!resolved.startsWith(originalResolved)) {
      const isInAllowedDir = allowedDirs?.some((dir) => {
        const allowedResolved = path3.resolve(dir);
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
    path3.join(os3.homedir(), ".ssh"),
    path3.join(os3.homedir(), ".gnupg"),
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
        const absDir = path3.resolve(dir);
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
var AUDIT_DIR = path3.join(os3.homedir(), ".pi", "agent");
var AUDIT_LOG_PATH = path3.join(AUDIT_DIR, "audit.log");
var _auditBuffer = [];
function flushAuditBuffer() {
  if (_auditBuffer.length === 0) return;
  try {
    if (!fs3.existsSync(AUDIT_DIR)) {
      fs3.mkdirSync(AUDIT_DIR, { recursive: true });
    }
    const batch = _auditBuffer.join("");
    fs3.appendFileSync(AUDIT_LOG_PATH, batch, "utf-8");
  } catch (err) {
    debugLog("security", "audit buffer flush failure", err);
  }
  _auditBuffer = [];
}
function readRecentAuditEntries(count = 50) {
  try {
    if (!fs3.existsSync(AUDIT_LOG_PATH)) return [];
    const fileSize = fs3.statSync(AUDIT_LOG_PATH).size;
    if (fileSize === 0) return [];
    const fd = fs3.openSync(AUDIT_LOG_PATH, "r");
    const bufferSize = 8192;
    const buffer = Buffer.alloc(bufferSize);
    const lines = [];
    let pos = fileSize;
    let partial = "";
    while (pos > 0 && lines.length < count) {
      const readSize = Math.min(bufferSize, pos);
      pos -= readSize;
      fs3.readSync(fd, buffer, 0, readSize, pos);
      const chunk = buffer.slice(0, readSize).toString("utf-8");
      partial = chunk + partial;
      const lineBreak = partial.lastIndexOf("\n");
      if (lineBreak !== -1) {
        const complete = partial.slice(lineBreak + 1);
        if (complete.trim()) lines.unshift(complete);
        partial = partial.slice(0, lineBreak);
      }
    }
    fs3.closeSync(fd);
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

// extensions/diag.ts
var SECRET_KEY_PATTERNS = [
  /key/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /auth/i,
  /apikey/i,
  /api_key/i
];
function redactValue(key, value) {
  if (typeof value !== "string") return JSON.stringify(value);
  if (SECRET_KEY_PATTERNS.some((p) => p.test(key))) return "[REDACTED]";
  if (value.length > 20 && !value.includes(" ") && /^[A-Za-z0-9_\-+/=]+$/.test(value)) return value.slice(0, 8) + "...";
  return value;
}
function diag_default(pi) {
  let cachedSystemPrompt = null;
  let cachedPayload = null;
  pi.on("before_provider_request", (event) => {
    cachedPayload = event.payload;
  });
  const branding = [
    `  \u26A1 Pi Diagnostics v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`
  ].join("\n");
  async function runDiagnostics(ctx) {
    const lines = [];
    let passCount = 0;
    let failCount = 0;
    let warnCount = 0;
    lines.push(branding);
    const check = (condition, passMsg, failMsg) => {
      if (condition) {
        lines.push(ok(passMsg));
        passCount++;
      } else {
        lines.push(fail(failMsg));
        failCount++;
      }
    };
    const warning = (condition, msg) => {
      if (condition) {
        lines.push(warn(msg));
        warnCount++;
      }
    };
    lines.push(section("SYSTEM"));
    const cpus2 = os4.cpus();
    const totalMem = os4.totalmem();
    const freeMem = os4.freemem();
    const usedMem = totalMem - freeMem;
    const memPct = pct(usedMem, totalMem);
    lines.push(info(`OS: ${os4.type()} ${os4.release()} ${os4.arch()}`));
    lines.push(info(`CPU: ${cpus2.length}x ${cpus2[0]?.model || "unknown"}`));
    lines.push(info(`RAM: ${bytesHuman(usedMem)} / ${bytesHuman(totalMem)} (${memPct})`));
    lines.push(info(`Uptime: ${msHuman(os4.uptime() * 1e3)}`));
    lines.push(info(`Node.js: ${process.version}`));
    check(
      totalMem >= 4 * 1024 * 1024 * 1024,
      `Total RAM: ${bytesHuman(totalMem)} (\u22654GB)`,
      `Total RAM: ${bytesHuman(totalMem)} \u2014 LOW (<4GB), may struggle with models`
    );
    warning(
      totalMem > 0 && usedMem / totalMem > 0.85,
      `RAM usage ${memPct} \u2014 HIGH, close apps or reduce model size`
    );
    warning(cpus2.length < 2, `Only ${cpus2.length} CPU core(s), inference will be slow`);
    lines.push(section("DISK"));
    try {
      const dfResult = await pi.exec("df", ["-h", "/"], { timeout: 5e3 });
      if (dfResult.code === 0) {
        const dfLines = dfResult.stdout.trim().split("\n");
        if (dfLines.length > 1) {
          const parts = dfLines[1].trim().split(/\s+/);
          lines.push(info(`Mount: ${parts[0] || "/"}`));
          lines.push(info(`Size: ${parts[1]}, Used: ${parts[2]}, Avail: ${parts[3]}, Use%: ${parts[4]}`));
          const usePct = parseInt(parts[4]) || 0;
          warning(usePct > 90, `Disk usage ${parts[4]} \u2014 LOW SPACE`);
        }
      }
    } catch {
      lines.push(warn("Could not read disk info"));
    }
    lines.push(section("OLLAMA"));
    let ollamaOk = false;
    let ollamaModels = [];
    let ollamaVersion = "unknown";
    const ollamaBaseUrl = getOllamaBaseUrl();
    const isRemoteOllama = !isLocalProvider(ollamaBaseUrl);
    if (isRemoteOllama) {
      const ollamaRoot = ollamaBaseUrl.replace(/\/v1\/?$/, "");
      lines.push(info(`Remote Ollama detected: ${ollamaBaseUrl}`));
      try {
        const startTime = Date.now();
        const versionRes = await fetch(`${ollamaRoot}/api/version`, { signal: AbortSignal.timeout(1e4) });
        const latency = Date.now() - startTime;
        if (versionRes.ok) {
          const versionData = await versionRes.json();
          ollamaVersion = versionData.version || "unknown";
          ollamaOk = true;
          lines.push(ok(`Remote Ollama running: ${ollamaVersion} (${msHuman(latency)} response time)`));
        } else {
          lines.push(fail(`Remote Ollama returned status ${versionRes.status}`));
        }
      } catch (e) {
        lines.push(fail(`Remote Ollama not reachable: ${e.message || "unknown error"}`));
      }
      if (ollamaOk) {
        try {
          const tagsRes = await fetch(`${ollamaRoot}/api/tags`, { signal: AbortSignal.timeout(15e3) });
          if (tagsRes.ok) {
            const tagsData = await tagsRes.json();
            ollamaModels = (tagsData.models || []).map((m) => m.name || m.model).filter(Boolean);
            lines.push(info(`Available models: ${ollamaModels.length}`));
            ollamaModels.forEach((m) => lines.push(info(`  \u2022 ${m}`)));
            check(ollamaModels.length > 0, "Models found in Ollama", "No models pulled in Ollama");
          }
        } catch {
          lines.push(warn("Could not list remote Ollama models"));
        }
        try {
          const psRes = await fetch(`${ollamaRoot}/api/ps`, { signal: AbortSignal.timeout(1e4) });
          if (psRes.ok) {
            const psData = await psRes.json();
            const loaded = psData.models || [];
            if (loaded.length > 0) {
              lines.push(info(`Loaded in VRAM: ${loaded[0].name || loaded[0].model || "unknown"}`));
            } else {
              lines.push(info("No model currently loaded in Ollama"));
            }
          }
        } catch (err) {
          debugLog("diag", "failed to check remote Ollama loaded models", err);
        }
      }
    } else {
      try {
        const startTime = Date.now();
        const versionResult = await pi.exec("ollama", ["--version"], { timeout: 1e4 });
        const latency = Date.now() - startTime;
        if (versionResult.code === 0) {
          ollamaVersion = versionResult.stdout.trim();
          ollamaOk = true;
          lines.push(ok(`Ollama running: ${ollamaVersion} (${msHuman(latency)} response time)`));
        } else {
          lines.push(fail(`Ollama error: ${versionResult.stderr.trim() || "non-zero exit code"}`));
        }
      } catch (e) {
        lines.push(fail(`Ollama not reachable: ${e.message || "unknown error"}`));
      }
      if (ollamaOk) {
        try {
          const listResult = await pi.exec("ollama", ["list"], { timeout: 15e3 });
          if (listResult.code === 0) {
            const modelLines = listResult.stdout.trim().split("\n").slice(1);
            ollamaModels = modelLines.map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
            lines.push(info(`Available models: ${ollamaModels.length}`));
            ollamaModels.forEach((m) => lines.push(info(`  \u2022 ${m}`)));
            check(ollamaModels.length > 0, "Models found in Ollama", "No models pulled in Ollama");
          }
        } catch {
          lines.push(warn("Could not list Ollama models"));
        }
        try {
          const psResult = await pi.exec("ollama", ["ps"], { timeout: 1e4 });
          if (psResult.code === 0) {
            const psLines = psResult.stdout.trim().split("\n").slice(1);
            if (psLines.length > 0) {
              const loadedModel = psLines[0].trim().split(/\s+/)[0];
              lines.push(info(`Loaded in VRAM: ${loadedModel}`));
            } else {
              lines.push(warn("No model currently loaded in Ollama"));
            }
          }
        } catch (err) {
          debugLog("diag", "failed to check local Ollama loaded models", err);
        }
      }
    }
    lines.push(section("MODELS.JSON"));
    const agentDir = path4.join(os4.homedir(), ".pi", "agent");
    let configuredModels = [];
    const modelsJson = readModelsJson();
    if (modelsJson && Object.keys(modelsJson.providers || {}).length > 0) {
      try {
        const providers = modelsJson.providers || {};
        lines.push(info(`Providers configured: ${Object.keys(providers).length}`));
        for (const [providerName, providerConfig] of Object.entries(providers)) {
          const cfg = providerConfig;
          const models = cfg.models || [];
          lines.push(info(`  ${providerName}: ${cfg.baseUrl || "no baseUrl"}, ${models.length} models`));
          for (const m of models) {
            configuredModels.push(m.id);
            const reasoning = m.reasoning ? " [reasoning]" : "";
            const ctx2 = m.contextLength ? ` ctx:${(m.contextLength / 1e3).toFixed(0)}k` : "";
            lines.push(info(`    \u2022 ${m.id}${reasoning}${ctx2}`));
          }
        }
        check(
          configuredModels.length > 0,
          `${configuredModels.length} model(s) configured`,
          "No models in models.json"
        );
        if (ollamaModels.length > 0) {
          const missing = ollamaModels.filter((m) => !configuredModels.includes(m));
          const extra = configuredModels.filter((m) => !ollamaModels.includes(m));
          if (missing.length > 0) {
            lines.push(warn(`${missing.length} Ollama model(s) not in models.json: ${missing.join(", ")}`));
            lines.push(info("  \u2192 Run /ollama-sync to auto-sync"));
          }
          if (extra.length > 0) {
            lines.push(warn(`${extra.length} model(s) in models.json but not pulled in Ollama: ${extra.join(", ")}`));
          }
          if (missing.length === 0 && extra.length === 0) {
            lines.push(ok("models.json matches Ollama exactly"));
            passCount++;
          }
        }
      } catch (e) {
        lines.push(fail(`models.json parse error: ${e.message}`));
      }
    } else {
      lines.push(fail(`models.json not found at ${MODELS_JSON_PATH}`));
      lines.push(info("  \u2192 Run /ollama-sync to create it"));
    }
    lines.push(section("SETTINGS"));
    try {
      const settings = readSettings();
      if (Object.keys(settings).length > 0) {
        lines.push(info("Global settings found:"));
        for (const [key, val] of Object.entries(settings)) {
          lines.push(info(`  ${key}: ${redactValue(key, val)}`));
        }
        check(true, "settings.json valid JSON", "");
      } else {
        lines.push(warn("No global settings.json found (using defaults)"));
      }
    } catch (e) {
      lines.push(fail(`settings.json read error: ${e.message}`));
    }
    lines.push(section("EXTENSIONS"));
    const extensionsDir = path4.join(agentDir, "extensions");
    const activeTools = pi.getActiveTools();
    const allTools = pi.getAllTools();
    const builtinTools = /* @__PURE__ */ new Set(["read", "bash", "edit", "write"]);
    const extensionToolCount = activeTools.filter((t) => !builtinTools.has(t)).length;
    const localExtFiles = fs4.existsSync(extensionsDir) ? fs4.readdirSync(extensionsDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js")) : [];
    lines.push(info(`Extension files in ${extensionsDir}: ${localExtFiles.length}`));
    localExtFiles.forEach((f) => lines.push(info(`  \u2022 ${f}`)));
    if (localExtFiles.length > 0) {
      check(true, `${localExtFiles.length} local extension(s) found`);
    } else if (extensionToolCount > 0) {
      lines.push(info(`${extensionToolCount} extension tool(s) loaded from Pi package`));
      check(true, `${extensionToolCount} extension(s) active via Pi package`);
    } else {
      check(false, "", "No extensions found");
    }
    lines.push(info(`Active tools: ${activeTools.length}`));
    if (activeTools.length > 0) {
      activeTools.forEach((t) => lines.push(info(`  \u2022 ${t}`)));
    }
    lines.push(info(`Registered tools (all): ${allTools.length}`));
    lines.push(section("THEMES"));
    const themesDir = path4.join(agentDir, "themes");
    if (fs4.existsSync(themesDir)) {
      const themeFiles = fs4.readdirSync(themesDir).filter(
        (f) => f.endsWith(".json")
      );
      lines.push(info(`Theme files: ${themeFiles.length}`));
      themeFiles.forEach((f) => {
        try {
          const theme = JSON.parse(fs4.readFileSync(path4.join(themesDir, f), "utf-8"));
          lines.push(info(`  \u2022 ${f} (name: "${theme.name || "unnamed"}")`));
        } catch {
          lines.push(warn(`  \u2022 ${f} \u2014 INVALID JSON`));
        }
      });
    } else {
      lines.push(warn(`Themes directory not found: ${themesDir}`));
    }
    lines.push(section("SECURITY"));
    const secMode = getSecurityMode();
    lines.push(info(`Security mode: ${secMode.toUpperCase()}`));
    const effectiveCmds = secMode === "off" ? /* @__PURE__ */ new Set() : secMode === "max" ? BLOCKED_COMMANDS : CRITICAL_COMMANDS;
    const blockedCmdList = Array.from(effectiveCmds).sort();
    lines.push(info(`Command blocklist: ${blockedCmdList.length} commands blocked (${CRITICAL_COMMANDS.size} critical` + (secMode === "max" ? ` + ${EXTENDED_COMMANDS.size} extended)` : secMode === "off" ? " (disabled in off mode)" : ")")));
    const exampleCmds = blockedCmdList.filter((c) => ["rm", "sudo", "chmod", "curl", "wget", "eval"].includes(c));
    if (exampleCmds.length > 0) {
      lines.push(info(`  Examples: ${exampleCmds.join(", ")}`));
    }
    check(
      secMode === "off" ? true : blockedCmdList.length > 0,
      secMode === "off" ? "Security disabled in off mode" : `Command blocklist active (${blockedCmdList.length} rules)`,
      secMode === "off" ? "" : `Command blocklist is EMPTY \u2014 security risk!`
    );
    const effectivePatterns = secMode === "off" ? /* @__PURE__ */ new Set() : secMode === "max" ? BLOCKED_URL_PATTERNS : BLOCKED_URL_ALWAYS;
    const blockedPatterns = Array.from(effectivePatterns).sort();
    lines.push(info(`SSRF protection: ${blockedPatterns.length} hostname patterns blocked (${BLOCKED_URL_ALWAYS.size} always` + (secMode === "max" ? ` + ${BLOCKED_URL_MAX_ONLY.size} max-only)` : secMode === "off" ? " (disabled in off mode)" : ")")));
    const examplePatterns = blockedPatterns.filter(
      (p) => ["localhost", "127.0.0.1", "169.254.169.254", "10.", "192.168.", "internal."].includes(p)
    );
    if (examplePatterns.length > 0) {
      lines.push(info(`  Examples: ${examplePatterns.join(", ")}`));
    }
    check(
      secMode === "off" ? true : blockedPatterns.length > 0,
      secMode === "off" ? "SSRF protection disabled in off mode" : `SSRF protection active (${blockedPatterns.length} patterns)`,
      secMode === "off" ? "" : `SSRF blocklist is EMPTY \u2014 vulnerability risk!`
    );
    lines.push(info("SSRF validation tests:"));
    const ssrfTests = [
      { url: "http://localhost:8080/api", expectBlocked: secMode !== "off" && secMode === "max" },
      { url: "http://169.254.169.254/latest/meta-data/", expectBlocked: secMode !== "off" },
      { url: "http://192.168.1.1/admin", expectBlocked: secMode !== "off" },
      { url: "https://api.example.com/data", expectBlocked: false }
    ];
    for (const test of ssrfTests) {
      const result = isSafeUrl(test.url, true, secMode);
      if (test.expectBlocked && !result.safe) {
        lines.push(ok(`  BLOCKED: ${test.url} \u2192 ${result.error}`));
      } else if (!test.expectBlocked && result.safe) {
        lines.push(ok(`  ALLOWED: ${test.url}`));
      } else {
        lines.push(fail(`  UNEXPECTED: ${test.url} \u2192 safe=${result.safe} (expected blocked=${test.expectBlocked})`));
      }
    }
    lines.push(info("Path validation tests:"));
    const pathTests = [
      { p: "/etc/passwd", expectValid: false },
      { p: "/etc/shadow", expectValid: false },
      { p: "../../etc/hosts", expectValid: false },
      { p: "./test.txt", expectValid: true },
      { p: "/tmp/output.log", expectValid: true },
      { p: process.cwd(), expectValid: true }
    ];
    for (const test of pathTests) {
      const result = validatePath(test.p);
      if (result.valid === test.expectValid) {
        if (test.expectValid) {
          lines.push(ok(`  ALLOWED: ${test.p}`));
        } else {
          lines.push(ok(`  BLOCKED: ${test.p} \u2192 ${result.error}`));
        }
      } else {
        lines.push(fail(`  UNEXPECTED: ${test.p} \u2192 valid=${result.valid} (expected valid=${test.expectValid})`));
      }
    }
    lines.push(info("Command injection tests:"));
    const cmdTests = [
      { cmd: "ls; rm -rf /", expectSafe: secMode === "off" },
      { cmd: "sudo chmod 777 /etc/passwd", expectSafe: secMode === "off" },
      { cmd: "curl http://localhost/secret", expectSafe: secMode !== "max" && secMode !== "off" },
      { cmd: "ls -la", expectSafe: true },
      { cmd: "cat README.md", expectSafe: true },
      { cmd: "echo hello", expectSafe: true }
    ];
    for (const test of cmdTests) {
      const result = sanitizeCommand(test.cmd);
      if (result.isSafe === test.expectSafe) {
        if (test.expectSafe) {
          lines.push(ok(`  PASS: "${test.cmd}" \u2192 allowed`));
        } else {
          lines.push(ok(`  BLOCKED: "${test.cmd}" \u2192 ${result.error}`));
        }
      } else {
        lines.push(fail(`  UNEXPECTED: "${test.cmd}" \u2192 safe=${result.isSafe} (expected safe=${test.expectSafe})`));
      }
    }
    lines.push(info("Audit log status:"));
    const auditEntries = readRecentAuditEntries(50);
    if (fs4.existsSync(AUDIT_LOG_PATH)) {
      lines.push(ok(`Audit log exists: ${AUDIT_LOG_PATH}`));
      if (auditEntries.length > 0) {
        lines.push(info(`  Recent entries: ${auditEntries.length} (last 50)`));
        const recentSample = auditEntries.slice(-3);
        for (const entry of recentSample) {
          const entryType = (entry.type ?? entry.action ?? entry.event ?? "unknown").toString();
          const entryTime = (entry.timestamp ?? entry.time ?? "").toString();
          lines.push(info(`  \u2022 [${entryTime ? entryTime + "] " : ""}${entryType}`));
        }
      } else {
        lines.push(info("  No audit entries found (log is empty or unparseable)"));
      }
    } else {
      lines.push(warn(`Audit log not found at ${AUDIT_LOG_PATH}`));
      lines.push(info("  \u2192 Audit logging will begin when security events occur"));
    }
    lines.push(section("CURRENT SESSION"));
    const model = ctx.model;
    if (model) {
      lines.push(info(`Model: ${model.id || "unknown"}`));
      lines.push(info(`Provider: ${model.provider || "unknown"}`));
      const providerName = model.provider || "";
      const userProviderCfg = modelsJson ? (modelsJson.providers || {})[providerName] : null;
      if (userProviderCfg) {
        const apiMode = userProviderCfg.api || "not set";
        const baseUrl = userProviderCfg.baseUrl || "not set";
        lines.push(info(`API mode: ${apiMode} (models.json)`));
        lines.push(info(`Base URL: ${baseUrl}`));
        if (userProviderCfg.apiKey) {
          lines.push(info(`API key: ****${String(userProviderCfg.apiKey).slice(-4)}`));
        }
      } else if (BUILTIN_PROVIDERS[providerName]) {
        const builtin = BUILTIN_PROVIDERS[providerName];
        lines.push(info(`API mode: ${builtin.api} (built-in: ${providerName})`));
        lines.push(info(`Base URL: ${builtin.baseUrl}`));
      } else if (providerName) {
        lines.push(info(`API mode: unknown \u2014 provider "${providerName}" not in models.json or built-in list`));
      } else {
        lines.push(info(`API mode: unknown \u2014 no provider configured`));
      }
      lines.push(info(`Context window: ${model.contextWindow ?? "unknown"}`));
      lines.push(info(`Max tokens: ${model.maxTokens ?? "unknown"}`));
    } else {
      lines.push(warn("No model selected"));
    }
    const usage = ctx.getContextUsage?.();
    if (usage && usage.contextWindow > 0) {
      lines.push(info(`Context: ${usage.tokens ?? "?"} / ${usage.contextWindow} tokens (${(usage.tokens / usage.contextWindow * 100).toFixed(1)}%)`));
    }
    const thinking = pi.getThinkingLevel();
    lines.push(info(`Thinking level: ${thinking}`));
    lines.push(section("SYSTEM PROMPT"));
    let systemPromptText = null;
    try {
      if (typeof ctx.getSystemPrompt === "function") {
        systemPromptText = ctx.getSystemPrompt();
        if (systemPromptText) {
          debugLog("diag", `system prompt retrieved via getSystemPrompt(): ${systemPromptText.length} chars`);
        }
      }
    } catch (err) {
      debugLog("diag", "getSystemPrompt() not available", err);
    }
    if (!systemPromptText && cachedPayload) {
      try {
        const messages = cachedPayload.messages;
        if (messages?.length) {
          const sysMsg = messages.find((m) => m.role === "system") ?? messages[0];
          if (sysMsg?.content) {
            systemPromptText = sysMsg.content;
            debugLog("diag", `system prompt extracted from payload: ${systemPromptText.length} chars`);
          }
        }
      } catch (err) {
        debugLog("diag", "failed to extract system prompt from payload", err);
      }
    }
    if (systemPromptText) {
      const charCount = systemPromptText.length;
      const wordCount = systemPromptText.split(/\s+/).filter(Boolean).length;
      const lineCount = systemPromptText.split("\n").length;
      lines.push(info(`Size: ${charCount} chars, ~${wordCount} words, ${lineCount} lines`));
      const preview = systemPromptText.split("\n")[0]?.slice(0, 80) || "(empty first line)";
      lines.push(info(`Opening line: ${preview}${preview.length >= 80 ? "..." : ""}`));
      const TRUNCATE_AT = 2e3;
      if (charCount <= TRUNCATE_AT) {
        lines.push("");
        lines.push("  \u250C\u2500\u2500\u2500 SYSTEM PROMPT \u2500\u2500\u2500");
        for (const line of systemPromptText.split("\n")) {
          lines.push(`  \u2502 ${line}`);
        }
        lines.push("  \u2514" + "\u2500".repeat(Math.min("\u2500\u2500\u2500 SYSTEM PROMPT \u2500\u2500\u2500".length + 4, 50)));
        check(true, "System prompt retrieved successfully");
      } else {
        const truncated = systemPromptText.slice(0, 1500);
        const remaining = charCount - 1500;
        lines.push("");
        lines.push("  \u250C\u2500\u2500\u2500 SYSTEM PROMPT (truncated) \u2500\u2500\u2500");
        for (const line of truncated.split("\n")) {
          lines.push(`  \u2502 ${line}`);
        }
        lines.push(`  \u2502 ... (${remaining} more chars not shown)`);
        lines.push("  \u2514" + "\u2500".repeat(Math.min("\u2500\u2500\u2500 SYSTEM PROMPT (truncated) \u2500\u2500\u2500".length + 4, 50)));
        check(true, `System prompt retrieved (${charCount} chars, showing first 1500)`);
      }
    } else {
      lines.push(warn("System prompt not available"));
      lines.push(info("  Possible reasons:"));
      lines.push(info("    \u2022 No provider request has been made yet in this session"));
      lines.push(info("    \u2022 ctx.getSystemPrompt() is not supported by your Pi version"));
      lines.push(info("    \u2022 The provider payload does not contain a messages array"));
    }
    lines.push(section("SUMMARY"));
    lines.push(info(`Passed: ${passCount}  Failed: ${failCount}  Warnings: ${warnCount}`));
    if (failCount === 0) {
      lines.push(ok("All critical checks passed! \u{1F389}"));
    } else {
      lines.push(fail(`${failCount} check(s) failed \u2014 see above for details`));
    }
    if (warnCount > 0) {
      lines.push(warn(`${warnCount} warning(s) \u2014 non-critical but worth addressing`));
    }
    lines.push(branding);
    return lines.join("\n");
  }
  pi.registerCommand("diag", {
    description: "Run a full system diagnostic (Ollama, models, extensions, themes, resources, security)",
    detailedHelp: "\n\n\u{1F50D} System Diagnostic Extension\n\nRuns a comprehensive diagnostic check of the Pi environment including:\n\u2022 System resources (CPU, RAM, disk space)\n\u2022 Ollama connectivity and status\n\u2022 Models.json configuration validation\n\u2022 Extensions and themes loading\n\u2022 Security posture and settings\n\u2022 Current session state\n\u2022 Network connectivity\n\u2022 Tool availability and functionality\n\n\u{1F4CB} Usage:\n  /diag                       - Run full diagnostic\n  /diag --help                - Show this help\n  /diag --quick               - Quick health check only\n  /diag --security            - Security-focused diagnostic\n  /diag --performance        - Performance-focused diagnostic\n\n\u{1F4CA} Diagnostic Sections:\n\u2022 System Resources: CPU, RAM, disk usage\n\u2022 Ollama Status: Connection and model availability\n\u2022 Configuration: Models.json validation\n\u2022 Extensions: Loaded extensions and status\n\u2022 Security: Security mode and audit log\n\u2022 Network: Internet connectivity and API endpoints\n\u2022 Tools: Available tools and functionality\n\n\u{1F4A1} Tips:\n\u2022 Use --quick for fast status checks\n\u2022 Use --security to focus on security issues\n\u2022 Run regularly to monitor system health\n",
    handler: async (args, ctx) => {
      if (args.trim() === "--help") {
        ctx.ui.notify(
          "\u{1F50D} System Diagnostic Extension\n\n\u{1F4CB} Usage:\n  /diag                       - Run full diagnostic\n  /diag --help                - Show this help\n  /diag --quick               - Quick health check only\n  /diag --security            - Security-focused diagnostic\n  /diag --performance        - Performance-focused diagnostic\n\n\u{1F4CA} Diagnostic Sections:\n\u2022 System Resources: CPU, RAM, disk usage\n\u2022 Ollama Status: Connection and model availability\n\u2022 Configuration: Models.json validation\n\u2022 Extensions: Loaded extensions and status\n\u2022 Security: Security mode and audit log\n\u2022 Network: Internet connectivity and API endpoints\n\u2022 Tools: Available tools and functionality\n\n\u{1F4A1} Tips:\n\u2022 Use --quick for fast status checks\n\u2022 Use --security to focus on security issues\n\u2022 Run regularly to monitor system health\n",
          "info"
        );
        return;
      }
      if (!ctx.hasUI) {
        ctx.ui.notify("Diagnostic requires TUI mode", "error");
        return;
      }
      if (args.trim() === "--quick") {
        ctx.ui.notify("Running quick diagnostic...", "info");
        try {
          const report = await runQuickDiagnostics(ctx);
          pi.sendMessage({
            customType: "diagnostic-report",
            content: report,
            display: { type: "content", content: report }
          });
        } catch (e) {
          ctx.ui.notify(`Quick diagnostic failed: ${e.message}`, "error");
        }
        return;
      }
      ctx.ui.notify("Running diagnostic...", "info");
      try {
        const report = await runDiagnostics(ctx);
        pi.sendMessage({
          customType: "diagnostic-report",
          content: report,
          display: { type: "content", content: report }
        });
      } catch (e) {
        ctx.ui.notify(`Diagnostic failed: ${e.message}`, "error");
      }
    }
  });
  pi.registerTool({
    name: "self_diagnostic",
    label: "Self Diagnostic",
    description: "Run a comprehensive diagnostic check on the Pi environment including system resources, Ollama status, model configuration, extensions, themes, security posture, and current session state. Use this whenever the user asks for a diagnostic, health check, or system status.",
    promptSnippet: "self_diagnostic - run full system diagnostic check",
    promptGuidelines: [
      "When the user asks for a diagnostic, health check, or system test, call self_diagnostic."
    ],
    parameters: {
      type: "object",
      properties: {}
    },
    execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
      try {
        const report = await runDiagnostics(ctx);
        return {
          content: [{ type: "text", text: report }],
          isError: false
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Diagnostic failed: ${e.message}` }],
          isError: true
        };
      }
    }
  });
}
export {
  diag_default as default
};
