// extensions/status.ts
import * as fs3 from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import os4 from "node:os";

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
var DEFAULT_RETRY_OPTIONS = {
  maxRetries: 2,
  baseDelayMs: 1e3,
  maxDelayMs: 1e4,
  retryOnTimeout: true,
  retryOnConnectionError: true
};
function backoffDelay(attempt, baseDelayMs, maxDelayMs) {
  const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(delay + jitter));
}
var RETRYABLE_ERROR_PATTERNS = [
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "fetch failed",
  "network error",
  "socket hang up",
  "Empty response"
];
function isRetryableError(error, opts) {
  if (error instanceof Error) {
    if (error.name === "AbortError" && opts.retryOnTimeout) return true;
    const msg = error.message;
    if (opts.retryOnConnectionError && RETRYABLE_ERROR_PATTERNS.some((p) => msg.includes(p))) {
      return true;
    }
  }
  return false;
}
async function withRetry(fn, options) {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < opts.maxRetries && isRetryableError(error, opts)) {
        const delay = backoffDelay(attempt, opts.baseDelayMs, opts.maxDelayMs);
        debugLog("ollama", `Retry ${attempt + 1}/${opts.maxRetries} after ${delay}ms: ${error instanceof Error ? error.message : String(error)}`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
async function fetchModelContextLength(baseUrl, modelName) {
  return withRetry(async () => {
    try {
      const res = await fetch(`${baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelName }),
        signal: AbortSignal.timeout(3e4)
      });
      if (!res.ok) return void 0;
      const data = await res.json();
      for (const key of Object.keys(data?.model_info ?? {})) {
        if (key.endsWith(".context_length")) {
          const val = data.model_info[key];
          if (typeof val === "number") return val;
        }
      }
      const numCtx = data?.model_info?.["num_ctx"];
      if (typeof numCtx === "number") return numCtx;
    } catch (err) {
      debugLog("ollama", `failed to fetch context length for ${modelName}`, err);
      return void 0;
    }
    return void 0;
  });
}
function isLocalProvider(baseUrl, providerName) {
  if (providerName === "ollama") return true;
  const url = baseUrl || "";
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0");
}

// shared/format.ts
function fmtBytes(b) {
  if (b === 0) return "0B";
  if (b < 1024) return `${b}B`;
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)}G`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(0)}M`;
  return `${(b / 1024).toFixed(0)}K`;
}
function fmtDur(ms) {
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${Math.floor(ms / 6e4)}m${Math.round(ms % 6e4 / 1e3)}s`;
}

// shared/security.ts
import * as fs2 from "node:fs";
import * as path3 from "node:path";
import os3 from "node:os";

// shared/config-io.ts
import * as path2 from "path";
import os2 from "os";
var PI_AGENT_DIR = path2.join(os2.homedir(), ".pi", "agent");
var SETTINGS_PATH = path2.join(PI_AGENT_DIR, "settings.json");
var SECURITY_PATH = path2.join(PI_AGENT_DIR, "security.json");
var REACT_MODE_PATH = path2.join(PI_AGENT_DIR, "react-mode.json");
var MODEL_TEST_CONFIG_PATH = path2.join(PI_AGENT_DIR, "model-test-config.json");

// shared/security.ts
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
var AUDIT_DIR = path3.join(os3.homedir(), ".pi", "agent");
var AUDIT_LOG_PATH = path3.join(AUDIT_DIR, "audit.log");
var _auditBuffer = [];
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
process.on("exit", () => {
  flushAuditBuffer();
});
process.on("SIGTERM", () => {
  flushAuditBuffer();
});

// extensions/status.ts
var execAsync = promisify(exec);
var STATUS_UPDATE_INTERVAL_MS = 5e3;
var TOOL_TIMER_INTERVAL_MS = 1e3;
function status_default(pi) {
  let lastResponseTime = null;
  let agentStartTime = null;
  let updateInterval = null;
  let toolTimerInterval = null;
  let currentCtx = null;
  let ctxUi = null;
  let ctxTheme = null;
  let prevCpuInfo = getCpuSnapshot();
  let lastPayload = null;
  let cpuUsage = 0;
  let memUsed = 0;
  let memTotal = 0;
  let swapUsed = 0;
  let swapTotal = 0;
  let hasSwap = false;
  let footerModel = "";
  let footerNativeCtx = "";
  let nativeCtxModel = "";
  let isLocal = true;
  let versionsText = "";
  let cachedPromptText = null;
  let securityFlashTool = "";
  let securityFlashUntil = 0;
  let activeTool = "";
  let activeToolStart = 0;
  let blockedCount = 0;
  function getCpuSnapshot() {
    return os4.cpus().map((c) => ({
      user: c.times.user,
      nice: c.times.nice,
      sys: c.times.sys,
      idle: c.times.idle
    }));
  }
  function getCpuUsage() {
    const cpus = os4.cpus();
    const n = cpus.length;
    let totalUsed = 0, totalDelta = 0;
    for (let i = 0; i < n; i++) {
      const prev = prevCpuInfo[i];
      const curr = cpus[i].times;
      const prevTotal = prev.user + prev.nice + prev.sys + prev.idle;
      const currTotal = curr.user + curr.nice + curr.sys + curr.idle;
      const d = currTotal - prevTotal;
      if (d > 0) {
        totalUsed += d - (curr.idle - prev.idle);
        totalDelta += d;
      }
    }
    prevCpuInfo = getCpuSnapshot();
    return totalDelta > 0 ? totalUsed / totalDelta * 100 : 0;
  }
  function getMem() {
    const total = os4.totalmem();
    const used = total - os4.freemem();
    return { used, total };
  }
  async function getSwap() {
    if (process.platform !== "linux") {
      debugLog("status", "swap detection skipped: not a Linux platform");
      return null;
    }
    try {
      const out = await fs3.promises.readFile("/proc/meminfo", "utf-8");
      const swapTotal2 = Number(out.match(/SwapTotal:\s+(\d+)/)?.[1]) * 1024;
      const swapFree = Number(out.match(/SwapFree:\s+(\d+)/)?.[1]) * 1024;
      if (swapTotal2 > 0) return { used: swapTotal2 - swapFree, total: swapTotal2 };
    } catch (err) {
      debugLog("status", "failed to read /proc/meminfo", err);
    }
    return null;
  }
  function detectLocalProvider(modelsJson) {
    try {
      const ctxUrl = currentCtx?.provider?.baseUrl || currentCtx?.provider?.url || "";
      if (ctxUrl) return isLocalProvider(ctxUrl);
      const modelId = footerModel || "";
      if (modelsJson && modelId) {
        for (const provider of Object.values(modelsJson.providers || {})) {
          const url = provider.baseUrl || "";
          if ((provider.models || []).some((m) => m.id === modelId)) {
            return isLocalProvider(url);
          }
        }
      }
    } catch (err) {
      debugLog("status", "failed to detect local provider", err);
    }
    return false;
  }
  let nativeCtxPromise = null;
  function getNativeModelCtx(modelId) {
    if (!modelId) return "";
    if (modelId === nativeCtxModel && footerNativeCtx) return footerNativeCtx;
    nativeCtxModel = modelId;
    if (!nativeCtxPromise) {
      nativeCtxPromise = (async () => {
        try {
          const ollamaBase = getOllamaBaseUrl();
          const ctx = await fetchModelContextLength(ollamaBase, modelId);
          if (ctx != null) {
            footerNativeCtx = ctx >= 1e3 ? `${(ctx / 1e3).toFixed(0)}k` : String(ctx);
          }
        } catch (err) {
          debugLog("status", "failed to fetch native model context", err);
        } finally {
          nativeCtxPromise = null;
        }
      })();
    }
    return footerNativeCtx;
  }
  function extractParams(payload) {
    const params = [];
    if (payload.temperature !== void 0) params.push(`temp:${payload.temperature}`);
    if (payload.top_p !== void 0) params.push(`top_p:${payload.top_p}`);
    if (payload.top_k !== void 0) params.push(`top_k:${payload.top_k}`);
    if (payload.num_predict !== void 0) params.push(`predict:${payload.num_predict}`);
    if (payload.num_ctx !== void 0) params.push(`ctx:${payload.num_ctx}`);
    if (payload.reasoning_effort !== void 0) params.push(`think:${payload.reasoning_effort}`);
    return params;
  }
  function flushStatus() {
    if (!ctxUi) return;
    const theme = ctxTheme;
    const dim2 = (s) => theme?.fg?.("dim", s) ?? s;
    const green2 = (s) => theme?.fg?.("success", s) ?? s;
    ctxUi.setStatus("status-cpu", isLocal ? `${dim2("CPU")} ${green2(cpuUsage.toFixed(0) + "%")}` : void 0);
    ctxUi.setStatus("status-ram", isLocal ? `${dim2("RAM")} ${green2(fmtBytes(memUsed) + "/" + fmtBytes(memTotal))}` : void 0);
    ctxUi.setStatus(
      "status-swap",
      isLocal && hasSwap && swapUsed > 0 ? `${dim2("Swap")} ${green2(fmtBytes(swapUsed) + "/" + fmtBytes(swapTotal))}` : void 0
    );
    const ctxParts = [];
    if (footerNativeCtx) ctxParts.push(`${dim2("CtxMax:")}${green2(footerNativeCtx)}`);
    if (lastPayload) {
      const rawMax = lastPayload.max_completion_tokens ?? lastPayload.max_tokens;
      if (rawMax !== void 0) {
        const formatted = rawMax >= 1e3 ? `${(rawMax / 1e3).toFixed(rawMax % 1e3 === 0 ? 0 : 1)}k` : String(rawMax);
        ctxParts.push(`${dim2("RespMax:")}${green2(formatted)}`);
      }
    }
    ctxUi.setStatus("status-ctx", ctxParts.length > 0 ? ctxParts.join(" ") : void 0);
    ctxUi.setStatus(
      "status-resp",
      lastResponseTime !== null ? `${dim2("Resp")} ${green2(fmtDur(lastResponseTime))}` : void 0
    );
    if (lastPayload) {
      const params = extractParams(lastPayload);
      ctxUi.setStatus("status-params", params.length > 0 ? dim2(params.join(" ")) : void 0);
    } else {
      ctxUi.setStatus("status-params", void 0);
    }
    const secMode = getSecurityMode();
    const now = Date.now();
    if (securityFlashTool && now < securityFlashUntil) {
      ctxUi.setStatus("status-sec", `${dim2("SEC:")}${green2(String(blockedCount))} ${dim2("(" + secMode.toUpperCase() + ")")} ${dim2("(blocked: " + securityFlashTool + ")")}`);
    } else if (blockedCount > 0) {
      ctxUi.setStatus("status-sec", `${dim2("SEC:")}${green2(String(blockedCount))} ${dim2("(" + secMode.toUpperCase() + ")")}`);
    } else if (secMode === "off") {
      ctxUi.setStatus("status-sec", `${dim2("SEC:")}${green2("OFF")}`);
    } else {
      ctxUi.setStatus("status-sec", `${dim2("SEC:")}${green2(secMode.toUpperCase())}`);
    }
    if (activeTool && activeToolStart > 0) {
      const elapsed = performance.now() - activeToolStart;
      ctxUi.setStatus("status-tool", `${green2(">")} ${dim2(activeTool + ":")} ${green2(fmtDur(elapsed))}`);
    } else {
      ctxUi.setStatus("status-tool", void 0);
    }
    ctxUi.setStatus("status-prompt", cachedPromptText ?? dim2("Prompt: \u2026"));
    if (versionsText) {
      ctxUi.setStatus("status-versions", `${dim2("pi:")}${green2(versionsText.replace(/^pi:/, ""))}`);
    }
  }
  async function updateMetrics() {
    cpuUsage = getCpuUsage();
    const mem = getMem();
    memUsed = mem.used;
    memTotal = mem.total;
    const swap = getSwap();
    if (swap) {
      swapUsed = swap.used;
      swapTotal = swap.total;
      hasSwap = true;
    } else {
      hasSwap = false;
    }
    const modelsJson = readModelsJson();
    isLocal = modelsJson ? detectLocalProvider(modelsJson) : false;
    if (currentCtx) {
      footerModel = currentCtx.model?.id || "";
      const modelId = currentCtx.model?.id || "";
      if (modelId) {
        getNativeModelCtx(modelId);
      }
    }
    flushStatus();
  }
  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    ctxUi = ctx.ui;
    ctxTheme = ctx.ui.theme;
    prevCpuInfo = getCpuSnapshot();
    try {
      const { stdout } = await execAsync("pi -v 2>&1", { timeout: 5e3 });
      const out = stdout.trim();
      if (out) versionsText = `pi:${out}`;
    } catch (err) {
      debugLog("status", "failed to fetch Pi version", err);
    }
    updateMetrics();
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updateMetrics, STATUS_UPDATE_INTERVAL_MS);
    updateInterval.unref();
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
    if (toolTimerInterval) {
      clearInterval(toolTimerInterval);
      toolTimerInterval = null;
    }
    ctxUi = null;
    currentCtx = null;
    const ui = ctx?.ui;
    if (ui) {
      ui.setStatus("status-cpu", void 0);
      ui.setStatus("status-ram", void 0);
      ui.setStatus("status-swap", void 0);
      ui.setStatus("status-ctx", void 0);
      ui.setStatus("status-resp", void 0);
      ui.setStatus("status-params", void 0);
      ui.setStatus("status-prompt", void 0);
      ui.setStatus("status-sec", void 0);
      ui.setStatus("status-tool", void 0);
      ui.setStatus("status-versions", void 0);
    }
    securityFlashTool = "";
    securityFlashUntil = 0;
    activeTool = "";
    activeToolStart = 0;
    blockedCount = 0;
    lastResponseTime = null;
    lastPayload = null;
    versionsText = "";
    cachedPromptText = null;
  });
  pi.on("before_provider_request", (event) => {
    lastPayload = event.payload;
    measurePromptFromPayload(lastPayload);
  });
  function measurePromptFromPayload(payload) {
    if (!payload || cachedPromptText) return;
    const theme = ctxTheme;
    const dim2 = (s) => theme?.fg?.("dim", s) ?? s;
    const green2 = (s) => theme?.fg?.("success", s) ?? s;
    try {
      const messages = payload.messages;
      if (!messages?.length) return;
      const sysMsg = messages.find((m) => m.role === "system") ?? messages[0];
      if (!sysMsg?.content) return;
      const chr = sysMsg.content.length;
      const tok = sysMsg.content.split(/\s+/).filter(Boolean).length;
      cachedPromptText = `${dim2("Prompt:")} ${green2(`${chr} chr ${tok} tok`)}`;
      debugLog("status", `system prompt measured from payload: ${chr} chars, ~${tok} words`);
      flushStatus();
    } catch (err) {
      debugLog("status", "failed to measure prompt from payload", err);
    }
  }
  pi.on("agent_start", async (_event, ctx) => {
    agentStartTime = performance.now();
    try {
      const prompt = ctx.getSystemPrompt();
      if (prompt) {
        const chr = prompt.length;
        const tok = prompt.split(/\s+/).filter(Boolean).length;
        cachedPromptText = `${dim("Prompt:")} ${green(`${chr} chr ${tok} tok`)}`;
        debugLog("status", `system prompt measured via getSystemPrompt(): ${chr} chars, ~${tok} words`);
      }
    } catch (err) {
      debugLog("status", "getSystemPrompt() not available, will measure from payload", err);
    }
    if (!cachedPromptText && lastPayload) {
      measurePromptFromPayload(lastPayload);
    }
    flushStatus();
  });
  pi.on("agent_end", async () => {
    if (agentStartTime !== null) {
      lastResponseTime = performance.now() - agentStartTime;
      agentStartTime = null;
    }
    activeTool = "";
    activeToolStart = 0;
    stopToolTimer();
    updateMetrics();
  });
  function startToolTimer() {
    if (toolTimerInterval) return;
    toolTimerInterval = setInterval(flushStatus, TOOL_TIMER_INTERVAL_MS);
    toolTimerInterval.unref();
  }
  function stopToolTimer() {
    if (toolTimerInterval) {
      clearInterval(toolTimerInterval);
      toolTimerInterval = null;
    }
  }
  pi.on("tool_call", (event) => {
    if (!event) return;
    const isBlocked = event.blocked === true || event.blocked === "true" || event.result?.blocked === true || event.error?.includes("blocked");
    if (isBlocked) {
      securityFlashTool = event.tool ?? event.name ?? "unknown";
      securityFlashUntil = Date.now() + 3e3;
      blockedCount++;
      flushStatus();
    }
  });
  pi.on("tool_execution_start", (event) => {
    if (!event) return;
    activeTool = event.tool ?? event.name ?? "tool";
    activeToolStart = performance.now();
    startToolTimer();
  });
  pi.on("tool_execution_end", () => {
    activeTool = "";
    activeToolStart = 0;
    stopToolTimer();
    flushStatus();
  });
}
export {
  status_default as default
};
