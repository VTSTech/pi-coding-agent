/**
 * Shared typed error classes for Pi Coding Agent extensions.
 * Provides structured, catchable error types across the extension system.
 *
 * @module shared/errors
 * @writtenby VTSTech — https://www.vts-tech.org
 */

/**
 * Base error class for all extension-related errors.
 * Extensions can use instanceof checks to categorize and handle errors.
 */
export class ExtensionError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = "ExtensionError";
  }
}

/**
 * Error thrown when a configuration file is invalid, missing, or cannot be read.
 */
export class ConfigError extends ExtensionError {
  constructor(message: string) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
}

/**
 * Error thrown when an API request fails (HTTP error, timeout, auth failure).
 */
export class ApiError extends ExtensionError {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly url?: string,
  ) {
    super(message, "API_ERROR");
    this.name = "ApiError";
  }
}

/**
 * Error thrown when an operation exceeds its timeout.
 */
export class ExtensionTimeoutError extends ExtensionError {
  constructor(message: string, public readonly timeoutMs?: number) {
    super(message, "TIMEOUT");
    this.name = "ExtensionTimeoutError";
  }
}

/**
 * Error thrown when a security check fails (blocked command, path violation, SSRF).
 */
export class SecurityError extends ExtensionError {
  constructor(
    message: string,
    public readonly rule?: string,
    public readonly detail?: string,
  ) {
    super(message, "SECURITY_VIOLATION");
    this.name = "SecurityError";
  }
}

/**
 * Error thrown when a tool call or operation fails.
 */
export class ToolError extends ExtensionError {
  constructor(
    message: string,
    public readonly toolName?: string,
  ) {
    super(message, "TOOL_ERROR");
    this.name = "ToolError";
  }
}
