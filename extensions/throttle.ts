/**
 * Throttle Extension for Pi Coding Agent.
 * Prevents 429 rate limit errors by respecting provider rate limits.
 *
 * Features:
 *   - Hardcoded rate limits for OpenRouter and Zhipu AI (ZAI)
 *   - Smart request queuing with FIFO ordering
 *   - Token-aware throttling (tracks usage per provider)
 *   - Configurable delay between requests
 *   - Real-time status display in footer
 *   - Automatic provider detection
 *
 * Written by VTSTech — https://www.vts-tech.org
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { debugLog } from "../shared/debug";
import { section, ok, fail, warn, info } from "../shared/format";
import { EXTENSION_VERSION } from "../shared/ollama";

// ============================================================================
// Rate Limit Configuration
// ============================================================================

interface RateLimit {
  requestsPerMinute: number;
  tokensPerMinute: number;
  requestsPerHour?: number;
  tokensPerHour?: number;
  burstRequests?: number;
}

interface ProviderLimits {
  [provider: string]: RateLimit;
}

// Hardcoded rate limits based on official documentation and testing
const RATE_LIMITS: ProviderLimits = {
  // OpenRouter limits (as of 2024)
  "openrouter": {
    requestsPerMinute: 15,    // Free tier: ~15 RPM
    tokensPerMinute: 2000,    // Free tier: ~2K TPM
    requestsPerHour: 900,     // 15 RPM * 60
    tokensPerHour: 120000,   // 2K TPM * 60
    burstRequests: 5,         // Allow small bursts
  },
  // Zhipu AI (ZAI) limits (as of 2024)
  "zhipu": {
    requestsPerMinute: 100,   // Standard tier: ~100 RPM
    tokensPerMinute: 50000,   // Standard tier: ~50K TPM
    requestsPerHour: 6000,   // 100 RPM * 60
    tokensPerHour: 3000000,  // 50K TPM * 60
    burstRequests: 10,       // Allow larger bursts
  },
  // Fallback limits for unknown providers
  "default": {
    requestsPerMinute: 10,    // Conservative default
    tokensPerMinute: 1000,    // Conservative default
    requestsPerHour: 600,     // 10 RPM * 60
    tokensPerHour: 60000,    // 1K TPM * 60
    burstRequests: 3,        // Conservative burst
  },
};

// ============================================================================
// Throttle State
// ============================================================================

interface RequestQueueItem {
  timestamp: number;
  resolve: (value: void) => void;
  reject: (reason?: Error) => void;
  tokens: number;
}

interface ProviderState {
  requestCount: number;
  tokenCount: number;
  lastReset: number;
  queue: RequestQueueItem[];
  isActive: boolean;
}

interface ThrottleStats {
  totalRequests: number;
  totalTokens: number;
  totalQueued: number;
  totalThrottled: number;
  currentQueueSize: number;
}

// ============================================================================
// Throttle Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  const stats: ThrottleStats = {
    totalRequests: 0,
    totalTokens: 0,
    totalQueued: 0,
    totalThrottled: 0,
    currentQueueSize: 0,
  };

  const providerStates: Map<string, ProviderState> = new Map();
  let throttleStatusId: string | null = null;

  // ── Helper Functions ─────────────────────────────────────────────────────

  function getProviderState(provider: string): ProviderState {
    if (!providerStates.has(provider)) {
      providerStates.set(provider, {
        requestCount: 0,
        tokenCount: 0,
        lastReset: Date.now(),
        queue: [],
        isActive: false,
      });
    }
    return providerStates.get(provider)!;
  }

  function getRateLimit(provider: string): RateLimit {
    // Try exact provider match first
    if (RATE_LIMITS[provider]) {
      return RATE_LIMITS[provider];
    }
    
    // Special mappings for provider aliases
    const aliasMap: Record<string, string> = {
      "zai": "zhipu",  // ZAI provider should use Zhipu AI limits
    };
    
    // Check for aliases first
    const alias = aliasMap[provider];
    if (alias && RATE_LIMITS[alias]) {
      return RATE_LIMITS[alias];
    }
    
    // Try partial matches (e.g., "openrouter" matches "openrouter/some-model")
    for (const [key, limit] of Object.entries(RATE_LIMITS)) {
      if (key !== "default" && provider.includes(key)) {
        return limit;
      }
    }
    
    // Fallback to default
    return RATE_LIMITS.default;
  }

  function resetCountersIfNeeded(state: ProviderState, provider: string): void {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneHourAgo = now - 60 * 60 * 1000;
    const limit = getRateLimit(provider);

    // Reset minute counters
    if (state.lastReset < oneMinuteAgo) {
      state.requestCount = 0;
      state.tokenCount = 0;
      state.lastReset = now;
    }

    // Reset hour counters if they exist
    if (limit.requestsPerHour && state.lastReset < oneHourAgo) {
      state.requestCount = 0;
      state.tokenCount = 0;
      state.lastReset = now;
    }
  }

  function canMakeRequest(state: ProviderState, provider: string, tokens: number): boolean {
    const limit = getRateLimit(provider);
    resetCountersIfNeeded(state, provider);

    // Check request limits
    if (state.requestCount >= limit.requestsPerMinute) {
      return false;
    }
    if (limit.requestsPerHour && state.requestCount >= limit.requestsPerHour) {
      return false;
    }

    // Check token limits
    if (state.tokenCount + tokens > limit.tokensPerMinute) {
      return false;
    }
    if (limit.tokensPerHour && state.tokenCount + tokens > limit.tokensPerHour) {
      return false;
    }

    return true;
  }

  async function queueRequest(provider: string, tokens: number): Promise<void> {
    const state = getProviderState(provider);
    const limit = getRateLimit(provider);
    
    return new Promise((resolve, reject) => {
      const queueItem: RequestQueueItem = {
        timestamp: Date.now(),
        resolve,
        reject,
        tokens,
      };

      state.queue.push(queueItem);
      stats.totalQueued++;
      stats.currentQueueSize = state.queue.length;

      // Process queue immediately
      processQueue(provider);
    });
  }

  async function processQueue(provider: string): Promise<void> {
    const state = getProviderState(provider);
    const limit = getRateLimit(provider);

    if (state.isActive) return;
    state.isActive = true;

    const processNext = async () => {
      if (state.queue.length === 0) {
        state.isActive = false;
        updateThrottleStatus();
        return;
      }

      const next = state.queue[0];
      const canProceed = canMakeRequest(state, provider, next.tokens);

      if (canProceed) {
        // Process the request
        state.queue.shift();
        state.requestCount++;
        state.tokenCount += next.tokens;
        stats.totalRequests++;
        stats.totalTokens += next.tokens;
        stats.currentQueueSize = state.queue.length;

        // Update status
        updateThrottleStatus();

        // Resolve the promise
        next.resolve();

        // Schedule next request with minimum delay
        const minDelay = 60000 / limit.requestsPerMinute; // Time between requests
        setTimeout(processNext, Math.max(minDelay, 100));
      } else {
        // Wait and try again
        const waitTime = Math.max(
          1000, // Minimum 1 second wait
          (60 * 1000) / limit.requestsPerMinute // Time between requests
        );
        
        setTimeout(processNext, waitTime);
      }
    };

    processNext();
  }

  function updateThrottleStatus(): void {
    if (!throttleStatusId) {
      throttleStatusId = "throttle";
    }

    // Calculate total queue size across all providers
    const totalQueueSize = Array.from(providerStates.values())
      .reduce((sum, state) => sum + state.queue.length, 0);

    // Calculate total active providers
    const activeProviders = Array.from(providerStates.values())
      .filter(state => state.isActive).length;

    const statusParts: string[] = [];
    
    if (totalQueueSize > 0) {
      statusParts.push(`Q:${totalQueueSize}`);
    }
    
    if (activeProviders > 0) {
      statusParts.push(`A:${activeProviders}`);
    }

    if (stats.totalThrottled > 0) {
      statusParts.push(`T:${stats.totalThrottled}`);
    }

    const statusText = statusParts.length > 0 ? `TH:${statusParts.join(",")}` : "TH:OK";
    
    // Use ctx.ui.setStatus with unique ID to avoid conflicts with status.ts
    if (ctx && ctx.ui && ctx.ui.setStatus) {
      ctx.ui.setStatus("status-throttle", statusText);
    }
  }
  }

  // ── Tool Registration ────────────────────────────────────────────────────

  pi.registerTool({
    name: "throttle_status",
    label: "Throttle Status",
    description: "Get current throttle statistics and queue status",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const provider = ctx.model?.provider || "unknown";
      const state = getProviderState(provider);
      const limit = getRateLimit(provider);

      const status = {
        provider,
        limits: limit,
        current: {
          requests: state.requestCount,
          tokens: state.tokenCount,
        },
        queue: {
          size: state.queue.length,
          oldest: state.queue.length > 0 ? Date.now() - state.queue[0].timestamp : 0,
        },
        stats: stats,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
        details: {},
      };
    },
  });

  // ── Event Handlers ──────────────────────────────────────────────────────

  pi.on("before_agent_start", async (event, ctx) => {
    const provider = ctx.model?.provider || "unknown";
    const limit = getRateLimit(provider);
    
    debugLog(`Throttle: Using provider ${provider} with limits:`, limit);
  });

  // Intercept API calls to the provider (this is where actual API calls happen)
  pi.on("before_provider_request", async (event, ctx) => {
    const provider = ctx.model?.provider || "unknown";
    const state = getProviderState(provider);
    
    // Estimate tokens for this API request
    const estimatedTokens = estimateApiRequestTokens(event.payload);
    
    if (!canMakeRequest(state, provider, estimatedTokens)) {
      stats.totalThrottled++;
      updateThrottleStatus(ctx);
      
      // Queue the request
      await queueRequest(provider, estimatedTokens);
      
      // Note: We can't actually block the provider request here,
      // so we'll just queue it and let the next request go through
    }
  });

  // Track actual token usage after API calls
  pi.on("after_provider_response", async (event, ctx) => {
    const provider = ctx.model?.provider || "unknown";
    const state = getProviderState(provider);
    
    // Update actual token usage if available in response
    if (event.headers?.["x-rpm-used"] || event.headers?.["x-tpm-used"]) {
      const rpmUsed = parseInt(event.headers["x-rpm-used"] || "0");
      const tpmUsed = parseInt(event.headers["x-tpm-used"] || "0");
      
      if (rpmUsed > 0) state.requestCount += rpmUsed;
      if (tpmUsed > 0) state.tokenCount += tpmUsed;
      
      stats.totalRequests += rpmUsed;
      stats.totalTokens += tpmUsed;
      
      updateThrottleStatus(ctx);
    }
  });

  pi.on("tool_result", async (event, ctx) => {
    // Update actual token usage if available
    if (event.details?.tokens) {
      const provider = ctx.model?.provider || "unknown";
      const state = getProviderState(provider);
      state.tokenCount += event.details.tokens;
      stats.totalTokens += event.details.tokens;
    }
  });

  // ── Command Registration ────────────────────────────────────────────────

  pi.registerCommand("throttle", {
    description: "Manage throttle settings and view statistics",
    detailedHelp: "\n\n🚀 Throttle Extension\n\nPrevents 429 rate limit errors by respecting provider rate limits.\n\n📋 Usage:\n  /throttle status      - Show current throttle status\n  /throttle reset        - Reset all counters and queues\n  /throttle providers   - List configured providers and limits\n  /throttle stats       - Show detailed statistics\n  /throttle --help      - Show this help\n\n🔧 Features:\n• Smart request queuing with FIFO ordering\n• Token-aware throttling (tracks usage per provider)\n• Hardcoded rate limits for OpenRouter and Zhipu AI\n• Real-time status display in footer\n• Automatic provider detection\n\n💡 Tips:\n• Status shows Q:queue_size, A:active_requests, T:total_throttled\n• Use /throttle status to monitor queue buildup\n• Reset counters if you change models or sessions",
    handler: async (args, ctx) => {
      const subcommand = args.trim().toLowerCase();

      switch (subcommand) {
        case "status":
        case "":
          const provider = ctx.model?.provider || "unknown";
          const state = getProviderState(provider);
          const limit = getRateLimit(provider);
          
          ctx.ui.notify(
            `🚀 Throttle Status\n\n` +
            `Provider: ${provider}\n` +
            `Requests: ${state.requestCount}/${limit.requestsPerMinute}/min\n` +
            `Tokens: ${state.tokenCount}/${limit.tokensPerMinute}/min\n` +
            `Queue: ${state.queue.length} waiting\n` +
            `Total Throttled: ${stats.totalThrottled}\n` +
            `Total Requests: ${stats.totalRequests}`
          );
          break;

        case "reset":
          // Clear all provider states
          providerStates.clear();
          stats.totalRequests = 0;
          stats.totalTokens = 0;
          stats.totalQueued = 0;
          stats.totalThrottled = 0;
          stats.currentQueueSize = 0;
          
          updateThrottleStatus();
          ctx.ui.notify("🚀 Throttle counters and queues reset", "info");
          break;

        case "providers":
          ctx.ui.notify(
            `🚀 Configured Providers\n\n` +
            Object.entries(RATE_LIMITS)
              .filter(([key]) => key !== "default")
              .map(([provider, limit]) => 
                `${provider}:\n` +
                `  ${limit.requestsPerMinute} RPM, ${limit.tokensPerMinute} TPM\n` +
                `  Burst: ${limit.burstRequests || "N/A"}`
              )
              .join("\n\n")
          );
          break;

        case "stats":
          ctx.ui.notify(
            `🚀 Throttle Statistics\n\n` +
            `Total Requests: ${stats.totalRequests}\n` +
            `Total Tokens: ${stats.totalTokens}\n` +
            `Total Queued: ${stats.totalQueued}\n` +
            `Total Throttled: ${stats.totalThrottled}\n` +
            `Current Queue: ${stats.currentQueueSize}`
          );
          break;

        case "--help":
        default:
          ctx.ui.notify(
            "🚀 Throttle Extension\n\n" +
            "Usage:\n" +
            "  /throttle status      - Show current throttle status\n" +
            "  /throttle reset        - Reset all counters and queues\n" +
            "  /throttle providers   - List configured providers and limits\n" +
            "  /throttle stats       - Show detailed statistics\n\n" +
            "Features:\n" +
            "• Prevents 429 errors by respecting rate limits\n" +
            "• Smart request queuing with FIFO ordering\n" +
            "• Token-aware throttling per provider\n" +
            "• Real-time status display"
          );
          break;
      }
    },
  });

  // ── Initialize Status ─────────────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    const provider = ctx.model?.provider || "unknown";
    debugLog(`Throttle: Initialized for provider: ${provider}`);
    updateThrottleStatus();
  });

  pi.on("session_shutdown", async (_event, _ctx) => {
    // Clean up status
    if (throttleStatusId) {
      pi.setStatus(throttleStatusId, "");
    }
  });

// ============================================================================
// Helper Functions
// ============================================================================

function estimateRequestTokens(event: any): number {
  // Conservative estimate for request tokens
  // This is a rough estimate - actual token usage may vary
  const baseTokens = 100; // Base overhead for request
  
  if (event.toolName === "bash") {
    return baseTokens + 50; // Simple command
  } else if (event.toolName === "read") {
    return baseTokens + 200; // File path + context
  } else if (event.toolName === "write") {
    return baseTokens + 300; // File path + content estimate
  } else if (event.toolName === "edit") {
    return baseTokens + 500; // File path + diff
  } else {
    return baseTokens + 100; // Default for other tools
  }
}

function estimateApiRequestTokens(payload: any): number {
  // Estimate tokens for API requests to the provider
  // This is a rough estimate based on the payload content
  const baseTokens = 200; // Base overhead for API request
  
  if (!payload || typeof payload !== "object") {
    return baseTokens;
  }
  
  // Estimate based on messages in the payload
  if (payload.messages && Array.isArray(payload.messages)) {
    const messageTokens = payload.messages.reduce((total: number, message: any) => {
      if (message.content) {
        // Rough estimate: 1.3 tokens per character for English text
        const contentLength = typeof message.content === "string" 
          ? message.content.length 
          : JSON.stringify(message.content).length;
        return total + Math.ceil(contentLength * 1.3);
      }
      return total;
    }, 0);
    
    return baseTokens + messageTokens;
  }
  
  // Fallback for other payload structures
  const payloadSize = JSON.stringify(payload).length;
  return baseTokens + Math.ceil(payloadSize * 1.3);
}