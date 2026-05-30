/**
 * pi-soul configurable persistence and active soul store.
 *
 * This module is kept separate from `extensions/soul.ts` so it can be
 * unit-tested without the `@earendil-works/pi-coding-agent` peer dependency.
 *
 * Design decisions:
 * - Config is read manually from Pi's JSON settings files (no `pi.getSettings()` API exists).
 * - Project settings shallow-override global settings for the `piSoul` key.
 * - Invalid config values warn and fall back to defaults.
 * - Session persistence stores per-directory soul mappings in the same
 *   `.active-soul.json` file (top-level `sessions[]` array, keyed by `process.cwd()`).
 * - Global persistence uses the top-level `soul` field (original behavior).
 * - `autoLoad: false` disables startup auto-application only; explicit `/soul` and
 *   `--soul` still activate and save per persistence.
 *
 * session_start reason × persistence matrix:
 * | reason  | global                        | session                  | none |
 * |---------|-------------------------------|--------------------------|------|
 * | startup | autoLoad applies              | saves to sessions[]      | —    |
 * | new     | autoLoad applies              | restores from sessions[] | —    |
 * | resume  | autoLoad applies              | restores from sessions[] | —    |
 * | fork    | autoLoad applies              | restores from sessions[] | —    |
 * | reload  | no autoLoad (same session)    | restores from sessions[] | —    |
 *
 * @module shared/soul-config
 */

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { expandHome } from "./path-utils";
import { debugLog } from "./debug";

// ────────────────────────────────────────────────────────────────────────────
// Config types
// ────────────────────────────────────────────────────────────────────────────

export type SoulPersistence = "global" | "session" | "none";

export interface PiSoulConfig {
	/** Where to persist the active soul. Default: "global". */
	persistence: SoulPersistence;
	/** Whether to auto-apply a persisted soul on session_start. Default: true. */
	autoLoad: boolean;
}

export const PI_SOUL_DEFAULTS: PiSoulConfig = {
	persistence: "global",
	autoLoad: true,
};

// ────────────────────────────────────────────────────────────────────────────
// Clear values (same as existing /soul off special values)
// ────────────────────────────────────────────────────────────────────────────

export const SOUL_CLEAR_VALUES = ["off", "clear", "none", "default"] as const;
export type SoulClearValue = (typeof SOUL_CLEAR_VALUES)[number];

export function isSoulClearValue(v: string): boolean {
	return (SOUL_CLEAR_VALUES as readonly string[]).includes(v.toLowerCase());
}

// ────────────────────────────────────────────────────────────────────────────
// Config loading
// ────────────────────────────────────────────────────────────────────────────

function readJsonFile(filePath: string): Record<string, unknown> | null {
	try {
		if (fs.existsSync(filePath)) {
			return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
				string,
				unknown
			>;
		}
	} catch (err) {
		console.warn(
			`[pi-soul] Failed to read config file "${filePath}": ${err}. Using defaults.`,
		);
	}
	return null;
}

function parsePiSoulConfigFromObject(raw: unknown): Partial<PiSoulConfig> {
	if (!raw || typeof raw !== "object") return {};
	const obj = raw as Record<string, unknown>;
	const result: Partial<PiSoulConfig> = {};

	if ("persistence" in obj) {
		if (
			obj.persistence === "global" ||
			obj.persistence === "session" ||
			obj.persistence === "none"
		) {
			result.persistence = obj.persistence;
		} else {
			console.warn(
				`[pi-soul] Invalid piSoul.persistence value "${String(obj.persistence)}". Falling back to "global".`,
			);
		}
	}

	if ("autoLoad" in obj) {
		if (typeof obj.autoLoad === "boolean") {
			result.autoLoad = obj.autoLoad;
		} else {
			console.warn(
				`[pi-soul] Invalid piSoul.autoLoad value "${String(obj.autoLoad)}". Falling back to true.`,
			);
		}
	}

	return result;
}
export interface PiSoulConfigOptions {
	/** Override path to global soul config (default: `~/.pi/agent/soul-config.json`). */
	globalSoulConfigPath?: string;
	/** Override path to project soul config (default: `.pi/soul-config.json`). */
	projectSoulConfigPath?: string;
}

const GLOBAL_SOUL_CONFIG_PATH = expandHome("~/.pi/agent/soul-config.json");
const PROJECT_SOUL_CONFIG_PATH = ".pi/soul-config.json";

