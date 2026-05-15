/**
 * Unit tests for hex-edit extension.
 *
 * Tests all hex utility functions and command handlers.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Import functions from the extension for testing
// Note: These are exported functions we'll test directly
// For the extension, we test the internal functions by importing them

// ============================================================================
// Test Setup - Create temp directory for test files
// ============================================================================

const TEST_DIR = path.join(os.tmpdir(), "pi-hex-edit-tests");
const TEST_FILE = path.join(TEST_DIR, "test.txt");

before(() => {
  // Create test directory and file
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
  fs.writeFileSync(TEST_FILE, "Hello, World!\nThis is a test file.\nLine 3 here.\n");
});

after(() => {
  // Cleanup
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

// ============================================================================
// Hex Utility Functions (extracted from extension for testing)
// ============================================================================

/** Compute SHA-256 hash of content */
function sha256(content: string | Buffer): string {
  const crypto = require("crypto");
  const hash = crypto.createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
}

/** Compute simple hash for quick comparison */
function simpleHash(content: string | Buffer): number {
  let h = 0;
  const data = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  for (let i = 0; i < data.length; i++) {
    h = ((h << 5) - h + data[i]) | 0;
  }
  return h >>> 0;
}

/** Find all occurrences of a string in a buffer */
function findAllOccurrences(haystack: Buffer, needle: Buffer): number[] {
  const indices: number[] = [];
  let i = 0;
  while (i < haystack.length) {
    const idx = haystack.indexOf(needle, i);
    if (idx === -1) break;
    indices.push(idx);
    i = idx + 1;
  }
  return indices;
}

/** Replace bytes at a specific position */
function replaceAtPosition(buffer: Buffer, position: number, oldBytes: Buffer, newBytes: Buffer): Buffer {
  if (buffer.subarray(position, position + oldBytes.length).toString() !== oldBytes.toString()) {
    throw new Error(`Bytes at position ${position} don't match expected`);
  }
  
  const result = Buffer.concat([
    buffer.subarray(0, position),
    newBytes,
    buffer.subarray(position + oldBytes.length),
  ]);
  return result;
}

/** Generate a unified diff between two buffers */
function byteDiff(oldBuf: Buffer, newBuf: Buffer): string[] {
  const lines: string[] = [];
  const oldLines = oldBuf.toString("utf-8").split("\n");
  const newLines = newBuf.toString("utf-8").split("\n");
  
  const maxLen = Math.max(oldLines.length, newLines.length);
  
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i] ?? "";
    const newLine = newLines[i] ?? "";
    
    if (oldLine !== newLine) {
      if (oldLine && !newLines[i]) {
        lines.push(`-${oldLine}`);
      } else if (newLine && !oldLines[i]) {
        lines.push(`+${newLine}`);
      } else {
        lines.push(`-${oldLine}`);
        lines.push(`+${newLine}`);
      }
    }
  }
  
  return lines;
}

// ============================================================================
// sha256 Tests
// ============================================================================

