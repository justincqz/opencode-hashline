// Hashline normalization: prefix stripping, BOM handling, line ending management, read output parsing

import { computeLineHash } from "./core";

// ─── Group 1: Hashline Prefix Stripping ─────────────────────────────────

const HASHLINE_PREFIX_RE = /^\s*(?:>>>|>>)?\s*(?:\d+\s*#\s*)[0-9a-f]{4}:/;
const DIFF_PLUS_RE = /^\s*[+](?![+])\s*/;

/**
 * Strip LINE#HASH: prefix from all lines.
 * Only strips if ALL non-empty lines have the prefix.
 * This prevents stripping legitimate content that happens to look like a hashline.
 */
export function stripHashlinePrefixes(lines: string[]): string[] {
  let hashPrefixCount = 0;
  let nonEmpty = 0;

  for (const line of lines) {
    if (line.length === 0) continue;
    nonEmpty++;
    if (HASHLINE_PREFIX_RE.test(line)) {
      hashPrefixCount++;
    }
  }

  // Don't strip if no non-empty lines, or if not ALL non-empty lines have prefix
  if (nonEmpty === 0 || hashPrefixCount !== nonEmpty) {
    return lines;
  }

  return lines.map((line) => line.replace(HASHLINE_PREFIX_RE, ""));
}

/**
 * Strip unified-diff `+` markers.
 * Only strips if >= 50% of non-empty lines have the prefix.
 */
export function stripDiffPlusMarkers(lines: string[]): string[] {
  let plusMarkerCount = 0;
  let nonEmpty = 0;

  for (const line of lines) {
    if (line.length === 0) continue;
    nonEmpty++;
    if (DIFF_PLUS_RE.test(line)) {
      plusMarkerCount++;
    }
  }

  // Don't strip if no non-empty lines, or if less than 50% have markers
  if (nonEmpty === 0 || plusMarkerCount < nonEmpty / 2) {
    return lines;
  }

  return lines.map((line) => line.replace(DIFF_PLUS_RE, ""));
}

// ─── Group 2: File Content Normalization ───────────────────────────────

/**
 * Strip UTF-8 BOM (U+FEFF) if present, return it separately for restoration.
 */
export function stripBom(text: string): { bom: string; text: string } {
  if (text.charCodeAt(0) === 0xfeff) {
    return { bom: "\uFEFF", text: text.slice(1) };
  }
  return { bom: "", text };
}

/**
 * Detect dominant line ending type in text.
 * Counts occurrences of each ending type and returns the majority.
 */
export function detectLineEnding(text: string): "lf" | "crlf" | "cr" | "mixed" {
  let crlfCount = 0;
  let lfCount = 0;
  let crCount = 0;

  let i = 0;
  while (i < text.length) {
    if (text.charAt(i) === "\r") {
      if (text.charAt(i + 1) === "\n") {
        crlfCount++;
        i += 2;
      } else {
        crCount++;
        i++;
      }
    } else if (text.charAt(i) === "\n") {
      lfCount++;
      i++;
    } else {
      i++;
    }
  }

  const max = Math.max(crlfCount, lfCount, crCount);
  
  // Check for mixed endings
  const typesWithMax = [crlfCount, lfCount, crCount].filter((c) => c === max).length;
  if (typesWithMax > 1) {
    return "mixed";
  }

  if (crlfCount === max) return "crlf";
  if (lfCount === max) return "lf";
  return "cr";
}

/**
 * Replace all CRLF and CR line endings with LF.
 */
export function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Restore original line endings from normalized text.
 * For CRLF: replace \n with \r\n
 * For CR: replace \n with \r
 * For LF: no change needed
 * For mixed: no change (already normalized)
 */
export function restoreLineEndings(
  text: string,
  ending: "lf" | "crlf" | "cr" | "mixed"
): string {
  if (ending === "crlf") {
    return text.replace(/\n/g, "\r\n");
  }
  if (ending === "cr") {
    return text.replace(/\n/g, "\r");
  }
  // For "lf" and "mixed", text is already normalized
  return text;
}

// ─── Group 3: OpenCode Read Output Parsing ─────────────────────────────

const COLON_READ_LINE_PATTERN = /^\s*(\d+): ?(.*)$/;
const PIPE_READ_LINE_PATTERN = /^\s*(\d+)\| ?(.*)$/;

export interface ParsedReadOutput {
  beforeContent: string;
  contentLines: Array<{ lineNum: number; content: string }>;
  afterContent: string;
  format: "colon" | "pipe" | "unknown";
  footerLines: string[];
}

/**
 * Parse opencode's XML-structured read output.
 * Extracts content lines while preserving everything else.
 */
export function parseReadOutput(output: string): ParsedReadOutput | null {
  // Find the content block boundaries
  const contentStart = output.indexOf("<content>");
  const contentEnd = output.indexOf("</content>");

  if (contentStart === -1 || contentEnd === -1) {
    return null;
  }

  const beforeContent = output.slice(0, contentStart);
  const contentBody = output.slice(contentStart + 9, contentEnd);
  const afterContent = output.slice(contentEnd + 10); // +10 for "</content>"

  // Split into lines
  const rawLines = contentBody.split("\n");

  const contentLines: Array<{ lineNum: number; content: string }> = [];
  const footerLines: string[] = [];
  let format: "colon" | "pipe" | "unknown" = "unknown";

  for (const rawLine of rawLines) {
    // Check for colon format: N: content or N:content
    let match = rawLine.match(COLON_READ_LINE_PATTERN);
    if (match) {
      const lineNum = Number.parseInt(match[1], 10);
      const content = match[2];
      
      // Skip footer lines that shouldn't be hashified
      if (content.includes("(End of file") || content.includes("(line truncated")) {
        footerLines.push(rawLine);
        continue;
      }
      
      contentLines.push({ lineNum, content });
      if (format === "unknown") format = "colon";
      continue;
    }

    // Check for pipe format: N| content or N|content
    match = rawLine.match(PIPE_READ_LINE_PATTERN);
    if (match) {
      const lineNum = Number.parseInt(match[1], 10);
      const content = match[2];
      
      // Skip footer lines
      if (content.includes("(End of file") || content.includes("(line truncated")) {
        footerLines.push(rawLine);
        continue;
      }
      
      contentLines.push({ lineNum, content });
      if (format === "unknown") format = "pipe";
      continue;
    }
    // Lines that don't match either pattern are preserved as footer/non-content lines
    if (rawLine.trim()) {
      footerLines.push(rawLine);
    }
  }

  return {
    beforeContent,
    contentLines,
    afterContent,
    format,
    footerLines,
  };
}

/**
 * Reassemble the XML output with hashified content lines.
 */
export function reconstructReadOutput(
  parsed: ParsedReadOutput,
  hashifiedLines: string[],
  includeHashPrefix: boolean = false
): string {
  const prefix = parsed.format === "pipe" ? "|" : ":";
  
  const linesWithNumbers = parsed.contentLines.map((item, idx) => {
    const hashified = hashifiedLines[idx] ?? item.content;
    if (includeHashPrefix) {
      // Format: N#HASH:content
      return `${item.lineNum}#${computeLineHash(item.lineNum, item.content)}:${hashified}`;
    }
    // Original format: N: content or N| content
    return `${item.lineNum}${prefix} ${hashified}`;
  });

  const contentBody = linesWithNumbers.join("\n");
  
  // Include footer lines (non-numbered lines like "(End of file...)")
  const footerLines = parsed.footerLines ?? [];
  const footerContent = footerLines.join("\n");
  const footerBlock = footerContent ? "\n" + footerContent : "";

  // Always include </content> closing tag
  return parsed.beforeContent + "<content>\n" + contentBody + footerBlock + "\n</content>" + parsed.afterContent;
}
