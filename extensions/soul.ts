/**
 * SoulSpec Extension for Pi Coding Agent.
 * Ported from AgentNova SoulSpec system.
 *
 * Features:
 *   - Load and manage AI agent personas defined in SoulSpec format
 *   - Progressive disclosure support (Level 1-3)
 *   - Multiple soul locations (global, project-local, current directory)
 *   - Built-in tools for soul management
 *   - CLI commands for soul operations
 *   - Embodied agent support with hardware constraints
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
// SoulSpec Types
// ============================================================================

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

// ============================================================================
// SoulSpec Loader
// ============================================================================

import path from "path";
import os from "os";

export class SoulSpecLoader {
  private cache: Map<string, SoulManifest> = new Map();
  private soulsDirs: string[];

  constructor() {
    // Initialize with default paths that will be checked
    this.soulsDirs = [
      "~/.pi/agent/souls",  // Global souls directory
      ".pi/souls",          // Project-local souls directory
      "./souls",           // Current directory souls
    ];
  }

  private resolveSoulPath(path: string): string | null {
    // Try multiple locations for soul packages
    const locations = [
      path, // Absolute or relative path
      ...this.soulsDirs.map(dir => `${dir}/${path}`), // All configured souls directories
    ];

    for (const location of locations) {
      try {
        if (require('fs').existsSync(location)) {
          return location;
        }
      } catch {
        continue;
      }
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

    const soulDir = require('fs').statSync(resolvedPath).isFile() 
      ? path.dirname(resolvedPath)
      : resolvedPath;

    const manifestPath = path.join(soulDir, 'soul.json');
    if (!require('fs').existsSync(manifestPath)) {
      throw new Error(`No soul.json found at: ${manifestPath}`);
    }

    // Parse manifest
    const manifestData = JSON.parse(require('fs').readFileSync(manifestPath, 'utf-8'));
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
    if (require('fs').existsSync(soulPath)) {
      manifest.soul_content = require('fs').readFileSync(soulPath, 'utf-8');
    }

    // Load IDENTITY.md
    if (manifest.files.identity) {
      const identityPath = path.join(soulDir, manifest.files.identity);
      if (require('fs').existsSync(identityPath)) {
        manifest.identity_content = require('fs').readFileSync(identityPath, 'utf-8');
      }
    }
  }

  private async loadLevel3(manifest: SoulManifest, soulDir: string): Promise<void> {
    // Load AGENTS.md
    if (manifest.files.agents) {
      const agentsPath = path.join(soulDir, manifest.files.agents);
      if (require('fs').existsSync(agentsPath)) {
        manifest.agents_content = require('fs').readFileSync(agentsPath, 'utf-8');
      }
    }

    // Load STYLE.md
    if (manifest.files.style) {
      const stylePath = path.join(soulDir, manifest.files.style);
      if (require('fs').existsSync(stylePath)) {
        manifest.style_content = require('fs').readFileSync(stylePath, 'utf-8');
      }
    }

    // Load HEARTBEAT.md
    if (manifest.files.heartbeat) {
      const heartbeatPath = path.join(soulDir, manifest.files.heartbeat);
      if (require('fs').existsSync(heartbeatPath)) {
        manifest.heartbeat_content = require('fs').readFileSync(heartbeatPath, 'utf-8');
      }
    }

    // Load USER_TEMPLATE.md
    if (manifest.files.user_template) {
      const templatePath = path.join(soulDir, manifest.files.user_template);
      if (require('fs').existsSync(templatePath)) {
        manifest.user_template_content = require('fs').readFileSync(templatePath, 'utf-8');
      }
    }

    // Load calibration examples
    if (manifest.examples) {
      if (manifest.examples.good) {
        const goodPath = path.join(soulDir, manifest.examples.good);
        if (require('fs').existsSync(goodPath)) {
          manifest.examples_good_content = require('fs').readFileSync(goodPath, 'utf-8');
        }
      }
      if (manifest.examples.bad) {
        const badPath = path.join(soulDir, manifest.examples.bad);
        if (require('fs').existsSync(badPath)) {
          manifest.examples_bad_content = require('fs').readFileSync(badPath, 'utf-8');
        }
      }
    }

    // Resolve avatar path
    if (manifest.files.avatar) {
      const avatarPath = path.join(soulDir, manifest.files.avatar);
      if (require('fs').existsSync(avatarPath)) {
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
      const resolvedDir = path.resolve(soulsDir);
      
      try {
        if (require('fs').existsSync(resolvedDir)) {
          const entries = require('fs').readdirSync(resolvedDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !seenSouls.has(entry.name)) {
              const soulJsonPath = path.join(resolvedDir, entry.name, 'soul.json');
              if (require('fs').existsSync(soulJsonPath)) {
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
}

// ============================================================================
// Extension
// ============================================================================

const branding = [
  `  ⚡ Pi SoulSpec Extension v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`,
].join("\n");

export default function (pi: ExtensionAPI) {
  debugLog("soul", "SoulSpec extension loading...");

  // Initialize loader
  const soulLoader = new SoulSpecLoader();

  // Register soul loader tool
  pi.registerTool({
    name: "load_soul",
    label: "Load Soul",
    description: "Load a SoulSpec persona and build system prompt",
    parameters: Type.Object({
      soul_name: Type.String({ 
        description: "Name of the soul to load (directory name or path)" 
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
    description: "Get detailed information about a soul",
    parameters: Type.Object({
      soul_name: Type.String({ 
        description: "Name of the soul to get info for" 
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
    debugLog("soul", "SoulSpec extension session started");
    ctx.ui.notify("SoulSpec extension loaded", "info");
  });

  pi.on("resources_discover", async (event, ctx) => {
    debugLog("soul", "SoulSpec extension discovering resources");
    return {
      skillPaths: [], // Souls are not skills
      promptPaths: [".pi/souls", "./souls", "~/.pi/agent/souls"], // Add souls directories to prompt discovery
      themePaths: [],
    };
  });

  // Add command to list souls
  pi.registerCommand("souls", {
    description: "List available souls",
    detailedHelp: "\n\n🎭 Soul Management\n\nLists all available SoulSpec personas that can be loaded for your session.\n\n📋 Usage:\n  /souls                      - List all available souls\n  /souls --help              - Show this help\n\n📊 Information Displayed:\n• Soul name and display name\n• Description and purpose\n• Disclosure level summary\n• Location in filesystem\n\n💡 Tips:\n• Souls are stored in souls/ directories\n• Look for souls in: .pi/souls, ./souls, ~/.pi/agent/souls\n• Each soul should have a soul.json manifest\n",
    handler: async (args, ctx) => {
      // Handle help command
      if (args.trim() === "--help") {
        ctx.ui.notify(
          "🎭 Soul Management\n\n" +
          "📋 Usage:\n" +
          "  /souls                      - List all available souls\n" +
          "  /souls --help              - Show this help\n\n" +
          "📊 Information Displayed:\n" +
          "• Soul name and display name\n" +
          "• Description and purpose\n" +
          "• Disclosure level summary\n" +
          "• Location in filesystem\n\n" +
          "💡 Tips:\n" +
          "• Souls are stored in souls/ directories\n" +
          "• Look for souls in: .pi/souls, ./souls, ~/.pi/agent/souls\n" +
          "• Each soul should have a soul.json manifest\n",
          "info"
        );
        return;
      }
      
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
    description: "Use a soul for the current session",
    detailedHelp: "\n\n🎭 SoulSpec Persona System\n\nLoads and manages AI agent personas defined in SoulSpec format with\nprogressive disclosure support and environment-specific customization.\n\n📋 Usage:\n  /soul <soul-name>            - Load a soul with standard disclosure (level 2)\n  /soul <soul-name> --level 1  - Load with minimal disclosure\n  /soul <soul-name> --level 2  - Load with standard disclosure (default)\n  /soul <soul-name> --level 3  - Load with full detailed information\n  /soul <soul-name> --info     - Show soul information without loading\n  /soul --help                - Show this help\n\n🔧 Disclosure Levels:\n• Level 1: Basic information only (minimal details)\n• Level 2: Standard disclosure with core capabilities\n• Level 3: Full detailed information and background\n\n📊 Soul Information:\n• Display name and description\n• Personality traits and communication style\n• Technical expertise and capabilities\n• Environmental constraints and preferences\n• Hardware specifications (for embodied agents)\n\n💡 Tips:\n• Use --info to preview a soul before loading\n• Adjust disclosure level based on your needs\n• Souls are automatically discovered from multiple directories\n• Each soul should have a soul.json manifest file\n",
    handler: async (args, ctx) => {
      // Handle help command
      if (args.trim() === "--help") {
        ctx.ui.notify(
          "🎭 SoulSpec Persona System\n\n" +
          "📋 Usage:\n" +
          "  /soul <soul-name>            - Load a soul with standard disclosure (level 2)\n" +
          "  /soul <soul-name> --level 1  - Load with minimal disclosure\n" +
          "  /soul <soul-name> --level 2  - Load with standard disclosure (default)\n" +
          "  /soul <soul-name> --level 3  - Load with full detailed information\n" +
          "  /soul <soul-name> --info     - Show soul information without loading\n" +
          "  /soul --help                - Show this help\n\n" +
          "🔧 Disclosure Levels:\n" +
          "• Level 1: Basic information only (minimal details)\n" +
          "• Level 2: Standard disclosure with core capabilities\n" +
          "• Level 3: Full detailed information and background\n\n" +
          "📊 Soul Information:\n" +
          "• Display name and description\n" +
          "• Personality traits and communication style\n" +
          "• Technical expertise and capabilities\n" +
          "• Environmental constraints and preferences\n" +
          "• Hardware specifications (for embodied agents)\n\n" +
          "💡 Tips:\n" +
          "• Use --info to preview a soul before loading\n" +
          "• Adjust disclosure level based on your needs\n" +
          "• Souls are automatically discovered from multiple directories\n" +
          "• Each soul should have a soul.json manifest file\n",
          "info"
        );
        return;
      }
      
      debugLog("soul", `Using soul command with: ${args}`);
      
      if (!args) {
        ctx.ui.notify("Usage: /soul <soul-name>", "error");
        return;
      }

      try {
        const soul = await soulLoader.load(args, 2);
        const systemPrompt = soulLoader.buildSystemPrompt(soul, 2);
        
        // Inject the soul prompt as a system message
        pi.sendMessage({
          customType: "soulspec",
          content: systemPrompt,
          display: true,
          details: { soul: soul.name, level: 2 }
        }, {
          deliverAs: "steer"
        });
        
        ctx.ui.notify(`Using soul: ${soul.display_name}`, "success");
      } catch (error) {
        debugLog("soul", `Error using soul: ${error}`);
        ctx.ui.notify(`Error loading soul: ${error}`, "error");
      }
    },
  });

  debugLog("soul", "SoulSpec extension loaded successfully");
}