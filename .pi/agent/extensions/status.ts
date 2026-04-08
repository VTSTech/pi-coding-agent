/**
 * System Monitor — Pi Coding Agent Extension
 * Replaces the default footer with a unified 2-line status bar:
 *   Line 1: pwd · git branch · model · thinking level · context%
 *   Line 2: CPU% · RAM · Swap · VRAM (Ollama loaded) · response time · params
 * Metrics update every 3 seconds. Restores default footer on session shutdown.
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

const MODELS_JSON_PATH = path.join(os.homedir(), ".pi", "agent", "models.json");

function getOllamaBaseUrl(): string {
  try {
    if (fs.existsSync(MODELS_JSON_PATH)) {
      const raw = fs.readFileSync(MODELS_JSON_PATH, "utf-8");
      const config = JSON.parse(raw);
      const baseUrl = config?.providers?.["ollama"]?.baseUrl;
      if (baseUrl) return baseUrl.replace(/\/v1\/?$/, "");
    }
  } catch { /* ignore */ }
  if (process.env.OLLAMA_HOST) {
    return `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, "")}`;
  }
  return "http://localhost:11434";
}

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

  function fmtBytes(b: number): string {
    if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)}G`;
    if (b >= 1048576) return `${(b / 1048576).toFixed(0)}M`;
    return `${(b / 1024).toFixed(0)}K`;
  }

  function fmtDur(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
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

    if (currentCtx) {
      footerModel = currentCtx.model?.id || "";
      footerThinking = pi.getThinkingLevel?.() ?? "";
      const usage = currentCtx.getContextUsage?.();
      if (usage && usage.contextWindow > 0) {
        const pct = ((usage.tokens / usage.contextWindow) * 100).toFixed(1);
        footerCtxPct = `${pct}%/${(usage.contextWindow / 1000).toFixed(0)}k`;
      } else {
        footerCtxPct = "";
      }
    }
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
      const sep = dim(" \u00b7 ");

      return {
        render(width: number): string[] {
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
          if (footerCtxPct) parts.push(footerCtxPct);

          parts.push(dim(`CPU ${cpuUsage.toFixed(0)}%`));
          parts.push(`RAM ${fmtBytes(memUsed)}/${fmtBytes(memTotal)}`);
          if (hasSwap && swapUsed > 0) {
            parts.push(`Swap ${fmtBytes(swapUsed)}/${fmtBytes(swapTotal)}`);
          }
          //if (ollamaLoaded) parts.push(`${ollamaLoaded}`);
          if (lastResponseTime !== null) parts.push(`Resp ${fmtDur(lastResponseTime)}`);
          if (lastPayload) {
            const params = extractParams(lastPayload);
            if (params.length > 0) parts.push(...params.map(p => dim(p)));
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

          return [line];
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
    updateMetrics();
    if (tuiRef) tuiRef.requestRender();
  });
}