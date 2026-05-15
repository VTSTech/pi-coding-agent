import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// ── Shared imports ─────────────────────────────────────────────────────────
import { EXTENSION_VERSION, readModelsJson, readModifyWriteModelsJson } from "../shared/ollama";
import { section, ok, fail, warn, info } from "../shared/format";
import { debugLog } from "../shared/debug";

// ── Configuration ──────────────────────────────────────────────────────────

interface BitNetConfig {
  baseUrl: string;
  apiKey?: string;
  timeout: number;
}

// Load config from models.json or environment
function loadConfig(): BitNetConfig {
  try {
    const models = readModelsJson();
    const provider = models.providers?.bitnet;
    if (provider) {
      return {
        baseUrl: provider.baseUrl || process.env.BITNET_BASE_URL || "http://localhost:8080",
        apiKey: provider.apiKey || process.env.BITNET_API_KEY,
        timeout: parseInt(process.env.BITNET_TIMEOUT || "30000"),
      };
    }
  } catch (error) {
    debugLog("bitnet", "Failed to load config from models.json", error);
  }
  
  return {
    baseUrl: process.env.BITNET_BASE_URL || "http://localhost:8080",
    apiKey: process.env.BITNET_API_KEY,
    timeout: parseInt(process.env.BITNET_TIMEOUT || "30000"),
  };
}

let config = loadConfig();

// ── Helper Functions ───────────────────────────────────────────────────────

async function checkBitNetHealth(baseUrl: string): Promise<{ healthy: boolean; details?: string }> {
  try {
    const response = await fetch(`${baseUrl}/health`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return { healthy: response.status === 200, details: `HTTP ${response.status}` };
  } catch (error: any) {
    return { healthy: false, details: error.message || "Connection failed" };
  }
}

async function discoverBitNetModels(baseUrl: string): Promise<any[]> {
  try {
    const response = await fetch(`${baseUrl}/props`, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });
    const props = await response.json();
    
    const modelPath = props.model_path || props.default_generation_settings?.model || "";
    const modelName = modelPath.split('/').pop()?.replace(/\.(gguf|bin)$/, '') || "bitnet";
    
    return [{
      name: modelName,
      contextWindow: 1024,
      maxTokens: 512,
      details: { 
        family: "bitnet", 
        backend: "llama-cpp",
        model_path: modelPath,
      }
    }];
  } catch (error) {
    return [{
      name: "bitnet",
      contextWindow: 1024,
      maxTokens: 512,
      details: { 
        family: "bitnet", 
        backend: "llama-cpp",
        status: "server unavailable"
      }
    }];
  }
}

function sanitizeForBitnet(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\|.*\|/g, '')
    .replace(/^[-]+$\n?/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/#+\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();
}

