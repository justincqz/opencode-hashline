import { formatHashLines, computeLineHash } from './src/core';
import { applyHashlineEdits } from './src/edit-engine';
import { readFileSync } from 'node:fs';

// ─── Step 1: Read file with hashline prefixes ───
const raw = readFileSync('test-demo.js', 'utf-8');
const hashified = formatHashLines(raw, 1);

console.log('=== HASHLINE OUTPUT ===');
console.log(hashified);
console.log();

// ─── Step 2: Show individual line hashes ───
const lines = raw.split('\n');
console.log('=== LINE HASHES ===');
lines.forEach((line, i) => {
    const num = i + 1;
    const hash = computeLineHash(num, line);
    console.log(`  ${num}#${hash}`);
});
console.log();

// ─── Step 3: Apply edits using hashline anchors ───
// Edit 1: Replace line 2 (console.log) with a new line
// Edit 2: Append a new line after line 8 (the greet call)
const line2Hash = computeLineHash(2, lines[1]); // "  console.log(\"Hello, \" + name);")
const line8Hash = computeLineHash(8, lines[7]); // 'greet("World");'

console.log('=== APPLYING EDITS ===');
console.log(`  Edit 1: Replace 2#${line2Hash} with new content`);
console.log(`  Edit 2: Append new line after 8#${line8Hash}`);
console.log();

const result = applyHashlineEdits(raw, [
    {
        op: 'replace',
        pos: { line: 2, hash: line2Hash },
        lines: [`  console.log(\`Hello, \${name}!\`);`],
    },
    {
        op: 'append',
        pos: { line: 8, hash: line8Hash },
        lines: ['farewell();'],
    },
]);

console.log('=== EDITED FILE ===');
console.log(result.text);
console.log();

// ─── Step 4: Demonstrate stale hash detection ───
console.log('=== STALE HASH DETECTION ===');
const fakeHash = 'dead';
try {
    applyHashlineEdits(raw, [
        {
            op: 'replace',
            pos: { line: 3, hash: fakeHash },
            lines: ['  // hacked!'],
        },
    ]);
    console.log('  ERROR: should have thrown!');
} catch (e: unknown) {
    const err = e as Error;
    console.log(`  ✅ Caught: ${err.message.split('\n')[0]}`);
}
