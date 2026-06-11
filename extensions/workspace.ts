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
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { homedir } from "os";
import { debugLog } from "../shared/debug";
import { section, ok, fail, warn, info } from "../shared/format";
import { readSettings, writeSettings } from "../shared/config-io";

// ============================================================================
// Constants
// ============================================================================

const EXTENSION_VERSION = "1.3.5";
const WORKSPACE_DIR = join(homedir(), ".pi", "agent", "workspaces");
const WORKSPACE_EXT = ".ws.json";

// ============================================================================
// Types
// ============================================================================

interface WorkspaceConfig {
  defaultProvider?: string;
  defaultModel?: string;
  theme?: string;
  defaultThinkingLevel?: string;
  hideThinkingBlock?: boolean;
  [key: string]: unknown;
}

interface WorkspaceState {
  name: string;
  savedAt: string;
  session: { sessionName?: string };
  skills: string[];
  extensions: string[];
  configs: WorkspaceConfig;
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

function listWorkspaces(): string[] {
  try {
    if (!existsSync(WORKSPACE_DIR)) return [];
    return readdirSync(WORKSPACE_DIR)
      .filter(f => f.endsWith(WORKSPACE_EXT))
      .map(f => f.slice(0, -WORKSPACE_EXT.length))
      .sort();
  } catch (err) {
    debugLog("workspace", "failed to list workspaces", err);
    return [];
  }
}

function loadWorkspace(name: string): WorkspaceState | null {
  try {
    const path = getWorkspacePath(name);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (err) {
    debugLog("workspace", `failed to load workspace ${name}`, err);
    return null;
  }
}

function saveWorkspaceState(name: string, state: WorkspaceState): boolean {
  try {
    if (!existsSync(WORKSPACE_DIR)) mkdirSync(WORKSPACE_DIR, { recursive: true });
    writeFileSync(getWorkspacePath(name), JSON.stringify(state, null, 2), "utf-8");
    return true;
  } catch (err) {
    debugLog("workspace", `failed to save workspace ${name}`, err);
    return false;
  }
}

function deleteWorkspace(name: string): boolean {
  try {
    const path = getWorkspacePath(name);
    if (!existsSync(path)) return false;
    unlinkSync(path);
    return true;
  } catch (err) {
    debugLog("workspace", `failed to delete workspace ${name}`, err);
    return false;
  }
}

function getCurrentSessionName(): string | undefined {
  try {
    const sessionNameFile = join(homedir(), ".pi", "agent", "session-name");
    if (existsSync(sessionNameFile)) {
      return readFileSync(sessionNameFile, "utf-8").trim() || undefined;
    }
  } catch (err) {
    debugLog("workspace", "failed to read session name", err);
  }
  return undefined;
}

function getCurrentSkills(): string[] {
  try {
    const skillsDir = join(homedir(), ".pi", "agent", "skills");
    if (!existsSync(skillsDir)) return [];
    const skills: string[] = [];
    for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(join(skillsDir, entry.name, "SKILL.md"))) {
        skills.push(entry.name);
      }
    }
    return skills;
  } catch (err) {
    debugLog("workspace", "failed to list skills", err);
    return [];
  }
}

function getCurrentExtensions(): string[] {
  const extensions: string[] = [];
  const seen = new Set<string>();

  // Check extensions from git packages
  try {
    const gitBase = join(homedir(), ".pi", "agent", "git");
    if (existsSync(gitBase)) {
      for (const gitDir of readdirSync(gitBase)) {
        const pkgPath = join(gitBase, gitDir, "individual-packages");
        if (!existsSync(pkgPath)) continue;

        for (const pkgDir of readdirSync(pkgPath)) {
          if (pkgDir.startsWith("pi-") && !seen.has(pkgDir)) {
            const extFile = join(pkgPath, pkgDir, `${pkgDir.replace(/^pi-/, "")}.ts`);
            if (existsSync(extFile)) {
              extensions.push(pkgDir);
              seen.add(pkgDir);
            }
          }
        }
      }
    }
  } catch (err) {
    debugLog("workspace", "failed to list extensions", err);
  }

  return extensions;
}

function getCurrentSoul(): { name: string; level: number } | null {
  try {
    const soulConfigPath = join(homedir(), ".pi", "agent", "soul-config.json");
    if (existsSync(soulConfigPath)) {
      const config = JSON.parse(readFileSync(soulConfigPath, "utf-8"));
      if (config.activeSoul) return { name: config.activeSoul.name, level: config.activeSoul.level || 2 };
    }
  } catch (err) {
    debugLog("workspace", "failed to read soul config", err);
  }
  return null;
}

function getCurrentCwd(): string {
  try { return process.cwd(); } catch { return "."; }
}

// ============================================================================
// Branding
// ============================================================================

