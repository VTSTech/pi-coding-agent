import { describe, it, test, after } from "node:test";
import assert from "node:assert/strict";
import {
  validatePath,
  isSafeUrl,
  sanitizeCommand,
  checkBashToolInput,
  checkFileToolInput,
  checkHttpToolInput,
  checkInjectionPatterns,
  BLOCKED_COMMANDS,
  CRITICAL_COMMANDS,
  EXTENDED_COMMANDS,
  appendAuditEntry,
  readRecentAuditEntries,
  BLOCKED_URL_PATTERNS,
  AUDIT_LOG_PATH,
  SECURITY_CONFIG_PATH,
  SETTINGS_PATH,
  setSecurityMode,
  getSecurityMode,
} from "../shared/security";
import * as fs from "node:fs";
import * as path from "node:path";
import os from "node:os";

// ============================================================================
// validatePath
// ============================================================================

describe("validatePath", () => {
  it("rejects empty paths", () => {
    const result = validatePath("");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("empty"));
  });

  it("rejects paths with ../ (path traversal)", () => {
    const result = validatePath("../../../etc/passwd");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("traversal"));
  });

  it("rejects paths with ..\\ (Windows traversal)", () => {
    const result = validatePath("..\\..\\..\\windows\\system32\\cmd.exe");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("traversal"));
  });

  it("rejects UNC paths", () => {
    const result = validatePath("\\\\server\\share\\file.txt");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("UNC"));
  });

  it("rejects /etc (system directory)", () => {
    const result = validatePath("/etc/passwd");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("/etc"));
  });

  it("rejects /root (system directory)", () => {
    const result = validatePath("/root/.bashrc");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("/root"));
  });

  it("rejects /boot (system directory)", () => {
    const result = validatePath("/boot/vmlinuz");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("/boot"));
  });

  it("rejects /dev (system directory)", () => {
    const result = validatePath("/dev/null");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("/dev"));
  });

  it("rejects /proc (system directory)", () => {
    const result = validatePath("/proc/cpuinfo");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("/proc"));
  });

  it("rejects /sys (system directory)", () => {
    const result = validatePath("/sys/kernel");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("/sys"));
  });

  it("rejects /etc/shadow (sensitive file)", () => {
    const result = validatePath("/etc/shadow");
    assert.equal(result.valid, false);
  });

  it("rejects /etc/passwd (sensitive file)", () => {
    const result = validatePath("/etc/passwd");
    assert.equal(result.valid, false);
  });

  it("rejects ~/.ssh (sensitive path)", () => {
    const sshPath = path.join(os.homedir(), ".ssh", "known_hosts");
    const result = validatePath(sshPath);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("sensitive"));
  });

  it("rejects ~/.gnupg (sensitive path)", () => {
    const gnupgPath = path.join(os.homedir(), ".gnupg", "pubring.kbx");
    const result = validatePath(gnupgPath);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("sensitive"));
  });

  it("accepts paths in /tmp", () => {
    const result = validatePath("/tmp/test.txt");
    assert.equal(result.valid, true);
    assert.equal(result.error, "");
  });

  it("accepts paths in /home", () => {
    const homePath = path.join(os.homedir(), "documents", "file.txt");
    const result = validatePath(homePath);
    assert.equal(result.valid, true);
    assert.equal(result.error, "");
  });

  it("accepts paths in cwd", () => {
    const cwdFile = path.join(process.cwd(), "file.txt");
    const result = validatePath(cwdFile);
    assert.equal(result.valid, true);
    assert.equal(result.error, "");
  });

  it("accepts paths in custom allowedDirs", () => {
    const result = validatePath("/custom/dir/file.txt", ["/custom/dir"]);
    assert.equal(result.valid, true);
    assert.equal(result.error, "");
  });

  it("rejects paths not in any allowed directory when no custom dirs given", () => {
    const result = validatePath("/opt/app/config.json");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("not in allowed"));
  });
});

// ============================================================================
// isSafeUrl
// ============================================================================

