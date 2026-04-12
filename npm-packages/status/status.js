import os from "node:os";
import * as fs from "node:fs";
import { exec } from "node:child_process";
import { getOllamaBaseUrl, fetchModelContextLength, readModelsJson } from "@vtstech/pi-shared/ollama";
import { fmtBytes, fmtDur } from "@vtstech/pi-shared/format";
const STATUS_UPDATE_INTERVAL_MS = 5e3;
const TOOL_TIMER_INTERVAL_MS = 1e3;
function status_temp_default(pi) {
  let lastResponseTime = null;
  let agentStartTime = null;
  let updateInterval = null;
  let toolTimerInterval = null;
  let currentCtx = null;
  let ctxUi = null;
  let prevCpuInfo = getCpuSnapshot();
  let lastPayload = null;
  let gitBranchCache = "";
  let cpuUsage = 0;
  let memUsed = 0;
  let memTotal = 0;
  let swapUsed = 0;
  let swapTotal = 0;
  let hasSwap = false;
  let ollamaLoaded = "";
  let footerModel = "";
  let footerThinking = "";
  let footerCtxPct = "";
  let footerNativeCtx = "";
  let nativeCtxModel = "";
  let isLocalProvider = true;
  let lastUpstream = 0;
  let lastDownstream = 0;
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
  function getSwap() {
    if (process.platform !== "linux") return null;
    try {
      const out = fs.readFileSync("/proc/meminfo", "utf-8");
      const swapTotal2 = Number(out.match(/SwapTotal:\s+(\d+)/)?.[1]) * 1024;
      const swapFree = Number(out.match(/SwapFree:\s+(\d+)/)?.[1]) * 1024;
      if (swapTotal2 > 0) return { used: swapTotal2 - swapFree, total: swapTotal2 };
    } catch {
    }
    return null;
  }
  let ollamaLoadedCache = "";
  let ollamaLoadedLastCheck = 0;
  const OLLAMA_LOADED_INTERVAL = 15e3;
  function detectLocalProvider(modelsJson) {
    const isLocalUrl = (url) => url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0");
    try {
      const ctxUrl = currentCtx?.provider?.baseUrl || currentCtx?.provider?.url || "";
      if (ctxUrl) return isLocalUrl(ctxUrl);
      const modelId = footerModel || "";
      if (modelsJson && modelId) {
        for (const provider of Object.values(modelsJson.providers || {})) {
          const url = provider.baseUrl || "";
          if ((provider.models || []).some((m) => m.id === modelId)) {
            return isLocalUrl(url);
          }
        }
      }
    } catch {
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
        } catch {
        } finally {
          nativeCtxPromise = null;
        }
      })();
    }
    return footerNativeCtx;
  }
  async function fetchOllamaLoadedModel() {
    try {
      const ollamaBase = getOllamaBaseUrl();
      const res = await fetch(`${ollamaBase}/api/ps`, {
        signal: AbortSignal.timeout(5e3)
      });
      if (!res.ok) return "";
      const data = await res.json();
      const models = data?.models || [];
      if (Array.isArray(models) && models.length > 0) {
        return models[0].name || models[0].model || "";
      }
    } catch {
    }
    return "";
  }
  function getOllamaLoadedModel() {
    const now = Date.now();
    if (now - ollamaLoadedLastCheck < OLLAMA_LOADED_INTERVAL) return ollamaLoadedCache;
    ollamaLoadedLastCheck = now;
    fetchOllamaLoadedModel().then((loaded) => {
      ollamaLoadedCache = loaded;
    }).catch(() => {
      ollamaLoadedCache = "";
    });
    return ollamaLoadedCache;
  }
  function extractParams(payload) {
    const params = [];
    if (payload.temperature !== void 0) params.push(`temp:${payload.temperature}`);
    if (payload.top_p !== void 0) params.push(`top_p:${payload.top_p}`);
    if (payload.top_k !== void 0) params.push(`top_k:${payload.top_k}`);
    if (payload.max_completion_tokens !== void 0) params.push(`max:${payload.max_completion_tokens}`);
    else if (payload.max_tokens !== void 0) params.push(`max:${payload.max_tokens}`);
    if (payload.num_predict !== void 0) params.push(`predict:${payload.num_predict}`);
    if (payload.num_ctx !== void 0) params.push(`ctx:${payload.num_ctx}`);
    if (payload.reasoning_effort !== void 0) params.push(`think:${payload.reasoning_effort}`);
    return params;
  }
  function fmtTk(n) {
    if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
    return String(n);
  }
  function flushStatus() {
    if (!ctxUi) return;
    ctxUi.setStatus("status-cpu", isLocalProvider ? `CPU ${cpuUsage.toFixed(0)}%` : void 0);
    ctxUi.setStatus("status-ram", isLocalProvider ? `RAM ${fmtBytes(memUsed)}/${fmtBytes(memTotal)}` : void 0);
    ctxUi.setStatus("status-swap", isLocalProvider && hasSwap && swapUsed > 0 ? `Swap ${fmtBytes(swapUsed)}/${fmtBytes(swapTotal)}` : void 0);
    ctxUi.setStatus("status-loaded", ollamaLoaded ? `load:${ollamaLoaded}` : void 0);
    ctxUi.setStatus("status-native-ctx", isLocalProvider && footerNativeCtx ? `M:${footerNativeCtx}` : void 0);
    ctxUi.setStatus("status-ctx", footerCtxPct ? `S:${footerCtxPct}` : void 0);
    ctxUi.setStatus("status-thinking", footerThinking && footerThinking !== "off" ? footerThinking : void 0);
    if (lastUpstream > 0 || lastDownstream > 0) {
      ctxUi.setStatus("status-tokens", `${fmtTk(lastUpstream)} in / ${fmtTk(lastDownstream)} out`);
    } else {
      ctxUi.setStatus("status-tokens", void 0);
    }
    ctxUi.setStatus("status-resp", lastResponseTime !== null ? `Resp ${fmtDur(lastResponseTime)}` : void 0);
    if (lastPayload) {
      const params = extractParams(lastPayload);
      ctxUi.setStatus("status-params", params.length > 0 ? params.join(" ") : void 0);
    } else {
      ctxUi.setStatus("status-params", void 0);
    }
    const now = Date.now();
    if (securityFlashTool && now < securityFlashUntil) {
      ctxUi.setStatus("status-sec", `SEC:${blockedCount} (blocked: ${securityFlashTool})`);
    } else if (blockedCount > 0) {
      ctxUi.setStatus("status-sec", `SEC:${blockedCount}`);
    } else {
      ctxUi.setStatus("status-sec", void 0);
    }
    if (activeTool && activeToolStart > 0) {
      const elapsed = performance.now() - activeToolStart;
      ctxUi.setStatus("status-tool", `> ${activeTool}: ${fmtDur(elapsed)}`);
    } else {
      ctxUi.setStatus("status-tool", void 0);
    }
  }
  function updateMetrics() {
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
    ollamaLoaded = getOllamaLoadedModel();
    const modelsJson = readModelsJson();
    isLocalProvider = modelsJson ? detectLocalProvider(modelsJson) : false;
    if (currentCtx) {
      footerModel = currentCtx.model?.id || "";
      footerThinking = pi.getThinkingLevel?.() ?? "";
      const usage = currentCtx.getContextUsage?.();
      if (usage && usage.contextWindow > 0) {
        const pctVal = (usage.tokens / usage.contextWindow * 100).toFixed(1);
        footerCtxPct = `${pctVal}%/${(usage.contextWindow / 1e3).toFixed(0)}k`;
      } else {
        footerCtxPct = "";
      }
      const modelId = currentCtx.model?.id || "";
      if (modelId && isLocalProvider) {
        getNativeModelCtx(modelId);
      }
    }
    flushStatus();
  }
  function startToolTimer() {
    if (toolTimerInterval) return;
    toolTimerInterval = setInterval(flushStatus, TOOL_TIMER_INTERVAL_MS);
  }
  function stopToolTimer() {
    if (toolTimerInterval) {
      clearInterval(toolTimerInterval);
      toolTimerInterval = null;
    }
  }
  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    ctxUi = ctx.ui;
    prevCpuInfo = getCpuSnapshot();
    updateMetrics();
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updateMetrics, STATUS_UPDATE_INTERVAL_MS);
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
    if (toolTimerInterval) { clearInterval(toolTimerInterval); toolTimerInterval = null; }
    ctxUi = null;
    currentCtx = null;
    const ui = ctx?.ui;
    if (ui) {
      ui.setStatus("status-cpu", void 0);
      ui.setStatus("status-ram", void 0);
      ui.setStatus("status-swap", void 0);
      ui.setStatus("status-loaded", void 0);
      ui.setStatus("status-native-ctx", void 0);
      ui.setStatus("status-ctx", void 0);
      ui.setStatus("status-thinking", void 0);
      ui.setStatus("status-tokens", void 0);
      ui.setStatus("status-resp", void 0);
      ui.setStatus("status-params", void 0);
      ui.setStatus("status-sec", void 0);
      ui.setStatus("status-tool", void 0);
    }
    securityFlashTool = "";
    securityFlashUntil = 0;
    activeTool = "";
    activeToolStart = 0;
    blockedCount = 0;
    lastUpstream = 0;
    lastDownstream = 0;
    lastResponseTime = null;
    lastPayload = null;
    gitBranchCache = "";
  });
  pi.on("before_provider_request", (event) => {
    lastPayload = event.payload;
  });
  function captureUsage(event) {
    if (event?.message?.role !== "assistant") return;
    const usage = event?.message?.usage ?? event?.usage ?? null;
    if (!usage) return;
    const inp = usage.input ?? usage.promptTokens ?? usage.prompt_tokens;
    const out = usage.output ?? usage.completionTokens ?? usage.completion_tokens;
    if (inp != null) lastUpstream = inp;
    if (out != null) lastDownstream = out;
    flushStatus();
  }
  pi.on("message_end", captureUsage);
  pi.on("turn_end", captureUsage);
  pi.on("agent_start", async () => {
    agentStartTime = performance.now();
    lastUpstream = 0;
    lastDownstream = 0;
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