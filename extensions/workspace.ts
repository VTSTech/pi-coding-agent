// extensions/workspace.ts
import { join as join2 } from "path";
import { existsSync as existsSync2, mkdirSync as mkdirSync2, readdirSync, statSync, readFileSync as readFileSync2, writeFileSync as writeFileSync2, unlinkSync } from "fs";
import { homedir } from "os";

// shared/debug.ts
var DEBUG_ENABLED = process?.env?.PI_EXTENSIONS_DEBUG === "1";
function debugLog(module, message, ...args) {
  if (!DEBUG_ENABLED) return;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  console.debug(`[pi-ext:${module}] ${timestamp} ${message}`, ...args);
}

// shared/format.ts
function section(title) {
  return `
\u2500\u2500 ${title} ${"\u2500".repeat(Math.max(1, 60 - title.length - 4))}`;
}
function ok(msg) {
  return `  \u2705 ${msg}`;
}
function warn(msg) {
  return `  \u26A0\uFE0F  ${msg}`;
}
function info(msg) {
  return `  \u2139\uFE0F  ${msg}`;
}

// shared/config-io.ts
import * as fs from "fs";
import * as path from "path";
import os from "os";
var PI_AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
function readJsonConfig(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    debugLog("config-io", `failed to read config: ${filePath}`, err);
  }
  return defaultValue;
}
function writeJsonConfig(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const content = JSON.stringify(data, null, 2) + "\n";
  const tmpPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, content, "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch {
    fs.writeFileSync(filePath, content, "utf-8");
  }
}
var SETTINGS_PATH = path.join(PI_AGENT_DIR, "settings.json");
var SECURITY_PATH = path.join(PI_AGENT_DIR, "security.json");
var REACT_MODE_PATH = path.join(PI_AGENT_DIR, "react-mode.json");
var MODEL_TEST_CONFIG_PATH = path.join(PI_AGENT_DIR, "model-test-config.json");
function readSettings() {
  return readJsonConfig(SETTINGS_PATH);
}
function writeSettings(data) {
  writeJsonConfig(SETTINGS_PATH, data);
}

