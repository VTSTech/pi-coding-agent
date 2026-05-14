import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import { debugLog } from "../shared/debug";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// SoulSpec types ported to TypeScript
export enum Environment {
  VIRTUAL = "virtual",
  EMBODIED = "embodied",
  HYBRID = "hybrid"
}

export enum InteractionMode {
  TEXT = "text",
  VOICE = "voice",
  MULTIMODAL = "multimodal",
  GESTURE = "gesture"
}

export enum ContactPolicy {
  NO_CONTACT = "no-contact",
  GENTLE_CONTACT = "gentle-contact",
  FULL_CONTACT = "full-contact"
}

export enum Mobility {
  STATIONARY = "stationary",
  MOBILE = "mobile",
  LIMITED = "limited"
}

export interface Author {
  name: string;
  github?: string;
  email?: string;
}

export interface RecommendedSkill {
  name: string;
  version?: string;
  required: boolean;
}

export interface Compatibility {
  openclaw?: string;
  models: string[];
  frameworks: string[];
  min_token_context?: number;
}

export interface SoulFiles {
  soul: string;
  identity?: string;
  agents?: string;
  heartbeat?: string;
  style?: string;
  user_template?: string;
  avatar?: string;
}

export interface SoulExamples {
  good?: string;
  bad?: string;
}

export interface Disclosure {
  summary?: string;
}

export interface HardwareConstraints {
  has_display: boolean;
  has_speaker: boolean;
  has_microphone: boolean;
  has_camera: boolean;
  mobility: Mobility;
  manipulator: boolean;
}

export interface PhysicalSafety {
  contact_policy: ContactPolicy;
  emergency_protocol: string;
  operating_zone: string;
  max_speed?: string;
}

export interface Safety {
  physical?: PhysicalSafety;
}

export interface Sensor {
  name: string;
  type?: string;
  range?: string;
  fov?: number;
  resolution?: string;
  fps?: number;
  channels?: number;
}

export interface Actuator {
  name: string;
  type?: string;
  max_speed?: string;
  payload?: string;
  reach?: string;
  force?: string;
  dof?: number;
  resolution?: string;
}

export interface SoulManifest {
  spec_version: string;
  name: string;
  display_name: string;
  version: string;
  description: string;
  author: Author;
  license: string;
  tags: string[];
  category: string;
  compatibility: Compatibility;
  allowed_tools: string[];
  recommended_skills: RecommendedSkill[];
  files: SoulFiles;
  examples?: SoulExamples;
  disclosure?: Disclosure;
  deprecated: boolean;
  superseded_by?: string;
  repository?: string;
  environment: Environment;
  interaction_mode: InteractionMode;
  hardware_constraints?: HardwareConstraints;
  safety?: Safety;
  sensors: Sensor[];
  actuators: Actuator[];
  soul_content?: string;
  identity_content?: string;
  agents_content?: string;
  style_content?: string;
  heartbeat_content?: string;
  user_template_content?: string;
  examples_good_content?: string;
  examples_bad_content?: string;
  avatar_path?: string;
}

/**
 * Expand a leading `~` segment to the current user's home directory.
 *
 * Neither `fs.existsSync` nor `path.resolve` perform tilde expansion — that is
 * a shell convenience, not a Node.js one. Without this helper, any path
 * starting with `~` (such as the default `soulsDirs` entries) is treated as a
 * literal directory named `~` and never resolves to a real location.
 *
 * Only the standalone `~` and `~/` (or `~\`) prefixes are expanded; `~user`
 * forms are passed through unchanged so they fail the way the user expects
 * rather than being silently rewritten.
 */
export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

// Active soul persistence across sessions
const ACTIVE_SOUL_PATH = path.join(os.homedir(), '.pi', 'agent', '.active-soul.json');

