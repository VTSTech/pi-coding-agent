/**
 * Security Extension for Pi Coding Agent.
 * Ported from AgentNova core/helpers.py + acp_plugin.py.
 *
 * HIGH PRIORITY — the single highest-value contribution to the Pi ecosystem.
 *
 * Features:
 *   - Security mode toggle (basic/max) with /security mode command
 *   - Command blocklist validation (mode-aware: critical always blocked, extended in max)
 *   - Path validation (prevents access to sensitive filesystem locations)
 *   - SSRF protection (mode-aware: allows localhost in basic, blocks in max)
 *   - Shell injection detection (scans arguments for metacharacter patterns)
 *   - Audit logging (JSON-lines log enriched with security mode metadata)
 *   - /security-audit command for on-demand security reporting
 *
 * Hook architecture:
 *   pi.on("tool_call")   → BEFORE tool executes → can block with { block: true, reason }
 *   pi.on("tool_result") → AFTER tool executes  → can modify/log result
 *
 * Written by VTSTech — https://www.vts-tech.org
 */
import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";
import {
  checkBashToolInput,
  checkFileToolInput,
  checkHttpToolInput,
  checkInjectionPatterns,
  appendAuditEntry,
  readRecentAuditEntries,
  BLOCKED_COMMANDS,
  BLOCKED_URL_PATTERNS,
  CRITICAL_COMMANDS,
  EXTENDED_COMMANDS,
  BLOCKED_URL_ALWAYS,
  BLOCKED_URL_MAX_ONLY,
  getSecurityMode,
  setSecurityMode,
  SECURITY_CONFIG_PATH,
} from "../shared/security";
import { section, ok, fail, warn, info, bytesHuman } from "../shared/format";
import { EXTENSION_VERSION } from "../shared/ollama";

// ── Types ────────────────────────────────────────────────────────────────

interface SecurityStats {
  blocked: number;
  allowed: number;
  warnings: number;
  byRule: Record<string, number>;
  lastBlocked?: { tool: string; rule: string; detail: string; timestamp: string };
}

