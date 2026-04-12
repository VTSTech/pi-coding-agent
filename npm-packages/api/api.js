// .build-npm/api/api.temp.ts
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";
import { section, ok, info, warn } from "@vtstech/pi-shared/format";
import { readModelsJson, writeModelsJson, getOllamaBaseUrl, BUILTIN_PROVIDERS, EXTENSION_VERSION } from "@vtstech/pi-shared/ollama";
var API_MODES = {
  "anthropic-messages": "Anthropic Claude API and compatibles",
  "openai-completions": "OpenAI Chat Completions API and compatibles",
  "openai-responses": "OpenAI Responses API",
  "azure-openai-responses": "Azure OpenAI Responses API",
  "openai-codex-responses": "OpenAI Codex Responses API",
  "mistral-conversations": "Mistral SDK Conversations/Chat streaming",
  "google-generative-ai": "Google Generative AI API",
  "google-gemini-cli": "Google Cloud Code Assist API",
  "google-vertex": "Google Vertex AI API",
  "bedrock-converse-stream": "Amazon Bedrock Converse API"
};
var COMPAT_FLAGS = {
  supportsDeveloperRole: {
    description: 'Use "system" instead of "developer" role',
    values: ["true", "false"]
  },
  supportsReasoningEffort: {
    description: "Provider supports reasoning effort parameter",
    values: ["true", "false"]
  },
  maxTokensField: {
    description: 'Token field name ("max_tokens" or "max_completion_tokens")',
    values: ["max_tokens", "max_completion_tokens"]
  },
  requiresToolResultName: {
    description: "Tool results need name field",
    values: ["true", "false"]
  },
  thinkingFormat: {
    description: "Thinking token format (e.g., qwen, deepseek)",
    values: ["qwen", "deepseek", "default"]
  }
};
var SETTINGS_PATH = path.join(os.homedir(), ".pi", "agent", "settings.json");
function readSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
    }
  } catch {
  }
  return {};
}
function writeSettings(data) {
  const dir = path.dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2) + "\n", "utf-8");
}
function getLocalProvider(config) {
  for (const [name, provider] of Object.entries(config.providers)) {
    const url = provider.baseUrl || "";
    if (url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0") || name === "ollama") {
      return { name, isLocal: true };
    }
  }
  const first = Object.keys(config.providers)[0];
  return { name: first || "ollama", isLocal: false };
}
function resolveProvider(config, explicit) {
  const target = explicit || getLocalProvider(config).name;
  const provider = config.providers[target];
  if (!provider) return null;
  return { name: target, config: provider };
}
function api_temp_default(pi) {
  const branding = [
    `  \u26A1 Pi API Mode Switcher v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`
  ].join("\n");
  pi.registerCommand("api", {
    description: "View and switch API modes, base URLs, thinking, and compat flags",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      const sub = parts[0]?.toLowerCase() || "";
      const rest = parts.slice(1).join(" ");
      const config = readModelsJson();
      if (sub !== "provider" && sub !== "providers") {
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
          default:
            ctx.ui.notify(`Unknown sub-command: "${sub}". Use: mode, url, think, compat, reload, modes, provider, providers`, "error");
        }
      }
      if (sub === "provider" || sub === "providers") {
        return handleProvider(ctx, config, rest);
      }
    }
  });
  function showConfig(provider) {
    const p = provider.config;
    const compat = p.compat || {};
    const modelCount = p.models?.length || 0;
    const firstModel = p.models?.[0]?.id || "none";
    const lines = [branding];
    lines.push(section("CURRENT PROVIDER CONFIG"));
    lines.push(info(`Provider: ${provider.name}`));
    lines.push(info(`API mode: ${p.api || "(not set)"}`));
    lines.push(info(`Base URL: ${p.baseUrl || "(not set)"}`));
    lines.push(info(`API key: ${p.apiKey ? "\u2022\u2022\u2022\u2022" + String(p.apiKey).slice(-4) : "(not set)"}`));
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
    lines.push(info(`(strip /v1 \u2192 ${ollamaBase})`));
    pi.sendMessage({
      customType: "api-config",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") }
    });
  }
  function setMode(ctx, providerName, mode) {
    if (!mode) {
      ctx.ui.notify("Usage: /api mode <mode>. Use /api modes to list available modes.", "error");
      return;
    }
    const modeLower = mode.toLowerCase();
    let matched = Object.keys(API_MODES).find((m) => m === modeLower);
    if (!matched) {
      matched = Object.keys(API_MODES).find((m) => m.includes(modeLower));
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
    const lines = [branding];
    lines.push(section("API MODE CHANGED"));
    lines.push(ok(`Provider: ${providerName}`));
    lines.push(info(`Old mode: ${oldMode}`));
    lines.push(ok(`New mode: ${matched}`));
    lines.push(info(`Description: ${API_MODES[matched]}`));
    lines.push(warn("Run /api reload or /reload to apply changes in Pi"));
    pi.sendMessage({
      customType: "api-mode-changed",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") }
    });
    ctx.ui.notify(`API mode set to ${matched}`, "success");
  }
  function setUrl(ctx, providerName, url) {
    if (!url) {
      ctx.ui.notify("Usage: /api url <base-url>", "error");
      return;
    }
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
    const lines = [branding];
    lines.push(section("BASE URL CHANGED"));
    lines.push(ok(`Provider: ${providerName}`));
    lines.push(info(`Old URL: ${oldUrl}`));
    lines.push(ok(`New URL: ${normalizedUrl}`));
    lines.push(warn("Run /api reload or /reload to apply changes in Pi"));
    pi.sendMessage({
      customType: "api-url-changed",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") }
    });
    ctx.ui.notify(`Base URL set to ${normalizedUrl}`, "success");
  }
  function setThink(ctx, providerName, value) {
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
    const setAll = (state) => {
      for (const model of models) {
        if (state === null) {
          const name = (model.id || "").toLowerCase();
          model.reasoning = name.includes("deepseek-r1") || name.includes("qwq") || name.includes("o1") || name.includes("o3") || name.includes("think") || name.includes("qwen3");
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
      ctx.ui.notify("Invalid value. Use: on, off, or auto", "error");
      return;
    }
    writeModelsJson(config);
    const lines = [branding];
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
      display: { type: "content", content: lines.join("\n") }
    });
    ctx.ui.notify(`Thinking set to ${valLower} for ${models.length} model(s)`, "success");
  }
  function handleCompat(ctx, providerName, args) {
    const parts = args.split(/\s+/);
    const key = parts[0];
    const value = parts.slice(1).join(" ");
    if (!key) {
      const config2 = readModelsJson();
      const provider2 = config2.providers[providerName];
      if (!provider2) {
        ctx.ui.notify(`Provider "${providerName}" not found`, "error");
        return;
      }
      const compat = provider2.compat || {};
      const lines2 = [branding];
      lines2.push(section("COMPAT FLAGS"));
      if (Object.keys(compat).length === 0) {
        lines2.push(info("No compat flags set"));
      } else {
        for (const [k, v] of Object.entries(compat)) {
          const flag = COMPAT_FLAGS[k];
          lines2.push(info(`  ${k}: ${JSON.stringify(v)}${flag ? ` \u2014 ${flag.description}` : ""}`));
        }
      }
      lines2.push(section("AVAILABLE FLAGS"));
      for (const [k, flag] of Object.entries(COMPAT_FLAGS)) {
        lines2.push(info(`  ${k} = <${flag.values.join(" | ")}>  \u2014 ${flag.description}`));
      }
      lines2.push(info("Usage: /api compat <key> <value>"));
      pi.sendMessage({
        customType: "api-compat-flags",
        content: lines2.join("\n"),
        display: { type: "content", content: lines2.join("\n") }
      });
      return;
    }
    if (!value) {
      const config2 = readModelsJson();
      const provider2 = config2.providers[providerName];
      if (!provider2) {
        ctx.ui.notify(`Provider "${providerName}" not found`, "error");
        return;
      }
      const current = provider2.compat?.[key];
      ctx.ui.notify(`${key} = ${current !== void 0 ? JSON.stringify(current) : "(not set)"}`, "info");
      return;
    }
    const config = readModelsJson();
    const provider = config.providers[providerName];
    if (!provider) {
      ctx.ui.notify(`Provider "${providerName}" not found`, "error");
      return;
    }
    if (!provider.compat) provider.compat = {};
    let parsedValue = value;
    if (value === "true") parsedValue = true;
    else if (value === "false") parsedValue = false;
    else if (value === "null") parsedValue = null;
    else {
      try {
        parsedValue = JSON.parse(value);
      } catch {
      }
    }
    const oldValue = provider.compat[key];
    provider.compat[key] = parsedValue;
    writeModelsJson(config);
    const lines = [branding];
    lines.push(section("COMPAT FLAG SET"));
    lines.push(ok(`Provider: ${providerName}`));
    lines.push(info(`Key: ${key}`));
    lines.push(info(`Old value: ${oldValue !== void 0 ? JSON.stringify(oldValue) : "(not set)"}`));
    lines.push(ok(`New value: ${JSON.stringify(parsedValue)}`));
    lines.push(warn("Run /api reload or /reload to apply changes in Pi"));
    pi.sendMessage({
      customType: "api-compat-set",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") }
    });
    ctx.ui.notify(`Compat flag ${key} set to ${JSON.stringify(parsedValue)}`, "success");
  }
  function reloadConfig(ctx) {
    const lines = [branding];
    lines.push(section("RELOAD"));
    lines.push(ok("models.json has been modified"));
    lines.push(info("To apply changes, run Pi's built-in command:"));
    lines.push(info("  /reload"));
    lines.push(warn("This will reload all provider configurations from models.json"));
    pi.sendMessage({
      customType: "api-reload",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") }
    });
    ctx.ui.notify("Run /reload to apply models.json changes", "info");
  }
  function listModes() {
    const lines = [branding];
    lines.push(section("SUPPORTED API MODES"));
    const config = readModelsJson();
    const provider = resolveProvider(config);
    const currentMode = provider?.config?.api || "(not set)";
    for (const [mode, description] of Object.entries(API_MODES)) {
      const isActive = mode === currentMode;
      const marker = isActive ? ok(" \u25C0 current") : "";
      lines.push(info(`  ${mode.padEnd(30)} ${description}${marker}`));
    }
    lines.push(info(""));
    lines.push(info("Usage: /api mode <mode>"));
    pi.sendMessage({
      customType: "api-modes",
      content: lines.join("\n"),
      display: { type: "content", content: lines.join("\n") }
    });
  }
  function handleProvider(ctx, config, arg) {
    const parts = arg.trim().split(/\s+/);
    const sub = parts[0]?.toLowerCase() || "";
    const rest = parts.slice(1).join(" ");
    const providerNames = Object.keys(config.providers);
    if (!sub || sub === "show" || sub === "list") {
      const settings = readSettings();
      const defaultProvider = settings.defaultProvider || "(not set)";
      const defaultModel = settings.defaultModel || "(not set)";
      const lines = [branding];
      lines.push(section("DEFAULT PROVIDER"));
      lines.push(ok(`Provider: ${defaultProvider}`));
      lines.push(info(`Model: ${defaultModel}`));
      lines.push(info(`Source: ${SETTINGS_PATH}`));
      lines.push(section("CONFIGURED PROVIDERS"));
      if (providerNames.length === 0) {
        lines.push(info("  (none \u2014 add providers to models.json)"));
      } else {
        for (const [name, provider] of Object.entries(config.providers)) {
          const p = provider;
          const modelCount = p.models?.length || 0;
          const url = p.baseUrl || "(no URL)";
          const api = p.api || "(no mode)";
          const isDefault = name === defaultProvider;
          const isLocal = url.includes("localhost") || url.includes("127.0.0.1") || url.includes("0.0.0.0") || name === "ollama";
          const marker = isDefault ? ok(" \u25C0 default") : "";
          const tag = isLocal ? " (local)" : " (cloud)";
          lines.push(info(`  ${name}${tag}${marker}`));
          lines.push(info(`    API: ${api}  |  URL: ${url}  |  Models: ${modelCount}`));
          if (modelCount > 0) {
            const first = p.models[0].id;
            lines.push(info(`    First model: ${first}${modelCount > 1 ? ` (+${modelCount - 1} more)` : ""}`));
          }
        }
      }
      const unconfigured = Object.entries(BUILTIN_PROVIDERS).filter(
        ([name]) => !providerNames.includes(name)
      );
      if (unconfigured.length > 0) {
        lines.push(section("AVAILABLE PROVIDERS"));
        lines.push(info("  (not in models.json \u2014 configure with API key env var)"));
        for (const [name, info2] of unconfigured) {
          const hasKey = !!process.env[info2.envKey];
          const status = hasKey ? ok("API key set") : info("no API key");
          lines.push(info(`  ${name.padEnd(14)} ${info2.api.padEnd(26)} ${status}`));
          lines.push(info(`    URL: ${info2.baseUrl}`));
          lines.push(info(`    Env:  ${info2.envKey}`));
        }
      }
      lines.push("");
      lines.push(info("Usage: /api provider set <name>  \u2014  set default provider"));
      lines.push(info("       /api provider list         \u2014  show all providers"));
      pi.sendMessage({
        customType: "api-provider",
        content: lines.join("\n"),
        display: { type: "content", content: lines.join("\n") }
      });
      return;
    }
    if (sub === "set" || sub === "change" || sub === "switch") {
      const targetName = rest;
      if (!targetName) {
        const lines2 = [branding];
        lines2.push(section("SET DEFAULT PROVIDER"));
        lines2.push(info("Usage: /api provider set <name>"));
        lines2.push(info(""));
        lines2.push(info("Configured providers:"));
        for (const name of providerNames) {
          const p = config.providers[name];
          const isLocal = (p.baseUrl || "").includes("localhost") || (p.baseUrl || "").includes("127.0.0.1") || name === "ollama";
          lines2.push(info(`  ${name}${isLocal ? " (local)" : " (cloud)"}`));
        }
        const builtins = Object.keys(BUILTIN_PROVIDERS).filter((n) => !providerNames.includes(n));
        if (builtins.length > 0) {
          lines2.push(info("Built-in providers:"));
          for (const name of builtins) {
            lines2.push(info(`  ${name} (built-in)`));
          }
        }
        pi.sendMessage({
          customType: "api-provider-set",
          content: lines2.join("\n"),
          display: { type: "content", content: lines2.join("\n") }
        });
        ctx.ui.notify("Specify a provider name: /api provider set <name>", "info");
        return;
      }
      const isBuiltin = targetName in BUILTIN_PROVIDERS;
      if (!config.providers[targetName] && !isBuiltin) {
        const allNames = [...providerNames, ...Object.keys(BUILTIN_PROVIDERS).filter((n) => !providerNames.includes(n))];
        ctx.ui.notify(`Provider "${targetName}" not found. Available: ${allNames.join(", ")}`, "error");
        return;
      }
      const settings = readSettings();
      const oldProvider = settings.defaultProvider || "(not set)";
      const oldModel = settings.defaultModel || "(not set)";
      settings.defaultProvider = targetName;
      const targetModels = config.providers[targetName]?.models || [];
      if (targetModels.length > 0) {
        settings.defaultModel = targetModels[0].id;
      } else if (isBuiltin) {
        settings.defaultModel = "(Pi default)";
      }
      writeSettings(settings);
      const lines = [branding];
      lines.push(section("DEFAULT PROVIDER CHANGED"));
      lines.push(ok(`New provider: ${targetName}`));
      lines.push(info(`Old provider: ${oldProvider}`));
      lines.push(info(`Old model: ${oldModel}`));
      if (targetModels.length > 0) {
        lines.push(ok(`Auto-set model: ${targetModels[0].id}`));
        lines.push(info(`Available models: ${targetModels.map((m) => m.id).join(", ")}`));
      } else if (isBuiltin) {
        lines.push(info(`Built-in provider \u2014 Pi will use its default model`));
        lines.push(info(`Ensure ${BUILTIN_PROVIDERS[targetName].envKey} is set`));
      }
      lines.push(warn("Run /reload to apply changes in Pi"));
      pi.sendMessage({
        customType: "api-provider-changed",
        content: lines.join("\n"),
        display: { type: "content", content: lines.join("\n") }
      });
      ctx.ui.notify(`Default provider set to ${targetName}`, "success");
      return;
    }
    if (providerNames.includes(sub) || sub in BUILTIN_PROVIDERS) {
      return handleProvider(ctx, config, `set ${sub}`);
    }
    ctx.ui.notify(`Unknown sub-command: "${sub}". Use: show, set, list, or a provider name`, "error");
  }
  pi.registerCompletion?.("api", {
    getCompletions: () => {
      return [
        { value: "mode", label: "mode", description: "Switch API mode" },
        { value: "url", label: "url", description: "Switch base URL" },
        { value: "think", label: "think", description: "Toggle thinking mode (on/off/auto)" },
        { value: "compat", label: "compat", description: "View/set compat flags" },
        { value: "reload", label: "reload", description: "Reload models.json" },
        { value: "modes", label: "modes", description: "List all supported API modes" },
        { value: "provider", label: "provider", description: "Show, set, or list all providers" }
      ];
    },
    getArgumentCompletions: (args) => {
      const sub = args[0]?.toLowerCase() || "";
      if (sub === "provider" && args.length >= 2) {
        const action = args[1]?.toLowerCase() || "";
        if (["set", "change", "switch"].includes(action) && args.length === 3) {
          const config = readModelsJson();
          const items = [];
          for (const name of Object.keys(config.providers)) {
            items.push({ value: name, label: name, description: `Set ${name} as default provider` });
          }
          for (const name of Object.keys(BUILTIN_PROVIDERS)) {
            if (!config.providers[name]) {
              items.push({ value: name, label: name, description: `Set ${name} (built-in)` });
            }
          }
          return items;
        }
        if (args.length === 2) {
          const config = readModelsJson();
          const items = [
            { value: "set", label: "set", description: "Set default provider" },
            { value: "list", label: "list", description: "Show all providers" },
            { value: "show", label: "show", description: "Show current provider" }
          ];
          for (const name of Object.keys(config.providers)) {
            items.push({ value: name, label: name, description: `Switch to ${name}` });
          }
          for (const name of Object.keys(BUILTIN_PROVIDERS)) {
            if (!config.providers[name]) {
              items.push({ value: name, label: name, description: `Switch to ${name} (built-in)` });
            }
          }
          return items;
        }
      }
      if (sub === "mode" && args.length === 2) {
        return Object.keys(API_MODES).map((mode) => ({
          value: mode,
          label: mode,
          description: API_MODES[mode]
        }));
      }
      if (sub === "think" && args.length === 2) {
        return [
          { value: "on", label: "on", description: "Enable thinking for all models" },
          { value: "off", label: "off", description: "Disable thinking for all models" },
          { value: "auto", label: "auto", description: "Auto-detect thinking from model name" }
        ];
      }
      return [];
    }
  });
}
export {
  api_temp_default as default
};
