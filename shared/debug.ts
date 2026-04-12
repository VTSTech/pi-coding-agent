/**
 * Debug logging utility for Pi Coding Agent extensions.
 *
 * Only emits output when the PI_EXTENSIONS_DEBUG environment variable is set to "1".
 * This allows developers to enable verbose diagnostic logging without impacting
 * production performance or cluttering normal output.
 *
 * @module shared/debug
 */

const DEBUG_ENABLED = process.env.PI_EXTENSIONS_DEBUG === "1";

/**
 * Log a debug message to stderr (via console.debug).
 *
 * @param module - Short identifier for the emitting module (e.g., "ollama", "security")
 * @param message - Human-readable message describing the event
 * @param args - Additional values to log alongside the message
 *
 * @example
 * ```typescript
 * import { debugLog } from "../shared/debug";
 * try { … } catch (err) {
 *   debugLog("ollama", "failed to read models.json", err);
 * }
 * ```
 */
export function debugLog(module: string, message: string, ...args: unknown[]): void {
  if (!DEBUG_ENABLED) return;
  const timestamp = new Date().toISOString();
  console.debug(`[pi-ext:${module}] ${timestamp} ${message}`, ...args);
}
