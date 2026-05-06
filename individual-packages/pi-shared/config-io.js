// shared/config-io.ts
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

// shared/debug.ts
var DEBUG_ENABLED = process.env.PI_EXTENSIONS_DEBUG === "1";
function debugLog(module, message, ...args) {
  if (!DEBUG_ENABLED) return;
  const timestamp = (/* @__PURE__ */ new Date()).toISOString();
  console.debug(`[pi-ext:${module}] ${timestamp} ${message}`, ...args);
}

// shared/config-io.ts
var PI_AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
function readJsonConfig(filePath, defaultValue = {}) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch (err) {
    debugLog("config-io", `failed to read config: ${filePath}`, err);
  }
  return defaultValue;
}
function writeJsonConfig(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const content = JSON.stringify(data, null, 2) + "\n";
  const tmpPath = filePath + ".tmp";
  try {
    fs.writeFileSync(tmpPath, content, "utf-8");
    fs.renameSync(tmpPath, filePath);
  } catch {
    fs.writeFileSync(filePath, content, "utf-8");
  }
}
var SETTINGS_PATH = path.join(PI_AGENT_DIR, "settings.json");
var SECURITY_PATH = path.join(PI_AGENT_DIR, "security.json");
var REACT_MODE_PATH = path.join(PI_AGENT_DIR, "react-mode.json");
var MODEL_TEST_CONFIG_PATH = path.join(PI_AGENT_DIR, "model-test-config.json");
function readSettings() {
  return readJsonConfig(SETTINGS_PATH);
}
function writeSettings(data) {
  writeJsonConfig(SETTINGS_PATH, data);
}
export {
  MODEL_TEST_CONFIG_PATH,
  REACT_MODE_PATH,
  SECURITY_PATH,
  SETTINGS_PATH,
  readJsonConfig,
  readSettings,
  writeJsonConfig,
  writeSettings
};
