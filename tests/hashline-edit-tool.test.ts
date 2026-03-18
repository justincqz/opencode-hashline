import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { executeHashlineEdit, resolveEditAnchors, generateDiffPreview } from '../src/tool';
import { computeLineHash, formatLineTag } from '../src/core';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create an anchor string "LINE#HASH" for the given text and line number.
 */
function anchor(text: string, lineNum: number): string {
    const lines = text.split('\n');
    return formatLineTag(lineNum, lines[lineNum - 1]);
}

/**
 * Create a temporary directory, run `fn`, then clean up.
 */
async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hashline-test-'));
    try {
        await fn(dir);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
}

/**
 * Run the hashline-edit tool with `worktree` set to the temp dir.
 */
async function runTool(
    worktree: string,
    args: Parameters<typeof executeHashlineEdit>[0]
): Promise<string> {
    return executeHashlineEdit(args, { worktree });
}

// ─── Basic operations ─────────────────────────────────────────────────────────

describe('hashline-edit tool', () => {
    // 1. Replace single line
    test('1. replace single line → file content updated', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'line one\nline two\nline three';
            await fs.writeFile(file, content, 'utf-8');

            const result = await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchor(content, 2),
                        lines: ['REPLACED'],
                    },
                ],
            });

            expect(result).toContain('Updated test.txt');
            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('line one\nREPLACED\nline three');
        });
    });

    // 2. Replace range (pos to end)
    test('2. replace range (pos to end) → range replaced', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'a\nb\nc\nd\ne';
            await fs.writeFile(file, content, 'utf-8');

            const result = await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchor(content, 2),
                        end: anchor(content, 4),
                        lines: ['X', 'Y'],
                    },
                ],
            });

            expect(result).toContain('Updated test.txt');
            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('a\nX\nY\ne');
        });
    });

    // 3. Append after line
    test('3. append after line → lines inserted after', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'first\nsecond\nthird';
            await fs.writeFile(file, content, 'utf-8');

            await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'append',
                        pos: anchor(content, 1),
                        lines: ['inserted'],
                    },
                ],
            });

            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('first\ninserted\nsecond\nthird');
        });
    });

    // 4. Append at EOF (no pos)
    test('4. append at EOF (no pos) → lines added at end', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'line one\nline two';
            await fs.writeFile(file, content, 'utf-8');

            await runTool(dir, {
                path: 'test.txt',
                edits: [{ op: 'append', lines: ['line three'] }],
            });

            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('line one\nline two\nline three');
        });
    });

    // 5. Prepend before line
    test('5. prepend before line → lines inserted before', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'first\nsecond\nthird';
            await fs.writeFile(file, content, 'utf-8');

            await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'prepend',
                        pos: anchor(content, 2),
                        lines: ['inserted before second'],
                    },
                ],
            });

            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('first\ninserted before second\nsecond\nthird');
        });
    });

    // 6. Prepend at BOF (no pos)
    test('6. prepend at BOF (no pos) → lines added at start', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'line one\nline two';
            await fs.writeFile(file, content, 'utf-8');

            await runTool(dir, {
                path: 'test.txt',
                edits: [{ op: 'prepend', lines: ['line zero'] }],
            });

            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('line zero\nline one\nline two');
        });
    });

    // ─── File operations ──────────────────────────────────────────────────────

    // 7. Delete file
    test('7. delete file → file removed', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'to-delete.txt');
            await fs.writeFile(file, 'content', 'utf-8');

            const result = await runTool(dir, {
                path: 'to-delete.txt',
                edits: [],
                delete: true,
            });

            expect(result).toContain('Deleted');
            const exists = await fs
                .access(file)
                .then(() => true)
                .catch(() => false);
            expect(exists).toBe(false);
        });
    });

    // 8. Create file (no existing file + append without pos)
    test('8. create file → file created with content', async () => {
        await withTmpDir(async (dir) => {
            const result = await runTool(dir, {
                path: 'new-file.txt',
                edits: [{ op: 'append', lines: ['hello', 'world'] }],
            });

            expect(result).toContain('Created new-file.txt');
            const file = path.join(dir, 'new-file.txt');
            const content = await fs.readFile(file, 'utf-8');
            expect(content).toBe('hello\nworld');
        });
    });

    // 9. Move/rename file
    test('9. move/rename file → old path deleted, new path has content', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'original.txt');
            const content = 'some content';
            await fs.writeFile(file, content, 'utf-8');

            const result = await runTool(dir, {
                path: 'original.txt',
                edits: [{ op: 'append', lines: ['extra'] }],
                move: 'renamed.txt',
            });

            expect(result).toContain('renamed.txt');

            const oldExists = await fs
                .access(file)
                .then(() => true)
                .catch(() => false);
            expect(oldExists).toBe(false);

            const newFile = path.join(dir, 'renamed.txt');
            const newExists = await fs
                .access(newFile)
                .then(() => true)
                .catch(() => false);
            expect(newExists).toBe(true);
        });
    });

    // ─── Input normalization ──────────────────────────────────────────────────

    // 10. Lines as string → split on newline
    test('10. lines as string → split on newline', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'line one\nline two\nline three';
            await fs.writeFile(file, content, 'utf-8');

            await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchor(content, 2),
                        lines: 'replaced line A\nreplaced line B' as unknown as string[],
                    },
                ],
            });

            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('line one\nreplaced line A\nreplaced line B\nline three');
        });
    });

    // 11. Lines as null → treated as empty (delete line for replace)
    test('11. lines as null → empty lines (replace deletes content)', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'line one\nline two\nline three';
            await fs.writeFile(file, content, 'utf-8');

            await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchor(content, 2),
                        lines: null,
                    },
                ],
            });

            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('line one\nline three');
        });
    });

    // 12. Auto-strip hashline prefixes from replacement content
    test('12. auto-strip hashline prefixes from replacement content', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'line one\nline two\nline three';
            await fs.writeFile(file, content, 'utf-8');

            // Lines with hashline prefixes (as if LLM copied from read output)
            const linesWithPrefixes = ['1#8c2f:replaced one', '2#6769:replaced two'];

            await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchor(content, 2),
                        lines: linesWithPrefixes,
                    },
                ],
            });

            const updated = await fs.readFile(file, 'utf-8');
            // Should have stripped the "N#HASH:" prefixes
            expect(updated).toBe('line one\nreplaced one\nreplaced two\nline three');
        });
    });

    // 13. Auto-strip diff + markers from replacement content
    test('13. auto-strip diff + markers from replacement content', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'line one\nline two\nline three';
            await fs.writeFile(file, content, 'utf-8');

            // Lines with + diff markers
            const linesWithMarkers = ['+ replaced A', '+ replaced B'];

            await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchor(content, 2),
                        lines: linesWithMarkers,
                    },
                ],
            });

            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('line one\nreplaced A\nreplaced B\nline three');
        });
    });

    // ─── Error handling ───────────────────────────────────────────────────────

    // 14. Stale hash → HashlineMismatchError with correct tags
    test('14. stale hash → error with corrected tags', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            await fs.writeFile(file, 'line one\nline two\nline three', 'utf-8');

            // Use a stale/wrong hash
            const result = await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: '2#dead', // wrong hash
                        lines: ['new line two'],
                    },
                ],
            });

            // Should return the mismatch error message (not throw)
            expect(result).toContain('changed since last read');
            expect(result).toContain('>>>');
        });
    });

    // 15. File not found (and not a create op) → descriptive error
    test('15. file not found with non-create op → descriptive error', async () => {
        await withTmpDir(async (dir) => {
            await expect(
                runTool(dir, {
                    path: 'nonexistent.txt',
                    edits: [
                        {
                            op: 'replace',
                            pos: '1#abcd',
                            lines: ['content'],
                        },
                    ],
                })
            ).rejects.toThrow('File not found: nonexistent.txt');
        });
    });

    // 16. No-op edit → error message
    test('16. no-op edit → error with descriptive message', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'line one\nline two\nline three';
            await fs.writeFile(file, content, 'utf-8');

            // Replace with same content (no-op)
            await expect(
                runTool(dir, {
                    path: 'test.txt',
                    edits: [
                        {
                            op: 'replace',
                            pos: anchor(content, 2),
                            lines: ['line two'], // same as current line 2
                        },
                    ],
                })
            ).rejects.toThrow('No changes made');
        });
    });

    // 17. Invalid anchor format → error message
    test('17. invalid anchor format → error thrown', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            await fs.writeFile(file, 'content', 'utf-8');

            await expect(
                runTool(dir, {
                    path: 'test.txt',
                    edits: [
                        {
                            op: 'replace',
                            pos: 'not-a-valid-anchor',
                            lines: ['content'],
                        },
                    ],
                })
            ).rejects.toThrow();
        });
    });

    // ─── Encoding preservation ────────────────────────────────────────────────

    // 18. BOM preserved through edit cycle
    test('18. BOM preserved through edit cycle', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'bom.txt');
            const content = 'line one\nline two\nline three';
            // Write with BOM
            await fs.writeFile(file, `\uFEFF${content}`, 'utf-8');

            const rawBefore = await fs.readFile(file, 'utf-8');
            expect(rawBefore.charCodeAt(0)).toBe(0xfeff);

            await runTool(dir, {
                path: 'bom.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchor(content, 2),
                        lines: ['updated line two'],
                    },
                ],
            });

            const rawAfter = await fs.readFile(file, 'utf-8');
            // BOM still present
            expect(rawAfter.charCodeAt(0)).toBe(0xfeff);
            // Content correct
            expect(rawAfter.slice(1)).toBe('line one\nupdated line two\nline three');
        });
    });

    // 19. CRLF line endings preserved through edit cycle
    test('19. CRLF line endings preserved through edit cycle', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'crlf.txt');
            const contentLF = 'line one\nline two\nline three';
            // Write with CRLF
            await fs.writeFile(file, contentLF.replace(/\n/g, '\r\n'), 'utf-8');

            // Compute anchor on LF content (normalization happens internally)
            const anchorStr = anchor(contentLF, 2);

            await runTool(dir, {
                path: 'crlf.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchorStr,
                        lines: ['updated line two'],
                    },
                ],
            });

            const rawAfter = await fs.readFile(file, 'utf-8');
            // Should still have CRLF
            expect(rawAfter).toBe('line one\r\nupdated line two\r\nline three');
        });
    });

    // ─── Diff preview ─────────────────────────────────────────────────────────

    // 20. Output includes diff showing what changed
    test('20. output includes diff showing what changed', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'line one\nline two\nline three';
            await fs.writeFile(file, content, 'utf-8');

            const result = await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchor(content, 2),
                        lines: ['changed line'],
                    },
                ],
            });

            expect(result).toContain('Updated test.txt');
            // Diff preview should show removed and added lines
            expect(result).toContain('- line two');
            expect(result).toContain('+ changed line');
        });
    });

    // 21. Long unchanged sections collapsed
    test('21. long unchanged sections collapsed', () => {
        const oldLines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`);
        const newLines = [...oldLines];
        newLines[10] = 'CHANGED';

        const oldText = oldLines.join('\n');
        const newText = newLines.join('\n');

        const diff = generateDiffPreview(oldText, newText);
        expect(diff).toContain('unchanged lines');
        expect(diff).toContain('CHANGED');
    });

    // ─── Multiple edits ───────────────────────────────────────────────────────

    // 22. Two edits in one call → both applied correctly
    test('22. two edits in one call → both applied', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'a\nb\nc\nd\ne';
            await fs.writeFile(file, content, 'utf-8');

            await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchor(content, 1),
                        lines: ['A'],
                    },
                    {
                        op: 'replace',
                        pos: anchor(content, 5),
                        lines: ['E'],
                    },
                ],
            });

            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('A\nb\nc\nd\nE');
        });
    });

    // 23. Edits applied bottom-up (correct ordering)
    test('23. edits applied bottom-up (correct ordering)', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'a\nb\nc\nd\ne';
            await fs.writeFile(file, content, 'utf-8');

            // Both inserts after lines — bottom-up ensures top anchors are still valid
            await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'append',
                        pos: anchor(content, 1),
                        lines: ['after-a'],
                    },
                    {
                        op: 'append',
                        pos: anchor(content, 3),
                        lines: ['after-c'],
                    },
                ],
            });

            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('a\nafter-a\nb\nc\nafter-c\nd\ne');
        });
    });

    // ─── Path traversal security ─────────────────────────────────────────────

    // 24. Path traversal on main file → error
    test('24. path traversal escapes worktree → error thrown', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            await fs.writeFile(file, 'content', 'utf-8');

            await expect(
                runTool(dir, {
                    path: '../../etc/passwd',
                    edits: [
                        {
                            op: 'replace',
                            pos: '1#abcd',
                            lines: ['hacked'],
                        },
                    ],
                })
            ).rejects.toThrow('escapes the worktree');
        });
    });

    // 25. Path traversal on delete → error thrown
    test('25. path traversal on delete → error thrown', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            await fs.writeFile(file, 'content', 'utf-8');

            await expect(
                runTool(dir, {
                    path: '../../etc/passwd',
                    edits: [],
                    delete: true,
                })
            ).rejects.toThrow('escapes the worktree');
        });
    });

    // 26. Path traversal on move target → error thrown
    test('26. path traversal on move target → error thrown', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'some content';
            await fs.writeFile(file, content, 'utf-8');

            await expect(
                runTool(dir, {
                    path: 'test.txt',
                    edits: [{ op: 'append', lines: ['extra'] }],
                    move: '../../malicious.txt',
                })
            ).rejects.toThrow('escapes the worktree');
        });
    });

    // 27. Normal relative paths work fine
    test('27. normal relative paths work fine', async () => {
        await withTmpDir(async (dir) => {
            const subdir = path.join(dir, 'src');
            await fs.mkdir(subdir, { recursive: true });
            const file = path.join(subdir, 'test.txt');
            await fs.writeFile(file, 'line one\nline two', 'utf-8');

            const result = await runTool(dir, {
                path: 'src/test.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchor('line one\nline two', 1),
                        lines: ['modified'],
                    },
                ],
            });

            expect(result).toContain('Updated src/test.txt');
            const updated = await fs.readFile(file, 'utf-8');
            expect(updated).toBe('modified\nline two');
        });
    });

    // ─── Input validation ───────────────────────────────────────────────────

    // 28. parseLines strips \r from array input
    test('28. parseLines strips carriage return from array', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            const content = 'line one\nline two';
            await fs.writeFile(file, content, 'utf-8');

            // Pass lines as array with \r characters (as if from LLM)
            await runTool(dir, {
                path: 'test.txt',
                edits: [
                    {
                        op: 'replace',
                        pos: anchor(content, 1),
                        lines: ['line\r', 'other\r'],
                    },
                ],
            });

            const updated = await fs.readFile(file, 'utf-8');
            // \r should be stripped
            expect(updated).toBe('line\nother\nline two');
        });
    });

    // 29. Invalid edits (non-array JSON string) → error thrown
    test('29. invalid edits (non-array JSON) → error thrown', async () => {
        await withTmpDir(async (dir) => {
            const file = path.join(dir, 'test.txt');
            await fs.writeFile(file, 'content', 'utf-8');

            await expect(
                runTool(dir, {
                    path: 'test.txt',
                    edits: '{"not": "an array"}' as unknown as any,
                    delete: true,
                })
            ).rejects.toThrow('expected an array');
        });
    });
});
