/**
 * Shared formatting utilities for Pi Coding Agent extensions.
 * Extracted from diag.ts and model-test.ts to eliminate duplication.
 *
 * @module shared/format
 * @writtenby VTSTech — https://www.vts-tech.org
 */

// ============================================================================
// Section & Indicator Helpers
// ============================================================================

/**
 * Render a section header with a horizontal rule.
 *
 * Creates a visually distinct section header in the format:
 * `── TITLE ──────────────────────────────────────────────`
 *
 * The horizontal rule automatically fills the remaining space
 * to create a consistent 60-character wide header.
 *
 * @param title - The section title to display
 * @returns A formatted section header string
 *
 * @example
 * ```typescript
 * section("REASONING TEST");
 * // Returns: "\n── REASONING TEST ───────────────────────────────────────"
 * ```
 */
export function section(title: string): string {
  return `\n── ${title} ${"─".repeat(Math.max(1, 60 - title.length - 4))}`;
}

/**
 * Format a success message with a checkmark indicator.
 *
 * @param msg - The message to format
 * @returns The formatted message with ✅ prefix
 *
 * @example
 * ```typescript
 * ok("Tool call successful");
 * // Returns: "  ✅ Tool call successful"
 * ```
 */
export function ok(msg: string): string { return `  ✅ ${msg}`; }

/**
 * Format a failure message with an X indicator.
 *
 * @param msg - The message to format
 * @returns The formatted message with ❌ prefix
 *
 * @example
 * ```typescript
 * fail("Connection timeout");
 * // Returns: "  ❌ Connection timeout"
 * ```
 */
export function fail(msg: string): string { return `  ❌ ${msg}`; }

/**
 * Format a warning message with a warning indicator.
 *
 * @param msg - The message to format
 * @returns The formatted message with ⚠️ prefix
 *
 * @example
 * ```typescript
 * warn("Model may be too slow for production use");
 * // Returns: "  ⚠️  Model may be too slow for production use"
 * ```
 */
export function warn(msg: string): string { return `  ⚠️  ${msg}`; }

/**
 * Format an informational message with an info indicator.
 *
 * @param msg - The message to format
 * @returns The formatted message with ℹ️ prefix
 *
 * @example
 * ```typescript
 * info("Testing reasoning capability...");
 * // Returns: "  ℹ️  Testing reasoning capability..."
 * ```
 */
export function info(msg: string): string { return `  ℹ️  ${msg}`; }

// ============================================================================
// Numeric Formatters
// ============================================================================

/**
 * Format bytes as a human-readable string with appropriate units.
 *
 * Automatically selects the most appropriate unit (B, KB, MB, GB, TB)
 * and formats the number with one decimal place.
 *
 * @param bytes - The number of bytes to format
 * @returns A human-readable string representation
 *
 * @example
 * ```typescript
 * bytesHuman(512);           // "512.0B"
 * bytesHuman(1536);          // "1.5KB"
 * bytesHuman(1048576);       // "1.0MB"
 * bytesHuman(1073741824);    // "1.0GB"
 * ```
 */