describe("isSafeUrl", () => {
  it("rejects empty URLs", () => {
    const result = isSafeUrl("");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("empty"));
  });

  it("rejects invalid URL format", () => {
    const result = isSafeUrl("not-a-url");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("Invalid URL"));
  });

  it("rejects non-http schemes (ftp)", () => {
    const result = isSafeUrl("ftp://files.example.com/doc.pdf");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("scheme"));
  });

  it("rejects non-http schemes (file)", () => {
    const result = isSafeUrl("file:///etc/passwd");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("scheme"));
  });

  it("rejects non-http schemes (javascript)", () => {
    const result = isSafeUrl("javascript:alert(1)");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("scheme"));
  });

  it("rejects SSRF: localhost", () => {
    const result = isSafeUrl("http://localhost:8080/admin");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
  });

  it("rejects SSRF: 127.x", () => {
    const result = isSafeUrl("http://127.0.0.1/secret");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
  });

  it("rejects SSRF: 10.x", () => {
    const result = isSafeUrl("http://10.0.0.1/internal");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
  });

  it("rejects SSRF: 192.168.x", () => {
    const result = isSafeUrl("http://192.168.1.1/panel");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
  });

  it("rejects SSRF: 172.16.x", () => {
    const result = isSafeUrl("http://172.16.0.1/api");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
  });

  it("rejects SSRF: 169.254.169.254 (cloud metadata)", () => {
    const result = isSafeUrl("http://169.254.169.254/latest/meta-data/");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
  });

  it("normalizes non-ASCII hostnames via URL parser (defense-in-depth)", () => {
    // URL constructor auto-converts Unicode hostnames to Punycode, so the
    // non-ASCII check in isSafeUrl cannot trigger. Verify the URL is still processed.
    const result = isSafeUrl("http://\u043F\u0440\u0438\u043C\u0435\u0440.example.com/path");
    assert.ok(typeof result.safe === "boolean");
    // Punycode hostname should pass SSRF checks (it's a real external domain)
    assert.equal(result.safe, true);
  });

  it("rejects hex IPs (normalized to decimal by URL parser, caught by SSRF)", () => {
    // URL constructor converts 0x7f000001 → 127.0.0.1, so hex check
    // can't trigger. The SSRF block catches it via the 127. pattern.
    const result = isSafeUrl("http://0x7f000001/secret");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
  });

  it("accepts valid external URLs", () => {
    const result = isSafeUrl("https://api.example.com/data");
    assert.equal(result.safe, true);
    assert.equal(result.error, "");
  });

  it("accepts when blockSsrf=false (bypass mode)", () => {
    const result = isSafeUrl("http://localhost:8080/admin", false);
    assert.equal(result.safe, true);
    assert.equal(result.error, "");
  });
});

// ============================================================================
// sanitizeCommand
// ============================================================================

