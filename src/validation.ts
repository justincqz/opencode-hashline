// Hashline validation

import { computeLineHash } from './core';
import { HashlineMismatchError } from './errors';
import type { Anchor } from './types';

/**
 * Validate a single line reference against file content.
 */
export function validateLineRef(ref: Anchor, fileLines: string[]): void {
    if (ref.line < 1 || ref.line > fileLines.length) {
        throw new Error(`Line ${ref.line} does not exist (file has ${fileLines.length} lines)`);
    }
    const actualHash = computeLineHash(ref.line, fileLines[ref.line - 1]);
    if (actualHash !== ref.hash) {
        throw new HashlineMismatchError(
            [{ line: ref.line, expected: ref.hash, actual: actualHash }],
            fileLines
        );
    }
}
