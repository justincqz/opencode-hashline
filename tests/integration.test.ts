// Integration tests for hashline plugin
// Tests the full roundtrip: read → hashify → edit → verify

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { computeLineHash, formatLineTag, parseTag } from "../src/core";
import { parseReadOutput, reconstructReadOutput, stripHashlinePrefixes } from "../src/normalization";
import { applyHashlineEdits } from "../src/edit-engine";
import { createHashlineHooks } from "../src/plugin";
import { HashlineMismatchError } from "../src/errors";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "hashline-integration-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

/**
 * Write content to a temp file, return the path.
 */
async function createTempFile(content: string): Promise<string> {
  const filePath = join(tempDir, "test.txt");
  await writeFile(filePath, content, "utf-8");
  return filePath;
}

/**
 * Simulate opencode XML read output for a file.
 */
async function simulateReadOutput(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf-8");
  const lines = content.split("\n");
  
  const contentLines = lines.map((line, idx) => {
    return `${idx + 1}: ${line}`;
  }).join("\n");
  
  return `<path>${filePath}</path>
<type>file</type>
<content>
${contentLines}
</content>`;
}

/**
 * Run simulated read output through the hashify hook transform.
 */
function hashifyReadOutput(output: string): string {
  const parsed = parseReadOutput(output);
  if (!parsed) return output;
  
  if (parsed.contentLines.length === 0) {
    return output;
  }
  
  const hashifiedLines = parsed.contentLines.map((item) => {
    return item.content;
  });
  
  return reconstructReadOutput(parsed, hashifiedLines, true);
}

/**
 * Extract a tag from hashified output for a given line number.
 * The hashified output has format N#HASH:content which we parse directly.
 */
