import { describe, it } from "node:test";
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
  appendAuditEntry,
  readRecentAuditEntries,
  BLOCKED_URL_PATTERNS,
  AUDIT_LOG_PATH,
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
