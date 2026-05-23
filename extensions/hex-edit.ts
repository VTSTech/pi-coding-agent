/**
 * Hex Edit Extension for Pi Coding Agent.
 *
 * A robust edit replacement that uses hex streams for comparison and validation.
 * Instead of text-based matching that can fail, this extension:
 *   - Computes hex hashes of file content
 *   - Uses byte-level diff for precise change detection
 *   - Validates edits by comparing expected vs actual bytes
 *
 * CONFIGURATION:
 *   Set OVERWRITE_BUILTIN_EDIT=true to register the "edit" tool and replace
 *   the builtin edit with hex-edit's byte-level validation.
 *   Default: false (registers hex_edit as a separate tool alongside builtin edit)
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
import * as path from "path";
import * as crypto from "node:crypto";
import { Type } from "typebox";

// ============================================================================
// Local Format Utilities (self-contained for portability)
// ============================================================================

function section(title: string): string {
  return `\n── ${title} ${"─".repeat(Math.max(1, 60 - title.length - 4))}`;
}

function ok(msg: string): string { return `  ✅ ${msg}`; }
function fail(msg: string): string { return `  ❌ ${msg}`; }
function warn(msg: string): string { return `  ⚠️  ${msg}`; }
function info(msg: string): string { return `  ℹ️  ${msg}`; }

// ============================================================================
// Configuration
// ============================================================================

/**
 * Set to true to register "edit" tool and replace the builtin edit with
 * hex-edit's byte-level validation. When false, both 'edit' and 'hex_edit'
 * tools are available.
 */
const OVERWRITE_BUILTIN_EDIT = true;

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

