var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// extensions/soul.ts
import { Type } from "typebox";

// shared/debug.ts
var DEBUG_ENABLED = process?.env?.PI_EXTENSIONS_DEBUG === "1";
function debugLog(module, message, ...args) {
  if (!DEBUG_ENABLED) return;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  console.debug(`[pi-ext:${module}] ${timestamp} ${message}`, ...args);
}

// shared/ollama.ts
import * as path from "node:path";
import os from "node:os";
var EXTENSION_VERSION = "1.2.3";
var MODELS_JSON_PATH = path.join(os.homedir(), ".pi", "agent", "models.json");

// extensions/soul.ts
import path2 from "path";
var Environment = /* @__PURE__ */ ((Environment2) => {
  Environment2["VIRTUAL"] = "virtual";
  Environment2["EMBODIED"] = "embodied";
  Environment2["HYBRID"] = "hybrid";
  return Environment2;
})(Environment || {});
var InteractionMode = /* @__PURE__ */ ((InteractionMode2) => {
  InteractionMode2["TEXT"] = "text";
  InteractionMode2["VOICE"] = "voice";
  InteractionMode2["MULTIMODAL"] = "multimodal";
  InteractionMode2["GESTURE"] = "gesture";
  return InteractionMode2;
})(InteractionMode || {});
var ContactPolicy = /* @__PURE__ */ ((ContactPolicy2) => {
  ContactPolicy2["NO_CONTACT"] = "no-contact";
  ContactPolicy2["GENTLE_CONTACT"] = "gentle-contact";
  ContactPolicy2["FULL_CONTACT"] = "full-contact";
  return ContactPolicy2;
})(ContactPolicy || {});
var Mobility = /* @__PURE__ */ ((Mobility2) => {
  Mobility2["STATIONARY"] = "stationary";
  Mobility2["MOBILE"] = "mobile";
  Mobility2["LIMITED"] = "limited";
  return Mobility2;
})(Mobility || {});
var SoulSpecLoader = class {
  constructor() {
    __publicField(this, "cache", /* @__PURE__ */ new Map());
    __publicField(this, "soulsDirs");
    this.soulsDirs = [
      "~/.pi/agent/souls",
      // Global souls directory
      ".pi/souls",
      // Project-local souls directory
      "./souls"
      // Current directory souls
    ];
  }
  resolveSoulPath(path3) {
    const locations = [
      path3,
      // Absolute or relative path
      ...this.soulsDirs.map((dir) => `${dir}/${path3}`)
      // All configured souls directories
    ];
    for (const location of locations) {
      try {
        if (__require("fs").existsSync(location)) {
          return location;
        }
      } catch {
        continue;
      }
    }
    return null;
  }
  async load(soulPath, level = 2) {
    const resolvedPath = this.resolveSoulPath(soulPath);
    if (!resolvedPath) {
      throw new Error(`Soul not found: ${soulPath}`);
    }
    const cacheKey = `${resolvedPath}:${level}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    const soulDir = __require("fs").statSync(resolvedPath).isFile() ? path2.dirname(resolvedPath) : resolvedPath;
    const manifestPath = path2.join(soulDir, "soul.json");
    if (!__require("fs").existsSync(manifestPath)) {
      throw new Error(`No soul.json found at: ${manifestPath}`);
    }
    const manifestData = JSON.parse(__require("fs").readFileSync(manifestPath, "utf-8"));
    const manifest = this.parseManifest(manifestData, soulDir);
    if (level >= 2) {
      await this.loadLevel2(manifest, soulDir);
    }
    if (level >= 3) {
      await this.loadLevel3(manifest, soulDir);
    }
    this.cache.set(cacheKey, manifest);
    return manifest;
  }
  parseManifest(data, soulDir) {
    debugLog("soul", `Parsing soul manifest: ${data.name}`);
    const author = {
      name: data.author?.name || "Unknown",
      github: data.author?.github,
      email: data.author?.email
    };
    const compatibility = {
      openclaw: data.compatibility?.openclaw,
      models: data.compatibility?.models || [],
      frameworks: data.compatibility?.frameworks || [],
      min_token_context: data.compatibility?.minTokenContext
    };
    const recommendedSkills = [];
    const skillsData = data.recommendedSkills || data.skills || [];
    for (const skill of skillsData) {
      if (typeof skill === "string") {
        recommendedSkills.push({ name: skill, required: false });
      } else {
        recommendedSkills.push({
          name: skill.name,
          version: skill.version,
          required: skill.required || false
        });
      }
    }
    const files = {
      soul: data.files?.soul || "SOUL.md",
      identity: data.files?.identity,
      agents: data.files?.agents,
      heartbeat: data.files?.heartbeat,
      style: data.files?.style,
      user_template: data.files?.userTemplate,
      avatar: data.files?.avatar
    };
    const examples = data.examples ? {
      good: data.examples.good,
      bad: data.examples.bad
    } : void 0;
    const disclosure = data.disclosure ? {
      summary: data.disclosure.summary
    } : void 0;
    const hardwareConstraints = data.hardwareConstraints ? {
      has_display: data.hardwareConstraints.hasDisplay || false,
      has_speaker: data.hardwareConstraints.hasSpeaker || false,
      has_microphone: data.hardwareConstraints.hasMicrophone || false,
      has_camera: data.hardwareConstraints.hasCamera || false,
      mobility: Mobility[data.hardwareConstraints.mobility] || "stationary" /* STATIONARY */,
      manipulator: data.hardwareConstraints.manipulator || false
    } : void 0;
    const safety = data.safety ? {
      physical: data.safety.physical ? {
        contact_policy: ContactPolicy[data.safety.physical.contactPolicy] || "no-contact" /* NO_CONTACT */,
        emergency_protocol: data.safety.physical.emergencyProtocol || "stop",
        operating_zone: data.safety.physical.operatingZone || "indoor",
        max_speed: data.safety.physical.maxSpeed
      } : void 0
    } : void 0;
    const sensors = [];
    for (const [name, sensorData] of Object.entries(data.sensors || {})) {
      sensors.push({
        name,
        type: typeof sensorData === "object" ? sensorData.type : void 0,
        range: typeof sensorData === "object" ? sensorData.range : void 0,
        fov: typeof sensorData === "object" ? sensorData.fov : void 0,
        resolution: typeof sensorData === "object" ? sensorData.resolution : void 0,
        fps: typeof sensorData === "object" ? sensorData.fps : void 0,
        channels: typeof sensorData === "object" ? sensorData.channels : void 0
      });
    }
    const actuators = [];
    for (const [name, actData] of Object.entries(data.actuators || {})) {
      actuators.push({
        name,
        type: actData.type,
        max_speed: actData.maxSpeed,
        payload: actData.payload,
        reach: actData.reach,
        force: actData.force,
        dof: actData.dof,
        resolution: actData.resolution
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
      environment: Environment[data.environment] || "virtual" /* VIRTUAL */,
      interaction_mode: InteractionMode[data.interactionMode] || "text" /* TEXT */,
      hardware_constraints: hardwareConstraints,
      safety,
      sensors,
      actuators
    };
  }
  async loadLevel2(manifest, soulDir) {
    const soulPath = path2.join(soulDir, manifest.files.soul);
    if (__require("fs").existsSync(soulPath)) {
      manifest.soul_content = __require("fs").readFileSync(soulPath, "utf-8");
    }
    if (manifest.files.identity) {
      const identityPath = path2.join(soulDir, manifest.files.identity);
      if (__require("fs").existsSync(identityPath)) {
        manifest.identity_content = __require("fs").readFileSync(identityPath, "utf-8");
      }
    }
  }
  async loadLevel3(manifest, soulDir) {
    if (manifest.files.agents) {
      const agentsPath = path2.join(soulDir, manifest.files.agents);
      if (__require("fs").existsSync(agentsPath)) {
        manifest.agents_content = __require("fs").readFileSync(agentsPath, "utf-8");
      }
    }
    if (manifest.files.style) {
      const stylePath = path2.join(soulDir, manifest.files.style);
      if (__require("fs").existsSync(stylePath)) {
        manifest.style_content = __require("fs").readFileSync(stylePath, "utf-8");
      }
    }
    if (manifest.files.heartbeat) {
      const heartbeatPath = path2.join(soulDir, manifest.files.heartbeat);
      if (__require("fs").existsSync(heartbeatPath)) {
        manifest.heartbeat_content = __require("fs").readFileSync(heartbeatPath, "utf-8");
      }
    }
    if (manifest.files.user_template) {
      const templatePath = path2.join(soulDir, manifest.files.user_template);
      if (__require("fs").existsSync(templatePath)) {
        manifest.user_template_content = __require("fs").readFileSync(templatePath, "utf-8");
      }
    }
    if (manifest.examples) {
      if (manifest.examples.good) {
        const goodPath = path2.join(soulDir, manifest.examples.good);
        if (__require("fs").existsSync(goodPath)) {
          manifest.examples_good_content = __require("fs").readFileSync(goodPath, "utf-8");
        }
      }
      if (manifest.examples.bad) {
        const badPath = path2.join(soulDir, manifest.examples.bad);
        if (__require("fs").existsSync(badPath)) {
          manifest.examples_bad_content = __require("fs").readFileSync(badPath, "utf-8");
        }
      }
    }
    if (manifest.files.avatar) {
      const avatarPath = path2.join(soulDir, manifest.files.avatar);
      if (__require("fs").existsSync(avatarPath)) {
        manifest.avatar_path = avatarPath;
      }
    }
  }
  buildSystemPrompt(manifest, level = 2, includeIdentity = true) {
    const parts = [];
    parts.push(`# ${manifest.display_name}`);
    parts.push(`
${manifest.description}`);
    if (manifest.disclosure?.summary) {
      parts.push(`
${manifest.disclosure.summary}`);
    }
    if (level >= 2) {
      if (manifest.soul_content) {
        parts.push(`

## Persona

${manifest.soul_content}`);
      }
      if (includeIdentity && manifest.identity_content) {
        parts.push(`

## Identity

${manifest.identity_content}`);
      }
    }
    if (level >= 3) {
      if (manifest.style_content) {
        parts.push(`

## Style Guidelines

${manifest.style_content}`);
      }
      if (manifest.agents_content) {
        parts.push(`

## Agent Behavior

${manifest.agents_content}`);
      }
      if (manifest.heartbeat_content) {
        parts.push(`

## Heartbeat

${manifest.heartbeat_content}`);
      }
      if (manifest.user_template_content) {
        parts.push(`

## User Message Template

${manifest.user_template_content}`);
      }
      if (manifest.examples_good_content || manifest.examples_bad_content) {
        parts.push("\n\n## Calibration Examples");
        if (manifest.examples_good_content) {
          parts.push(`

### Good Outputs

${manifest.examples_good_content}`);
        }
        if (manifest.examples_bad_content) {
          parts.push(`

### Outputs to Avoid

${manifest.examples_bad_content}`);
        }
      }
    }
    if (manifest.environment !== "virtual" /* VIRTUAL */) {
      parts.push(`

## Environment`);
      parts.push(`
You are an **${manifest.environment}** agent.`);
      if (manifest.interaction_mode !== "text" /* TEXT */) {
        parts.push(`
Primary interaction mode: ${manifest.interaction_mode}`);
      }
      if (manifest.hardware_constraints) {
        const hc = manifest.hardware_constraints;
        const capabilities = [];
        if (hc.has_display) capabilities.push("display");
        if (hc.has_speaker) capabilities.push("speaker");
        if (hc.has_microphone) capabilities.push("microphone");
        if (hc.has_camera) capabilities.push("camera");
        if (capabilities.length > 0) {
          parts.push(`
Hardware: ${capabilities.join(", ")}`);
        }
      }
      if (manifest.safety?.physical) {
        const ps = manifest.safety.physical;
        parts.push(`
Safety: ${ps.contact_policy} contact policy`);
      }
    }
    return parts.join("");
  }
  getAllSouls() {
    const souls = [];
    const seenSouls = /* @__PURE__ */ new Set();
    for (const soulsDir of this.soulsDirs) {
      const resolvedDir = path2.resolve(soulsDir);
      try {
        if (__require("fs").existsSync(resolvedDir)) {
          const entries = __require("fs").readdirSync(resolvedDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !seenSouls.has(entry.name)) {
              const soulJsonPath = path2.join(resolvedDir, entry.name, "soul.json");
              if (__require("fs").existsSync(soulJsonPath)) {
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
};
var branding = [
  `  \u26A1 Pi SoulSpec Extension v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`
].join("\n");
function soul_default(pi) {
  debugLog("soul", "SoulSpec extension loading...");
  const soulLoader = new SoulSpecLoader();
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
      }))
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      debugLog("soul", `Loading soul: ${params.soul_name}, level: ${params.level || 2}`);
      try {
        const soul = await soulLoader.load(params.soul_name, params.level || 2);
        const systemPrompt = soulLoader.buildSystemPrompt(soul, params.level || 2);
        return {
          content: [{
            type: "text",
            text: `Soul "${soul.display_name}" loaded successfully.

System Prompt:
${systemPrompt}`
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
    }
  });
  pi.registerTool({
    name: "list_souls",
    label: "List Souls",
    description: "List all available SoulSpec personas",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const souls = soulLoader.getAllSouls();
      if (souls.length === 0) {
        return {
          content: [{ type: "text", text: "No souls found. Create a souls/ directory with soul.json files." }]
        };
      }
      let response = "Available souls:\n\n";
      for (const soul of souls) {
        try {
          const manifest = await soulLoader.load(soul, 1);
          response += `- **${manifest.display_name}** (${soul})
`;
          response += `  ${manifest.description}
`;
          if (manifest.disclosure?.summary) {
            response += `  ${manifest.disclosure.summary}
`;
          }
          response += `
`;
        } catch (error) {
          response += `- **${soul}** (Error loading: ${error})

`;
        }
      }
      return {
        content: [{ type: "text", text: response }],
        details: { souls }
      };
    }
  });
  pi.registerTool({
    name: "soul_info",
    label: "Soul Info",
    description: "Get detailed information about a soul",
    parameters: Type.Object({
      soul_name: Type.String({
        description: "Name of the soul to get info for"
      })
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      debugLog("soul", `Getting soul info for: ${params.soul_name}`);
      try {
        const soul = await soulLoader.load(params.soul_name, 1);
        let info = `# ${soul.display_name}

`;
        info += `**Name:** ${soul.name}
`;
        info += `**Version:** ${soul.version}
`;
        info += `**Description:** ${soul.description}
`;
        info += `**Author:** ${soul.author.name}
`;
        info += `**License:** ${soul.license}
`;
        info += `**Environment:** ${soul.environment}
`;
        info += `**Category:** ${soul.category}
`;
        info += `**Tags:** ${soul.tags.join(", ")}
`;
        if (soul.disclosure?.summary) {
          info += `**Summary:** ${soul.disclosure.summary}
`;
        }
        if (soul.recommended_skills.length > 0) {
          info += `
**Recommended Skills:**
`;
          for (const skill of soul.recommended_skills) {
            info += `- ${skill.name}${skill.required ? " (required)" : ""}
`;
          }
        }
        if (soul.hardware_constraints) {
          info += `
**Hardware Constraints:**
`;
          const hc = soul.hardware_constraints;
          info += `- Display: ${hc.has_display ? "Yes" : "No"}
`;
          info += `- Speaker: ${hc.has_speaker ? "Yes" : "No"}
`;
          info += `- Microphone: ${hc.has_microphone ? "Yes" : "No"}
`;
          info += `- Camera: ${hc.has_camera ? "Yes" : "No"}
`;
          info += `- Mobility: ${hc.mobility}
`;
          info += `- Manipulator: ${hc.manipulator ? "Yes" : "No"}
`;
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
    }
  });
  pi.on("session_start", async (event, ctx) => {
    debugLog("soul", "SoulSpec extension session started");
    ctx.ui.notify("SoulSpec extension loaded", "info");
  });
  pi.on("resources_discover", async (event, ctx) => {
    debugLog("soul", "SoulSpec extension discovering resources");
    return {
      skillPaths: [],
      // Souls are not skills
      promptPaths: [".pi/souls", "./souls", "~/.pi/agent/souls"],
      // Add souls directories to prompt discovery
      themePaths: []
    };
  });
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
          message += `\u2022 **${manifest.display_name}** (${soul})
`;
          message += `  ${manifest.description}
`;
          if (manifest.disclosure?.summary) {
            message += `  ${manifest.disclosure.summary}
`;
          }
          message += "\n";
        } catch (error) {
          message += `\u2022 **${soul}** (Error: ${error})

`;
        }
      }
      ctx.ui.notify(message, "info");
    }
  });
  pi.registerCommand("soul", {
    description: "Use a soul for the current session",
    handler: async (args, ctx) => {
      debugLog("soul", `Using soul command with: ${args}`);
      if (!args) {
        ctx.ui.notify("Usage: /soul <soul-name>", "error");
        return;
      }
      try {
        const soul = await soulLoader.load(args, 2);
        const systemPrompt = soulLoader.buildSystemPrompt(soul, 2);
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
    }
  });
  debugLog("soul", "SoulSpec extension loaded successfully");
}
export {
  ContactPolicy,
  Environment,
  InteractionMode,
  Mobility,
  SoulSpecLoader,
  soul_default as default
};
