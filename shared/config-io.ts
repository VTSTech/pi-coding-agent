/**
 * Shared configuration I/O utilities for Pi Coding Agent extensions.
 * Extracted from api.ts to eliminate duplication across extensions.
 *
 * Provides atomic read/write for Pi's configuration files:
 *   - settings.json   (default provider, model, etc.)
 *   - security.json   (security mode)
 *   - react-mode.json (ReAct toggle)
 *   - model-test-config.json (test user overrides)
 *
 * @module shared/config-io
 * @writtenby VTSTech — https://www.vts-tech.org
 */

import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

/** Base directory for Pi agent configuration files. */
const PI_AGENT_DIR = path.join(os.homedir(), ".pi", "agent");

/**
 * Read a JSON configuration file, returning the parsed object.
 * Returns `defaultValue` if the file does not exist or cannot be parsed.
 *
 * Uses synchronous I/O for simplicity (consistent with the rest of
 * the codebase's settings access pattern).
 */
export function readJsonConfig<T = Record<string, any>>(
  filePath: string,
  defaultValue: T = {} as T
): T {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
    }
  } catch (err) {
    // read failure is non-critical — caller receives defaultValue
    if (typeof process !== "undefined" && process.env.PI_EXTENSIONS_DEBUG === "1") {
      console.debug(`[config-io] Failed to read config: ${filePath}`, err);
    }
  }
  return defaultValue;
}

/**
 * Write a JSON configuration file atomically.
 * Creates the parent directory if it doesn't exist.
 * Uses write-then-rename for crash safety: writes to a .tmp file first,
 * then renames to the target path. If rename fails (e.g., cross-device),
 * falls back to direct write.
 */
export function writeJsonConfig(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const content = JSON.stringify(data, null, 2) + "\n";
  const tmpPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, content, "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch {
    // rename may fail across filesystems — fall back to direct write
    fs.writeFileSync(filePath, content, "utf-8");
  }
}

// ── Pre-defined paths ─────────────────────────────────────────────────────

/** Path to Pi's settings.json */
export const SETTINGS_PATH = path.join(PI_AGENT_DIR, "settings.json");

/** Path to Pi's security.json */
export const SECURITY_PATH = path.join(PI_AGENT_DIR, "security.json");

/** Path to Pi's react-mode.json */
export const REACT_MODE_PATH = path.join(PI_AGENT_DIR, "react-mode.json");

/** Path to Pi's model-test-config.json */
export const MODEL_TEST_CONFIG_PATH = path.join(PI_AGENT_DIR, "model-test-config.json");

// ── Convenience helpers ──────────────────────────────────────────────────

/** Read Pi's settings.json, returning empty object if not found. */
export function readSettings(): Record<string, any> {
  return readJsonConfig(SETTINGS_PATH);
}

/** Write Pi's settings.json, creating directory if needed. */
export function writeSettings(data: Record<string, any>): void {
  writeJsonConfig(SETTINGS_PATH, data);
}
