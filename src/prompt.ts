// Hashline prompt templates

export const HASHLINE_EDIT_DESCRIPTION = `Applies precise file edits using LINE#HASH tags from read output.

Rules:
1. Read the file first to get fresh LINE#HASH tags
2. One hashline-edit call per file — tags shift after edits
3. For range replace: pos=first line, end=last line (inclusive)
4. lines must contain exact content with correct indentation
5. Block boundaries travel together (header/body/closer)
6. Never include LINE#HASH: prefixes in replacement content

Operations:
- replace: pos (required) — first line to rewrite; end (optional) — last line of range (inclusive). lines=null deletes.
- prepend: pos (optional) — insert before this line; omit pos for beginning of file
- append:  pos (optional) — insert after this line; omit pos for end of file

File operations:
- Set delete=true to remove a file
- Set move="new/path" to rename/move after editing
- To create a new file, use append without pos`;

export const SYSTEM_PROMPT_ADDITION = `## Hashline Editing

When editing files, use LINE#HASH tags from read output:
1. Read the file first to get fresh LINE#HASH tags
2. Use hashline-edit tool with pos/end anchors from read output
3. Batch all edits for one file in a single hashline-edit call
4. If you get a hash mismatch error, re-read the file for fresh tags
5. Never copy LINE#HASH: prefixes into replacement content`;

export const READ_TOOL_ADDENDUM = `Output includes LINE#HASH prefixes for content-addressed editing. Use these tags with the hashline-edit tool.`;

export const EDIT_TOOL_ADDENDUM = `Note: For precise line-addressed editing, prefer the hashline-edit tool which uses LINE#HASH references from read output.`;
