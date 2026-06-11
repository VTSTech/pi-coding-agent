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

// Maximum file size to archive (100KB)
const MAX_FILE_SIZE = 100 * 1024;
// File extensions to skip when archiving
const SKIP_EXTENSIONS = [".log", ".tmp", ".cache", ".lock", ".swp", ".swo"];

// ============================================================================
// Types
// ============================================================================

interface WorkspaceExtension {
  name: string;
  source: "local" | "git" | "package";
  package?: string;
}

interface WorkspaceState {
  name: string;
  savedAt: string;
  session: { sessionName?: string };
  skills: string[];
  extensions: WorkspaceExtension[];
  configs: Record<string, unknown>;
  soul?: { name: string; level: number };
  cwd?: string;
  repo?: string;
  repos?: { path: string; remote: string | null }[];
  content?: WorkspaceContent;
  version: string;
}

interface WorkspaceContent {
  files: { path: string; content: string }[];
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

function getCurrentExtensions(): WorkspaceExtension[] {
  const extensions: WorkspaceExtension[] = [];
  const seen = new Set<string>();

  // Check ~/.pi/agent/extensions (local extensions)
  const localExtDir = join(homedir(), ".pi", "agent", "extensions");
  try {
    if (existsSync(localExtDir)) {
      for (const entry of readdirSync(localExtDir)) {
        if (entry.endsWith(".js") || entry.endsWith(".mjs")) {
          const extName = entry.replace(/\.(js|mjs)$/, "");
          if (!seen.has(extName)) {
            extensions.push({ name: extName, source: "local" });
            seen.add(extName);
          }
        }
      }
    }
  } catch (err) {
    debugLog("workspace", "failed to scan local extensions", err);
  }

  // Check git bundles for extensions/ directory
  // Git structure: ~/.pi/agent/git/<host>/<user>/<repo>/extensions/
  const gitBase = join(homedir(), ".pi", "agent", "git");
  try {
    if (existsSync(gitBase)) {
      // Walk the full tree structure
      const hostEntries = readdirSync(gitBase, { withFileTypes: true });
      for (const hostEntry of hostEntries) {
        if (!hostEntry.isDirectory()) continue;
        const hostDir = join(gitBase, hostEntry.name);

        const userEntries = readdirSync(hostDir, { withFileTypes: true });
        for (const userEntry of userEntries) {
          if (!userEntry.isDirectory()) continue;
          const userDir = join(hostDir, userEntry.name);

          const repoEntries = readdirSync(userDir, { withFileTypes: true });
          for (const repoEntry of repoEntries) {
            if (!repoEntry.isDirectory()) continue;
            const extPath = join(userDir, repoEntry.name, "extensions");
            if (!existsSync(extPath)) continue;

            const repoUrl = `${hostEntry.name}/${userEntry.name}/${repoEntry.name}`;

            const extFiles = readdirSync(extPath);
            for (const entry of extFiles) {
              if (entry.endsWith(".ts") || entry.endsWith(".js")) {
                const extName = entry.replace(/\.(ts|js)$/, "");
                if (!seen.has(extName)) {
                  extensions.push({
                    name: extName,
                    source: "git",
                    package: repoUrl
                  });
                  seen.add(extName);
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    debugLog("workspace", "failed to scan git extensions", err);
  }

  // Check git packages for extensions in package.json
  try {
    const packages = readSettings().packages || [];
    for (const pkg of packages) {
      // Handle git:github.com/VTSTech/pi-coding-agent format
      const gitMatch = pkg.match(/^git:(.+)$/);
      if (gitMatch) {
        const repoPath = gitMatch[1]; // e.g., github.com/VTSTech/pi-coding-agent
        const [hostUserRepo] = repoPath.split("/"); // Could be more complex

        // Try to get extensions from the git repo
        const gitExtPath = join(homedir(), ".pi", "agent", "git", repoPath, "extensions");
        if (existsSync(gitExtPath)) {
          const extFiles = readdirSync(gitExtPath);
          for (const entry of extFiles) {
            if (entry.endsWith(".ts") || entry.endsWith(".js")) {
              const extName = entry.replace(/\.(ts|js)$/, "");
              if (!seen.has(extName)) {
                extensions.push({
                  name: extName,
                  source: "package",
                  package: repoPath
                });
                seen.add(extName);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    debugLog("workspace", "failed to scan package extensions", err);
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
// Git & Content Helpers
// ============================================================================

/**
 * Check if a directory is a git repository
 */
function isGitRepo(dir: string): boolean {
  try {
    return existsSync(join(dir, ".git"));
  } catch { return false; }
}

/**
 * Get the git remote URL for a directory, if it's a repo
 */
function getGitRemoteUrl(dir: string): string | null {
  try {
    const result = require("child_process").execSync(
      `git -C "${dir}" remote get-url origin 2>/dev/null`,
      { encoding: "utf-8" }
    ).trim();
    return result || null;
  } catch { return null; }
}

/**
 * Find git repositories within a directory (up to 2 levels deep)
 * Skip !dirs (reference folders) but still scan .dirs for repos
 */
function findGitRepos(baseDir: string): { path: string; remote: string | null }[] {
  const repos: { path: string; remote: string | null }[] = [];

  function scanDir(dir: string, depth: number) {
    if (depth > 2) return;

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip .git directories and !dirs (reference folders)
        if (entry.name === ".git" || entry.name.startsWith("!")) continue;
        if (!entry.isDirectory()) continue;

        const fullPath = join(dir, entry.name);
        if (isGitRepo(fullPath)) {
          repos.push({ path: fullPath, remote: getGitRemoteUrl(fullPath) });
        }
        scanDir(fullPath, depth + 1);
      }
    } catch (err) {
      debugLog("workspace", "failed to scan dir for repos", err);
    }
  }

  scanDir(baseDir, 0);
  return repos;
}

/**
 * Get workspace directory, skipping !dirs (reference folders)
 * .dirs ARE scanned for content as skills/extensions may live there
 */
function getWorkspaceContent(dir: string): WorkspaceContent {
  const files: { path: string; content: string }[] = [];

  function scanForFiles(currentDir: string, basePath: string) {
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        // Skip .git directories and !dirs (reference folders)
        if (entry.name === ".git" || entry.name.startsWith("!")) continue;

        const fullPath = join(currentDir, entry.name);
        const relativePath = join(basePath, entry.name);

        if (entry.isDirectory()) {
          // Don't skip .dirs - they may contain skills/extensions
          scanForFiles(fullPath, relativePath);
        } else if (entry.isFile()) {
          const ext = "." + entry.name.split(".").pop();
          // Skip certain extensions and large files
          if (SKIP_EXTENSIONS.includes(ext) || entry.name.endsWith(".png") || entry.name.endsWith(".jpg") || entry.name.endsWith(".gif")) continue;

          try {
            const stats = require("fs").statSync(fullPath);
            if (stats.size > MAX_FILE_SIZE) continue;

            const content = readFileSync(fullPath, "utf-8");
            // Skip binary content (but allow .ts/.js even if they have nulls)
            if (content.includes("\x00") && ext !== ".ts" && ext !== ".js") continue;

            files.push({ path: relativePath, content });
          } catch (err) {
            debugLog("workspace", `failed to read file ${fullPath}`, err);
          }
        }
      }
    } catch (err) {
      debugLog("workspace", "failed to scan workspace content", err);
    }
  }

  scanForFiles(dir, "");
  return { files };
}

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
    const cwd = process.cwd();
    const repos = findGitRepos(cwd);
    const isCurrentDirRepo = isGitRepo(cwd);

    const state: WorkspaceState = {
      name, savedAt: new Date().toISOString(),
      session: { sessionName: undefined },
      skills: getCurrentSkills(),
      extensions: getCurrentExtensions(),
      configs: readSettings(),
      soul: getCurrentSoul(),
      cwd,
      version: "1.0.0",
    };

    // If current directory is a git repo, save its URL
    if (isCurrentDirRepo) {
      state.repo = getGitRemoteUrl(cwd);
    }

    // If git repos are found within the workspace, save their info
    if (repos.length > 0) {
      state.repos = repos;
    }

    // Only archive content if there are no repos (git repos can be cloned)
    if (!isCurrentDirRepo && repos.length === 0) {
      state.content = getWorkspaceContent(cwd);
    }

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
    const cwd = process.cwd();
    const repos = findGitRepos(cwd);
    const isCurrentRepo = isGitRepo(cwd);

    let output = `${BRANDING}\n\n`;
    output += `Extensions: ${exts.length}\n`;
    for (const ext of exts) {
      const sourceInfo = ext.source === "local" ? "(local)" : ext.package ? `(${ext.package})` : "";
      output += `  - ${ext.name} ${sourceInfo}\n`;
    }
    output += `\nSkills: ${skills.length}\n`;
    for (const skill of skills) {
      output += `  - ${skill}\n`;
    }
    output += `\nRepos found: ${repos.length}\n`;
    for (const repo of repos) {
      output += `  - ${repo.path} ${repo.remote ? `(${repo.remote})` : ""}\n`;
    }
    if (isCurrentRepo) {
      output += `  - (current dir) ${getGitRemoteUrl(cwd)}\n`;
    }

    pi.sendMessage({
      customType: "workspace-current",
      content: output,
      display: { type: "content", content: output },
    });
  }
}