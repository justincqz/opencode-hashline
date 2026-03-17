// Hashline OpenCode plugin hooks

import { computeLineHash } from "./core";
import { parseReadOutput, reconstructReadOutput } from "./normalization";

/**
 * Create hashline plugin hooks for OpenCode.
 */
export function createHashlineHooks(): {
  "tool.execute.after": (
    input: { tool: string; sessionID: string; callID: string; args: any },
    output: { title: string; output: string; metadata: any }
  ) => Promise<void>;
  "tool.definition": (
    input: { toolID: string },
    output: { description: string; parameters: any }
  ) => Promise<void>;
  "experimental.chat.system.transform": (
    input: { sessionID?: string; model: string },
    output: { system: string[] }
  ) => Promise<void>;
} {
  return {
    /**
     * Hook 1: Transform read tool output to include LINE#HASH prefixes.
     */
    "tool.execute.after": async (input, output) => {
      try {
        // Only process read tool output
        if (input.tool !== "read") {
          return;
        }

        // Don't hashify write tool confirmations
        if (output.output.includes("File written successfully")) {
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
        const hashifiedLines = parsed.contentLines.map((item) => {
          return item.content;
        });

        // Reconstruct the output with hash prefixes
        const reconstructed = reconstructReadOutput(parsed, hashifiedLines, true);
        output.output = reconstructed;
      } catch {
        // NEVER break read if formatting fails - graceful fallback
        return;
      }
    },

    /**
     * Hook 2: Redirect edit/patch tools to hashline-edit.
     */
    "tool.definition": async (input, output) => {
      if (input.toolID === "read") {
        output.description +=
          " Output includes LINE#HASH prefixes for content-addressed editing. Use hashline-edit tool.";
      } else if (input.toolID === "edit" || input.toolID === "patch") {
        output.description =
          "DEPRECATED - For precise line-addressed editing, prefer the hashline-edit tool with LINE#HASH references.\n\n" +
          output.description;
      }
    },

    /**
     * Hook 3: Append hashline usage instructions to system prompt.
     */
    "experimental.chat.system.transform": async (input, output) => {
      const hashlineInstructions = `When editing files, use LINE#HASH tags. Follow these rules:
1. Read the file first to get LINE#HASH anchors
2. Use hashline-edit tool for precise edits
3. Batch all edits for a file in one call when possible
4. If you get a hash mismatch error, re-read the file to get updated anchors
5. Never copy LINE#HASH: prefixes into replacement content`;

      output.system.push(hashlineInstructions);
    },
  };
}