// ── Extension ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const branding = [
    `  ⚡ Pi BitNet Extension v${EXTENSION_VERSION}`,
    `  Written by VTSTech`,
    `  GitHub: https://github.com/VTSTech`,
    `  Website: www.vts-tech.org`,
  ].join("\n");

  console.log(branding);
  console.log(`[bitnet] Loaded config from: ${config.baseUrl}`);

  // Register BitNet provider
  pi.registerProvider("bitnet", {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    api: "openai-compat",
    models: [],
  });

  // Discover models on startup
  pi.on("resources_discover", async () => {
    try {
      const models = await discoverBitNetModels(config.baseUrl);
      console.log(`[bitnet] Discovered ${models.length} models`);
    } catch (error) {
      console.log(`[bitnet] Using fallback configuration`);
    }
  });

  // ── Commands ─────────────────────────────────────────────────────────────

  pi.registerCommand("bitnet", {
    description: "BitNet server management",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["--status", "--url", "--sync"];
      return subcommands
        .filter(cmd => cmd.startsWith(prefix))
        .map(cmd => ({ value: cmd, label: cmd }));
    },
    handler: async (args, ctx) => {
      // Parse arguments
      let argsArray: string[] = [];
      if (Array.isArray(args)) {
        argsArray = args.filter(Boolean);
      } else if (args && typeof args === 'string') {
        if (args.startsWith('--url ')) {
          argsArray = ['--url', args.substring(6).trim()];
        } else if (args === '--url') {
          argsArray = ['--url'];
        } else {
          argsArray = [args];
        }
      }

      if (argsArray.length === 0 || argsArray[0] === "--status") {
        // Status command
        const { healthy, details } = await checkBitNetHealth(config.baseUrl);
        const models = await discoverBitNetModels(config.baseUrl);
        
        // Show clear, meaningful status
        ctx.ui.notify(`BitNet Server Status: ${healthy ? "🟢 HEALTHY" : "🔴 UNHEALTHY"}`, healthy ? "success" : "error");
        ctx.ui.notify(`Server URL: ${config.baseUrl}`, "info");
        ctx.ui.notify(`Details: ${details || "OK"}`, "info");
        ctx.ui.notify(`Discovered Models: ${models.map(m => m.name).join(", ") || "None"}`, "info");
        
        if (!healthy) {
          ctx.ui.notify("💡 Tip: Start your BitNet server or check the URL with /bitnet --url", "warning");
        }
      } else if (argsArray[0] === "--url") {
        // URL command
        if (argsArray[1]) {
          // Set URL
          try {
            new URL(argsArray[1]); // Validate URL
          } catch {
            ctx.ui.notify(`Invalid URL: ${argsArray[1]}`, "error");
            return;
          }

          const oldUrl = config.baseUrl;
          config.baseUrl = argsArray[1];
          
          try {
            // Update models.json with complete provider config
            await readModifyWriteModelsJson((models) => {
              models.providers["bitnet"] = {
                baseUrl: config.baseUrl,
                api: "openai-compat",
                apiKey: config.apiKey || "",
                models: [{
                  id: "bitnet",
                  contextWindow: 1024,
                  maxTokens: 512
                }]
              };
              return models;
            });

            // Update runtime provider
            pi.registerProvider("bitnet", {
              baseUrl: config.baseUrl,
              apiKey: config.apiKey,
              api: "openai-compat",
              models: [{
                id: "bitnet",
                contextWindow: 1024,
                maxTokens: 512
              }],
            });

            ctx.ui.notify(`✅ BitNet URL updated to: ${argsArray[1]}`, "success");
            ctx.ui.notify(`🔄 Previous URL: ${oldUrl}`, "info");
            
            // Verify the new URL
            const { healthy, details } = await checkBitNetHealth(config.baseUrl);
            if (healthy) {
              ctx.ui.notify(`✅ New server is responding`, "success");
            } else {
              ctx.ui.notify(`⚠️ New server not responding: ${details}`, "warning");
            }
          } catch (error) {
            config.baseUrl = oldUrl;
            ctx.ui.notify(`❌ Failed to update URL: ${error.message}`, "error");
            ctx.ui.notify(`🔄 Reverted to: ${oldUrl}`, "info");
          }
        } else {
          // Get URL
          ctx.ui.notify(`Current BitNet URL: ${config.baseUrl}`, "info");
          ctx.ui.notify("Set with: /bitnet --url <new-url>", "info");
          ctx.ui.notify("Environment variables: BITNET_BASE_URL, BITNET_API_KEY", "info");
        }
      } else if (argsArray[0] === "--sync") {
        // Sync command - add provider to models.json
        try {
          await readModifyWriteModelsJson((models) => {
            models.providers["bitnet"] = {
              baseUrl: config.baseUrl,
              api: "openai-compat",
              apiKey: config.apiKey || "",
              models: [{
                id: "bitnet",
                contextWindow: 1024,
                maxTokens: 512
              }]
            };
            return models;
          });

          // Update runtime provider
          pi.registerProvider("bitnet", {
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            api: "openai-compat",
            models: [{
              id: "bitnet",
              contextWindow: 1024,
              maxTokens: 512
            }],
          });

          ctx.ui.notify("✅ BitNet provider synced to models.json", "success");
          ctx.ui.notify(`URL: ${config.baseUrl}`, "info");
          ctx.ui.notify("💡 Configuration will persist after reload", "info");
        } catch (error) {
          ctx.ui.notify(`❌ Failed to sync: ${error.message}`, "error");
        }
      } else {
        ctx.ui.notify(`Unknown subcommand: ${argsArray[0]}`, "error");
        ctx.ui.notify("Usage: /bitnet --status | /bitnet --url [url] | /bitnet --sync", "info");
      }
    },
  });

  // ── Tools ──────────────────────────────────────────────────────────────

  pi.registerTool({
    name: "bitnet_prompt_check",
    label: "BitNet Prompt Check",
    description: "Analyze a prompt for BitNet compatibility and suggest optimizations",
    parameters: Type.Object({
      text: Type.String({ description: "The prompt text to analyze" }),
    }),
    async execute(toolCallId, params) {
      try {
        const originalLength = params.text.length;
        const sanitized = sanitizeForBitnet(params.text);
        const sanitizedLength = sanitized.length;
        const budgetRemaining = 1024 - sanitizedLength;
        
        return {
          content: [{ 
            type: "text", 
            text: JSON.stringify({
              original_length: originalLength,
              sanitized_length: sanitizedLength,
              budget_remaining: budgetRemaining,
              is_within_budget: sanitizedLength <= 1024,
              issues: [],
              suggestions: []
            }, null, 2) 
          }],
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          isError: true
        };
      }
    },
  });

  // ── Event Handlers ───────────────────────────────────────────────────────

  pi.on("before_agent_start", async (event, ctx) => {
    // Check if using BitNet model
    try {
      const currentModel = ctx.model?.id || "";
      if (!currentModel.toLowerCase().includes("bitnet") && 
          !currentModel.toLowerCase().includes("0.5b") &&
          !currentModel.toLowerCase().includes("1b")) {
        return;
      }

      // Optimize system prompt for BitNet
      if (event.systemPrompt) {
        const optimized = event.systemPrompt
          .replace(/```[\s\S]*?```/g, '')
          .replace(/#+\s+/gm, '')
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/_([^_]+)_/g, '$1');
        
        event.systemPrompt = optimized + "\n\nKeep responses concise and simple.";
      }
    } catch (error) {
      debugLog("bitnet", "Failed to optimize prompt", error);
    }
  });
}