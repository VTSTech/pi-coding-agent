// .build-npm/diag/diag.temp.ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  section,
  ok,
  fail,
  warn,
  info,
  bytesHuman,
  msHuman,
  pct
} from "@vtstech/pi-shared/format";
import { MODELS_JSON_PATH, getOllamaBaseUrl, BUILTIN_PROVIDERS, readModelsJson, EXTENSION_VERSION } from "@vtstech/pi-shared/ollama";
import {
  BLOCKED_COMMANDS,
  BLOCKED_URL_PATTERNS,
  validatePath,
  isSafeUrl,
  sanitizeCommand,
  readRecentAuditEntries,
  AUDIT_LOG_PATH
} from "@vtstech/pi-shared/security";
function diag_temp_default(pi) {
  const branding = [
    `  \u26A1 Pi Diagnostics v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`
  ].join("\n");
  async function runDiagnostics(ctx) {
    const lines = [];
    let passCount = 0;
    let failCount = 0;
    let warnCount = 0;
    lines.push(branding);
    const check = (condition, passMsg, failMsg) => {
      if (condition) {
        lines.push(ok(passMsg));
        passCount++;
      } else {
        lines.push(fail(failMsg));
        failCount++;
      }
    };
    const warning = (condition, msg) => {
      if (condition) {
        lines.push(warn(msg));
        warnCount++;
      }
    };
    lines.push(section("SYSTEM"));
    const cpus2 = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memPct = pct(usedMem, totalMem);
    lines.push(info(`OS: ${os.type()} ${os.release()} ${os.arch()}`));
    lines.push(info(`CPU: ${cpus2.length}x ${cpus2[0]?.model || "unknown"}`));
    lines.push(info(`RAM: ${bytesHuman(usedMem)} / ${bytesHuman(totalMem)} (${memPct})`));
    lines.push(info(`Uptime: ${msHuman(os.uptime() * 1e3)}`));
    lines.push(info(`Node.js: ${process.version}`));
    check(
      totalMem >= 4 * 1024 * 1024 * 1024,
      `Total RAM: ${bytesHuman(totalMem)} (\u22654GB)`,
      `Total RAM: ${bytesHuman(totalMem)} \u2014 LOW (<4GB), may struggle with models`
    );
    warning(
      totalMem > 0 && usedMem / totalMem > 0.85,
      `RAM usage ${memPct} \u2014 HIGH, close apps or reduce model size`
    );
    warning(cpus2.length < 2, `Only ${cpus2.length} CPU core(s), inference will be slow`);
    lines.push(section("DISK"));
    try {
      const dfResult = await pi.exec("df", ["-h", "/"], { timeout: 5e3 });
      if (dfResult.code === 0) {
        const dfLines = dfResult.stdout.trim().split("\n");
        if (dfLines.length > 1) {
          const parts = dfLines[1].trim().split(/\s+/);
          lines.push(info(`Mount: ${parts[0] || "/"}`));
          lines.push(info(`Size: ${parts[1]}, Used: ${parts[2]}, Avail: ${parts[3]}, Use%: ${parts[4]}`));
          const usePct = parseInt(parts[4]) || 0;
          warning(usePct > 90, `Disk usage ${parts[4]} \u2014 LOW SPACE`);
        }
      }
    } catch {
      lines.push(warn("Could not read disk info"));
    }
    lines.push(section("OLLAMA"));
    let ollamaOk = false;
    let ollamaModels = [];
    let ollamaVersion = "unknown";
    const ollamaBaseUrl = getOllamaBaseUrl();
    const isRemoteOllama = !ollamaBaseUrl.includes("localhost") && !ollamaBaseUrl.includes("127.0.0.1");
    if (isRemoteOllama) {
      const ollamaRoot = ollamaBaseUrl.replace(/\/v1\/?$/, "");
      lines.push(info(`Remote Ollama detected: ${ollamaBaseUrl}`));
      try {
        const startTime = Date.now();
        const versionRes = await fetch(`${ollamaRoot}/api/version`, { signal: AbortSignal.timeout(1e4) });
        const latency = Date.now() - startTime;
        if (versionRes.ok) {
          const versionData = await versionRes.json();
          ollamaVersion = versionData.version || "unknown";
          ollamaOk = true;
          lines.push(ok(`Remote Ollama running: ${ollamaVersion} (${msHuman(latency)} response time)`));
        } else {
          lines.push(fail(`Remote Ollama returned status ${versionRes.status}`));
        }
      } catch (e) {
        lines.push(fail(`Remote Ollama not reachable: ${e.message || "unknown error"}`));
      }
      if (ollamaOk) {
        try {
          const tagsRes = await fetch(`${ollamaRoot}/api/tags`, { signal: AbortSignal.timeout(15e3) });
          if (tagsRes.ok) {
            const tagsData = await tagsRes.json();
            ollamaModels = (tagsData.models || []).map((m) => m.name || m.model).filter(Boolean);
            lines.push(info(`Available models: ${ollamaModels.length}`));
            ollamaModels.forEach((m) => lines.push(info(`  \u2022 ${m}`)));
            check(ollamaModels.length > 0, "Models found in Ollama", "No models pulled in Ollama");
          }
        } catch {
          lines.push(warn("Could not list remote Ollama models"));
        }
        try {
          const psRes = await fetch(`${ollamaRoot}/api/ps`, { signal: AbortSignal.timeout(1e4) });
          if (psRes.ok) {
            const psData = await psRes.json();
            const loaded = psData.models || [];
            if (loaded.length > 0) {
              lines.push(info(`Loaded in VRAM: ${loaded[0].name || loaded[0].model || "unknown"}`));
            } else {
              lines.push(info("No model currently loaded in Ollama"));
            }
          }
        } catch {
        }
      }
    } else {
      try {
        const startTime = Date.now();
        const versionResult = await pi.exec("ollama", ["--version"], { timeout: 1e4 });
        const latency = Date.now() - startTime;
        if (versionResult.code === 0) {
          ollamaVersion = versionResult.stdout.trim();
          ollamaOk = true;
          lines.push(ok(`Ollama running: ${ollamaVersion} (${msHuman(latency)} response time)`));
        } else {
          lines.push(fail(`Ollama error: ${versionResult.stderr.trim() || "non-zero exit code"}`));
        }
      } catch (e) {
        lines.push(fail(`Ollama not reachable: ${e.message || "unknown error"}`));
      }
      if (ollamaOk) {
        try {
          const listResult = await pi.exec("ollama", ["list"], { timeout: 15e3 });
          if (listResult.code === 0) {
            const modelLines = listResult.stdout.trim().split("\n").slice(1);
            ollamaModels = modelLines.map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
            lines.push(info(`Available models: ${ollamaModels.length}`));
            ollamaModels.forEach((m) => lines.push(info(`  \u2022 ${m}`)));
            check(ollamaModels.length > 0, "Models found in Ollama", "No models pulled in Ollama");
          }
        } catch {
          lines.push(warn("Could not list Ollama models"));
        }
        try {
          const psResult = await pi.exec("ollama", ["ps"], { timeout: 1e4 });
          if (psResult.code === 0) {
            const psLines = psResult.stdout.trim().split("\n").slice(1);
            if (psLines.length > 0) {
              const loadedModel = psLines[0].trim().split(/\s+/)[0];
              lines.push(info(`Loaded in VRAM: ${loadedModel}`));
            } else {
              lines.push(warn("No model currently loaded in Ollama"));
            }
          }
        } catch {
        }
      }
    }
    lines.push(section("MODELS.JSON"));
    const agentDir = path.join(os.homedir(), ".pi", "agent");
    let configuredModels = [];
    const modelsJson = readModelsJson();
    if (modelsJson && Object.keys(modelsJson.providers || {}).length > 0) {
      try {
        const providers = modelsJson.providers || {};
        lines.push(info(`Providers configured: ${Object.keys(providers).length}`));
        for (const [providerName, providerConfig] of Object.entries(providers)) {
          const cfg = providerConfig;
          const models = cfg.models || [];
          lines.push(info(`  ${providerName}: ${cfg.baseUrl || "no baseUrl"}, ${models.length} models`));
          for (const m of models) {
            configuredModels.push(m.id);
            const reasoning = m.reasoning ? " [reasoning]" : "";
            const ctx2 = m.contextLength ? ` ctx:${(m.contextLength / 1e3).toFixed(0)}k` : "";
            lines.push(info(`    \u2022 ${m.id}${reasoning}${ctx2}`));
          }
        }
        check(
          configuredModels.length > 0,
          `${configuredModels.length} model(s) configured`,
          "No models in models.json"
        );
        if (ollamaModels.length > 0) {
          const missing = ollamaModels.filter((m) => !configuredModels.includes(m));
          const extra = configuredModels.filter((m) => !ollamaModels.includes(m));
          if (missing.length > 0) {
            lines.push(warn(`${missing.length} Ollama model(s) not in models.json: ${missing.join(", ")}`));
            lines.push(info("  \u2192 Run /ollama-sync to auto-sync"));
          }
          if (extra.length > 0) {
            lines.push(warn(`${extra.length} model(s) in models.json but not pulled in Ollama: ${extra.join(", ")}`));
          }
          if (missing.length === 0 && extra.length === 0) {
            lines.push(ok("models.json matches Ollama exactly"));
            passCount++;
          }
        }
      } catch (e) {
        lines.push(fail(`models.json parse error: ${e.message}`));
      }
    } else {
      lines.push(fail(`models.json not found at ${MODELS_JSON_PATH}`));
      lines.push(info("  \u2192 Run /ollama-sync to create it"));
    }
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
      } catch (e) {
        lines.push(fail(`settings.json parse error: ${e.message}`));
      }
    } else {
      lines.push(warn("No global settings.json found (using defaults)"));
    }
    lines.push(section("EXTENSIONS"));
    const extensionsDir = path.join(agentDir, "extensions");
    const activeTools = pi.getActiveTools();
    const allTools = pi.getAllTools();
    const builtinTools = /* @__PURE__ */ new Set(["read", "bash", "edit", "write"]);
    const extensionToolCount = activeTools.filter((t) => !builtinTools.has(t)).length;
    const localExtFiles = fs.existsSync(extensionsDir) ? fs.readdirSync(extensionsDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js")) : [];
    lines.push(info(`Extension files in ${extensionsDir}: ${localExtFiles.length}`));
    localExtFiles.forEach((f) => lines.push(info(`  \u2022 ${f}`)));
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
      activeTools.forEach((t) => lines.push(info(`  \u2022 ${t}`)));
    }
    lines.push(info(`Registered tools (all): ${allTools.length}`));
    lines.push(section("THEMES"));
    const themesDir = path.join(agentDir, "themes");
    if (fs.existsSync(themesDir)) {
      const themeFiles = fs.readdirSync(themesDir).filter(
        (f) => f.endsWith(".json")
      );
      lines.push(info(`Theme files: ${themeFiles.length}`));
      themeFiles.forEach((f) => {
        try {
          const theme = JSON.parse(fs.readFileSync(path.join(themesDir, f), "utf-8"));
          lines.push(info(`  \u2022 ${f} (name: "${theme.name || "unnamed"}")`));
        } catch {
          lines.push(warn(`  \u2022 ${f} \u2014 INVALID JSON`));
        }
      });
    } else {
      lines.push(warn(`Themes directory not found: ${themesDir}`));
    }
    lines.push(section("SECURITY"));
    const blockedCmdList = Array.from(BLOCKED_COMMANDS).sort();
    lines.push(info(`Command blocklist: ${blockedCmdList.length} commands blocked`));
    const exampleCmds = blockedCmdList.filter((c) => ["rm", "sudo", "chmod", "curl", "wget", "eval"].includes(c));
    if (exampleCmds.length > 0) {
      lines.push(info(`  Examples: ${exampleCmds.join(", ")}`));
    }
    check(
      blockedCmdList.length > 0,
      `Command blocklist active (${blockedCmdList.length} rules)`,
      `Command blocklist is EMPTY \u2014 security risk!`
    );
    const blockedPatterns = Array.from(BLOCKED_URL_PATTERNS).sort();
    lines.push(info(`SSRF protection: ${blockedPatterns.length} hostname patterns blocked`));
    const examplePatterns = blockedPatterns.filter(
      (p) => ["localhost", "127.0.0.1", "169.254.169.254", "10.", "192.168.", "internal."].includes(p)
    );
    if (examplePatterns.length > 0) {
      lines.push(info(`  Examples: ${examplePatterns.join(", ")}`));
    }
    check(
      blockedPatterns.length > 0,
      `SSRF protection active (${blockedPatterns.length} patterns)`,
      `SSRF blocklist is EMPTY \u2014 vulnerability risk!`
    );
    lines.push(info("SSRF validation tests:"));
    const ssrfTests = [
      { url: "http://localhost:8080/api", expectBlocked: true },
      { url: "http://169.254.169.254/latest/meta-data/", expectBlocked: true },
      { url: "http://192.168.1.1/admin", expectBlocked: true },
      { url: "https://api.example.com/data", expectBlocked: false }
    ];
    for (const test of ssrfTests) {
      const result = isSafeUrl(test.url);
      if (test.expectBlocked && !result.safe) {
        lines.push(ok(`  BLOCKED: ${test.url} \u2192 ${result.error}`));
      } else if (!test.expectBlocked && result.safe) {
        lines.push(ok(`  ALLOWED: ${test.url}`));
      } else {
        lines.push(fail(`  UNEXPECTED: ${test.url} \u2192 safe=${result.safe} (expected blocked=${test.expectBlocked})`));
      }
    }
    lines.push(info("Path validation tests:"));
    const pathTests = [
      { p: "/etc/passwd", expectValid: false },
      { p: "/etc/shadow", expectValid: false },
      { p: "../../etc/hosts", expectValid: false },
      { p: "./test.txt", expectValid: true },
      { p: "/tmp/output.log", expectValid: true },
      { p: process.cwd(), expectValid: true }
    ];
    for (const test of pathTests) {
      const result = validatePath(test.p);
      if (result.valid === test.expectValid) {
        if (test.expectValid) {
          lines.push(ok(`  ALLOWED: ${test.p}`));
        } else {
          lines.push(ok(`  BLOCKED: ${test.p} \u2192 ${result.error}`));
        }
      } else {
        lines.push(fail(`  UNEXPECTED: ${test.p} \u2192 valid=${result.valid} (expected valid=${test.expectValid})`));
      }
    }
    lines.push(info("Command injection tests:"));
    const cmdTests = [
      { cmd: "ls; rm -rf /", expectSafe: false },
      { cmd: "sudo chmod 777 /etc/passwd", expectSafe: false },
      { cmd: "curl http://localhost/secret", expectSafe: false },
      { cmd: "ls -la", expectSafe: true },
      { cmd: "cat README.md", expectSafe: true },
      { cmd: "echo hello", expectSafe: true }
    ];
    for (const test of cmdTests) {
      const result = sanitizeCommand(test.cmd);
      if (result.isSafe === test.expectSafe) {
        if (test.expectSafe) {
          lines.push(ok(`  PASS: "${test.cmd}" \u2192 allowed`));
        } else {
          lines.push(ok(`  BLOCKED: "${test.cmd}" \u2192 ${result.error}`));
        }
      } else {
        lines.push(fail(`  UNEXPECTED: "${test.cmd}" \u2192 safe=${result.isSafe} (expected safe=${test.expectSafe})`));
      }
    }
    lines.push(info("Audit log status:"));
    const auditEntries = readRecentAuditEntries(50);
    if (fs.existsSync(AUDIT_LOG_PATH)) {
      lines.push(ok(`Audit log exists: ${AUDIT_LOG_PATH}`));
      if (auditEntries.length > 0) {
        lines.push(info(`  Recent entries: ${auditEntries.length} (last 50)`));
        const recentSample = auditEntries.slice(-3);
        for (const entry of recentSample) {
          const entryType = (entry.type ?? entry.action ?? entry.event ?? "unknown").toString();
          const entryTime = (entry.timestamp ?? entry.time ?? "").toString();
          lines.push(info(`  \u2022 [${entryTime ? entryTime + "] " : ""}${entryType}`));
        }
      } else {
        lines.push(info("  No audit entries found (log is empty or unparseable)"));
      }
    } else {
      lines.push(warn(`Audit log not found at ${AUDIT_LOG_PATH}`));
      lines.push(info("  \u2192 Audit logging will begin when security events occur"));
    }
    lines.push(section("CURRENT SESSION"));
    const model = ctx.model;
    if (model) {
      lines.push(info(`Model: ${model.id || "unknown"}`));
      lines.push(info(`Provider: ${model.provider || "unknown"}`));
      const providerName = model.provider || "";
      const userProviderCfg = modelsJson ? (modelsJson.providers || {})[providerName] : null;
      if (userProviderCfg) {
        const apiMode = userProviderCfg.api || "not set";
        const baseUrl = userProviderCfg.baseUrl || "not set";
        lines.push(info(`API mode: ${apiMode} (models.json)`));
        lines.push(info(`Base URL: ${baseUrl}`));
        if (userProviderCfg.apiKey) {
          lines.push(info(`API key: ****${String(userProviderCfg.apiKey).slice(-4)}`));
        }
      } else if (BUILTIN_PROVIDERS[providerName]) {
        const builtin = BUILTIN_PROVIDERS[providerName];
        lines.push(info(`API mode: ${builtin.api} (built-in: ${providerName})`));
        lines.push(info(`Base URL: ${builtin.baseUrl}`));
      } else if (providerName) {
        lines.push(info(`API mode: unknown \u2014 provider "${providerName}" not in models.json or built-in list`));
      } else {
        lines.push(info(`API mode: unknown \u2014 no provider configured`));
      }
      lines.push(info(`Context window: ${model.contextWindow ?? "unknown"}`));
      lines.push(info(`Max tokens: ${model.maxTokens ?? "unknown"}`));
    } else {
      lines.push(warn("No model selected"));
    }
    const usage = ctx.getContextUsage?.();
    if (usage && usage.contextWindow > 0) {
      lines.push(info(`Context: ${usage.tokens ?? "?"} / ${usage.contextWindow} tokens (${(usage.tokens / usage.contextWindow * 100).toFixed(1)}%)`));
    }
    const thinking = pi.getThinkingLevel();
    lines.push(info(`Thinking level: ${thinking}`));
    lines.push(section("SUMMARY"));
    lines.push(info(`Passed: ${passCount}  Failed: ${failCount}  Warnings: ${warnCount}`));
    if (failCount === 0) {
      lines.push(ok("All critical checks passed! \u{1F389}"));
    } else {
      lines.push(fail(`${failCount} check(s) failed \u2014 see above for details`));
    }
    if (warnCount > 0) {
      lines.push(warn(`${warnCount} warning(s) \u2014 non-critical but worth addressing`));
    }
    lines.push(branding);
    return lines.join("\n");
  }
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
          display: { type: "content", content: report }
        });
      } catch (e) {
        ctx.ui.notify(`Diagnostic failed: ${e.message}`, "error");
      }
    }
  });
  pi.registerTool({
    name: "self_diagnostic",
    label: "Self Diagnostic",
    description: "Run a comprehensive diagnostic check on the Pi environment including system resources, Ollama status, model configuration, extensions, themes, security posture, and current session state. Use this whenever the user asks for a diagnostic, health check, or system status.",
    promptSnippet: "self_diagnostic - run full system diagnostic check",
    promptGuidelines: [
      "When the user asks for a diagnostic, health check, or system test, call self_diagnostic."
    ],
    parameters: {
      type: "object",
      properties: {}
    },
    execute: async (_toolCallId, _params, _signal, _onUpdate, ctx) => {
      try {
        const report = await runDiagnostics(ctx);
        return {
          content: [{ type: "text", text: report }],
          isError: false
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Diagnostic failed: ${e.message}` }],
          isError: true
        };
      }
    }
  });
}
export {
  diag_temp_default as default
};
