import { describe, test, expect } from 'bun:test';
import {
    applyHashlineEdits,
    editKey,
    getSortLine,
    getPrecedence,
    applySingleEdit,
} from 'hashline/edit-engine';
import { HashlineMismatchError } from 'hashline/errors';
import { computeLineHash, formatLineTag } from 'hashline';
import type { HashlineEdit, Anchor } from 'hashline/types';

/**
 * Helper to create an anchor for a line in given text
 */
function anchor(text: string, lineNum: number): Anchor {
    const lines = text.split('\n');
    return {
        line: lineNum,
        hash: computeLineHash(lineNum, lines[lineNum - 1]),
    };
}

describe('editKey', () => {
    test('same edit produces same key', () => {
        const edit1: HashlineEdit = {
            op: 'replace',
            pos: { line: 1, hash: 'abcd' },
            lines: ['new content'],
        };
        const edit2: HashlineEdit = {
            op: 'replace',
            pos: { line: 1, hash: 'abcd' },
            lines: ['new content'],
        };
        expect(editKey(edit1)).toBe(editKey(edit2));
    });

    test('different content produces different key', () => {
        const edit1: HashlineEdit = {
            op: 'replace',
            pos: { line: 1, hash: 'abcd' },
            lines: ['content1'],
        };
        const edit2: HashlineEdit = {
            op: 'replace',
            pos: { line: 1, hash: 'abcd' },
            lines: ['content2'],
        };
        expect(editKey(edit1)).not.toBe(editKey(edit2));
    });
});

describe('getSortLine', () => {
    test('replace uses pos.line when no end', () => {
        const edit: HashlineEdit = {
            op: 'replace',
            pos: { line: 5, hash: 'abcd' },
            lines: [],
        };
        expect(getSortLine(edit, 10)).toBe(5);
    });

    test('replace uses end.line when present', () => {
        const edit: HashlineEdit = {
            op: 'replace',
            pos: { line: 3, hash: 'abcd' },
            end: { line: 7, hash: 'efgh' },
            lines: [],
        };
        expect(getSortLine(edit, 10)).toBe(7);
    });

    test('append uses pos.line when present', () => {
        const edit: HashlineEdit = {
            op: 'append',
            pos: { line: 5, hash: 'abcd' },
            lines: [],
        };
        expect(getSortLine(edit, 10)).toBe(5);
    });

    test('append uses fileLen when no pos', () => {
        const edit: HashlineEdit = {
            op: 'append',
            lines: [],
        };
        expect(getSortLine(edit, 10)).toBe(10);
    });

    test('prepend uses pos.line when present', () => {
        const edit: HashlineEdit = {
            op: 'prepend',
            pos: { line: 5, hash: 'abcd' },
            lines: [],
        };
        expect(getSortLine(edit, 10)).toBe(5);
    });

    test('prepend uses 1 when no pos', () => {
        const edit: HashlineEdit = {
            op: 'prepend',
            lines: [],
        };
        expect(getSortLine(edit, 10)).toBe(1);
    });
});

describe('getPrecedence', () => {
    test('replace has precedence 0', () => {
        const edit: HashlineEdit = { op: 'replace', pos: { line: 1, hash: 'a' }, lines: [] };
        expect(getPrecedence(edit)).toBe(0);
    });

    test('append has precedence 1', () => {
        const edit: HashlineEdit = { op: 'append', lines: [] };
        expect(getPrecedence(edit)).toBe(1);
    });

    test('prepend has precedence 2', () => {
        const edit: HashlineEdit = { op: 'prepend', lines: [] };
        expect(getPrecedence(edit)).toBe(2);
    });
});

