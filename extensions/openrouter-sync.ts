/**
 * OpenRouter Sync — Pi Coding Agent Extension
 *
 * Adds a single model (by URL or ID) from OpenRouter into models.json
 * under the "openrouter" provider. If the provider doesn't exist, it's
 * created and inserted above the "ollama" entry (if present).
 * Existing models are never removed.
 *
 * Usage:
 *   /or-sync https://openrouter.ai/liquid/lfm-2.5-1.2b-thinking:free
 *   /or-sync liquid/lfm-2.5-1.2b-thinking:free
 *   /or-sync liquid/lfm-2.5-1.2b-thinking:free liquid/qwen-2.5-1.5b:free
 *
 * Written by VTSTech
 * GitHub: https://github.com/VTSTech
 * Website: www.vts-tech.org
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
  type PiModelEntry,
  MODELS_JSON_PATH as MODELS_FILE,
  readModelsJson,
  writeModelsJson,
  BUILTIN_PROVIDERS,
  EXTENSION_VERSION,
} from "../shared/ollama";
import { section, ok, warn } from "../shared/format";

// ── Branding ──────────────────────────────────────────────────────────────

const BRANDING = [
  `  ⚡ Pi OpenRouter Sync v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`,
].join("\n");

const OR_CONFIG = BUILTIN_PROVIDERS.openrouter;

// ── Parsing ───────────────────────────────────────────────────────────────

/**
 * Extract model IDs from arguments.
 *
 * Accepts:
 *   - Full OpenRouter URLs:  https://openrouter.ai/liquid/lfm-2.5-1.2b-thinking:free
 *   - Model IDs directly:   liquid/lfm-2.5-1.2b-thinking:free
 *   - Multiple models:      model1 model2 model3
 */
