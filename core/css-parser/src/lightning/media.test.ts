// An `@media` rule compiles to a condition table plus a condition id on each rule it wraps
// The condition is a tuple tree: `['&' | '|', [...]]`, `['!', c]`, `['>=', 'width', 600]`

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileCssToRules } from './rules.ts';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

function compile(css: string, remToPx?: number) {
  return compileCssToRules(css, {
    filename: 'media.css',
    ...(remToPx === undefined ? {} : { remToPx }),
  });
}

describe('compileCssToRules - @media', () => {
  it('keeps a wrapped rule and points it at a range condition', () => {
    const { rules, conditions } = compile(
      '@media (min-width: 600px) { .a { color: red; } }',
    );

    expect(conditions).toEqual([['>=', 'width', 600]]);
    expect(rules.map(rule => rule.cond)).toEqual([0]);
  });

  it('leaves a rule outside any @media without a condition id', () => {
    const { rules, conditions } = compile('.a { color: red; }');

    expect(conditions).toEqual([]);
    expect(rules[0]?.cond).toBeUndefined();
  });

  it('joins `and` features into one `&` node', () => {
    const { conditions } = compile(
      '@media (min-width: 600px) and (max-width: 900px) { .a { color: red; } }',
    );

    expect(conditions).toEqual([
      [
        '&',
        [
          ['>=', 'width', 600],
          ['<=', 'width', 900],
        ],
      ],
    ]);
  });

  it('turns a comma list into `|` and `not` into `!`', () => {
    const { conditions } = compile(
      '@media (orientation: landscape), not (prefers-color-scheme: dark) { .a { color: red; } }',
    );

    expect(conditions).toEqual([
      [
        '|',
        [
          ['=', 'orientation', 'landscape'],
          ['!', ['=', 'prefers-color-scheme', 'dark']],
        ],
      ],
    ]);
  });

  it('ANDs a nested @media with the one around it', () => {
    const { conditions, rules } = compile(
      '@media (width >= 600px) { @media (orientation: portrait) { .a { color: red; } } }',
    );

    expect(conditions).toEqual([
      [
        '&',
        [
          ['>=', 'width', 600],
          ['=', 'orientation', 'portrait'],
        ],
      ],
    ]);
    expect(rules.map(rule => rule.cond)).toEqual([0]);
  });

  it('gives two rules under the same query one shared condition id', () => {
    const { conditions, rules } = compile(
      '@media (min-width: 600px) { .a { color: red; } }\n' +
        '@media (min-width: 600px) { .b { color: blue; } }',
    );

    expect(conditions).toHaveLength(1);
    expect(rules.map(rule => rule.cond)).toEqual([0, 0]);
  });

  it('converts `rem` in a width against remToPx', () => {
    const { conditions } = compile(
      '@media (min-width: 40rem) { .a { color: red; } }',
      16,
    );

    expect(conditions).toEqual([['>=', 'width', 640]]);
  });

  it('converts every resolution unit to dots per pixel', () => {
    const { conditions } = compile(
      '@media (min-resolution: 192dpi) and (max-resolution: 3x) and (resolution: 96dpcm) { .a { color: red; } }',
    );

    expect(conditions).toEqual([
      [
        '&',
        [
          ['>=', 'resolution', 2],
          ['<=', 'resolution', 3],
          ['=', 'resolution', 2.54],
        ],
      ],
    ]);
  });

  it('drops a rule whose feature RN cannot answer, and says which', () => {
    const { rules, conditions } = compile(
      '@media (hover: hover) { .a { color: red; } }',
    );

    expect(rules).toEqual([]);
    expect(conditions).toEqual([]);
    expect(warn.mock.calls.map(call => String(call[0])).join('\n')).toContain(
      'hover',
    );
  });

  it('reads a numeric feature on its own as "not zero"', () => {
    const { conditions } = compile(
      '@media (width) and (height) { .a { color: red; } }',
    );

    expect(conditions).toEqual([
      [
        '&',
        [
          ['>', 'width', 0],
          ['>', 'height', 0],
        ],
      ],
    ]);
  });

  it('reads `orientation` on its own as always true', () => {
    const { conditions } = compile(
      '@media (orientation) { .a { color: red; } }',
    );

    expect(conditions).toEqual([['&', []]]);
  });

  it('reads a preference on its own as "not no-preference"', () => {
    const { conditions } = compile(
      '@media (prefers-reduced-motion) { .a { color: red; } }',
    );

    expect(conditions).toEqual([
      ['!', ['=', 'prefers-reduced-motion', 'no-preference']],
    ]);
  });

  it('reads a feature RN cannot answer on its own as unknown', () => {
    const { rules } = compile('@media (hover) { .a { color: red; } }');

    expect(rules).toEqual([]);
  });

  it('computes calc() and max() in a feature value, em as rem', () => {
    const { conditions } = compile(
      '@media (min-width: calc(10px + 10em)) and (width < max(10px, 10em)) { .a { color: red; } }',
    );

    expect(conditions).toEqual([
      [
        '&',
        [
          ['>=', 'width', 170],
          ['<', 'width', 160],
        ],
      ],
    ]);
  });

  it('computes clamp() and an interval of math values', () => {
    const { conditions } = compile(
      '@media (min-width: clamp(1px, 50em, 100px)) and (calc(10px + 10em) < width < max(30px, 30em)) ' +
        '{ .a { color: red; } }',
    );

    expect(conditions).toEqual([
      [
        '&',
        [
          ['>=', 'width', 100],
          [
            '&',
            [
              ['>', 'width', 170],
              ['<', 'width', 480],
            ],
          ],
        ],
      ],
    ]);
  });

  it.each([
    '(min-width: calc(10px + 5vw))',
    '(min-width: max(10px, 5vw))',
    '(min-width: calc(1em + 5%))',
  ])('drops a rule whose math value has a unit it cannot read, `%s`', query => {
    const { rules } = compile(`@media ${query} { .a { color: red; } }`);

    expect(rules).toEqual([]);
  });

  it('reads a ratio over zero as the largest number, and 0/0 as zero', () => {
    const { conditions } = compile(
      '@media (max-aspect-ratio: 1/0) and (min-aspect-ratio: 0/0) { .a { color: red; } }',
    );

    expect(conditions).toEqual([
      [
        '&',
        [
          ['<=', 'aspect-ratio', Number.MAX_VALUE],
          ['>=', 'aspect-ratio', 0],
        ],
      ],
    ]);
  });

  it.each([
    '(aspect-ratio: -1/1)',
    '(aspect-ratio: 1/-1)',
    '(resolution: -3dpi)',
  ])('drops a rule whose feature has a negative value, `%s`', query => {
    const { rules } = compile(`@media ${query} { .a { color: red; } }`);

    expect(rules).toEqual([]);
  });

  it('answers `aspect-ratio` against the window as a quotient', () => {
    const { conditions } = compile(
      '@media (aspect-ratio: 59/80) and (min-aspect-ratio: 1/2) { .a { color: red; } }',
    );

    expect(conditions).toEqual([
      [
        '&',
        [
          ['=', 'aspect-ratio', 59 / 80],
          ['>=', 'aspect-ratio', 0.5],
        ],
      ],
    ]);
  });
});
