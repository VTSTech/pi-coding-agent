// shared/format.ts
function section(title) {
  return `
\u2500\u2500 ${title} ${"\u2500".repeat(Math.max(1, 60 - title.length - 4))}`;
}
function ok(msg) {
  return `  \u2705 ${msg}`;
}
function fail(msg) {
  return `  \u274C ${msg}`;
}
function warn(msg) {
  return `  \u26A0\uFE0F  ${msg}`;
}
function info(msg) {
  return `  \u2139\uFE0F  ${msg}`;
}
function msHuman(ms) {
  if (ms < 1e3) return `${ms.toFixed(0)}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${(ms / 6e4).toFixed(1)}m`;
}

// shared/ollama.ts
import * as path from "node:path";
import os from "node:os";

// shared/debug.ts
var DEBUG_ENABLED = process.env.PI_EXTENSIONS_DEBUG === "1";

// shared/ollama.ts
var EXTENSION_VERSION = "1.2.2";
var MODELS_JSON_PATH = path.join(os.homedir(), ".pi", "agent", "models.json");

// shared/test-report.ts
var branding = [
  `  \u26A1 Pi Model Benchmark v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`
].join("\n");
function formatTestScore(score, label) {
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
      return fail(`${label} (${score})`);
  }
}
function formatTestSummary(tests, totalMs) {
  const lines = [];
  lines.push(section("SUMMARY"));
  for (const t of tests) {
    lines.push(t.pass ? ok(`${t.name}: ${t.score}`) : fail(`${t.name}: ${t.score}`));
  }
  lines.push(info(`Total time: ${msHuman(totalMs)}`));
  const passed = tests.filter((t) => t.pass).length;
  lines.push(info(`Score: ${passed}/${tests.length} tests passed`));
  return lines;
}
function formatRecommendation(model, passed, total, via) {
  const suffix = via ? ` via ${via}` : "";
  const lines = [];
  lines.push(section("RECOMMENDATION"));
  if (passed === total) {
    lines.push(ok(`${model} is a STRONG model${suffix} \u2014 full capability`));
  } else if (passed > 0 && passed >= total - 1) {
    lines.push(ok(`${model} is a GOOD model${suffix} \u2014 most capabilities work`));
  } else if (passed > 0 && passed >= total - 2) {
    lines.push(warn(`${model} is USABLE${suffix} \u2014 some capabilities are limited`));
  } else {
    lines.push(fail(`${model} is WEAK${suffix} \u2014 limited capabilities for agent use`));
  }
  return lines;
}
export {
  branding,
  formatRecommendation,
  formatTestScore,
  formatTestSummary
};
