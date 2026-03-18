// Hashline types

// ─── Constants ─────────────────────────────────────────────────────

export const HASH_BITS = 16;
export const HASH_MASK = 0xffff;
export const HASH_CHARS = 4;

// Pattern for detecting lines with meaningful content
export const RE_SIGNIFICANT = /[\p{L}\p{N}]/u;

// Pattern for parsing line references
export const TAG_REGEX = /^\s*[>+-]*\s*(\d+)\s*#\s*([0-9a-f]{4})/;

// ─── Core Types ───────────────────────────────────────────────────

export interface Anchor {
    line: number;
    hash: string;
}

export interface HashMismatch {
    line: number;
    expected: string;
    actual: string;
}

export type HashlineEditReplace = {
    op: 'replace';
    pos: Anchor;
    end?: Anchor;
    lines: string[];
};

export type HashlineEditAppend = {
    op: 'append';
    pos?: Anchor;
    lines: string[];
};

export type HashlineEditPrepend = {
    op: 'prepend';
    pos?: Anchor;
    lines: string[];
};

export type HashlineEdit = HashlineEditReplace | HashlineEditAppend | HashlineEditPrepend;

// Raw LLM input before parsing
export type HashlineToolEdit = {
    op: 'replace' | 'append' | 'prepend';
    pos?: string;
    end?: string;
    lines: string[] | string | null;
};

export interface ApplyResult {
    text: string;
    firstChangedLine?: number;
    warnings?: string[];
    noopEdits?: Array<{ editIndex: number; loc: string }>;
}
