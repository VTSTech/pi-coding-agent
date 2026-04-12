/**
 * System Monitor — Pi Coding Agent Extension
 * Replaces the default footer with a unified 2-line status bar:
 *   Line 1 (conf): model · pwd · thinking level · CPU% (if local Ollama)
 *   Line 2 (load): loaded model · ↑↓ tokens (from message_end/turn_end) · M: · S: · RAM (if local Ollama) · Resp · params · security
 *   Line 3: (active tool timing when agent is running)
 * Metrics update every 5 seconds. Restores default footer on session shutdown.
 * Includes audit/recovery status indicators from shared security layer.
 *
 * Written by VTSTech
 * GitHub: https://github.com/VTSTech
 * Website: www.vts-tech.org
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import os from "node:os";
import { exec } from "node:child_process";

// ── Shared imports (eliminates duplication) ────────────────────────────────
import { getOllamaBaseUrl, fetchModelContextLength, readModelsJson } from "../shared/ollama";
import { fmtBytes, fmtDur } from "../shared/format";
import { debugLog } from "../shared/debug";
// readRecentAuditEntries no longer imported — SEC counter is now session-scoped (in-memory)

// ── Configuration ──────────────────────────────────────────────────────────

/**
 * Status bar update interval in milliseconds.
 * Set to 5 seconds to balance responsiveness with reduced overhead on
 * resource-constrained systems (the previous 3s interval caused unnecessary
 * CPU wake-ups on low-end hardware). Easily configurable here if needed.
 */
const STATUS_UPDATE_INTERVAL_MS = 5000;

