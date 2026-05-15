/**
 * Hex Edit Extension for Pi Coding Agent.
 *
 * A robust edit replacement that uses hex streams for comparison and validation.
 * Instead of text-based matching that can fail, this extension:
 *   - Computes hex hashes of file content
 *   - Uses byte-level diff for precise change detection
 *   - Validates edits by comparing expected vs actual bytes
 *
 * Commands:
 *   /hex-edit <file> <old> <new>     — Edit file using hex validation
 *   /hex-edit-show <file>           — Show file with line numbers and hex preview
 *   /hex-edit-validate <file> <old> — Validate that old text exists in file
 *   /hex-edit-diff <file1> <file2>  — Show byte-level diff between files
 *
 * Written by VTSTech — https://www.vts-tech.org
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { section, ok, info, fail, warn } from "../shared/format";

// ============================================================================
// Constants
// ============================================================================

const EXTENSION_VERSION = "1.0.0";

const branding = [
  `  ⚡ Pi Hex Edit v${EXTENSION_VERSION}`,
  `  Written by VTSTech`,
  `  GitHub: https://github.com/VTSTech`,
  `  Website: www.vts-tech.org`,
].join("\n");

// ============================================================================
// Hex Utilities
// ============================================================================

/** Compute SHA-256 hash of content */
function sha256(content: string | Buffer): string {
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
  
  // Simple line-based diff
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

/** Show file with line numbers and hex preview */
function showFileWithHex(filePath: string): string[] {
  const content = fs.readFileSync(filePath);
  const lines: string[] = [];
  const text = content.toString("utf-8");
  const textLines = text.split("\n");
  
  lines.push(`File: ${filePath}`);
  lines.push(`Size: ${content.length} bytes`);
  lines.push(`SHA-256: ${sha256(content)}`);
  lines.push(`Hash: ${simpleHash(content)}`);
  lines.push("");
  lines.push("Line #  | Text (first 60 chars)                           | Hex (first 16 bytes)");
  lines.push("--------|--------------------------------------------------|----------------");
  
  textLines.forEach((line, i) => {
    const preview = line.length > 60 ? line.slice(0, 60) + "..." : line;
    const lineBuf = Buffer.from(line.slice(0, 16), "utf-8");
    const hex = lineBuf.toString("hex").match(/.{1,32}/g)?.join(" ") || "";
    lines.push(`${String(i + 1).padStart(7)} | ${preview.padEnd(50)} | ${hex}`);
  });
  
  return lines;
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  pi.registerCommand("hex-edit", {
    description: "Edit file using hex stream validation for reliability",
    handler: async (args, ctx) => {
      const parts = args.trim().split(" ");
      
      if (parts.length < 3) {
        ctx.ui.notify("Usage: /hex-edit <file> <old-text> <new-text>", "error");
        return;
      }
      
      const filePath = path.resolve(parts[0]);
      const oldText = parts[1];
      const newText = parts.slice(2).join(" ");
      
      if (!fs.existsSync(filePath)) {
        ctx.ui.notify(`File not found: ${filePath}`, "error");
        return;
      }
      
      try {
        // Read file as buffer for byte-level operations
        const originalContent = fs.readFileSync(filePath);
        const oldBytes = Buffer.from(oldText, "utf-8");
        const newBytes = Buffer.from(newText, "utf-8");
        
        // Find all occurrences of old text
        const positions = findAllOccurrences(originalContent, oldBytes);
        
        if (positions.length === 0) {
          ctx.ui.notify(`Old text not found in file`, "error");
          return;
        }
        
        if (positions.length > 1) {
          ctx.ui.notify(`${positions.length} occurrences found. Using first at position ${positions[0]}`, "warn");
        }
        
        // Perform the replacement at the first occurrence
        const newContent = replaceAtPosition(originalContent, positions[0], oldBytes, newBytes);
        
        // Write back
        fs.writeFileSync(filePath, newContent);
        
        const lines = [
          branding,
          section("HEX EDIT COMPLETE"),
          ok(`File: ${filePath}`),
          info(`Old size: ${originalContent.length} bytes`),
          info(`New size: ${newContent.length} bytes`),
          info(`Change: ${newContent.length - originalContent.length > 0 ? "+" : ""}${newContent.length - originalContent.length} bytes`),
          "",
          info(`Old hash: ${simpleHash(originalContent)}`),
          info(`New hash: ${simpleHash(newContent)}`),
          "",
          warn("Run /reload to refresh the file in Pi's view"),
        ];
        
        pi.sendMessage({
          customType: "hex-edit-complete",
          content: lines.join("\n"),
          display: { type: "content", content: lines.join("\n") },
        });
        
        ctx.ui.notify(`Edited ${filePath} (${positions.length} occurrence(s) found)`, "success");
      } catch (e) {
        ctx.ui.notify(`Edit failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });

  pi.registerCommand("hex-edit-show", {
    description: "Show file with line numbers and hex preview",
    handler: async (args, ctx) => {
      if (!args.trim()) {
        ctx.ui.notify("Usage: /hex-edit-show <file>", "error");
        return;
      }
      
      const filePath = path.resolve(args.trim());
      
      if (!fs.existsSync(filePath)) {
        ctx.ui.notify(`File not found: ${filePath}`, "error");
        return;
      }
      
      try {
        const lines = [
          branding,
          section("FILE CONTENT"),
          ...showFileWithHex(filePath),
        ];
        
        pi.sendMessage({
          customType: "hex-edit-show",
          content: lines.join("\n"),
          display: { type: "content", content: lines.join("\n") },
        });
      } catch (e) {
        ctx.ui.notify(`Failed to read file: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });

  pi.registerCommand("hex-edit-validate", {
    description: "Validate that old text exists in file",
    handler: async (args, ctx) => {
      const parts = args.trim().split(" ");
      
      if (parts.length < 2) {
        ctx.ui.notify("Usage: /hex-edit-validate <file> <old-text>", "error");
        return;
      }
      
      const filePath = path.resolve(parts[0]);
      const searchText = parts.slice(1).join(" ");
      
      if (!fs.existsSync(filePath)) {
        ctx.ui.notify(`File not found: ${filePath}`, "error");
        return;
      }
      
      try {
        const content = fs.readFileSync(filePath);
        const searchBytes = Buffer.from(searchText, "utf-8");
        const positions = findAllOccurrences(content, searchBytes);
        
        const lines = [
          branding,
          section("VALIDATION RESULT"),
          info(`File: ${filePath}`),
          info(`Search: "${searchText}"`),
          "",
        ];
        
        if (positions.length === 0) {
          lines.push(fail("Text not found in file"));
        } else {
          lines.push(ok(`Found ${positions.length} occurrence(s)`));
          positions.forEach(pos => {
            const contextStart = Math.max(0, pos - 20);
            const contextEnd = Math.min(content.length, pos + searchText.length + 20);
            const context = content.subarray(contextStart, contextEnd).toString("utf-8");
            lines.push(info(`  Position ${pos}: ...${context}...`));
          });
        }
        
        pi.sendMessage({
          customType: "hex-edit-validate",
          content: lines.join("\n"),
          display: { type: "content", content: lines.join("\n") },
        });
      } catch (e) {
        ctx.ui.notify(`Validation failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });

  pi.registerCommand("hex-edit-diff", {
    description: "Show byte-level diff between two files",
    handler: async (args, ctx) => {
      const parts = args.trim().split(/\s+/);
      
      if (parts.length < 2) {
        ctx.ui.notify("Usage: /hex-edit-diff <file1> <file2>", "error");
        return;
      }
      
      const file1 = path.resolve(parts[0]);
      const file2 = path.resolve(parts[1]);
      
      if (!fs.existsSync(file1)) {
        ctx.ui.notify(`File not found: ${file1}`, "error");
        return;
      }
      if (!fs.existsSync(file2)) {
        ctx.ui.notify(`File not found: ${file2}`, "error");
        return;
      }
      
      try {
        const buf1 = fs.readFileSync(file1);
        const buf2 = fs.readFileSync(file2);
        
        const lines = [
          branding,
          section("BYTE DIFF"),
          info(`File 1: ${file1} (${buf1.length} bytes, hash: ${simpleHash(buf1)})`),
          info(`File 2: ${file2} (${buf2.length} bytes, hash: ${simpleHash(buf2)})`),
          "",
        ];
        
        if (buf1.equals(buf2)) {
          lines.push(ok("Files are identical"));
        } else {
          lines.push(info("Differences:"));
          lines.push("");
          lines.push(...byteDiff(buf1, buf2).slice(0, 50));
        }
        
        pi.sendMessage({
          customType: "hex-edit-diff",
          content: lines.join("\n"),
          display: { type: "content", content: lines.join("\n") },
        });
      } catch (e) {
        ctx.ui.notify(`Diff failed: ${e instanceof Error ? e.message : String(e)}`, "error");
      }
    },
  });
}