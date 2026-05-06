// .build-npm/security/security.temp.ts
import {
  checkBashToolInput,
  checkFileToolInput,
  checkHttpToolInput,
  checkInjectionPatterns,
  appendAuditEntry,
  readRecentAuditEntries,
  CRITICAL_COMMANDS,
  EXTENDED_COMMANDS,
  BLOCKED_URL_ALWAYS,
  BLOCKED_URL_MAX_ONLY,
  getSecurityMode,
  setSecurityMode,
  SECURITY_CONFIG_PATH
} from "@vtstech/pi-shared/security";
import { debugLog } from "@vtstech/pi-shared/debug";
import { section, ok, fail, warn, info } from "@vtstech/pi-shared/format";
import { EXTENSION_VERSION } from "@vtstech/pi-shared/ollama";
function security_temp_default(pi) {
  const stats = {
    blocked: 0,
    allowed: 0,
    warnings: 0,
    byRule: {}
  };
  const branding = [
    `  \u26A1 Pi Security Extension v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`
  ].join("\n");
  pi.registerCommand("security", {
    description: "Manage security mode \u2014 usage: /security mode [basic|max]",
    handler: async (args, ctx) => {
      try {
        const parts = args.trim().split(/\s+/);
        const sub = parts[0]?.toLowerCase() || "";
        if (sub === "mode") {
          const value = parts[1]?.toLowerCase();
          const currentMode = getSecurityMode();
          if (!value) {
            const lines2 = [branding];
            lines2.push(section("SECURITY MODE"));
            lines2.push(info(`Current mode: ${currentMode.toUpperCase()}`));
            lines2.push(info(`Config path: ${SECURITY_CONFIG_PATH}`));
            lines2.push(info(`Critical commands (always blocked): ${CRITICAL_COMMANDS.size}`));
            lines2.push(info(`Extended commands (max only): ${EXTENDED_COMMANDS.size}`));
            lines2.push(info(`Total blocked (max): ${CRITICAL_COMMANDS.size + EXTENDED_COMMANDS.size}`));
            lines2.push(info(`URL patterns always blocked: ${BLOCKED_URL_ALWAYS.size}`));
            lines2.push(info(`URL patterns (max only): ${BLOCKED_URL_MAX_ONLY.size}`));
            lines2.push(section("MODE DIFFERENCES"));
            lines2.push(info("Basic: critical commands blocked, localhost/127.x allowed"));
            lines2.push(info("Max: all commands blocked, full SSRF protection"));
            lines2.push(info("Off: no security enforcement, all commands allowed"));
            lines2.push(section("SWITCH MODE"));
            lines2.push(info("/security mode basic  \u2014 relax restrictions for development"));
            lines2.push(info("/security mode max    \u2014 full lockdown (default)"));
            lines2.push(info("/security mode off     \u2014 disable all security checks"));
            lines2.push(branding);
            pi.sendMessage({
              customType: "security-mode-info",
              content: lines2.join("\n"),
              display: { type: "content", content: lines2.join("\n") }
            });
            return;
          }
          if (value === "basic" || value === "max" || value === "off") {
            if (value === currentMode) {
              ctx.ui.notify(`Security mode is already ${value.toUpperCase()}`, "info");
              return;
            }
            const writeOk = setSecurityMode(value);
            if (!writeOk) {
              ctx.ui.notify(`FAILED to persist security mode: could not write ${SECURITY_CONFIG_PATH}`, "error");
              debugLog("security", `/security mode ${value}: write failed`, { path: SECURITY_CONFIG_PATH });
              return;
            }
            ctx.ui.setStatus("status-sec", value.toUpperCase());
            ctx.ui.notify(`Security mode set to ${value.toUpperCase()}`, "success");
            appendAuditEntry({
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              toolName: "security-command",
              toolCallId: "",
              action: "allowed",
              rule: "mode_change",
              detail: `Security mode changed to ${value.toUpperCase()}`
            });
            const totalCmds = CRITICAL_COMMANDS.size + EXTENDED_COMMANDS.size;
            const lines2 = [branding];
            lines2.push(section("SECURITY MODE CHANGED"));
            lines2.push(ok(`Mode: ${value.toUpperCase()}`));
            lines2.push(info(`Previous: ${currentMode.toUpperCase()}`));
            lines2.push(info(`Config: ${SECURITY_CONFIG_PATH}`));
            if (value === "basic") {
              lines2.push(warn("Extended commands are now ALLOWED: rm, sudo, npm, apt, git, curl, wget, etc."));
              lines2.push(warn("Localhost and 127.x URLs are now ALLOWED for SSRF"));
              lines2.push(ok("Critical commands remain blocked: dd, mkfs, shred, fdisk, ssh, etc."));
            } else if (value === "max") {
              lines2.push(ok(`Full lockdown active \u2014 all ${totalCmds} commands blocked`));
              lines2.push(ok("Full SSRF protection \u2014 localhost and private IPs blocked"));
            } else if (value === "off") {
              lines2.push(ok("Security enforcement disabled \u2014 all commands allowed"));
              lines2.push(ok("SSRF protection disabled \u2014 all URLs allowed"));
            }
            lines2.push(branding);
            pi.sendMessage({
              customType: "security-mode-changed",
              content: lines2.join("\n"),
              display: { type: "content", content: lines2.join("\n") }
            });
            return;
          }
          ctx.ui.notify(`Invalid mode: "${value}". Use "basic", "max", or "off".`, "error");
          return;
        }
        const lines = [branding];
        lines.push(section("SECURITY COMMANDS"));
        lines.push(info("/security mode        \u2014 show current security mode"));
        lines.push(info("/security mode basic  \u2014 relax to basic mode"));
        lines.push(info("/security mode max    \u2014 switch to max lockdown"));
        lines.push(info("/security mode off     \u2014 disable all security checks"));
        lines.push(info("/security-audit       \u2014 show security audit report"));
        lines.push(branding);
        pi.sendMessage({
          customType: "security-usage",
          content: lines.join("\n"),
          display: { type: "content", content: lines.join("\n") }
        });
      } catch (e) {
        debugLog("security", "/security command handler error", e);
        ctx.ui.notify(`/security error: ${e.message}`, "error");
      }
    }
  });
  pi.registerCompletion?.("security", {
    getCompletions: () => {
      return [
        { value: "mode", label: "mode", description: "View or change the security enforcement mode" }
      ];
    },
    getArgumentCompletions: (args) => {
      const sub = args[0]?.toLowerCase() || "";
      if (sub === "mode" && args.length === 2) {
        return [
          { value: "basic", label: "basic", description: "Relax to basic mode \u2014 only critical commands blocked" },
          { value: "max", label: "max", description: "Full lockdown \u2014 all commands blocked (default)" },
          { value: "off", label: "off", description: "Disable all security checks" }
        ];
      }
      return [];
    }
  });
  pi.on("tool_call", (event) => {
    const toolName = event.toolName;
    const input = event.input ?? {};
    const toolCallId = event.toolCallId;
    let result;
    const currentMode = getSecurityMode();
    switch (toolName) {
      case "bash":
      case "shell":
      case "run_command":
        result = checkBashToolInput(input, currentMode);
        break;
      case "read":
      case "read_file":
      case "write":
      case "write_file":
      case "edit":
      case "edit_file":
      case "list_directory":
      case "list_dir":
        result = checkFileToolInput(input, currentMode);
        break;
      case "http_get":
      case "http_post":
      case "fetch":
      case "web_search":
      case "http_request":
        result = checkHttpToolInput(input, currentMode);
        break;
      default:
        result = checkInjectionPatterns(input, currentMode);
        break;
    }
    if (!result.safe) {
      stats.blocked++;
      stats.byRule[result.rule] = (stats.byRule[result.rule] || 0) + 1;
      stats.lastBlocked = {
        tool: toolName,
        rule: result.rule,
        detail: result.detail,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      appendAuditEntry({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        toolName,
        toolCallId,
        action: "blocked",
        rule: result.rule,
        detail: result.detail,
        input: sanitizeInputForLog(input)
      });
      return {
        block: true,
        reason: `[SECURITY] ${result.detail} (rule: ${result.rule})`
      };
    }
    stats.allowed++;
    if (["bash", "shell", "write", "write_file", "edit", "edit_file"].includes(toolName)) {
      stats.warnings++;
      appendAuditEntry({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        toolName,
        toolCallId,
        action: "allowed",
        rule: result.rule || "none",
        detail: "Bash/tool executed (allowed)",
        input: sanitizeInputForLog(input)
      });
    }
  });
  pi.on("tool_result", (event) => {
    const toolName = event.toolName;
    const isError = event.isError;
    if (isError) {
      appendAuditEntry({
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        toolName,
        toolCallId: event.toolCallId,
        action: "warning",
        rule: "tool_error",
        detail: "Tool execution failed",
        input: sanitizeInputForLog(event.input)
      });
    }
  });
  async function generateAuditReport() {
    const lines = [];
    lines.push(branding);
    const currentMode = getSecurityMode();
    lines.push(section("SECURITY MODE"));
    lines.push(info(`Current mode: ${currentMode.toUpperCase()}`));
    lines.push(info(`Config file: ${SECURITY_CONFIG_PATH}`));
    lines.push(section("BLOCKLIST SUMMARY"));
    lines.push(info(`Critical commands (always blocked): ${CRITICAL_COMMANDS.size}`));
    lines.push(info(`Extended commands (max only): ${EXTENDED_COMMANDS.size}`));
    lines.push(info(`Effective blocked commands: ${currentMode === "max" ? CRITICAL_COMMANDS.size + EXTENDED_COMMANDS.size : CRITICAL_COMMANDS.size}`));
    lines.push(info(`URL patterns always blocked: ${BLOCKED_URL_ALWAYS.size}`));
    lines.push(info(`URL patterns (max only): ${BLOCKED_URL_MAX_ONLY.size}`));
    lines.push(info(`Effective blocked URL patterns: ${currentMode === "max" ? BLOCKED_URL_ALWAYS.size + BLOCKED_URL_MAX_ONLY.size : BLOCKED_URL_ALWAYS.size}`));
    lines.push(section("SESSION STATISTICS"));
    lines.push(info(`Tool calls allowed: ${stats.allowed}`));
    lines.push(info(`Tool calls blocked: ${stats.blocked}`));
    lines.push(info(`Dangerous operations logged: ${stats.warnings}`));
    if (stats.blocked > 0) {
      lines.push(warn(`${stats.blocked} operation(s) were blocked by security rules`));
    }
    const ruleNames = Object.keys(stats.byRule);
    if (ruleNames.length > 0) {
      lines.push(section("BLOCKED BY RULE"));
      for (const rule of ruleNames) {
        lines.push(info(`  ${rule}: ${stats.byRule[rule]} blocked`));
      }
    }
    if (stats.lastBlocked) {
      lines.push(section("LAST BLOCKED"));
      lines.push(fail(`Tool: ${stats.lastBlocked.tool}`));
      lines.push(fail(`Rule: ${stats.lastBlocked.rule}`));
      lines.push(fail(`Detail: ${stats.lastBlocked.detail}`));
      lines.push(info(`Time: ${stats.lastBlocked.timestamp}`));
    }
    lines.push(section("ACTIVE CHECKS"));
    lines.push(info(`Command blocklist: critical always, extended in max mode`));
    lines.push(info(`Path validation: sensitive directory protection`));
    lines.push(info(`SSRF protection: ${currentMode === "max" ? "full (loopback + metadata + private)" : "metadata + private only"}`));
    lines.push(info(`Injection detection: metacharacter scanning`));
    const recentEntries = readRecentAuditEntries(20);
    if (recentEntries.length > 0) {
      lines.push(section("RECENT AUDIT LOG (last 20)"));
      for (const entry of recentEntries) {
        const ts = entry.timestamp || "?";
        const action = entry.action;
        const tool = entry.toolName;
        const rule = entry.rule;
        const detail = entry.detail;
        const mode = entry.securityMode || currentMode;
        if (action === "blocked") {
          lines.push(fail(`[${ts}][${mode.toUpperCase()}] ${tool} \u2192 BLOCKED (${rule}): ${detail}`));
        } else if (action === "warning") {
          lines.push(warn(`[${ts}][${mode.toUpperCase()}] ${tool} \u2192 WARNING (${rule}): ${detail}`));
        } else {
          lines.push(ok(`[${ts}][${mode.toUpperCase()}] ${tool} \u2192 allowed (${rule})`));
        }
      }
    }
    lines.push(section("SUMMARY"));
    if (stats.blocked === 0) {
      lines.push(ok("No security violations detected in this session"));
    } else {
      lines.push(fail(`${stats.blocked} security violation(s) blocked`));
    }
    lines.push(info(`Security mode: ${currentMode.toUpperCase()} \u2014 /security mode to change`));
    lines.push(branding);
    return lines.join("\n");
  }
  pi.registerCommand("security-audit", {
    description: "Show security audit report \u2014 blocked operations, stats, and recent log",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("Security audit requires TUI mode", "error");
        return;
      }
      try {
        const report = await generateAuditReport();
        pi.sendMessage({
          customType: "security-audit-report",
          content: report,
          display: { type: "content", content: report }
        });
      } catch (e) {
        ctx.ui.notify(`Security audit failed: ${e.message}`, "error");
      }
    }
  });
  pi.registerTool({
    name: "security_audit",
    label: "Security Audit",
    description: "Run a security audit showing blocked operations, security statistics, and recent audit log entries. Use this when the user asks about security status or wants to review security events.",
    promptSnippet: "security_audit - show security status and blocked operations",
    promptGuidelines: [
      "When the user asks about security, blocked operations, or audit log, call security_audit."
    ],
    parameters: {
      type: "object",
      properties: {}
    },
    execute: async (_toolCallId, _params, _signal, _onUpdate, _ctx) => {
      try {
        const report = await generateAuditReport();
        return {
          content: [{ type: "text", text: report }],
          isError: false
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Security audit failed: ${e.message}` }],
          isError: true
        };
      }
    }
  });
}
var SECRET_KEY_PATTERNS = [
  /key$/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /auth/i,
  /apikey/i,
  /api_key/i
];
function sanitizeInputForLog(input) {
  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string") {
      sanitized[key] = value;
      continue;
    }
    if (SECRET_KEY_PATTERNS.some((p) => p.test(key))) {
      sanitized[key] = "[REDACTED]";
      continue;
    }
    if (value.length > 500) {
      sanitized[key] = value.slice(0, 500) + "... (truncated)";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
export {
  security_temp_default as default
};
