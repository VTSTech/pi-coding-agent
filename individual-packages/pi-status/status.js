// .build-npm/status/status.temp.ts
import * as fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import { getOllamaBaseUrl, fetchModelContextLength, readModelsJson, isLocalProvider } from "@vtstech/pi-shared/ollama";
import { fmtBytes, fmtDur } from "@vtstech/pi-shared/format";
import { debugLog } from "@vtstech/pi-shared/debug";
import { getSecurityMode } from "@vtstech/pi-shared/security";
var execAsync = promisify(exec);
var STATUS_UPDATE_INTERVAL_MS = 5e3;
var TOOL_TIMER_INTERVAL_MS = 1e3;
function status_temp_default(pi) {
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
    return os.cpus().map((c) => ({
      user: c.times.user,
      nice: c.times.nice,
      sys: c.times.sys,
      idle: c.times.idle
    }));
  }
  function getCpuUsage() {
    const cpus = os.cpus();
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
    const total = os.totalmem();
    const used = total - os.freemem();
    return { used, total };
  }
  async function getSwap() {
    if (process.platform !== "linux") {
      debugLog("status", "swap detection skipped: not a Linux platform");
      return null;
    }
    try {
      const out = await fs.promises.readFile("/proc/meminfo", "utf-8");
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
  status_temp_default as default
};
