import { ok, fail, warn, info, section, msHuman } from "./format";
import { EXTENSION_VERSION } from "./ollama";
const branding = [
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
function formatRecommendation(model, passed, total, via, testFlow) {
  const suffix = via ? ` via ${via}` : "";
  const flowSuffix = testFlow ? ` (${testFlow} flow)` : "";
  const lines = [];
  lines.push(section("RECOMMENDATION"));
  if (passed === total) {
    lines.push(ok(`${model} is a STRONG model${suffix}${flowSuffix} \u2014 full capability`));
  } else if (passed > 0 && passed >= total - 1) {
    lines.push(ok(`${model} is a GOOD model${suffix}${flowSuffix} \u2014 most capabilities work`));
  } else if (passed > 0 && passed >= total - 2) {
    lines.push(warn(`${model} is USABLE${suffix}${flowSuffix} \u2014 some capabilities are limited`));
  } else {
    lines.push(fail(`${model} is WEAK${suffix}${flowSuffix} \u2014 limited capabilities for agent use`));
  }
  return lines;
}
export {
  branding,
  formatRecommendation,
  formatTestScore,
  formatTestSummary
};