describe('applySingleEdit', () => {
    test('replace single line', () => {
        const lines = ['old line'];
        const edit: HashlineEdit = {
            op: 'replace',
            pos: { line: 1, hash: computeLineHash(1, 'old line') },
            lines: ['new line'],
        };
        const result = applySingleEdit(edit, lines);
        expect(lines).toEqual(['new line']);
        expect(result).toBe(1);
    });

    test('replace with empty array deletes line', () => {
        const lines = ['delete me'];
        const edit: HashlineEdit = {
            op: 'replace',
            pos: { line: 1, hash: computeLineHash(1, 'delete me') },
            lines: [],
        };
        const result = applySingleEdit(edit, lines);
        expect(lines).toEqual([]);
        expect(result).toBe(1);
    });

    test('append after line', () => {
        const lines = ['line1', 'line2'];
        const edit: HashlineEdit = {
            op: 'append',
            pos: { line: 1, hash: computeLineHash(1, 'line1') },
            lines: ['inserted'],
        };
        const result = applySingleEdit(edit, lines);
        expect(lines).toEqual(['line1', 'inserted', 'line2']);
        expect(result).toBe(2);
    });

    test('append at EOF', () => {
        const lines = ['line1', 'line2'];
        const edit: HashlineEdit = {
            op: 'append',
            lines: ['line3'],
        };
        const result = applySingleEdit(edit, lines);
        expect(lines).toEqual(['line1', 'line2', 'line3']);
        expect(result).toBe(3);
    });

    test('prepend before line', () => {
        const lines = ['line1', 'line2'];
        const edit: HashlineEdit = {
            op: 'prepend',
            pos: { line: 2, hash: computeLineHash(2, 'line2') },
            lines: ['inserted'],
        };
        const result = applySingleEdit(edit, lines);
        expect(lines).toEqual(['line1', 'inserted', 'line2']);
        expect(result).toBe(2);
    });

    test('prepend at BOF', () => {
        const lines = ['line1', 'line2'];
        const edit: HashlineEdit = {
            op: 'prepend',
            lines: ['line0'],
        };
        const result = applySingleEdit(edit, lines);
        expect(lines).toEqual(['line0', 'line1', 'line2']);
        expect(result).toBe(1);
    });
});

