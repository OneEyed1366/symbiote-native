// lightningcss drops every declaration before one whose value has an unbalanced closer
// The web drops only that one, so the offender is cut from the source and the file compiled again

import type { TransformResult } from 'lightningcss';

type IWarning = TransformResult['warnings'][number];

const UNBALANCED_CLOSER =
  /^Unexpected token Close(SquareBracket|CurlyBracket|Parenthesis)$/;

const OPENER_TO_CLOSER: Readonly<Record<string, string>> = {
  '(': ')',
  '[': ']',
  '{': '}',
};

// Ends before the `}` of the block, or after the `;`, whichever comes first outside any bracket
function declarationEnd(css: string, start: number): number {
  const expected: string[] = [];
  for (let at = start; at < css.length; at++) {
    const char = css.charAt(at);
    const closer = OPENER_TO_CLOSER[char];
    if (closer !== undefined) expected.push(closer);
    else if (char === expected[expected.length - 1]) expected.pop();
    else if (expected.length === 0 && char === ';') return at + 1;
    else if (expected.length === 0 && char === '}') return at;
  }
  return css.length;
}

/**
 * The source without the declarations that hold an unbalanced closer, `null` when none does
 * Cut from the last offset to the first, so each cut leaves the earlier offsets valid
 */
export function cssWithoutBrokenDeclarations(
  css: string,
  warnings: readonly Pick<IWarning, 'message' | 'loc'>[],
): string | null {
  const offsets = warnings
    .filter(warning => UNBALANCED_CLOSER.test(warning.message))
    .map(({ loc }) => {
      let lineStart = 0;
      for (let at = 1; at < loc.line; at++) lineStart = css.indexOf('\n', lineStart) + 1;
      return lineStart + loc.column - 1;
    })
    .sort((left, right) => right - left);
  if (offsets.length === 0) return null;

  return offsets.reduce((source, offset) => {
    // The declaration starts after the last `;` or `{` before the bad token
    const start = Math.max(source.lastIndexOf(';', offset), source.lastIndexOf('{', offset)) + 1;
    return source.slice(0, start) + source.slice(declarationEnd(source, start));
  }, css);
}
