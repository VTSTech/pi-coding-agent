import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { PiSoulConfig, ActiveSoulStore } from "../shared/soul-config";
import { isSoulClearValue } from "../shared/soul-config";
import type { SoulSpecLoader, SoulManifest } from "./soul";
import { debugLog } from "../shared/debug";

// ────────────────────────────────────────────────────────────────────────────
// Result types
// ────────────────────────────────────────────────────────────────────────────

export interface SoulActivation {
  name: string;
  displayName: string;
  prompt: string;
  level: number;
}

export type SoulFlagResult =
  | { type: "handled"; action: "activated"; soul: SoulActivation }
  | { type: "handled"; action: "cleared" }
  | { type: "handled"; action: "error" }
  | false; // no flag to handle

export type InteractiveResult =
  | { type: "activated"; soul: SoulActivation }
  | { type: "cleared" }
  | { type: "none" }; // cancelled, separator, or no UI

// ────────────────────────────────────────────────────────────────────────────
// CLI flag — --soul and --soul-level
// ────────────────────────────────────────────────────────────────────────────

export async function handleSoulFlag(
  pi: ExtensionAPI,
  loader: SoulSpecLoader,
  store: ActiveSoulStore,
  ctx: any,
  config: PiSoulConfig,
): Promise<SoulFlagResult> {
  const soulFlag = pi.getFlag("soul") as string | undefined;
  if (!soulFlag) return false;

  const rawLevel = (pi.getFlag("soul-level") as string | undefined) || "2";
  const level = Math.max(1, Math.min(3, parseInt(rawLevel, 10) || 2));

  if (isSoulClearValue(soulFlag)) {
    store.clear();
    pi.events.emit("soul:deactivated", {
      previousSoul: null,
      source: "cli",
      persistence: config.persistence,
      autoLoad: config.autoLoad,
    });
    ctx.ui?.setStatus?.("pi-soul", undefined);
    ctx.ui?.notify?.("Active soul cleared.", "info");
    return { type: "handled", action: "cleared" };
  }

  try {
    const manifest = await loader.load(soulFlag, level);
    const prompt = loader.buildSystemPrompt(manifest, level);
    store.save({ active: true, soul: manifest.name, level, updatedAt: Date.now() });
    pi.events.emit("soul:activated", {
      soul: manifest.name,
      displayName: manifest.display_name,
      level,
      manifest,
      persistence: config.persistence,
      autoLoad: config.autoLoad,
      source: "cli",
    });
    ctx.ui?.setStatus?.("pi-soul", manifest.display_name);
    debugLog("soul", `Activated soul via --soul: ${manifest.display_name}`);
    return {
      type: "handled",
      action: "activated",
      soul: { name: manifest.name, displayName: manifest.display_name, prompt, level },
    };
  } catch (err) {
    debugLog("soul", `Failed to load --soul "${soulFlag}": ${err}`);
    ctx.ui?.notify?.(`Soul "${soulFlag}" not found.`, "warning");
    return { type: "handled", action: "error" };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Interactive /soul picker
// ────────────────────────────────────────────────────────────────────────────

export async function handleInteractiveSoulSelect(
  loader: SoulSpecLoader,
  ctx: any,
  pi: ExtensionAPI,
  store: ActiveSoulStore,
  config: PiSoulConfig,
  currentSoul: SoulActivation | null,
): Promise<InteractiveResult> {
  if (!ctx.hasUI || typeof ctx.ui.select !== "function") {
    return { type: "none" };
  }

  const souls = loader.getAllSouls();
  const options: string[] = [];

  if (currentSoul) {
    options.push("📋 status — Show active soul info");
  }
  options.push("❌ off — Clear the active soul");
  options.push("———");
  options.push(...souls.map((s: string) => `🔮 ${s}`));

  const choice = await ctx.ui.select("Choose a soul:", options);
  if (!choice) return { type: "none" };

  if (choice.startsWith("📋 status")) {
    if (!currentSoul) {
      ctx.ui.notify("No soul is currently active.", "info");
    } else {
      ctx.ui.notify(
        `Active soul: **${currentSoul.displayName}** (level ${currentSoul.level})`,
        "info",
      );
    }
    return { type: "none" };
  }

  if (choice.startsWith("❌ off")) {
    store.clear();
    pi.events.emit("soul:deactivated", {
      previousSoul: null,
      source: "command",
      persistence: config.persistence,
      autoLoad: config.autoLoad,
    });
    ctx.ui.setStatus("pi-soul", undefined);
    ctx.ui.notify("Active soul cleared.", "info");
    return { type: "cleared" };
  }

  if (choice === "———") return { type: "none" };

  // Must be a soul name — strip emoji
  const soulName = choice.replace(/^🔮 /, "");

  // Ask for disclosure level
  const levelChoice = await ctx.ui.select("Disclosure level:", [
    "1 — Basic identity and role",
    "2 — Full persona (default)",
    "3 — Deep background and system details",
    "❌ Cancel",
  ]);
  if (!levelChoice || levelChoice === "❌ Cancel") return { type: "none" };
  const level = levelChoice.startsWith("1") ? 1 : levelChoice.startsWith("3") ? 3 : 2;

  try {
    const manifest = await loader.load(soulName, level);
    const prompt = loader.buildSystemPrompt(manifest, level);
    store.save({ active: true, soul: manifest.name, level, updatedAt: Date.now() });
    pi.events.emit("soul:activated", {
      soul: manifest.name,
      displayName: manifest.display_name,
      level,
      manifest,
      persistence: config.persistence,
      autoLoad: config.autoLoad,
      source: "command",
    });
    ctx.ui.setStatus("pi-soul", manifest.display_name);
    pi.sendMessage(
      {
        customType: "soulspec",
        content: prompt,
        display: true,
        details: { soul: manifest.name, level },
      },
      { deliverAs: "steer" },
    );
    ctx.ui.notify(
      `Now using soul: ${manifest.display_name} (level ${level}). This soul will persist according to your persistence config.`,
      "success",
    );
    return {
      type: "activated",
      soul: { name: manifest.name, displayName: manifest.display_name, prompt, level },
    };
  } catch (error: any) {
    if (error?.message?.includes("Soul not found")) {
      const matches = loader.findMatchingSouls(new RegExp(soulName, "i"));
      if (matches.length > 0) {
        ctx.ui.notify(
          `No exact match for "${soulName}". Try: ${matches.slice(0, 5).join(", ")}`,
          "warning",
        );
      } else {
        ctx.ui.notify(`Soul "${soulName}" not found.`, "warning");
      }
    } else {
      ctx.ui.notify(`Error loading soul: ${error}`, "error");
    }
    return { type: "none" };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Event emission helpers
// ────────────────────────────────────────────────────────────────────────────

export function emitSoulActivated(
  pi: ExtensionAPI,
  manifest: SoulManifest,
  level: number,
  source: string,
  config: PiSoulConfig,
): void {
  pi.events.emit("soul:activated", {
    soul: manifest.name,
    displayName: manifest.display_name,
    level,
    manifest,
    persistence: config.persistence,
    autoLoad: config.autoLoad,
    source,
  });
}

export function emitSoulDeactivated(
  pi: ExtensionAPI,
  previousSoul: string | null,
  source: string,
  config: PiSoulConfig,
): void {
  pi.events.emit("soul:deactivated", {
    previousSoul,
    source,
    persistence: config.persistence,
    autoLoad: config.autoLoad,
  });
}
