/**
 * System Monitor — Pi Coding Agent Extension
 * Displays CPU%, RAM usage, response time, and generation parameters
 * in the Pi status bar. Updates every 3 seconds.
 *
 * Written by VTSTech
 * GitHub: https://github.com/VTSTech
 * Website: www.vts-tech.org
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import os from "node:os";
import { execSync } from "node:child_process";

export default function (pi: ExtensionAPI) {
  let lastResponseTime: number | null = null;
  let agentStartTime: number | null = null;
  let updateInterval: ReturnType<typeof setInterval> | null = null;
  let currentCtx: any = null;
  let prevCpuInfo = getCpuSnapshot();
  let lastPayload: Record<string, any> | null = null;

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
  const OLLAMA_LOADED_INTERVAL = 15000; // only check every 15s to avoid spamming

  function getOllamaLoadedModel(): string {
    const now = Date.now();
    if (now - ollamaLoadedLastCheck < OLLAMA_LOADED_INTERVAL) return ollamaLoadedCache;
    ollamaLoadedLastCheck = now;
    try {
      const out = execSync("ollama ps --format json 2>/dev/null", { encoding: "utf-8", timeout: 5000 });
      if (out.trim()) {
        const data = JSON.parse(out.trim());
        if (Array.isArray(data) && data.length > 0) {
          ollamaLoadedCache = data[0].name || data[0].model || "unknown";
          return ollamaLoadedCache;
        }
      }
    } catch {
      try {
        // fallback to text output
        const out = execSync("ollama ps 2>/dev/null", { encoding: "utf-8", timeout: 5000 });
        const lines = out.trim().split("\n").slice(1);
        if (lines.length > 0) {
          ollamaLoadedCache = lines[0].trim().split(/\s+/)[0];
          return ollamaLoadedCache;
        }
      } catch { /* ignore */ }
    }
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

  function updateStatus() {
    if (!currentCtx) return;
    const cpu = getCpuUsage();
    const mem = getMem();
    const parts: string[] = [];
    parts.push(`CPU ${cpu.toFixed(0)}%`);
    parts.push(`RAM ${fmtBytes(mem.used)}/${fmtBytes(mem.total)}`);

    // Swap — only show if swap is being used
    const swap = getSwap();
    if (swap && swap.used > 0) {
      parts.push(`Swap ${fmtBytes(swap.used)}/${fmtBytes(swap.total)}`);
    }

    // Ollama loaded model
    const loaded = getOllamaLoadedModel();
    if (loaded) parts.push(`LOADED:${loaded}`);

    if (lastResponseTime !== null) parts.push(`Resp ${fmtDur(lastResponseTime)}`);
    if (lastPayload) {
      const params = extractParams(lastPayload);
      if (params.length > 0) parts.push(params.join(" "));
    }
    currentCtx.ui.setStatus("sysmon", parts.join(" · "));
  }

  pi.on("session_start", async (_event, ctx) => {
    currentCtx = ctx;
    prevCpuInfo = getCpuSnapshot();
    updateStatus();
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(updateStatus, 3000);
  });

  pi.on("session_shutdown", async () => {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = null;
    currentCtx = null;
  });

  pi.on("before_provider_request", (event, _ctx) => {
    lastPayload = event.payload as Record<string, any>;
  });

  pi.on("agent_start", async (_event, ctx) => {
    agentStartTime = performance.now();
    ctx.ui.setStatus("sysmon", "thinking...");
  });

  pi.on("agent_end", async () => {
    if (agentStartTime !== null) {
      lastResponseTime = performance.now() - agentStartTime;
      agentStartTime = null;
    }
    updateStatus();
  });
}
