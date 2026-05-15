import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface BitNetProviderConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
}

interface BitNetModel {
  id: string;
  name: string;
  contextWindow: number;
  maxTokens: number;
  reasoning: boolean;
  input: string[];
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}

export default async function (pi: ExtensionAPI) {
  // Configuration with environment variable support
  const config: BitNetProviderConfig = {
    baseUrl: process.env.BITNET_BASE_URL || "http://localhost:8080",
    apiKey: process.env.BITNET_API_KEY,
    timeout: parseInt(process.env.BITNET_TIMEOUT || "30000"),
  };

  // Register BitNet provider
  pi.registerProvider("bitnet", {
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    api: "openai-compat",
    models: [], // Will be populated dynamically
  });

  // Discover BitNet models on startup and reload
  pi.on("resources_discover", async (event, ctx) => {
    try {
      const models = await discoverBitNetModels(config.baseUrl);
      
      // Update provider with BitNet-specific models
      const bitnetModels: BitNetModel[] = models.map(model => ({
        id: model.name,
        name: model.name,
        contextWindow: 1024, // BitNet's strict prompt budget
        maxTokens: 512, // Conservative for small models
        reasoning: false,
        input: ["text"],
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        },
      }));

      console.log(`[bitnet] Discovered ${models.length} models`);
    } catch (error) {
      console.error(`[bitnet] Failed to discover models:`, error);
      // Add a fallback model so the provider is still available
      console.log(`[bitnet] Using fallback model - server may not be running`);
    }
  });

  // BitNet command with subcommands
  pi.registerCommand("bitnet", {
    description: "BitNet server management",
    getArgumentCompletions: (prefix: string) => {
      const subcommands = ["--status", "--url"];
      return subcommands
        .filter(cmd => cmd.startsWith(prefix))
        .map(cmd => ({ value: cmd, label: cmd }));
    },
    handler: async (args, ctx) => {
      // Debug: show what we received
      console.log(`[bitnet] Received args:`, args);
      
      // Handle both array and string arguments
      let argsArray: string[] = [];
      if (Array.isArray(args)) {
        argsArray = args.filter(Boolean);
      } else if (args && typeof args === 'string') {
        // Parse string arguments (handles "--url http://..." case)
        if (args.startsWith('--url ')) {
          argsArray = ['--url', args.substring(6).trim()];
        } else if (args === '--url') {
          argsArray = ['--url'];
        } else {
          argsArray = [args];
        }
      }
      
      console.log(`[bitnet] Parsed args:`, argsArray);
      
      if (argsArray.length === 0 || argsArray[0] === "--status") {
        await handleStatus(ctx);
      } else if (argsArray[0] === "--url") {
        if (argsArray[1]) {
          await handleUrlSet(argsArray[1], ctx);
        } else {
          await handleUrlGet(ctx);
        }
      } else {
        ctx.ui.notify(`Unknown subcommand: ${argsArray[0]}`, "error");
        ctx.ui.notify("Usage: /bitnet --status | /bitnet --url [url]", "info");
      }
    },
  });

  // Helper functions for the command
  async function handleStatus(ctx: any) {
    try {
      const isHealthy = await checkBitNetHealth(config.baseUrl);
      const models = await discoverBitNetModels(config.baseUrl);
      
      ctx.ui.notify(`BitNet server: ${isHealthy ? "Healthy" : "Unhealthy"}`, "info");
      ctx.ui.notify(`Models: ${models.map(m => m.name).join(", ")}`, "info");
      ctx.ui.notify(`URL: ${config.baseUrl}`, "info");
      
      // Show BitNet-specific warnings
      if (models.length > 0) {
        ctx.ui.notify("⚠️ BitNet has strict prompt limits (~1024 chars)", "warning");
        ctx.ui.notify("⚠️ Small models may lose coherence beyond 3-4 turns", "warning");
      }
      
      if (!isHealthy) {
        ctx.ui.notify("💡 Tip: Make sure BitNet server is running at " + config.baseUrl, "info");
        ctx.ui.notify("💡 Or set BITNET_BASE_URL to your server URL", "info");
      }
    } catch (error) {
      ctx.ui.notify(`Error: ${error.message}`, "error");
      ctx.ui.notify("💡 Make sure BitNet server is running and accessible", "info");
    }
  }

  async function handleUrlGet(ctx: any) {
    ctx.ui.notify(`Current BitNet URL: ${config.baseUrl}`, "info");
    ctx.ui.notify("Set with: /bitnet --url <new-url>", "info");
    ctx.ui.notify("Environment: BITNET_BASE_URL", "info");
  }

  async function handleUrlSet(url: string, ctx: any) {
    if (!url || url.startsWith("--")) {
      ctx.ui.notify("Please provide a valid URL", "error");
      ctx.ui.notify("Usage: /bitnet --url http://localhost:8080", "info");
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      ctx.ui.notify(`Invalid URL: ${url}`, "error");
      return;
    }

    config.baseUrl = url;
    
    // Update the provider
    pi.registerProvider("bitnet", {
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      api: "openai-compat",
      models: [],
    });

    ctx.ui.notify(`BitNet URL updated to: ${url}`, "success");
    ctx.ui.notify("Use /bitnet --status to check the new server", "info");
  }

  // Helper functions
  async function checkBitNetHealth(baseUrl: string): Promise<boolean> {
    try {
      // Try /health endpoint first
      try {
        const response = await fetch(`${baseUrl}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        if (response.status === 200) return true;
      } catch {
        // Fallback to root URL
        const response = await fetch(baseUrl, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        return response.status < 500;
      }
    } catch {
      return false;
    }
  }

  async function discoverBitNetModels(baseUrl: string): Promise<any[]> {
    try {
      // BitNet uses /props endpoint to discover the loaded model
      const response = await fetch(`${baseUrl}/props`, {
        method: "GET",
        signal: AbortSignal.timeout(10000),
      });
      const props = await response.json();
      
      // Extract model name from model_path
      const modelPath = props.model_path || 
        props.default_generation_settings?.model || "";
      const modelName = modelPath.split('/').pop()?.replace(/\.(gguf|bin)$/, '') || "bitnet";
      
      return [{
        name: modelName,
        contextWindow: 1024,
        maxTokens: 512,
        details: { 
          family: "bitnet", 
          backend: "llama-cpp",
          model_path: modelPath,
          prompt_budget: 1024,
          max_exchanges: 4
        }
      }];
    } catch (error) {
      console.error(`[bitnet] Model discovery failed:`, error);
      // Return fallback model without crashing
      return [{
        name: "bitnet",
        contextWindow: 1024,
        maxTokens: 512,
        details: { 
          family: "bitnet", 
          backend: "llama-cpp",
          status: "fallback - server may not be running"
        }
      }];
    }
  }

  // BitNet-specific tool for prompt analysis
  pi.registerTool({
    name: "bitnet_prompt_check",
    label: "BitNet Prompt Check",
    description: "Analyze a prompt for BitNet compatibility and suggest optimizations",
    parameters: Type.Object({
      text: Type.String({
        description: "The prompt text to analyze"
      }),
      context: Type.Optional(Type.String({
        description: "Additional context about the prompt (optional)"
      }))
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        const analysis = analyzeBitNetPrompt(params.text);
        
        return {
          content: [{ type: "text", text: JSON.stringify(analysis, null, 2) }],
          details: { analysis }
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: ${error.message}` }],
          details: {},
          isError: true
        };
      }
    },
  });

  // BitNet prompt analysis function
  function analyzeBitNetPrompt(text: string): any {
    const originalLength = text.length;
    const sanitized = sanitizeForBitnet(text);
    const sanitizedLength = sanitized.length;
    const budgetRemaining = 1024 - sanitizedLength;
    
    return {
      original_length: originalLength,
      sanitized_length: sanitizedLength,
      budget_remaining: budgetRemaining,
      is_within_budget: sanitizedLength <= 1024,
      issues: [],
      suggestions: []
    };
  }

  // BitNet text sanitization (from your AgentNova code)
  function sanitizeForBitnet(text: string): string {
    // Remove markdown patterns that cause tokenization issues
    let cleaned = text
      .replace(/```[\s\S]*?```/g, '') // Remove code blocks
      .replace(/\|.*\|/g, '') // Remove table rows
      .replace(/^[-]+$\n?/gm, '') // Remove table separators
      .replace(/\n{3,}/g, '\n\n') // Remove excessive newlines
      .trim();

    // Additional BitNet-specific sanitization
    cleaned = cleaned
      .replace(/#+\s+/g, '') // Remove markdown headers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold formatting
      .replace(/_([^_]+)_/g, '$1'); // Remove italic formatting

    return cleaned;
  }

  // Tool call interceptor for BitNet optimization
  pi.on("tool_call", async (event, ctx) => {
    // Only apply BitNet optimizations when using BitNet models
    if (!isBitNetModel(ctx)) return;

    if (event.toolName === "read") {
      // For BitNet, limit file reading to stay within prompt budget
      const path = event.input.path;
      const offset = event.input.offset || 0;
      const limit = event.input.limit || 512; // Conservative limit for BitNet
      
      // Update the limit if it's too large
      if (limit > 512) {
        event.input.limit = 512;
      }
    }
  });

  // Helper to detect if current model is BitNet
  function isBitNetModel(ctx: any): boolean {
    // This is a simplified check - in practice you'd need to access the current model
    // from the context or session manager
    try {
      const currentModel = ctx.model?.id || "";
      return currentModel.toLowerCase().includes("bitnet") || 
             currentModel.toLowerCase().includes("0.5b") ||
             currentModel.toLowerCase().includes("1b");
    } catch {
      return false;
    }
  }

  // Message interceptor for BitNet prompt optimization
  pi.on("before_agent_start", async (event, ctx) => {
    if (!isBitNetModel(ctx)) return;

    // Optimize system prompt for BitNet
    if (event.systemPrompt) {
      const optimizedPrompt = optimizeBitNetSystemPrompt(event.systemPrompt);
      if (optimizedPrompt !== event.systemPrompt) {
        event.systemPrompt = optimizedPrompt;
      }
    }
  });

  function optimizeBitNetSystemPrompt(prompt: string): string {
    // Remove complex formatting that BitNet struggles with
    let optimized = prompt
      .replace(/```[\s\S]*?```/g, '') // Remove code examples
      .replace(/#+\s+/gm, '') // Remove headers
      .replace(/\*\*([^*]+)\*\*/g, '$1') // Remove bold
      .replace(/_([^_]+)_/g, '$1'); // Remove italic

    // Add BitNet-specific instructions
    const bitnetInstructions = "\n\nIMPORTANT: Keep responses concise. Use simple language. Avoid complex formatting.";

    return optimized + bitnetInstructions;
  }

  console.log(`[bitnet] Extension loaded - BitNet support enabled`);
  console.log(`[bitnet] Server: ${config.baseUrl}`);
  console.log(`[bitnet] Use /bitnet-status to check server availability`);
  
  // Check server availability on startup
  try {
    const isHealthy = await checkBitNetHealth(config.baseUrl);
    if (!isHealthy) {
      console.warn(`[bitnet] Server not available at ${config.baseUrl}`);
      console.warn(`[bitnet] Start your BitNet server or set BITNET_BASE_URL`);
    }
  } catch (error) {
    console.warn(`[bitnet] Cannot connect to server:`, error.message);
  }
}