import type { Plugin, Hooks } from '@opencode-ai/plugin';
import { createHashlineHooks } from './plugin';
import { hashlineEditTool } from './tool';
import {
    fnv1a,
    computeLineHash,
    formatLineTag,
    formatHashLines,
    parseTag,
    validateLineRef,
} from './core';
import { HashlineMismatchError } from './errors';
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
export { hashlineEditTool, resolveEditAnchors, generateDiffPreview, executeHashlineEdit };

const HashlinePlugin: Plugin = async (ctx) => {
    const hooks = createHashlineHooks();
    return {
        ...hooks,
        tool: {
            'hashline-edit': hashlineEditTool,
        },
    } as unknown as Hooks;
};

export default HashlinePlugin;
