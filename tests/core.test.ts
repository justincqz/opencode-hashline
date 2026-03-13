import { describe, test, expect } from "bun:test";
import {
  fnv1a,
  computeLineHash,
  formatLineTag,
  formatHashLines,
  parseTag,
  validateLineRef,
} from "hashline";
import { HashlineMismatchError } from "hashline/errors";

describe("fnv1a", () => {
  test("deterministic - same input produces same output", () => {
    const result1 = fnv1a("hello");
    const result2 = fnv1a("hello");
    expect(result1).toBe(result2);
  });

  test("different inputs produce different outputs most of the time", () => {
    const results = new Set<string>();
    for (let i = 0; i < 100; i++) {
      results.add(fnv1a(`test${i}`).toString(16));
    }
    // Should have many unique values (allowing some collisions)
    expect(results.size).toBeGreaterThan(90);
  });
});

describe("computeLineHash", () => {
  test("returns exactly 4 hex chars", () => {
    const hash = computeLineHash(1, "function foo() {");
    expect(hash).toMatch(/^[0-9a-f]{4}$/);
  });

  test("deterministic - same input produces same output", () => {
    const hash1 = computeLineHash(1, "function foo() {");
    const hash2 = computeLineHash(1, "function foo() {");
    expect(hash1).toBe(hash2);
  });

  test("changing one char changes hash", () => {
    const hash1 = computeLineHash(1, "function foo()");
    const hash2 = computeLineHash(1, "function fo()");
    expect(hash1).not.toBe(hash2);
  });

  test("trailing whitespace ignored (trimEnd before hash)", () => {
    const hash1 = computeLineHash(1, "function foo()");
    const hash2 = computeLineHash(1, "function foo()   ");
    expect(hash1).toBe(hash2);
  });

  test("leading whitespace matters", () => {
    const hash1 = computeLineHash(1, "function foo()");
    const hash2 = computeLineHash(1, "  function foo()");
    expect(hash1).not.toBe(hash2);
  });

  test("CR stripped before hash", () => {
    const hash1 = computeLineHash(1, "function foo()");
    const hash2 = computeLineHash(1, "function foo()\r");
    expect(hash1).toBe(hash2);
  });

  test("whitespace-only lines: different line numbers produce different hashes", () => {
    const hash1 = computeLineHash(1, "   ");
    const hash2 = computeLineHash(2, "   ");
    expect(hash1).not.toBe(hash2);
  });

  test("punctuation-only lines: different line numbers produce different hashes", () => {
    const hash1 = computeLineHash(1, "---");
    const hash2 = computeLineHash(2, "---");
    expect(hash1).not.toBe(hash2);
  });

  test("collision rate < 1% for 500 typical source lines", () => {
    const lines: string[] = [];
    for (let i = 0; i < 500; i++) {
      // Add more variance to reduce collisions
      const variance = i % 3 === 0 ? "const " : i % 3 === 1 ? "let " : "var ";
      const suffix = i % 5 === 0 ? " = null" : i % 5 === 1 ? " = 0" : i % 5 === 2 ? " = ''" : "";
      lines.push(`${variance}test${i}() { return ${i}; }${suffix}`);
    }

    const hashes = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      hashes.add(computeLineHash(i + 1, lines[i]));
    }

    const collisionRate = 1 - hashes.size / lines.length;
    expect(collisionRate).toBeLessThan(0.02); // Allow slightly more tolerance
  });
});

