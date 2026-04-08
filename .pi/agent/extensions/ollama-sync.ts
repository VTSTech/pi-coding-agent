import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const MODELS_FILE = join(os.homedir(), ".pi", "agent", "models.json");

function getDefaultOllamaUrl(): string {
  // Check OLLAMA_HOST env var first (set by Ollama itself), then fall back to localhost
  return process.env.OLLAMA_HOST
    ? `http://${process.env.OLLAMA_HOST.replace(/^https?:\/\//, "")}`
    : "http://localhost:11434";
}

const DEFAULT_OLLAMA_URL = getDefaultOllamaUrl();

const BRANDING = [
  `  ⚡ Pi Ollama Sync v1.0`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`,
].join("\n");

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

interface PiModelsJson {
  providers: Record<string, {
    baseUrl?: string;
    api?: string;
    apiKey?: string;
    compat?: Record<string, any>;
    models: Array<{ id: string; reasoning?: boolean; [key: string]: any }>;
  }>;
}

async function fetchOllamaModels(baseUrl: string): Promise<OllamaModel[]> {
  const res = await fetch(`${baseUrl}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`);
  const data = await res.json();
  return data.models ?? [];
}

async function readModelsJson(): Promise<PiModelsJson> {
  if (!existsSync(MODELS_FILE)) return { providers: {} };
  const raw = await readFile(MODELS_FILE, "utf-8");
  return JSON.parse(raw);
}

async function writeModelsJson(data: PiModelsJson): Promise<void> {
  const dir = join(os.homedir(), ".pi", "agent");
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(MODELS_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function getProviderConfig(existing: PiModelsJson) {
  // Preserve existing Ollama provider config
  const ollama = existing.providers["ollama"];
  return {
    baseUrl: ollama?.baseUrl ?? DEFAULT_OLLAMA_URL + "/v1",
    api: ollama?.api ?? "openai-completions",
    apiKey: ollama?.apiKey ?? "ollama",
    compat: ollama?.compat ?? {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };
}

function isReasoningModel(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.includes("deepseek-r1") ||
    lower.includes("qwq") ||
    lower.includes("o1") ||
    lower.includes("o3") ||
    lower.includes("think") ||
    lower.includes("reason")
  );
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("ollama-sync", {
    description: "Sync models from Ollama into models.json. Use: /ollama-sync [url]",
    getArgumentCompletions: async () => [
      { label: DEFAULT_OLLAMA_URL, description: `Default Ollama URL (from $OLLAMA_HOST or localhost)` },
    ],
    async handler(args, ctx) {
      const arg = args.trim();
      const overrideUrl = arg || undefined;
      ctx.ui.setStatus("ollama-sync", "Fetching models from Ollama...");

      try {
        const existing = await readModelsJson();
        const config = getProviderConfig(existing);

        // URL priority: CLI arg > models.json baseUrl > env var / localhost
        const ollamaBaseUrl = overrideUrl
          ? overrideUrl.replace(/\/v1$/, "").replace(/\/+$/, "")
          : config.baseUrl?.replace(/\/v1$/, "") ?? DEFAULT_OLLAMA_URL;

        const models = await fetchOllamaModels(ollamaBaseUrl);

        if (models.length === 0) {
          ctx.ui.notify("No models found in Ollama", "info");
          ctx.ui.setStatus("ollama-sync", undefined);
          return;
        }

        // Sort by size ascending
        const sorted = [...models].sort((a, b) => a.size - b.size);

        // Build model entries
        const newModels = sorted.map((m) => ({
          id: m.name,
          reasoning: isReasoningModel(m.name),
        }));

        // Check what changed
        const oldIds = new Set(
          existing.providers["ollama"]?.models?.map((m) => m.id) ?? []
        );
        const newIds = new Set(newModels.map((m) => m.id));
        const added = newModels.filter((m) => !oldIds.has(m.id));
        const removed = [...oldIds].filter((id) => !newIds.has(id));

        // Merge: preserve any extra per-model settings (like manually set reasoning flags)
        const oldModelMap = new Map(
          existing.providers["ollama"]?.models?.map((m) => [m.id, m]) ?? []
        );
        const mergedModels = newModels.map((m) => {
          const old = oldModelMap.get(m.id);
          if (old && Object.keys(old).length > 2) {
            // Had extra fields, merge them
            return { ...old, id: m.id, reasoning: m.reasoning };
          }
          return m;
        });

        // Write back
        existing.providers["ollama"] = {
          ...config,
          models: mergedModels,
        };
        await writeModelsJson(existing);

        // Build report with branding
        const lines: string[] = [""];
        lines.push(`  Ollama: ${ollamaBaseUrl}`);
        lines.push(`  Synced ${newModels.length} models from Ollama`);
        if (added.length > 0) {
          lines.push(`  Added: ${added.map(m => m.id).join(", ")}`);
        }
        if (removed.length > 0) {
          lines.push(`  Removed: ${removed.join(", ")}`);
        }
        if (added.length === 0 && removed.length === 0) {
          lines.push(`  No changes — already in sync`);
        }
        lines.push(`  Written to ${MODELS_FILE}`);
        lines.push(`  Run /reload to pick up changes`);
        lines.push(BRANDING);

        const report = lines.join("\n");

        // Notify short summary
        const summary: string[] = [`Synced ${newModels.length} models`];
        if (added.length > 0) summary.push(`+${added.map(m => m.id).join(", ")}`);
        if (removed.length > 0) summary.push(`-${removed.join(", ")}`);
        ctx.ui.notify(summary.join(" · "), "success");

        // Display full report with branding
        pi.sendMessage({
          customType: "ollama-sync-report",
          content: report,
          display: { type: "content", content: report },
          details: { timestamp: new Date().toISOString(), added: added.length, removed: removed.length },
        });
      } catch (err: any) {
        ctx.ui.notify(`Failed: ${err.message}`, "error");
      }

      ctx.ui.setStatus("ollama-sync", undefined);
    },
  });

  // Also expose as a tool so the LLM can call it
  pi.registerTool({
    name: "ollama_sync",
    label: "Ollama Sync",
    description: "Sync available models from an Ollama instance into Pi's models.json config file. Supports local or remote Ollama.\n\n" + BRANDING,
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "Ollama base URL (e.g. http://192.168.1.100:11434). If omitted, uses models.json or OLLAMA_HOST env var." },
      },
    } as any,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const overrideUrl = (params as any)?.url as string | undefined;
      const existing = await readModelsJson();
      const config = getProviderConfig(existing);
      const ollamaBaseUrl = overrideUrl
        ? overrideUrl.replace(/\/v1$/, "").replace(/\/+$/, "")
        : config.baseUrl?.replace(/\/v1$/, "") ?? DEFAULT_OLLAMA_URL;

      try {
        const models = await fetchOllamaModels(ollamaBaseUrl);
        const sorted = [...models].sort((a, b) => a.size - b.size);
        const newModels = sorted.map((m) => ({
          id: m.name,
          reasoning: isReasoningModel(m.name),
        }));

        const oldModelMap = new Map(
          existing.providers["ollama"]?.models?.map((m) => [m.id, m]) ?? []
        );
        const mergedModels = newModels.map((m) => {
          const old = oldModelMap.get(m.id);
          if (old && Object.keys(old).length > 2) return { ...old, id: m.id, reasoning: m.reasoning };
          return m;
        });

        existing.providers["ollama"] = { ...config, models: mergedModels };
        await writeModelsJson(existing);

        return {
          content: [{ type: "text", text: `${BRANDING}\n\nSynced ${newModels.length} models from ${ollamaBaseUrl} to ${MODELS_FILE}. Run /reload to pick up changes.` }],
          details: { models: newModels },
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Error: ${err.message}` }],
          details: {},
        };
      }
    },
  });
}