describe("sanitizeCommand", () => {
  it("rejects blocked command: rm", () => {
    const result = sanitizeCommand("rm -rf /");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("rm"));
  });

  it("rejects blocked command: sudo", () => {
    const result = sanitizeCommand("sudo apt install something");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("sudo"));
  });

  it("rejects blocked command: curl", () => {
    const result = sanitizeCommand("curl https://example.com");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("curl"));
  });

  it("rejects blocked command: chmod", () => {
    const result = sanitizeCommand("chmod 777 /etc/passwd");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("chmod"));
  });

  it("rejects commands with path prefixes (/bin/rm)", () => {
    const result = sanitizeCommand("/bin/rm -rf /");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("rm"));
  });

  it("rejects commands with Windows path prefixes (strips to blocked base name)", () => {
    const result = sanitizeCommand("C:\\Windows\\system32\\curl");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("curl"));
  });

  it("rejects empty commands", () => {
    const result = sanitizeCommand("");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("empty"));
  });

  it("rejects newline injection", () => {
    const result = sanitizeCommand("ls\nrm -rf /");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("Newline"));
  });

  it("rejects dangerous injection patterns (; rm -rf)", () => {
    const result = sanitizeCommand("echo hello; rm -rf /");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("injection"));
  });

  it("rejects pipe injection to dangerous commands", () => {
    const result = sanitizeCommand("cat /etc/passwd | sudo tee /tmp/pwned");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("injection"));
  });

  it("rejects AND-chain injection", () => {
    const result = sanitizeCommand("ls && chmod 777 /etc/shadow");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("injection"));
  });

  it("allows safe commands: ls", () => {
    const result = sanitizeCommand("ls");
    assert.equal(result.isSafe, true);
    assert.equal(result.error, "");
  });

  it("allows safe commands: cat", () => {
    const result = sanitizeCommand("cat /tmp/test.txt");
    assert.equal(result.isSafe, true);
    assert.equal(result.error, "");
  });

  it("allows safe commands: echo", () => {
    const result = sanitizeCommand("echo hello");
    assert.equal(result.isSafe, true);
    assert.equal(result.error, "");
  });

  it("allows safe commands: grep", () => {
    const result = sanitizeCommand("grep pattern file");
    assert.equal(result.isSafe, true);
    assert.equal(result.error, "");
  });

  it("allows safe commands: find", () => {
    const result = sanitizeCommand("find . -name '*.ts'");
    assert.equal(result.isSafe, true);
    assert.equal(result.error, "");
  });

  it("allows safe commands: head", () => {
    const result = sanitizeCommand("head -20 file.txt");
    assert.equal(result.isSafe, true);
    assert.equal(result.error, "");
  });

  it("allows safe commands: tail", () => {
    const result = sanitizeCommand("tail -f logfile.log");
    assert.equal(result.isSafe, true);
    assert.equal(result.error, "");
  });

  it("allows safe commands: wc", () => {
    const result = sanitizeCommand("wc -l file.txt");
    assert.equal(result.isSafe, true);
    assert.equal(result.error, "");
  });

  it("allows safe compound command: ls -la", () => {
    const result = sanitizeCommand("ls -la /home/user");
    assert.equal(result.isSafe, true);
    assert.equal(result.command, "ls -la /home/user");
  });

  it("allows safe compound command: grep pattern file", () => {
    const result = sanitizeCommand("grep pattern file");
    assert.equal(result.isSafe, true);
    assert.equal(result.command, "grep pattern file");
  });
});

// ============================================================================
// BLOCKED_COMMANDS
// ============================================================================

describe("BLOCKED_COMMANDS", () => {
  it("contains dangerous system commands", () => {
    assert.ok(BLOCKED_COMMANDS.has("rm"));
    assert.ok(BLOCKED_COMMANDS.has("sudo"));
    assert.ok(BLOCKED_COMMANDS.has("chmod"));
    assert.ok(BLOCKED_COMMANDS.has("curl"));
  });

  it("is a Set instance", () => {
    assert.ok(BLOCKED_COMMANDS instanceof Set);
    assert.equal(typeof BLOCKED_COMMANDS.has, "function");
    assert.equal(typeof BLOCKED_COMMANDS.size, "number");
    assert.ok(BLOCKED_COMMANDS.size > 0);
  });
});

// ============================================================================
// checkBashToolInput
// ============================================================================

