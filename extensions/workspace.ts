/**
 * Workspace Management Extension for Pi Coding Agent.
 *
 * Manages, archives, and restores workspaces with session state.
 * Tracks session name, skills, configs, and extensions.
 *
 * Commands:
 *   /workspace              — Show workspace management help
 *   /workspace save <name>  — Save current workspace state
 *   /workspace load <name>  — Load a saved workspace
 *   /workspace list         — List all saved workspaces
 *   /workspace delete <name> — Delete a saved workspace
 *   /workspace current      — Show current workspace state
 *
 * Written by VTSTech — https://www.vts-tech.org
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "path";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { debugLog } from "../shared/debug";
import { section, ok, warn, info } from "../shared/format";
import { readSettings, writeSettings } from "../shared/config-io";

// ============================================================================
// Constants
// ============================================================================

const WORKSPACE_DIR = join(homedir(), ".pi", "agent", "workspaces");
const WORKSPACE_EXT = ".ws.json";

// ============================================================================
// Types
// ============================================================================

interface WorkspaceState {
  name: string;
  savedAt: string;
  session: { sessionName?: string };
  skills: string[];
  extensions: string[];
  configs: Record<string, unknown>;
  soul?: { name: string; level: number };
  cwd?: string;
  version: string;
}

// ============================================================================
// Helpers
// ============================================================================

function getWorkspacePath(name: string): string {
  return join(WORKSPACE_DIR, `${name}${WORKSPACE_EXT}`);
}

function loadWorkspace(name: string): WorkspaceState | null {
  try {
    const path = getWorkspacePath(name);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch { return null; }
}

function saveWorkspaceState(name: string, state: WorkspaceState): boolean {
  try {
    if (!existsSync(WORKSPACE_DIR)) mkdirSync(WORKSPACE_DIR, { recursive: true });
    writeFileSync(getWorkspacePath(name), JSON.stringify(state, null, 2), "utf-8");
    return true;
  } catch { return false; }
}

function getCurrentExtensions(): string[] {
  const extensions: string[] = [];
  const seen = new Set<string>();

  // Check ~/.pi/agent/extensions (local extensions)
  const localExtDir = join(homedir(), ".pi", "agent", "extensions");
  try {
    if (existsSync(localExtDir)) {
      for (const entry of readdirSync(localExtDir)) {
        if (entry.endsWith(".js") || entry.endsWith(".mjs")) {
          const extName = entry.replace(/\.(js|mjs)$/, "");
          if (!seen.has(extName)) {
            extensions.push(extName);
            seen.add(extName);
          }
        }
      }
    }
  } catch (err) {
    debugLog("workspace", "failed to scan local extensions", err);
  }

  // Check git bundles for extensions/ directory
  const gitBase = join(homedir(), ".pi", "agent", "git");
  try {
    if (existsSync(gitBase)) {
      for (const gitDir of readdirSync(gitBase)) {
        const extPath = join(gitBase, gitDir, "extensions");
        if (!existsSync(extPath)) continue;

        for (const entry of readdirSync(extPath)) {
          if (entry.endsWith(".ts") || entry.endsWith(".js")) {
            const extName = entry.replace(/\.(ts|js)$/, "");
            if (!seen.has(extName)) {
              extensions.push(extName);
              seen.add(extName);
            }
          }
        }
      }
    }
  } catch (err) {
    debugLog("workspace", "failed to scan git extensions", err);
  }

  return extensions;
}

function getCurrentSkills(): string[] {
  const skills: string[] = [];
  try {
    const skillsDir = join(homedir(), ".pi", "agent", "skills");
    if (!existsSync(skillsDir)) return [];
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md"))) {
        skills.push(entry.name);
      }
    }
  } catch { console.error("Failed to list skills"); }
  return skills;
}

function getCurrentSoul(): { name: string; level: number } | null {
  try {
    const soulConfigPath = join(homedir(), ".pi", "agent", "soul-config.json");
    if (existsSync(soulConfigPath)) {
      const config = JSON.parse(readFileSync(soulConfigPath, "utf-8"));
      if (config.activeSoul) return { name: config.activeSoul.name, level: config.activeSoul.level || 2 };
    }
  } catch {}
  return null;
}

const BRANDING = `⚡ Pi Workspace Manager v1.3.5 - VTSTech`;

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  pi.registerCommand("workspace", {
    description: "Save, load, and manage workspaces",
    handler: async (args, ctx) => {
      const [sub, workspaceName] = (args || "").trim().split(/\s+/, 2);

      switch (sub) {
        case "save":
          if (!workspaceName) return ctx.ui.notify("Usage: /workspace save <name>", "error");
          return handleSave(ctx, workspaceName);

        case "load":
          if (!workspaceName) return ctx.ui.notify("Usage: /workspace load <name>", "error");
          return handleLoad(ctx, workspaceName);

        case "delete":
          if (!workspaceName) return ctx.ui.notify("Usage: /workspace delete <name>", "error");
          return handleDelete(ctx, workspaceName);

        case "list":
          return handleList(ctx);

        case "current":
          return handleCurrent(ctx);

        default:
          ctx.ui.notify("Workspace commands: save, load, delete, list, current", "info");
      }
    },
  });

  async function handleSave(ctx: any, name: string) {
    const state: WorkspaceState = {
      name, savedAt: new Date().toISOString(),
      session: { sessionName: undefined },
      skills: getCurrentSkills(),
      extensions: getCurrentExtensions(),
      configs: readSettings(),
      soul: getCurrentSoul(),
      cwd: process.cwd(),
      version: "1.0.0",
    };

    if (saveWorkspaceState(name, state)) {
      ctx.ui.notify(`Saved workspace "${name}"`, "success");
    }
  }

  async function handleLoad(ctx: any, name: string) {
    const workspace = loadWorkspace(name);
    if (!workspace) return ctx.ui.notify(`Workspace "${name}" not found`, "error");

    writeSettings(workspace.configs);
    ctx.ui.notify(`Loaded workspace "${name}"`, "success");
  }

  async function handleList(ctx: any) {
    const names: string[] = [];
    try {
      if (existsSync(WORKSPACE_DIR)) {
        for (const f of readdirSync(WORKSPACE_DIR)) {
          if (f.endsWith(WORKSPACE_EXT)) names.push(f.slice(0, -WORKSPACE_EXT.length));
        }
      }
    } catch {}

    if (names.length === 0) ctx.ui.notify("No workspaces saved", "info");
    else ctx.ui.notify(`Workspaces: ${names.join(", ")}`, "info");
  }

  async function handleDelete(ctx: any, name: string) {
    const path = getWorkspacePath(name);
    if (existsSync(path)) {
      unlinkSync(path);
      ctx.ui.notify(`Deleted workspace "${name}"`, "success");
    } else {
      ctx.ui.notify(`Workspace "${name}" not found`, "error");
    }
  }

  async function handleCurrent(ctx: any) {
    const exts = getCurrentExtensions();
    const skills = getCurrentSkills();

    let output = `${BRANDING}\n\n`;
    output += `Extensions: ${exts.length}\n`;
    output += `Skills: ${skills.length}\n`;

    pi.sendMessage({
      customType: "workspace-current",
      content: output,
      display: { type: "content", content: output },
    });
  }
}