/**
 * API Mode Switcher Extension for Pi Coding Agent.
 *
 * Allows runtime switching of API modes, base URLs, thinking settings,
 * and compat flags in models.json for local/remote model providers.
 *
 * Commands:
 *   /api              — Show current provider config
 *   /api mode <mode>  — Switch API mode (e.g., openai-completions, openai-responses)
 *   /api url <url>    — Switch base URL
 *   /api think <on|off|auto> — Toggle thinking mode for current model
 *   /api compat <key> [value] — Get/set compat flags
 *   /api reload       — Reload models.json
 *   /api modes        — List all supported API modes
 *
 * Written by VTSTech — https://www.vts-tech.org
 * @version 1.0.2
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { section, ok, fail, info, warn } from "../shared/format";
import { readModelsJson, writeModelsJson, getOllamaBaseUrl } from "../shared/ollama";

// ============================================================================
// Constants
// ============================================================================

/** All valid API modes supported by Pi's streaming implementation. */
const API_MODES: Record<string, string> = {
  "anthropic-messages":        "Anthropic Claude API and compatibles",
  "openai-completions":        "OpenAI Chat Completions API and compatibles",
  "openai-responses":          "OpenAI Responses API",
  "azure-openai-responses":    "Azure OpenAI Responses API",
  "openai-codex-responses":    "OpenAI Codex Responses API",
  "mistral-conversations":     "Mistral SDK Conversations/Chat streaming",
  "google-generative-ai":      "Google Generative AI API",
  "google-gemini-cli":         "Google Cloud Code Assist API",
  "google-vertex":             "Google Vertex AI API",
  "bedrock-converse-stream":   "Amazon Bedrock Converse API",
};

/** Known compat flag keys with descriptions and accepted values. */
const COMPAT_FLAGS: Record<string, { description: string; values: string[] }> = {
  supportsDeveloperRole: {
    description: 'Use "system" instead of "developer" role',
    values: ["true", "false"],
  },
  supportsReasoningEffort: {
    description: "Provider supports reasoning effort parameter",
    values: ["true", "false"],
  },
  maxTokensField: {
    description: 'Token field name ("max_tokens" or "max_completion_tokens")',
    values: ["max_tokens", "max_completion_tokens"],
  },
  requiresToolResultName: {
    description: "Tool results need name field",
    values: ["true", "false"],
  },
  thinkingFormat: {
    description: "Thinking token format (e.g., qwen, deepseek)",
    values: ["qwen", "deepseek", "default"],
  },
};

// ============================================================================
// Helpers
// ============================================================================

/** Get the first local provider name (usually "ollama"). */
function getLocalProvider(config: ReturnType<typeof readModelsJson>): { name: string; isLocal: boolean } {
  for (const [name, provider] of Object.entries(config.providers)) {
    const url = provider.baseUrl || "";
    if (
      url.includes("localhost") ||
      url.includes("127.0.0.1") ||
      url.includes("0.0.0.0") ||
      name === "ollama"
    ) {
      return { name, isLocal: true };
    }
  }
  // Fall back to first provider
  const first = Object.keys(config.providers)[0];
  return { name: first || "ollama", isLocal: false };
}

