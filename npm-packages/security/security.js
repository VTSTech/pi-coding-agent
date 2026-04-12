// .build-npm/security/security.temp.ts
import {
  checkBashToolInput,
  checkFileToolInput,
  checkHttpToolInput,
  checkInjectionPatterns,
  appendAuditEntry,
  readRecentAuditEntries,
  BLOCKED_COMMANDS,
  BLOCKED_URL_PATTERNS
} from "@vtstech/pi-shared/security";
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
  pi.on("tool_call", (event) => {
    const toolName = event.toolName;
    const input = event.input ?? {};
    const toolCallId = event.toolCallId;
    let result;
    switch (toolName) {
      case "bash":
      case "shell":
      case "run_command":
        result = checkBashToolInput(input);
        break;
      case "read":
      case "read_file":
      case "write":
      case "write_file":
      case "edit":
      case "edit_file":
      case "list_directory":
      case "list_dir":
        result = checkFileToolInput(input);
        break;
      case "http_get":
      case "http_post":
      case "fetch":
      case "web_search":
      case "http_request":
        result = checkHttpToolInput(input);
        break;
      default:
        result = checkInjectionPatterns(input);
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
    lines.push(section("SECURITY CONFIGURATION"));
    lines.push(info(`Blocked commands: ${BLOCKED_COMMANDS.size}`));
    lines.push(info(`Blocked URL patterns: ${BLOCKED_URL_PATTERNS.size}`));
    lines.push(info(`Active checks: command_blocklist, path_validation, ssrf_protection, injection_detection`));
    const recentEntries = readRecentAuditEntries(20);
    if (recentEntries.length > 0) {
      lines.push(section("RECENT AUDIT LOG (last 20)"));
      for (const entry of recentEntries) {
        const ts = entry.timestamp || "?";
        const action = entry.action;
        const tool = entry.toolName;
        const rule = entry.rule;
        const detail = entry.detail;
        if (action === "blocked") {
          lines.push(fail(`[${ts}] ${tool} \u2192 BLOCKED (${rule}): ${detail}`));
        } else if (action === "warning") {
          lines.push(warn(`[${ts}] ${tool} \u2192 WARNING (${rule}): ${detail}`));
        } else {
          lines.push(ok(`[${ts}] ${tool} \u2192 allowed (${rule})`));
        }
      }
    }
    lines.push(section("SUMMARY"));
    if (stats.blocked === 0) {
      lines.push(ok("No security violations detected in this session"));
    } else {
      lines.push(fail(`${stats.blocked} security violation(s) blocked`));
    }
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
function sanitizeInputForLog(input) {
  const sanitized = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.length > 500) {
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
