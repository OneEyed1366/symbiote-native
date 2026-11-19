// lightningcss loses every declaration before one with an unbalanced closer, the web only that one
import { describe, expect, it } from 'vitest';
import { cssWithoutBrokenDeclarations } from './broken-declarations.ts';

type IWarning = { message: string; loc: { line: number; column: number } };

function closerWarning(css: string, closer: string): IWarning {
  const offset = css.indexOf(closer);
  const before = css.slice(0, offset).split('\n');
  const line = before.length;
  const column = (before[line - 1]?.length ?? 0) + 1;
  return {
    message: 'Unexpected token CloseSquareBracket',
    loc: { line, column },
  };
}

describe('cssWithoutBrokenDeclarations', () => {
  it('cuts the declaration that holds the unbalanced closer and nothing else', () => {
    const css = '.a { width: 2px; color: ]; height: 3px }';

    expect(cssWithoutBrokenDeclarations(css, [closerWarning(css, ']')])).toBe(
      '.a { width: 2px; height: 3px }',
    );
  });

  it('cuts a last declaration that ends at the closing brace', () => {
    const css = '.a { --test: green; --test: ] }';

    expect(cssWithoutBrokenDeclarations(css, [closerWarning(css, ']')])).toBe(
      '.a { --test: green;}',
    );
  });

  it('keeps a mismatched closer inside brackets with the declaration it belongs to', () => {
    const css = '.a {\n  width: 2px;\n  --t: (});\n  height: 3px }';

    expect(cssWithoutBrokenDeclarations(css, [closerWarning(css, '}')])).toBe(
      '.a {\n  width: 2px;\n  height: 3px }',
    );
  });

  it('ignores a warning that is not an unbalanced closer', () => {
    const css = '.a { color: red }';
    const other: IWarning = {
      message: 'Unexpected token Semicolon',
      loc: { line: 1, column: 6 },
    };

    expect(cssWithoutBrokenDeclarations(css, [other])).toBeNull();
  });
});