function writeJsonFile(filePath: string, data: Record<string, unknown>): void {
	const dir = path.dirname(filePath);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

/**
 * Load `piSoul` config from `soul-config.json` files.
 *
 * Merge strategy:
 *   1. Start from `PI_SOUL_DEFAULTS`.
 *   2. Apply global `~/.pi/agent/soul-config.json`.
 *   3. Apply project `.pi/soul-config.json` (shallow override).
 *
 * If the global config file does not exist, it is created with defaults.
 * Invalid values → warn + fall back to defaults for that field.
 */
export function loadPiSoulConfig(options?: PiSoulConfigOptions): PiSoulConfig {
	const globalPath = options?.globalSoulConfigPath ?? GLOBAL_SOUL_CONFIG_PATH;
	const projectPath =
		options?.projectSoulConfigPath ?? PROJECT_SOUL_CONFIG_PATH;

	const globalData = readJsonFile(globalPath);
	const projectData = readJsonFile(projectPath);

	// Support both old format ({ piSoul: {...} }) and new flat format
	const globalConfig = globalData
		? parsePiSoulConfigFromObject((globalData as any).piSoul || globalData)
		: {};
	const projectConfig = projectData
		? parsePiSoulConfigFromObject((projectData as any).piSoul || projectData)
		: {};

	const merged: PiSoulConfig = {
		...PI_SOUL_DEFAULTS,
		...globalConfig,
		...projectConfig,
	};

	// Ensure global config file exists with resolved values
	if (!globalData) {
		writeJsonFile(globalPath, {
			persistence: merged.persistence,
			autoLoad: merged.autoLoad,
		});
		debugLog("soul", `[pi-soul] Created default config at ${globalPath}`);
	}

	return merged;
}
// ────────────────────────────────────────────────────────────────────────────
// Active soul state types
// ────────────────────────────────────────────────────────────────────────────

export interface ActiveSoulState {
	active: boolean;
	soul: string | null;
	level?: number;
	updatedAt: number;
}

/**
 * Minimal session accessor interface — duck-typed to avoid importing
 * `@earendil-works/pi-coding-agent` peer package in shared code.
 *
 * In production: constructed from `pi.appendEntry` + `ctx.sessionManager`.
 * In tests: mocked directly.
 */
export interface SessionEntry {
	type: string;
	customType?: string;
	data?: unknown;
}

export interface SessionAccessor {
	appendEntry(customType: string, data?: unknown): void;
	getEntries(): SessionEntry[];
}

// ────────────────────────────────────────────────────────────────────────────
// Active soul store interface
// ────────────────────────────────────────────────────────────────────────────

export interface ActiveSoulStore {
	/**
	 * Load the current persisted soul state.
	 * Returns null if no soul is persisted or state is cleared.
	 */
	load(session?: SessionAccessor): ActiveSoulState | null;

	/** Persist the given soul state. */
	save(state: ActiveSoulState, session?: SessionAccessor): void;

	/** Clear the persisted soul state. */
	clear(session?: SessionAccessor): void;

	/** Human-readable description of this store (used in /soul status). */
	describe(): string;
}

// ────────────────────────────────────────────────────────────────────────────
// Implementation: GlobalFileActiveSoulStore
// ────────────────────────────────────────────────────────────────────────────

export const ACTIVE_SOUL_PATH = path.join(
	os.homedir(),
	".pi",
	"agent",
	".active-soul.json",
);

export class GlobalFileActiveSoulStore implements ActiveSoulStore {
	constructor(
		private readonly filePath: string = ACTIVE_SOUL_PATH,
		private readonly mode: "global" | "session" = "global",
	) {}

	load(_session?: SessionAccessor): ActiveSoulState | null {
		try {
			if (!fs.existsSync(this.filePath)) return null;
			const data = JSON.parse(
				fs.readFileSync(this.filePath, "utf-8"),
			) as Record<string, unknown>;

			if (this.mode === "session") {
				return this._loadFromSessions(data);
			}

			// Global mode: top-level soul field (original behavior)
			if (data && data.soul) {
				return {
					active: true,
					soul: data.soul as string,
					level: typeof data.level === "number" ? data.level : 2,
					updatedAt:
						typeof data.updatedAt === "number" ? data.updatedAt : Date.now(),
				};
			}
		} catch (err) {
			debugLog(
				"soul",
				`[pi-soul] Failed to load active soul from file: ${err}`,
			);
		}
		return null;
	}

	save(state: ActiveSoulState, _session?: SessionAccessor): void {
		if (!state.soul) return;
		const dir = path.dirname(this.filePath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		try {
			if (this.mode === "session") {
				this._saveToSessions(state);
			} else {
				// Global mode: write only top-level fields (original behavior)
				fs.writeFileSync(
					this.filePath,
					JSON.stringify(
						{
							soul: state.soul,
							level: state.level ?? 2,
							updatedAt: state.updatedAt,
						},
						null,
						2,
					),
					"utf-8",
				);
			}
			debugLog("soul", `[pi-soul] Saved active soul to file: ${state.soul}`);
		} catch (err) {
			debugLog("soul", `[pi-soul] Failed to save active soul to file: ${err}`);
		}
	}

	clear(_session?: SessionAccessor): void {
		try {
			if (this.mode === "session") {
				this._clearFromSessions();
			} else {
				// Global mode: delete the file (original behavior)
				if (fs.existsSync(this.filePath)) {
					fs.unlinkSync(this.filePath);
					debugLog("soul", "[pi-soul] Cleared active soul file");
				}
			}
		} catch (err) {
			debugLog("soul", `[pi-soul] Failed to clear active soul: ${err}`);
		}
	}

	describe(): string {
		return this.mode === "session"
			? "path-mapped session marker (.active-soul.json)"
			: "global file (~/.pi/agent/.active-soul.json)";
	}

	// ── Private: session mode helpers ──────────────────────────────────────

	private _loadFromSessions(
		data: Record<string, unknown>,
	): ActiveSoulState | null {
		const sessions = data.sessions as
			| Array<Record<string, unknown>>
			| undefined;
		if (!sessions) return null;
		const cwd = process.cwd();
		const match = sessions.find((s) => (s as any).path === cwd);
		if (
			match &&
			(match as any).soul &&
			typeof (match as any).soul === "string"
		) {
			return {
				active: true,
				soul: (match as any).soul as string,
				level:
					typeof (match as any).level === "number" ? (match as any).level : 2,
				updatedAt:
					typeof (match as any).updatedAt === "number"
						? (match as any).updatedAt
						: Date.now(),
			};
		}
		return null;
	}

	private _saveToSessions(state: ActiveSoulState): void {
		// Read existing file to preserve non-session keys
		let config: Record<string, unknown> = {};
		try {
			if (fs.existsSync(this.filePath)) {
				config = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as Record<
					string,
					unknown
				>;
			}
		} catch {
			// Start fresh if file is corrupt
		}

		const sessions: Array<Record<string, unknown>> =
			(config.sessions as Array<Record<string, unknown>>) || [];
		const cwd = process.cwd();
		const idx = sessions.findIndex((s) => (s as any).path === cwd);
		const entry: Record<string, unknown> = {
			path: cwd,
			soul: state.soul,
			level: state.level,
			updatedAt: Date.now(),
		};
		if (idx >= 0) {
			sessions[idx] = entry;
		} else {
			sessions.push(entry);
		}

		config.sessions = sessions;
		config.persistence = "session";

		fs.writeFileSync(
			this.filePath,
			JSON.stringify(config, null, 2) + "\n",
			"utf-8",
		);
	}

	private _clearFromSessions(): void {
		if (!fs.existsSync(this.filePath)) return;

		let config: Record<string, unknown> = {};
		try {
			config = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as Record<
				string,
				unknown
			>;
		} catch {
			return;
		}

		const sessions = config.sessions as
			| Array<Record<string, unknown>>
			| undefined;
		if (!sessions) return;

		const cwd = process.cwd();
		const filtered = sessions.filter((s) => (s as any).path !== cwd);

		if (filtered.length === 0) {
			// No sessions left — remove the file entirely
			fs.unlinkSync(this.filePath);
		} else {
			config.sessions = filtered;
			fs.writeFileSync(
				this.filePath,
				JSON.stringify(config, null, 2) + "\n",
				"utf-8",
			);
		}
	}
}
// ────────────────────────────────────────────────────────────────────────────
// Implementation: MemoryActiveSoulStore

// ────────────────────────────────────────────────────────────────────────────
// Implementation: MemoryActiveSoulStore
// ────────────────────────────────────────────────────────────────────────────

/**
 * In-memory soul store.
 *
 * Does not persist anything. State is lost on process exit / session switch.
 * Used when `piSoul.persistence = "none"`.
 */
export class MemoryActiveSoulStore implements ActiveSoulStore {
	private _state: ActiveSoulState | null = null;

	load(_session?: SessionAccessor): ActiveSoulState | null {
		return this._state;
	}

	save(state: ActiveSoulState, _session?: SessionAccessor): void {
		this._state = state;
		debugLog("soul", `[pi-soul] Active soul in memory: ${state.soul}`);
	}

	clear(_session?: SessionAccessor): void {
		this._state = null;
		debugLog("soul", "[pi-soul] Cleared in-memory active soul");
	}

	describe(): string {
		return "in-memory only (not persisted)";
	}
}

// ────────────────────────────────────────────────────────────────────────────
// Factory
// ────────────────────────────────────────────────────────────────────────────

export function createActiveSoulStore(config: PiSoulConfig): ActiveSoulStore {
	switch (config.persistence) {
		case "global":
			return new GlobalFileActiveSoulStore();
		case "session":
			return new GlobalFileActiveSoulStore(undefined, "session");
		case "none":
			return new MemoryActiveSoulStore();
		default:
			// Safety fallback — should never be reached with valid config
			return new GlobalFileActiveSoulStore();
	}
}