function parseModelIds(args: string): string[] {
  return args
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((arg) => {
      // Strip OpenRouter URL prefix (including query parameters)
      const match = arg.match(/openrouter\.ai\/([^?#]+)/);
      return match ? match[1] : arg;
    });
}

// ── Provider ordering ─────────────────────────────────────────────────────

/**
 * Rebuild providers object with "openrouter" positioned above "ollama"
 * (if ollama exists). All other providers maintain their relative order.
 *
 * JSON objects preserve insertion order in modern JS engines, so rebuilding
 * the object reorders the keys in the output file.
 */
function ensureProviderOrder(providers: Record<string, any>): Record<string, any> {
  const ordered: Record<string, any> = {};
  const keys = Object.keys(providers);

  // Collect keys in desired order: openrouter first, then ollama (if it
  // was originally before openrouter), then everything else.
  const orIdx = keys.indexOf("openrouter");
  const olIdx = keys.indexOf("ollama");

  // If openrouter exists, emit it first
  if (orIdx !== -1) {
    ordered["openrouter"] = providers["openrouter"];
  }

  // If ollama exists and was originally before openrouter (or openrouter is new), emit it second
  if (olIdx !== -1 && (orIdx === -1 || olIdx < orIdx)) {
    ordered["ollama"] = providers["ollama"];
  }

  // Emit all remaining keys in their original relative order
  for (const key of keys) {
    if (key in ordered) continue; // already placed
    ordered[key] = providers[key];
  }

  return ordered;
}

// ── Extension ─────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  // ── Slash command: /openrouter-sync (alias: /or-sync) ─────────────────

  pi.registerCommand("openrouter-sync", {
    description:
      "Add OpenRouter model(s) to models.json. Use: /or-sync <url-or-id> [url-or-id ...]",
    async handler(args, ctx) {
      const modelIds = parseModelIds(args);

      if (modelIds.length === 0) {
        ctx.ui.notify(
          "Usage: /or-sync <model-url-or-id> — e.g. /or-sync https://openrouter.ai/liquid/lfm-2.5-1.2b-thinking:free",
          "info"
        );
        return;
      }

      ctx.ui.setStatus("openrouter-sync", `Adding ${modelIds.length} model(s)...`);

      try {
        const existing = readModelsJson();

        // Ensure openrouter provider exists
        if (!existing.providers["openrouter"]) {
          existing.providers["openrouter"] = {
            baseUrl: OR_CONFIG.baseUrl,
            api: OR_CONFIG.api,
            models: [],
          };
        }

        const orProvider = existing.providers["openrouter"];
        if (!orProvider.models) orProvider.models = [];

        const existingIds = new Set(orProvider.models.map((m: PiModelEntry) => m.id));
        const added: string[] = [];
        const skipped: string[] = [];

        for (const modelId of modelIds) {
          if (existingIds.has(modelId)) {
            skipped.push(modelId);
            continue;
          }
          orProvider.models.push({ id: modelId } as PiModelEntry);
          added.push(modelId);
        }

        // Reorder providers so openrouter is above ollama
        existing.providers = ensureProviderOrder(existing.providers);

        writeModelsJson(existing);

        // ── Build report ─────────────────────────────────────────────────
        const lines: string[] = [""];
        lines.push(`  Provider: openrouter (built-in)`);
        lines.push(`  Base URL: ${OR_CONFIG.baseUrl}`);
        lines.push(`  Total models: ${orProvider.models.length}`);

        if (added.length > 0) {
          lines.push(section("Added"));
          for (const id of added) lines.push(ok(id));
        }

        if (skipped.length > 0) {
          lines.push(section("Already Present"));
          for (const id of skipped) lines.push(warn(id));
        }

        lines.push("");
        lines.push(`  Written to ${MODELS_FILE}`);
        lines.push(`  Run /reload to pick up changes`);
        lines.push(BRANDING);

        const report = lines.join("\n");

        // Notify short summary
        const summary: string[] = [];
        if (added.length > 0) summary.push(`+${added.join(", ")}`);
        if (skipped.length > 0) summary.push(`skipped: ${skipped.join(", ")}`);
        ctx.ui.notify(summary.join(" · ") || "No changes", added.length > 0 ? "success" : "info");

        // Display full report
        pi.sendMessage({
          customType: "openrouter-sync-report",
          content: report,
          display: { type: "content", content: report },
          details: { timestamp: new Date().toISOString(), added: added.length, skipped: skipped.length },
        });
      } catch (err: any) {
        ctx.ui.notify(`Failed: ${err.message}`, "error");
      }

      ctx.ui.setStatus("openrouter-sync", undefined);
    },
  });

  // ── Tool: openrouter_sync ──────────────────────────────────────────────

  pi.registerTool({
    name: "openrouter_sync",
    label: "OpenRouter Sync",
    description:
      "Add one or more OpenRouter model IDs to Pi's models.json under the openrouter provider.\n" +
      "Accepts full URLs (https://openrouter.ai/...) or bare model IDs (owner/model:tag).\n" +
      "The openrouter provider is created if it doesn't exist, and positioned above ollama.\n" +
      "Existing models are never removed.\n\n" +
      BRANDING,
    parameters: {
      type: "object",
      properties: {
        models: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of model identifiers — full OpenRouter URLs or bare IDs. " +
            'e.g. ["https://openrouter.ai/liquid/lfm-2.5-1.2b-thinking:free", "nvidia/nemotron-3-nano-30b-a3b:free"]',
        },
      },
      required: ["models"],
    } as any,
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      const rawModels = (params as any)?.models;
      if (!Array.isArray(rawModels) || rawModels.length === 0) {
        return {
          content: [{ type: "text", text: "Error: 'models' must be a non-empty array of model IDs or URLs." }],
          details: {},
        };
      }

      const modelIds = parseModelIds(rawModels.join(" "));
      const existing = readModelsJson();

      if (!existing.providers["openrouter"]) {
        existing.providers["openrouter"] = {
          baseUrl: OR_CONFIG.baseUrl,
          api: OR_CONFIG.api,
          models: [],
        };
      }

      const orProvider = existing.providers["openrouter"];
      if (!orProvider.models) orProvider.models = [];

      const existingIds = new Set(orProvider.models.map((m: PiModelEntry) => m.id));
      const added: string[] = [];
      const skipped: string[] = [];

      for (const modelId of modelIds) {
        if (existingIds.has(modelId)) {
          skipped.push(modelId);
          continue;
        }
        orProvider.models.push({ id: modelId } as PiModelEntry);
        added.push(modelId);
      }

      existing.providers = ensureProviderOrder(existing.providers);
      writeModelsJson(existing);

      const modelList = orProvider.models.map((m: PiModelEntry) => `  - ${m.id}`).join("\n");
      const report = [
        BRANDING,
        "",
        `Added ${added.length} model(s) to openrouter provider (${orProvider.models.length} total).`,
        ...(added.length > 0 ? ["\nAdded:"] : []),
        ...added.map((id) => `  + ${id}`),
        ...(skipped.length > 0 ? ["\nSkipped (already present):"] : []),
        ...skipped.map((id) => `  = ${id}`),
        "",
        `Written to ${MODELS_FILE}. Run /reload to pick up changes.`,
        "",
        "Current openrouter models:",
        modelList,
      ].join("\n");

      return {
        content: [{ type: "text", text: report }],
        details: { added: added.length, skipped: skipped.length, total: orProvider.models.length },
      };
    },
  });
}