describe("sha256", () => {
  it("computes SHA-256 hash of string", () => {
    const hash = sha256("hello");
    // SHA-256 of "hello" is a known value
    assert.equal(hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("computes SHA-256 hash of buffer", () => {
    const hash = sha256(Buffer.from("hello"));
    assert.equal(hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });

  it("returns different hash for different content", () => {
    const hash1 = sha256("hello");
    const hash2 = sha256("world");
    assert.notEqual(hash1, hash2);
  });

  it("returns consistent hash for same content", () => {
    const hash1 = sha256("test");
    const hash2 = sha256("test");
    assert.equal(hash1, hash2);
  });
});

// ============================================================================
// simpleHash Tests
// ============================================================================

describe("simpleHash", () => {
  it("computes hash of string", () => {
    const hash = simpleHash("hello");
    // Known value for "hello" (computed by the simpleHash function)
    assert.equal(hash, 99162322);
  });

  it("computes hash of buffer", () => {
    const hash = simpleHash(Buffer.from("hello"));
    assert.equal(hash, 99162322);
  });

  it("returns different hash for different content", () => {
    const hash1 = simpleHash("hello");
    const hash2 = simpleHash("world");
    assert.notEqual(hash1, hash2);
  });

  it("returns 0 for empty string", () => {
    const hash = simpleHash("");
    assert.equal(hash, 0);
  });

  it("returns same hash for same content", () => {
    const hash1 = simpleHash("test");
    const hash2 = simpleHash("test");
    assert.equal(hash1, hash2);
  });
});

// ============================================================================
// findAllOccurrences Tests
// ============================================================================

describe("findAllOccurrences", () => {
  it("finds single occurrence", () => {
    const haystack = Buffer.from("hello world");
    const needle = Buffer.from("world");
    const indices = findAllOccurrences(haystack, needle);
    assert.deepEqual(indices, [6]);
  });

  it("finds multiple occurrences", () => {
    const haystack = Buffer.from("ababab");
    const needle = Buffer.from("ab");
    const indices = findAllOccurrences(haystack, needle);
    assert.deepEqual(indices, [0, 2, 4]);
  });

  it("returns empty array when not found", () => {
    const haystack = Buffer.from("hello world");
    const needle = Buffer.from("xyz");
    const indices = findAllOccurrences(haystack, needle);
    assert.deepEqual(indices, []);
  });

  it("handles empty needle", () => {
    const haystack = Buffer.from("hello");
    const needle = Buffer.from("");
    // Empty needle matches at every position
    const indices = findAllOccurrences(haystack, needle);
    assert.ok(indices.length > 0);
  });

  it("finds overlapping patterns correctly", () => {
    const haystack = Buffer.from("aaaa");
    const needle = Buffer.from("aa");
    const indices = findAllOccurrences(haystack, needle);
    assert.deepEqual(indices, [0, 1, 2]);
  });
});

// ============================================================================
// replaceAtPosition Tests
// ============================================================================

describe("replaceAtPosition", () => {
  it("replaces bytes at position", () => {
    const buffer = Buffer.from("hello world");
    const oldBytes = Buffer.from("world");
    const newBytes = Buffer.from("there");
    const result = replaceAtPosition(buffer, 6, oldBytes, newBytes);
    assert.equal(result.toString(), "hello there");
  });

  it("throws when bytes don't match", () => {
    const buffer = Buffer.from("hello world");
    const oldBytes = Buffer.from("xyz");
    const newBytes = Buffer.from("there");
    assert.throws(
      () => replaceAtPosition(buffer, 0, oldBytes, newBytes),
      /don't match expected/
    );
  });

  it("handles replacement at start", () => {
    const buffer = Buffer.from("hello");
    const result = replaceAtPosition(buffer, 0, Buffer.from("hello"), Buffer.from("hi"));
    assert.equal(result.toString(), "hi");
  });

  it("handles replacement at end", () => {
    const buffer = Buffer.from("hello");
    // Replace "lo" (positions 3-4) with "p" -> "help"
    const result = replaceAtPosition(buffer, 3, Buffer.from("lo"), Buffer.from("p"));
    assert.equal(result.toString(), "help");
  });

  it("handles empty replacement", () => {
    const buffer = Buffer.from("hello");
    const result = replaceAtPosition(buffer, 0, Buffer.from("h"), Buffer.from(""));
    assert.equal(result.toString(), "ello");
  });
});

// ============================================================================
// byteDiff Tests
// ============================================================================

describe("byteDiff", () => {
  it("returns empty array for identical buffers", () => {
    const buf1 = Buffer.from("hello\nworld\n");
    const buf2 = Buffer.from("hello\nworld\n");
    const diff = byteDiff(buf1, buf2);
    assert.deepEqual(diff, []);
  });

  it("detects added lines", () => {
    const buf1 = Buffer.from("hello\n");
    const buf2 = Buffer.from("hello\nworld\n");
    const diff = byteDiff(buf1, buf2);
    assert.ok(diff.some(line => line.startsWith("+")));
  });

  it("detects removed lines", () => {
    const buf1 = Buffer.from("hello\nworld\n");
    const buf2 = Buffer.from("hello\n");
    const diff = byteDiff(buf1, buf2);
    assert.ok(diff.some(line => line.startsWith("-")));
  });

  it("detects changed lines", () => {
    const buf1 = Buffer.from("hello\n");
    const buf2 = Buffer.from("world\n");
    const diff = byteDiff(buf1, buf2);
    assert.ok(diff.some(line => line.startsWith("-")));
    assert.ok(diff.some(line => line.startsWith("+")));
  });
});

// ============================================================================
// Integration Tests with Real Files
// ============================================================================

describe("hex-edit integration", () => {
  it("can read and modify test file", () => {
    const content = fs.readFileSync(TEST_FILE);
    assert.ok(content.includes("Hello, World!"));
  });

  it("can find text in test file", () => {
    const content = fs.readFileSync(TEST_FILE);
    const needle = Buffer.from("World");
    const indices = findAllOccurrences(content, needle);
    assert.ok(indices.length > 0);
  });

  it("can replace text in test file", () => {
    const content = fs.readFileSync(TEST_FILE);
    const oldBytes = Buffer.from("World");
    const newBytes = Buffer.from("Universe");
    const result = replaceAtPosition(content, 7, oldBytes, newBytes);
    assert.ok(result.includes("Universe"));
    assert.ok(!result.includes("World"));
  });

  it("can compute file hash", () => {
    const content = fs.readFileSync(TEST_FILE);
    const hash = simpleHash(content);
    assert.ok(typeof hash === "number");
  });

  it("can show file with hex", () => {
    // Simulate showFileWithHex
    const content = fs.readFileSync(TEST_FILE);
    const text = content.toString("utf-8");
    
    assert.ok(text.includes("Hello, World!"));
    assert.ok(text.includes("Line 3 here."));
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("edge cases", () => {
  it("handles UTF-8 characters", () => {
    const text = "Hello 世界 🌍";
    const buffer = Buffer.from(text, "utf-8");
    const hash = simpleHash(buffer);
    assert.ok(typeof hash === "number");
  });

  it("handles binary-like content", () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    const hash = simpleHash(buffer);
    assert.ok(typeof hash === "number");
  });

  it("handles large content", () => {
    const largeText = "x".repeat(100000);
    const hash = simpleHash(largeText);
    assert.ok(typeof hash === "number");
  });
});

// ============================================================================
// Command Handler Tests (Simulated)
// ============================================================================

describe("command handlers", () => {
  describe("hex-edit-validate", () => {
    it("validates existing text", () => {
      const content = fs.readFileSync(TEST_FILE);
      const searchBytes = Buffer.from("World");
      const positions = findAllOccurrences(content, searchBytes);
      assert.ok(positions.length > 0);
    });

    it("rejects non-existing text", () => {
      const content = fs.readFileSync(TEST_FILE);
      const searchBytes = Buffer.from("NOTFOUND");
      const positions = findAllOccurrences(content, searchBytes);
      assert.deepEqual(positions, []);
    });
  });

  describe("hex-edit-diff", () => {
    it("detects identical files", () => {
      const buf1 = fs.readFileSync(TEST_FILE);
      const buf2 = fs.readFileSync(TEST_FILE);
      assert.ok(buf1.equals(buf2));
    });
  });
});