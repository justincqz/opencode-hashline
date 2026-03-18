import { describe, test, expect } from 'bun:test';
import type { Model } from '@opencode-ai/sdk';
import { createHashlineHooks } from 'hashline/plugin';

describe('plugin hooks', () => {
    const hooks = createHashlineHooks();

    describe('tool.execute.after - Read Output Hashification', () => {
        test('1. Transforms colon-format read output (N: content → N#HASH:content)', async () => {
            const input = {
                tool: 'read',
                sessionID: 'test-session',
                callID: 'test-call',
                args: { filePath: '/test.ts' },
            };
            const output = {
                title: 'Read /test.ts',
                output: `<path>/test.ts</path>
<type>file</type>
<content>
1: const x = 1;
2: const y = 2;
</content>
`,
                metadata: {},
            };

            await hooks['tool.execute.after'](input, output);

            // Should contain hash prefixes
            expect(output.output).toContain('1#');
            expect(output.output).toContain('2#');
            // Should preserve colon format
            expect(output.output).toContain('1#');
            expect(output.output).toMatch(/1#[0-9a-f]{4}:const x = 1/);
        });

        test('2. Transforms pipe-format read output (N| content → N#HASH:content)', async () => {
            const input = {
                tool: 'read',
                sessionID: 'test-session',
                callID: 'test-call',
                args: { filePath: '/test.ts' },
            };
            const output = {
                title: 'Read /test.ts',
                output: `<path>/test.ts</path>
<type>file</type>
<content>
1| const x = 1;
2| const y = 2;
</content>
`,
                metadata: {},
            };

            await hooks['tool.execute.after'](input, output);

            // Should contain hash prefixes and preserve pipe format
            expect(output.output).toMatch(/1#[0-9a-f]{4}:const x = 1/);
            expect(output.output).toMatch(/2#[0-9a-f]{4}:const y = 2/);
        });

        test('3. Preserves XML structure (<path>, <type>, </content>)', async () => {
            const input = {
                tool: 'read',
                sessionID: 'test-session',
                callID: 'test-call',
                args: { filePath: '/test.ts' },
            };
            const output = {
                title: 'Read /test.ts',
                output: `<path>/test.ts</path>
<type>file</type>
<content>
1: const x = 1;
</content>
`,
                metadata: {},
            };

            await hooks['tool.execute.after'](input, output);

            expect(output.output).toContain('<path>/test.ts</path>');
            expect(output.output).toContain('<type>file</type>');
            expect(output.output).toContain('</content>');
        });

        test('4. Does NOT hashify (End of file...) footer', async () => {
            const input = {
                tool: 'read',
                sessionID: 'test-session',
                callID: 'test-call',
                args: { filePath: '/test.ts' },
            };
            const output = {
                title: 'Read /test.ts',
                output: `<path>/test.ts</path>
<type>file</type>
<content>
1: const x = 1;
(End of file...)
</content>
`,
                metadata: {},
            };

            await hooks['tool.execute.after'](input, output);

            // End of file should not have hash prefix
            expect(output.output).toContain('(End of file...)');
            // But actual content should still be hashified
            expect(output.output).toMatch(/1#[0-9a-f]{4}:const x = 1/);
        });

        test('5. Does NOT hashify <system-reminder> content', async () => {
            const input = {
                tool: 'read',
                sessionID: 'test-session',
                callID: 'test-call',
                args: { filePath: '/test.ts' },
            };
            const output = {
                title: 'Read /test.ts',
                output: `<path>/test.ts</path>
<type>file</type>
<content>
1: const x = 1;
</content>
<system-reminder>
Note: File was modified externally
</system-reminder>
`,
                metadata: {},
            };

            await hooks['tool.execute.after'](input, output);

            // System reminder should not be hashified
            expect(output.output).toContain('<system-reminder>');
            expect(output.output).toContain('Note: File was modified externally');
        });

        test('6. Handles offset reads (line numbers starting > 1)', async () => {
            const input = {
                tool: 'read',
                sessionID: 'test-session',
                callID: 'test-call',
                args: { filePath: '/test.ts', offset: 10 },
            };
            const output = {
                title: 'Read /test.ts',
                output: `<path>/test.ts</path>
<type>file</type>
<content>
10: const x = 1;
11: const y = 2;
</content>
`,
                metadata: {},
            };

            await hooks['tool.execute.after'](input, output);

            // Hash should use line numbers from output (10, 11)
            expect(output.output).toMatch(/10#[0-9a-f]{4}:const x = 1/);
            expect(output.output).toMatch(/11#[0-9a-f]{4}:const y = 2/);
        });

        test('7. Graceful fallback: unrecognized format → output unchanged', async () => {
            const input = {
                tool: 'read',
                sessionID: 'test-session',
                callID: 'test-call',
                args: { filePath: '/test.ts' },
            };
            const originalOutput = 'Some random output without proper format';
            const output = {
                title: 'Read /test.ts',
                output: originalOutput,
                metadata: {},
            };

            await hooks['tool.execute.after'](input, output);

            // Should be unchanged
            expect(output.output).toBe(originalOutput);
        });

        test("8. Ignores non-read tools (e.g., input.tool === 'bash')", async () => {
            const input = {
                tool: 'bash',
                sessionID: 'test-session',
                callID: 'test-call',
                args: { command: 'ls -la' },
            };
            const output = {
                title: 'Bash',
                output: 'total 0\ndrwxr-xr-x  5 user  staff   160 Jan  1 00:00 .',
                metadata: {},
            };

            await hooks['tool.execute.after'](input, output);

            // Should be unchanged
            expect(output.output).toBe('total 0\ndrwxr-xr-x  5 user  staff   160 Jan  1 00:00 .');
        });

        test('9. Does NOT hashify write tool output', async () => {
            const input = {
                tool: 'write',
                sessionID: 'test-session',
                callID: 'test-call',
                args: { filePath: '/test.ts', content: 'test' },
            };
            const output = {
                title: 'Write /test.ts',
                output: 'File written successfully: /test.ts (12 bytes)',
                metadata: {},
            };

            await hooks['tool.execute.after'](input, output);

            // Should be unchanged
            expect(output.output).toBe('File written successfully: /test.ts (12 bytes)');
        });

        test('10. Empty output → unchanged', async () => {
            const input = {
                tool: 'read',
                sessionID: 'test-session',
                callID: 'test-call',
                args: { filePath: '/test.ts' },
            };
            const output = {
                title: 'Read /test.ts',
                output: '',
                metadata: {},
            };

            await hooks['tool.execute.after'](input, output);

            // Should be unchanged
            expect(output.output).toBe('');
        });
    });

    describe('tool.definition - Tool Description Enhancement', () => {
        test('11. Read tool description appended with hashline note', async () => {
            const input = { toolID: 'read' };
            const output = {
                description: 'Read a file from the filesystem.',
                parameters: {},
            };

            await hooks['tool.definition'](input, output);

            expect(output.description).toContain(
                'Output includes LINE#HASH prefixes for content-addressed editing'
            );
            expect(output.description).toContain('hashline-edit tool');
        });

        test('12. Edit tool description appended with hashline-edit redirect', async () => {
            const input = { toolID: 'edit' };
            const output = {
                description: 'Edit a file using a patch.',
                parameters: {},
            };

            await hooks['tool.definition'](input, output);

            expect(output.description).toContain(
                'For precise line-addressed editing, prefer the hashline-edit tool'
            );
            expect(output.description).toContain('LINE#HASH references');
        });

        test('13. Other tools → unchanged', async () => {
            const input = { toolID: 'bash' };
            const output = {
                description: 'Run a shell command.',
                parameters: {},
            };

            await hooks['tool.definition'](input, output);

            expect(output.description).toBe('Run a shell command.');
        });
    });

    describe('experimental.chat.system.transform - System Prompt', () => {
        const mockModel = {
            id: 'claude',
            providerID: 'anthropic',
            api: { id: 'anthropic', url: 'https://api.anthropic.com', npm: '@anthropic-ai/sdk' },
            name: 'Claude',
            capabilities: {
                temperature: true,
                reasoning: true,
                attachment: true,
                toolcall: true,
                input: { text: true, audio: true, image: true, video: true, pdf: true },
                output: { text: true, audio: true, image: true, video: true, pdf: true },
            },
            cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
            limit: { context: 100000, output: 10000 },
            status: 'active' as const,
            options: {},
            headers: {},
        } satisfies Model;

        test('14. Pushes hashline instruction block to output.system', async () => {
            const input = { sessionID: 'test-session', model: mockModel };
            const output = {
                system: ['You are a helpful assistant.'],
            };

            await hooks['experimental.chat.system.transform'](input, output);

            expect(output.system).toHaveLength(2);
            expect(output.system[1]).toContain('When editing files, use LINE#HASH tags');
        });

        test('15. Contains all 5 core rules', async () => {
            const input = { sessionID: 'test-session', model: mockModel };
            const output = {
                system: ['You are a helpful assistant.'],
            };

            await hooks['experimental.chat.system.transform'](input, output);

            const instructions = output.system[1];
            expect(instructions).toContain('1. Read the file first');
            expect(instructions).toContain('2. Use hashline-edit tool');
            expect(instructions).toContain('3. Batch all edits');
            expect(instructions).toContain('4. If you get a hash mismatch error');
            expect(instructions).toContain('5. Never copy LINE#HASH:');
        });
    });
});