// extensions/workspace.ts
var EXTENSION_VERSION = "1.3.5";
var WORKSPACE_DIR = join2(homedir(), ".pi", "agent", "workspaces");
var WORKSPACE_EXT = ".ws.json";
function getWorkspacePath(name) {
  return join2(WORKSPACE_DIR, `${name}${WORKSPACE_EXT}`);
}
function listWorkspaces() {
  try {
    if (!existsSync2(WORKSPACE_DIR)) return [];
    return readdirSync(WORKSPACE_DIR).filter((f) => f.endsWith(WORKSPACE_EXT)).map((f) => f.slice(0, -WORKSPACE_EXT.length)).sort();
  } catch (err) {
    debugLog("workspace", "failed to list workspaces", err);
    return [];
  }
}
function loadWorkspace(name) {
  try {
    const path2 = getWorkspacePath(name);
    if (!existsSync2(path2)) return null;
    const data = readFileSync2(path2, "utf-8");
    return JSON.parse(data);
  } catch (err) {
    debugLog("workspace", `failed to load workspace ${name}`, err);
    return null;
  }
}
function saveWorkspaceState(name, state) {
  try {
    if (!existsSync2(WORKSPACE_DIR)) {
      mkdirSync2(WORKSPACE_DIR, { recursive: true });
    }
    const path2 = getWorkspacePath(name);
    writeFileSync2(path2, JSON.stringify(state, null, 2), "utf-8");
    return true;
  } catch (err) {
    debugLog("workspace", `failed to save workspace ${name}`, err);
    return false;
  }
}
function deleteWorkspace(name) {
  try {
    const path2 = getWorkspacePath(name);
    if (!existsSync2(path2)) return false;
    unlinkSync(path2);
    return true;
  } catch (err) {
    debugLog("workspace", `failed to delete workspace ${name}`, err);
    return false;
  }
}
function getCurrentSessionName() {
  try {
    const sessionNameFile = join2(homedir(), ".pi", "agent", "session-name");
    if (existsSync2(sessionNameFile)) {
      return readFileSync2(sessionNameFile, "utf-8").trim() || void 0;
    }
  } catch (err) {
    debugLog("workspace", "failed to read session name", err);
  }
  return void 0;
}
function getCurrentSkills() {
  try {
    const skillsDir = join2(homedir(), ".pi", "agent", "skills");
    if (!existsSync2(skillsDir)) return [];
    const skills = [];
    const entries = readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillJson = join2(skillsDir, entry.name, "SKILL.md");
        if (existsSync2(skillJson)) {
          skills.push(entry.name);
        }
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

  // Check all extension locations from Pi docs
  // 1. ~/.pi/agent/extensions/*.ts or ~/.pi/agent/extensions/*/index.ts
  // 2. Project-local .pi/extensions/*.ts or .pi/extensions/*/index.ts
  // 3. Git packages: ~/.pi/agent/git/**/individual-packages/pi-*/<name>.ts
  const searchPaths = [
    join(homedir(), ".pi", "agent", "extensions"),
    join(homedir(), ".pi", "agent", "git"),
  ];

  for (const basePath of searchPaths) {
    try {
      if (!existsSync(basePath)) continue;

      // Handle git packages specially - walk the tree
      if (basePath.includes(".pi/agent/git")) {
        const gitDirs = readdirSync(basePath);
        for (const gitDir of gitDirs) {
          const gitPath = join(basePath, gitDir, "individual-packages");
          if (!existsSync(gitPath)) continue;

          const pkgDirs = readdirSync(gitPath);
          for (const pkgDir of pkgDirs) {
            // Extract extension name from pi-<name>
            if (pkgDir.startsWith("pi-") && !seen.has(pkgDir)) {
              const extPath = join(gitPath, pkgDir, pkgDir.replace(/^pi-/, "") + ".ts");
              if (existsSync(extPath)) {
                extensions.push(pkgDir);
                seen.add(pkgDir);
              }
            }
          }
        }
      } else {
        // Direct extensions directory - check for .ts or .js files
        const entries = readdirSync(basePath);
        for (const entry of entries) {
          const entryPath = join(basePath, entry);
          const stat = statSync(entryPath);

          if (stat.isDirectory()) {
            // Check for index.ts in subdirectory
            const indexPath = join(entryPath, "index.ts");
            if (existsSync(indexPath) && !seen.has(entry)) {
              extensions.push(entry);
              seen.add(entry);
            }
          } else if ((entry.endsWith(".ts") || entry.endsWith(".js")) && !seen.has(entry)) {
            // Check for .ts or .js files
            const extName = entry.replace(/\.(ts|js)$/, "");
            extensions.push(extName);
            seen.add(entry);
          }
        }
      }
    } catch (err) {
      debugLog("workspace", `failed to check extensions dir ${basePath}`, err);
    }
  }

  return extensions;
}
function getCurrentSoul() {
  try {
    const soulConfigPath = join2(homedir(), ".pi", "agent", "soul-config.json");
    if (existsSync2(soulConfigPath)) {
      const config = JSON.parse(readFileSync2(soulConfigPath, "utf-8"));
      if (config.activeSoul) {
        return {
          name: config.activeSoul.name,
          level: config.activeSoul.level || 2
        };
      }
    }
  } catch (err) {
    debugLog("workspace", "failed to read soul config", err);
  }
  return null;
}
function getCurrentCwd() {
  try {
    return process.cwd();
  } catch {
    return ".";
  }
}
function getWorkspaceStats() {
  try {
    if (!existsSync2(WORKSPACE_DIR)) return { count: 0, totalSize: 0 };
    const files = readdirSync(WORKSPACE_DIR).filter((f) => f.endsWith(WORKSPACE_EXT));
    let totalSize = 0;
    for (const f of files) {
      const stats = statSync(join2(WORKSPACE_DIR, f));
      totalSize += stats.size;
    }
    return { count: files.length, totalSize };
  } catch {
    return { count: 0, totalSize: 0 };
  }
}
var BRANDING = [
  `  \u26A1 Pi Workspace Manager v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`
].join2("\n");
function workspace_default(pi) {
  debugLog("workspace", "Workspace extension loading...");
  pi.registerCommand("workspace", {
    description: "Save, load, and manage workspaces (session state)",
    detailedHelp: "\n\n\u{1F4BE} Workspace Management Extension\n\nArchives and restores workspace state including session name,\nactive skills, configurations, and extension references.\n\n\u{1F4CB} Usage:\n  /workspace                    - Show this help\n  /workspace --help            - Show this help\n  /workspace save <name>       - Save current workspace state\n  /workspace load <name>       - Load a saved workspace\n  /workspace delete <name>     - Delete a saved workspace\n  /workspace list              - List all saved workspaces\n  /workspace current           - Show current workspace state\n\n\u{1F527} Features:\n\u2022 Save session name and restore it later\n\u2022 Track active skills by name\n\u2022 Preserve configuration settings\n\u2022 Extension list verification on restore\n\u2022 Workspace backup and management\n\n\u{1F4A1} Tips:\n\u2022 Extensions are NOT archived, but their names are saved\n\u2022 Run /reload after restore to apply all changes\n\u2022 Workspaces stored in ~/.pi/agent/workspaces/\n\u2022 Use descriptive names like 'project-x-dev' or 'research'\n",
    handler: async (args, ctx) => {
      const parts = args?.split(/\s+/) || [];
      const sub = parts[0]?.toLowerCase() || "";
      const workspaceName = parts.slice(1).join2(" ").trim();
      if (sub === "--help" || sub === "-h") {
        ctx.ui.notify(
          "\u{1F4BE} Workspace Management Extension\n\n\u{1F4CB} Usage:\n  /workspace                    - Show this help\n  /workspace save <name>       - Save current workspace state\n  /workspace load <name>       - Load a saved workspace\n  /workspace delete <name>     - Delete a saved workspace\n  /workspace list              - List all saved workspaces\n  /workspace current           - Show current workspace state\n\n\u{1F527} Features:\n\u2022 Save session name and restore it later\n\u2022 Track active skills by name\n\u2022 Preserve configuration settings\n\u2022 Extension list verification on restore\n\u2022 Workspace backup and management\n\n\u{1F4A1} Tips:\n\u2022 Extensions are NOT archived, but their names are saved\n\u2022 Run /reload after restore to apply all changes\n\u2022 Workspaces stored in ~/.pi/agent/workspaces/\n\u2022 Use descriptive names like 'project-x-dev' or 'research'\n",
          "info"
        );
        return;
      }
      switch (sub) {
        case "":
        case "help":
          ctx.ui.notify(
            "\u{1F4BE} Workspace Management\n\nCommands: save, load, delete, list, current\n\nUse /workspace --help for full usage.",
            "info"
          );
          return;
        case "save":
          if (!workspaceName) {
            ctx.ui.notify("Usage: /workspace save <name>", "error");
            return;
          }
          return handleSave(ctx, workspaceName);
        case "load":
          if (!workspaceName) {
            ctx.ui.notify("Usage: /workspace load <name>", "error");
            return;
          }
          return handleLoad(ctx, workspaceName);
        case "delete":
          if (!workspaceName) {
            ctx.ui.notify("Usage: /workspace delete <name>", "error");
            return;
          }
          return handleDelete(ctx, workspaceName);
        case "list":
          return handleList(ctx);
        case "current":
          return handleCurrent(ctx);
        default:
          ctx.ui.notify(`Unknown sub-command: "${sub}". Use: save, load, delete, list, current`, "error");
      }
    }
  });
  async function handleSave(ctx, name) {
    const workspaceState = {
      name,
      savedAt: (/* @__PURE__ */ new Date()).toISOString(),
      session: {
        sessionName: getCurrentSessionName()
      },
      skills: getCurrentSkills(),
      extensions: getCurrentExtensions(),
      configs: readSettings(),
      soul: getCurrentSoul(),
      cwd: getCurrentCwd(),
      version: "1.0.0"
    };
    const success = saveWorkspaceState(name, workspaceState);
    if (!success) {
      ctx.ui.notify(`Failed to save workspace "${name}"`, "error");
      return;
    }
    const { count, totalSize } = getWorkspaceStats();
    const lines = [BRANDING];
    lines.push(section("WORKSPACE SAVED"));
    lines.push(ok(`Name: ${name}`));
    lines.push(info(`Saved at: ${workspaceState.savedAt}`));
    lines.push(info(`Session name: ${workspaceState.session.sessionName || "(none)"}`));
    lines.push(info(`Skills: ${workspaceState.skills.length}`));
    lines.push(info(`Extensions: ${workspaceState.extensions.length}`));
    if (workspaceState.soul) {
      lines.push(info(`Soul: ${workspaceState.soul.name} (level ${workspaceState.soul.level})`));
    }
    lines.push(info(`Total workspaces: ${count}`));
    pi.sendMessage({
      customType: "workspace-saved",
      content: lines.join2("\n"),
      display: { type: "content", content: lines.join2("\n") }
    });
    ctx.ui.notify(`Workspace "${name}" saved`, "success");
  }
  async function handleLoad(ctx, name) {
    const workspace = loadWorkspace(name);
    if (!workspace) {
      ctx.ui.notify(`Workspace "${name}" not found`, "error");
      return;
    }
    const availableExtensions = getCurrentExtensions();
    const missingExtensions = workspace.extensions.filter((e) => !availableExtensions.includes(e));
    if (missingExtensions.length > 0) {
      const lines2 = [BRANDING];
      lines2.push(section("WORKSPACE LOAD WARNING"));
      lines2.push(warn(`Missing extensions (${missingExtensions.length}):`));
      for (const ext of missingExtensions) {
        lines2.push(info(`  ${ext}`));
      }
      lines2.push(info(""));
      lines2.push(info("These extensions will need to be installed before restoring."));
      pi.sendMessage({
        customType: "workspace-load-warning",
        content: lines2.join2("\n"),
        display: { type: "content", content: lines2.join2("\n") }
      });
    }
    const settings = workspace.configs;
    writeSettings(settings);
    if (workspace.session.sessionName) {
      const sessionNamePath = join2(homedir(), ".pi", "agent", "session-name");
      try {
        writeFileSync2(sessionNamePath, workspace.session.sessionName, "utf-8");
      } catch (err) {
        debugLog("workspace", "failed to restore session name", err);
      }
    }
    if (workspace.soul) {
      const soulConfigPath = join2(homedir(), ".pi", "agent", "soul-config.json");
      try {
        const existing = existsSync2(soulConfigPath) ? JSON.parse(readFileSync2(soulConfigPath, "utf-8")) : { persistence: true, autoLoad: true };
        existing.activeSoul = {
          name: workspace.soul.name,
          level: workspace.soul.level,
          updatedAt: Date.now()
        };
        writeFileSync2(soulConfigPath, JSON.stringify(existing, null, 2), "utf-8");
      } catch (err) {
        debugLog("workspace", "failed to restore soul config", err);
      }
    }
    const lines = [BRANDING];
    lines.push(section("WORKSPACE LOADED"));
    lines.push(ok(`Name: ${workspace.name}`));
    lines.push(info(`Saved at: ${workspace.savedAt}`));
    lines.push(info(`Session name: ${workspace.session.sessionName || "(none)"}`));
    lines.push(info(`Skills: ${workspace.skills.join2(", ") || "(none)"}`));
    if (workspace.soul) {
      lines.push(info(`Soul: ${workspace.soul.name} (level ${workspace.soul.level})`));
    }
    if (missingExtensions.length > 0) {
      lines.push(warn(`Extensions: ${workspace.extensions.length} (${missingExtensions.length} missing)`));
    } else {
      lines.push(info(`Extensions: ${workspace.extensions.join2(", ") || "(none)"}`));
    }
    if (workspace.cwd) {
      lines.push(info(`Working dir: ${workspace.cwd}`));
    }
    lines.push(warn("Run /reload to apply changes in Pi"));
    pi.sendMessage({
      customType: "workspace-loaded",
      content: lines.join2("\n"),
      display: { type: "content", content: lines.join2("\n") }
    });
    ctx.ui.notify(`Workspace "${name}" loaded`, "success");
  }
  async function handleList(ctx) {
    const names = listWorkspaces();
    const lines = [BRANDING];
    lines.push(section("SAVED WORKSPACES"));
    if (names.length === 0) {
      lines.push(info("No workspaces saved. Use /workspace save <name> to create one."));
    } else {
      for (const n of names) {
        const ws = loadWorkspace(n);
        if (ws) {
          const date = new Date(ws.savedAt).toLocaleString();
          lines.push(ok(`  ${n} (saved: ${date})`));
          lines.push(info(`    Session: ${ws.session.sessionName || "(none)"}`));
          lines.push(info(`    Skills: ${ws.skills.length}, Extensions: ${ws.extensions.length}`));
          if (ws.soul) {
            lines.push(info(`    Soul: ${ws.soul.name} (level ${ws.soul.level})`));
          }
          if (ws.cwd) {
            lines.push(info(`    Dir: ${ws.cwd}`));
          }
        }
      }
    }
    pi.sendMessage({
      customType: "workspace-list",
      content: lines.join2("\n"),
      display: { type: "content", content: lines.join2("\n") }
    });
  }
  async function handleDelete(ctx, name) {
    const workspace = loadWorkspace(name);
    if (!workspace) {
      ctx.ui.notify(`Workspace "${name}" not found`, "error");
      return;
    }
    const success = deleteWorkspace(name);
    if (!success) {
      ctx.ui.notify(`Failed to delete workspace "${name}"`, "error");
      return;
    }
    ctx.ui.notify(`Workspace "${name}" deleted`, "success");
  }
  async function handleCurrent(ctx) {
    const currentSkills = getCurrentSkills();
    const currentExtensions = getCurrentExtensions();
    const currentSettings = readSettings();
    const currentSoul = getCurrentSoul();
    const lines = [BRANDING];
    lines.push(section("CURRENT WORKSPACE STATE"));
    lines.push(info(`Session name: ${getCurrentSessionName() || "(none)"}`));
    lines.push(info(`Skills: ${currentSkills.length}`));
    for (const s of currentSkills) {
      lines.push(info(`  ${s}`));
    }
    lines.push(info(`Extensions: ${currentExtensions.length}`));
    for (const e of currentExtensions) {
      lines.push(info(`  ${e}`));
    }
    if (currentSoul) {
      lines.push(info(`Soul: ${currentSoul.name} (level ${currentSoul.level})`));
    }
    lines.push(info(`Current directory: ${getCurrentCwd()}`));
    lines.push(section("SETTINGS"));
    lines.push(info(`Default provider: ${currentSettings.defaultProvider || "(none)"}`));
    lines.push(info(`Default model: ${currentSettings.defaultModel || "(none)"}`));
    lines.push(info(`Theme: ${currentSettings.theme || "(none)"}`));
    lines.push(info(`Thinking level: ${currentSettings.defaultThinkingLevel || "(none)"}`));
    pi.sendMessage({
      customType: "workspace-current",
      content: lines.join2("\n"),
      display: { type: "content", content: lines.join2("\n") }
    });
  }
  pi.registerCompletion?.("workspace", {
    getCompletions: () => {
      return [
        { value: "save", label: "save", description: "Save current workspace state" },
        { value: "load", label: "load", description: "Load a saved workspace" },
        { value: "delete", label: "delete", description: "Delete a saved workspace" },
        { value: "list", label: "list", description: "List all saved workspaces" },
        { value: "current", label: "current", description: "Show current workspace state" }
      ];
    },
    getArgumentCompletions: (args) => {
      const sub = args[0]?.toLowerCase() || "";
      if (["load", "delete"].includes(sub) && args.length === 2) {
        const names = listWorkspaces();
        return names.map((n) => ({ value: n, label: n, description: `Workspace: ${n}` }));
      }
      if (args.length === 2) {
        const names = listWorkspaces();
        return names.map((n) => ({ value: n, label: n, description: `Load workspace: ${n}` }));
      }
      return [];
    }
  });
  debugLog("workspace", "Workspace extension loaded successfully");
}
export {
  workspace_default as default
};