const BRANDING = [
  `  ⚡ Pi Workspace Manager v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`,
].join("\n");

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  pi.registerCommand("workspace", {
    description: "Save, load, and manage workspaces (session state)",
    handler: async (args, ctx) => {
      const parts = args?.split(/\s+/) || [];
      const sub = parts[0]?.toLowerCase() || "";
      const name = parts.slice(1).join(" ").trim();

      switch (sub) {
        case "":
        case "help":
          ctx.ui.notify("Commands: save, load, delete, list, current", "info");
          return;

        case "save":
          if (!name) return ctx.ui.notify("Usage: /workspace save <name>", "error");
          return handleSave(ctx, name);

        case "load":
          if (!name) return ctx.ui.notify("Usage: /workspace load <name>", "error");
          return handleLoad(ctx, name);

        case "delete":
          if (!name) return ctx.ui.notify("Usage: /workspace delete <name>", "error");
          return handleDelete(ctx, name);

        case "list":
          return handleList(ctx);

        case "current":
          return handleCurrent(ctx);

        default:
          ctx.ui.notify(`Unknown: ${sub}`, "error");
      }
    },
  });

  async function handleSave(ctx: any, name: string) {
    const state: WorkspaceState = {
      name, savedAt: new Date().toISOString(),
      session: { sessionName: getCurrentSessionName() },
      skills: getCurrentSkills(),
      extensions: getCurrentExtensions(),
      configs: readSettings(),
      soul: getCurrentSoul(),
      cwd: getCurrentCwd(),
      version: "1.0.0",
    };

    if (!saveWorkspaceState(name, state)) {
      return ctx.ui.notify(`Failed to save`, "error");
    }

    pi.sendMessage({
      customType: "workspace-saved",
      content: [BRANDING, section("SAVED"), ok(`Name: ${name}`), info(`Extensions: ${state.extensions.length}`), info(`Skills: ${state.skills.length}`)].join("\n"),
      display: { type: "content", content: "" }
    });
    ctx.ui.notify(`Saved "${name}"`, "success");
  }

  async function handleLoad(ctx: any, name: string) {
    const workspace = loadWorkspace(name);
    if (!workspace) return ctx.ui.notify(`Not found: ${name}`, "error");

    writeSettings(workspace.configs);

    if (workspace.session.sessionName) {
      writeFileSync(join(homedir(), ".pi", "agent", "session-name"), workspace.session.sessionName, "utf-8");
    }

    if (workspace.soul) {
      const existing = existsSync(join(homedir(), ".pi", "agent", "soul-config.json"))
        ? JSON.parse(readFileSync(join(homedir(), ".pi", "agent", "soul-config.json"), "utf-8"))
        : { persistence: true, autoLoad: true };
      existing.activeSoul = { name: workspace.soul.name, level: workspace.soul.level, updatedAt: Date.now() };
      writeFileSync(join(homedir(), ".pi", "agent", "soul-config.json"), JSON.stringify(existing, null, 2), "utf-8");
    }

    pi.sendMessage({
      customType: "workspace-loaded",
      content: [BRANDING, section("LOADED"), ok(`Name: ${workspace.name}`)].join("\n"),
      display: { type: "content", content: "" }
    });
    ctx.ui.notify(`Loaded "${name}"`, "success");
  }

  async function handleList(ctx: any) {
    const names = listWorkspaces();
    const lines = [BRANDING, section("WORKSPACES")];
    if (names.length === 0) lines.push(info("None saved"));
    else for (const n of names) {
      const ws = loadWorkspace(n);
      if (ws) lines.push(ok(`  ${n} (${ws.skills.length} skills, ${ws.extensions.length} ext)`));
    }
    pi.sendMessage({ customType: "workspace-list", content: lines.join("\n"), display: { type: "content", content: "" } });
  }

  async function handleDelete(ctx: any, name: string) {
    if (!loadWorkspace(name)) return ctx.ui.notify(`Not found: ${name}`, "error");
    if (deleteWorkspace(name)) ctx.ui.notify(`Deleted "${name}"`, "success");
    else ctx.ui.notify(`Failed to delete`, "error");
  }

  async function handleCurrent(ctx: any) {
    const skills = getCurrentSkills();
    const exts = getCurrentExtensions();
    const settings = readSettings();

    const lines = [
      BRANDING, section("CURRENT STATE"),
      info(`Session: ${getCurrentSessionName() || "(none)"}`),
      info(`Skills: ${skills.length}`), info(`Extensions: ${exts.length}`),
      section("SETTINGS"),
      info(`Provider: ${settings.defaultProvider || "(none)"}`),
      info(`Model: ${settings.defaultModel || "(none)"}`),
    ];
    pi.sendMessage({ customType: "workspace-current", content: lines.join("\n"), display: { type: "content", content: "" } });
  }
}