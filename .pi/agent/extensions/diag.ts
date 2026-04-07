import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/**
 * Diagnostic extension for Pi Coding Agent.
 * Register as /diag slash command AND self_diagnostic tool (so small models can call it).
 * Checks: system resources, Ollama connectivity, models.json validity, extensions, themes, tools, context usage.
 */
export default function (pi: ExtensionAPI) {

  // ── helpers ──────────────────────────────────────────────────────────

  function section(title: string): string {
    return `\n── ${title} ${"─".repeat(Math.max(1, 60 - title.length - 4))}`;
  }

  function ok(msg: string): string { return `  ✅ ${msg}`; }
  function fail(msg: string): string { return `  ❌ ${msg}`; }
  function warn(msg: string): string { return `  ⚠️  ${msg}`; }
  function info(msg: string): string { return `  ℹ️  ${msg}`; }

  function bytesHuman(bytes: number): string {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
    return `${bytes.toFixed(1)}${units[i]}`;
  }

  function msHuman(ms: number): string {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  }

  function pct(used: number, total: number): string {
    return `${((used / total) * 100).toFixed(1)}%`;
  }

  function padRight(s: string, n: number): string {
    return s + " ".repeat(Math.max(0, n - s.length));
  }

  // ── core diagnostic logic ────────────────────────────────────────────

  const branding = [
    `  ⚡ Pi Diagnostics v1.0`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`,
  ].join("\n");

  async function runDiagnostics(ctx: any): Promise<string> {
    const lines: string[] = [];
    let passCount = 0;
    let failCount = 0;
    let warnCount = 0;

    lines.push(branding);

    const check = (condition: boolean, passMsg: string, failMsg: string) => {
      if (condition) { lines.push(ok(passMsg)); passCount++; }
      else { lines.push(fail(failMsg)); failCount++; }
    };

    const warning = (condition: boolean, msg: string) => {
      if (condition) { lines.push(warn(msg)); warnCount++; }
    };

    // ── SYSTEM ──
    lines.push(section("SYSTEM"));
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPct = pct(usedMem, totalMem);

    lines.push(info(`OS: ${os.type()} ${os.release()} ${os.arch()}`));
    lines.push(info(`CPU: ${cpus.length}x ${cpus[0]?.model || "unknown"}`));
    lines.push(info(`RAM: ${bytesHuman(usedMem)} / ${bytesHuman(totalMem)} (${memPct})`));
    lines.push(info(`Uptime: ${msHuman(os.uptime() * 1000)}`));
    lines.push(info(`Node.js: ${process.version}`));

    check(totalMem >= 4 * 1024 * 1024 * 1024,
      `Total RAM: ${bytesHuman(totalMem)} (≥4GB)`,
      `Total RAM: ${bytesHuman(totalMem)} — LOW (<4GB), may struggle with models`);
    warning(totalMem > 0 && (usedMem / totalMem) > 0.85,
      `RAM usage ${memPct} — HIGH, close apps or reduce model size`);
    warning(cpus.length < 2, `Only ${cpus.length} CPU core(s), inference will be slow`);

    // ── DISK ──
    lines.push(section("DISK"));
    try {
      const dfResult = await pi.exec("df", ["-h", "/"], { timeout: 5000 });
      if (dfResult.code === 0) {
        const dfLines = dfResult.stdout.trim().split("\n");
        if (dfLines.length > 1) {
          const parts = dfLines[1].trim().split(/\s+/);
          lines.push(info(`Mount: ${parts[0] || "/"}`));
          lines.push(info(`Size: ${parts[1]}, Used: ${parts[2]}, Avail: ${parts[3]}, Use%: ${parts[4]}`));
          const usePct = parseInt(parts[4]) || 0;
          warning(usePct > 90, `Disk usage ${parts[4]} — LOW SPACE`);
        }
      }
    } catch { lines.push(warn("Could not read disk info")); }

    // ── OLLAMA ──
    lines.push(section("OLLAMA"));
    let ollamaOk = false;
    let ollamaModels: string[] = [];
    let ollamaVersion = "unknown";

    try {
      const startTime = Date.now();
      const versionResult = await pi.exec("ollama", ["--version"], { timeout: 10000 });
      const latency = Date.now() - startTime;
      if (versionResult.code === 0) {
        ollamaVersion = versionResult.stdout.trim();
        ollamaOk = true;
        lines.push(ok(`Ollama running: ${ollamaVersion} (${msHuman(latency)} response time)`));
      } else {
        lines.push(fail(`Ollama error: ${versionResult.stderr.trim() || "non-zero exit code"}`));
      }
    } catch (e: any) {
      lines.push(fail(`Ollama not reachable: ${e.message || "unknown error"}`));
    }

    if (ollamaOk) {
      try {
        const listResult = await pi.exec("ollama", ["list"], { timeout: 15000 });
        if (listResult.code === 0) {
          const modelLines = listResult.stdout.trim().split("\n").slice(1); // skip header
          ollamaModels = modelLines
            .map(l => l.trim().split(/\s+/)[0])
            .filter(Boolean);
          lines.push(info(`Available models: ${ollamaModels.length}`));
          ollamaModels.forEach(m => lines.push(info(`  • ${m}`)));
          check(ollamaModels.length > 0, "Models found in Ollama", "No models pulled in Ollama");
        }
      } catch { lines.push(warn("Could not list Ollama models")); }

      // Check currently loaded model
      try {
        const psResult = await pi.exec("ollama", ["ps"], { timeout: 10000 });
        if (psResult.code === 0) {
          const psLines = psResult.stdout.trim().split("\n").slice(1);
          if (psLines.length > 0) {
            const loadedModel = psLines[0].trim().split(/\s+/)[0];
            lines.push(info(`Loaded in VRAM: ${loadedModel}`));
          } else {
            lines.push(warn("No model currently loaded in Ollama"));
          }
        }
      } catch { /* ignore */ }
    }

    // ── MODELS.JSON ──
    lines.push(section("MODELS.JSON"));
    const agentDir = path.join(os.homedir(), ".pi", "agent");
    const modelsJsonPath = path.join(agentDir, "models.json");
    let configuredModels: string[] = [];
    let modelsJson: any = null;

    if (fs.existsSync(modelsJsonPath)) {
      try {
        modelsJson = JSON.parse(fs.readFileSync(modelsJsonPath, "utf-8"));
        const providers = modelsJson.providers || {};
        lines.push(info(`Providers configured: ${Object.keys(providers).length}`));
        for (const [providerName, providerConfig] of Object.entries(providers)) {
          const cfg = providerConfig as any;
          const models: any[] = cfg.models || [];
          lines.push(info(`  ${providerName}: ${cfg.baseUrl || "no baseUrl"}, ${models.length} models`));
          for (const m of models) {
            configuredModels.push(m.id);
            const reasoning = m.reasoning ? " [reasoning]" : "";
            lines.push(info(`    • ${m.id}${reasoning}`));
          }
        }
        check(configuredModels.length > 0,
          `${configuredModels.length} model(s) configured`,
          "No models in models.json");

        // Cross-reference with Ollama
        if (ollamaModels.length > 0) {
          const missing = ollamaModels.filter(m => !configuredModels.includes(m));
          const extra = configuredModels.filter(m => !ollamaModels.includes(m));
          if (missing.length > 0) {
            lines.push(warn(`${missing.length} Ollama model(s) not in models.json: ${missing.join(", ")}`));
            lines.push(info("  → Run /ollama-sync to auto-sync"));
          }
          if (extra.length > 0) {
            lines.push(warn(`${extra.length} model(s) in models.json but not pulled in Ollama: ${extra.join(", ")}`));
          }
          if (missing.length === 0 && extra.length === 0) {
            lines.push(ok("models.json matches Ollama exactly"));
            passCount++;
          }
        }
      } catch (e: any) {
        lines.push(fail(`models.json parse error: ${e.message}`));
      }
    } else {
      lines.push(fail(`models.json not found at ${modelsJsonPath}`));
      lines.push(info("  → Run /ollama-sync to create it"));
    }

    // ── SETTINGS ──
    lines.push(section("SETTINGS"));
    const settingsPath = path.join(agentDir, "settings.json");
    if (fs.existsSync(settingsPath)) {
      try {
        const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
        lines.push(info("Global settings found:"));
        for (const [key, val] of Object.entries(settings)) {
          lines.push(info(`  ${key}: ${JSON.stringify(val)}`));
        }
        check(true, "settings.json valid JSON", "");
      } catch (e: any) {
        lines.push(fail(`settings.json parse error: ${e.message}`));
      }
    } else {
      lines.push(warn("No global settings.json found (using defaults)"));
    }

    // ── EXTENSIONS ──
    lines.push(section("EXTENSIONS"));
    const extensionsDir = path.join(agentDir, "extensions");
    const activeTools = pi.getActiveTools();
    const allTools = pi.getAllTools();

    if (fs.existsSync(extensionsDir)) {
      const extFiles = fs.readdirSync(extensionsDir).filter(f =>
        f.endsWith(".ts") || f.endsWith(".js")
      );
      lines.push(info(`Extension files in ${extensionsDir}: ${extFiles.length}`));
      extFiles.forEach(f => lines.push(info(`  • ${f}`)));
      check(extFiles.length > 0, `${extFiles.length} extension(s) found`, "No extensions found");
    } else {
      lines.push(warn(`Extensions directory not found: ${extensionsDir}`));
    }

    lines.push(info(`Active tools: ${activeTools.length}`));
    if (activeTools.length > 0) {
      activeTools.forEach(t => lines.push(info(`  • ${t}`)));
    }
    lines.push(info(`Registered tools (all): ${allTools.length}`));

    // ── THEMES ──
    lines.push(section("THEMES"));
    const themesDir = path.join(agentDir, "themes");
    if (fs.existsSync(themesDir)) {
      const themeFiles = fs.readdirSync(themesDir).filter(f =>
        f.endsWith(".json")
      );
      lines.push(info(`Theme files: ${themeFiles.length}`));
      themeFiles.forEach(f => {
        try {
          const theme = JSON.parse(fs.readFileSync(path.join(themesDir, f), "utf-8"));
          lines.push(info(`  • ${f} (name: "${theme.name || "unnamed"}")`));
        } catch {
          lines.push(warn(`  • ${f} — INVALID JSON`));
        }
      });
    } else {
      lines.push(warn(`Themes directory not found: ${themesDir}`));
    }

    // ── MODEL & CONTEXT ──
    lines.push(section("CURRENT SESSION"));
    const model = ctx.model;
    if (model) {
      lines.push(info(`Model: ${model.id || "unknown"}`));
      lines.push(info(`Provider: ${model.provider || "unknown"}`));

      // ── API Mode (reuse modelsJson from MODELS.JSON section if parsed) ──
      if (modelsJson) {
        const providerCfg = (modelsJson.providers || {})[model.provider];
        if (providerCfg) {
          const apiMode = providerCfg.api || "not set";
          const baseUrl = providerCfg.baseUrl || "not set";
          lines.push(info(`API mode: ${apiMode}`));
          lines.push(info(`Base URL: ${baseUrl}`));
          if (providerCfg.apiKey) {
            lines.push(info(`API key: ****${String(providerCfg.apiKey).slice(-4)}`));
          }
        } else {
          lines.push(info(`API mode: unknown — provider "${model.provider}" not found in models.json`));
        }
      } else if (fs.existsSync(modelsJsonPath)) {
        lines.push(info(`API mode: unknown — could not parse models.json`));
      } else {
        lines.push(info(`API mode: unknown — models.json not found`));
      }

      lines.push(info(`Context window: ${model.contextWindow ?? "unknown"}`));
      lines.push(info(`Max tokens: ${model.maxTokens ?? "unknown"}`));
    } else {
      lines.push(warn("No model selected"));
    }

    const usage = ctx.getContextUsage?.();
    if (usage && usage.contextWindow > 0) {
      lines.push(info(`Context: ${usage.tokens ?? "?"} / ${usage.contextWindow} tokens (${((usage.tokens / usage.contextWindow) * 100).toFixed(1)}%)`));
    }

    const thinking = pi.getThinkingLevel();
    lines.push(info(`Thinking level: ${thinking}`));

    // ── SUMMARY ──
    lines.push(section("SUMMARY"));
    lines.push(info(`Passed: ${passCount}  Failed: ${failCount}  Warnings: ${warnCount}`));
    if (failCount === 0) {
      lines.push(ok("All critical checks passed! 🎉"));
    } else {
      lines.push(fail(`${failCount} check(s) failed — see above for details`));
    }
    if (warnCount > 0) {
      lines.push(warn(`${warnCount} warning(s) — non-critical but worth addressing`));
    }
    lines.push(branding);

    return lines.join("\n");
  }

  // ── Register /diag slash command ─────────────────────────────────────

  pi.registerCommand("diag", {
    description: "Run a full system diagnostic (Ollama, models, extensions, themes, resources)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("Diagnostic requires TUI mode", "error");
        return;
      }
      ctx.ui.notify("Running diagnostic...", "info");
      try {
        const report = await runDiagnostics(ctx);
        pi.sendMessage({
          customType: "diagnostic-report",
          content: report,
          display: { type: "content", content: report },
          details: { timestamp: new Date().toISOString() },
        });
      } catch (e: any) {
        ctx.ui.notify(`Diagnostic failed: ${e.message}`, "error");
      }
    },
  });

  // ── Register self_diagnostic tool (LLM-callable) ────────────────────

  pi.registerTool({
    name: "self_diagnostic",
    label: "Self Diagnostic",
    description: "Run a comprehensive diagnostic check on the Pi environment including system resources, Ollama status, model configuration, extensions, themes, and current session state. Use this whenever the user asks for a diagnostic, health check, or system status.",
    promptSnippet: "self_diagnostic - run full system diagnostic check",
    promptGuidelines: [
      "When the user asks for a diagnostic, health check, or system test, call self_diagnostic.",
    ],
    parameters: {} as any,
    execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
      try {
        const report = await runDiagnostics(ctx);
        return {
          content: [{ type: "text", text: report }],
          isError: false,
        } as AgentToolResult;
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Diagnostic failed: ${e.message}` }],
          isError: true,
        } as AgentToolResult;
      }
    },
  });
}