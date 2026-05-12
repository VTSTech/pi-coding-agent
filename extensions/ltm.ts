/**
 * Long Term Memory Extension for Pi
 *
 * A persistent memory system that maintains important details between sessions.
 * Automatically injects relevant memory at session start and manages a ~4k token window.
 *
 * Features:
 * - Persistent memory storage across sessions
 * - Automatic injection at session start
 * - Memory management commands (/memory)
 * - Automatic summarization to stay within token limits
 * - Tag-based organization
 * - Predefined metadata fields (Primary User, Environment, Created/Updated timestamps)
 *
 * Usage:
 *   pi (extension auto-loads from .pi/extensions/)
 *   /memory help        - Show available commands
 *   /memory add <text>  - Add a memory item
 *   /memory list        - List all memories
 *   /memory clear       - Clear all memories
 *   /memory meta        - Show memory metadata
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { debugLog } from "../shared/debug";

// Memory file path (in .pi/agent/ directory)
const MEMORY_FILE = "long-term-memory.json";

// Token estimation (rough approximation: 1 token ≈ 4 chars for English text)
const TOKENS_PER_CHAR = 0.25;
const MAX_MEMORY_TOKENS = 4000; // ~4k token window

interface MemoryItem {
  id: string;
  content: string;
  tags: string[];
  timestamp: number;
  lastAccessed: number;
  importance: number; // 1-10 scale
}

interface MemoryMetadata {
  primaryUser?: string;
  environment?: string;
  createdAt: number;
  lastUpdated: number;
  version: string;
  memoryGateEnabled: boolean; // Prompt user before creating memories
}

interface MemoryStore {
  memories: MemoryItem[];
  metadata: MemoryMetadata;
  lastCompacted: number;
}

function getMemoryPath(pi: ExtensionAPI): string {
  // Use the agent directory for storing memory
  const agentDir = (pi as any).agentDir || ".pi/agent";
  return join(agentDir, MEMORY_FILE);
}

function loadMemory(pi: ExtensionAPI): MemoryStore {
  try {
    const path = getMemoryPath(pi);
    if (existsSync(path)) {
      const data = readFileSync(path, "utf8");
      const store = JSON.parse(data) as MemoryStore;
      // Ensure metadata exists (migration from older versions)
      if (!store.metadata) {
        store.metadata = {
          primaryUser: detectPrimaryUser(),
          environment: detectEnvironment(),
          createdAt: store.lastCompacted || Date.now(),
          lastUpdated: Date.now(),
          version: "1.2.7",
          memoryGateEnabled: true,
        };
      } else if (!store.metadata.memoryGateEnabled) {
        // Migration: add memoryGateEnabled if missing
        store.metadata.memoryGateEnabled = true;
      }
      return store;
    }
  } catch (error) {
    console.error("Failed to load memory:", error);
  }

  // Auto-populate with detected values on first run
  return {
    memories: [],
    metadata: {
      primaryUser: detectPrimaryUser(),
      environment: detectEnvironment(),
      createdAt: Date.now(),
      lastUpdated: Date.now(),
      version: "1.2.7",
      memoryGateEnabled: true, // Default: prompt user before creating memories
    },
    lastCompacted: Date.now(),
  };
}

function saveMemory(pi: ExtensionAPI, store: MemoryStore): void {
  try {
    const path = getMemoryPath(pi);
    const dir = path.substring(0, path.lastIndexOf("/"));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    store.metadata.lastUpdated = Date.now();
    writeFileSync(path, JSON.stringify(store, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to save memory:", error);
  }
}

function formatDate(timestamp: number): string {
  const d = new Date(timestamp);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const seconds = String(d.getSeconds()).padStart(2, "0");
  return `${month}-${day}-${year} ${hours}:${minutes}:${seconds}`;
}

function detectPrimaryUser(): string | undefined {
  // Try to detect from environment
  if (process.env.USER) return process.env.USER;
  if (process.env.USERNAME) return process.env.USERNAME;
  if (process.env.LOGNAME) return process.env.LOGNAME;
  return undefined;
}

function detectEnvironment(): string | undefined {
  // Try to detect from environment or settings
  if (process.env.NODE_ENV) return process.env.NODE_ENV;
  if (process.env.ENVIRONMENT) return process.env.ENVIRONMENT;
  return undefined;
}

async function promptForMetadata(ctx: any, metadata: MemoryMetadata): Promise<MemoryMetadata> {
  const updates: Partial<MemoryMetadata> = {};

  if (!metadata.primaryUser) {
    const defaultUser = detectPrimaryUser();
    const user = await ctx.ui.input(
      "Primary User",
      "Enter the primary user name for this memory:",
      defaultUser || ""
    );
    if (user) updates.primaryUser = user;
  }

  if (!metadata.environment) {
    const defaultEnv = detectEnvironment();
    const env = await ctx.ui.input(
      "Environment",
      "Enter the environment (e.g., development, production):",
      defaultEnv || ""
    );
    if (env) updates.environment = env;
  }

  return { ...metadata, ...updates };
}

function formatMetadataForContext(metadata: MemoryMetadata): string {
  const lines: string[] = ["---", "MEMORY METADATA", "---"];

  if (metadata.primaryUser) {
    lines.push(`Primary User: ${metadata.primaryUser}`);
  }
  if (metadata.environment) {
    lines.push(`Environment: ${metadata.environment}`);
  }

  lines.push(`Created: ${formatDate(metadata.createdAt)}`);
  lines.push(`Last Updated: ${formatDate(metadata.lastUpdated)}`);
  lines.push("---");

  return lines.join("\n");
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR);
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

function summarizeMemory(memories: MemoryItem[], targetTokens: number): MemoryItem[] {
  // Sort by importance and last accessed
  const sorted = [...memories].sort((a, b) => {
    const importanceDiff = b.importance - a.importance;
    if (importanceDiff !== 0) return importanceDiff;
    return b.lastAccessed - a.lastAccessed;
  });

  let currentTokens = 0;
  const kept: MemoryItem[] = [];

  for (const mem of sorted) {
    const memTokens = estimateTokens(mem.content);
    if (currentTokens + memTokens <= targetTokens) {
      kept.push(mem);
      currentTokens += memTokens;
    }
  }

  return kept;
}

function formatMemoryForContext(memories: MemoryItem[]): string {
  if (memories.length === 0) return "";

  const lines: string[] = [
    "---",
    "LONG-TERM MEMORY (from previous sessions)",
    "---",
  ];

  for (const mem of memories) {
    const date = formatDate(mem.timestamp);
    const tags = mem.tags.length > 0 ? ` [${mem.tags.join(", ")}]` : "";
    lines.push(`[${date}] ${mem.content}${tags}`);
  }

  lines.push("---");
  return lines.join("\n");
}

export default function (pi: ExtensionAPI) {
  // Load memory at startup
  const memoryStore = loadMemory(pi);

  // Register memory command
  pi.registerCommand("memory", {
    description: "Manage long-term memory (add, list, clear, meta, help)",
    handler: async (args, ctx) => {
      const parts = args?.split(/\s+/) || [];
      const command = parts[0];
      const rest = parts.slice(1).join(" ");

      switch (command) {
        case "help":
          ctx.ui.notify(
            "Memory commands: /memory add <text>, /memory list, /memory clear, /memory clear-meta, /memory meta, /memory help",
            "info"
          );
          break;

        case "meta":
          const metaText = formatMetadataForContext(memoryStore.metadata);
          ctx.ui.notify(metaText, "info");
          break;

        case "add":
          if (!rest) {
            ctx.ui.notify("Usage: /memory add <text> [comma-separated-tags]", "warning");
            return;
          }

          // Parse content and tags
          const lastSpace = rest.lastIndexOf(" ");
          let content: string;
          let tags: string[] = [];

          if (lastSpace > 0 && rest.substring(lastSpace + 1).includes(",")) {
            content = rest.substring(0, lastSpace);
            tags = rest.substring(lastSpace + 1).split(",").map((t) => t.trim()).filter(Boolean);
          } else {
            content = rest;
          }

          memoryStore.memories.push({
            id: generateId(),
            content,
            tags,
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            importance: 5,
          });

          saveMemory(pi, memoryStore);
          ctx.ui.notify(`Memory added: "${content.substring(0, 50)}..."`, "success");
          break;

        case "list":
          if (memoryStore.memories.length === 0) {
            ctx.ui.notify("No memories stored.", "info");
            return;
          }

          const list = memoryStore.memories
            .sort((a, b) => b.lastAccessed - a.lastAccessed)
            .map((m) => `${m.id.substring(0, 6)}: ${m.content.substring(0, 60)}${m.content.length > 60 ? "..." : ""} [${m.tags.join(", ")}]`)
            .join("\n");

          ctx.ui.notify(`Memories:\n${list}`, "info");
          break;

        case "clear":
          memoryStore.memories = [];
          saveMemory(pi, memoryStore);
          ctx.ui.notify("All memories cleared.", "success");
          break;

        case "clear-meta":
          // Reset metadata but keep the file
          memoryStore.metadata = {
            primaryUser: detectPrimaryUser(),
            environment: detectEnvironment(),
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            version: memoryStore.metadata.version,
            memoryGateEnabled: true,
          };
          saveMemory(pi, memoryStore);
          ctx.ui.notify("Metadata reset. Please restart to set new values.", "success");
          break;

        default:
          ctx.ui.notify(
            "Memory commands: /memory add <text>, /memory list, /memory clear, /memory meta, /memory help",
            "info"
          );
      }
    },
  });

  // Register a tool for programmatic memory access
  pi.registerTool({
    name: "memory",
    label: "Memory",
    description: "Access long-term memory storage",
    parameters: Type.Object({
      action: Type.String({ description: "Action: get, add, list, clear, clear-meta, meta" }),
      content: Type.Optional(Type.String({ description: "Content for add action" })),
      tags: Type.Optional(Type.String({ description: "Comma-separated tags" })),
    }),
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      switch (params.action) {
        case "get":
          const memorySection = formatMemoryForContext(memoryStore.memories);
          const metaSection = formatMetadataForContext(memoryStore.metadata);
          return {
            content: [
              {
                type: "text",
                text: memorySection + "\n\n" + metaSection,
              },
            ],
            details: { count: memoryStore.memories.length },
          };

        case "add": {
          const content = params.content || "";
          const tags = (params.tags || "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);

          memoryStore.memories.push({
            id: generateId(),
            content,
            tags,
            timestamp: Date.now(),
            lastAccessed: Date.now(),
            importance: 5,
          });

          saveMemory(pi, memoryStore);
          return {
            content: [{ type: "text", text: `Memory added: ${content.substring(0, 50)}...` }],
            details: { id: memoryStore.memories[memoryStore.memories.length - 1].id },
          };
        }

        case "list":
          return {
            content: [
              {
                type: "text",
                text: memoryStore.memories
                  .sort((a, b) => b.lastAccessed - a.lastAccessed)
                  .map((m) => `- ${m.content} [${m.tags.join(", ")}]`)
                  .join("\n"),
              },
            ],
            details: { count: memoryStore.memories.length },
          };

        case "clear":
          memoryStore.memories = [];
          saveMemory(pi, memoryStore);
          return {
            content: [{ type: "text", text: "All memories cleared." }],
            details: {},
          };

        case "clear-meta":
          memoryStore.metadata = {
            primaryUser: detectPrimaryUser(),
            environment: detectEnvironment(),
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            version: memoryStore.metadata.version,
            memoryGateEnabled: memoryStore.metadata.memoryGateEnabled,
          };
          saveMemory(pi, memoryStore);
          return {
            content: [{ type: "text", text: "Metadata reset. Restart to set new values." }],
            details: {},
          };

        case "meta":
          return {
            content: [{ type: "text", text: formatMetadataForContext(memoryStore.metadata) }],
            details: memoryStore.metadata,
          };

        default:
          return {
            content: [{ type: "text", text: `Unknown action: ${params.action}` }],
            isError: true,
          };
      }
    },
  });

  // Track if memory has been injected to avoid duplicates
  let memoryInjected = false;

  // Hook into session_start to check and display memory BEFORE any response
  pi.on("session_start", async (_event, ctx) => {
    // Update last accessed times
    const now = Date.now();
    for (const mem of memoryStore.memories) {
      mem.lastAccessed = now;
    }

    saveMemory(pi, memoryStore);

    // IMPORTANT: Check memory at session start (new sessions are almost certainly
    // NOT the first session - user likely has context from previous work)
    if (memoryStore.memories.length > 0) {
      const memoryContent = formatMemoryForContext(memoryStore.memories);
      ctx.ui?.notify?.(
        `Long-term memory loaded: ${memoryStore.memories.length} memories\n\n${memoryContent.substring(0, 200)}...` + (memoryContent.length > 200 ? "..." : ""),
        "info"
      );
    }

    // Notify user that this is a continuing session, not necessarily first
    const sessionAge = Date.now() - memoryStore.metadata.createdAt;
    if (sessionAge > 60000) {
      ctx.ui?.notify?.(
        `Continuing from previous session (${Math.round(sessionAge / 60000)} min ago)`,
        "info"
      );
    }
  });

  // Hook into before_provider_request to inject memory BEFORE the first API call
  pi.on("before_provider_request", async (event, ctx) => {
    // Only inject once per session
    if (memoryInjected) return;

    const now = Date.now();

    // Update last accessed times and save
    for (const mem of memoryStore.memories) {
      mem.lastAccessed = now;
    }

    // Prompt for metadata if missing
    const needsMetadata = !memoryStore.metadata.primaryUser || !memoryStore.metadata.environment;
    if (needsMetadata) {
      try {
        const updatedMetadata = await promptForMetadata(ctx, memoryStore.metadata);
        memoryStore.metadata = updatedMetadata;
      } catch (e) {
        // User cancelled or error - continue without prompting
        debugLog("ltm", "Metadata prompt cancelled or failed");
      }
    }

    saveMemory(pi, memoryStore);

    // Check if we need to compact (summarize) memory
    const memoryText = formatMemoryForContext(memoryStore.memories);
    const memoryTokens = estimateTokens(memoryText);

    if (memoryTokens > MAX_MEMORY_TOKENS * 0.8) {
      // Compact memory - keep most important
      const targetTokens = Math.floor(MAX_MEMORY_TOKENS * 0.6);
      const compacted = summarizeMemory(memoryStore.memories, targetTokens);
      memoryStore.memories = compacted;
      memoryStore.lastCompacted = now;
      saveMemory(pi, memoryStore);

      ctx.ui?.notify?.(
        `Memory compacted: ${memoryStore.memories.length} items, ~${estimateTokens(formatMemoryForContext(memoryStore.memories))} tokens`,
        "info"
      );
    }

    // Inject memory into the messages array (prepend to system prompt)
    if (memoryStore.memories.length > 0 || memoryStore.metadata.primaryUser || memoryStore.metadata.environment) {
      const memoryContent = formatMemoryForContext(memoryStore.memories);
      const metaContent = formatMetadataForContext(memoryStore.metadata);
      const fullContent = metaContent + "\n\n" + memoryContent;

      // Modify the payload to include memory in system prompt
      const payload = event.payload;
      if (payload && payload.messages) {
        // Create a system message with memory content
        const memoryMessage = {
          role: "system",
          content: fullContent
        };

        // Prepend to messages array
        payload.messages.unshift(memoryMessage);

        // Mark as injected
        memoryInjected = true;
      }
    }
  });

  // Note: session_start handler moved earlier to check memory before first response

  // Register a tool for AI-driven memory requests
  pi.registerTool({
    name: "create_memory",
    label: "Create Memory",
    description: "Request to create a long-term memory (subject to user gate)",
    parameters: Type.Object({
      content: Type.String({ description: "Memory content to store" }),
      tags: Type.Optional(Type.String({ description: "Comma-separated tags" })),
      reason: Type.Optional(Type.String({ description: "Why this is worth remembering" })),
    }),
    async execute(toolCallId, params, _signal, _onUpdate, ctx) {
      const content = params.content || "";
      const tags = (params.tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const reason = params.reason || "AI determined this is worth remembering";

      // If gate is enabled, prompt user
      if (memoryStore.metadata.memoryGateEnabled) {
        const ok = await ctx.ui.confirm(
          "Create Memory?",
          `${content}\n\n${reason}\n\nCreate this memory?`
        );
        if (!ok) {
          return {
            content: [{ type: "text", text: "Memory creation cancelled by user." }],
            details: { cancelled: true },
          };
        }
      }

      // Create the memory
      memoryStore.memories.push({
        id: generateId(),
        content,
        tags,
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        importance: 6,
      });

      saveMemory(pi, memoryStore);
      return {
        content: [{ type: "text", text: `Memory created: ${content.substring(0, 50)}...` }],
        details: { id: memoryStore.memories[memoryStore.memories.length - 1].id },
      };
    },
  });

  // Register command to toggle memory gate
  pi.registerCommand("memory-gate", {
    description: "Toggle memory creation gate (prompt user before creating memories)",
    handler: async (_args, ctx) => {
      const enabled = memoryStore.metadata.memoryGateEnabled;
      memoryStore.metadata.memoryGateEnabled = !enabled;
      saveMemory(pi, memoryStore);
      const status = memoryStore.metadata.memoryGateEnabled ? "enabled" : "disabled";
      ctx.ui.notify(`Memory gate ${status}. AI will ${memoryStore.metadata.memoryGateEnabled ? "prompt before creating memories" : "auto-create memories"}`, "success");
    },
  });

  // Hook into compaction to preserve important memories
  pi.on("session_before_compact", async (event, ctx) => {
    const { preparation } = event;

    // Mark memories as important before compaction
    // This ensures they won't be lost during session compaction
    for (const mem of memoryStore.memories) {
      if (mem.importance < 7) {
        mem.importance = 7; // Boost importance
      }
    }
    saveMemory(pi, memoryStore);

    ctx.ui.notify(
      `Long-term memory preserved: ${memoryStore.memories.length} items`,
      "info"
    );
  });

  // Log startup
  console.log(`Long-term memory extension loaded. ${memoryStore.memories.length} memories available.`);
  console.log(`Memory created: ${new Date(memoryStore.metadata.createdAt).toISOString()}`);
}