/**
 * Shared formatting utilities for Pi Coding Agent extensions.
 * Extracted from diag.ts and model-test.ts to eliminate duplication.
 *
 * Written by VTSTech — https://www.vts-tech.org
 */

// ── Section & indicator helpers ──────────────────────────────────────────

/** Render a section header with a horizontal rule. */
export function section(title: string): string {
  return `\n── ${title} ${"─".repeat(Math.max(1, 60 - title.length - 4))}`;
}

/** Pass indicator. */
export function ok(msg: string): string { return `  ✅ ${msg}`; }

/** Fail indicator. */
export function fail(msg: string): string { return `  ❌ ${msg}`; }

/** Warning indicator. */
export function warn(msg: string): string { return `  ⚠️  ${msg}`; }

/** Info indicator. */
export function info(msg: string): string { return `  ℹ️  ${msg}`; }

// ── Numeric formatters ───────────────────────────────────────────────────

/** Format bytes as human-readable (B, KB, MB, GB, TB). */
export function bytesHuman(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)}${units[i]}`;
}

/** Format milliseconds as human-readable (ms, s, m). */
export function msHuman(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/** Compact byte formatter for status bar (e.g. "4.2G", "512M", "8K"). */
export function fmtBytes(b: number): string {
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)}G`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(0)}M`;
  return `${(b / 1024).toFixed(0)}K`;
}

/** Compact duration formatter for status bar. */
export function fmtDur(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`;
}

/** Percentage of used vs total. */
export function pct(used: number, total: number): string {
  return `${((used / total) * 100).toFixed(1)}%`;
}

// ── String utilities ─────────────────────────────────────────────────────

/** Truncate a string to max length with suffix. */
export function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/** Strip markdown code fences and truncate large/HTML content for clean report output. */
export function sanitizeForReport(s: string, maxLines = 40): string {
  let cleaned = s.replace(/^\s*```[a-zA-Z]*[ \t]*\n?/gm, "");
  cleaned = cleaned.replace(/^\s*```[ \t]*\n?/gm, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();

  // Detect HTML content (error pages, curl failures) and truncate to first few lines
  if (/<[a-z][\s\S]*>/i.test(cleaned) && cleaned.includes("</")) {
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

/** Right-pad a string to a given length. */
export function padRight(s: string, n: number): string {
  return s + " ".repeat(Math.max(0, n - s.length));
}
