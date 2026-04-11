/**
 * System Monitor — Pi Coding Agent Extension
 * Replaces the default footer with a unified 2-line status bar:
 *   Line 1: pwd · git branch · model · thinking level · context% · CPU/RAM/Swap · VRAM · response time · params · security
 *   Line 2: (active tool timing when agent is running)
 * Metrics update every 3 seconds. Restores default footer on session shutdown.
 * Includes audit/recovery status indicators from shared security layer.
 *
 * Written by VTSTech
 * GitHub: https://github.com/VTSTech
 * Website: www.vts-tech.org
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";

// ── Shared imports (eliminates duplication) ────────────────────────────────
import { getOllamaBaseUrl } from "../shared/ollama";
import { fmtBytes, fmtDur } from "../shared/format";
import { readRecentAuditEntries } from "../shared/security";

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

  // ── Audit / recovery tracking ────────────────────────────────────────────

  /** Name of the most recently blocked tool (for the flash indicator). */
  let securityFlashTool = "";
  /** Timestamp until which the block flash is visible (3 s window). */
  let securityFlashUntil = 0;

  /** Currently executing tool name (shown while agent is running). */
  let activeTool = "";
  /** Timestamp when the active tool started executing. */
  let activeToolStart = 0;

  /** Cached count of recent blocked operations from the audit log. */
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
    try {
      const out = execSync("cat /proc/meminfo", { encoding: "utf-8", timeout: 3000 });
      const swapTotal = Number(out.match(/SwapTotal:\s+(\d+)/)?.[1]) * 1024;
      const swapFree = Number(out.match(/SwapFree:\s+(\d+)/)?.[1]) * 1024;
      if (swapTotal > 0) return { used: swapTotal - swapFree, total: swapTotal };
    } catch { /* ignore */ }
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

  /**
   * Fetch the native max context length for the active model from Ollama /api/show.
   * Looks for architecture-specific keys like "qwen3.context_length".
   * Returns a human-readable string like "32k" or "131072".
   * Cached per-model to avoid redundant calls.
   */
  function getNativeModelCtx(modelId: string): string {
    if (!modelId) return "";
    if (modelId === nativeCtxModel && footerNativeCtx) return footerNativeCtx;
    nativeCtxModel = modelId;
    try {
      const ollamaBase = getOllamaBaseUrl();
      const out = execSync(
        `curl -s -X POST "${ollamaBase}/api/show" -d '${JSON.stringify({ name: modelId })}'`,
        { encoding: "utf-8", timeout: 5000 }
      );
      if (out.trim()) {
        const data = JSON.parse(out.trim());
        for (const key of Object.keys(data?.model_info ?? {})) {
          if (key.endsWith(".context_length")) {
            const val = data.model_info[key];
            if (typeof val === "number") {
              footerNativeCtx = val >= 1000 ? `${(val / 1000).toFixed(0)}k` : String(val);
              return footerNativeCtx;
            }
          }
        }
        // Fallback: generic "num_ctx" key
        const numCtx = data?.model_info?.["num_ctx"];
        if (typeof numCtx === "number") {
          footerNativeCtx = numCtx >= 1000 ? `${(numCtx / 1000).toFixed(0)}k` : String(numCtx);
          return footerNativeCtx;
        }
      }
    } catch { /* ignore */ }
    footerNativeCtx = "";
    return "";
  }

  function getOllamaLoadedModel(): string {
    const now = Date.now();
    if (now - ollamaLoadedLastCheck < OLLAMA_LOADED_INTERVAL) return ollamaLoadedCache;
    ollamaLoadedLastCheck = now;
    try {
      const ollamaBase = getOllamaBaseUrl();
      const out = execSync(`curl -s "${ollamaBase}/api/ps"`, { encoding: "utf-8", timeout: 5000 });
      if (out.trim()) {
        const data = JSON.parse(out.trim());
        const models = data?.models || [];
        if (Array.isArray(models) && models.length > 0) {
          ollamaLoadedCache = models[0].name || models[0].model || "unknown";
          return ollamaLoadedCache;
        }
      }
    } catch { /* ignore */ }
    ollamaLoadedCache = "";
    return "";
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

  function getPwd(): string {
    const cwd = process.cwd();
    if (cwd.startsWith(os.homedir())) return "~" + cwd.slice(os.homedir().length);
    return cwd;
  }

  function getGitBranch(): string {
    if (gitBranchCache) return gitBranchCache;
    try {
      const branch = execSync("git rev-parse --abbrev-ref HEAD 2>/dev/null", {
        encoding: "utf-8", timeout: 3000,
      }).trim();
      if (branch) gitBranchCache = branch;
    } catch { /* not a git repo */ }
    return gitBranchCache;
  }

  // ── Audit log helpers ─────────────────────────────────────────────

  /**
   * Refresh the blocked-count from the shared security audit log.
   * Entries are considered "blocked" when they contain a `blocked: true`
   * field, a `safe: false` field, or an `action: "block"` field.
   */
  function refreshBlockedCount(): void {
    try {
      const entries = readRecentAuditEntries(50);
      blockedCount = 0;
      for (const entry of entries) {
        if (
          entry.blocked === true ||
          entry.safe === false ||
          entry.action === "block"
        ) {
          blockedCount++;
        }
      }
    } catch {
      blockedCount = 0;
    }
  }

  // ── metrics refresh (called every 3s) ───────────────────────────

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

    // Read models.json once per cycle — used for context display + local provider detection
    let modelsJson: Record<string, any> | null = null;
    try {
      const raw = fs.readFileSync(
        path.join(os.homedir(), ".pi", "agent", "models.json"), "utf-8"
      );
      modelsJson = JSON.parse(raw);
    } catch { /* ignore */ }

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
      // Fetch native model max context from Ollama /api/show
      const modelId = currentCtx.model?.id || "";
      if (modelId && isLocalProvider) {
        getNativeModelCtx(modelId);
      }
    }

    // Detect local vs remote/cloud provider (uses pre-parsed modelsJson)
    isLocalProvider = modelsJson ? detectLocalProvider(modelsJson) : false;

    // Refresh security audit count on every metrics cycle
    refreshBlockedCount();
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
      const red = (s: string) => theme?.fg?.("red", s) ?? s;
      const yellow = (s: string) => theme?.fg?.("yellow", s) ?? s;
      const sep = dim(" \u00b7 ");

      return {
        render(width: number): string[] {
          const lines: string[] = [];
          const parts: string[] = [];
          parts.push(getPwd());

          // Git branch — try framework API first, fall back to git command
          let branch = "";
          try { branch = footerData?.getGitBranch?.() || ""; } catch { /* no api */ }
          if (!branch) branch = getGitBranch();
          if (branch) parts.push(dim(branch));

          // Active model from agent context
          if (footerModel) parts.push(dim(footerModel));

          if (footerThinking && footerThinking !== "off") parts.push(dim(footerThinking));
          if (footerNativeCtx) parts.push(`M:${footerNativeCtx}`);
          if (footerCtxPct) parts.push(`S:${footerCtxPct}`);

          // CPU/RAM/Swap only relevant for local providers
          if (isLocalProvider) {
            parts.push(dim(`CPU ${cpuUsage.toFixed(0)}%`));
            parts.push(`RAM ${fmtBytes(memUsed)}/${fmtBytes(memTotal)}`);
            if (hasSwap && swapUsed > 0) {
              parts.push(`Swap ${fmtBytes(swapUsed)}/${fmtBytes(swapTotal)}`);
            }
          }
          if (ollamaLoaded) parts.push(`${ollamaLoaded}`);
          if (lastResponseTime !== null) parts.push(`Resp ${fmtDur(lastResponseTime)}`);
          if (lastPayload) {
            const params = extractParams(lastPayload);
            if (params.length > 0) parts.push(...params.map(p => dim(p)));
          }

          // ── Security status indicator ──────────────────────────────
          // Flash indicator: briefly highlight a blocked tool name
          const now = Date.now();
          if (securityFlashTool && now < securityFlashUntil) {
            parts.push(red(`BLOCKED:${securityFlashTool}`));
          }

          // Persistent SEC:N indicator from audit log
          if (blockedCount > 0) {
            parts.push(red(`SEC:${blockedCount}`));
          }

          let line = parts.join(sep);
          // Strip ANSI codes for visible-width measurement
          const visible = line.replace(/\x1b\[[0-9;]*m/g, "");
          if (visible.length > width) {
            // Truncate by visible chars, then find the ANSI-safe cut point
            let vis = 0, cut = 0;
            for (let i = 0; i < line.length && vis < width - 3; i++) {
              if (line[i] === "\x1b") {
                // skip to end of escape sequence
                while (i < line.length && line[i] !== "m") i++;
              } else {
                vis++;
              }
              cut = i + 1;
            }
            line = line.slice(0, cut) + dim("...");
          }

          lines.push(line);

          // ── Line 2: active tool timing ─────────────────────────────
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
    }, 3000);
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
  });

  pi.on("before_provider_request", (event) => {
    lastPayload = event.payload as Record<string, any>;
  });

  pi.on("agent_start", async () => {
    agentStartTime = performance.now();
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
      // Immediately refresh the blocked count from audit log
      refreshBlockedCount();
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