function saveActiveSoul(soulName: string, level: number): void {
  try {
    const dir = path.dirname(ACTIVE_SOUL_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(ACTIVE_SOUL_PATH, JSON.stringify({
      soul: soulName,
      level: level || 2,
      updatedAt: Date.now()
    }, null, 2), 'utf-8');
    debugLog("soul", `Saved active soul: ${soulName}`);
  } catch (err) {
    debugLog("soul", `Failed to save active soul: ${err}`);
  }
}

function loadActiveSoul(): { soul: string; level: number } | null {
  try {
    if (fs.existsSync(ACTIVE_SOUL_PATH)) {
      const data = JSON.parse(fs.readFileSync(ACTIVE_SOUL_PATH, 'utf-8'));
      if (data && data.soul) {
        return { soul: data.soul, level: data.level || 2 };
      }
    }
  } catch (err) {
    debugLog("soul", `Failed to load active soul: ${err}`);
  }
  return null;
}

function clearActiveSoul(): void {
  try {
    if (fs.existsSync(ACTIVE_SOUL_PATH)) {
      fs.unlinkSync(ACTIVE_SOUL_PATH);
      debugLog("soul", "Cleared active soul");
    }
  } catch (err) {
    debugLog("soul", `Failed to clear active soul: ${err}`);
  }
}

// SoulSpec loader class
export class SoulSpecLoader {
  private cache: Map<string, SoulManifest> = new Map();
  private soulsDirs: string[];

  constructor() {
    // Initialize with default paths that will be checked
    this.soulsDirs = [
      "~/.pi/agent/souls",            // Global Pi souls directory
      "~/.openclaw/souls/clawsouls",  // ClawSouls CLI registry (e.g. `clawsouls install`)
      ".pi/souls",                    // Project-local souls directory
      "./souls",                      // Current directory souls
    ];
  }

  private resolveSoulPath(soulPath: string): string | null {
    // First try exact matching (for backward compatibility)
    const exactPath = this.findExactSoulPath(soulPath);
    if (exactPath) {
      return exactPath;
    }

    // Try regex-based partial matching
    const partialPath = this.findPartialSoulPath(soulPath);
    if (partialPath) {
      return partialPath;
    }

    return null;
  }

  private findExactSoulPath(soulPath: string): string | null {
    // Try multiple locations for soul packages
    const locations = [
      soulPath, // Absolute or relative path
      ...this.soulsDirs.map(dir => `${dir}/${soulPath}`), // All configured souls directories
    ];

    for (const location of locations) {
      try {
        const expanded = expandHome(location);
        if (fs.existsSync(expanded)) {
          return expanded;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  private findPartialSoulPath(soulPath: string): string | null {
    // Check if soulPath looks like a regex pattern
    const regexPattern = soulPath.match(/^\/([^\/]*)\/([a-z]*)$/i);
    let regex: RegExp;
    
    if (regexPattern) {
      // It's a regex pattern like /pattern/flags
      try {
        regex = new RegExp(regexPattern[1], regexPattern[2]);
      } catch (e) {
        debugLog("soul", `Invalid regex pattern: ${soulPath}`);
        return null;
      }
    } else {
      // Treat as partial string match (case-insensitive)
      regex = new RegExp(soulPath, 'i');
    }

    // Find all matching souls
    const matches = this.findMatchingSouls(regex);
    
    if (matches.length === 1) {
      // Single match - return it
      return this.findExactSoulPath(matches[0]);
    } else if (matches.length > 1) {
      debugLog("soul", `Multiple matches found for "${soulPath}": ${matches.join(', ')}`);
      // For multiple matches, we don't auto-resolve to avoid ambiguity
      return null;
    }

    return null;
  }

  async load(soulPath: string, level: number = 2): Promise<SoulManifest> {
    const resolvedPath = this.resolveSoulPath(soulPath);
    if (!resolvedPath) {
      throw new Error(`Soul not found: ${soulPath}`);
    }

    const cacheKey = `${resolvedPath}:${level}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const soulDir = fs.statSync(resolvedPath).isFile() 
      ? path.dirname(resolvedPath)
      : resolvedPath;

    const manifestPath = path.join(soulDir, 'soul.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`No soul.json found at: ${manifestPath}`);
    }

    // Parse manifest
    const manifestData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const manifest = this.parseManifest(manifestData, soulDir);

    // Load content based on level
    if (level >= 2) {
      await this.loadLevel2(manifest, soulDir);
    }
    if (level >= 3) {
      await this.loadLevel3(manifest, soulDir);
    }

    this.cache.set(cacheKey, manifest);
    return manifest;
  }

  private parseManifest(data: any, soulDir: string): SoulManifest {
    debugLog("soul", `Parsing soul manifest: ${data.name}`);

    // Parse author
    const author: Author = {
      name: data.author?.name || "Unknown",
      github: data.author?.github,
      email: data.author?.email,
    };

    // Parse compatibility
    const compatibility: Compatibility = {
      openclaw: data.compatibility?.openclaw,
      models: data.compatibility?.models || [],
      frameworks: data.compatibility?.frameworks || [],
      min_token_context: data.compatibility?.minTokenContext,
    };

    // Parse recommended skills
    const recommendedSkills: RecommendedSkill[] = [];
    const skillsData = data.recommendedSkills || data.skills || [];
    for (const skill of skillsData) {
      if (typeof skill === 'string') {
        recommendedSkills.push({ name: skill, required: false });
      } else {
        recommendedSkills.push({
          name: skill.name,
          version: skill.version,
          required: skill.required || false,
        });
      }
    }

    // Parse files
    const files: SoulFiles = {
      soul: data.files?.soul || "SOUL.md",
      identity: data.files?.identity,
      agents: data.files?.agents,
      heartbeat: data.files?.heartbeat,
      style: data.files?.style,
      user_template: data.files?.userTemplate,
      avatar: data.files?.avatar,
    };

    // Parse examples
    const examples: SoulExamples | undefined = data.examples ? {
      good: data.examples.good,
      bad: data.examples.bad,
    } : undefined;

    // Parse disclosure
    const disclosure: Disclosure | undefined = data.disclosure ? {
      summary: data.disclosure.summary,
    } : undefined;

    // Parse hardware constraints
    const hardwareConstraints: HardwareConstraints | undefined = data.hardwareConstraints ? {
      has_display: data.hardwareConstraints.hasDisplay || false,
      has_speaker: data.hardwareConstraints.hasSpeaker || false,
      has_microphone: data.hardwareConstraints.hasMicrophone || false,
      has_camera: data.hardwareConstraints.hasCamera || false,
      mobility: Mobility[data.hardwareConstraints.mobility] || Mobility.STATIONARY,
      manipulator: data.hardwareConstraints.manipulator || false,
    } : undefined;

    // Parse safety
    const safety: Safety | undefined = data.safety ? {
      physical: data.safety.physical ? {
        contact_policy: ContactPolicy[data.safety.physical.contactPolicy] || ContactPolicy.NO_CONTACT,
        emergency_protocol: data.safety.physical.emergencyProtocol || "stop",
        operating_zone: data.safety.physical.operatingZone || "indoor",
        max_speed: data.safety.physical.maxSpeed,
      } : undefined,
    } : undefined;

    // Parse sensors
    const sensors: Sensor[] = [];
    for (const [name, sensorData] of Object.entries(data.sensors || {})) {
      sensors.push({
        name,
        type: typeof sensorData === 'object' ? sensorData.type : undefined,
        range: typeof sensorData === 'object' ? sensorData.range : undefined,
        fov: typeof sensorData === 'object' ? sensorData.fov : undefined,
        resolution: typeof sensorData === 'object' ? sensorData.resolution : undefined,
        fps: typeof sensorData === 'object' ? sensorData.fps : undefined,
        channels: typeof sensorData === 'object' ? sensorData.channels : undefined,
      });
    }

    // Parse actuators
    const actuators: Actuator[] = [];
    for (const [name, actData] of Object.entries(data.actuators || {})) {
      actuators.push({
        name,
        type: actData.type,
        max_speed: actData.maxSpeed,
        payload: actData.payload,
        reach: actData.reach,
        force: actData.force,
        dof: actData.dof,
        resolution: actData.resolution,
      });
    }

    return {
      spec_version: data.specVersion || "0.5",
      name: data.name || "unknown",
      display_name: data.displayName || "Unknown",
      version: data.version || "1.0.0",
      description: data.description || "",
      author,
      license: data.license || "MIT",
      tags: data.tags || [],
      category: data.category || "general",
      compatibility,
      allowed_tools: data.allowedTools || [],
      recommended_skills: recommendedSkills,
      files,
      examples,
      disclosure,
      deprecated: data.deprecated || false,
      superseded_by: data.supersededBy,
      repository: data.repository,
      environment: Environment[data.environment] || Environment.VIRTUAL,
      interaction_mode: InteractionMode[data.interactionMode] || InteractionMode.TEXT,
      hardware_constraints: hardwareConstraints,
      safety,
      sensors,
      actuators,
    };
  }

  private async loadLevel2(manifest: SoulManifest, soulDir: string): Promise<void> {
    // Load SOUL.md
    const soulPath = path.join(soulDir, manifest.files.soul);
    if (fs.existsSync(soulPath)) {
      manifest.soul_content = fs.readFileSync(soulPath, 'utf-8');
    }

    // Load IDENTITY.md
    if (manifest.files.identity) {
      const identityPath = path.join(soulDir, manifest.files.identity);
      if (fs.existsSync(identityPath)) {
        manifest.identity_content = fs.readFileSync(identityPath, 'utf-8');
      }
    }
  }

  private async loadLevel3(manifest: SoulManifest, soulDir: string): Promise<void> {
    // Load AGENTS.md
    if (manifest.files.agents) {
      const agentsPath = path.join(soulDir, manifest.files.agents);
      if (fs.existsSync(agentsPath)) {
        manifest.agents_content = fs.readFileSync(agentsPath, 'utf-8');
      }
    }

    // Load STYLE.md
    if (manifest.files.style) {
      const stylePath = path.join(soulDir, manifest.files.style);
      if (fs.existsSync(stylePath)) {
        manifest.style_content = fs.readFileSync(stylePath, 'utf-8');
      }
    }

    // Load HEARTBEAT.md
    if (manifest.files.heartbeat) {
      const heartbeatPath = path.join(soulDir, manifest.files.heartbeat);
      if (fs.existsSync(heartbeatPath)) {
        manifest.heartbeat_content = fs.readFileSync(heartbeatPath, 'utf-8');
      }
    }

    // Load USER_TEMPLATE.md
    if (manifest.files.user_template) {
      const templatePath = path.join(soulDir, manifest.files.user_template);
      if (fs.existsSync(templatePath)) {
        manifest.user_template_content = fs.readFileSync(templatePath, 'utf-8');
      }
    }

    // Load calibration examples
    if (manifest.examples) {
      if (manifest.examples.good) {
        const goodPath = path.join(soulDir, manifest.examples.good);
        if (fs.existsSync(goodPath)) {
          manifest.examples_good_content = fs.readFileSync(goodPath, 'utf-8');
        }
      }
      if (manifest.examples.bad) {
        const badPath = path.join(soulDir, manifest.examples.bad);
        if (fs.existsSync(badPath)) {
          manifest.examples_bad_content = fs.readFileSync(badPath, 'utf-8');
        }
      }
    }

    // Resolve avatar path
    if (manifest.files.avatar) {
      const avatarPath = path.join(soulDir, manifest.files.avatar);
      if (fs.existsSync(avatarPath)) {
        manifest.avatar_path = avatarPath;
      }
    }
  }

  buildSystemPrompt(manifest: SoulManifest, level: number = 2, includeIdentity: boolean = true): string {
    const parts: string[] = [];

    // Level 1: Basic info
    parts.push(`# ${manifest.display_name}`);
    parts.push(`\n${manifest.description}`);

    if (manifest.disclosure?.summary) {
      parts.push(`\n${manifest.disclosure.summary}`);
    }

    // Level 2: Core persona
    if (level >= 2) {
      if (manifest.soul_content) {
        parts.push(`\n\n## Persona\n\n${manifest.soul_content}`);
      }

      if (includeIdentity && manifest.identity_content) {
        parts.push(`\n\n## Identity\n\n${manifest.identity_content}`);
      }
    }

    // Level 3: Extended behavior
    if (level >= 3) {
      if (manifest.style_content) {
        parts.push(`\n\n## Style Guidelines\n\n${manifest.style_content}`);
      }

      if (manifest.agents_content) {
        parts.push(`\n\n## Agent Behavior\n\n${manifest.agents_content}`);
      }

      if (manifest.heartbeat_content) {
        parts.push(`\n\n## Heartbeat\n\n${manifest.heartbeat_content}`);
      }

      if (manifest.user_template_content) {
        parts.push(`\n\n## User Message Template\n\n${manifest.user_template_content}`);
      }

      if (manifest.examples_good_content || manifest.examples_bad_content) {
        parts.push("\n\n## Calibration Examples");
        if (manifest.examples_good_content) {
          parts.push(`\n\n### Good Outputs\n\n${manifest.examples_good_content}`);
        }
        if (manifest.examples_bad_content) {
          parts.push(`\n\n### Outputs to Avoid\n\n${manifest.examples_bad_content}`);
        }
      }
    }

    // Add constraints for embodied agents
    if (manifest.environment !== Environment.VIRTUAL) {
      parts.push(`\n\n## Environment`);
      parts.push(`\nYou are an **${manifest.environment}** agent.`);

      if (manifest.interaction_mode !== InteractionMode.TEXT) {
        parts.push(`\nPrimary interaction mode: ${manifest.interaction_mode}`);
      }

      if (manifest.hardware_constraints) {
        const hc = manifest.hardware_constraints;
        const capabilities: string[] = [];
        if (hc.has_display) capabilities.push("display");
        if (hc.has_speaker) capabilities.push("speaker");
        if (hc.has_microphone) capabilities.push("microphone");
        if (hc.has_camera) capabilities.push("camera");
        if (capabilities.length > 0) {
          parts.push(`\nHardware: ${capabilities.join(', ')}`);
        }
      }

      if (manifest.safety?.physical) {
        const ps = manifest.safety.physical;
        parts.push(`\nSafety: ${ps.contact_policy} contact policy`);
      }
    }

    return parts.join('');
  }

  getAllSouls(): string[] {
    const souls: string[] = [];
    const seenSouls = new Set<string>();
    
    // Check all souls directories
    for (const soulsDir of this.soulsDirs) {
      // Expand `~` before resolving against cwd — `path.resolve` does not
      // handle tildes and would otherwise produce `<cwd>/~/.pi/agent/souls`.
      const resolvedDir = path.resolve(expandHome(soulsDir));
      
      try {
        if (fs.existsSync(resolvedDir)) {
          const entries = fs.readdirSync(resolvedDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !seenSouls.has(entry.name)) {
              const soulJsonPath = path.join(resolvedDir, entry.name, 'soul.json');
              if (fs.existsSync(soulJsonPath)) {
                souls.push(entry.name);
                seenSouls.add(entry.name);
              }
            }
          }
        }
      } catch (error) {
        debugLog("soul", `Error reading souls directory ${resolvedDir}: ${error}`);
      }
    }

    return souls;
  }

  findMatchingSouls(pattern: RegExp): string[] {
    const allSouls = this.getAllSouls();
    return allSouls.filter(soul => pattern.test(soul));
  }
}

// Global loader instance
let soulLoader: SoulSpecLoader;

export default function (pi: ExtensionAPI) {
  debugLog("soul", "SoulSpec extension loading...");

  // Initialize loader
  soulLoader = new SoulSpecLoader();
  let autoAppliedSoul: { name: string; displayName: string; prompt: string; level: number } | null = null;

  // Register soul loader tool
  pi.registerTool({
    name: "load_soul",
    label: "Load Soul",
    description: "Load a SoulSpec persona and build system prompt. Supports partial matching.",
    parameters: Type.Object({
      soul_name: Type.String({ 
        description: "Name of the soul to load (directory name or path). Supports partial matching: 'dev' matches 'developer'" 
      }),
      level: Type.Optional(Type.Number({ 
        description: "Progressive disclosure level (1-3, default 2)",
        default: 2 
      })),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      debugLog("soul", `Loading soul: ${params.soul_name}, level: ${params.level || 2}`);
      
      try {
        const soul = await soulLoader.load(params.soul_name, params.level || 2);
        const systemPrompt = soulLoader.buildSystemPrompt(soul, params.level || 2);
        
        return {
          content: [{ 
            type: "text", 
            text: `Soul "${soul.display_name}" loaded successfully.\n\nSystem Prompt:\n${systemPrompt}` 
          }],
          details: { 
            soul: soul.name,
            prompt: systemPrompt,
            level: params.level || 2
          }
        };
      } catch (error) {
        // Check if it's a "not found" error and provide helpful suggestions
        if (error.message && error.message.includes("Soul not found")) {
          const matches = soulLoader.findMatchingSouls(new RegExp(params.soul_name, 'i'));
          
          if (matches.length > 0) {
            const matchList = matches.slice(0, 5).join(', ');
            const suggestion = matches.length > 5 ? ` (showing first 5 of ${matches.length})` : '';
            
            return {
              content: [{ 
                type: "text", 
                text: `No exact match found for "${params.soul_name}". Did you mean one of these?\n\n${matchList}${suggestion}\n\nTry one of these exact names, or use a more specific pattern.` 
              }],
              isError: true
            };
          } else {
            const allSouls = soulLoader.getAllSouls();
            if (allSouls.length > 0) {
              const soulList = allSouls.slice(0, 10).join(', ');
              const remaining = allSouls.length > 10 ? ` (and ${allSouls.length - 10} more)` : '';
              
              return {
                content: [{ 
                  type: "text", 
                  text: `No soul found matching "${params.soul_name}".\n\nAvailable souls:\n\n${soulList}${remaining}\n\nUse /souls to see all available souls, or try a partial match like 'dev' or 'assist'.` 
                }],
                isError: true
              };
            }
          }
        }
        
        debugLog("soul", `Error loading soul: ${error}`);
        return {
          content: [{ type: "text", text: `Error loading soul: ${error}` }],
          isError: true
        };
      }
    },
  });

  // Register list souls tool
  pi.registerTool({
    name: "list_souls",
    label: "List Souls",
    description: "List all available SoulSpec personas",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const souls = soulLoader.getAllSouls();
      
      if (souls.length === 0) {
        return {
          content: [{ type: "text", text: "No souls found. Create a souls/ directory with soul.json files." }],
        };
      }

      let response = "Available souls:\n\n";
      for (const soul of souls) {
        try {
          const manifest = await soulLoader.load(soul, 1); // Level 1 for quick info
          response += `- **${manifest.display_name}** (${soul})\n`;
          response += `  ${manifest.description}\n`;
          if (manifest.disclosure?.summary) {
            response += `  ${manifest.disclosure.summary}\n`;
          }
          response += `\n`;
        } catch (error) {
          response += `- **${soul}** (Error loading: ${error})\n\n`;
        }
      }

      return {
        content: [{ type: "text", text: response }],
        details: { souls }
      };
    },
  });

  // Register soul info tool
  pi.registerTool({
    name: "soul_info",
    label: "Soul Info",
    description: "Get detailed information about a soul. Supports partial matching.",
    parameters: Type.Object({
      soul_name: Type.String({ 
        description: "Name of the soul to get info for. Supports partial matching: 'dev' matches 'developer'" 
      }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      debugLog("soul", `Getting soul info for: ${params.soul_name}`);
      
      try {
        const soul = await soulLoader.load(params.soul_name, 1); // Level 1 for metadata
        
        let info = `# ${soul.display_name}\n\n`;
        info += `**Name:** ${soul.name}\n`;
        info += `**Version:** ${soul.version}\n`;
        info += `**Description:** ${soul.description}\n`;
        info += `**Author:** ${soul.author.name}\n`;
        info += `**License:** ${soul.license}\n`;
        info += `**Environment:** ${soul.environment}\n`;
        info += `**Category:** ${soul.category}\n`;
        info += `**Tags:** ${soul.tags.join(', ')}\n`;
        
        if (soul.disclosure?.summary) {
          info += `**Summary:** ${soul.disclosure.summary}\n`;
        }
        
        if (soul.recommended_skills.length > 0) {
          info += `\n**Recommended Skills:**\n`;
          for (const skill of soul.recommended_skills) {
            info += `- ${skill.name}${skill.required ? ' (required)' : ''}\n`;
          }
        }

        if (soul.hardware_constraints) {
          info += `\n**Hardware Constraints:**\n`;
          const hc = soul.hardware_constraints;
          info += `- Display: ${hc.has_display ? 'Yes' : 'No'}\n`;
          info += `- Speaker: ${hc.has_speaker ? 'Yes' : 'No'}\n`;
          info += `- Microphone: ${hc.has_microphone ? 'Yes' : 'No'}\n`;
          info += `- Camera: ${hc.has_camera ? 'Yes' : 'No'}\n`;
          info += `- Mobility: ${hc.mobility}\n`;
          info += `- Manipulator: ${hc.manipulator ? 'Yes' : 'No'}\n`;
        }

        return {
          content: [{ type: "text", text: info }],
          details: { soul }
        };
      } catch (error) {
        // Check if it's a "not found" error and provide helpful suggestions
        if (error.message && error.message.includes("Soul not found")) {
          const matches = soulLoader.findMatchingSouls(new RegExp(params.soul_name, 'i'));
          
          if (matches.length > 0) {
            const matchList = matches.slice(0, 5).join(', ');
            const suggestion = matches.length > 5 ? ` (showing first 5 of ${matches.length})` : '';
            
            return {
              content: [{ 
                type: "text", 
                text: `No exact match found for "${params.soul_name}". Did you mean one of these?\n\n${matchList}${suggestion}\n\nTry one of these exact names, or use a more specific pattern.` 
              }],
              isError: true
            };
          }
        }
        
        debugLog("soul", `Error loading soul info: ${error}`);
        return {
          content: [{ type: "text", text: `Error loading soul info: ${error}` }],
          isError: true
        };
      }
    },
  });

  // Event handlers
  pi.on("session_start", async (event, ctx) => {
    debugLog("soul", `SoulSpec extension session started: ${event.reason}`);

    // On fresh sessions, check for persisted active soul
    if (event.reason === "startup" || event.reason === "new") {
      const active = loadActiveSoul();
      if (active) {
        debugLog("soul", `Found active soul from previous session: ${active.soul}`);
        try {
          const manifest = await soulLoader.load(active.soul, active.level || 2);
          autoAppliedSoul = {
            name: manifest.name,
            displayName: manifest.display_name,
            prompt: soulLoader.buildSystemPrompt(manifest, active.level || 2),
            level: active.level || 2
          };
          debugLog("soul", `Preloaded soul for auto-apply: ${manifest.display_name}`);
          if (ctx.hasUI) {
            ctx.ui.notify(`🪷 Soul auto-loaded: ${manifest.display_name}`, "info");
          }
        } catch (err) {
          debugLog("soul", `Failed to preload active soul: ${err}`);
          autoAppliedSoul = null;
          if (ctx.hasUI) {
            ctx.ui.notify(`⚠️ Active soul "${active.soul}" not found. Use /soul <name> to set one.`, "warning");
          }
        }
      } else {
        const souls = soulLoader.getAllSouls();
        if (souls.length > 0) {
          debugLog("soul", `Found ${souls.length} available souls`);
          if (event.reason === "startup" && ctx.hasUI) {
            ctx.ui.notify(`🪷 Souls available (${souls.length}). Use /soul <name> to activate one.`, "info");
          }
        }
      }
    }
  });

  pi.on("resources_discover", async (event, ctx) => {
    debugLog("soul", "SoulSpec extension discovering resources");
    return {
      skillPaths: [], // Souls are not skills
      promptPaths: [".pi/souls", "./souls", "~/.pi/agent/souls", "~/.openclaw/souls/clawsouls"], // Add souls directories to prompt discovery
      themePaths: [],
    };
  });

  // Auto-apply persisted soul into system prompt before agent processes user input
  pi.on("before_agent_start", async (event) => {
    if (autoAppliedSoul) {
      debugLog("soul", `Auto-applying soul to system prompt: ${autoAppliedSoul.displayName}`);
      // Inject soul content into the system prompt. The system prompt is rebuilt fresh
      // each user prompt cycle, so we apply every time, not just once.
      const enhancedPrompt = event.systemPrompt + "\n\n---\n" + autoAppliedSoul.prompt;
      return { systemPrompt: enhancedPrompt };
    }
  });

  // Add command to list souls
  pi.registerCommand("souls", {
    description: "List available souls",
    handler: async (args, ctx) => {
      debugLog("soul", "Listing souls command");
      
      const souls = soulLoader.getAllSouls();
      
      if (souls.length === 0) {
        ctx.ui.notify("No souls found. Create a souls/ directory with soul.json files.", "info");
        return;
      }

      let message = "Available souls:\n\n";
      for (const soul of souls) {
        try {
          const manifest = await soulLoader.load(soul, 1);
          message += `• **${manifest.display_name}** (${soul})\n`;
          message += `  ${manifest.description}\n`;
          if (manifest.disclosure?.summary) {
            message += `  ${manifest.disclosure.summary}\n`;
          }
          message += "\n";
        } catch (error) {
          message += `• **${soul}** (Error: ${error})\n\n`;
        }
      }
      
      ctx.ui.notify(message, "info");
    },
  });

  // Add command to use a soul
  pi.registerCommand("soul", {
    description: "Use a soul for the current session — persists across sessions. Supports partial matching.",
    handler: async (args, ctx) => {
      debugLog("soul", `Using soul command with: ${args}`);
      
      if (!args) {
        const souls = soulLoader.getAllSouls();
        let msg = "Usage: /soul <soul-name>\n\nAvailable souls:\n";
        for (const s of souls) {
          try {
            const manifest = await soulLoader.load(s, 1);
            const desc = manifest.description ? ` — ${manifest.description}` : '';
            msg += `\n  \u2022 **${s}**${desc}`;
          } catch {
            msg += `\n  \u2022 ${s}`;
          }
        }
        msg += "\n\nUse /soul off to clear the active soul and stop auto-loading.";
        msg += "\n\nUse /soul --help for more options.";
        ctx.ui.notify(msg, "error");
        return;
      }

      // Parse --level N from args (support both "--level 3" and "--level=3")
      let soulArgs = args.trim();
      let level = 2;
      const levelMatch = soulArgs.match(/--level\s*=\s*(\d+)/i) || soulArgs.match(/--level\s+(\d+)/i);
      if (levelMatch) {
        level = parseInt(levelMatch[1], 10);
        level = Math.max(1, Math.min(3, level));
        soulArgs = soulArgs.replace(/--level\s*[= ]\s*\d+/i, "").trim();
      }

      // Handle --help flag
      if (soulArgs === "--help" || soulArgs === "-h") {
        let helpMsg = "Usage: /soul <soul-name> [options]\n\n";
        helpMsg += "Load and activate a SoulSpec persona for the current session.\n\n";
        helpMsg += "Arguments:\n";
        helpMsg += "  <soul-name>    Name of the soul to load (directory name or path).\n";
        helpMsg += "                 Supports partial matching: 'dev' matches 'developer'\n\n";
        helpMsg += "Options:\n";
        helpMsg += "  --level N      Set progressive disclosure level (1-3, default: 2)\n";
        helpMsg += "  --help, -h     Show this help message\n\n";
        helpMsg += "Special values:\n";
        helpMsg += "  off, clear, none, default  Clear the active soul\n\n";
        helpMsg += "Examples:\n";
        helpMsg += "  /soul my-soul              Load soul named 'my-soul' at level 2\n";
        helpMsg += "  /soul dev                  Load any soul containing 'dev'\n";
        helpMsg += "  /soul my-soul --level 3    Load soul at level 3 (full details)\n";
        helpMsg += "  /soul off                  Clear active soul\n\n";
        helpMsg += "To list available souls, use /souls or run /soul without arguments.";
        ctx.ui.notify(helpMsg, "info");
        return;
      }

      // Handle /soul off / clear to stop auto-loading
      const trimmedArgs = soulArgs.toLowerCase();
      if (trimmedArgs === "off" || trimmedArgs === "clear" || trimmedArgs === "none" || trimmedArgs === "default") {
        clearActiveSoul();
        autoAppliedSoul = null;
        ctx.ui.notify("Active soul cleared. No soul will auto-load in future sessions.", "info");
        return;
      }

      try {
        const soul = await soulLoader.load(trimmedArgs, level);
        const systemPrompt = soulLoader.buildSystemPrompt(soul, level);
        
        // Persist this soul as the default for future sessions
        saveActiveSoul(soul.name, level);
        
        // Inject the soul prompt as a system message
        pi.sendMessage({
          customType: "soulspec",
          content: systemPrompt,
          display: true,
          details: { soul: soul.name, level }
        }, {
          deliverAs: "steer"
        });
        
        ctx.ui.notify(`Now using soul: ${soul.display_name} (level ${level}). This soul will auto-load in future sessions.`, "success");
      } catch (error) {
        // Check if it's a "not found" error and provide helpful suggestions
        if (error.message && error.message.includes("Soul not found")) {
          const matches = soulLoader.findMatchingSouls(new RegExp(trimmedArgs, 'i'));
          
          if (matches.length > 0) {
            const matchList = matches.slice(0, 5).join(', ');
            const suggestion = matches.length > 5 ? ` (showing first 5 of ${matches.length})` : '';
            
            ctx.ui.notify(`No exact match found for "${trimmedArgs}". Did you mean one of these?\n\n${matchList}${suggestion}\n\nTry one of these exact names, or use a more specific pattern.`, "warning");
          } else {
            const allSouls = soulLoader.getAllSouls();
            if (allSouls.length > 0) {
              const soulList = allSouls.slice(0, 10).join(', ');
              const remaining = allSouls.length > 10 ? ` (and ${allSouls.length - 10} more)` : '';
              
              ctx.ui.notify(`No soul found matching "${trimmedArgs}".\n\nAvailable souls:\n\n${soulList}${remaining}\n\nUse /souls to see all available souls, or try a partial match like 'dev' or 'assist'.`, "warning");
            }
          }
        } else {
          debugLog("soul", `Error using soul: ${error}`);
          ctx.ui.notify(`Error loading soul: ${error}`, "error");
        }
      }
    },
  });

  debugLog("soul", "SoulSpec extension loaded successfully");
}