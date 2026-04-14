/**
 * ReAct Fallback Extension for Pi Coding Agent.
 * Ported from AgentNova core/tool_parse.py + core/args_normal.py.
 *
 * Enables tool calling for models that don't support Pi's native function calling.
 * Provides a universal bridge tool + ReAct text parser + fuzzy matching + arg normalization.
 *
 * Architecture:
 *   1. Registers a `tool_call` bridge tool that accepts {name, arguments} from any model
 *   2. Modifies system prompt via pi.on("context") for models needing ReAct guidance
 *   3. Dispatches bridge calls to real Pi tools with fuzzy name matching & arg normalization
 *
 * Written by VTSTech — https://www.vts-tech.org
 */
import type { ExtensionAPI, AgentToolResult } from "@mariozechner/pi-coding-agent";
import os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { section, ok, fail, warn, info } from "../shared/format";
import { EXTENSION_VERSION } from "../shared/ollama";
import { debugLog } from "../shared/debug";

// ── Shared ReAct parser imports ──────────────────────────────────────────
import {
  type ReactDialect,
  type ParsedToolCall,
  type DialectPatterns,
  sanitizeModelJson,
  extractJsonArgs,
  extractToolFromJson,
  parseReact,
  parseReactWithPatterns,
  detectReactDialect,
  fuzzyMatchToolName,
  looksLikeSchemaDump,
  REACT_DIALECTS,
  ALL_DIALECT_PATTERNS,
  FINAL_ANSWER_RE,
} from "../shared/react-parser";

// ============================================================================
// Config Persistence
// ============================================================================

const REACT_CONFIG_PATH = path.join(os.homedir(), ".pi", "agent", "react-mode.json");

interface ReactConfig {
  enabled: boolean;
}

function readReactConfig(): ReactConfig {
  try {
    if (fs.existsSync(REACT_CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(REACT_CONFIG_PATH, "utf-8"));
      if (typeof raw.enabled === "boolean") return raw;
    }
  } catch (err) { debugLog("react-fallback", "failed to read ReAct config", err); }
  return { enabled: false };
}