export default function (pi: ExtensionAPI) {
  let lastResponseTime: number | null = null;
  let agentStartTime: number | null = null;
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let currentCtx: any = null;
  let ctxUi: any = null;
  let prevCpuInfo = getCpuSnapshot();
  let lastPayload: Record<string, any> | null = null;
  let tuiRef: any = null;
  let gitBranchCache = "";

  // Cached metrics
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

  // ── Upstream / downstream token tracking (per LLM call) ──
  let lastUpstream = 0;
  let lastDownstream = 0;

  // ── Audit / recovery tracking ────────────────────────────────────────────

  /** Name of the most recently blocked tool (for the flash indicator). */
  let securityFlashTool = "";
  /** Timestamp until which the block flash is visible (3 s window). */
  let securityFlashUntil = 0;

  /** Currently executing tool name (shown while agent is running). */
  let activeTool = "";
  /** Timestamp when the active tool started executing. */
  let activeToolStart = 0;

  /** Session-scoped count of blocked operations (in-memory only, resets on session_shutdown). */
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

  let ollamaLoadedCache = "";
  let ollamaLoadedLastCheck = 0;
  const OLLAMA_LOADED_INTERVAL = 15000;

  /**
   * Detect whether the active provider is local (localhost/127.0.0.1/0.0.0.0)
   * or remote/cloud. CPU/RAM/Swap metrics are only meaningful for local.
   *
   * Strategy:
   *  1. Check the framework context for the active provider URL (covers built-in
   *     providers like openrouter, openai, etc. that aren't in models.json).
   *  2. Fall back to matching the active model against models.json providers
   *     (for custom/user-defined providers).
   */
  function detectLocalProvider(modelsJson: Record<string, any>): boolean {
    const isLocalUrl = (url: string) =>
      url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0");

    try {
      // 1. Check the framework's active provider URL (covers built-in providers)
      const ctxUrl = currentCtx?.provider?.baseUrl || currentCtx?.provider?.url || "";
      if (ctxUrl) return isLocalUrl(ctxUrl);

      // 2. Fall back to matching active model in models.json
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
    // No provider URL found — assume cloud/remote
    return false;
  }

  // Cached native context lookup — populated asynchronously, read synchronously
  let nativeCtxPromise: Promise<void> | null = null;

  /**
   * Fetch the native max context length for the active model from Ollama /api/show.
   * Looks for architecture-specific keys like "qwen3.context_length".
   * Returns a human-readable string like "32k" or "131072".
   * Cached per-model to avoid redundant calls.
   *
   * Uses fire-and-forget fetch — the result populates footerNativeCtx and is
   * available on the next metrics render cycle (3s). No shell invocation needed.
   */
  function getNativeModelCtx(modelId: string): string {
    if (!modelId) return "";
    if (modelId === nativeCtxModel && footerNativeCtx) return footerNativeCtx;
    nativeCtxModel = modelId;
    // Fire-and-forget fetch (results available on next cycle via cache)
    if (!nativeCtxPromise) {
      nativeCtxPromise = (async () => {
        try {
          const ollamaBase = getOllamaBaseUrl();
          const ctx = await fetchModelContextLength(ollamaBase, modelId);
          if (ctx != null) {
            footerNativeCtx = ctx >= 1000 ? `${(ctx / 1000).toFixed(0)}k` : String(ctx);
          }
        } catch { /* ignore — network error, timeout, or parse failure */ }
        finally { nativeCtxPromise = null; }
      })();
    }
    return footerNativeCtx;
  }

  /**
   * Fetch the model currently loaded in Ollama VRAM via /api/ps.
   * Uses native fetch() instead of execSync("curl ...") to avoid
   * shell injection if the base URL contains metacharacters.
   * Results are cached for OLLAMA_LOADED_INTERVAL (15s).
   */
  async function fetchOllamaLoadedModel(): Promise<string> {
    try {
      const ollamaBase = getOllamaBaseUrl();
      const res = await fetch(`${ollamaBase}/api/ps`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return "";
      const data = (await res.json()) as { models?: Array<{ name?: string; model?: string }> };
      const models = data?.models || [];
      if (Array.isArray(models) && models.length > 0) {
        return models[0].name || models[0].model || "";
      }
    } catch { /* ignore — network error, timeout, or parse failure */ }
    return "";
  }

  function getOllamaLoadedModel(): string {
    const now = Date.now();
    if (now - ollamaLoadedLastCheck < OLLAMA_LOADED_INTERVAL) return ollamaLoadedCache;
    ollamaLoadedLastCheck = now;
    // Fire-and-forget async fetch — result available on next cycle via cache
    fetchOllamaLoadedModel().then((loaded) => {
      ollamaLoadedCache = loaded;
    }).catch(() => {
      ollamaLoadedCache = "";
    });
    return ollamaLoadedCache;
  }

  function extractParams(payload: Record<string, any>): string[] {
    const params: string[] = [];
    if (payload.temperature !== undefined) params.push(`temp:${payload.temperature}`);
    if (payload.top_p !== undefined) params.push(`top_p:${payload.top_p}`);
    if (payload.top_k !== undefined) params.push(`top_k:${payload.top_k}`);
    if (payload.max_completion_tokens !== undefined) params.push(`max:${payload.max_completion_tokens}`);
    else if (payload.max_tokens !== undefined) params.push(`max:${payload.max_tokens}`);
    if (payload.num_predict !== undefined) params.push(`predict:${payload.num_predict}`);
    if (payload.num_ctx !== undefined) params.push(`ctx:${payload.num_ctx}`);
    if (payload.reasoning_effort !== undefined) params.push(`think:${payload.reasoning_effort}`);
    return params;
  }

  /** Format token count: 1234 → "1.2k", 456 → "456". */
  function fmtTk(n: number): string {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return String(n);
  }

  function getPwd(): string {
    const cwd = process.cwd();
    if (cwd.startsWith(os.homedir())) return "~" + cwd.slice(os.homedir().length);
    return cwd;
  }

  function getGitBranch(): string {
    if (gitBranchCache) return gitBranchCache;
    // Fire-and-forget async fetch — result available on next cycle via cache
    exec("git rev-parse --abbrev-ref HEAD", { timeout: 3000 }, (err: Error | null, stdout: string) => {
      if (!err) {
        const branch = stdout.trim();
        if (branch) gitBranchCache = branch;
      } else {
        debugLog("status", "git branch detection failed", err);
      }
    });
    return gitBranchCache;
  }

  // ── Audit log helpers ─────────────────────────────────────────────

  /**
   * Increment the session-scoped blocked counter.
   * Unlike the old audit-log approach, this tracks only events in the
   * current session, so the counter resets to 0 on session_shutdown.
   */
  function incrementBlockedCount(): void {
    blockedCount++;
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
    ollamaLoaded = getOllamaLoadedModel();

    // Read models.json once per cycle — uses shared utility with 2s TTL cache
    const modelsJson = readModelsJson();

    // Detect local vs remote/cloud provider FIRST (uses pre-parsed modelsJson)
    // Must run before getNativeModelCtx() which depends on isLocalProvider
    isLocalProvider = modelsJson ? detectLocalProvider(modelsJson) : false;

    if (currentCtx) {
      footerModel = currentCtx.model?.id || "";
      footerThinking = pi.getThinkingLevel?.() ?? "";
      const usage = currentCtx.getContextUsage?.();
      if (usage && usage.contextWindow > 0) {
        const pctVal = ((usage.tokens / usage.contextWindow) * 100).toFixed(1);
        footerCtxPct = `${pctVal}%/${(usage.contextWindow / 1000).toFixed(0)}k`;
      } else {
        footerCtxPct = "";
      }
      // Fetch native model max context from Ollama /api/show (local only)
      const modelId = currentCtx.model?.id || "";
      if (modelId && isLocalProvider) {
        getNativeModelCtx(modelId);
      }
    }

    // (blockedCount is now session-scoped — updated on tool_call events, not polled)
  }

  // ── event handlers ──────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    ctxUi = ctx.ui;
    prevCpuInfo = getCpuSnapshot();
    updateMetrics();

    ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
      tuiRef = tui;
      const dim = (s: string) => theme?.fg?.("dim", s) ?? s;
      const red = (s: string) => theme?.fg?.("error", s) ?? s;
      const yellow = (s: string) => theme?.fg?.("yellow", s) ?? s;
      const sep = dim(" \u00b7 ");

      // ── Truncation helper (inside setFooter to access dim) ──
      const truncateLine = (line: string, maxW: number): string => {
        const ellipsis = dim("...");
        const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
        if (visible.length > maxW) {
          let vis = 0, cut = 0;
          for (let i = 0; i < line.length && vis < maxW - 3; i++) {
            if (line[i] === "\x1b") {
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
        render(width: number): string[] {
          const lines: string[] = [];

          // Git branch — try framework API first, fall back to git command
          let branch = "";
          try { branch = footerData?.getGitBranch?.() || ""; } catch { /* no api */ }
          if (!branch) branch = getGitBranch();

          // ── Line 1 (conf): model · pwd · thinking · CPU% (if local) ──
          const line1Parts: string[] = [];
          if (footerModel) line1Parts.push(`conf:${footerModel}`);
          line1Parts.push(getPwd());
          if (footerThinking && footerThinking !== "off") line1Parts.push(dim(footerThinking));
          if (isLocalProvider) {
            line1Parts.push(dim(`CPU ${cpuUsage.toFixed(0)}%`));
          }
          let line1 = truncateLine(line1Parts.join(sep), width);
          lines.push(line1);

          // ── Line 2 (load): loaded model · M: · S: · RAM (if local) · Resp · params · security ──
          const line2Parts: string[] = [];
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
            if (params.length > 0) line2Parts.push(...params.map(p => dim(p)));
          }

          // ── Security status indicator ──────────────────────────────
          // Flash indicator: briefly highlight a blocked tool name
          const now = Date.now();
          if (securityFlashTool && now < securityFlashUntil) {
            line2Parts.push(red(`BLOCKED:${securityFlashTool}`));
          }

          // Persistent SEC:N indicator (session-scoped — resets on session_shutdown)
          if (blockedCount > 0) {
            line2Parts.push(red(`SEC:${blockedCount}`));
          }

          let line2 = truncateLine(line2Parts.join(sep), width);
          if (line2) lines.push(line2);

          // ── Line 3: active tool timing ─────────────────────────────
          if (activeTool && activeToolStart > 0) {
            const elapsed = performance.now() - activeToolStart;
            lines.push(`${yellow("\u23f3")} ${activeTool}: ${fmtDur(elapsed)}`);
          }

          return lines;
        },

        invalidate(): void {},

        dispose(): void {},
      };
    });

    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(() => {
      updateMetrics();
      if (tuiRef) tuiRef.requestRender();
    }, STATUS_UPDATE_INTERVAL_MS);
  });

  pi.on("session_shutdown", async () => {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = null;
    tuiRef = null;
    if (ctxUi) {
      ctxUi.setFooter(undefined);
      ctxUi = null;
    }
    currentCtx = null;
    // Reset audit/recovery state
    securityFlashTool = "";
    securityFlashUntil = 0;
    activeTool = "";
    activeToolStart = 0;
    blockedCount = 0;
    lastUpstream = 0;
    lastDownstream = 0;
  });

  pi.on("before_provider_request", (event) => {
    lastPayload = event.payload as Record<string, any>;
  });

  /**
   * Capture per-LLM-call token usage from message_end / turn_end events.
   * Pi fires message_end for ALL message types (user, assistant, toolResult).
   * Only assistant messages carry token usage (input/output from the LLM).
   * We also listen on turn_end as a fallback (same payload shape).
   *
   * Usage shape: { input, output, cacheRead, cacheWrite, totalTokens }
   */
  function captureUsage(event: any) {
    // message_end fires for every message type - only assistant has usage
    if (event?.message?.role !== "assistant") return;
    const usage =
      event?.message?.usage ??    // normalised Pi usage
      event?.usage ??             // alternative path
      null;
    if (!usage) return;
    const inp = usage.input ?? usage.promptTokens ?? usage.prompt_tokens;
    const out = usage.output ?? usage.completionTokens ?? usage.completion_tokens;
    if (inp != null) lastUpstream = inp as number;
    if (out != null) lastDownstream = out as number;
    // Render immediately so tokens appear in footer without waiting for the 3s cycle
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
    // Clear active tool state when agent finishes
    activeTool = "";
    activeToolStart = 0;
    updateMetrics();
    if (tuiRef) tuiRef.requestRender();
  });

  // ── Tool event handlers (audit / recovery) ────────────────────────

  /**
   * Track tool_call events for security blocking.
   * When a tool is blocked by security, set a 3-second flash indicator
   * on the footer so the operator can see what was intercepted.
   */
  pi.on("tool_call", (event: any) => {
    if (!event) return;

    // Check if the tool call was blocked by security
    const isBlocked =
      event.blocked === true ||
      event.blocked === "true" ||
      (event.result as any)?.blocked === true ||
      (event.error as string)?.includes("blocked");

    if (isBlocked) {
      securityFlashTool = event.tool ?? event.name ?? "unknown";
      securityFlashUntil = Date.now() + 3000; // flash for 3 seconds
      // Immediately increment the session-scoped blocked counter
      incrementBlockedCount();
      if (tuiRef) tuiRef.requestRender();
    }
  });

  /**
   * Track tool_execution_start events to show per-tool timing.
   * While the agent is actively running, line 2 of the footer displays
   * a live elapsed timer for the currently executing tool.
   */
  pi.on("tool_execution_start", (event: any) => {
    if (!event) return;
    activeTool = event.tool ?? event.name ?? "tool";
    activeToolStart = performance.now();
    // Request more frequent renders while a tool is running (every 500ms)
    // so the timer updates visibly. The regular 3s interval is too coarse.
    if (tuiRef) tuiRef.requestRender();
  });

  /**
   * Clear per-tool timing when a tool finishes executing.
   */
  pi.on("tool_execution_end", () => {
    activeTool = "";
    activeToolStart = 0;
    if (tuiRef) tuiRef.requestRender();
  });
}
