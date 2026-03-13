// Hashline error classes

import { HashMismatch } from "./types";
import { computeLineHash } from "./core";

const MISMATCH_CONTEXT = 2;

export class HashlineMismatchError extends Error {
  readonly remaps: Map<string, string>;

  constructor(
    public readonly mismatches: HashMismatch[],
    public readonly fileLines: string[]
  ) {
    super(HashlineMismatchError.formatMessage(mismatches, fileLines));
    this.name = "HashlineMismatchError";

    this.remaps = new Map();
    for (const m of mismatches) {
      const actual = computeLineHash(m.line, fileLines[m.line - 1]);
      this.remaps.set(`${m.line}#${m.expected}`, `${m.line}#${actual}`);
    }
  }

  static formatMessage(mismatches: HashMismatch[], fileLines: string[]): string {
    const mismatchSet = new Map<number, HashMismatch>();
    for (const m of mismatches) mismatchSet.set(m.line, m);

    const displayLines = new Set<number>();
    for (const m of mismatches) {
      const lo = Math.max(1, m.line - MISMATCH_CONTEXT);
      const hi = Math.min(fileLines.length, m.line + MISMATCH_CONTEXT);
      for (let i = lo; i <= hi; i++) displayLines.add(i);
    }

    const sorted = [...displayLines].sort((a, b) => a - b);
    const lines: string[] = [];

    lines.push(
      `${mismatches.length} line${mismatches.length > 1 ? "s have" : " has"} changed since last read.`
    );
    lines.push("Use the updated LINE#ID references shown below (>>> marks changed lines).");
    lines.push("");

    let prevLine = -1;
    for (const lineNum of sorted) {
      if (prevLine !== -1 && lineNum > prevLine + 1) {
        lines.push("    ...");
      }
      prevLine = lineNum;

      const text = fileLines[lineNum - 1];
      const hash = computeLineHash(lineNum, text);
      const prefix = `${lineNum}#${hash}`;

      if (mismatchSet.has(lineNum)) {
        lines.push(`>>> ${prefix}:${text}`);
      } else {
        lines.push(`    ${prefix}:${text}`);
      }
    }

    return lines.join("\n");
  }
}
