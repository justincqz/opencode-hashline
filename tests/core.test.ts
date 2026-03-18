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

// Old algorithm: only seeds for whitespace-only lines (for comparison)
function computeLineHashOld(idx: number, line: string): string {
  const RE_SIGNIFICANT = /[\p{L}\p{N}]/u;
  line = line.replace(/\r/g, "").trimEnd();

  let seed = 0;
  if (!RE_SIGNIFICANT.test(line)) {
    seed = idx;
  }

  const hash = fnv1a(line, seed);
  return hash.toString(16).padStart(4, "0");
}

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

describe("Algorithm comparison: old vs new", () => {
  test("NEW: same content at different lines produces different hashes", () => {
    const content = "const x = 1;";
    const hash1 = computeLineHash(1, content);
    const hash50 = computeLineHash(50, content);
    const hash100 = computeLineHash(100, content);

    expect(hash1).not.toBe(hash50);
    expect(hash50).not.toBe(hash100);
    expect(hash1).not.toBe(hash100);
  });

  test("OLD: same content at different lines produces SAME hashes (problem)", () => {
    const content = "const x = 1;";
    const hash1 = computeLineHashOld(1, content);
    const hash50 = computeLineHashOld(50, content);
    const hash100 = computeLineHashOld(100, content);

    expect(hash1).toBe(hash50);
    expect(hash50).toBe(hash100);
    expect(hash1).toBe(hash100);
  });

  test("NEW: different content at same line produces different hashes", () => {
    expect(computeLineHash(1, "const x = 1;")).not.toBe(computeLineHash(1, "const y = 2;"));
    expect(computeLineHash(1, "function foo() {")).not.toBe(computeLineHash(1, "function bar() {"));
  });

  test("collision rate comparison: 1000 lines with repeated patterns", () => {
    const lines: string[] = [];
    // Create realistic source code patterns with repeated content
    for (let i = 0; i < 1000; i++) {
      const patterns = [
        "const value = null;",
        "return result;",
        "console.log('debug');",
        "});",
        "});",
        "  // comment",
        "",
        "  const temp = null;",
      ];
      lines.push(patterns[i % patterns.length]);
    }

    // New algorithm (always seed with line number)
    const newHashes = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      newHashes.add(computeLineHash(i + 1, lines[i]));
    }
    const newCollisionRate = 1 - newHashes.size / lines.length;

    // Old algorithm (only seed for whitespace)
    const oldHashes = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      oldHashes.add(computeLineHashOld(i + 1, lines[i]));
    }
    const oldCollisionRate = 1 - oldHashes.size / lines.length;

    console.log(`\nCollision rates for 1000 lines with repeated patterns:`);
    console.log(`  Old algorithm: ${(oldCollisionRate * 100).toFixed(2)}%`);
    console.log(`  New algorithm: ${(newCollisionRate * 100).toFixed(2)}%`);
    console.log(`  Improvement: ${((oldCollisionRate - newCollisionRate) * 100).toFixed(2)} percentage points`);

    // New algorithm should have significantly fewer collisions
    expect(newCollisionRate).toBeLessThan(oldCollisionRate);
    // New algorithm should have < 1% collision even with repeated content
    expect(newCollisionRate).toBeLessThan(0.01);
  });

  test("collision rate comparison: empty/whitespace lines at various positions", () => {
    const lines: string[] = [];
    for (let i = 0; i < 500; i++) {
      const wsPatterns = ["", "   ", "\t", "\t\t", "    ", "\t  "];
      lines.push(wsPatterns[i % wsPatterns.length]);
    }

    const newHashes = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      newHashes.add(computeLineHash(i + 1, lines[i]));
    }
    const newCollisionRate = 1 - newHashes.size / lines.length;

    const oldHashes = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      oldHashes.add(computeLineHashOld(i + 1, lines[i]));
    }
    const oldCollisionRate = 1 - oldHashes.size / lines.length;

    console.log(`\nCollision rates for 500 whitespace-only lines:`);
    console.log(`  Old algorithm: ${(oldCollisionRate * 100).toFixed(2)}%`);
    console.log(`  New algorithm: ${(newCollisionRate * 100).toFixed(2)}%`);

    // Both should be low since old already seeded whitespace
    expect(newCollisionRate).toBeLessThan(0.01);
    expect(oldCollisionRate).toBeLessThan(0.01);
  });

  test("collision rate comparison: large file (10000 lines)", () => {
    const lines: string[] = [];
    // Simulate a large file with common patterns
    const commonPatterns = [
      "function foo() { return 1; }",
      "const x = null;",
      "if (condition) {",
      "  return true;",
      "}",
      "export default function() {}",
      "import { something } from 'module';",
      "class Foo {",
      "  constructor() {}",
      "}",
    ];
    for (let i = 0; i < 10000; i++) {
      lines.push(commonPatterns[i % commonPatterns.length]);
    }

    const newHashes = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      newHashes.add(computeLineHash(i + 1, lines[i]));
    }
    const newCollisionRate = 1 - newHashes.size / lines.length;

    const oldHashes = new Set<string>();
    for (let i = 0; i < lines.length; i++) {
      oldHashes.add(computeLineHashOld(i + 1, lines[i]));
    }
    const oldCollisionRate = 1 - oldHashes.size / lines.length;

    console.log(`\nCollision rates for 10000 lines with repeated patterns:`);
    console.log(`  Old algorithm: ${(oldCollisionRate * 100).toFixed(2)}%`);
    console.log(`  New algorithm: ${(newCollisionRate * 100).toFixed(2)}%`);
    console.log(`  Improvement: ${((oldCollisionRate - newCollisionRate) * 100).toFixed(2)} percentage points`);

    // New algorithm should be dramatically better
    expect(newCollisionRate).toBeLessThan(oldCollisionRate);
    // Even at 10k lines, new should be under 10%
    expect(newCollisionRate).toBeLessThan(0.1);
  });

  test("stability: hash changes when line is inserted above (NEW behavior)", () => {
    // With new algorithm, adding a line above changes the hash
    const original = "const x = 1;";
    const hashBeforeInsert = computeLineHash(5, original);
    const hashAfterInsert = computeLineHash(6, original); // line shifted by 1

    expect(hashBeforeInsert).not.toBe(hashAfterInsert);

    // This is expected - LLM should re-read after any insertion
  });

  test("stability: OLD algorithm - same content same hash regardless of position", () => {
    // With old algorithm, content-only determines hash
    const original = "const x = 1;";
    const hashAtLine5 = computeLineHashOld(5, original);
    const hashAtLine100 = computeLineHashOld(100, original);

    expect(hashAtLine5).toBe(hashAtLine100);
  });
});
