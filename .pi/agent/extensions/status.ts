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
