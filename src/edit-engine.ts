// Hashline edit engine: validation, dedup, sort, apply

import type {
    Anchor,
    HashlineEdit,
    HashlineEditReplace,
    HashlineEditAppend,
    HashlineEditPrepend,
    HashMismatch,
    ApplyResult,
} from './types';
import { computeLineHash } from './core';
import { HashlineMismatchError } from './errors';

/**
 * Generate a unique key for an edit to detect duplicates.
 * Format: "op:posLine#posHash[:endLine#endHash]:lines_joined"
 */
export function editKey(edit: HashlineEdit): string {
    let key = edit.op;

    if (edit.op === 'replace') {
        key += `:${edit.pos.line}#${edit.pos.hash}`;
        if (edit.end) {
            key += `:${edit.end.line}#${edit.end.hash}`;
        }
    } else if (edit.op === 'append' || edit.op === 'prepend') {
        if (edit.pos) {
            key += `:${edit.pos.line}#${edit.pos.hash}`;
        }
    }

    key += `:${edit.lines.join('\n')}`;
    return key;
}

/**
 * Get the sort line number for an edit.
 * Used to sort edits bottom-up.
 */
export function getSortLine(edit: HashlineEdit, fileLen: number): number {
    if (edit.op === 'replace') {
        return edit.end?.line ?? edit.pos.line;
    } else if (edit.op === 'append') {
        return edit.pos?.line ?? fileLen;
    } else {
        // prepend
        return edit.pos?.line ?? 1;
    }
}

/**
 * Get the precedence for sorting.
 * Lower values are applied first (when sorting DESC by sortLine).
 * 0 = replace, 1 = append, 2 = prepend
 */
export function getPrecedence(edit: HashlineEdit): number {
    switch (edit.op) {
        case 'replace':
            return 0;
        case 'append':
            return 1;
        case 'prepend':
            return 2;
    }
}

/**
 * Apply a single edit to the file lines array.
 * Returns the line number that was changed, or undefined if no-op.
 * Mutates fileLines in place.
 */
export function applySingleEdit(edit: HashlineEdit, fileLines: string[]): number | undefined {
    if (edit.op === 'replace') {
        return applyReplace(edit, fileLines);
    } else if (edit.op === 'append') {
        return applyAppend(edit, fileLines);
    } else {
        return applyPrepend(edit, fileLines);
    }
}

function applyReplace(edit: HashlineEditReplace, fileLines: string[]): number | undefined {
    const posIdx = edit.pos.line - 1;
    const linesToInsert = edit.lines;

    // Check for no-op: replacing with same content
    if (edit.end) {
        // Range replace
        const endIdx = edit.end.line - 1;
        const rangeLength = endIdx - posIdx + 1;
        const existingContent = fileLines.slice(posIdx, endIdx + 1).join('\n');
        const newContent = linesToInsert.join('\n');

        if (existingContent === newContent && linesToInsert.length === rangeLength) {
            return undefined; // no-op
        }

        fileLines.splice(posIdx, rangeLength, ...linesToInsert);
        return edit.pos.line;
    } else {
        // Single line replace
        if (linesToInsert.length === 1 && fileLines[posIdx] === linesToInsert[0]) {
            return undefined; // no-op
        }

        fileLines.splice(posIdx, 1, ...linesToInsert);
        return edit.pos.line;
    }
}

function applyAppend(edit: HashlineEditAppend, fileLines: string[]): number | undefined {
    if (edit.lines.length === 0) {
        // Empty append - insert blank line
        if (edit.pos) {
            fileLines.splice(edit.pos.line, 0, '');
        } else {
            fileLines.push('');
        }
        return edit.pos ? edit.pos.line + 1 : fileLines.length;
    }

    if (edit.pos) {
        // Append after specific line
        fileLines.splice(edit.pos.line, 0, ...edit.lines);
        return edit.pos.line + 1;
    } else {
        // Append at EOF
        const startLine = fileLines.length;
        fileLines.push(...edit.lines);
        return startLine + 1;
    }
}

