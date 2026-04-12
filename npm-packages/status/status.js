// .build-npm/status/status.temp.ts
import os from "node:os";
import { execSync as gitExecSync } from "node:child_process";
import { getOllamaBaseUrl, fetchModelContextLength, readModelsJson } from "@vtstech/pi-shared/ollama";
import { fmtBytes, fmtDur } from "@vtstech/pi-shared/format";
function status_temp_default(pi) {
  let lastResponseTime = null;
  let agentStartTime = null;
  let updateInterval = null;
  let currentCtx = null;
  let ctxUi = null;
  let prevCpuInfo = getCpuSnapshot();
  let lastPayload = null;
  let tuiRef = null;
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
    try {
      const out = gitExecSync("cat /proc/meminfo", { encoding: "utf-8", timeout: 3e3 });
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
  function getPwd() {
    const cwd = process.cwd();
    if (cwd.startsWith(os.homedir())) return "~" + cwd.slice(os.homedir().length);
    return cwd;
  }
  function getGitBranch() {
    if (gitBranchCache) return gitBranchCache;
    try {
      const branch = gitExecSync("git rev-parse --abbrev-ref HEAD 2>/dev/null", {
        encoding: "utf-8",
        timeout: 3e3
      }).trim();
      if (branch) gitBranchCache = branch;
    } catch {
    }
    return gitBranchCache;
  }
  function incrementBlockedCount() {
    blockedCount++;
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
  }
  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    ctxUi = ctx.ui;
    prevCpuInfo = getCpuSnapshot();
    updateMetrics();
    ctx.ui.setFooter((tui, theme, footerData) => {
      tuiRef = tui;
      const dim = (s) => theme?.fg?.("dim", s) ?? s;
      const red = (s) => theme?.fg?.("error", s) ?? s;
      const yellow = (s) => theme?.fg?.("yellow", s) ?? s;
      const sep = dim(" \xB7 ");
      const truncateLine = (line, maxW) => {
        const ellipsis = dim("...");
        const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
        if (visible.length > maxW) {
          let vis = 0, cut = 0;
          for (let i = 0; i < line.length && vis < maxW - 3; i++) {
            if (line[i] === "\x1B") {
              while (i < line.length && line[i] !== "m") i++;
            } else {
              vis++;
            }
            cut = i + 1;
          }
          return line.slice(0, cut) + ellipsis;
        }
        return line;
      };
      return {
        render(width) {
          const lines = [];
          let branch = "";
          try {
            branch = footerData?.getGitBranch?.() || "";
          } catch {
          }
          if (!branch) branch = getGitBranch();
          const line1Parts = [];
          if (footerModel) line1Parts.push(`conf:${footerModel}`);
          line1Parts.push(getPwd());
          if (footerThinking && footerThinking !== "off") line1Parts.push(dim(footerThinking));
          if (isLocalProvider) {
            line1Parts.push(dim(`CPU ${cpuUsage.toFixed(0)}%`));
          }
          let line1 = truncateLine(line1Parts.join(sep), width);
          lines.push(line1);
          const line2Parts = [];
          if (ollamaLoaded) line2Parts.push(`load:${ollamaLoaded}`);
          if (footerNativeCtx) line2Parts.push(`M:${footerNativeCtx}`);
          if (footerCtxPct) line2Parts.push(`S:${footerCtxPct}`);
          if (isLocalProvider) {
            line2Parts.push(`RAM ${fmtBytes(memUsed)}/${fmtBytes(memTotal)}`);
            if (hasSwap && swapUsed > 0) {
              line2Parts.push(`Swap ${fmtBytes(swapUsed)}/${fmtBytes(swapTotal)}`);
            }
          }
          if (lastUpstream > 0 || lastDownstream > 0) {
            line2Parts.push(dim(`\u2191${fmtTk(lastUpstream)} \u2193${fmtTk(lastDownstream)}`));
          }
          if (lastResponseTime !== null) line2Parts.push(`Resp ${fmtDur(lastResponseTime)}`);
          if (lastPayload) {
            const params = extractParams(lastPayload);
            if (params.length > 0) line2Parts.push(...params.map((p) => dim(p)));
          }
          const now = Date.now();
          if (securityFlashTool && now < securityFlashUntil) {
            line2Parts.push(red(`BLOCKED:${securityFlashTool}`));
          }
          if (blockedCount > 0) {
            line2Parts.push(red(`SEC:${blockedCount}`));
          }
          let line2 = truncateLine(line2Parts.join(sep), width);
          if (line2) lines.push(line2);
          if (activeTool && activeToolStart > 0) {
            const elapsed = performance.now() - activeToolStart;
            lines.push(`${yellow("\u23F3")} ${activeTool}: ${fmtDur(elapsed)}`);
          }
          return lines;
        },
        invalidate() {
        },
        dispose() {
        }
      };
    });
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(() => {
      updateMetrics();
      if (tuiRef) tuiRef.requestRender();
    }, 3e3);
  });
  pi.on("session_shutdown", async () => {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = null;
    tuiRef = null;
    if (ctxUi) {
      ctxUi.setFooter(void 0);
      ctxUi = null;
    }
    currentCtx = null;
    securityFlashTool = "";
    securityFlashUntil = 0;
    activeTool = "";
    activeToolStart = 0;
    blockedCount = 0;
    lastUpstream = 0;
    lastDownstream = 0;
  });
  pi.on("before_provider_request", (event) => {
    lastPayload = event.payload;
  });
  function captureUsage(event) {
    if (event?.message?.role !== "assistant") return;
    const usage = event?.message?.usage ?? // normalised Pi usage
    event?.usage ?? // alternative path
    null;
    if (!usage) return;
    const inp = usage.input ?? usage.promptTokens ?? usage.prompt_tokens;
    const out = usage.output ?? usage.completionTokens ?? usage.completion_tokens;
    if (inp != null) lastUpstream = inp;
    if (out != null) lastDownstream = out;
    if (tuiRef) tuiRef.requestRender();
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
    updateMetrics();
    if (tuiRef) tuiRef.requestRender();
  });
  pi.on("tool_call", (event) => {
    if (!event) return;
    const isBlocked = event.blocked === true || event.blocked === "true" || event.result?.blocked === true || event.error?.includes("blocked");
    if (isBlocked) {
      securityFlashTool = event.tool ?? event.name ?? "unknown";
      securityFlashUntil = Date.now() + 3e3;
      incrementBlockedCount();
      if (tuiRef) tuiRef.requestRender();
    }
  });
  pi.on("tool_execution_start", (event) => {
    if (!event) return;
    activeTool = event.tool ?? event.name ?? "tool";
    activeToolStart = performance.now();
    if (tuiRef) tuiRef.requestRender();
  });
  pi.on("tool_execution_end", () => {
    activeTool = "";
    activeToolStart = 0;
    if (tuiRef) tuiRef.requestRender();
  });
}
export {
  status_temp_default as default
};
