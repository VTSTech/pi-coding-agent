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
function bytesHuman(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let b = bytes;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i++;
  }
  return `${b.toFixed(1)}${units[i]}`;
}
function msHuman(ms) {
  if (ms < 1e3) return `${ms.toFixed(0)}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${(ms / 6e4).toFixed(1)}m`;
}
function fmtBytes(b) {
  if (b === 0) return "0B";
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)}G`;
  if (b >= 1048576) return `${(b / 1048576).toFixed(0)}M`;
  return `${(b / 1024).toFixed(0)}K`;
}
function fmtDur(ms) {
  if (ms < 1e3) return `${Math.round(ms)}ms`;
  if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
  return `${Math.floor(ms / 6e4)}m${Math.round(ms % 6e4 / 1e3)}s`;
}
function pct(used, total) {
  if (total === 0) return "0.0%";
  return `${(used / total * 100).toFixed(1)}%`;
}
function truncate(s, max) {
  return s.length > max ? s.slice(0, max) + "..." : s;
}
function sanitizeForReport(s, maxLines = 40) {
  let cleaned = s.replace(/^\s*```[a-zA-Z]*[ \t]*\n?/gm, "");
  cleaned = cleaned.replace(/^\s*```[ \t]*\n?/gm, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  if (/<!DOCTYPE\b|<html[\s>]/i.test(cleaned) || /<[a-z][\s\S]*>/i.test(cleaned) && cleaned.includes("</") && /<(?:div|span|p|head|body|html|table|form|script)\b/i.test(cleaned)) {
    const firstLine = cleaned.split("\n")[0];
    return truncate(firstLine, 200) + "\n  \u2139\uFE0F  (HTML response truncated)";
  }
  const lines = cleaned.split("\n");
  if (lines.length > maxLines) {
    cleaned = lines.slice(0, maxLines).join("\n") + `
  \u2139\uFE0F  (truncated, ${lines.length - maxLines} more lines)`;
  }
  return cleaned;
}
function padRight(s, n) {
  return s + " ".repeat(Math.max(0, n - s.length));
}
function estimateVram(parameterSize, quantizationLevel) {
  const params = parseParamCount(parameterSize);
  if (params === void 0) return void 0;
  const bitsPerParam = bitsPerParamForQuant(quantizationLevel);
  const modelBytes = params * bitsPerParam / 8;
  return Math.ceil(modelBytes * 1.1);
}
function parseParamCount(s) {
  if (!s || typeof s !== "string") return void 0;
  const str = s.trim().toLowerCase();
  const match = str.match(/^([\d.]+)\s*([bmt]?|a(?:pple)?)$/);
  if (!match) return void 0;
  const num = parseFloat(match[1]);
  if (isNaN(num) || num <= 0) return void 0;
  const suffix = match[2];
  switch (suffix) {
    case "b":
      return num * 1e9;
    case "m":
      return num * 1e6;
    case "t":
      return num * 1e12;
    case "a":
      return num * 1e9;
    // Apple-style (e.g., "3a" = 3B parameters)
    case "":
      return num * 1e9;
    // Bare number assumed to be billions
    default:
      return void 0;
  }
}
function bitsPerParamForQuant(quant) {
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
  return 5;
}
export {
  bytesHuman,
  estimateVram,
  fail,
  fmtBytes,
  fmtDur,
  info,
  msHuman,
  ok,
  padRight,
  pct,
  sanitizeForReport,
  section,
  truncate,
  warn
};