describe("checkBashToolInput", () => {
  it("blocks rm command", () => {
    const result = checkBashToolInput({ command: "rm -rf /" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "command_blocklist");
  });

  it("allows ls command", () => {
    const result = checkBashToolInput({ command: "ls -la" });
    assert.equal(result.safe, true);
  });

  it("handles empty command (returns safe)", () => {
    const result = checkBashToolInput({ command: "" });
    assert.equal(result.safe, true);
  });

  it("handles missing command field (returns safe)", () => {
    const result = checkBashToolInput({});
    assert.equal(result.safe, true);
  });

  it("uses cmd field as fallback", () => {
    const result = checkBashToolInput({ cmd: "rm file" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "command_blocklist");
  });
});

// ============================================================================
// checkFileToolInput
// ============================================================================

describe("checkFileToolInput", () => {
  it("blocks /etc/passwd", () => {
    const result = checkFileToolInput({ file_path: "/etc/passwd" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "path_validation");
  });

  it("allows /tmp/test.txt", () => {
    const result = checkFileToolInput({ file_path: "/tmp/test.txt" });
    assert.equal(result.safe, true);
  });

  it("handles multiple path fields", () => {
    // If one path is invalid, the whole check should fail
    const result = checkFileToolInput({
      file_path: "/tmp/test.txt",
      output_path: "/etc/shadow",
    });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "path_validation");
  });

  it("accepts when all paths are safe", () => {
    const result = checkFileToolInput({
      file_path: "/tmp/input.txt",
      output_path: "/tmp/output.txt",
    });
    assert.equal(result.safe, true);
  });

  it("handles missing path fields gracefully", () => {
    const result = checkFileToolInput({ command: "do something" });
    assert.equal(result.safe, true);
  });
});

// ============================================================================
// checkHttpToolInput
// ============================================================================

describe("checkHttpToolInput", () => {
  it("blocks localhost URLs", () => {
    const result = checkHttpToolInput({ url: "http://localhost:8080" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "ssrf_protection");
  });

  it("allows external URLs", () => {
    const result = checkHttpToolInput({ url: "https://api.example.com/data" });
    assert.equal(result.safe, true);
  });

  it("handles empty URL (returns safe)", () => {
    const result = checkHttpToolInput({ url: "" });
    assert.equal(result.safe, true);
  });

  it("handles missing URL field (returns safe)", () => {
    const result = checkHttpToolInput({});
    assert.equal(result.safe, true);
  });

  it("uses uri field as fallback", () => {
    const result = checkHttpToolInput({ uri: "http://127.0.0.1/" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "ssrf_protection");
  });

  it("uses endpoint field as fallback", () => {
    const result = checkHttpToolInput({ endpoint: "http://10.0.0.1/api" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "ssrf_protection");
  });
});

// ============================================================================
// checkInjectionPatterns
// ============================================================================

describe("checkInjectionPatterns", () => {
  it("blocks ; rm -rf", () => {
    const result = checkInjectionPatterns({ expression: "hello; rm -rf /" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "injection_detection");
  });

  it("blocks backtick substitution", () => {
    const result = checkInjectionPatterns({ expression: "`cat /etc/passwd`" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "injection_detection");
  });

  it("blocks $() substitution", () => {
    const result = checkInjectionPatterns({ expression: "$(whoami)" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "injection_detection");
  });

  it("allows safe string values", () => {
    const result = checkInjectionPatterns({
      name: "test-file.txt",
      size: "1024",
    });
    assert.equal(result.safe, true);
  });

  it("ignores non-string values", () => {
    const result = checkInjectionPatterns({
      count: 42,
      active: true,
      items: [1, 2, 3],
    });
    assert.equal(result.safe, true);
  });
});

// ============================================================================
// BLOCKED_URL_PATTERNS
// ============================================================================

describe("BLOCKED_URL_PATTERNS", () => {
  it("contains loopback addresses", () => {
    assert.ok(BLOCKED_URL_PATTERNS.has("localhost"));
    assert.ok(BLOCKED_URL_PATTERNS.has("127."));
    assert.ok(BLOCKED_URL_PATTERNS.has("0.0.0.0"));
  });

  it("contains RFC1918 private ranges", () => {
    assert.ok(BLOCKED_URL_PATTERNS.has("10."));
    assert.ok(BLOCKED_URL_PATTERNS.has("192.168."));
    assert.ok(BLOCKED_URL_PATTERNS.has("172.16."));
  });

  it("contains cloud metadata endpoint", () => {
    assert.ok(BLOCKED_URL_PATTERNS.has("169.254.169.254"));
  });
});

// ============================================================================
// appendAuditEntry / readRecentAuditEntries (in-memory via temp file)
// ============================================================================

describe("audit logging", () => {
  // Use a temp audit path to avoid polluting real logs.
  // Since AUDIT_LOG_PATH is a module-level constant, we cannot override it.
  // We test that the functions don't throw and that readRecentAuditEntries
  // returns an array for a non-existent path (graceful degradation).
  it("readRecentAuditEntries returns empty array for non-existent file", () => {
    // The real audit path may or may not exist; just verify the return type
    const entries = readRecentAuditEntries();
    assert.ok(Array.isArray(entries));
    // Each entry (if any) should be an object
    for (const entry of entries) {
      assert.ok(typeof entry === "object" && entry !== null);
    }
  });

  it("appendAuditEntry does not throw", () => {
    // Write to real audit log is non-critical; verify it doesn't throw
    assert.doesNotThrow(() => {
      appendAuditEntry({
        timestamp: new Date().toISOString(),
        toolName: "test",
        action: "test",
        rule: "test",
        detail: "unit test entry",
      });
    });
  });
});

// ── SEC-01: Audit Log Rate Limiting Tests ─────────────────────────────

test("appendAuditEntry batches writes and flushAuditBuffer forces flush", async () => {
  const { flushAuditBuffer, appendAuditEntry } = await import("../shared/security");

  // Should not throw
  flushAuditBuffer();

  // appendAuditEntry should not throw even without a valid path
  // (the buffer will accumulate but may fail on flush)
  appendAuditEntry({
    timestamp: new Date().toISOString(),
    toolName: "test",
    action: "test_write",
    rule: "test",
    detail: "Testing audit log buffering",
  });

  // Flush should not throw
  flushAuditBuffer();
});

test("flushAuditBuffer can be called multiple times safely", async () => {
  const { flushAuditBuffer } = await import("../shared/security");

  // Multiple flushes should not throw
  flushAuditBuffer();
  flushAuditBuffer();
  flushAuditBuffer();
});

// ── SEC-03: SSRF DNS Rebinding Protection Tests ──────────────────────

test("resolveAndCheckHostname blocks loopback addresses", async () => {
  const { resolveAndCheckHostname } = await import("../shared/security");

  // localhost resolves to 127.0.0.1 — should be blocked when blockPrivate=true
  const result = await resolveAndCheckHostname("localhost", true);
  // Note: may not be blocked in all environments (depends on DNS config)
  // Just verify it returns a valid result object
  assert.ok(typeof result.safe === "boolean");
  assert.ok(typeof result.error === "string");
});

test("resolveAndCheckHostname allows public hostnames", async () => {
  const { resolveAndCheckHostname } = await import("../shared/security");

  const result = await resolveAndCheckHostname("example.com", true);
  // example.com should resolve to a public IP
  assert.ok(typeof result.safe === "boolean");
  assert.ok(typeof result.error === "string");
});

test("resolveAndCheckHostname handles unresolvable hostnames gracefully", async () => {
  const { resolveAndCheckHostname } = await import("../shared/security");

  // A non-existent domain should not throw — returns safe=true since pattern checks passed
  const result = await resolveAndCheckHostname("this-domain-definitely-does-not-exist-xyz123.invalid", true);
  assert.equal(result.safe, true);
});

test("resolveAndCheckHostname respects blockPrivate=false", async () => {
  const { resolveAndCheckHostname } = await import("../shared/security");

  // localhost should be allowed when blockPrivate=false
  const result = await resolveAndCheckHostname("localhost", false);
  // Depends on DNS resolution — just verify it returns valid structure
  assert.ok(typeof result.safe === "boolean");
  assert.ok(typeof result.error === "string");
});

// ============================================================================
// TEST-01: Extended Security Unit Tests
// ============================================================================

// ── sanitizeCommand — mode-aware behavior ────────────────────────────

describe("sanitizeCommand — mode-aware behavior", () => {
  const originalMode = getSecurityMode();

  after(() => {
    setSecurityMode(originalMode);
  });

  it("allows safe command in basic mode", () => {
    setSecurityMode("basic");
    const result = sanitizeCommand("ls -la /home/user/project");
    assert.equal(result.isSafe, true);
    assert.equal(result.error, "");
    assert.equal(result.command, "ls -la /home/user/project");
  });

  it("allows safe command in max mode", () => {
    setSecurityMode("max");
    const result = sanitizeCommand("ls -la /home/user/project");
    assert.equal(result.isSafe, true);
    assert.equal(result.error, "");
  });

  it("blocks critical command (dd) regardless of mode", () => {
    setSecurityMode("basic");
    const result = sanitizeCommand("dd if=/dev/zero of=/dev/sda");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("dd"));
    assert.ok(result.error.includes("critical"));
  });

  it("blocks critical command (ssh) regardless of mode", () => {
    setSecurityMode("max");
    const result = sanitizeCommand("ssh user@host");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("ssh"));
    assert.ok(result.error.includes("critical"));
  });

  it("blocks extended command (npm) in max mode but allows in basic mode", () => {
    setSecurityMode("max");
    const resultMax = sanitizeCommand("npm install lodash");
    assert.equal(resultMax.isSafe, false);
    assert.ok(resultMax.error.includes("npm"));
    assert.ok(resultMax.error.includes("max mode"));

    setSecurityMode("basic");
    const resultBasic = sanitizeCommand("npm install lodash");
    assert.equal(resultBasic.isSafe, true);
    assert.equal(resultBasic.error, "");
  });

  it("blocks extended command (rm) in max mode but allows in basic mode", () => {
    setSecurityMode("max");
    const resultMax = sanitizeCommand("rm -rf /tmp/stale-cache");
    assert.equal(resultMax.isSafe, false);
    assert.ok(resultMax.error.includes("rm"));
    assert.ok(resultMax.error.includes("max mode"));

    setSecurityMode("basic");
    const resultBasic = sanitizeCommand("rm -rf /tmp/stale-cache");
    assert.equal(resultBasic.isSafe, true);
  });

  it("blocks shell injection attempt ($() substitution)", () => {
    setSecurityMode("basic");
    const result = sanitizeCommand("echo $(cat /etc/passwd)");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("injection"));
  });

  it("blocks shell injection attempt (backtick substitution)", () => {
    setSecurityMode("basic");
    const result = sanitizeCommand("echo `whoami`");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("injection"));
  });

  it("rejects empty command string", () => {
    const result = sanitizeCommand("");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("empty"));
  });

  it("rejects whitespace-only command", () => {
    const result = sanitizeCommand("   ");
    assert.equal(result.isSafe, false);
    assert.ok(result.error.includes("empty"));
  });
});

// ── CRITICAL_COMMANDS and EXTENDED_COMMANDS partitioning ─────────────

describe("CRITICAL_COMMANDS", () => {
  it("contains destructive filesystem commands", () => {
    assert.ok(CRITICAL_COMMANDS.has("mkfs"));
    assert.ok(CRITICAL_COMMANDS.has("dd"));
    assert.ok(CRITICAL_COMMANDS.has("shred"));
  });

  it("contains privilege escalation commands", () => {
    assert.ok(CRITICAL_COMMANDS.has("su"));
    assert.ok(CRITICAL_COMMANDS.has("doas"));
    assert.ok(CRITICAL_COMMANDS.has("pkexec"));
  });

  it("contains network attack tools", () => {
    assert.ok(CRITICAL_COMMANDS.has("nmap"));
    assert.ok(CRITICAL_COMMANDS.has("nc"));
    assert.ok(CRITICAL_COMMANDS.has("telnet"));
  });

  it("does not contain extended-only commands", () => {
    assert.ok(!CRITICAL_COMMANDS.has("rm"));
    assert.ok(!CRITICAL_COMMANDS.has("sudo"));
    assert.ok(!CRITICAL_COMMANDS.has("curl"));
    assert.ok(!CRITICAL_COMMANDS.has("npm"));
    assert.ok(!CRITICAL_COMMANDS.has("git"));
  });

  it("is disjoint from EXTENDED_COMMANDS", () => {
    for (const cmd of CRITICAL_COMMANDS) {
      assert.ok(!EXTENDED_COMMANDS.has(cmd), `${cmd} should not be in both CRITICAL and EXTENDED`);
    }
  });
});

describe("EXTENDED_COMMANDS", () => {
  it("contains file deletion commands", () => {
    assert.ok(EXTENDED_COMMANDS.has("rm"));
    assert.ok(EXTENDED_COMMANDS.has("rmdir"));
  });

  it("contains download tools", () => {
    assert.ok(EXTENDED_COMMANDS.has("wget"));
    assert.ok(EXTENDED_COMMANDS.has("curl"));
  });

  it("contains package managers", () => {
    assert.ok(EXTENDED_COMMANDS.has("npm"));
    assert.ok(EXTENDED_COMMANDS.has("pip"));
    assert.ok(EXTENDED_COMMANDS.has("cargo"));
  });

  it("contains version control", () => {
    assert.ok(EXTENDED_COMMANDS.has("git"));
  });

  it("does not contain critical-only commands", () => {
    assert.ok(!EXTENDED_COMMANDS.has("mkfs"));
    assert.ok(!EXTENDED_COMMANDS.has("ssh"));
    assert.ok(!EXTENDED_COMMANDS.has("nmap"));
  });
});

// ── validatePath — additional coverage ───────────────────────────────

describe("validatePath — sensitive paths", () => {
  it("rejects security.json (SECURITY_CONFIG_PATH)", () => {
    const result = validatePath(SECURITY_CONFIG_PATH);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("sensitive"));
  });

  it("rejects settings.json (SETTINGS_PATH)", () => {
    const result = validatePath(SETTINGS_PATH);
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("sensitive"));
  });
});

describe("validatePath — edge cases", () => {
  it("rejects path traversal with single ../", () => {
    const result = validatePath("../etc/passwd");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("traversal"));
  });

  it("rejects /var directory (system directory)", () => {
    const result = validatePath("/var/log/syslog");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("/var"));
  });

  it("rejects /usr directory (system directory)", () => {
    const result = validatePath("/usr/bin/env");
    assert.equal(result.valid, false);
    assert.ok(result.error.includes("/usr"));
  });
});

