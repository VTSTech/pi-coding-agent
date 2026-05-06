import * as fs from "fs";
import * as path from "path";
import os from "os";
import { debugLog } from "./debug";
const PI_AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
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
const SETTINGS_PATH = path.join(PI_AGENT_DIR, "settings.json");
const SECURITY_PATH = path.join(PI_AGENT_DIR, "security.json");
const REACT_MODE_PATH = path.join(PI_AGENT_DIR, "react-mode.json");
const MODEL_TEST_CONFIG_PATH = path.join(PI_AGENT_DIR, "model-test-config.json");
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