export function bytesHuman(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let b = bytes;
  while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(1)}${units[i]}`;
}

/**
 * Format milliseconds as a human-readable duration string.
 *
 * Automatically selects the most appropriate unit (ms, s, m)
 * based on the magnitude of the input.
 *
 * @param ms - The duration in milliseconds
 * @returns A human-readable string representation
 *
 * @example
 * ```typescript
 * msHuman(500);      // "500ms"
 * msHuman(1500);     // "1.5s"
 * msHuman(90000);    // "1.5m"
 * ```
 */
export function msHuman(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format bytes as a compact string for status bar display.
 *
 * Uses single-letter suffixes (K, M, G) without spaces,
 * optimized for narrow display contexts like status bars.
 *
 * @param b - The number of bytes to format
 * @returns A compact string representation
 *
 * @example
 * ```typescript
 * fmtBytes(512);           // "512K"
 * fmtBytes(1048576);       // "1.0M"
 * fmtBytes(1073741824);    // "1.0G"
 * ```
 */
export function fmtBytes(b: number): string {
  if (b === 0) return "0B";
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)}G`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(0)}M`;
  return `${(b / 1024).toFixed(0)}K`;
}

/**
 * Format milliseconds as a compact duration for status bar display.
 *
 * For durations over a minute, displays as `Xm Ys` format.
 * For shorter durations, displays as seconds with one decimal.
 *
 * @param ms - The duration in milliseconds
 * @returns A compact string representation
 *
 * @example
 * ```typescript
 * fmtDur(500);      // "500ms"
 * fmtDur(1500);     // "1.5s"
 * fmtDur(90000);    // "1m30s"
 * ```
 */
export function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

/**
 * Calculate and format a percentage.
 *
 * @param used - The used/occupied amount
 * @param total - The total capacity
 * @returns A percentage string with one decimal place
 *
 * @example
 * ```typescript
 * pct(512, 1024);    // "50.0%"
 * pct(75, 100);      // "75.0%"
 * ```
 */
export function pct(used: number, total: number): string {
  if (total === 0) return "0.0%";
  return `${((used / total) * 100).toFixed(1)}%`;
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Truncate a string to a maximum length with an ellipsis suffix.
 *
 * If the string exceeds the maximum length, it is truncated
 * and "..." is appended to indicate truncation.
 *
 * @param s - The string to truncate
 * @param max - Maximum length before truncation
 * @returns The original string or truncated version
 *
 * @example
 * ```typescript
 * truncate("Hello, World!", 5);    // "He..."
 * truncate("Short", 10);           // "Short"
 * ```
 */
export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/**
 * Strip markdown code fences and truncate large content for clean report output.
 *
 * Performs the following transformations:
 * 1. Removes markdown code fence markers (``` and ```lang)
 * 2. Collapses excessive blank lines
 * 3. Detects and truncates HTML content (error pages)
 * 4. Caps output at a maximum number of lines
 *
 * @param s - The string to sanitize
 * @param maxLines - Maximum number of lines to output (default: 40)
 * @returns The sanitized and potentially truncated string
 *
 * @example
 * ```typescript
 * sanitizeForReport("```json\n{\"key\": \"value\"}\n```");
 * // Returns: "{\"key\": \"value\"}"
 *
 * sanitizeForReport(largeHtmlContent);
 * // Returns: "<!DOCTYPE html>...\n  ℹ️  (HTML response truncated)"
 * ```
 */
export function sanitizeForReport(s: string, maxLines = 40): string {
  let cleaned = s.replace(/^\s*```[a-zA-Z]*[ \t]*\n?/gm, "");
  cleaned = cleaned.replace(/^\s*```[ \t]*\n?/gm, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  // Detect HTML content (error pages, curl failures) and truncate to first few lines
  // Use strict detection: require a closing tag AND a common HTML opening tag to avoid
  // false positives on code that mentions HTML-like syntax (e.g., "use <Item> from 'react'")
  if (/<!DOCTYPE\b|<html[\s>]/i.test(cleaned) || (/<[a-z][\s\S]*>/i.test(cleaned) && cleaned.includes("</") && /<(?:div|span|p|head|body|html|table|form|script)\b/i.test(cleaned))) {
    const firstLine = cleaned.split("\n")[0];
    return truncate(firstLine, 200) + "\n  ℹ️  (HTML response truncated)";
  }

  // Cap line count for any large output
  const lines = cleaned.split("\n");
  if (lines.length > maxLines) {
    cleaned = lines.slice(0, maxLines).join("\n") + `\n  ℹ️  (truncated, ${lines.length - maxLines} more lines)`;
  }

  return cleaned;
}

/**
 * Right-pad a string to a specified length with spaces.
 *
 * If the string is already longer than the target length,
 * it is returned unchanged.
 *
 * @param s - The string to pad
 * @param n - The target length
 * @returns The padded string
 *
 * @example
 * ```typescript
 * padRight("test", 10);     // "test      "
 * padRight("toolong", 5);   // "toolong"
 * ```
 */
export function padRight(s: string, n: number): string {
  return s + " ".repeat(Math.max(0, n - s.length));
}

// ============================================================================
// Model Estimation
// ============================================================================

/**
 * Estimate VRAM usage (in bytes) from parameter size and quantization level.
 *
 * Uses bits-per-parameter based on the quantization format:
 * - FP32/BF16/F16: 16 bits (full precision)
 * - Q8_0: 8 bits
 * - Q5_K_M/Q5_M/Q5_K_S/Q5_0/Q5_1: 5.5 bits (average)
 * - Q4_K_M/Q4_K_S/Q4_0/Q4_1/Q4_M: 4.5 bits (average)
 * - Q3_K_M/Q3_K_S/Q3_K_L: 3.5 bits (average)
 * - Q2_K: 2.5 bits (average)
 * - IQ variants (IQ3_XS, IQ4_XS, etc.): mapped to nearest Q equivalent
 * - Fallback: 5 bits
 *
 * Adds 10% overhead for KV cache and runtime allocations.
 *
 * @param parameterSize - Human-readable parameter count (e.g., "7B", "1.5B", "350M")
 * @param quantizationLevel - Quantization format string (e.g., "Q4_K_M", "BF16")
 * @returns Estimated VRAM in bytes, or undefined if parameter size can't be parsed
 *
 * @example
 * ```typescript
 * estimateVram("7B", "Q4_K_M");       // ~3.5GB
 * estimateVram("1.2B", "Q8_0");      // ~1.3GB
 * estimateVram("350M", "BF16");      // ~0.7GB
 * ```
 */
export function estimateVram(parameterSize: string, quantizationLevel: string): number | undefined {
  const params = parseParamCount(parameterSize);
  if (params === undefined) return undefined;

  const bitsPerParam = bitsPerParamForQuant(quantizationLevel);
  // Base model size in bytes
  const modelBytes = (params * bitsPerParam) / 8;
  // Add 10% overhead for KV cache, runtime allocations
  return Math.ceil(modelBytes * 1.1);
}

/**
 * Parse a human-readable parameter count string to a numeric value.
 *
 * Handles formats like "7B", "1.5B", "350M", "13a" (Apple-style),
 * "70B", "0.6B", "494.03M", etc.
 *
 * @param s - The parameter size string
 * @returns Parameter count as a number, or undefined if unparseable
 */
function parseParamCount(s: string): number | undefined {
  if (!s || typeof s !== "string") return undefined;
  const str = s.trim().toLowerCase();

  // Match: number + suffix (B/b, M/m, T/t, a/apple)
  const match = str.match(/^([\d.]+)\s*([bmt]?|a(?:pple)?)$/);
  if (!match) return undefined;

  const num = parseFloat(match[1]);
  if (isNaN(num) || num <= 0) return undefined;

  const suffix = match[2];
  switch (suffix) {
    case "b": return num * 1e9;
    case "m": return num * 1e6;
    case "t": return num * 1e12;
    case "a": return num * 1e9; // Apple-style (e.g., "3a" = 3B parameters)
    case "": return num * 1e9; // Bare number assumed to be billions
    default: return undefined;
  }
}

/**
 * Determine bits per parameter based on quantization format string.
 */
function bitsPerParamForQuant(quant: string): number {
  const q = quant.toUpperCase().replace(/[-_.]/g, "");

  if (q.startsWith("FP32") || q === "FP32") return 32;
  if (q.startsWith("F16") || q === "F16" || q.startsWith("BF16")) return 16;
  if (q.startsWith("Q8")) return 8;
  if (q.startsWith("IQ4")) return 4.5;
  if (q.startsWith("IQ3")) return 3.5;
  if (q.startsWith("IQ2")) return 2.5;
  if (q.startsWith("IQ1")) return 1.75;
  if (q.startsWith("Q5") || q.startsWith("Q6")) return 5.5;
  if (q.startsWith("Q4")) return 4.5;
  if (q.startsWith("Q3")) return 3.5;
  if (q.startsWith("Q2")) return 2.5;
  if (q.startsWith("Q1")) return 1.75;

  return 5; // conservative fallback
}