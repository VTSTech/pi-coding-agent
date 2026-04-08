/**
 * Shared TypeScript types for Pi Coding Agent extensions.
 * Ported from AgentNova core/types.py.
 *
 * Written by VTSTech — https://www.vts-tech.org
 */

/** Level of tool support provided by a model. */
export type ToolSupportLevel = "native" | "react" | "none" | "untested";

/** Result type of an agent step. */
export type StepResultType = "tool_call" | "final_answer" | "error" | "max_steps";

/** API mode for backend communication. */
export type ApiMode = "openre" | "openai";

/** Backend type. */
export type BackendType = "ollama" | "llama_server" | "bitnet";

/** Security check result. */
export interface SecurityCheckResult {
  safe: boolean;
  rule: string;
  detail: string;
}

/** Audit log entry (JSON-lines format). */
export interface AuditEntry {
  timestamp: string;
  toolName: string;
  toolCallId: string;
  action: "blocked" | "allowed" | "warning";
  rule: string;
  detail: string;
  input: Record<string, unknown>;
}

/** Tool support cache entry. */
export interface ToolSupportCacheEntry {
  support: ToolSupportLevel;
  testedAt: string;
  family: string;
  model: string;
}

/** Error recovery tracker state. */
export interface ErrorRecoveryState {
  consecutiveFailures: Record<string, number>;
  failureHistory: Array<{
    tool: string;
    error: string;
    timestamp: string;
  }>;
  totalFailures: number;
}