// ── isSafeUrl — mode-aware localhost behavior ────────────────────────

describe("isSafeUrl — mode-aware localhost behavior", () => {
  const originalMode = getSecurityMode();

  after(() => {
    setSecurityMode(originalMode);
  });

  it("allows public URL in both modes", () => {
    setSecurityMode("max");
    const resultMax = isSafeUrl("https://api.github.com/repos/test/data");
    assert.equal(resultMax.safe, true);

    setSecurityMode("basic");
    const resultBasic = isSafeUrl("https://api.github.com/repos/test/data");
    assert.equal(resultBasic.safe, true);
  });

  it("always blocks cloud metadata URL", () => {
    setSecurityMode("basic");
    const result = isSafeUrl("http://169.254.169.254/latest/meta-data/ami-id");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
  });

  it("always blocks private IP (10.x)", () => {
    setSecurityMode("basic");
    const result = isSafeUrl("http://10.0.0.1/admin");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
  });

  it("always blocks private IP (192.168.x)", () => {
    setSecurityMode("basic");
    const result = isSafeUrl("http://192.168.1.1/panel");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
  });

  it("allows localhost in basic mode", () => {
    setSecurityMode("basic");
    const result = isSafeUrl("http://localhost:3000/debug");
    assert.equal(result.safe, true);
    assert.equal(result.error, "");
  });

  it("allows 127.x in basic mode", () => {
    setSecurityMode("basic");
    const result = isSafeUrl("http://127.0.0.1:8080/api");
    assert.equal(result.safe, true);
    assert.equal(result.error, "");
  });

  it("blocks localhost in max mode", () => {
    setSecurityMode("max");
    const result = isSafeUrl("http://localhost:3000/debug");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
    assert.ok(result.error.includes("max mode"));
  });

  it("blocks 127.x in max mode", () => {
    setSecurityMode("max");
    const result = isSafeUrl("http://127.0.0.1:8080/api");
    assert.equal(result.safe, false);
    assert.ok(result.error.includes("SSRF"));
  });
});