describe('applyHashlineEdits', () => {
    // Single-line replace tests
    describe('Single-line replace', () => {
        test('1. Replace single line by anchor → content changes', () => {
            const text = 'line1\nline2\nline3';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 2),
                    lines: ['replaced'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line1\nreplaced\nline3');
        });

        test('2. Replace with same content → detected as no-op', () => {
            const text = 'line1\nline2\nline3';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 2),
                    lines: ['line2'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line1\nline2\nline3');
            expect(result.noopEdits).toBeDefined();
            expect(result.noopEdits).toHaveLength(1);
        });

        test('3. Replace with empty array → deletes the line', () => {
            const text = 'line1\nline2\nline3';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 2),
                    lines: [],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line1\nline3');
        });

        test('4. Replace with multiple lines → expands', () => {
            const text = 'line1\nline2\nline3';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 2),
                    lines: ['new1', 'new2', 'new3'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line1\nnew1\nnew2\nnew3\nline3');
        });
    });

    // Range replace tests
    describe('Range replace', () => {
        test('5. Replace range (pos to end) → replaces inclusive range', () => {
            const text = 'line1\nline2\nline3';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 2),
                    end: anchor(text, 3),
                    lines: ['new2'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line1\nnew2');
        });

        test('6. Range with fewer lines → shrinks block', () => {
            const text = 'line1\nline2\nline3\nline4';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 2),
                    end: anchor(text, 4),
                    lines: ['new2'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line1\nnew2');
        });

        test('7. Range with more lines → expands block', () => {
            const text = 'line1\nline2\nline3';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 2),
                    end: anchor(text, 2),
                    lines: ['new2', 'new3', 'new4'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line1\nnew2\nnew3\nnew4\nline3');
        });

        test('8. Range with same line count → swaps content', () => {
            const text = 'line1\nline2\nline3';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 1),
                    end: anchor(text, 2),
                    lines: ['a', 'b'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('a\nb\nline3');
        });
    });

    // Append tests
    describe('Append', () => {
        test('9. Append after anchored line', () => {
            const text = 'line1\nline2';
            const edits: HashlineEdit[] = [
                {
                    op: 'append',
                    pos: anchor(text, 1),
                    lines: ['after1'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line1\nafter1\nline2');
        });

        test('10. Append at EOF (no anchor)', () => {
            const text = 'line1\nline2';
            const edits: HashlineEdit[] = [
                {
                    op: 'append',
                    lines: ['line3'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line1\nline2\nline3');
        });

        test('11. Append empty lines → inserts blank line', () => {
            const text = 'line1';
            const edits: HashlineEdit[] = [
                {
                    op: 'append',
                    lines: [''],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line1\n');
        });
    });

    // Prepend tests
    describe('Prepend', () => {
        test('12. Prepend before anchored line', () => {
            const text = 'line1\nline2';
            const edits: HashlineEdit[] = [
                {
                    op: 'prepend',
                    pos: anchor(text, 2),
                    lines: ['before2'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line1\nbefore2\nline2');
        });

        test('13. Prepend at BOF (no anchor)', () => {
            const text = 'line1\nline2';
            const edits: HashlineEdit[] = [
                {
                    op: 'prepend',
                    lines: ['line0'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('line0\nline1\nline2');
        });

        test('14. Prepend empty lines → inserts blank line', () => {
            const text = 'line1';
            const edits: HashlineEdit[] = [
                {
                    op: 'prepend',
                    lines: [''],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('\nline1');
        });
    });

    // Validation tests
    describe('Validation', () => {
        test('15. Stale hash → throws HashlineMismatchError', () => {
            const text = 'line1\nline2';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: { line: 2, hash: '0000' }, // wrong hash
                    lines: ['new'],
                },
            ];
            expect(() => applyHashlineEdits(text, edits)).toThrow(HashlineMismatchError);
        });

        test('16. Error includes ALL mismatches (not just first)', () => {
            const text = 'line1\nline2\nline3';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: { line: 1, hash: '0000' },
                    lines: ['new1'],
                },
                {
                    op: 'replace',
                    pos: { line: 3, hash: '0000' },
                    lines: ['new3'],
                },
            ];
            try {
                applyHashlineEdits(text, edits);
                expect(true).toBe(false); // Should not reach here
            } catch (e) {
                expect(e).toBeInstanceOf(HashlineMismatchError);
                const error = e as HashlineMismatchError;
                expect(error.mismatches).toHaveLength(2);
                expect(error.mismatches[0].line).toBe(1);
                expect(error.mismatches[1].line).toBe(3);
            }
        });

        test('17. Line out of range → throws Error', () => {
            const text = 'line1\nline2';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: { line: 5, hash: 'abcd' },
                    lines: ['new'],
                },
            ];
            expect(() => applyHashlineEdits(text, edits)).toThrow();
        });

        test('18. Line 0 → throws Error', () => {
            const text = 'line1';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: { line: 0, hash: 'abcd' },
                    lines: ['new'],
                },
            ];
            expect(() => applyHashlineEdits(text, edits)).toThrow();
        });
    });

    // Multiple edits tests
    describe('Multiple edits', () => {
        test('19. Two non-overlapping edits applied correctly (bottom-up)', () => {
            const text = 'line1\nline2\nline3\nline4\nline5';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 1),
                    lines: ['new1'],
                },
                {
                    op: 'replace',
                    pos: anchor(text, 5),
                    lines: ['new5'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('new1\nline2\nline3\nline4\nnew5');
        });

        test('20. Three edits: replace + append + prepend in one call', () => {
            const text = 'line1\nline2';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 1),
                    lines: ['replaced'],
                },
                {
                    op: 'append',
                    pos: anchor(text, 2),
                    lines: ['appended'],
                },
                {
                    op: 'prepend',
                    lines: ['prepended'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('prepended\nreplaced\nline2\nappended');
        });

        test('21. Duplicate edits deduplicated', () => {
            const text = 'line1\nline2';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 1),
                    lines: ['new1'],
                },
                {
                    op: 'replace',
                    pos: anchor(text, 1),
                    lines: ['new1'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('new1\nline2');
        });

        test('22. Bottom-up ordering: edit on line 10 applied before edit on line 5', () => {
            const text = '1\n2\n3\n4\n5\n6\n7\n8\n9\n10';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 5),
                    lines: ['new5'],
                },
                {
                    op: 'replace',
                    pos: anchor(text, 10),
                    lines: ['new10'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('1\n2\n3\n4\nnew5\n6\n7\n8\n9\nnew10');
        });
    });

    // Edge cases
    describe('Edge cases', () => {
        test('23. File with single line', () => {
            const text = 'single';
            const edits: HashlineEdit[] = [
                {
                    op: 'replace',
                    pos: anchor(text, 1),
                    lines: ['changed'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('changed');
        });

        test('24. File with only newline (empty)', () => {
            const text = '';
            const edits: HashlineEdit[] = [
                {
                    op: 'append',
                    lines: ['new'],
                },
            ];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe('new');
        });

        test('25. Empty edits array → returns text unchanged', () => {
            const text = 'line1\nline2';
            const edits: HashlineEdit[] = [];
            const result = applyHashlineEdits(text, edits);
            expect(result.text).toBe(text);
        });
    });
});
