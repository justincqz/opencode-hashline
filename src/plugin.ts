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
          " Output includes LINE#HASH prefixes for content-addressed editing.";
      } else if (input.toolID === "edit" || input.toolID === "patch") {
        output.description = "DEPRECATED - use hashline-edit instead.\n\n" + output.description;
      }
    },

    /**
     * Hook 3: Append hashline usage instructions to system prompt.
     */
    "experimental.chat.system.transform": async (input, output) => {
      const hashlineInstructions = `File editing: Use hashline-edit (not edit/patch). Read first for LINE#HASH anchors.
- Replace: {op:"replace",pos:"5#a3f1",lines:["new"]} or range {pos:"5#a3f1",end:"10#b2c3",lines:["l1","l2"]}
- Append: {op:"append",pos:"5#a3f1",lines:["new line"]}
- Prepend: {op:"prepend",pos:"5#a3f1",lines:["new line"]}
Re-read on hash mismatch.`;

      output.system.push(hashlineInstructions);
    },
  };
}
