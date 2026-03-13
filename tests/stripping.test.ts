import { describe, test, expect } from "bun:test";
import {
  stripHashlinePrefixes,
  stripDiffPlusMarkers,
  stripBom,
  detectLineEnding,
  normalizeToLF,
  restoreLineEndings,
  parseReadOutput,
  reconstructReadOutput,
} from "hashline/normalization";

describe("stripHashlinePrefixes", () => {
  test("strip LINE#HASH: prefix from all lines", () => {
    const input = ["1#a3f1:foo", "2#b7c2:bar"];
    const result = stripHashlinePrefixes(input);
    expect(result).toEqual(["foo", "bar"]);
  });

  test("do NOT strip if only some lines have prefix", () => {
    const input = ["1#a3f1:foo", "bar"];
    const result = stripHashlinePrefixes(input);
    expect(result).toEqual(["1#a3f1:foo", "bar"]);
  });

  test("preserve empty lines - don't count toward threshold", () => {
    const input = ["1#a3f1:foo", "", "2#b7c2:bar"];
    const result = stripHashlinePrefixes(input);
    expect(result).toEqual(["foo", "", "bar"]);
  });

  test("handle >>> prefix from error display", () => {
    const input = [">>> 1#a3f1:foo", ">>> 2#b7c2:bar"];
    const result = stripHashlinePrefixes(input);
    expect(result).toEqual(["foo", "bar"]);
  });

  test("single line with prefix - strip", () => {
    const input = ["1#a3f1:foo"];
    const result = stripHashlinePrefixes(input);
    expect(result).toEqual(["foo"]);
  });

  test("handle >> prefix", () => {
    const input = [">> 1#a3f1:foo", ">> 2#b7c2:bar"];
    const result = stripHashlinePrefixes(input);
    expect(result).toEqual(["foo", "bar"]);
  });
});

describe("stripDiffPlusMarkers", () => {
  test("strip diff + markers when >= 50% have them", () => {
    const input = ["+ foo", "+ bar", "baz"];
    const result = stripDiffPlusMarkers(input);
    expect(result).toEqual(["foo", "bar", "baz"]);
  });

  test("don't strip diff markers when < 50%", () => {
    const input = ["+ foo", "bar", "baz", "qux"];
    const result = stripDiffPlusMarkers(input);
    expect(result).toEqual(["+ foo", "bar", "baz", "qux"]);
  });

  test("strip all when all have +", () => {
    const input = ["+ foo", "+ bar"];
    const result = stripDiffPlusMarkers(input);
    expect(result).toEqual(["foo", "bar"]);
  });
});

describe("stripBom", () => {
  test("UTF-8 BOM stripped and returned separately", () => {
    const input = "\uFEFFhello";
    const result = stripBom(input);
    expect(result.bom).toBe("\uFEFF");
    expect(result.text).toBe("hello");
  });

  test("no BOM - empty bom string", () => {
    const input = "hello";
    const result = stripBom(input);
    expect(result.bom).toBe("");
    expect(result.text).toBe("hello");
  });
});

describe("detectLineEnding", () => {
  test("LF only", () => {
    const input = "line1\nline2\nline3";
    expect(detectLineEnding(input)).toBe("lf");
  });

  test("CRLF only", () => {
    const input = "line1\r\nline2\r\nline3";
    expect(detectLineEnding(input)).toBe("crlf");
  });

  test("CR only", () => {
    const input = "line1\rline2\rline3";
    expect(detectLineEnding(input)).toBe("cr");
  });

  test("mixed", () => {
    const input = "line1\r\nline2\nline3";
    expect(detectLineEnding(input)).toBe("mixed");
  });
});

describe("normalizeToLF", () => {
  test("CRLF to LF", () => {
    const input = "line1\r\nline2\r\n";
    const result = normalizeToLF(input);
    expect(result).toBe("line1\nline2\n");
  });

  test("CR to LF", () => {
    const input = "line1\rline2\r";
    const result = normalizeToLF(input);
    expect(result).toBe("line1\nline2\n");
  });
});

describe("restoreLineEndings", () => {
  test("LF to CRLF", () => {
    const input = "line1\nline2";
    const result = restoreLineEndings(input, "crlf");
    expect(result).toBe("line1\r\nline2");
  });
});

