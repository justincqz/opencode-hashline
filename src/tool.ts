// Hashline edit tool: custom tool definition for OpenCode plugin system
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { parseTag } from './core';
import { applyHashlineEdits } from './edit-engine';
import { HashlineMismatchError } from './errors';
import {
    stripHashlinePrefixes,
    stripDiffPlusMarkers,
    stripBom,
    detectLineEnding,
    normalizeToLF,
    restoreLineEndings,
} from './normalization';
import type { HashlineEdit, HashlineToolEdit } from './types';
import { HASHLINE_EDIT_DESCRIPTION } from './prompt';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Try to parse a LINE#HASH tag, returning undefined on failure.
 */
function tryParseTag(raw: string) {
    try {
        return parseTag(raw);
    } catch {
        return undefined;
    }
}

/**
 * Convert the raw `lines` value from tool input to string[].
 */
function parseLines(lines: string[] | string | null): string[] {
    if (lines === null) return [];
    if (typeof lines === 'string') {
        // Strip trailing newline, normalize CRs
        const normalized = lines.endsWith('\n') ? lines.slice(0, -1) : lines;
        return normalized.replaceAll('\r', '').split('\n');
    }
    return lines.map((l) => l.replace(/\r/g, ''));
}

/**
 * Validate that a file path resolves within the worktree.
 * Throws if the path would escape (e.g., ../../etc/passwd).
 */
function validatePath(worktree: string, filePath: string): string {
    const fullPath = path.resolve(worktree, filePath);
    const resolvedWorktree = path.resolve(worktree);
    if (!fullPath.startsWith(resolvedWorktree + path.sep) && fullPath !== resolvedWorktree) {
        throw new Error(`Path "${filePath}" escapes the worktree`);
    }
    return fullPath;
}

/**
 * Resolve raw tool edit inputs into typed HashlineEdit objects.
 * Also strips hashline prefixes and diff + markers from replacement lines.
 */
export function resolveEditAnchors(edits: HashlineToolEdit[]): HashlineEdit[] {
    const result: HashlineEdit[] = [];

    for (const edit of edits) {
        let lines = parseLines(edit.lines);
        // Strip hashline prefixes LLM may have copied from read output
        lines = stripHashlinePrefixes(lines);
        // Strip unified-diff + markers
        lines = stripDiffPlusMarkers(lines);

        const tag = edit.pos ? tryParseTag(edit.pos) : undefined;
        const endTag = edit.end ? tryParseTag(edit.end) : undefined;

        switch (edit.op) {
            case 'replace': {
                if (!tag && !endTag) {
                    throw new Error('Replace operation requires at least one anchor (pos or end).');
                }
                const posAnchor = tag ?? endTag!;
                result.push({
                    op: 'replace',
                    pos: posAnchor,
                    ...(endTag && tag ? { end: endTag } : {}),
                    lines,
                });
                break;
            }
            case 'append':
                result.push({ op: 'append', pos: tag ?? endTag, lines });
                break;
            case 'prepend':
                result.push({ op: 'prepend', pos: endTag ?? tag, lines });
                break;
        }
    }

    return result;
}

// ─── Diff Preview ────────────────────────────────────────────────────────────

/**
 * Generate a simple unified diff preview between old and new text.
 * No external dependencies — for LLM feedback only.
 */