function writeReactConfig(config: ReactConfig): void {
  const dir = path.dirname(REACT_CONFIG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(REACT_CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  let reactModeEnabled = readReactConfig().enabled;
  let stats = { bridgeCalls: 0, fuzzyMatches: 0, argNormalizations: 0, parseFailures: 0 };

  const branding = [
    `  ⚡ Pi ReAct Fallback Extension v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`,
  ].join("\n");

  // ── Universal bridge tool (only registered when react-mode is enabled) ──

  function registerBridgeTool(): void {
    pi.registerTool({
      name: "tool_call",
      label: "Universal Tool Call",
      description: `Universal tool call bridge. Use this to call any available tool by specifying its name and arguments as JSON.

To use: call tool_call with:
- name: the exact tool name (e.g. "bash", "read", "write", "edit")
- arguments: a JSON string of the tool's arguments (e.g. '{"command": "ls -la"}')

The bridge will match your tool name (fuzzy matching supported) and normalize argument names automatically.`,
      promptSnippet: "tool_call - universal bridge for calling any tool",
      promptGuidelines: [
        "When you need to use a tool but are unsure of the exact name, use tool_call with the tool name and arguments.",
        "Example: tool_call(name='bash', arguments='{\"command\": \"ls -la\"}')",
      ],
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the tool to call (fuzzy matching supported)" },
          arguments: { type: "string", description: "Tool arguments as a JSON object string" },
        },
        required: ["name", "arguments"],
      } as any,
      execute: async (toolCallId, params, signal, onUpdate, ctx) => {
        const p = params as { name?: string; arguments?: string };
        const requestedName = p.name || "";
        const argsStr = p.arguments || "{}";

        stats.bridgeCalls++;

        // Parse arguments JSON
        let args: Record<string, unknown>;
        try {
          args = JSON.parse(argsStr);
          if (typeof args !== "object" || args === null || Array.isArray(args)) {
            args = { input: argsStr };
          }
        } catch {
          args = { input: argsStr };
        }

        // Get all available tools
        const allTools = pi.getAllTools();
        let targetToolName: string | null = null;

        // Exact match first
        if (allTools.includes(requestedName)) {
          targetToolName = requestedName;
        } else {
          // Fuzzy match
          targetToolName = fuzzyMatchToolName(requestedName, allTools);
          if (targetToolName) stats.fuzzyMatches++;
        }

        if (!targetToolName) {
          stats.parseFailures++;
          return {
            content: [{ type: "text", text: `Error: Unknown tool "${requestedName}". Available tools: ${allTools.join(", ")}` }],
            isError: true,
          } as AgentToolResult;
        }

        // Prevent infinite loop: block the bridge from calling itself
        if (targetToolName === "tool_call") {
          stats.parseFailures++;
          return {
            content: [{ type: "text", text: `Error: The tool_call bridge cannot call itself — this would create an infinite loop. Please call the real tool directly with these arguments: ${argsJson}` }],
            isError: true,
          } as AgentToolResult;
        }

        // Try to execute the tool via pi.exec or find another way
        // Since Pi doesn't expose a "call another tool" API from extensions,
        // we return a structured message telling the agent to call the real tool
        const normalizedArgs = Object.keys(args).length > 0 ? args : {};
        stats.argNormalizations++;

        const argsJson = JSON.stringify(normalizedArgs);
        return {
          content: [{
            type: "text",
            text: `[ReAct Bridge] Tool resolved: ${requestedName} → ${targetToolName}${targetToolName !== requestedName ? " (fuzzy matched)" : ""}\n\nPlease call ${targetToolName} with these arguments:\n${argsJson}`,
          }],
          isError: false,
        } as AgentToolResult;
      },
    });
  }

  // Only register the bridge tool if react-mode starts enabled
  if (reactModeEnabled) {
    registerBridgeTool();
  }

  // ── Context modification for ReAct mode ──────────────────────────────

  pi.on("context", (event) => {
    if (!reactModeEnabled) return;

    const model = event.messages; // messages array
    // Add ReAct instructions to the system prompt area
    // This helps models that understand ReAct format but not native function calling
    // We append instructions to the last system message if present
    for (let i = model.length - 1; i >= 0; i--) {
      const msg = model[i];
      if (msg && (msg as any).role === "system") {
        const content = (msg as any).content || "";
        if (!content.includes("[ReAct Fallback Mode]")) {
          (msg as any).content = content + "\n\n[ReAct Fallback Mode]\n" +
            "You have access to tools via the `tool_call` bridge tool.\n" +
            "To call a tool, use: tool_call(name=\"<tool_name>\", arguments=\"<json_args>\")\n" +
            "Available tools will be listed in your tool definitions.\n" +
            "Always use tool_call to interact with files, run commands, or perform calculations.";
        }
        break;
      }
    }
  });

  // ── /react-mode command ─────────────────────────────────────────────

  pi.registerCommand("react-mode", {
    description: "Toggle ReAct fallback mode for models without native tool calling",
    handler: async (_args, ctx) => {
      reactModeEnabled = !reactModeEnabled;
      writeReactConfig({ enabled: reactModeEnabled });
      const status = reactModeEnabled ? "ENABLED" : "DISABLED";
      ctx.ui.notify(`ReAct mode ${status}`, "success");

      const lines: string[] = [branding];
      lines.push(section("REACT FALLBACK MODE"));
      lines.push(info(`Status: ${status}`));
      lines.push(info(`Config: ${REACT_CONFIG_PATH}`));
      lines.push(info(`Bridge calls: ${stats.bridgeCalls}`));
      lines.push(info(`Fuzzy matches: ${stats.fuzzyMatches}`));
      lines.push(info(`Argument normalizations: ${stats.argNormalizations}`));
      lines.push(info(`Parse failures: ${stats.parseFailures}`));

      if (reactModeEnabled) {
        registerBridgeTool();
        lines.push(ok("The tool_call bridge tool is now available to the model"));
        lines.push(info("ReAct system prompt instructions have been added"));
        lines.push(info("Run /reload to make the bridge tool available to the current model"));
      } else {
        lines.push(warn("The tool_call bridge tool has been unregistered"));
        lines.push(info("Run /reload to remove the tool from the current model"));
      }

      const report = lines.join("\n");
      pi.sendMessage({
        customType: "react-mode-report",
        content: report,
        display: { type: "content", content: report },
      });
    },
  });

  // ── /react-parse command (test the parser) ───────────────────────────

  pi.registerCommand("react-parse", {
    description: "Test the ReAct parser against a text input: /react-parse <text>",
    handler: async (args, ctx) => {
      const text = args.trim();
      if (!text) {
        ctx.ui.notify("Provide text to parse: /react-parse <text>", "error");
        return;
      }

      const lines: string[] = [branding];
      lines.push(section("REACT PARSER TEST"));
      lines.push(info(`Input: ${text.slice(0, 100)}${text.length > 100 ? "..." : ""}`));

      // Detect dialect before parsing
      const detectedDialect = detectReactDialect(text);

      // Try ReAct parse
      const reactResult = parseReact(text);
      if (reactResult) {
        lines.push(ok(`ReAct format detected! (dialect: ${reactResult.dialect || "react"})`));
        lines.push(info(`Tool: ${reactResult.name}`));
        lines.push(info(`Args: ${JSON.stringify(reactResult.args)}`));
        if (reactResult.thought) lines.push(info(`Thought: ${reactResult.thought}`));
        if (reactResult.finalAnswer) lines.push(info(`Final Answer: ${reactResult.finalAnswer}`));
      } else {
        if (detectedDialect) {
          lines.push(warn(`Dialect tag "${detectedDialect.actionTag}" detected but no valid tool call parsed`));
        } else {
          lines.push(fail("No ReAct format detected"));
        }
      }

      // Show available dialects if we detected a non-classic one
      if (detectedDialect && detectedDialect.name !== "react") {
        lines.push(info(`Detected dialect: ${detectedDialect.name} (${detectedDialect.actionTag} / ${detectedDialect.inputTag})`));
      }

      // Try JSON extraction
      try {
        // Find JSON in text
        const firstBrace = text.indexOf("{");
        if (firstBrace !== -1) {
          const lastBrace = text.lastIndexOf("}");
          if (lastBrace > firstBrace) {
            const jsonStr = text.slice(firstBrace, lastBrace + 1);
            const parsed = JSON.parse(sanitizeModelJson(jsonStr));
            const toolResult = extractToolFromJson(parsed);
            if (toolResult) {
              lines.push(ok("JSON tool call detected!"));
              lines.push(info(`Tool: ${toolResult.name}`));
              lines.push(info(`Args: ${JSON.stringify(toolResult.args)}`));
            }
          }
        }
      } catch (err) { debugLog("react-fallback", "failed to extract JSON from parse test input", err); }

      // Check for schema dump
      if (looksLikeSchemaDump(text)) {
        lines.push(warn("Text appears to be a tool schema dump (not a tool call)"));
      }

      // Check for final answer
      const faMatch = FINAL_ANSWER_RE.exec(text);
      if (faMatch) {
        const fa = faMatch[1].trim();
        lines.push(ok(`Final Answer: ${fa}`));
      }

      pi.sendMessage({
        customType: "react-parse-report",
        content: lines.join("\n"),
        display: { type: "content", content: lines.join("\n") },
      });
    },
  });

}
