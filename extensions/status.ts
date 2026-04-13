/**
 * System Monitor — Pi Coding Agent Extension
 * Adds named status items to the framework footer using ctx.ui.setStatus().
 * Each piece of info (CPU, RAM, tokens, security, etc.) gets its own named slot
 * so it composes cleanly with other extensions' status items.
 *
 * Metrics update every 5 seconds. All status slots are cleared on session_shutdown.
 * Active tool timing uses a fast 1s sub-interval while a tool is running.
 *
 * Written by VTSTech
 * GitHub: https://github.com/VTSTech
 * Website: www.vts-tech.org
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";

// ── Shared imports ─────────────────────────────────────────────────────────
import { EXTENSION_VERSION, getOllamaBaseUrl, fetchModelContextLength, readModelsJson } from "../shared/ollama";
import { fmtBytes, fmtDur } from "../shared/format";
import { debugLog } from "../shared/debug";
import { getSecurityMode } from "../shared/security";

// ── Configuration ──────────────────────────────────────────────────────────

/** Main metrics update interval (milliseconds). */
const STATUS_UPDATE_INTERVAL_MS = 5000;

/** Fast update interval while a tool is actively running (for live timer). */
const TOOL_TIMER_INTERVAL_MS = 1000;

export default function (pi: ExtensionAPI) {
  let lastResponseTime: number | null = null;
  let agentStartTime: number | null = null;
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let toolTimerInterval: ReturnType<typeof setInterval> | null = null;
  let currentCtx: any = null;
  let ctxUi: any = null;
  let ctxTheme: any = null;
  let prevCpuInfo = getCpuSnapshot();
  let lastPayload: Record<string, any> | null = null;
  // Cached metrics
  let cpuUsage = 0;
  let memUsed = 0;
  let memTotal = 0;
  let swapUsed = 0;
  let swapTotal = 0;
  let hasSwap = false;
  let footerModel = "";
  let footerNativeCtx = "";
  let nativeCtxModel = "";
  let isLocalProvider = true;
  let versionsText = "";
  let cachedPromptText: string | null = null;

  // ── Security tracking ────────────────────────────────────────────────────

  /** Name of the most recently blocked tool (for the flash indicator). */
  let securityFlashTool = "";
  /** Timestamp until which the block flash is visible (3 s window). */
  let securityFlashUntil = 0;

  /** Currently executing tool name. */
  let activeTool = "";
  /** Timestamp when the active tool started executing. */
  let activeToolStart = 0;

  /** Session-scoped count of blocked operations. */
  let blockedCount = 0;

  // ── helpers ──────────────────────────────────────────────────────

  function getCpuSnapshot() {
    return os.cpus().map((c) => ({
      user: c.times.user, nice: c.times.nice,
      sys: c.times.sys, idle: c.times.idle,
    }));
  }

  function getCpuUsage(): number {
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
    return totalDelta > 0 ? (totalUsed / totalDelta) * 100 : 0;
  }

  function getMem() {
    const total = os.totalmem();
    const used = total - os.freemem();
    return { used, total };
  }

  function getSwap(): { used: number; total: number } | null {
    if (process.platform !== "linux") {
      debugLog("status", "swap detection skipped: not a Linux platform");
      return null;
    }
    try {
      const out = fs.readFileSync("/proc/meminfo", "utf-8");
      const swapTotal = Number(out.match(/SwapTotal:\s+(\d+)/)?.[1]) * 1024;
      const swapFree = Number(out.match(/SwapFree:\s+(\d+)/)?.[1]) * 1024;
      if (swapTotal > 0) return { used: swapTotal - swapFree, total: swapTotal };
    } catch (err) { debugLog("status", "failed to read /proc/meminfo", err); }
    return null;
  }

  /**
   * Detect whether the active provider is local (localhost/127.0.0.1/0.0.0.0)
   * or remote/cloud. CPU/RAM/Swap metrics are only meaningful for local.
   */
  function detectLocalProvider(modelsJson: Record<string, any>): boolean {
    const isLocalUrl = (url: string) =>
      url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0");

    try {
      const ctxUrl = currentCtx?.provider?.baseUrl || currentCtx?.provider?.url || "";
      if (ctxUrl) return isLocalUrl(ctxUrl);

      const modelId = footerModel || "";
      if (modelsJson && modelId) {
        for (const provider of Object.values(modelsJson.providers || {}) as any[]) {
          const url = provider.baseUrl || "";
          if ((provider.models || []).some((m: any) => m.id === modelId)) {
            return isLocalUrl(url);
          }
        }
      }
    } catch { /* ignore */ }
    return false;
  }

  // Cached native context lookup — populated asynchronously, read synchronously
  let nativeCtxPromise: Promise<void> | null = null;

  /**
   * Fetch the native max context length for the active model from Ollama /api/show.
   * Fire-and-forget — result available on next cycle via cache.
   */
  function getNativeModelCtx(modelId: string): string {
    if (!modelId) return "";
    if (modelId === nativeCtxModel && footerNativeCtx) return footerNativeCtx;
    nativeCtxModel = modelId;
    if (!nativeCtxPromise) {
      nativeCtxPromise = (async () => {
        try {
          const ollamaBase = getOllamaBaseUrl();
          const ctx = await fetchModelContextLength(ollamaBase, modelId);
          if (ctx != null) {
            footerNativeCtx = ctx >= 1000 ? `${(ctx / 1000).toFixed(0)}k` : String(ctx);
          }
        } catch { /* ignore */ }
        finally { nativeCtxPromise = null; }
      })();
    }
    return footerNativeCtx;
  }

  function extractParams(payload: Record<string, any>): string[] {
    const params: string[] = [];
    if (payload.temperature !== undefined) params.push(`temp:${payload.temperature}`);
    if (payload.top_p !== undefined) params.push(`top_p:${payload.top_p}`);
    if (payload.top_k !== undefined) params.push(`top_k:${payload.top_k}`);
    // RespMax handled separately in flushStatus with green highlighting
    if (payload.num_predict !== undefined) params.push(`predict:${payload.num_predict}`);
    if (payload.num_ctx !== undefined) params.push(`ctx:${payload.num_ctx}`);
    if (payload.reasoning_effort !== undefined) params.push(`think:${payload.reasoning_effort}`);
    return params;
  }

  // ── flushStatus: push all cached state into named setStatus slots ──

  /**
   * Write all current metrics into named status slots.
   * Each call to ctx.ui.setStatus() creates or updates a composable slot
   * that coexists with other extensions' status items.
   * Setting a slot to undefined removes it from the footer.
   */
  function flushStatus() {
    if (!ctxUi) return;
    const theme = ctxTheme;
    const dim = (s: string) => theme?.fg?.("dim", s) ?? s;
    const green = (s: string) => theme?.fg?.("success", s) ?? s;

    // CPU (local only)
    ctxUi.setStatus("status-cpu", isLocalProvider ? `${dim("CPU")} ${green(cpuUsage.toFixed(0) + "%")}` : undefined);

    // RAM (local only)
    ctxUi.setStatus("status-ram", isLocalProvider ? `${dim("RAM")} ${green(fmtBytes(memUsed) + "/" + fmtBytes(memTotal))}` : undefined);

    // Swap (local only, only when swap is in use)
    ctxUi.setStatus("status-swap",
      (isLocalProvider && hasSwap && swapUsed > 0)
        ? `${dim("Swap")} ${green(fmtBytes(swapUsed) + "/" + fmtBytes(swapTotal))}`
        : undefined,
    );

    // Native model context length (local & remote Ollama)
    ctxUi.setStatus("status-native-ctx",
      footerNativeCtx ? `${dim("CtxMax:")}${green(footerNativeCtx)}` : undefined,
    );

    // Max response/completion tokens (green highlighted, k-notation)
    if (lastPayload) {
      const rawMax = lastPayload.max_completion_tokens ?? lastPayload.max_tokens;
      if (rawMax !== undefined) {
        const formatted = rawMax >= 1000 ? `${(rawMax / 1000).toFixed(rawMax % 1000 === 0 ? 0 : 1)}k` : String(rawMax);
        ctxUi.setStatus("status-resp-max", `${dim("RespMax:")}${green(formatted)}`);
      } else {
        ctxUi.setStatus("status-resp-max", undefined);
      }
    } else {
      ctxUi.setStatus("status-resp-max", undefined);
    }

    // Response time
    ctxUi.setStatus("status-resp",
      lastResponseTime !== null ? `${dim("Resp")} ${green(fmtDur(lastResponseTime))}` : undefined,
    );

    // Active parameters from last payload
    if (lastPayload) {
      const params = extractParams(lastPayload);
      ctxUi.setStatus("status-params", params.length > 0 ? dim(params.join(" ")) : undefined);
    } else {
      ctxUi.setStatus("status-params", undefined);
    }

    // Security: flash indicator (3s window) + persistent counter + mode
    const secMode = getSecurityMode();
    const now = Date.now();
    if (securityFlashTool && now < securityFlashUntil) {
      ctxUi.setStatus("status-sec", `${dim("SEC:")}${green(String(blockedCount))} ${dim("(" + secMode.toUpperCase() + ")")} ${dim("(blocked: " + securityFlashTool + ")")}`);
    } else if (blockedCount > 0) {
      ctxUi.setStatus("status-sec", `${dim("SEC:")}${green(String(blockedCount))} ${dim("(" + secMode.toUpperCase() + ")")}`);
    } else {
      ctxUi.setStatus("status-sec", `${dim("SEC:")}${green(secMode.toUpperCase())}`);
    }

    // Active tool timing (updated by a fast 1s interval while tool is running)
    if (activeTool && activeToolStart > 0) {
      const elapsed = performance.now() - activeToolStart;
      ctxUi.setStatus("status-tool", `${green(">")} ${dim(activeTool + ":")} ${green(fmtDur(elapsed))}`);
    } else {
      ctxUi.setStatus("status-tool", undefined);
    }

    // System prompt size (cached from agent_start, must come before versions)
    ctxUi.setStatus("system-prompt", cachedPromptText ?? undefined);

    // Versions — always last slot
    if (versionsText) {
      ctxUi.setStatus("status-versions", dim(versionsText));
    }
  }

  // ── metrics refresh (called every STATUS_UPDATE_INTERVAL_MS) ──

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
    const modelsJson = readModelsJson();
    isLocalProvider = modelsJson ? detectLocalProvider(modelsJson) : false;

    if (currentCtx) {
      footerModel = currentCtx.model?.id || "";
      const modelId = currentCtx.model?.id || "";
      if (modelId) {
        getNativeModelCtx(modelId);
      }
    }

    flushStatus();
  }

  // ── event handlers ──────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    ctxUi = ctx.ui;
    ctxTheme = ctx.ui.theme;
    prevCpuInfo = getCpuSnapshot();

    // Fetch Pi version once at session start
    try {
      const out = execSync("pi -v 2>&1", { encoding: "utf-8", timeout: 5000 }).trim();
      if (out) versionsText = `pi:${out}`;
    } catch { /* ignore */ }
    updateMetrics();

    // Main metrics loop (every 5s)
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updateMetrics, STATUS_UPDATE_INTERVAL_MS);
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
    if (toolTimerInterval) { clearInterval(toolTimerInterval); toolTimerInterval = null; }
    ctxUi = null;
    currentCtx = null;

    // Clear all status slots so they don't linger
    const ui = ctx?.ui;
    if (ui) {
      ui.setStatus("status-cpu", undefined);
      ui.setStatus("status-ram", undefined);
      ui.setStatus("status-swap", undefined);
      ui.setStatus("status-native-ctx", undefined);
      ui.setStatus("status-resp", undefined);
      ui.setStatus("status-resp-max", undefined);
      ui.setStatus("status-params", undefined);
      ui.setStatus("system-prompt", undefined);
      ui.setStatus("status-sec", undefined);
      ui.setStatus("status-tool", undefined);
      ui.setStatus("status-versions", undefined);
    }

    // Reset state
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
    lastPayload = event.payload as Record<string, any>;
  });

  pi.on("agent_start", async (_event, ctx) => {
    agentStartTime = performance.now();
    try {
      const prompt = ctx.getSystemPrompt();
      const chr = prompt.length;
      const tok = prompt.split(/\s+/).filter(Boolean).length;
      cachedPromptText = `${dim("Prompt:")} ${green(`${chr} chr ${tok} tok`)}`;
    } catch { /* getSystemPrompt not available */ }
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

  // ── Tool event handlers ──────────────────────────────────────────

  /**
   * Start a fast 1s update interval for live tool timing.
   * Only active while a tool is running; stopped when the tool finishes.
   */
  function startToolTimer() {
    if (toolTimerInterval) return; // already running
    toolTimerInterval = setInterval(flushStatus, TOOL_TIMER_INTERVAL_MS);
  }

  /** Stop the fast tool timer interval. */
  function stopToolTimer() {
    if (toolTimerInterval) {
      clearInterval(toolTimerInterval);
      toolTimerInterval = null;
    }
  }

  /**
   * Track tool_call events for security blocking.
   */
  pi.on("tool_call", (event: any) => {
    if (!event) return;

    const isBlocked =
      event.blocked === true ||
      event.blocked === "true" ||
      (event.result as any)?.blocked === true ||
      (event.error as string)?.includes("blocked");

    if (isBlocked) {
      securityFlashTool = event.tool ?? event.name ?? "unknown";
      securityFlashUntil = Date.now() + 3000;
      blockedCount++;
      flushStatus();
    }
  });

  /**
   * Track tool_execution_start events to show per-tool timing.
   * Starts a fast 1s update interval so the timer is visible.
   */
  pi.on("tool_execution_start", (event: any) => {
    if (!event) return;
    activeTool = event.tool ?? event.name ?? "tool";
    activeToolStart = performance.now();
    startToolTimer();
  });

  /**
   * Clear per-tool timing when a tool finishes executing.
   */
  pi.on("tool_execution_end", () => {
    activeTool = "";
    activeToolStart = 0;
    stopToolTimer();
    flushStatus();
  });
}