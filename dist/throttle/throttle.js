// extensions/throttle.ts
import { Type } from "typebox";

// shared/debug.ts
var DEBUG_ENABLED = process?.env?.PI_EXTENSIONS_DEBUG === "1";
function debugLog(module, message, ...args) {
  if (!DEBUG_ENABLED) return;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  console.debug(`[pi-ext:${module}] ${timestamp} ${message}`, ...args);
}

// extensions/throttle.ts
var RATE_LIMITS = {
  // OpenRouter limits (as of 2024)
  "openrouter": {
    requestsPerMinute: 15,
    // Free tier: ~15 RPM
    tokensPerMinute: 2e3,
    // Free tier: ~2K TPM
    requestsPerHour: 900,
    // 15 RPM * 60
    tokensPerHour: 12e4,
    // 2K TPM * 60
    burstRequests: 5
    // Allow small bursts
  },
  // Zhipu AI (ZAI) limits (as of 2024)
  "zhipu": {
    requestsPerMinute: 100,
    // Standard tier: ~100 RPM
    tokensPerMinute: 5e4,
    // Standard tier: ~50K TPM
    requestsPerHour: 6e3,
    // 100 RPM * 60
    tokensPerHour: 3e6,
    // 50K TPM * 60
    burstRequests: 10
    // Allow larger bursts
  },
  // Fallback limits for unknown providers
  "default": {
    requestsPerMinute: 10,
    // Conservative default
    tokensPerMinute: 1e3,
    // Conservative default
    requestsPerHour: 600,
    // 10 RPM * 60
    tokensPerHour: 6e4,
    // 1K TPM * 60
    burstRequests: 3
    // Conservative burst
  }
};
function throttle_default(pi) {
  const stats = {
    totalRequests: 0,
    totalTokens: 0,
    totalQueued: 0,
    totalThrottled: 0,
    currentQueueSize: 0
  };
  const providerStates = /* @__PURE__ */ new Map();
  let throttleStatusId = null;
  function getProviderState(provider) {
    if (!providerStates.has(provider)) {
      providerStates.set(provider, {
        requestCount: 0,
        tokenCount: 0,
        lastReset: Date.now(),
        queue: [],
        isActive: false
      });
    }
    return providerStates.get(provider);
  }
  function getRateLimit(provider) {
    if (RATE_LIMITS[provider]) {
      return RATE_LIMITS[provider];
    }
    for (const [key, limit] of Object.entries(RATE_LIMITS)) {
      if (key !== "default" && provider.includes(key)) {
        return limit;
      }
    }
    return RATE_LIMITS.default;
  }
  function resetCountersIfNeeded(state, provider) {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1e3;
    const oneHourAgo = now - 60 * 60 * 1e3;
    const limit = getRateLimit(provider);
    if (state.lastReset < oneMinuteAgo) {
      state.requestCount = 0;
      state.tokenCount = 0;
      state.lastReset = now;
    }
    if (limit.requestsPerHour && state.lastReset < oneHourAgo) {
      state.requestCount = 0;
      state.tokenCount = 0;
      state.lastReset = now;
    }
  }
  function canMakeRequest(state, provider, tokens) {
    const limit = getRateLimit(provider);
    resetCountersIfNeeded(state, provider);
    if (state.requestCount >= limit.requestsPerMinute) {
      return false;
    }
    if (limit.requestsPerHour && state.requestCount >= limit.requestsPerHour) {
      return false;
    }
    if (state.tokenCount + tokens > limit.tokensPerMinute) {
      return false;
    }
    if (limit.tokensPerHour && state.tokenCount + tokens > limit.tokensPerHour) {
      return false;
    }
    return true;
  }
  async function queueRequest(provider, tokens) {
    const state = getProviderState(provider);
    const limit = getRateLimit(provider);
    return new Promise((resolve, reject) => {
      const queueItem = {
        timestamp: Date.now(),
        resolve,
        reject,
        tokens
      };
      state.queue.push(queueItem);
      stats.totalQueued++;
      stats.currentQueueSize = state.queue.length;
      processQueue(provider);
    });
  }
  async function processQueue(provider) {
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
        state.queue.shift();
        state.requestCount++;
        state.tokenCount += next.tokens;
        stats.totalRequests++;
        stats.totalTokens += next.tokens;
        stats.currentQueueSize = state.queue.length;
        updateThrottleStatus();
        next.resolve();
        const minDelay = 6e4 / limit.requestsPerMinute;
        setTimeout(processNext, Math.max(minDelay, 100));
      } else {
        const waitTime = Math.max(
          1e3,
          // Minimum 1 second wait
          60 * 1e3 / limit.requestsPerMinute
          // Time between requests
        );
        setTimeout(processNext, waitTime);
      }
    };
    processNext();
  }
  function updateThrottleStatus() {
    if (!throttleStatusId) {
      throttleStatusId = "throttle";
    }
    const totalQueueSize = Array.from(providerStates.values()).reduce((sum, state) => sum + state.queue.length, 0);
    const activeProviders = Array.from(providerStates.values()).filter((state) => state.isActive).length;
    const statusParts = [];
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
    pi.setStatus(throttleStatusId, statusText);
  }
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
          tokens: state.tokenCount
        },
        queue: {
          size: state.queue.length,
          oldest: state.queue.length > 0 ? Date.now() - state.queue[0].timestamp : 0
        },
        stats
      };
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
        details: {}
      };
    }
  });
  pi.on("before_agent_start", async (event, ctx) => {
    const provider = ctx.model?.provider || "unknown";
    const limit = getRateLimit(provider);
    debugLog(`Throttle: Using provider ${provider} with limits:`, limit);
  });
  pi.on("tool_call", async (event, ctx) => {
    const nonThrottleableTools = ["bash", "read", "write", "edit", "list", "cd"];
    if (event.toolName && nonThrottleableTools.includes(event.toolName)) {
      return;
    }
    const provider = ctx.model?.provider || "unknown";
    const state = getProviderState(provider);
    const estimatedTokens = estimateRequestTokens(event);
    if (!canMakeRequest(state, provider, estimatedTokens)) {
      stats.totalThrottled++;
      updateThrottleStatus();
      await queueRequest(provider, estimatedTokens);
    }
  });
  pi.on("tool_result", async (event, ctx) => {
    if (event.details?.tokens) {
      const provider = ctx.model?.provider || "unknown";
      const state = getProviderState(provider);
      state.tokenCount += event.details.tokens;
      stats.totalTokens += event.details.tokens;
    }
  });
  pi.registerCommand("throttle", {
    description: "Manage throttle settings and view statistics",
    detailedHelp: "\n\n\u{1F680} Throttle Extension\n\nPrevents 429 rate limit errors by respecting provider rate limits.\n\n\u{1F4CB} Usage:\n  /throttle status      - Show current throttle status\n  /throttle reset        - Reset all counters and queues\n  /throttle providers   - List configured providers and limits\n  /throttle stats       - Show detailed statistics\n  /throttle --help      - Show this help\n\n\u{1F527} Features:\n\u2022 Smart request queuing with FIFO ordering\n\u2022 Token-aware throttling (tracks usage per provider)\n\u2022 Hardcoded rate limits for OpenRouter and Zhipu AI\n\u2022 Real-time status display in footer\n\u2022 Automatic provider detection\n\n\u{1F4A1} Tips:\n\u2022 Status shows Q:queue_size, A:active_requests, T:total_throttled\n\u2022 Use /throttle status to monitor queue buildup\n\u2022 Reset counters if you change models or sessions",
    handler: async (args, ctx) => {
      const subcommand = args.trim().toLowerCase();
      switch (subcommand) {
        case "status":
        case "":
          const provider = ctx.model?.provider || "unknown";
          const state = getProviderState(provider);
          const limit = getRateLimit(provider);
          ctx.ui.notify(
            `\u{1F680} Throttle Status

Provider: ${provider}
Requests: ${state.requestCount}/${limit.requestsPerMinute}/min
Tokens: ${state.tokenCount}/${limit.tokensPerMinute}/min
Queue: ${state.queue.length} waiting
Total Throttled: ${stats.totalThrottled}
Total Requests: ${stats.totalRequests}`
          );
          break;
        case "reset":
          providerStates.clear();
          stats.totalRequests = 0;
          stats.totalTokens = 0;
          stats.totalQueued = 0;
          stats.totalThrottled = 0;
          stats.currentQueueSize = 0;
          updateThrottleStatus();
          ctx.ui.notify("\u{1F680} Throttle counters and queues reset", "info");
          break;
        case "providers":
          ctx.ui.notify(
            `\u{1F680} Configured Providers

` + Object.entries(RATE_LIMITS).filter(([key]) => key !== "default").map(
              ([provider2, limit2]) => `${provider2}:
  ${limit2.requestsPerMinute} RPM, ${limit2.tokensPerMinute} TPM
  Burst: ${limit2.burstRequests || "N/A"}`
            ).join("\n\n")
          );
          break;
        case "stats":
          ctx.ui.notify(
            `\u{1F680} Throttle Statistics

Total Requests: ${stats.totalRequests}
Total Tokens: ${stats.totalTokens}
Total Queued: ${stats.totalQueued}
Total Throttled: ${stats.totalThrottled}
Current Queue: ${stats.currentQueueSize}`
          );
          break;
        case "--help":
        default:
          ctx.ui.notify(
            "\u{1F680} Throttle Extension\n\nUsage:\n  /throttle status      - Show current throttle status\n  /throttle reset        - Reset all counters and queues\n  /throttle providers   - List configured providers and limits\n  /throttle stats       - Show detailed statistics\n\nFeatures:\n\u2022 Prevents 429 errors by respecting rate limits\n\u2022 Smart request queuing with FIFO ordering\n\u2022 Token-aware throttling per provider\n\u2022 Real-time status display"
          );
          break;
      }
    }
  });
  pi.on("session_start", async (_event, ctx) => {
    const provider = ctx.model?.provider || "unknown";
    debugLog(`Throttle: Initialized for provider: ${provider}`);
    updateThrottleStatus();
  });
  pi.on("session_shutdown", async (_event, _ctx) => {
    if (throttleStatusId) {
      pi.setStatus(throttleStatusId, "");
    }
  });
}
function estimateRequestTokens(event) {
  const baseTokens = 100;
  if (event.toolName === "bash") {
    return baseTokens + 50;
  } else if (event.toolName === "read") {
    return baseTokens + 200;
  } else if (event.toolName === "write") {
    return baseTokens + 300;
  } else if (event.toolName === "edit") {
    return baseTokens + 500;
  } else {
    return baseTokens + 100;
  }
}
export {
  throttle_default as default
};
