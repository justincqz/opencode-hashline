import { describe, expect, test } from 'bun:test';
import {
    HASHLINE_EDIT_DESCRIPTION,
    SYSTEM_PROMPT_ADDITION,
    READ_TOOL_ADDENDUM,
    EDIT_TOOL_ADDENDUM,
} from '../src/prompt';

describe('HASHLINE_EDIT_DESCRIPTION', () => {
    test('is a non-empty string', () => {
        expect(typeof HASHLINE_EDIT_DESCRIPTION).toBe('string');
        expect(HASHLINE_EDIT_DESCRIPTION.length).toBeGreaterThan(0);
    });

    test('contains replace operation description', () => {
        expect(HASHLINE_EDIT_DESCRIPTION).toContain('replace');
    });

    test('contains append operation description', () => {
        expect(HASHLINE_EDIT_DESCRIPTION).toContain('append');
    });

    test('contains prepend operation description', () => {
        expect(HASHLINE_EDIT_DESCRIPTION).toContain('prepend');
    });

    test('contains rule about reading file first', () => {
        expect(HASHLINE_EDIT_DESCRIPTION).toContain('Read the file first');
    });

    test('contains rule about one call per file', () => {
        expect(HASHLINE_EDIT_DESCRIPTION).toContain('One hashline-edit call per file');
    });

    test('contains rule about exact indentation', () => {
        expect(HASHLINE_EDIT_DESCRIPTION).toContain('exact content with correct indentation');
    });

    test('contains rule about block boundaries', () => {
        expect(HASHLINE_EDIT_DESCRIPTION).toContain('Block boundaries travel together');
    });

    test('contains rule about not including LINE#HASH prefixes in replacement content', () => {
        expect(HASHLINE_EDIT_DESCRIPTION).toContain('Never include LINE#HASH:');
    });

    test('contains delete file operation', () => {
        expect(HASHLINE_EDIT_DESCRIPTION).toContain('delete');
    });

    test('contains move file operation', () => {
        expect(HASHLINE_EDIT_DESCRIPTION).toContain('move');
    });

    test('does NOT contain backtick code blocks', () => {
        expect(HASHLINE_EDIT_DESCRIPTION).not.toContain('```');
    });
});

describe('SYSTEM_PROMPT_ADDITION', () => {
    test('is a non-empty string', () => {
        expect(typeof SYSTEM_PROMPT_ADDITION).toBe('string');
        expect(SYSTEM_PROMPT_ADDITION.length).toBeGreaterThan(0);
    });

    test('contains all 5 numbered rules', () => {
        expect(SYSTEM_PROMPT_ADDITION).toContain('1.');
        expect(SYSTEM_PROMPT_ADDITION).toContain('2.');
        expect(SYSTEM_PROMPT_ADDITION).toContain('3.');
        expect(SYSTEM_PROMPT_ADDITION).toContain('4.');
        expect(SYSTEM_PROMPT_ADDITION).toContain('5.');
    });

    test('contains hashline-edit tool name', () => {
        expect(SYSTEM_PROMPT_ADDITION).toContain('hashline-edit');
    });

    test('is under 500 characters (conciseness constraint)', () => {
        expect(SYSTEM_PROMPT_ADDITION.length).toBeLessThan(500);
    });
});

describe('READ_TOOL_ADDENDUM', () => {
    test('is a non-empty string', () => {
        expect(typeof READ_TOOL_ADDENDUM).toBe('string');
        expect(READ_TOOL_ADDENDUM.length).toBeGreaterThan(0);
    });

    test('contains LINE#HASH', () => {
        expect(READ_TOOL_ADDENDUM).toContain('LINE#HASH');
    });

    test('contains hashline-edit', () => {
        expect(READ_TOOL_ADDENDUM).toContain('hashline-edit');
    });
});

describe('EDIT_TOOL_ADDENDUM', () => {
    test('is a non-empty string', () => {
        expect(typeof EDIT_TOOL_ADDENDUM).toBe('string');
        expect(EDIT_TOOL_ADDENDUM.length).toBeGreaterThan(0);
    });

    test('contains hashline-edit', () => {
        expect(EDIT_TOOL_ADDENDUM).toContain('hashline-edit');
    });

    test('contains LINE#HASH', () => {
        expect(EDIT_TOOL_ADDENDUM).toContain('LINE#HASH');
    });
});

describe('Import check', () => {
    test('all four constants are importable from the module', () => {
        // This test ensures all exports exist and are strings
        const allExports = [
            HASHLINE_EDIT_DESCRIPTION,
            SYSTEM_PROMPT_ADDITION,
            READ_TOOL_ADDENDUM,
            EDIT_TOOL_ADDENDUM,
        ];

        allExports.forEach((exp) => {
            expect(typeof exp).toBe('string');
            expect(exp.length).toBeGreaterThan(0);
        });
    });
});
