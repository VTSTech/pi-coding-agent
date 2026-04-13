/**
 * Shared report formatting utilities for model-test extension.
 *
 * These are pure functions that do NOT depend on the ExtensionAPI closure,
 * so they can be safely extracted from the extension file into a shared module.
 */
import { ok, fail, warn, info, section, msHuman } from "./format";
import { EXTENSION_VERSION } from "./ollama";

// ── branding ───────────────────────────────────────────────────────────

/** Standard branding header used in all model benchmark reports. */
export const branding = [
  `  ⚡ Pi Model Benchmark v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`,
].join("\n");

// ── score formatting ───────────────────────────────────────────────────

/**
 * Format a test score with appropriate ok/fail/warn coloring.
 *
 * Maps score strings to terminal-formatted output:
 *   STRONG  → ok (green)
 *   MODERATE → ok (green)
 *   WEAK    → warn (yellow)
 *   FAIL    → fail (red)
 *   ERROR   → fail (red)
 *   anything else → fail (red)
 */
export function formatTestScore(score: string, label: string): string {
  switch (score) {
    case "STRONG":
      return ok(`${label} (${score})`);
    case "MODERATE":
      return ok(`${label} (${score})`);
    case "WEAK":
      return warn(`${label} (${score})`);
    case "FAIL":
      return fail(`${label} (${score})`);
    case "ERROR":
      return fail(`Error: ${label}`);
    default:
      // Unknown score — treat as fail
      return fail(`${label} (${score})`);
  }
}

// ── summary formatting ─────────────────────────────────────────────────

/** A single test result row in the summary table. */
export interface TestSummaryRow {
  name: string;
  pass: boolean;
  score: string;
}

/**
 * Build the summary section lines for a model test report.
 *
 * Returns an array of formatted strings (NOT joined) so callers can
 * interleave them with other content if needed.
 *
 * Includes:
 *   - "SUMMARY" section header
 *   - One line per test with ok/fail coloring
 *   - Total time
 *   - Score line (X/Y tests passed)
 */
export function formatTestSummary(
  tests: TestSummaryRow[],
  totalMs: number,
): string[] {
  const lines: string[] = [];
  lines.push(section("SUMMARY"));

  for (const t of tests) {
    lines.push(t.pass ? ok(`${t.name}: ${t.score}`) : fail(`${t.name}: ${t.score}`));
  }

  lines.push(info(`Total time: ${msHuman(totalMs)}`));

  const passed = tests.filter(t => t.pass).length;
  lines.push(info(`Score: ${passed}/${tests.length} tests passed`));

  return lines;
}

/**
 * Build the recommendation section lines based on passed/total counts.
 *
 * @param model      - Model name to include in the recommendation message
 * @param passed     - Number of tests that passed
 * @param total      - Total number of tests
 * @param via        - Optional provider name suffix (e.g. "via OpenRouter")
 */
export function formatRecommendation(
  model: string,
  passed: number,
  total: number,
  via?: string,
): string[] {
  const suffix = via ? ` via ${via}` : "";
  const lines: string[] = [];
  lines.push(section("RECOMMENDATION"));

  if (passed === total) {
    lines.push(ok(`${model} is a STRONG model${suffix} — full capability`));
  } else if (passed >= total - 1) {
    lines.push(ok(`${model} is a GOOD model${suffix} — most capabilities work`));
  } else if (passed >= total - 2) {
    lines.push(warn(`${model} is USABLE${suffix} — some capabilities are limited`));
  } else {
    lines.push(fail(`${model} is WEAK${suffix} — limited capabilities for agent use`));
  }

  return lines;
}
