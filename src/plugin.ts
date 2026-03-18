// Hashline OpenCode plugin hooks

import type { Model } from '@opencode-ai/sdk';
import { parseReadOutput, reconstructReadOutput } from './normalization';
import { SYSTEM_PROMPT_ADDITION, READ_TOOL_ADDENDUM, EDIT_TOOL_ADDENDUM } from './prompt';

/**
 * Create hashline plugin hooks for OpenCode.
 */
export function createHashlineHooks(): {
    'tool.execute.after': (
        input: { tool: string; sessionID: string; callID: string; args: any },
        output: { title: string; output: string; metadata: any }
    ) => Promise<void>;
    'tool.definition': (
        input: { toolID: string },
        output: { description: string; parameters: any }
    ) => Promise<void>;
    'experimental.chat.system.transform': (
        input: { sessionID?: string; model: Model },
        output: { system: string[] }
    ) => Promise<void>;
} {
    return {
        /**
         * Hook 1: Transform read tool output to include LINE#HASH prefixes.
         */
        'tool.execute.after': async (input, output) => {
            try {
                // Only process read tool output
                if (input.tool !== 'read') {
                    return;
                }

                // Don't hashify write tool confirmations
                if (output.output.includes('File written successfully')) {
                    return;
                }

                // Parse the read output
                const parsed = parseReadOutput(output.output);
                if (!parsed) {
                    return; // Graceful fallback for unrecognized format
                }

                // Skip if no content lines
                if (parsed.contentLines.length === 0) {
                    return;
                }

                // Hashify each content line - pass the original content
                const reconstructed = reconstructReadOutput(
                    parsed,
                    parsed.contentLines.map((item) => item.content),
                    true
                );
                output.output = reconstructed;
            } catch {
                // NEVER break read if formatting fails - graceful fallback
                return;
            }
        },

        /**
         * Hook 2: Redirect edit/patch tools to hashline-edit.
         */
        'tool.definition': async (input, output) => {
            if (input.toolID === 'read') {
                output.description += ` ${READ_TOOL_ADDENDUM}`;
            } else if (input.toolID === 'edit' || input.toolID === 'patch') {
                output.description = `${EDIT_TOOL_ADDENDUM}\n\n${output.description}`;
            }
        },

        /**
         * Hook 3: Append hashline usage instructions to system prompt.
         */
        'experimental.chat.system.transform': async (_input, output) => {
            output.system.push(SYSTEM_PROMPT_ADDITION);
        },
    };
}
