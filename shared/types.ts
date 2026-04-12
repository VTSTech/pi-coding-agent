/**
 * Shared TypeScript types for Pi Coding Agent extensions.
 * Ported from AgentNova core/types.py.
 *
 * @module shared/types
 * @writtenby VTSTech — https://www.vts-tech.org
 */

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Level of tool support provided by a model.
 *
 * - `"native"`: Model returns `tool_calls` in the API response (structured tool calling)
 * - `"react"`: Model outputs `"Action:"` / `"Action Input:"` patterns (ReAct format)
 * - `"none"`: No tool support detected
 * - `"untested"`: Model has not yet been probed for tool support
 */
export type ToolSupportLevel = "native" | "react" | "none" | "untested";

/**
 * Result of a security check operation.
 *
 * @property safe - Whether the operation passed the security check
 * @property rule - The name of the security rule that was evaluated
 * @property detail - Human-readable explanation of the result
 */
export interface SecurityCheckResult {
  safe: boolean;
  rule: string;
  detail: string;
}

/**
 * Entry in the audit log (JSON-lines format).
 *
 * Each entry represents a security-relevant operation, whether blocked or allowed.
 *
 * @property timestamp - ISO 8601 timestamp of the event
 * @property toolName - Name of the tool that was called
 * @property toolCallId - Unique identifier for the tool call
 * @property action - Whether the operation was blocked, allowed, or flagged as a warning
 * @property rule - The security rule that was evaluated (if applicable)
 * @property detail - Human-readable description of the event
 * @property input - The tool input arguments (sanitized for logging)
 */
export interface AuditEntry {
  timestamp: string;
  toolName: string;
  toolCallId: string;
  action: "blocked" | "allowed" | "warning";
  rule: string;
  detail: string;
  input: Record<string, unknown>;
}

/**
 * Cache entry for tool support level.
 *
 * Stored in `~/.pi/agent/cache/tool_support.json` to avoid re-probing models
 * on every run.
 *
 * @property support - The detected tool support level
 * @property testedAt - ISO 8601 timestamp of when the test was performed
 * @property family - The model family detected at test time
 * @property model - The model name that was tested
 */
export interface ToolSupportCacheEntry {
  support: ToolSupportLevel;
  testedAt: string;
  family: string;
  model: string;
}