describe("parseReadOutput", () => {
  test("parse standard opencode read output (colon format)", () => {
    const output = `<path>/tmp/demo.ts</path>
<type>file</type>
<content>
1: const x = 1
2: const y = 2

(End of file - total 2 lines)
</content>

<system-reminder>
1: keep this unchanged
</system-reminder>`;

    const result = parseReadOutput(output);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("colon");
    expect(result!.contentLines).toEqual([
      { lineNum: 1, content: "const x = 1" },
      { lineNum: 2, content: "const y = 2" },
    ]);
    expect(result!.beforeContent).toContain("<path>");
    expect(result!.afterContent).toContain("<system-reminder>");
  });

  test("parse pipe format", () => {
    const output = `<path>/tmp/demo.ts</path>
<type>file</type>
<content>
1| const x = 1
2| const y = 2

(End of file - total 2 lines)
</content>`;

    const result = parseReadOutput(output);
    expect(result).not.toBeNull();
    expect(result!.format).toBe("pipe");
    expect(result!.contentLines).toEqual([
      { lineNum: 1, content: "const x = 1" },
      { lineNum: 2, content: "const y = 2" },
    ]);
  });

  test("correctly separate beforeContent, contentLines, afterContent", () => {
    const output = `<path>/tmp/demo.ts</path>
<type>file</type>
<content>
1: line1
2: line2
</content>
<system-reminder>
test
</system-reminder>`;

    const result = parseReadOutput(output);
    expect(result).not.toBeNull();
    expect(result!.beforeContent).toBe(`<path>/tmp/demo.ts</path>
<type>file</type>
`);
    expect(result!.afterContent).toBe(`\n<system-reminder>
test
</system-reminder>`);
  });

  test("don't hashify (End of file...) line", () => {
    const output = `<content>
1: const x = 1

(End of file - total 2 lines)
</content>`;

    const result = parseReadOutput(output);
    expect(result).not.toBeNull();
    expect(result!.contentLines).toHaveLength(1);
    expect(result!.contentLines[0].content).toBe("const x = 1");
  });

  test("don't hashify <system-reminder> block", () => {
    const output = `<content>
1: const x = 1
</content>

<system-reminder>
1: keep this unchanged
</system-reminder>`;

    const result = parseReadOutput(output);
    expect(result).not.toBeNull();
    expect(result!.contentLines).toHaveLength(1);
    expect(result!.contentLines[0].content).toBe("const x = 1");
  });

  test("return null for unrecognized format", () => {
    const output = "just some random text without XML structure";
    const result = parseReadOutput(output);
    expect(result).toBeNull();
  });

  test("handle (line truncated to 2000 chars) suffix", () => {
    const output = `<content>
1: some very long line... (line truncated to 2000 chars)
</content>`;

    const result = parseReadOutput(output);
    expect(result).not.toBeNull();
    expect(result!.contentLines).toHaveLength(0);
  });

  test("handle read output with offset (line numbers start > 1)", () => {
    const output = `<content>
10: const x = 1
11: const y = 2
</content>`;

    const result = parseReadOutput(output);
    expect(result).not.toBeNull();
    expect(result!.contentLines).toEqual([
      { lineNum: 10, content: "const x = 1" },
      { lineNum: 11, content: "const y = 2" },
    ]);
  });
});

describe("reconstructReadOutput", () => {
  test("reconstructs correctly with colon format", () => {
    const parsed: any = {
      beforeContent: "<path>/test.ts</path>\n<content>\n",
      contentLines: [
        { lineNum: 1, content: "const x = 1" },
        { lineNum: 2, content: "const y = 2" },
      ],
      afterContent: "\n</content>",
      format: "colon",
    };
    const hashifiedLines = ["modified x", "modified y"];

    const result = reconstructReadOutput(parsed, hashifiedLines);
    expect(result).toContain("1: modified x");
    expect(result).toContain("2: modified y");
  });

  test("reconstructs correctly with pipe format", () => {
    const parsed: any = {
      beforeContent: "<path>/test.ts</path>\n<content>\n",
      contentLines: [
        { lineNum: 1, content: "const x = 1" },
      ],
      afterContent: "\n</content>",
      format: "pipe",
    };
    const hashifiedLines = ["modified x"];

    const result = reconstructReadOutput(parsed, hashifiedLines);
    expect(result).toContain("1| modified x");
  });
});
