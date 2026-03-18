import type { Plugin } from '@opencode-ai/plugin';
import { tool } from '@opencode-ai/plugin';
import { createHashlineHooks } from './plugin';
import { resolveEditAnchors, generateDiffPreview, executeHashlineEdit } from './tool';
import type { ToolArgs, ToolContext } from './tool';
import { fnv1a, computeLineHash, formatLineTag, formatHashLines, parseTag } from './core';
import { HashlineMismatchError } from './errors';
import { validateLineRef } from './validation';
import {
    stripHashlinePrefixes,
    stripDiffPlusMarkers,
    stripBom,
    detectLineEnding,
    normalizeToLF,
    restoreLineEndings,
    parseReadOutput,
    reconstructReadOutput,
} from './normalization';
import {
    applyHashlineEdits,
    applySingleEdit,
    editKey,
    getSortLine,
    getPrecedence,
} from './edit-engine';
import type {
    Anchor,
    HashlineEdit,
    HashMismatch,
    HashlineEditReplace,
    HashlineEditAppend,
    HashlineEditPrepend,
    HashlineToolEdit,
    ApplyResult,
} from './types';
import {
    HASHLINE_EDIT_DESCRIPTION,
    SYSTEM_PROMPT_ADDITION,
    READ_TOOL_ADDENDUM,
    EDIT_TOOL_ADDENDUM,
} from './prompt';

// Re-export core functions
export { fnv1a, computeLineHash, formatLineTag, formatHashLines, parseTag, validateLineRef };

// Re-export errors
export { HashlineMismatchError };

// Re-export normalization functions
export {
    stripHashlinePrefixes,
    stripDiffPlusMarkers,
    stripBom,
    detectLineEnding,
    normalizeToLF,
    restoreLineEndings,
    parseReadOutput,
    reconstructReadOutput,
};

// Re-export edit engine functions
export { applyHashlineEdits, applySingleEdit, editKey, getSortLine, getPrecedence };

// Re-export types
export type {
    Anchor,
    HashlineEdit,
    HashMismatch,
    HashlineEditReplace,
    HashlineEditAppend,
    HashlineEditPrepend,
    HashlineToolEdit,
    ApplyResult,
};

// Re-export prompt constants
export {
    HASHLINE_EDIT_DESCRIPTION,
    SYSTEM_PROMPT_ADDITION,
    READ_TOOL_ADDENDUM,
    EDIT_TOOL_ADDENDUM,
};

// Re-export plugin functions
export { createHashlineHooks };

// Re-export tool
export { resolveEditAnchors, generateDiffPreview, executeHashlineEdit };

const HashlinePlugin: Plugin = async (_ctx) => {
    const hooks = createHashlineHooks();
    return {
        ...hooks,
        tool: {
            edit: tool({
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
                                    .union([
                                        tool.schema.array(tool.schema.string()),
                                        tool.schema.string(),
                                    ])
                                    .nullable()
                                    .describe(
                                        'Content to insert: string[] (multiple lines) or string (single line) or null'
                                    ),
                            })
                        )
                        .describe(
                            'List of edits. Each needs op, lines, and pos (except append/prepend without pos)'
                        ),
                    delete: tool.schema
                        .boolean()
                        .optional()
                        .describe('Set to true to delete the file'),
                    move: tool.schema
                        .string()
                        .optional()
                        .describe('New path to rename/move the file after editing'),
                },
                async execute(args: any, context: any) {
                    return executeHashlineEdit(args as ToolArgs, context as ToolContext);
                },
            }),
        },
    };
};

export default HashlinePlugin;