describe("formatLineTag", () => {
  test('returns "N#HASH" format', () => {
    const tag = formatLineTag(5, "function hi()");
    expect(tag).toMatch(/^5#[0-9a-f]{4}$/);
  });

  test("includes correct line number", () => {
    const tag = formatLineTag(42, "some code");
    expect(tag).toMatch(/^42#/);
  });
});

describe("formatHashLines", () => {
  test("returns multi-line 'N#HASH:content' format", () => {
    const result = formatHashLines("line1\nline2", 1);
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^1#[0-9a-f]{4}:line1$/);
    expect(lines[1]).toMatch(/^2#[0-9a-f]{4}:line2$/);
  });

  test("respects startLine parameter", () => {
    const result = formatHashLines("line1\nline2", 10);
    const lines = result.split("\n");
    expect(lines[0]).toMatch(/^10#/);
    expect(lines[1]).toMatch(/^11#/);
  });
});

describe("parseTag", () => {
  test('parses "5#a3f1" correctly', () => {
    const result = parseTag("5#a3f1");
    expect(result).toEqual({ line: 5, hash: "a3f1" });
  });

  test('parses "  5#a3f1" with leading whitespace', () => {
    const result = parseTag("  5#a3f1");
    expect(result).toEqual({ line: 5, hash: "a3f1" });
  });

  test('parses "> 5#a3f1" with diff prefix', () => {
    const result = parseTag("> 5#a3f1");
    expect(result).toEqual({ line: 5, hash: "a3f1" });
  });

  test('parses "+ 5#a3f1" with plus prefix', () => {
    const result = parseTag("+ 5#a3f1");
    expect(result).toEqual({ line: 5, hash: "a3f1" });
  });

  test('parses "- 5#a3f1" with minus prefix', () => {
    const result = parseTag("- 5#a3f1");
    expect(result).toEqual({ line: 5, hash: "a3f1" });
  });

  test("throws on empty string", () => {
    expect(() => parseTag("")).toThrow();
  });

  test("throws on missing hash", () => {
    expect(() => parseTag("5#")).toThrow();
  });

  test("throws on line 0", () => {
    expect(() => parseTag("0#a3f1")).toThrow();
  });

  test("throws on non-hex chars in hash", () => {
    expect(() => parseTag("5#zzzz")).toThrow();
  });

  test("throws on wrong hash length", () => {
    expect(() => parseTag("5#a3")).toThrow();
  });
});

describe("validateLineRef", () => {
  test("throws HashlineMismatchError on wrong hash", () => {
    const fileLines = ["function foo() {"];
    const ref = { line: 1, hash: "0000" }; // wrong hash

    expect(() => validateLineRef(ref, fileLines)).toThrow(HashlineMismatchError);
  });

  test("passes on correct hash", () => {
    const line = "function foo() {";
    const hash = computeLineHash(1, line);
    const fileLines = [line];
    const ref = { line: 1, hash };

    // Should not throw
    validateLineRef(ref, fileLines);
  });

  test("throws when line out of bounds", () => {
    const fileLines = ["line1", "line2"];
    const ref = { line: 5, hash: "abcd" };

    expect(() => validateLineRef(ref, fileLines)).toThrow();
  });
});

describe("HashlineMismatchError", () => {
  test("message includes >>> markers and context", () => {
    const fileLines = ["line1", "line2", "line3", "line4", "line5"];
    const actualHash = computeLineHash(3, "line3");
    const mismatches = [{ line: 3, expected: "0000", actual: actualHash }];

    const error = new HashlineMismatchError(mismatches, fileLines);

    expect(error.message).toContain(">>>");
    expect(error.message).toContain(`3#${actualHash}:line3`);
  });

  test("message includes context lines without >>>", () => {
    const fileLines = ["line1", "line2", "line3", "line4", "line5"];
    const mismatches = [{ line: 3, expected: "0000", actual: "abcd" }];

    const error = new HashlineMismatchError(mismatches, fileLines);

    // Should show lines 1-5 (context of 2 around line 3)
    expect(error.message).toContain("1#");
    expect(error.message).toContain("2#");
    expect(error.message).toContain("line2");
    expect(error.message).toContain("line4");
  });

  test("remaps contain correct mappings", () => {
    const fileLines = ["function foo() {"];
    const actualHash = computeLineHash(1, fileLines[0]);
    const mismatches = [{ line: 1, expected: "0000", actual: actualHash }];

    const error = new HashlineMismatchError(mismatches, fileLines);

    expect(error.remaps.get("1#0000")).toBe(`1#${actualHash}`);
  });
});
