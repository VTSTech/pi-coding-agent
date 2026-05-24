/**
 * Long Term Memory Extension for Pi
 *
 * A persistent memory system that maintains important details between sessions.
 * Automatically injects relevant memory at session start and manages a ~4k token window.
 *
 * CRITICAL: This extension hooks into `pre_session_start` and `session_start` events
 * to ensure memory is checked and available BEFORE the AI generates its first response.
 *
 * Features:
 * - Persistent memory storage across sessions
 * - Automatic injection at session start (BEFORE first AI response)
 * - Memory management commands (/memory)
 * - Automatic summarization to stay within token limits
 * - Tag-based organization
 * - Predefined metadata fields (Primary User, Environment, Framework, Created/Updated timestamps)
 *
 * Usage:
 *   pi (extension auto-loads from .pi/extensions/)
 *   /memory help        - Show available commands
 *   /memory add <text>  - Add a memory item
 *   /memory delete <id|content> - Delete memory by ID or content
 *   /memory replace <id> <new-content> - Replace memory content by ID
 *   /memory list        - List all memories
 *   /memory clear       - Clear all memories
 *   /memory meta        - Show memory metadata
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { join } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "fs";
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
  framework?: string;
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
  // Use the user's home directory for persistent memory storage
  const os = require("os");
  const homeDir = os.homedir();
  return join(homeDir, ".pi", "agent", MEMORY_FILE);
}

function loadMemory(pi: ExtensionAPI): MemoryStore {
  try {
    const path = getMemoryPath(pi);
    if (existsSync(path)) {
      const data = readFileSync(path, "utf8");
      const store = JSON.parse(data) as MemoryStore;
      // Ensure metadata exists (migration from older versions)
      if (!store.metadata) {
        console.log("LTM: No metadata, creating new");
        store.metadata = {
          primaryUser: undefined, // Prompt user instead of auto-detecting
          environment: undefined, // Prompt user instead of auto-detecting
          framework: undefined,   // Prompt user for this as well
          createdAt: store.lastCompacted || Date.now(),
          lastUpdated: Date.now(),
          version: "1.2.7",
          memoryGateEnabled: true,
        };
      } else {
        // Migration: add missing fields
        if (!store.metadata.memoryGateEnabled) {
          store.metadata.memoryGateEnabled = true;
        }
        if (!store.metadata.framework) {
          store.metadata.framework = undefined;
        }
      }
      return store;
    }
  } catch (error) {
    console.error("Failed to load memory:", error);
  }

  // Auto-populate with detected values on first run
  // NOTE: We leave these undefined so the session_start hook will prompt the user
  return {
    memories: [],
    metadata: {
      primaryUser: undefined, // Prompt user instead of auto-detecting
      environment: undefined, // Prompt user instead of auto-detecting
      framework: undefined,   // Prompt user for this as well
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
    const { homedir } = require("os");
    const agentDir = join(homedir(), ".pi", "agent");
    const path = join(agentDir, MEMORY_FILE);
    if (!existsSync(agentDir)) {
      mkdirSync(agentDir, { recursive: true });
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
    try {
      const user = await ctx.ui.input(
        "Primary User",
        `Enter the primary user name for this memory${defaultUser ? ` [${defaultUser}]` : ''}`
      );
      if (user) updates.primaryUser = user;
      else if (defaultUser) updates.primaryUser = defaultUser;
    } catch (e) {
      // User cancelled or error - continue with defaults
    }
  }

  if (!metadata.environment) {
    const defaultEnv = detectEnvironment();
    try {
      const env = await ctx.ui.input(
        "Environment",
        `Enter the environment (e.g., G! Colab, Ubuntu 22.04)${defaultEnv ? ` [${defaultEnv}]` : ''}`
      );
      if (env) updates.environment = env;
      else if (defaultEnv) updates.environment = defaultEnv;
    } catch (e) {
      // User cancelled or error - continue with defaults
    }
  }

  if (!metadata.framework) {
    try {
      const framework = await ctx.ui.input(
        "Framework",
        "Enter the framework (e.g., Pi Coding Agent) [Pi Coding Agent]"
      );
      if (framework) updates.framework = framework;
      else updates.framework = "Pi Coding Agent";
    } catch (e) {
      // User cancelled or error - use default
      updates.framework = "Pi Coding Agent";
    }
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
  if (metadata.framework) {
    lines.push(`Framework: ${metadata.framework}`);
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

function saveMemoryBackup(pi: ExtensionAPI, memories: MemoryItem[], originalCount: number): void {
  try {
    const { homedir } = require("os");
    const backupDir = join(homedir(), ".pi", "agent", "memory-backups");
    
    // Create backup directory if it doesn't exist
    if (!existsSync(backupDir)) {
      mkdirSync(backupDir, { recursive: true });
    }
    
    // Create backup filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFile = join(backupDir, `memory-backup-${timestamp}.json`);
    
    // Copy current memory file
    const memoryFile = join(homedir(), ".pi", "agent", "long-term-memory.json");
    if (existsSync(memoryFile)) {
      const memoryData = readFileSync(memoryFile, "utf8");
      writeFileSync(backupFile, memoryData, "utf8");
      console.log(`Memory backup saved: ${backupFile}`);
    }
  } catch (error) {
    console.error("Failed to save memory backup:", error);
  }
}

function listMemoryBackups(pi: ExtensionAPI): Array<{filename: string, size: number, timestamp: string}> {
  try {
    const { homedir } = require("os");
    const backupDir = join(homedir(), ".pi", "agent", "memory-backups");
    
    if (!existsSync(backupDir)) {
      return [];
    }
    
    const files = existsSync(backupDir) ? readdirSync(backupDir) : [];
    const backups = files
      .filter(file => file.startsWith("memory-backup-") && file.endsWith(".json"))
      .map(file => {
        const filePath = join(backupDir, file);
        const stats = statSync(filePath);
        return {
          filename: file,
          size: stats.size,
          timestamp: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    
    return backups;
  } catch (error) {
    console.error("Failed to list memory backups:", error);
    return [];
  }
}

function searchMemories(store: MemoryStore, query: string): MemoryItem[] {
  const results: MemoryItem[] = [];
  
  // Search in tags
  store.memories.forEach(memory => {
    if (memory.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))) {
      results.push(memory);
    }
  });
  
  // Search in content (if no tag matches found or to get both)
  store.memories.forEach(memory => {
    if (memory.content.toLowerCase().includes(query.toLowerCase()) && !results.includes(memory)) {
      results.push(memory);
    }
  });
  
  return results;
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
  console.log("LTM: Initializing extension...");
  
  // Load memory at startup
  const memoryStore = loadMemory(pi);
  console.log("LTM: Memory loaded, metadata:", JSON.stringify(memoryStore.metadata));

  // Register memory command
  pi.registerCommand("memory", {
    description: "Manage long-term memory (add, delete, replace, list, search, clear, meta, backups)",
    handler: async (args, ctx) => {
      const parts = args?.split(/\s+/) || [];
      const command = parts[0];
      const rest = parts.slice(1).join(" ");

      switch (command) {


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
          let content: string;
          let tags: string[] = [];

          if (rest.includes(" ")) {
            const addSpaceIdx = rest.lastIndexOf(" ");
            if (addSpaceIdx > 0 && rest.substring(addSpaceIdx + 1).includes(",")) {
              content = rest.substring(0, addSpaceIdx);
              tags = rest.substring(addSpaceIdx + 1).split(",").map((t) => t.trim()).filter(Boolean);
            } else {
              content = rest;
            }
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
            .map((m) => `${m.id}: ${m.content.substring(0, 60)}${m.content.length > 60 ? "..." : ""} [${m.tags.join(", ")}]`)
            .join("\n");

          ctx.ui.notify(`Memories:\n${list}`, "info");
          break;

        case "delete":
          if (!rest) {
            ctx.ui.notify("Usage: /memory delete <id> or /memory delete <content-text>", "warning");
            return;
          }
          
          const deleted = deleteMemory(memoryStore, rest);
          if (deleted.length > 0) {
            saveMemory(pi, memoryStore);
            ctx.ui.notify(`Deleted ${deleted.length} memory item(s).`, "success");
          } else {
            ctx.ui.notify("No matching memory found.", "warning");
          }
          break;

        case "replace":
          if (!rest) {
            ctx.ui.notify("Usage: /memory replace <id> <new-content> [comma-separated-tags]", "warning");
            return;
          }

          // Parse content and tags
          let id: string;
          let newContent: string;
          let replaceTags: string[] = [];

          if (rest.includes(" ")) {
            const spaceIdx = rest.lastIndexOf(" ");
            if (spaceIdx > 0 && rest.substring(spaceIdx + 1).includes(",")) {
              // Tags are provided
              const contentAndId = rest.substring(0, spaceIdx);
              const contentSpace = contentAndId.lastIndexOf(" ");
              if (contentSpace > 0) {
                id = contentAndId.substring(0, contentSpace);
                newContent = contentAndId.substring(contentSpace + 1);
                replaceTags = rest.substring(spaceIdx + 1).split(",").map((t) => t.trim()).filter(Boolean);
              } else {
                id = contentAndId;
                newContent = "";
                replaceTags = rest.substring(spaceIdx + 1).split(",").map((t) => t.trim()).filter(Boolean);
              }
            } else {
              // No tags, just ID and content
              const parts = rest.split(" ", 2);
              if (parts.length < 2) {
                ctx.ui.notify("Usage: /memory replace <id> <new-content> [comma-separated-tags]", "warning");
                return;
              }
              id = parts[0];
              newContent = parts[1];
            }
          } else {
            ctx.ui.notify("Usage: /memory replace <id> <new-content> [comma-separated-tags]", "warning");
            return;
          }

          const replaced = replaceMemory(memoryStore, id, newContent, replaceTags.length > 0 ? replaceTags : undefined);
          if (replaced) {
            saveMemory(pi, memoryStore);
            ctx.ui.notify("Memory content replaced.", "success");
          } else {
            ctx.ui.notify("Memory with specified ID not found.", "warning");
          }
          break;

        case "clear":
          memoryStore.memories = [];
          saveMemory(pi, memoryStore);
          ctx.ui.notify("All memories cleared.", "success");
          break;

        case "clear-meta":
          // Reset metadata but keep the file - leave undefined so user will be prompted again
          memoryStore.metadata = {
            primaryUser: undefined,
            environment: undefined,
            framework: undefined,
            createdAt: Date.now(),
            lastUpdated: Date.now(),
            version: memoryStore.metadata.version,
            memoryGateEnabled: true,
          };
          saveMemory(pi, memoryStore);
          ctx.ui.notify("Metadata reset. Please restart to set new values.", "success");
          break;

        case "backups":
          const backupList = listMemoryBackups(pi);
          if (backupList.length === 0) {
            ctx.ui.notify("No memory backups found.", "info");
          } else {
            const backupText = backupList
              .map((backup, index) => `${index + 1}. ${backup.filename} (${backup.size} bytes, ${backup.timestamp})`)
              .join("\n");
            ctx.ui.notify(`Memory backups:\n${backupText}`, "info");
          }
          break;

        case "search":
          if (!rest) {
            ctx.ui.notify("Usage: /memory search <tag|text>", "warning");
            return;
          }
          
          const searchResults = searchMemories(memoryStore, rest);
          if (searchResults.length === 0) {
            ctx.ui.notify("No matching memories found.", "info");
          } else {
            const searchText = searchResults
              .map((m) => `${m.id}: ${m.content.substring(0, 80)}${m.content.length > 80 ? "..." : ""} [${m.tags.join(", ")}]`)
              .join("\n");
            ctx.ui.notify(`Search results for "${rest}":\n${searchText}`, "info");
          }
          break;

        case "stats":
          const totalMemories = memoryStore.memories.length;
          const totalContent = memoryStore.memories.reduce((sum, m) => sum + m.content.length, 0);
          const totalTokens = Math.ceil(totalContent / 4); // Rough token estimate
          const avgTokensPerMemory = totalMemories > 0 ? Math.round(totalTokens / totalMemories) : 0;
          
          const formattedMemory = formatMemoryForContext(memoryStore.memories);
          const formattedTokens = Math.ceil(formattedMemory.length / 4);
          
          ctx.ui.notify(
            `Memory Statistics:\n` +
            `• Total memories: ${totalMemories}\n` +
            `• Total content characters: ${totalContent.toLocaleString()}\n` +
            `• Total estimated tokens: ${totalTokens.toLocaleString()}\n` +
            `• Average tokens per memory: ${avgTokensPerMemory.toLocaleString()}\n` +
            `• Formatted context tokens: ${formattedTokens.toLocaleString()}\n` +
            `• Memory gate: ${memoryStore.metadata.memoryGateEnabled ? "enabled" : "disabled"}\n` +
            `• Last compacted: ${memoryStore.lastCompacted ? new Date(memoryStore.lastCompacted).toLocaleString() : "never"}`,
            "info"
          );
          break;

        default:
          ctx.ui.notify(
            "Memory commands: /memory add <text>, /memory delete <id|content>, /memory replace <id> <new-content>, /memory list, /memory search <tag|text>, /memory stats, /memory clear, /memory meta, /memory backups",
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
    promptSnippet: "memory - Access long-term memory storage",
    parameters: Type.Object({
      action: Type.String({ description: "Action: get, add, delete, replace, list, search, clear, clear-meta, meta" }),
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

        case "search": {
          const searchResults = searchMemories(memoryStore, params.content || "");
          if (searchResults.length === 0) {
            return {
              content: [{ type: "text", text: "No matching memories found." }],
              details: {},
            };
          } else {
            const searchText = searchResults
              .map((m) => `${m.id}: ${m.content.substring(0, 80)}${m.content.length > 80 ? "..." : ""} [${m.tags.join(", ")}]`)
              .join("\n");
            return {
              content: [{ type: "text", text: `Search results for "${params.content || ""}":\n${searchText}` }],
              details: { count: searchResults.length },
            };
          }
        }

        case "stats": {
          const totalMemories = memoryStore.memories.length;
          const totalContent = memoryStore.memories.reduce((sum, m) => sum + m.content.length, 0);
          const totalTokens = Math.ceil(totalContent / 4); // Rough token estimate
          const avgTokensPerMemory = totalMemories > 0 ? Math.round(totalTokens / totalMemories) : 0;
          
          const formattedMemory = formatMemoryForContext(memoryStore.memories);
          const formattedTokens = Math.ceil(formattedMemory.length / 4);
          
          return {
            content: [{ type: "text", text: 
              `Memory Statistics:\n` +
              `• Total memories: ${totalMemories}\n` +
              `• Total content characters: ${totalContent.toLocaleString()}\n` +
              `• Total estimated tokens: ${totalTokens.toLocaleString()}\n` +
              `• Average tokens per memory: ${avgTokensPerMemory.toLocaleString()}\n` +
              `• Formatted context tokens: ${formattedTokens.toLocaleString()}\n` +
              `• Memory gate: ${memoryStore.metadata.memoryGateEnabled ? "enabled" : "disabled"}\n` +
              `• Last compacted: ${memoryStore.lastCompacted ? new Date(memoryStore.lastCompacted).toLocaleString() : "never"}`
            }],
            details: { 
              totalMemories,
              totalContent,
              totalTokens,
              avgTokensPerMemory,
              formattedTokens,
              memoryGateEnabled: memoryStore.metadata.memoryGateEnabled,
              lastCompacted: memoryStore.lastCompacted
            },
          };
        }

        case "list":
          return {
            content: [
              {
                type: "text",
                text: memoryStore.memories
                  .sort((a, b) => b.lastAccessed - a.lastAccessed)
                  .map((m) => `${m.id}: ${m.content.substring(0, 80)}${m.content.length > 80 ? "..." : ""} [${m.tags.join(", ")}]`)
                  .join("\n"),
              },
            ],
            details: { count: memoryStore.memories.length },
          };

        case "delete": {
          const deleted = deleteMemory(memoryStore, params.content || "");
          if (deleted.length > 0) {
            saveMemory(pi, memoryStore);
            return {
              content: [{ type: "text", text: `Deleted ${deleted.length} memory item(s).` }],
              details: { deleted: deleted.map(d => d.id) },
            };
          } else {
            return {
              content: [{ type: "text", text: "No matching memory found." }],
              isError: true,
            };
          }
        }

        case "replace": {
          const id = params.content || "";
          const newContent = params.tags || "";
          const memoryTags = params.tags ? params.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;
          const replaced = replaceMemory(memoryStore, id, newContent, memoryTags);
          if (replaced) {
            saveMemory(pi, memoryStore);
            return {
              content: [{ type: "text", text: "Memory content replaced." }],
              details: { replaced: id },
            };
          } else {
            return {
              content: [{ type: "text", text: "Memory with specified ID not found." }],
              isError: true,
            };
          }
        }

        case "clear":
          memoryStore.memories = [];
          saveMemory(pi, memoryStore);
          return {
            content: [{ type: "text", text: "All memories cleared." }],
            details: {},
          };

        case "clear-meta":
          memoryStore.metadata = {
            primaryUser: undefined,
            environment: undefined,
            framework: undefined,
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

  // Helper functions for delete and replace operations
  function deleteMemory(store: MemoryStore, query: string): MemoryItem[] {
    const deleted: MemoryItem[] = [];
    
    // Try to match by ID first
    const idMatchIndex = store.memories.findIndex(m => m.id === query);
    if (idMatchIndex !== -1) {
      deleted.push(store.memories.splice(idMatchIndex, 1)[0]);
      return deleted;
    }
    
    // If no ID match, search by content
    const contentMatchIndices: number[] = [];
    store.memories.forEach((mem, index) => {
      if (mem.content.includes(query)) {
        contentMatchIndices.push(index);
      }
    });
    
    // Delete content matches (in reverse order to maintain indices)
    for (let i = contentMatchIndices.length - 1; i >= 0; i--) {
      deleted.push(store.memories.splice(contentMatchIndices[i], 1)[0]);
    }
    
    return deleted;
  }

  function replaceMemory(store: MemoryStore, id: string, newContent: string, newTags?: string[]): boolean {
    const memory = store.memories.find(m => m.id === id);
    if (memory) {
      memory.content = newContent;
      if (newTags) {
        memory.tags = newTags;
      }
      memory.lastAccessed = Date.now();
      return true;
    }
    return false;
  }

  // Track if memory has been injected to avoid duplicates
  let memoryInjected = false;

  // Hook into session_start to prompt for metadata and display memory BEFORE any response
  pi.on("session_start", async (_event, ctx) => {
    // Ensure metadata is complete
    const needsMetadata = !memoryStore.metadata.primaryUser || !memoryStore.metadata.environment || !memoryStore.metadata.framework;
    if (needsMetadata) {
      try {
        const updatedMetadata = await promptForMetadata(ctx, memoryStore.metadata);
        memoryStore.metadata = updatedMetadata;
      } catch (e) {
        // User cancelled or error - continue with defaults
        console.log("LTM: Metadata prompt failed:", e);
        debugLog("ltm", "Metadata prompt cancelled or failed");
      }
    }
    
    // Update last accessed times
    const now = Date.now();
    for (const mem of memoryStore.memories) {
      mem.lastAccessed = now;
    }

    saveMemory(pi, memoryStore);

    // CRITICAL: Always display who we're interacting with and the environment
    const metaText = formatMetadataForContext(memoryStore.metadata);
    ctx.ui?.notify?.(
      `Memory context loaded:\n${metaText.substring(0, 300)}...`,
      "info"
    );

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

    saveMemory(pi, memoryStore);

    // Check if we need to compact (summarize) memory
    const memoryText = formatMemoryForContext(memoryStore.memories);
    const memoryTokens = estimateTokens(memoryText);

    if (memoryTokens > MAX_MEMORY_TOKENS * 0.8) {
      // Backup pre-compacted memories
      const backupMemories = [...memoryStore.memories];
      
      // Compact memory - keep most important
      const targetTokens = Math.floor(MAX_MEMORY_TOKENS * 0.6);
      const compacted = summarizeMemory(memoryStore.memories, targetTokens);
      const previousCount = memoryStore.memories.length;
      memoryStore.memories = compacted;
      memoryStore.lastCompacted = now;
      
      // Save backup to file
      saveMemoryBackup(pi, backupMemories, previousCount);
      
      saveMemory(pi, memoryStore);

      ctx.ui?.notify?.(
        `Memory compacted: ${previousCount} → ${memoryStore.memories.length} items (~${estimateTokens(formatMemoryForContext(memoryStore.memories))} tokens). Backup saved.`,
        "info"
      );
    }

    // Inject memory into the messages array (prepend to system prompt)
    if (memoryStore.memories.length > 0 || memoryStore.metadata.primaryUser || memoryStore.metadata.environment || memoryStore.metadata.framework) {
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

  // Note: Memory injection happens in pre_session_start (for metadata) and session_start (for notification)
  // The actual memory content is injected via before_provider_request hook

  // Register a tool for AI-driven memory requests
  pi.registerTool({
    name: "create_memory",
    label: "Create Memory",
    description: "Request to create a long-term memory (subject to user gate)",
    promptSnippet: "create_memory - Request to create a long-term memory (subject to user gate)",
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