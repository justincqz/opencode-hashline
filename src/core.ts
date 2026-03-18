// Hashline core: hash computation, formatting, parsing

import {
  HASH_BITS,
  HASH_MASK,
  HASH_CHARS,
  RE_SIGNIFICANT,
  TAG_REGEX,
  Anchor,
  HashMismatch,
} from "./types";
import { HashlineMismatchError } from "./errors";

// ─── Hash Function ───────────────────────────────────────────────

/**
 * Portable FNV-1a hash (32-bit), masked to configured bit width.
 * Replaces Bun-specific xxHash32 from OMP.
 */
export function fnv1a(str: string, seed: number = 0): number {
  let hash = 0x811c9dc5 ^ seed;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & HASH_MASK;
}

/**
 * Compute a short hash of a single line.
 *
 * @param idx - 1-indexed line number (used as seed for whitespace-only lines)
 * @param line - Line content WITHOUT trailing newline
 * @returns Hex hash string, zero-padded to HASH_CHARS width
 */
export function computeLineHash(idx: number, line: string): string {
  line = line.replace(/\r/g, "").trimEnd();

  const seed = idx;

  const hash = fnv1a(line, seed);
  return hash.toString(16).padStart(HASH_CHARS, "0");
}

/**
 * Format a single line tag: "LINENUM#HASH"
 */
export function formatLineTag(lineNum: number, lineContent: string): string {
  return `${lineNum}#${computeLineHash(lineNum, lineContent)}`;
}

/**
 * Format entire file with hashline prefixes.
 * Each line becomes: "LINENUM#HASH:CONTENT"
 */
export function formatHashLines(text: string, startLine: number = 1): string {
  const lines = text.split("\n");
  return lines
    .map((line, i) => {
      const num = startLine + i;
      return `${formatLineTag(num, line)}:${line}`;
    })
    .join("\n");
}

// ─── Tag Parsing ─────────────────────────────────────────────────

/**
 * Parse a LINE#HASH reference string.
 * Accepts: "5#0a3f", "  5#0a3f", "> 5#0a3f", "+ 5#0a3f"
 */
export function parseTag(ref: string): Anchor {
  const match = ref.match(TAG_REGEX);

  if (!match) {
    throw new Error(
      `Invalid line reference "${ref}". Expected "LINE#HASH" (e.g. "5#${"0".repeat(HASH_CHARS)}").`
    );
  }

  const line = Number.parseInt(match[1], 10);
  if (line < 1) {
    throw new Error(`Line number must be >= 1, got ${line} in "${ref}".`);
  }

  return { line, hash: match[2] };
}

// ─── Validation ─────────────────────────────────────────────────

/**
 * Validate a single line reference against file content.
 */
export function validateLineRef(ref: Anchor, fileLines: string[]): void {
  if (ref.line < 1 || ref.line > fileLines.length) {
    throw new Error(
      `Line ${ref.line} does not exist (file has ${fileLines.length} lines)`
    );
  }
  const actualHash = computeLineHash(ref.line, fileLines[ref.line - 1]);
  if (actualHash !== ref.hash) {
    throw new HashlineMismatchError(
      [{ line: ref.line, expected: ref.hash, actual: actualHash }],
      fileLines
    );
  }
}
