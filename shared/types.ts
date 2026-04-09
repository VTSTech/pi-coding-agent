/**
 * Shared TypeScript types for Pi Coding Agent extensions.
 * Ported from AgentNova core/types.py.
 *
 * @module shared/types
 * @writtenby VTSTech — https://www.vts-tech.org
 */

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Error thrown when connection to Ollama fails.
 * This can occur due to network issues, tunnel failures, or Ollama not running.
 *
 * @example
 * ```typescript
 * if (!response.ok) {
 *   throw new OllamaConnectionError(`HTTP ${response.status}`, cause);
 * }
 * ```
 */
export class OllamaConnectionError extends Error {
  /** The underlying error that caused this connection failure, if any. */
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'OllamaConnectionError';
    this.cause = cause;
  }
}

/**
 * Error thrown when a model takes too long to respond.
 * This is common with small models on CPU or when network latency is high.
 *
 * @example
 * ```typescript
 * if (elapsedMs > timeoutMs) {
 *   throw new ModelTimeoutError('qwen3:0.6b', 500000);
 * }
 * ```
 */
export class ModelTimeoutError extends Error {
  /** The name of the model that timed out. */
  public readonly model: string;
  /** The timeout duration in milliseconds. */
  public readonly timeoutMs: number;

  constructor(model: string, timeoutMs: number) {
    super(`Model ${model} timed out after ${timeoutMs}ms`);
    this.name = 'ModelTimeoutError';
    this.model = model;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when a model returns an empty or invalid response.
 * This can happen with thinking models that require `think: true` or when
 * the model's output is truncated.
 *
 * @example
 * ```typescript
 * if (!content.trim()) {
 *   throw new EmptyResponseError('qwen3:0.6b', 'No content or thinking tokens');
 * }
 * ```
 */
export class EmptyResponseError extends Error {
  /** The name of the model that returned an empty response. */
  public readonly model: string;
  /** Additional details about why the response was considered empty. */
  public readonly details: string;

  constructor(model: string, details: string) {
    super(`Empty response from model ${model}: ${details}`);
    this.name = 'EmptyResponseError';
    this.model = model;
    this.details = details;
  }
}

/**
 * Error thrown when a security rule blocks an operation.
 * Contains information about which rule was triggered and why.
 *
 * @example
 * ```typescript
 * if (BLOCKED_COMMANDS.has(baseCmd)) {
 *   throw new SecurityBlockError('command_blocklist', `Blocked command: ${baseCmd}`, input);
 * }
 * ```
 */
export class SecurityBlockError extends Error {
  /** The name of the security rule that was triggered. */
  public readonly rule: string;
  /** Detailed explanation of why the operation was blocked. */
  public readonly detail: string;
  /** The original input that was blocked. */
  public readonly input: Record<string, unknown>;

  constructor(rule: string, detail: string, input: Record<string, unknown>) {
    super(`[SECURITY] ${detail} (rule: ${rule})`);
    this.name = 'SecurityBlockError';
    this.rule = rule;
    this.detail = detail;
    this.input = input;
  }
}

/**
 * Error thrown when tool call parsing fails.
 * This can occur when a model outputs malformed JSON or unexpected formats.
 *
 * @example
 * ```typescript
 * try {
 *   const parsed = JSON.parse(toolCallJson);
 * } catch (e) {
 *   throw new ToolParseError('Invalid JSON in tool arguments', rawText);
 * }
 * ```
 */
export class ToolParseError extends Error {
  /** The raw text that failed to parse. */
  public readonly rawText: string;

  constructor(message: string, rawText: string) {
    super(`Tool parse error: ${message}`);
    this.name = 'ToolParseError';
    this.rawText = rawText;
  }
}

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
 * Result type of an agent step.
 *
 * - `"tool_call"`: Agent made a tool call
 * - `"final_answer"`: Agent returned a final answer
 * - `"error"`: Agent encountered an error
 * - `"max_steps"`: Agent reached maximum step limit
 */
export type StepResultType = "tool_call" | "final_answer" | "error" | "max_steps";

/**
 * API mode for backend communication.
 */
export type ApiMode = "openre" | "openai";

/**
 * Backend type.
 */
export type BackendType = "ollama" | "llama_server" | "bitnet";

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

/**
 * State tracker for error recovery across tool calls.
 *
 * Used to detect patterns of repeated failures and enable recovery strategies.
 *
 * @property consecutiveFailures - Map of tool names to consecutive failure counts
 * @property failureHistory - List of recent failures with timestamps
 * @property totalFailures - Total number of failures in the current session
 */
export interface ErrorRecoveryState {
  consecutiveFailures: Record<string, number>;
  failureHistory: Array<{
    tool: string;
    error: string;
    timestamp: string;
  }>;
  totalFailures: number;
}