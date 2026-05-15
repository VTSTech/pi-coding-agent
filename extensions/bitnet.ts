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
        apiKey: provider.apiKey || process.env.BITNET_API_KEY || "",
        timeout: parseInt(process.env.BITNET_TIMEOUT || "30000"),
      };
    }
  } catch (error) {
    debugLog("bitnet", "Failed to load config from models.json", error);
  }
  
  return {
    baseUrl: process.env.BITNET_BASE_URL || "http://localhost:8080",
    apiKey: process.env.BITNET_API_KEY || "",
    timeout: parseInt(process.env.BITNET_TIMEOUT || "30000"),
  };
}

let config = loadConfig();
let discoveredModel: any = null;
let providerRegistered = false;

// ── Helper Functions ───────────────────────────────────────────────────────

/**
 * Custom stream handler for BitNet that bypasses the tools parameter issue.
 * BitNet doesn't support the 'tools' parameter, so we handle the request directly.
 */
async function streamBitNet(model: any, context: any, options: any) {
  const { AssistantMessageEventStream } = await import("@earendil-works/pi-ai/utils/event-stream.js");
  const stream = new AssistantMessageEventStream();
  
  setTimeout(async () => {
    try {
      const baseUrl = model.baseUrl.replace(/\/$/, '');
      const url = `${baseUrl}/v1/chat/completions`;
      
      // Extract only the last message for BitNet (more efficient)
      const messages = context.messages.slice(-10).map((msg: any) => ({
        role: msg.role,
        content: typeof msg.content === 'string' ? msg.content : 
                 msg.content?.map((b: any) => b.type === 'text' ? b.text : '').join('')
      }));
      
      // Build request body WITHOUT tools parameter - BitNet doesn't support tools
      const body: any = {
        model: model.id,
        messages: messages,
        max_tokens: Math.min(context.maxTokens || 2048, 1024), // BitNet has smaller context
        temperature: context.temperature ?? 0.7,
        stream: true, // Enable streaming for better performance
      };
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${model.apiKey || 'bitnet'}`,
        },
        body: JSON.stringify(body),
        signal: options?.signal,
      });
      
      if (!response.ok || !response.body) {
        stream.push({ type: "error", error: new Error(`HTTP ${response.status}`) });
        return;
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line for next iteration
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.choices?.[0]?.delta?.content) {
                stream.push({ type: "content", content: data.choices[0].delta.content });
              }
              if (data.choices?.[0]?.finish_reason) {
                stream.push({ type: "finish", stopReason: data.choices[0].finish_reason });
              }
            } catch (e) {
              // Ignore JSON parsing errors for incomplete data
            }
          }
        }
      }
    } catch (error: any) {
      stream.push({ type: "error", error: new Error(`BitNet request failed: ${error.message}`) });
    }
  });
  
  return stream;
}

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
    console.log(`[bitnet] Attempting to discover models from: ${baseUrl}/props`);
    const response = await fetch(`${baseUrl}/props`, {
      method: "GET",
      signal: AbortSignal.timeout(10000),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const props = await response.json();
    console.log(`[bitnet] Received props response:`, JSON.stringify(props, null, 2));
    
    // Extract actual model info from the response
    const modelPath = props.model_path || props.default_generation_settings?.model || "";
    // Handle both cases: full path string or just the model name
    const modelName = modelPath ? 
      modelPath.split('/').pop()?.replace(/\.(gguf|bin)$/, '') || "bitnet" : 
      "bitnet";
    const contextWindow = props.default_generation_settings?.n_ctx || 16384;
    
    console.log(`[bitnet] Discovered model: ${modelName} from path: ${modelPath}`);
    
    discoveredModel = {
      name: modelName,
      id: modelName,
      contextWindow: contextWindow,
      maxTokens: 2048,
      details: { 
        family: "bitnet", 
        backend: "llama-cpp",
        model_path: modelPath,
        n_ctx: contextWindow
      }
    };
    
    return [discoveredModel];
  } catch (error) {
    console.error(`[bitnet] Model discovery failed:`, error);
    return [{
      name: "bitnet",
      id: "bitnet",
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
  
  // Only register provider if BitNet server is available and has valid models
  // This prevents interference with other providers when BitNet is not running

  // Discover and register models on startup and reload
  pi.on("resources_discover", async () => {
    try {
      // Check if BitNet server is healthy before attempting discovery
      const { healthy } = await checkBitNetHealth(config.baseUrl);
      if (!healthy) {
        console.log(`[bitnet] Server not healthy at ${config.baseUrl}, skipping registration`);
        return;
      }
      
      const models = await discoverBitNetModels(config.baseUrl);
      console.log(`[bitnet] Discovered ${models.length} models`);
      
      // Only register provider if we have valid models and it's not already registered
      if (models.length > 0 && models[0].id !== "bitnet" && !providerRegistered) {
        pi.registerProvider("bitnet", {
          baseUrl: config.baseUrl,
          apiKey: config.apiKey || "bitnet",
          api: "openai-completions",
          streamSimple: streamBitNet,
          models: models,
          compat: {
            supportsStore: false,
            supportsDeveloperRole: false,
            supportsReasoningEffort: false,
            supportsUsageInStreaming: false,
            supportsEmptyTools: false,
            supportsTools: false  // Explicitly disable tools support
          }
        });
        providerRegistered = true;
        console.log(`[bitnet] Registered provider with model: ${models[0].name}`);
      }
    } catch (error) {
      console.log(`[bitnet] Failed to discover models: ${error}`);
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
        // Status command - discover models first
        const models = await discoverBitNetModels(config.baseUrl);
        const { healthy, details } = await checkBitNetHealth(config.baseUrl);
        
        // Show clear, meaningful status
        ctx.ui.notify(`BitNet Server Status: ${healthy ? "🟢 HEALTHY" : "🔴 UNHEALTHY"}`, healthy ? "success" : "error");
        ctx.ui.notify(`Server URL: ${config.baseUrl}`, "info");
        ctx.ui.notify(`Details: ${details || "OK"}`, "info");
        ctx.ui.notify(`Loaded Model: ${models[0]?.name || "Unknown"}`, "info");
        ctx.ui.notify(`Context Window: ${models[0]?.contextWindow || 1024} tokens`, "info");
        
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
          const oldApiKey = config.apiKey;
          config.baseUrl = argsArray[1];
          if (!config.apiKey) config.apiKey = "bitnet";
          
          try {
            // Discover models with new URL
            const models = await discoverBitNetModels(config.baseUrl);
            
            // Update models.json with discovered config
            await readModifyWriteModelsJson((modelsJson) => {
              modelsJson.providers["bitnet"] = {
                baseUrl: config.baseUrl,
                apiKey: config.apiKey || "bitnet",
                compat: {
                  supportsStore: false,
                  supportsDeveloperRole: false,
                  supportsReasoningEffort: false,
                  supportsUsageInStreaming: false,
                  supportsEmptyTools: false,
                  supportsTools: false  // Explicitly disable tools support
                },
                models: models
              };
              return modelsJson;
            });

            // Update runtime provider (ensure it's registered)
            if (!providerRegistered) {
              pi.registerProvider("bitnet", {
                baseUrl: config.baseUrl,
                apiKey: config.apiKey,
                api: "openai-completions",
                streamSimple: streamBitNet,
                models: models,
                compat: {
                  supportsStore: false,
                  supportsDeveloperRole: false,
                  supportsReasoningEffort: false,
                  supportsUsageInStreaming: false,
                  supportsEmptyTools: false,
                  supportsTools: false  // Explicitly disable tools support
                }
              });
              providerRegistered = true;
            } else {
              // Update existing provider
              const existingProvider = pi.getProvider("bitnet");
              if (existingProvider) {
                Object.assign(existingProvider, {
                  baseUrl: config.baseUrl,
                  apiKey: config.apiKey,
                  models: models,
                });
              }
            }

            ctx.ui.notify(`✅ BitNet URL updated to: ${argsArray[1]}`, "success");
            ctx.ui.notify(`🔄 Previous URL: ${oldUrl}`, "info");
            ctx.ui.notify(`📦 Discovered model: ${models[0]?.name || "Unknown"}`, "info");
            
            // Verify the new URL
            const { healthy, details } = await checkBitNetHealth(config.baseUrl);
            if (healthy) {
              ctx.ui.notify(`✅ New server is responding`, "success");
            } else {
              ctx.ui.notify(`⚠️ New server not responding: ${details}`, "warning");
            }
          } catch (error) {
            config.baseUrl = oldUrl;
            config.apiKey = oldApiKey;
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
        // Sync command - discover and add provider to models.json
        try {
          const models = await discoverBitNetModels(config.baseUrl);
          const finalApiKey = config.apiKey || "bitnet";
          
          await readModifyWriteModelsJson((modelsJson) => {
            modelsJson.providers["bitnet"] = {
              baseUrl: config.baseUrl,
              api: "openai-completions",
              apiKey: finalApiKey,
              compat: {
                supportsStore: false,
                supportsDeveloperRole: false,
                supportsReasoningEffort: false,
                supportsUsageInStreaming: false,
                supportsEmptyTools: false,
                supportsTools: false  // Explicitly disable tools support
              },
              models: models
            };
            return modelsJson;
          });

          // Update runtime provider (ensure it's registered)
          if (!providerRegistered) {
            pi.registerProvider("bitnet", {
              baseUrl: config.baseUrl,
              apiKey: finalApiKey,
              api: "openai-completions",
              streamSimple: streamBitNet,
              models: models,
              compat: {
                supportsStore: false,
                supportsDeveloperRole: false,
                supportsReasoningEffort: false,
                supportsUsageInStreaming: false,
                supportsEmptyTools: false,
                supportsTools: false  // Explicitly disable tools support
              }
            });
            providerRegistered = true;
          } else {
            // Update existing provider
            const existingProvider = pi.getProvider("bitnet");
            if (existingProvider) {
              Object.assign(existingProvider, {
                baseUrl: config.baseUrl,
                apiKey: finalApiKey,
                models: models,
              });
            }
          }

          ctx.ui.notify("✅ BitNet provider synced to models.json", "success");
          ctx.ui.notify(`URL: ${config.baseUrl}`, "info");
          ctx.ui.notify(`Model: ${models[0]?.name || "Unknown"}`, "info");
          ctx.ui.notify(`Context: ${models[0]?.contextWindow || 1024} tokens`, "info");
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

  // ── Extension Lifecycle ─────────────────────────────────────────────────

  // Clean up provider on extension unload
  pi.on("extension_unload", () => {
    if (providerRegistered) {
      console.log("[bitnet] Unregistering provider");
      // Note: Pi API may not have unregister method, this is preventive
      providerRegistered = false;
    }
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