export function generateDiffPreview(
    oldText: string,
    newText: string,
    contextLines: number = 3
): string {
    if (oldText === newText) return '(no changes)';

    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');

    // Guard for large files - skip expensive diff computation
    const MAX_DIFF_LINES = 5000;
    if (oldLines.length > MAX_DIFF_LINES || newLines.length > MAX_DIFF_LINES) {
        const changedLines = Math.abs(oldLines.length - newLines.length);
        return `(file too large for detailed diff — ${oldLines.length} → ${newLines.length} lines, ~${changedLines} lines changed)`;
    }

    // Simple LCS-based diff
    const diff = computeLineDiff(oldLines, newLines);

    // Build output with context collapsing
    const COLLAPSE_THRESHOLD = 6;
    const output: string[] = [];
    let pendingUnchanged: string[] = [];

    function flushUnchanged() {
        if (pendingUnchanged.length > COLLAPSE_THRESHOLD) {
            // Show contextLines at start and end of the run, collapse the middle
            const head = pendingUnchanged.slice(0, contextLines);
            const tail = pendingUnchanged.slice(-contextLines);
            const collapsed = pendingUnchanged.length - head.length - tail.length;
            for (const l of head) output.push(`  ${l}`);
            if (collapsed > 0) output.push(`... ${collapsed} unchanged lines ...`);
            for (const l of tail) output.push(`  ${l}`);
        } else {
            for (const l of pendingUnchanged) output.push(`  ${l}`);
        }
        pendingUnchanged = [];
    }

    for (const entry of diff) {
        if (entry.type === 'equal') {
            pendingUnchanged.push(entry.value);
        } else {
            // Before emitting changes, flush pending unchanged
            flushUnchanged();
            if (entry.type === 'remove') {
                output.push(`- ${entry.value}`);
            } else {
                output.push(`+ ${entry.value}`);
            }
        }
    }
    // Flush trailing unchanged
    flushUnchanged();

    return output.join('\n');
}

type DiffEntry =
    | { type: 'equal'; value: string }
    | { type: 'remove'; value: string }
    | { type: 'add'; value: string };

/**
 * Simple Myers-style line diff using LCS.
 */
function computeLineDiff(oldLines: string[], newLines: string[]): DiffEntry[] {
    const m = oldLines.length;
    const n = newLines.length;

    // Build LCS table
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            if (oldLines[i] === newLines[j]) {
                dp[i][j] = dp[i + 1][j + 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
            }
        }
    }

    // Trace back the diff
    const result: DiffEntry[] = [];
    let i = 0;
    let j = 0;
    while (i < m || j < n) {
        if (i < m && j < n && oldLines[i] === newLines[j]) {
            result.push({ type: 'equal', value: oldLines[i] });
            i++;
            j++;
        } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
            result.push({ type: 'add', value: newLines[j] });
            j++;
        } else {
            result.push({ type: 'remove', value: oldLines[i] });
            i++;
        }
    }

    return result;
}

// ─── Core Execute Logic ───────────────────────────────────────────────────────

export interface ToolArgs {
    path: string;
    edits: HashlineToolEdit[];
    delete?: boolean;
    move?: string;
}

export interface ToolContext {
    worktree: string;
}

/**
 * Core execute logic for the hashline-edit tool.
 * Exported separately so it can be tested without the plugin framework.
 */
