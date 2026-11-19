// `matchMedia` and the compiler read one query as one condition, since one evaluator serves both
// Each query is compiled inside an `@media` rule and parsed at run time, and the two trees match

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { compileCssToRules } from '../core/css-parser/src/lightning/rules.ts';
import { parseMediaQueryList } from '../core/engine/src/match-media/parse-media-query';

const QUERIES = [
  '(min-width: 600px)',
  '(max-width: 600px)',
  '(width: 600px)',
  '(min-height: 400px)',
  '(min-width: 40em)',
  '(min-width: 40rem)',
  '(width >= 600px)',
  '(width > 600px)',
  '(600px <= width)',
  '(400px <= width <= 700px)',
  '(400px < width < 700px)',
  '(min-width: 600px) and (max-width: 900px)',
  '(min-width: 600px) or (max-width: 300px)',
  'not (min-width: 600px)',
  '(orientation: landscape)',
  'screen',
  'all',
  'screen and (min-width: 600px)',
  'only screen and (min-width: 600px)',
  'not screen and (min-width: 600px)',
  '(orientation: landscape), (min-width: 600px)',
  '(min-resolution: 2dppx)',
  '(min-resolution: 192dpi)',
  '(min-resolution: 2x)',
  '(resolution: 96dpcm)',
  '(prefers-color-scheme: dark)',
  '(prefers-reduced-motion: reduce)',
  '(prefers-contrast: more)',
  '(prefers-reduced-transparency: reduce)',
  '((min-width: 600px))',
  '(min-width: 600px) and ((max-width: 900px) or (orientation: portrait))',
  'print',
  '(hover: hover)',
  '(color)',
  '(min-width: 600px) and (hover: hover)',
  '(min-width: 5cm)',
];

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

function compiledCondition(query: string): unknown {
  const { rules, conditions } = compileCssToRules(
    `@media ${query} { .a { color: red; } }`,
    { filename: 'parity.css' },
  );
  return rules.length === 0 ? undefined : conditions[0];
}

describe('a media query reads the same at build time and at run time', () => {
  it('compiles a known query to a tree and an unknown one to nothing', () => {
    expect(compiledCondition('(min-width: 600px)')).toEqual([
      '>=',
      'width',
      600,
    ]);
    expect(compiledCondition('print')).toBeUndefined();
  });

  it.each(QUERIES)('%s', query => {
    expect(parseMediaQueryList(query).condition).toEqual(
      compiledCondition(query),
    );
  });
});
