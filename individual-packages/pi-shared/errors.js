var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// shared/errors.ts
var ExtensionError = class extends Error {
  constructor(message, code) {
    super(message);
    __publicField(this, "code", code);
    this.name = "ExtensionError";
  }
};
var ConfigError = class extends ExtensionError {
  constructor(message) {
    super(message, "CONFIG_ERROR");
    this.name = "ConfigError";
  }
};
var ApiError = class extends ExtensionError {
  constructor(message, statusCode, url) {
    super(message, "API_ERROR");
    __publicField(this, "statusCode", statusCode);
    __publicField(this, "url", url);
    this.name = "ApiError";
  }
};
var ExtensionTimeoutError = class extends ExtensionError {
  constructor(message, timeoutMs) {
    super(message, "TIMEOUT");
    __publicField(this, "timeoutMs", timeoutMs);
    this.name = "ExtensionTimeoutError";
  }
};
var SecurityError = class extends ExtensionError {
  constructor(message, rule, detail) {
    super(message, "SECURITY_VIOLATION");
    __publicField(this, "rule", rule);
    __publicField(this, "detail", detail);
    this.name = "SecurityError";
  }
};
var ToolError = class extends ExtensionError {
  constructor(message, toolName) {
    super(message, "TOOL_ERROR");
    __publicField(this, "toolName", toolName);
    this.name = "ToolError";
  }
};
export {
  ApiError,
  ConfigError,
  ExtensionError,
  ExtensionTimeoutError,
  SecurityError,
  ToolError
};