/** Resolve the provider to operate on. If explicit, use that; otherwise auto-detect local. */
function resolveProvider(
  config: ReturnType<typeof readModelsJson>,
  explicit?: string,
): { name: string; config: any } | null {
  const target = explicit || getLocalProvider(config).name;
  const provider = config.providers[target];
  if (!provider) return null;
  return { name: target, config: provider };
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  const branding = [
    `  ⚡ Pi API Mode Switcher v1.0.2`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`,
  ].join("\n");

  // ── /api command ─────────────────────────────────────────────────────

  pi.registerCommand("api", {
    description: "View and switch API modes, base URLs, thinking, and compat flags",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0]?.toLowerCase() || "";
      const rest = parts.slice(1).join(" ");

      const config = readModelsJson();
      const provider = resolveProvider(config);
      if (!provider) {
        ctx.ui.notify("No providers found in models.json", "error");
        return;
      }

      switch (sub) {
        case "":
        case "show":
          return showConfig(provider);
        case "mode":
          return setMode(ctx, provider.name, rest);
        case "url":
          return setUrl(ctx, provider.name, rest);
        case "think":
          return setThink(ctx, provider.name, rest);
        case "compat":
          return handleCompat(ctx, provider.name, rest);
        case "reload":
          return reloadConfig(ctx);
        case "modes":
          return listModes();
        case "providers":
          return listProviders(config);
        default:
          ctx.ui.notify(`Unknown sub-command: "${sub}". Use: mode, url, think, compat, reload, modes, providers`, "error");
      }
    },
  });

  // ── Sub-command implementations ──────────────────────────────────────

  function showConfig(provider: { name: string; config: any }) {
    const p = provider.config;
    const compat = p.compat || {};
    const modelCount = p.models?.length || 0;
    const firstModel = p.models?.[0]?.id || "none";

    const lines: string[] = [branding];
    lines.push(section("CURRENT PROVIDER CONFIG"));
    lines.push(info(`Provider: ${provider.name}`));
    lines.push(info(`API mode: ${p.api || "(not set)"}`));
    lines.push(info(`Base URL: ${p.baseUrl || "(not set)"}`));
    lines.push(info(`API key: ${p.apiKey ? "••••" + String(p.apiKey).slice(-4) : "(not set)"}`));
    lines.push(info(`Models: ${modelCount} (first: ${firstModel})`));

    if (Object.keys(compat).length > 0) {
      lines.push(section("COMPAT FLAGS"));
      for (const [key, value] of Object.entries(compat)) {
        lines.push(info(`  ${key}: ${JSON.stringify(value)}`));
      }
    }

    const ollamaBase = getOllamaBaseUrl();
    lines.push(section("RESOLVED"));
    lines.push(info(`Ollama base: ${ollamaBase}`));
    lines.push(info(`(strip /v1 → ${ollamaBase})`));

    pi.sendMessage({
      customType: "api-config",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") },
    });
  }

  function setMode(ctx: any, providerName: string, mode: string) {
    if (!mode) {
      ctx.ui.notify("Usage: /api mode <mode>. Use /api modes to list available modes.", "error");
      return;
    }

    // Support tab-completion style partial matching
    const modeLower = mode.toLowerCase();
    let matched = Object.keys(API_MODES).find(m => m === modeLower);
    if (!matched) {
      matched = Object.keys(API_MODES).find(m => m.includes(modeLower));
    }
    if (!matched) {
      ctx.ui.notify(`Unknown API mode: "${mode}". Use /api modes to list available modes.`, "error");
      return;
    }

    const config = readModelsJson();
    const provider = config.providers[providerName];
    if (!provider) {
      ctx.ui.notify(`Provider "${providerName}" not found in models.json`, "error");
      return;
    }

    const oldMode = provider.api || "(not set)";
    provider.api = matched;
    writeModelsJson(config);

    const lines: string[] = [branding];
    lines.push(section("API MODE CHANGED"));
    lines.push(ok(`Provider: ${providerName}`));
    lines.push(info(`Old mode: ${oldMode}`));
    lines.push(ok(`New mode: ${matched}`));
    lines.push(info(`Description: ${API_MODES[matched]}`));
    lines.push(warn("Run /api reload or /reload to apply changes in Pi"));

    pi.sendMessage({
      customType: "api-mode-changed",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") },
    });
    ctx.ui.notify(`API mode set to ${matched}`, "success");
  }

  function setUrl(ctx: any, providerName: string, url: string) {
    if (!url) {
      ctx.ui.notify("Usage: /api url <base-url>", "error");
      return;
    }

    // Normalize: ensure trailing /v1 is present for openai-completions mode
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) {
      normalizedUrl = "http://" + normalizedUrl;
    }

    const config = readModelsJson();
    const provider = config.providers[providerName];
    if (!provider) {
      ctx.ui.notify(`Provider "${providerName}" not found in models.json`, "error");
      return;
    }

    const oldUrl = provider.baseUrl || "(not set)";
    provider.baseUrl = normalizedUrl;
    writeModelsJson(config);

    const lines: string[] = [branding];
    lines.push(section("BASE URL CHANGED"));
    lines.push(ok(`Provider: ${providerName}`));
    lines.push(info(`Old URL: ${oldUrl}`));
    lines.push(ok(`New URL: ${normalizedUrl}`));
    lines.push(warn("Run /api reload or /reload to apply changes in Pi"));

    pi.sendMessage({
      customType: "api-url-changed",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") },
    });
    ctx.ui.notify(`Base URL set to ${normalizedUrl}`, "success");
  }

  function setThink(ctx: any, providerName: string, value: string) {
    if (!value) {
      ctx.ui.notify("Usage: /api think <on|off|auto>", "error");
      return;
    }

    const config = readModelsJson();
    const provider = config.providers[providerName];
    if (!provider) {
      ctx.ui.notify(`Provider "${providerName}" not found in models.json`, "error");
      return;
    }

    const models = provider.models || [];
    if (models.length === 0) {
      ctx.ui.notify(`No models found in provider "${providerName}"`, "error");
      return;
    }

    const valLower = value.toLowerCase();
    const setAll = (state: boolean | null) => {
      for (const model of models) {
        if (state === null) {
          // Auto: detect from model name
          const name = (model.id || "").toLowerCase();
          model.reasoning =
            name.includes("deepseek-r1") ||
            name.includes("qwq") ||
            name.includes("o1") ||
            name.includes("o3") ||
            name.includes("think") ||
            name.includes("qwen3");
        } else {
          model.reasoning = state;
        }
      }
    };

    if (valLower === "on" || valLower === "true" || valLower === "1") {
      setAll(true);
    } else if (valLower === "off" || valLower === "false" || valLower === "0") {
      setAll(false);
    } else if (valLower === "auto") {
      setAll(null);
    } else {
      ctx.ui.notify('Invalid value. Use: on, off, or auto', "error");
      return;
    }

    writeModelsJson(config);

    const lines: string[] = [branding];
    lines.push(section("THINKING MODE"));
    lines.push(info(`Provider: ${providerName}`));
    lines.push(info(`Mode: ${valLower}`));
    lines.push(info(`Affected ${models.length} model(s):`));
    for (const model of models) {
      lines.push(info(`  ${(model.id || "?").padEnd(40)} reasoning: ${model.reasoning ? "true" : "false"}`));
    }
    lines.push(warn("Run /api reload or /reload to apply changes in Pi"));

    pi.sendMessage({
      customType: "api-think-changed",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") },
    });
    ctx.ui.notify(`Thinking set to ${valLower} for ${models.length} model(s)`, "success");
  }

  function handleCompat(ctx: any, providerName: string, args: string) {
    const parts = args.split(/\s+/);
    const key = parts[0];
    const value = parts.slice(1).join(" ");

    if (!key) {
      // Show all compat flags for this provider
      const config = readModelsJson();
      const provider = config.providers[providerName];
      if (!provider) {
        ctx.ui.notify(`Provider "${providerName}" not found`, "error");
        return;
      }

      const compat = provider.compat || {};
      const lines: string[] = [branding];
      lines.push(section("COMPAT FLAGS"));

      if (Object.keys(compat).length === 0) {
        lines.push(info("No compat flags set"));
      } else {
        for (const [k, v] of Object.entries(compat)) {
          const flag = COMPAT_FLAGS[k];
          lines.push(info(`  ${k}: ${JSON.stringify(v)}${flag ? ` — ${flag.description}` : ""}`));
        }
      }

      lines.push(section("AVAILABLE FLAGS"));
      for (const [k, flag] of Object.entries(COMPAT_FLAGS)) {
        lines.push(info(`  ${k} = <${flag.values.join(" | ")}>  — ${flag.description}`));
      }
      lines.push(info("Usage: /api compat <key> <value>"));

      pi.sendMessage({
        customType: "api-compat-flags",
        content: lines.join("\n"),
        display: { type: "content", content: lines.join("\n") },
      });
      return;
    }

    if (!value) {
      // Show single flag
      const config = readModelsJson();
      const provider = config.providers[providerName];
      if (!provider) {
        ctx.ui.notify(`Provider "${providerName}" not found`, "error");
        return;
      }
      const current = provider.compat?.[key];
      ctx.ui.notify(`${key} = ${current !== undefined ? JSON.stringify(current) : "(not set)"}`, "info");
      return;
    }

    // Set a compat flag
    const config = readModelsJson();
    const provider = config.providers[providerName];
    if (!provider) {
      ctx.ui.notify(`Provider "${providerName}" not found`, "error");
      return;
    }

    if (!provider.compat) provider.compat = {};

    // Parse value
    let parsedValue: unknown = value;
    if (value === "true") parsedValue = true;
    else if (value === "false") parsedValue = false;
    else if (value === "null") parsedValue = null;
    else {
      try {
        parsedValue = JSON.parse(value);
      } catch {
        // Keep as string
      }
    }

    const oldValue = provider.compat[key];
    provider.compat[key] = parsedValue;
    writeModelsJson(config);

    const lines: string[] = [branding];
    lines.push(section("COMPAT FLAG SET"));
    lines.push(ok(`Provider: ${providerName}`));
    lines.push(info(`Key: ${key}`));
    lines.push(info(`Old value: ${oldValue !== undefined ? JSON.stringify(oldValue) : "(not set)"}`));
    lines.push(ok(`New value: ${JSON.stringify(parsedValue)}`));
    lines.push(warn("Run /api reload or /reload to apply changes in Pi"));

    pi.sendMessage({
      customType: "api-compat-set",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") },
    });
    ctx.ui.notify(`Compat flag ${key} set to ${JSON.stringify(parsedValue)}`, "success");
  }

  function reloadConfig(ctx: any) {
    // Pi's built-in /reload command re-reads models.json.
    // We can't invoke it directly, but we can notify the user.
    const lines: string[] = [branding];
    lines.push(section("RELOAD"));
    lines.push(ok("models.json has been modified"));
    lines.push(info("To apply changes, run Pi's built-in command:"));
    lines.push(info("  /reload"));
    lines.push(warn("This will reload all provider configurations from models.json"));

    pi.sendMessage({
      customType: "api-reload",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") },
    });
    ctx.ui.notify("Run /reload to apply models.json changes", "info");
  }

  function listModes() {
    const lines: string[] = [branding];
    lines.push(section("SUPPORTED API MODES"));

    const config = readModelsJson();
    const provider = resolveProvider(config);
    const currentMode = provider?.config?.api || "(not set)";

    for (const [mode, description] of Object.entries(API_MODES)) {
      const isActive = mode === currentMode;
      const marker = isActive ? ok(" ◀ current") : "";
      lines.push(info(`  ${mode.padEnd(30)} ${description}${marker}`));
    }

    lines.push(info(""));
    lines.push(info("Usage: /api mode <mode>"));

    pi.sendMessage({
      customType: "api-modes",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") },
    });
  }

  function listProviders(config: ReturnType<typeof readModelsJson>) {
    const lines: string[] = [branding];
    lines.push(section("PROVIDERS"));

    for (const [name, provider] of Object.entries(config.providers)) {
      const modelCount = provider.models?.length || 0;
      const url = provider.baseUrl || "(no URL)";
      const api = provider.api || "(no mode)";
      const isLocal = url.includes("localhost") || url.includes("127.0.0.1") || name === "ollama";
      lines.push(info(`  ${name}${isLocal ? " (local)" : ""}`));
      lines.push(info(`    API: ${api}  |  URL: ${url}  |  Models: ${modelCount}`));
    }

    pi.sendMessage({
      customType: "api-providers",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") },
    });
  }

  // ── Tab completion for /api sub-commands ──────────────────────────────

  pi.registerCompletion?.("api", {
    getCompletions: () => {
      return [
        { value: "mode", label: "mode", description: "Switch API mode" },
        { value: "url", label: "url", description: "Switch base URL" },
        { value: "think", label: "think", description: "Toggle thinking mode (on/off/auto)" },
        { value: "compat", label: "compat", description: "View/set compat flags" },
        { value: "reload", label: "reload", description: "Reload models.json" },
        { value: "modes", label: "modes", description: "List all supported API modes" },
        { value: "providers", label: "providers", description: "List all configured providers" },
      ];
    },
  });
}