function extractTag(hashifiedOutput: string, lineNum: number): string {
  // The hashified format is N#HASH:content - parse it directly
  // Find the line that starts with "lineNum#"
  const lines = hashifiedOutput.split("\n");
  for (const line of lines) {
    const match = line.match(/^(\d+)#([0-9a-f]{4}):(.*)$/);
    if (match && parseInt(match[1]) === lineNum) {
      return `${match[1]}#${match[2]}`;
    }
  }
  throw new Error(`Line ${lineNum} not found in hashified output`);
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("Integration: Full roundtrip read → hashify → edit → verify", () => {
  test("1. Full roundtrip: read → hashify → edit → verify", async () => {
    // Create temp file with 5 lines
    const content = "line one\nline two\nline three\nline four\nline five";
    const filePath = await createTempFile(content);
    
    // Simulate read output and hashify
    const readOutput = await simulateReadOutput(filePath);
    const hashified = hashifyReadOutput(readOutput);
    
    // Verify output has N#HASH:content format inside <content> block
    expect(hashified).toContain("1#");
    expect(hashified).toContain("2#");
    expect(hashified).toMatch(/1#[0-9a-f]{4}:line one/);
    expect(hashified).toMatch(/3#[0-9a-f]{4}:line three/);
    
    // Extract tag for line 3
    const tag3 = extractTag(hashified, 3);
    expect(tag3).toMatch(/^3#[0-9a-f]{4}$/);
    
    // Call edit engine with replace on that tag
    const anchor = parseTag(tag3);
    
    const result = applyHashlineEdits(content, [
      { op: "replace", pos: anchor, lines: ["replaced three"] }
    ]);
    
    // Verify line 3 was changed and others preserved
    const newLines = result.text.split("\n");
    expect(newLines[0]).toBe("line one");
    expect(newLines[1]).toBe("line two");
    expect(newLines[2]).toBe("replaced three");
    expect(newLines[3]).toBe("line four");
    expect(newLines[4]).toBe("line five");
  });
  
  test("2. Multi-edit roundtrip", async () => {
    // Create temp file with 10 lines
    const lines = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`);
    const content = lines.join("\n");
    const filePath = await createTempFile(content);
    
    // Read and hashify
    const readOutput = await simulateReadOutput(filePath);
    const hashified = hashifyReadOutput(readOutput);
    
    // Extract tags for lines 2, 5, 8
    const tag2 = extractTag(hashified, 2);
    const tag5 = extractTag(hashified, 5);
    const tag8 = extractTag(hashified, 8);
    
    // Parse tags
    const anchor2 = parseTag(tag2);
    const anchor5 = parseTag(tag5);
    const anchor8 = parseTag(tag8);
    
    // Apply 3 edits: replace line 2, append after line 5, prepend before line 8
    const result = applyHashlineEdits(content, [
      { op: "replace", pos: anchor2, lines: ["REPLACED line 2"] },
      { op: "append", pos: anchor5, lines: ["APPENDED after 5"] },
      { op: "prepend", pos: anchor8, lines: ["PREPENDED before 8"] },
    ]);
    
    // Verify all edits applied correctly
    const newLines = result.text.split("\n");
    expect(newLines[1]).toBe("REPLACED line 2");
    // Append adds after line 5, so at position 6 (index 5)
    expect(newLines[5]).toBe("APPENDED after 5");
    // Prepend adds before line 8, but since we're applying all at once,
    // the order matters. Let's check what we have:
    // Line 8 was originally at index 7, now there's something before it
    const line8Index = newLines.findIndex(l => l === "line 8");
    expect(newLines[line8Index - 1]).toBe("PREPENDED before 8");
  });
  
  test("3. Stale hash detection in roundtrip", async () => {
    // Create temp file, read and hashify, extract tag for line 2
    const content = "line one\nline two\nline three";
    const filePath = await createTempFile(content);
    
    const readOutput = await simulateReadOutput(filePath);
    const hashified = hashifyReadOutput(readOutput);
    const tag2 = extractTag(hashified, 2);
    
    // Modify the file externally (simulate concurrent edit)
    await writeFile(filePath, "line one\nMODIFIED line two\nline three", "utf-8");
    
    // Attempt edit with the stale tag
    const anchor = parseTag(tag2);
    
    expect(() => {
      applyHashlineEdits("line one\nMODIFIED line two\nline three", [
        { op: "replace", pos: anchor, lines: ["new content"] }
      ]);
    }).toThrow(HashlineMismatchError);
  });
  
  test("4. Read → edit → re-read → edit again", async () => {
    // Create temp file
    const content = "line one\nline two\nline three\nline four";
    const filePath = await createTempFile(content);
    
    // First read and hashify
    let readOutput = await simulateReadOutput(filePath);
    let hashified = hashifyReadOutput(readOutput);
    let tag2 = extractTag(hashified, 2);
    
    // Edit line 2
    let anchor = parseTag(tag2);
    let result = applyHashlineEdits(content, [
      { op: "replace", pos: anchor, lines: ["FIRST edit"] }
    ]);
    await writeFile(filePath, result.text, "utf-8");
    
    // Re-read the file, hashify again (fresh tags)
    readOutput = await simulateReadOutput(filePath);
    hashified = hashifyReadOutput(readOutput);
    let tag4 = extractTag(hashified, 4);
    
    // Edit line 4 with fresh tags
    anchor = parseTag(tag4);
    result = applyHashlineEdits(result.text, [
      { op: "replace", pos: anchor, lines: ["SECOND edit"] }
    ]);
    
    // Verify both edits were applied correctly
    const newLines = result.text.split("\n");
    expect(newLines[1]).toBe("FIRST edit");
    expect(newLines[3]).toBe("SECOND edit");
  });
  
  test("5. LLM-copied prefixes in replacement content", async () => {
    // Read and hashify a file
    const content = "line one\nline two\nline three";
    const filePath = await createTempFile(content);
    
    const readOutput = await simulateReadOutput(filePath);
    const hashified = hashifyReadOutput(readOutput);
    const tag2 = extractTag(hashified, 2);
    
    // Supply replacement lines that include LINE#HASH: prefixes
    const anchor = parseTag(tag2);
    
    // These lines have hashline prefixes that should be stripped
    // Use valid 4-char hex hashes
    const replacementWithPrefixes = [
      `1#0a1b:new content`,
      `2#c3d4:more content`,
    ];
    
    // First, strip the prefixes using the normalization function
    const cleanedLines = stripHashlinePrefixes(replacementWithPrefixes);
    
    // Now apply the edit
    const result = applyHashlineEdits(content, [
      { op: "replace", pos: anchor, lines: cleanedLines }
    ]);
    
    // Verify the prefixes are stripped and only clean content is written
    const newLines = result.text.split("\n");
    expect(newLines[1]).toBe("new content");
    expect(newLines[2]).toBe("more content");
  });
  
  test("6. Plugin hooks integration", async () => {
    // Call createHashlineHooks and verify it returns expected hook keys
    const hooks = createHashlineHooks();
    
    expect(typeof hooks["tool.execute.after"]).toBe("function");
    expect(typeof hooks["tool.definition"]).toBe("function");
    expect(typeof hooks["experimental.chat.system.transform"]).toBe("function");
    
    // Call tool.execute.after hook with simulated read output
    const readInput = {
      tool: "read",
      sessionID: "test-session",
      callID: "test-call",
      args: { filePath: "/test.ts" },
    };
    const readOutput = {
      title: "Read /test.ts",
      output: `<path>/test.ts</path>
<type>file</type>
<content>
1: const x = 1;
2: const y = 2;
</content>`,
      metadata: {},
    };
    
    await hooks["tool.execute.after"](readInput, readOutput);
    
    // Verify transformation
    expect(readOutput.output).toContain("1#");
    expect(readOutput.output).toMatch(/1#[0-9a-f]{4}:const x = 1/);
    
    // Call tool.definition hook with toolID "read"
    const defInput = { toolID: "read" };
    const defOutput = {
      description: "Read a file from the filesystem.",
      parameters: {},
    };
    
    await hooks["tool.definition"](defInput, defOutput);
    
    // Verify addendum appended
    expect(defOutput.description).toContain("LINE#HASH prefixes");
    expect(defOutput.description).toContain("hashline-edit tool");
    
    // Call experimental.chat.system.transform hook
    const chatInput = { sessionID: "test-session", model: "claude" };
    const chatOutput = {
      system: ["You are a helpful assistant."],
    };
    
    await hooks["experimental.chat.system.transform"](chatInput, chatOutput);
    
    // Verify system prompt addition
    expect(chatOutput.system).toHaveLength(2);
    expect(chatOutput.system[1]).toContain("LINE#HASH tags");
  });
});
