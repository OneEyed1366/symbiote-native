// An `@property` block read back from the source text, since the native registry parses it again
// lightningcss returns `syntax` and `initial-value` parsed, which rounds what the author wrote
import type { IPropertyDescriptor } from '@symbiote-native/engine';
import type { PropertyRule } from 'lightningcss';

const COMMENT = /\/\*[\s\S]*?\*\//g;
const SYNTAX = /(?:^|[\s;])syntax\s*:\s*(?:"([^"]*)"|'([^']*)')/;
const INITIAL = /(?:^|[\s;])initial-value\s*:\s*/;

// The first of `stops` outside a string, or -1, so a `}` or `;` inside a string ends nothing
function indexOutsideStrings(
  text: string,
  stops: string,
  from: number,
): number {
  let quote: string | undefined;
  for (let at = from; at < text.length; at += 1) {
    const char = text.charAt(at);
    if (quote !== undefined) {
      if (char === '\\') at += 1;
      else if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (stops.includes(char)) {
      return at;
    }
  }
  return -1;
}

export function propertyRuleOf(
  css: string,
  rule: PropertyRule,
): IPropertyDescriptor | null {
  // The text between the braces of the rule at `loc` (line 0-based, column 1-based)
  const lineStart = css
    .split('\n')
    .slice(0, rule.loc.line)
    .reduce((sum, line) => sum + line.length + 1, 0);
  const open = css.indexOf('{', lineStart + rule.loc.column - 1);
  const close = indexOutsideStrings(css, '}', open + 1);
  const body = css
    .slice(open + 1, close === -1 ? undefined : close)
    .replace(COMMENT, '');
  const syntax = SYNTAX.exec(body);
  if (syntax === null) return null;
  const initialAt = INITIAL.exec(body);
  const from = initialAt === null ? -1 : initialAt.index + initialAt[0].length;
  const end = from === -1 ? -1 : indexOutsideStrings(body, ';', from);
  const initial =
    from === -1
      ? undefined
      : body.slice(from, end === -1 ? undefined : end).trim();
  return {
    name: rule.name,
    syntax: syntax[1] ?? syntax[2] ?? '',
    inherits: rule.inherits,
    ...(initial === undefined ? {} : { initialValue: initial }),
  };
}
