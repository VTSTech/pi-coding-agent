import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ── Shared utilities (eliminate duplication) ──────────────────────────────
import {
  section, ok, fail, warn, info,
  bytesHuman, msHuman, pct,
} from "../shared/format";
import { MODELS_JSON_PATH, getOllamaBaseUrl, BUILTIN_PROVIDERS, readModelsJson, EXTENSION_VERSION, isLocalProvider } from "../shared/ollama";
import {
  BLOCKED_COMMANDS, BLOCKED_URL_PATTERNS,
  CRITICAL_COMMANDS, EXTENDED_COMMANDS,
  BLOCKED_URL_ALWAYS, BLOCKED_URL_MAX_ONLY,
  getSecurityMode,
  validatePath, isSafeUrl, sanitizeCommand, readRecentAuditEntries,
  AUDIT_LOG_PATH,
} from "../shared/security";
import { readSettings } from "../shared/config-io";
import { debugLog } from "../shared/debug";

// ── Secret redaction ───────────────────────────────────────────────────

const SECRET_KEY_PATTERNS = [
  /key/i, /token/i, /secret/i, /password/i, /credential/i, /auth/i, /apikey/i, /api_key/i,
];

function redactValue(key: string, value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value);
  if (SECRET_KEY_PATTERNS.some(p => p.test(key))) return "[REDACTED]";
  // Also redact values that look like API keys (long strings with no spaces)
  if (value.length > 20 && !value.includes(" ") && /^[A-Za-z0-9_\-+/=]+$/.test(value)) return value.slice(0, 8) + "...";
  return value;
}

/**
 * Diagnostic extension for Pi Coding Agent.
 * Register as /diag slash command AND self_diagnostic tool (so small models can call it).
 * Checks: system resources, Ollama connectivity, models.json validity, extensions, themes, tools, context usage, security.
 */