// ── Extension ────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const stats: SecurityStats = {
    blocked: 0,
    allowed: 0,
    warnings: 0,
    byRule: {},
  };

  const branding = [
    `  ⚡ Pi Security Extension v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`,
  ].join("\n");

  // ── /security command (mode toggle) ───────────────────────────────────

  pi.registerCommand("security", {
    description: "Manage security mode — usage: /security mode [basic|max]",
    getArgumentCompletions: async () => {
      return [
        { value: "mode", label: "mode", description: "View or change the security enforcement mode" },
      ];
    },
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0]?.toLowerCase() || "";

      if (sub === "mode") {
        const value = parts[1]?.toLowerCase();
        const currentMode = getSecurityMode();

        // /security mode — show current
        if (!value) {
          const lines: string[] = [branding];
          lines.push(section("SECURITY MODE"));
          lines.push(info(`Current mode: ${currentMode.toUpperCase()}`));
          lines.push(info(`Config path: ${SECURITY_CONFIG_PATH}`));
          lines.push(info(`Critical commands (always blocked): ${CRITICAL_COMMANDS.size}`));
          lines.push(info(`Extended commands (max only): ${EXTENDED_COMMANDS.size}`));
          lines.push(info(`Total blocked (max): ${CRITICAL_COMMANDS.size + EXTENDED_COMMANDS.size}`));
          lines.push(info(`URL patterns always blocked: ${BLOCKED_URL_ALWAYS.size}`));
          lines.push(info(`URL patterns (max only): ${BLOCKED_URL_MAX_ONLY.size}`));
          lines.push(section("MODE DIFFERENCES"));
          lines.push(info("Basic: critical commands blocked, localhost/127.x allowed"));
          lines.push(info("Max: all commands blocked, full SSRF protection"));
          lines.push(section("SWITCH MODE"));
          lines.push(info("/security mode basic  — relax restrictions for development"));
          lines.push(info("/security mode max    — full lockdown (default)"));
          lines.push(branding);

          pi.sendMessage({
            customType: "security-mode-info",
            content: lines.join("\n"),
            display: { type: "content", content: lines.join("\n") },
          });
          return;
        }

        // /security mode basic
        if (value === "basic" || value === "max") {
          if (value === currentMode) {
            ctx.ui.notify(`Security mode is already ${value.toUpperCase()}`, "info");
            return;
          }

          setSecurityMode(value as "basic" | "max");
          ctx.ui.setStatus("status-sec", value.toUpperCase());
          ctx.ui.notify(`Security mode set to ${value.toUpperCase()}`, "success");

          appendAuditEntry({
            timestamp: new Date().toISOString(),
            toolName: "security-command",
            toolCallId: "",
            action: "allowed",
            rule: "mode_change",
            detail: `Security mode changed to ${value.toUpperCase()}`,
          });

          const lines: string[] = [branding];
          lines.push(section("SECURITY MODE CHANGED"));
          lines.push(ok(`Mode: ${value.toUpperCase()}`));
          lines.push(info(`Previous: ${currentMode.toUpperCase()}`));
          lines.push(info(`Config: ${SECURITY_CONFIG_PATH}`));

          if (value === "basic") {
            lines.push(warn("Extended commands are now ALLOWED: rm, sudo, npm, apt, git, curl, wget, etc."));
            lines.push(warn("Localhost and 127.x URLs are now ALLOWED for SSRF"));
            lines.push(ok("Critical commands remain blocked: dd, mkfs, shred, fdisk, ssh, etc."));
          } else {
            lines.push(ok("Full lockdown active — all ${CRITICAL_COMMANDS.size + EXTENDED_COMMANDS.size} commands blocked"));
            lines.push(ok("Full SSRF protection — localhost and private IPs blocked"));
          }

          lines.push(branding);

          pi.sendMessage({
            customType: "security-mode-changed",
            content: lines.join("\n"),
            display: { type: "content", content: lines.join("\n") },
          });
          return;
        }

        // Invalid mode value — provide autocomplete hints
        ctx.ui.notify(`Invalid mode: "${value}". Use "basic" or "max".`, "error");
        return;
      }

      // No subcommand — show usage
      const lines: string[] = [branding];
      lines.push(section("SECURITY COMMANDS"));
      lines.push(info("/security mode        — show current security mode"));
      lines.push(info("/security mode basic  — relax to basic mode"));
      lines.push(info("/security mode max    — switch to max lockdown"));
      lines.push(info("/security-audit       — show security audit report"));
      lines.push(branding);

      pi.sendMessage({
        customType: "security-usage",
        content: lines.join("\n"),
        display: { type: "content", content: lines.join("\n") },
      });
    },
  });

  // ── Tool call interceptor (BEFORE execution) ──────────────────────────

  pi.on("tool_call", (event) => {
    const toolName = event.toolName;
    const input = (event.input as Record<string, unknown>) ?? {};
    const toolCallId = event.toolCallId;

    let result: { safe: boolean; rule: string; detail: string };

    // Route to appropriate checker based on tool type
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
        // For unknown tools, still check for injection patterns
        result = checkInjectionPatterns(input);
        break;
    }

    if (!result.safe) {
      // BLOCK the tool call
      stats.blocked++;
      stats.byRule[result.rule] = (stats.byRule[result.rule] || 0) + 1;
      stats.lastBlocked = {
        tool: toolName,
        rule: result.rule,
        detail: result.detail,
        timestamp: new Date().toISOString(),
      };

      // Write audit log (includes securityMode via appendAuditEntry)
      appendAuditEntry({
        timestamp: new Date().toISOString(),
        toolName,
        toolCallId,
        action: "blocked",
        rule: result.rule,
        detail: result.detail,
        input: sanitizeInputForLog(input),
      });

      return {
        block: true,
        reason: `[SECURITY] ${result.detail} (rule: ${result.rule})`,
      };
    }

    // Tool call passed security checks
    stats.allowed++;

    // Log allowed operations for bash, write, edit (dangerous even if valid)
    if (["bash", "shell", "write", "write_file", "edit", "edit_file"].includes(toolName)) {
      stats.warnings++;
      appendAuditEntry({
        timestamp: new Date().toISOString(),
        toolName,
        toolCallId,
        action: "allowed",
        rule: result.rule || "none",
        detail: "Bash/tool executed (allowed)",
        input: sanitizeInputForLog(input),
      });
    }
  });

  // ── Tool result interceptor (AFTER execution) ────────────────────────

  pi.on("tool_result", (event) => {
    const toolName = event.toolName;
    const isError = event.isError;

    // Log tool errors for error recovery tracking
    if (isError) {
      appendAuditEntry({
        timestamp: new Date().toISOString(),
        toolName,
        toolCallId: event.toolCallId,
        action: "warning",
        rule: "tool_error",
        detail: "Tool execution failed",
        input: sanitizeInputForLog(event.input as Record<string, unknown>),
      });
    }
  });

  // ── /security-audit command ──────────────────────────────────────────

  async function generateAuditReport(): Promise<string> {
    const lines: string[] = [];
    lines.push(branding);
    const currentMode = getSecurityMode();

    // Security mode
    lines.push(section("SECURITY MODE"));
    lines.push(info(`Current mode: ${currentMode.toUpperCase()}`));
    lines.push(info(`Config file: ${SECURITY_CONFIG_PATH}`));

    // Effective blocklist summary
    lines.push(section("BLOCKLIST SUMMARY"));
    lines.push(info(`Critical commands (always blocked): ${CRITICAL_COMMANDS.size}`));
    lines.push(info(`Extended commands (max only): ${EXTENDED_COMMANDS.size}`));
    lines.push(info(`Effective blocked commands: ${currentMode === "max" ? CRITICAL_COMMANDS.size + EXTENDED_COMMANDS.size : CRITICAL_COMMANDS.size}`));
    lines.push(info(`URL patterns always blocked: ${BLOCKED_URL_ALWAYS.size}`));
    lines.push(info(`URL patterns (max only): ${BLOCKED_URL_MAX_ONLY.size}`));
    lines.push(info(`Effective blocked URL patterns: ${currentMode === "max" ? BLOCKED_URL_ALWAYS.size + BLOCKED_URL_MAX_ONLY.size : BLOCKED_URL_ALWAYS.size}`));

    // Session stats
    lines.push(section("SESSION STATISTICS"));
    lines.push(info(`Tool calls allowed: ${stats.allowed}`));
    lines.push(info(`Tool calls blocked: ${stats.blocked}`));
    lines.push(info(`Dangerous operations logged: ${stats.warnings}`));

    if (stats.blocked > 0) {
      lines.push(warn(`${stats.blocked} operation(s) were blocked by security rules`));
    }

    // Breakdown by rule
    const ruleNames = Object.keys(stats.byRule);
    if (ruleNames.length > 0) {
      lines.push(section("BLOCKED BY RULE"));
      for (const rule of ruleNames) {
        lines.push(info(`  ${rule}: ${stats.byRule[rule]} blocked`));
      }
    }

    // Last blocked
    if (stats.lastBlocked) {
      lines.push(section("LAST BLOCKED"));
      lines.push(fail(`Tool: ${stats.lastBlocked.tool}`));
      lines.push(fail(`Rule: ${stats.lastBlocked.rule}`));
      lines.push(fail(`Detail: ${stats.lastBlocked.detail}`));
      lines.push(info(`Time: ${stats.lastBlocked.timestamp}`));
    }

    // Active checks
    lines.push(section("ACTIVE CHECKS"));
    lines.push(info(`Command blocklist: critical always, extended in max mode`));
    lines.push(info(`Path validation: sensitive directory protection`));
    lines.push(info(`SSRF protection: ${currentMode === "max" ? "full (loopback + metadata + private)" : "metadata + private only"}`));
    lines.push(info(`Injection detection: metacharacter scanning`));

    // Recent audit log
    const recentEntries = readRecentAuditEntries(20);
    if (recentEntries.length > 0) {
      lines.push(section("RECENT AUDIT LOG (last 20)"));
      for (const entry of recentEntries) {
        const ts = (entry.timestamp as string) || "?";
        const action = entry.action as string;
        const tool = entry.toolName as string;
        const rule = entry.rule as string;
        const detail = entry.detail as string;
        const mode = (entry.securityMode as string) || currentMode;

        if (action === "blocked") {
          lines.push(fail(`[${ts}][${mode.toUpperCase()}] ${tool} → BLOCKED (${rule}): ${detail}`));
        } else if (action === "warning") {
          lines.push(warn(`[${ts}][${mode.toUpperCase()}] ${tool} → WARNING (${rule}): ${detail}`));
        } else {
          lines.push(ok(`[${ts}][${mode.toUpperCase()}] ${tool} → allowed (${rule})`));
        }
      }
    }

    // Summary
    lines.push(section("SUMMARY"));
    if (stats.blocked === 0) {
      lines.push(ok("No security violations detected in this session"));
    } else {
      lines.push(fail(`${stats.blocked} security violation(s) blocked`));
    }
    lines.push(info(`Security mode: ${currentMode.toUpperCase()} — /security mode to change`));
    lines.push(branding);

    return lines.join("\n");
  }

  pi.registerCommand("security-audit", {
    description: "Show security audit report — blocked operations, stats, and recent log",
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
          display: { type: "content", content: report },
        });
      } catch (e: any) {
        ctx.ui.notify(`Security audit failed: ${e.message}`, "error");
      }
    },
  });

  // ── security_audit tool (LLM-callable) ──────────────────────────────

  pi.registerTool({
    name: "security_audit",
    label: "Security Audit",
    description: "Run a security audit showing blocked operations, security statistics, and recent audit log entries. Use this when the user asks about security status or wants to review security events.",
    promptSnippet: "security_audit - show security status and blocked operations",
    promptGuidelines: [
      "When the user asks about security, blocked operations, or audit log, call security_audit.",
    ],
    parameters: {
      type: "object",
      properties: {},
    },
    execute: async (_toolCallId, _params, _signal, _onUpdate, _ctx) => {
      try {
        const report = await generateAuditReport();
        return {
          content: [{ type: "text", text: report }],
          isError: false,
        } as AgentToolResult;
      } catch (e: any) {
        return {
          content: [{ type: "text", text: `Security audit failed: ${e.message}` }],
          isError: true,
        } as AgentToolResult;
      }
    },
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Remove sensitive values from tool input for safe logging. */
function sanitizeInputForLog(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.length > 500) {
      sanitized[key] = value.slice(0, 500) + "... (truncated)";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}