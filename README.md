# Hashline Plugin for OpenCode

A plugin that adds content-addressed file editing to OpenCode using LINE#HASH anchors.

## What is Hashline?

Hashline solves a fundamental problem: **LLMs lose track of positions** when making edits because line numbers shift after each change.

Instead of fragile line numbers, each line gets a content-derived hash:

```
Traditional (unstable):          Hashline (stable):
Line 1: function foo() {       1#8f6f:function foo() {
Line 2:   const x = 1;         2#3bda:  const x = 1;
Line 3:   return x;            3#4d61:  return x;
Line 4: }                      4#9dc1:}
```

If you insert a line after line 2, all subsequent line numbers shift. But `2#3bda` still uniquely identifies `const x = 1;` — even if it moves.

## Installation

1. Copy this plugin to your OpenCode plugins directory:
   ```
   ~/.config/opencode/plugins/hashline/
   ```

2. Enable the plugin in your OpenCode config (usually `opencode.json`):
   ```json
   {
     "plugins": ["hashline"]
   }
   ```

3. Restart OpenCode

## How It Works

The plugin provides:

1. **Read output transformation** — Files read with the `read` tool now include LINE#HASH prefixes

2. **Custom hashline-edit tool** — Use LINE#HASH anchors for reliable edits:
   ```json
   {
     "path": "src/index.ts",
     "edits": [
       { "op": "replace", "pos": "5#a3f1", "lines": ["new content"] },
       { "op": "append", "pos": "10#b2c3", "lines": ["line after"] }
     ]
   }
   ```

3. **Auto-detection** — The LLM is automatically directed to use hashline-edit via system prompts

## Usage

### Reading Files

Just use the `read` tool normally. Output now includes LINE#HASH:

```
1#8f6f:function greet(name) {
2#3bda:  console.log("Hello, " + name);
3#4d61:}
```

### Editing Files

Use the `hashline-edit` tool with anchors from the read output:

**Replace a line:**
```json
{ "op": "replace", "pos": "2#3bda", "lines": ["new content"] }
```

**Replace a range:**
```json
{ "op": "replace", "pos": "5#a3f1", "end": "10#b2c3", "lines": ["line1", "line2"] }
```

**Append after a line:**
```json
{ "op": "append", "pos": "5#a3f1", "lines": ["new line"] }
```

**Prepend before a line:**
```json
{ "op": "prepend", "pos": "5#a3f1", "lines": ["new line"] }
```

### Error Handling

If you get a **hash mismatch error**, the file has changed since you read it. Simply re-read the file to get fresh LINE#HASH anchors and try again.

## Configuration

No configuration required! The plugin works out of the box.

## Development

```bash
# Run tests
bun test

# Type check
bun run typecheck
```

## License

See [LICENSE](./LICENSE) file.

## Inspirations

This plugin is inspired by:

- **[The Harness Problem](https://blog.can.ac/2026/02/12/the-harness-problem/)** - Blog post on the fundamental challenges of LLM file editing
- **[Oh-My-Pi](https://github.com/can1357/oh-my-pi)** - Original hashline implementation
- **[Oh-My-OpenCode](https://github.com/code-yeongyu/oh-my-opencode)** - Port of hashline to OpenCode (this plugin is based on)