function applyPrepend(edit: HashlineEditPrepend, fileLines: string[]): number | undefined {
    if (edit.lines.length === 0) {
        // Empty prepend - insert blank line
        if (edit.pos) {
            fileLines.splice(edit.pos.line - 1, 0, '');
        } else {
            fileLines.splice(0, 0, '');
        }
        return edit.pos ? edit.pos.line - 1 : 1;
    }

    if (edit.pos) {
        // Prepend before specific line
        fileLines.splice(edit.pos.line - 1, 0, ...edit.lines);
        return edit.pos.line;
    } else {
        // Prepend at BOF
        fileLines.splice(0, 0, ...edit.lines);
        return 1;
    }
}

/**
 * Validate a single anchor reference.
 */
function validateRef(ref: Anchor, fileLines: string[], mismatches: HashMismatch[]): void {
    if (ref.line < 1 || ref.line > fileLines.length) {
        throw new Error(`Line ${ref.line} does not exist (file has ${fileLines.length} lines)`);
    }
    const actualHash = computeLineHash(ref.line, fileLines[ref.line - 1]);
    if (actualHash !== ref.hash) {
        mismatches.push({ line: ref.line, expected: ref.hash, actual: actualHash });
    }
}

/**
 * Apply an array of hashline edits to file content.
 *
 * Algorithm:
 * 1. Pre-validate ALL references before ANY mutation
 * 2. If any mismatch → throw HashlineMismatchError with all corrections
 * 3. Deduplicate identical edits
 * 4. Sort bottom-up (highest line first)
 * 5. Apply each edit via splice
 */
export function applyHashlineEdits(text: string, edits: HashlineEdit[]): ApplyResult {
    if (edits.length === 0) {
        return { text, firstChangedLine: undefined };
    }

    // Handle empty text properly - split gives [''] for empty string
    // which we want to treat as []
    const fileLines = text === '' ? [] : text.split('\n');
    const noopEdits: Array<{ editIndex: number; loc: string }> = [];
    const warnings: string[] = [];
    let firstChangedLine: number | undefined;

    // Step 1: Pre-validate ALL references
    const mismatches: HashMismatch[] = [];

    for (const edit of edits) {
        switch (edit.op) {
            case 'replace':
                validateRef(edit.pos, fileLines, mismatches);
                if (edit.end) validateRef(edit.end, fileLines, mismatches);
                break;
            case 'append':
                if (edit.pos) validateRef(edit.pos, fileLines, mismatches);
                break;
            case 'prepend':
                if (edit.pos) validateRef(edit.pos, fileLines, mismatches);
                break;
        }
    }

    if (mismatches.length > 0) {
        throw new HashlineMismatchError(mismatches, fileLines);
    }

    // Step 2: Deduplicate identical edits
    const seenKeys = new Map<string, number>();
    const dedupIndices = new Set<number>();

    for (let i = 0; i < edits.length; i++) {
        const key = editKey(edits[i]);
        if (seenKeys.has(key)) {
            dedupIndices.add(i);
        } else {
            seenKeys.set(key, i);
        }
    }

    // Filter out duplicates
    const filteredEdits = edits.filter((_, i) => !dedupIndices.has(i));

    // Step 3: Sort bottom-up
    const annotated = filteredEdits.map((edit, idx) => ({
        edit,
        idx,
        sortLine: getSortLine(edit, fileLines.length),
        precedence: getPrecedence(edit),
    }));

    annotated.sort(
        (a, b) => b.sortLine - a.sortLine || a.precedence - b.precedence || a.idx - b.idx
    );

    // Step 4: Apply bottom-up
    for (const { edit, idx } of annotated) {
        const changedLine = applySingleEdit(edit, fileLines);

        if (changedLine !== undefined) {
            if (firstChangedLine === undefined || changedLine < firstChangedLine) {
                firstChangedLine = changedLine;
            }
        } else {
            // Detect no-op edits and record them
            const loc =
                edit.op === 'replace' && edit.pos
                    ? `line ${edit.pos.line}${edit.end ? `-${edit.end.line}` : ''}`
                    : edit.op === 'append' && edit.pos
                      ? `after line ${edit.pos.line}`
                      : edit.op === 'prepend' && edit.pos
                        ? `before line ${edit.pos.line}`
                        : edit.op === 'append'
                          ? 'EOF'
                          : 'BOF';

            noopEdits.push({
                editIndex: idx,
                loc,
            });
        }
    }

    return {
        text: fileLines.join('\n'),
        firstChangedLine,
        ...(warnings.length > 0 ? { warnings } : {}),
        ...(noopEdits.length > 0 ? { noopEdits } : {}),
    };
}