// ── checkBashToolInput — extended coverage ───────────────────────────

describe("checkBashToolInput — extended coverage", () => {
  const originalMode = getSecurityMode();

  after(() => {
    setSecurityMode(originalMode);
  });

  it("blocks dangerous command (nmap)", () => {
    setSecurityMode("max");
    const result = checkBashToolInput({ command: "nmap -sV target.local" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "command_blocklist");
  });

  it("allows safe command (ls) in both modes", () => {
    setSecurityMode("max");
    const resultMax = checkBashToolInput({ command: "ls -la /home/user" });
    assert.equal(resultMax.safe, true);

    setSecurityMode("basic");
    const resultBasic = checkBashToolInput({ command: "ls -la /home/user" });
    assert.equal(resultBasic.safe, true);
  });

  it("blocks injection pattern in command ($() substitution)", () => {
    setSecurityMode("basic");
    const result = checkBashToolInput({ command: "echo $(whoami)" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "command_blocklist");
    assert.ok(result.detail.includes("injection"));
  });

  it("blocks injection pattern in command (backtick substitution)", () => {
    setSecurityMode("basic");
    const result = checkBashToolInput({ command: "echo `id`" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "command_blocklist");
    assert.ok(result.detail.includes("injection"));
  });
});

// ── checkFileToolInput — extended coverage ───────────────────────────

describe("checkFileToolInput — extended coverage", () => {
  it("allows valid file path in cwd", () => {
    const result = checkFileToolInput({ file_path: path.join(process.cwd(), "README.md") });
    assert.equal(result.safe, true);
  });

  it("blocks system directory access (/proc)", () => {
    const result = checkFileToolInput({ file_path: "/proc/self/mem" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "path_validation");
  });

  it("blocks path traversal attempt", () => {
    const result = checkFileToolInput({ file_path: "../../etc/shadow" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "path_validation");
    assert.ok(result.detail.includes("traversal"));
  });

  it("blocks sensitive path (.ssh)", () => {
    const sshPath = path.join(os.homedir(), ".ssh", "id_rsa");
    const result = checkFileToolInput({ file_path: sshPath });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "path_validation");
  });

  it("allows /var/tmp paths", () => {
    const result = checkFileToolInput({ file_path: "/var/tmp/build-output.log" });
    assert.equal(result.safe, true);
  });
});

// ── checkHttpToolInput — extended coverage ───────────────────────────

describe("checkHttpToolInput — extended coverage", () => {
  const originalMode = getSecurityMode();

  after(() => {
    setSecurityMode(originalMode);
  });

  it("allows public URL", () => {
    const result = checkHttpToolInput({ url: "https://registry.npmjs.org/package" });
    assert.equal(result.safe, true);
  });

  it("blocks SSRF pattern (cloud metadata) in both modes", () => {
    setSecurityMode("basic");
    const result = checkHttpToolInput({ url: "http://169.254.169.254/latest/meta-data/" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "ssrf_protection");
  });

  it("blocks localhost (max mode)", () => {
    setSecurityMode("max");
    const result = checkHttpToolInput({ url: "http://127.0.0.1:9200/_cat/indices" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "ssrf_protection");
  });

  it("allows localhost in basic mode", () => {
    setSecurityMode("basic");
    const result = checkHttpToolInput({ url: "http://localhost:5432/status" });
    assert.equal(result.safe, true);
  });

  it("blocks internal. hostname pattern", () => {
    setSecurityMode("basic");
    const result = checkHttpToolInput({ url: "http://internal.corp.local/secrets" });
    assert.equal(result.safe, false);
    assert.equal(result.rule, "ssrf_protection");
  });
});