export async function executeHashlineEdit(args: ToolArgs, context: ToolContext): Promise<string> {
    // Handle case where edits is passed as a JSON string
    let edits = args.edits;
    if (typeof edits === 'string') {
        try {
            edits = JSON.parse(edits);
        } catch {
            throw new Error('Invalid edits: expected array or JSON string');
        }
    }
    if (!Array.isArray(edits)) {
        throw new Error('Invalid edits: expected an array');
    }
    const { path: filePath, delete: deleteFile, move } = args;
    const fullPath = validatePath(context.worktree, filePath);

    // ── Handle deletion ──────────────────────────────────────────────────────
    if (deleteFile) {
        await fs.unlink(fullPath);
        return `Deleted ${filePath}`;
    }

    // ── Handle file creation ─────────────────────────────────────────────────
    const exists = await fs
        .access(fullPath)
        .then(() => true)
        .catch(() => false);

    if (!exists) {
        const lines: string[] = [];
        for (const edit of edits) {
            if ((edit.op === 'append' || edit.op === 'prepend') && !edit.pos && !edit.end) {
                const parsed = parseLines(edit.lines);
                if (edit.op === 'prepend') lines.unshift(...parsed);
                else lines.push(...parsed);
            } else {
                throw new Error(`File not found: ${filePath}`);
            }
        }
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, lines.join('\n'), 'utf-8');
        return `Created ${filePath}`;
    }

    // ── Read & normalize ─────────────────────────────────────────────────────
    const rawContent = await fs.readFile(fullPath, 'utf-8');
    const { bom, text: withoutBom } = stripBom(rawContent);
    const lineEnding = detectLineEnding(withoutBom);
    const normalizedContent = normalizeToLF(withoutBom);

    // ── Resolve anchors ─────────────────────────────────────────────────────
    const resolvedEdits = resolveEditAnchors(edits);

    // ── Apply edits ──────────────────────────────────────────────────────────
    let result: import('./types').ApplyResult;
    try {
        result = applyHashlineEdits(normalizedContent, resolvedEdits);
    } catch (err) {
        if (err instanceof HashlineMismatchError) {
            return err.message;
        }
        throw err;
    }

    // ── Detect no-op ────────────────────────────────────────────────────────
    if (result.text === normalizedContent && !move) {
        throw new Error(`No changes made to ${filePath}. Edits produced identical content.`);
    }

    // ── Restore encoding ─────────────────────────────────────────────────────
    let output = restoreLineEndings(result.text, lineEnding);
    output = bom + output;

    // ── Write ────────────────────────────────────────────────────────────────
    const writePath = move ? validatePath(context.worktree, move) : fullPath;
    await fs.mkdir(path.dirname(writePath), { recursive: true });
    await fs.writeFile(writePath, output, 'utf-8');

    if (move && move !== filePath) {
        await fs.unlink(fullPath).catch(() => {});
    }

    // ── Diff preview ─────────────────────────────────────────────────────────
    const diffPreview = generateDiffPreview(normalizedContent, result.text);

    if (move && move !== filePath) {
        return `Moved ${filePath} to ${move}\n\n${diffPreview}`;
    }
    return `Updated ${filePath}\n\n${diffPreview}`;
}

// ─── Tool Export ─────────────────────────────────────────────────────────────

/**
 * The hashline-edit tool definition.
 * Conditionally uses @opencode-ai/plugin if available.
 * Falls back to a plain export for testing.
 */
export const hashlineEditTool = {
    description: HASHLINE_EDIT_DESCRIPTION,
    execute: executeHashlineEdit,
};

// Try to export as a proper tool() if @opencode-ai/plugin is available
// Register as "edit" to override the built-in edit tool
let _toolExport: unknown = hashlineEditTool;
try {
    // Dynamic import to avoid hard dependency during tests
    const { tool } = await import('@opencode-ai/plugin' as string);
    _toolExport = tool({
        name: 'edit',
        description: HASHLINE_EDIT_DESCRIPTION,
        args: {
            path: tool.schema
                .string()
                .describe("File path to edit (relative to worktree, e.g. 'src/index.ts')"),
            edits: tool.schema
                .array(
                    tool.schema.object({
                        op: tool.schema
                            .enum(['replace', 'append', 'prepend'])
                            .describe(
                                'Operation: replace=replace line(s), append=insert after, prepend=insert before'
                            ),
                        pos: tool.schema
                            .string()
                            .optional()
                            .describe(
                                "LINE#HASH anchor from read output (e.g. '5#a3f1'). Required for replace, optional for append/prepend"
                            ),
                        end: tool.schema
                            .string()
                            .optional()
                            .describe(
                                "End LINE#HASH for range replace (e.g. '10#b2c3'). Use with pos for multi-line replacement"
                            ),
                        lines: tool.schema
                            .union([tool.schema.array(tool.schema.string()), tool.schema.string()])
                            .nullable()
                            .describe(
                                'Content to insert: string[] (multiple lines) or string (single line) or null'
                            ),
                    })
                )
                .describe(
                    'List of edits. Each needs op, lines, and pos (except append/prepend without pos)'
                ),
            delete: tool.schema.boolean().optional().describe('Set to true to delete the file'),
            move: tool.schema
                .string()
                .optional()
                .describe('New path to rename/move the file after editing'),
        },
        async execute(args: any, context: any) {
            return executeHashlineEdit(args as ToolArgs, context as ToolContext);
        },
    });
} catch {
    // @opencode-ai/plugin not available — plain export is fine for testing
}

export default _toolExport;