function bytesToHex(buffer: Buffer): string {
  return buffer.toString("hex").match(/.{1,2}/g)?.join(" ") || "";
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
// Core Edit Logic (Reusable)
// ============================================================================

/**
 * Perform a hex-level edit on a file.
 * Returns the result object for both tool and command usage.
 */
function performHexEdit(
  filePath: string,
  oldText: string,
  newText: string
): { success: boolean; result: string; details: Record<string, unknown> } {
  const resolvedPath = path.resolve(filePath);
  
  if (!fs.existsSync(resolvedPath)) {
    return {
      success: false,
      result: `Error: File not found: ${resolvedPath}`,
      details: { error: "File not found" },
    };
  }
  
  const originalContent = fs.readFileSync(resolvedPath);
  const oldBytes = Buffer.from(oldText, "utf-8");
  const newBytes = Buffer.from(newText, "utf-8");
  const positions = findAllOccurrences(originalContent, oldBytes);
  
  if (positions.length === 0) {
    return {
      success: false,
      result: `Error: Old text not found in file`,
      details: { error: "Text not found" },
    };
  }
  
  const newContent = replaceAtPosition(originalContent, positions[0], oldBytes, newBytes);
  fs.writeFileSync(resolvedPath, newContent);
  
  const changeSize = newContent.length - originalContent.length;
  
  let resultText = `Successfully edited ${resolvedPath}\n` +
                   `Old size: ${originalContent.length} bytes\n` +
                   `New size: ${newContent.length} bytes\n` +
                   `Change: ${changeSize > 0 ? "+" : ""}${changeSize} bytes\n` +
                   `Hash: ${simpleHash(newContent)}`;
  
  if (Math.abs(changeSize) < 32) {
    if (positions.length === 1) {
      const pos = positions[0];
      const start = Math.max(0, pos - 16);
      const end = Math.min(originalContent.length, pos + 16);
      const contextBytes = originalContent.subarray(start, end);
      resultText += `\n\nHex context around change:\n${bytesToHex(contextBytes)}`;
      resultText += `\n^ Change at position ${pos}`;
    } else {
      resultText += `\n\nChanged bytes:`;
      positions.forEach(pos => {
        const byte = originalContent[pos];
        resultText += `\n  Position ${pos}: 0x${byte.toString(16).padStart(2, '0')}`;
      });
    }
  }
  
  return {
    success: true,
    result: resultText,
    details: {
      file: resolvedPath,
      oldSize: originalContent.length,
      newSize: newContent.length,
      change: changeSize,
      hash: simpleHash(newContent),
      positions: positions.length,
    },
  };
}

// ============================================================================
// Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  // Register the edit tool with hex-level validation
  // When OVERWRITE_BUILTIN_EDIT is true, this replaces the builtin edit
  pi.registerTool({
    name: OVERWRITE_BUILTIN_EDIT ? "edit" : "hex_edit",
    label: "Edit",
    description: "Edit file using hex stream validation for reliable byte-level editing. " +
                 "Uses binary comparison instead of text matching for accurate edits.",
    parameters: Type.Object({
      path: Type.String({ description: "Path to the file to edit" }),
      oldText: Type.String({ description: "Exact text to replace" }),
      newText: Type.String({ description: "Replacement text" }),
    }),
    promptSnippet: "Edit files with hex validation for precise byte-level changes",
    promptGuidelines: ["Use edit tool when the user wants to modify file contents."],
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = performHexEdit(params.path, params.oldText, params.newText);
      
      return {
        content: [{ type: "text", text: result.result }],
        details: result.details,
        isError: !result.success,
      };
    },
  });
  
  // When NOT overwriting, also register hex_edit as a separate tool
  if (!OVERWRITE_BUILTIN_EDIT) {
    pi.registerTool({
      name: "hex_edit",
      label: "Hex Edit",
      description: "Edit file using hex stream validation for reliable byte-level editing",
      parameters: Type.Object({
        file: Type.String({ description: "Path to the file to edit" }),
        oldText: Type.String({ description: "Exact text to replace" }),
        newText: Type.String({ description: "Replacement text" }),
      }),
      async execute(toolCallId, params, signal, onUpdate, ctx) {
        const result = performHexEdit(params.file, params.oldText, params.newText);
        
        return {
          content: [{ type: "text", text: result.result }],
          details: result.details,
          isError: !result.success,
        };
      },
    });
  }
  
  // ========================================================================
  // Slash Commands
  // ========================================================================
  
  pi.registerCommand("hex-edit", {
    description: "Edit file using hex stream validation for reliability",
    handler: async (args, ctx) => {
      const parts = args.trim().split(" ");
      
      if (parts.length < 3) {
        ctx.ui.notify("Usage: /hex-edit <file> <old-text> <new-text>", "error");
        return;
      }
      
      const filePath = parts[0];
      const oldText = parts[1];
      const newText = parts.slice(2).join(" ");
      
      const result = performHexEdit(filePath, oldText, newText);
      
      if (result.success) {
        const lines = [
          branding,
          section("HEX EDIT COMPLETE"),
          ok(`File: ${path.resolve(filePath)}`),
          info(`Old size: ${result.details.oldSize} bytes`),
          info(`New size: ${result.details.newSize} bytes`),
          info(`Change: ${typeof result.details.change === 'number' && result.details.change > 0 ? "+" : ""}${result.details.change} bytes`),
          "",
          info(`Hash: ${result.details.hash}`),
        ];
        
        pi.sendMessage({
          customType: "hex-edit-complete",
          content: lines.join("\n"),
          display: { type: "content", content: lines.join("\n") },
        });
        
        ctx.ui.notify(`Edited ${filePath}`, "success");
      } else {
        ctx.ui.notify(result.result, "error");
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
    },
  });
  
  pi.registerTool({
    name: "hex_edit_show",
    label: "Hex Edit Show",
    description: "Show file content with line numbers and hex preview",
    parameters: Type.Object({
      file: Type.String({ description: "Path to the file to show" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        const filePath = path.resolve(params.file);
        
        if (!fs.existsSync(filePath)) {
          return {
            content: [{ type: "text", text: `Error: File not found: ${filePath}` }],
            details: { error: "File not found" },
            isError: true,
          };
        }
        
        const lines = [
          branding,
          section("FILE CONTENT"),
          ...showFileWithHex(filePath),
        ];
        
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: { file: filePath, size: fs.statSync(filePath).size },
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Failed to read file: ${e instanceof Error ? e.message : String(e)}` }],
          details: { error: e instanceof Error ? e.message : String(e) },
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "hex_edit_validate",
    label: "Hex Edit Validate",
    description: "Validate that old text exists in file and show positions",
    parameters: Type.Object({
      file: Type.String({ description: "Path to the file to validate" }),
      searchText: Type.String({ description: "Text to search for in the file" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        const filePath = path.resolve(params.file);
        
        if (!fs.existsSync(filePath)) {
          return {
            content: [{ type: "text", text: `Error: File not found: ${filePath}` }],
            details: { error: "File not found" },
            isError: true,
          };
        }
        
        const content = fs.readFileSync(filePath);
        const searchBytes = Buffer.from(params.searchText, "utf-8");
        const positions = findAllOccurrences(content, searchBytes);
        
        const resultLines = [
          branding,
          section("VALIDATION RESULT"),
          info(`File: ${filePath}`),
          info(`Search: "${params.searchText}"`),
          "",
        ];
        
        if (positions.length === 0) {
          resultLines.push(fail("Text not found in file"));
        } else {
          resultLines.push(ok(`Found ${positions.length} occurrence(s)`));
          positions.forEach(pos => {
            const contextStart = Math.max(0, pos - 20);
            const contextEnd = Math.min(content.length, pos + params.searchText.length + 20);
            const context = content.subarray(contextStart, contextEnd).toString("utf-8");
            resultLines.push(info(`  Position ${pos}: ...${context}...`));
          });
        }
        
        return {
          content: [{ type: "text", text: resultLines.join("\n") }],
          details: {
            file: filePath,
            search: params.searchText,
            positions: positions,
            found: positions.length > 0,
          },
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Validation failed: ${e instanceof Error ? e.message : String(e)}` }],
          details: { error: e instanceof Error ? e.message : String(e) },
          isError: true,
        };
      }
    },
  });
  
  pi.registerTool({
    name: "hex_edit_diff",
    label: "Hex Edit Diff",
    description: "Show byte-level diff between two files",
    parameters: Type.Object({
      file1: Type.String({ description: "Path to the first file" }),
      file2: Type.String({ description: "Path to the second file" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      try {
        const file1 = path.resolve(params.file1);
        const file2 = path.resolve(params.file2);
        
        if (!fs.existsSync(file1)) {
          return {
            content: [{ type: "text", text: `Error: File not found: ${file1}` }],
            details: { error: "File not found" },
            isError: true,
          };
        }
        
        if (!fs.existsSync(file2)) {
          return {
            content: [{ type: "text", text: `Error: File not found: ${file2}` }],
            details: { error: "File not found" },
            isError: true,
          };
        }
        
        const buf1 = fs.readFileSync(file1);
        const buf2 = fs.readFileSync(file2);
        
        const resultLines = [
          branding,
          section("BYTE DIFF"),
          info(`File 1: ${file1} (${buf1.length} bytes, hash: ${simpleHash(buf1)})`),
          info(`File 2: ${file2} (${buf2.length} bytes, hash: ${simpleHash(buf2)})`),
          "",
        ];
        
        if (buf1.equals(buf2)) {
          resultLines.push(ok("Files are identical"));
        } else {
          resultLines.push(info("Differences:"));
          resultLines.push("");
          resultLines.push(...byteDiff(buf1, buf2).slice(0, 50));
        }
        
        return {
          content: [{ type: "text", text: resultLines.join("\n") }],
          details: {
            file1: file1,
            file2: file2,
            size1: buf1.length,
            size2: buf2.length,
            identical: buf1.equals(buf2),
            hash1: simpleHash(buf1),
            hash2: simpleHash(buf2),
          },
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Diff failed: ${e instanceof Error ? e.message : String(e)}` }],
          details: { error: e instanceof Error ? e.message : String(e) },
          isError: true,
        };
      }
    },
  });
  
  // Slash command versions
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