export default function (pi: ExtensionAPI) {

  // ── core diagnostic logic ────────────────────────────────────────────

  const branding = [
    `  ⚡ Pi Diagnostics v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`,
  ].join("\n");

  /**
   * Run all diagnostic checks and return a formatted report string.
   *
   * @param ctx - Pi framework agent context (typed as `any` because the
   *   ExtensionAPI does not export the concrete context type. The context
   *   provides `ctx.model` (with `id`, `provider`, `contextWindow`,
   *   `maxTokens`), `ctx.getContextUsage()`, and `ctx.ui` properties whose
   *   shapes vary across Pi versions.)
   * @returns A multi-line diagnostic report string.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const ollamaBaseUrl = getOllamaBaseUrl();
    const isRemoteOllama = !isLocalProvider(ollamaBaseUrl);

    if (isRemoteOllama) {
      // Remote Ollama — probe via HTTP instead of CLI
      const ollamaRoot = ollamaBaseUrl.replace(/\/v1\/?$/, "");
      lines.push(info(`Remote Ollama detected: ${ollamaBaseUrl}`));
      try {
        const startTime = Date.now();
        const versionRes = await fetch(`${ollamaRoot}/api/version`, { signal: AbortSignal.timeout(10000) });
        const latency = Date.now() - startTime;
        if (versionRes.ok) {
          const versionData = await versionRes.json();
          ollamaVersion = versionData.version || "unknown";
          ollamaOk = true;
          lines.push(ok(`Remote Ollama running: ${ollamaVersion} (${msHuman(latency)} response time)`));
        } else {
          lines.push(fail(`Remote Ollama returned status ${versionRes.status}`));
        }
      } catch (e: any) {
        lines.push(fail(`Remote Ollama not reachable: ${e.message || "unknown error"}`));
      }

      if (ollamaOk) {
        try {
          const tagsRes = await fetch(`${ollamaRoot}/api/tags`, { signal: AbortSignal.timeout(15000) });
          if (tagsRes.ok) {
            const tagsData = await tagsRes.json();
            ollamaModels = (tagsData.models || []).map((m: any) => m.name || m.model).filter(Boolean);
            lines.push(info(`Available models: ${ollamaModels.length}`));
            ollamaModels.forEach(m => lines.push(info(`  • ${m}`)));
            check(ollamaModels.length > 0, "Models found in Ollama", "No models pulled in Ollama");
          }
        } catch { lines.push(warn("Could not list remote Ollama models")); }

        // Check currently loaded model via /api/ps
        try {
          const psRes = await fetch(`${ollamaRoot}/api/ps`, { signal: AbortSignal.timeout(10000) });
          if (psRes.ok) {
            const psData = await psRes.json();
            const loaded = psData.models || [];
            if (loaded.length > 0) {
              lines.push(info(`Loaded in VRAM: ${loaded[0].name || loaded[0].model || "unknown"}`));
            } else {
              lines.push(info("No model currently loaded in Ollama"));
            }
          }
        } catch (err) { debugLog("diag", "failed to check remote Ollama loaded models", err); }
      }
    } else {
      // Local Ollama — probe via CLI
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
        } catch (err) { debugLog("diag", "failed to check local Ollama loaded models", err); }
      }
    }

    // ── MODELS.JSON ──
    lines.push(section("MODELS.JSON"));
    const agentDir = path.join(os.homedir(), ".pi", "agent");
    let configuredModels: string[] = [];
    const modelsJson = readModelsJson();

    if (modelsJson && Object.keys(modelsJson.providers || {}).length > 0) {
      try {
        const providers = modelsJson.providers || {};
        lines.push(info(`Providers configured: ${Object.keys(providers).length}`));
        for (const [providerName, providerConfig] of Object.entries(providers)) {
          const cfg = providerConfig as any;
          const models: any[] = cfg.models || [];
          lines.push(info(`  ${providerName}: ${cfg.baseUrl || "no baseUrl"}, ${models.length} models`));
          for (const m of models) {
            configuredModels.push(m.id);
            const reasoning = m.reasoning ? " [reasoning]" : "";
            const ctx = m.contextLength ? ` ctx:${(m.contextLength / 1000).toFixed(0)}k` : "";
            lines.push(info(`    • ${m.id}${reasoning}${ctx}`));
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
      lines.push(fail(`models.json not found at ${MODELS_JSON_PATH}`));
      lines.push(info("  → Run /ollama-sync to create it"));
    }

    // ── SETTINGS ──
    lines.push(section("SETTINGS"));
    try {
      const settings = readSettings();
      if (Object.keys(settings).length > 0) {
        lines.push(info("Global settings found:"));
        for (const [key, val] of Object.entries(settings)) {
          lines.push(info(`  ${key}: ${redactValue(key, val)}`));
        }
        check(true, "settings.json valid JSON", "");
      } else {
        lines.push(warn("No global settings.json found (using defaults)"));
      }
    } catch (e: any) {
      lines.push(fail(`settings.json read error: ${e.message}`));
    }

    // ── EXTENSIONS ──
    lines.push(section("EXTENSIONS"));
    const extensionsDir = path.join(agentDir, "extensions");
    const activeTools = pi.getActiveTools();
    const allTools = pi.getAllTools();

    // Built-in Pi tools: read, bash, edit, write — anything beyond that comes from extensions
    const builtinTools = new Set(["read", "bash", "edit", "write"]);
    const extensionToolCount = activeTools.filter(t => !builtinTools.has(t)).length;
    const localExtFiles = fs.existsSync(extensionsDir)
      ? fs.readdirSync(extensionsDir).filter(f => f.endsWith(".ts") || f.endsWith(".js"))
      : [];
    lines.push(info(`Extension files in ${extensionsDir}: ${localExtFiles.length}`));
    localExtFiles.forEach(f => lines.push(info(`  • ${f}`)));
    if (localExtFiles.length > 0) {
      check(true, `${localExtFiles.length} local extension(s) found`);
    } else if (extensionToolCount > 0) {
      lines.push(info(`${extensionToolCount} extension tool(s) loaded from Pi package`));
      check(true, `${extensionToolCount} extension(s) active via Pi package`);
    } else {
      check(false, "", "No extensions found");
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

    // ── SECURITY ──
    lines.push(section("SECURITY"));

    const secMode = getSecurityMode();
    lines.push(info(`Security mode: ${secMode.toUpperCase()}`));

    // a. Command blocklist status (mode-aware)
    const effectiveCmds = secMode === "max" ? BLOCKED_COMMANDS : CRITICAL_COMMANDS;
    const blockedCmdList = Array.from(effectiveCmds).sort();
    lines.push(info(`Command blocklist: ${blockedCmdList.length} commands blocked (${CRITICAL_COMMANDS.size} critical` +
      (secMode === "max" ? ` + ${EXTENDED_COMMANDS.size} extended)` : ")")));
    const exampleCmds = blockedCmdList.filter(c => ["rm", "sudo", "chmod", "curl", "wget", "eval"].includes(c));
    if (exampleCmds.length > 0) {
      lines.push(info(`  Examples: ${exampleCmds.join(", ")}`));
    }
    check(blockedCmdList.length > 0,
      `Command blocklist active (${blockedCmdList.length} rules)`,
      `Command blocklist is EMPTY — security risk!`);

    // b. SSRF protection (mode-aware)
    const effectivePatterns = secMode === "max" ? BLOCKED_URL_PATTERNS : BLOCKED_URL_ALWAYS;
    const blockedPatterns = Array.from(effectivePatterns).sort();
    lines.push(info(`SSRF protection: ${blockedPatterns.length} hostname patterns blocked (${BLOCKED_URL_ALWAYS.size} always` +
      (secMode === "max" ? ` + ${BLOCKED_URL_MAX_ONLY.size} max-only)` : ")")));
    const examplePatterns = blockedPatterns.filter(p =>
      ["localhost", "127.0.0.1", "169.254.169.254", "10.", "192.168.", "internal."].includes(p)
    );
    if (examplePatterns.length > 0) {
      lines.push(info(`  Examples: ${examplePatterns.join(", ")}`));
    }
    check(blockedPatterns.length > 0,
      `SSRF protection active (${blockedPatterns.length} patterns)`,
      `SSRF blocklist is EMPTY — vulnerability risk!`);

    // Test SSRF with sample URLs
    lines.push(info("SSRF validation tests:"));
    const ssrfTests = [
      { url: "http://localhost:8080/api", expectBlocked: secMode === "max" },
      { url: "http://169.254.169.254/latest/meta-data/", expectBlocked: true },
      { url: "http://192.168.1.1/admin", expectBlocked: true },
      { url: "https://api.example.com/data", expectBlocked: false },
    ];
    for (const test of ssrfTests) {
      const result = isSafeUrl(test.url);
      if (test.expectBlocked && !result.safe) {
        lines.push(ok(`  BLOCKED: ${test.url} → ${result.error}`));
      } else if (!test.expectBlocked && result.safe) {
        lines.push(ok(`  ALLOWED: ${test.url}`));
      } else {
        lines.push(fail(`  UNEXPECTED: ${test.url} → safe=${result.safe} (expected blocked=${test.expectBlocked})`));
      }
    }

    // c. Path validation
    lines.push(info("Path validation tests:"));
    const pathTests = [
      { p: "/etc/passwd", expectValid: false },
      { p: "/etc/shadow", expectValid: false },
      { p: "../../etc/hosts", expectValid: false },
      { p: "./test.txt", expectValid: true },
      { p: "/tmp/output.log", expectValid: true },
      { p: process.cwd(), expectValid: true },
    ];
    for (const test of pathTests) {
      const result = validatePath(test.p);
      if (result.valid === test.expectValid) {
        if (test.expectValid) {
          lines.push(ok(`  ALLOWED: ${test.p}`));
        } else {
          lines.push(ok(`  BLOCKED: ${test.p} → ${result.error}`));
        }
      } else {
        lines.push(fail(`  UNEXPECTED: ${test.p} → valid=${result.valid} (expected valid=${test.expectValid})`));
      }
    }

    // d. Injection detection
    lines.push(info("Command injection tests:"));
    const cmdTests = [
      { cmd: "ls; rm -rf /", expectSafe: false },
      { cmd: "sudo chmod 777 /etc/passwd", expectSafe: false },
      { cmd: "curl http://localhost/secret", expectSafe: secMode !== "max" },
      { cmd: "ls -la", expectSafe: true },
      { cmd: "cat README.md", expectSafe: true },
      { cmd: "echo hello", expectSafe: true },
    ];
    for (const test of cmdTests) {
      const result = sanitizeCommand(test.cmd);
      if (result.isSafe === test.expectSafe) {
        if (test.expectSafe) {
          lines.push(ok(`  PASS: "${test.cmd}" → allowed`));
        } else {
          lines.push(ok(`  BLOCKED: "${test.cmd}" → ${result.error}`));
        }
      } else {
        lines.push(fail(`  UNEXPECTED: "${test.cmd}" → safe=${result.isSafe} (expected safe=${test.expectSafe})`));
      }
    }

    // e. Audit log status
    lines.push(info("Audit log status:"));
    const auditEntries = readRecentAuditEntries(50);
    if (fs.existsSync(AUDIT_LOG_PATH)) {
      lines.push(ok(`Audit log exists: ${AUDIT_LOG_PATH}`));
      if (auditEntries.length > 0) {
        lines.push(info(`  Recent entries: ${auditEntries.length} (last 50)`));
        // Show the most recent 3 entries (type and timestamp if available)
        const recentSample = auditEntries.slice(-3);
        for (const entry of recentSample) {
          const entryType = (entry.type ?? entry.action ?? entry.event ?? "unknown").toString();
          const entryTime = (entry.timestamp ?? entry.time ?? "").toString();
          lines.push(info(`  • [${entryTime ? entryTime + "] " : ""}${entryType}`));
        }
      } else {
        lines.push(info("  No audit entries found (log is empty or unparseable)"));
      }
    } else {
      lines.push(warn(`Audit log not found at ${AUDIT_LOG_PATH}`));
      lines.push(info("  → Audit logging will begin when security events occur"));
    }

    // ── MODEL & CONTEXT ──
    lines.push(section("CURRENT SESSION"));
    const model = ctx.model;
    if (model) {
      lines.push(info(`Model: ${model.id || "unknown"}`));
      lines.push(info(`Provider: ${model.provider || "unknown"}`));

      // ── API Mode detection (3-tier: models.json → built-in providers → unknown) ──
      // Uses shared BUILTIN_PROVIDERS registry from shared/ollama.ts.
      const providerName = model.provider || "";
      const userProviderCfg = modelsJson ? (modelsJson.providers || {})[providerName] : null;

      if (userProviderCfg) {
        // Tier 1: User-defined provider from models.json
        const apiMode = userProviderCfg.api || "not set";
        const baseUrl = userProviderCfg.baseUrl || "not set";
        lines.push(info(`API mode: ${apiMode} (models.json)`));
        lines.push(info(`Base URL: ${baseUrl}`));
        if (userProviderCfg.apiKey) {
          lines.push(info(`API key: ****${String(userProviderCfg.apiKey).slice(-4)}`));
        }
      } else if (BUILTIN_PROVIDERS[providerName]) {
        // Tier 2: Known built-in provider
        const builtin = BUILTIN_PROVIDERS[providerName];
        lines.push(info(`API mode: ${builtin.api} (built-in: ${providerName})`));
        lines.push(info(`Base URL: ${builtin.baseUrl}`));
      } else if (providerName) {
        // Tier 3: Unknown provider
        lines.push(info(`API mode: unknown — provider "${providerName}" not in models.json or built-in list`));
      } else {
        lines.push(info(`API mode: unknown — no provider configured`));
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
    description: "Run a full system diagnostic (Ollama, models, extensions, themes, resources, security)",
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
    description: "Run a comprehensive diagnostic check on the Pi environment including system resources, Ollama status, model configuration, extensions, themes, security posture, and current session state. Use this whenever the user asks for a diagnostic, health check, or system status.",
    promptSnippet: "self_diagnostic - run full system diagnostic check",
    promptGuidelines: [
      "When the user asks for a diagnostic, health check, or system test, call self_diagnostic.",
    ],
    parameters: {
      type: "object",
      properties: {},
    },
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