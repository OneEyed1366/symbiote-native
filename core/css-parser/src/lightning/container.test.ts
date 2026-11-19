// An `@container` rule compiles into the same condition table as `@media`
// Its leaf is `['@', name | null, <size condition>]`, so a rule has one `cond` either way

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileCssToRules } from './rules.ts';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

function compile(css: string) {
  return compileCssToRules(css, { filename: 'container.css' });
}

function warnings(): string[] {
  return warn.mock.calls.map(call => String(call[0]));
}

describe('compileCssToRules - @container', () => {
  it('keeps a wrapped rule and points it at an unnamed container condition', () => {
    const { rules, conditions } = compile(
      '@container (min-width: 400px) { .a { color: red; } }',
    );

    expect(conditions).toEqual([['@', null, ['>=', 'width', 400]]]);
    expect(rules.map(rule => rule.cond)).toEqual([0]);
    expect(warnings()).toEqual([]);
  });

  it('carries the container name', () => {
    const { conditions } = compile(
      '@container card (width > 400px) { .a { color: red; } }',
    );

    expect(conditions).toEqual([['@', 'card', ['>', 'width', 400]]]);
  });

  it('reads inline-size and block-size as width and height', () => {
    const { conditions } = compile(
      '@container (inline-size >= 300px) and (block-size < 200px) { .a { color: red; } }',
    );

    expect(conditions).toEqual([
      [
        '@',
        null,
        [
          '&',
          [
            ['>=', 'width', 300],
            ['<', 'height', 200],
          ],
        ],
      ],
    ]);
  });

  it('reads an interval as two comparisons', () => {
    const { conditions } = compile(
      '@container (300px <= width <= 600px) { .a { color: red; } }',
    );

    expect(conditions).toEqual([
      [
        '@',
        null,
        [
          '&',
          [
            ['>=', 'width', 300],
            ['<=', 'width', 600],
          ],
        ],
      ],
    ]);
  });

  it('turns a ratio into its quotient', () => {
    const { conditions } = compile(
      '@container (aspect-ratio > 3 / 2) { .a { color: red; } }',
    );

    expect(conditions).toEqual([['@', null, ['>', 'aspect-ratio', 1.5]]]);
  });

  it('reads orientation as a keyword', () => {
    const { conditions } = compile(
      '@container (orientation: portrait) { .a { color: red; } }',
    );

    expect(conditions).toEqual([['@', null, ['=', 'orientation', 'portrait']]]);
  });

  it('turns `or` into `|` and `not` into `!`', () => {
    const { conditions } = compile(
      '@container not ((width < 200px) or (orientation: landscape)) { .a { color: red; } }',
    );

    expect(conditions).toEqual([
      [
        '@',
        null,
        [
          '!',
          [
            '|',
            [
              ['<', 'width', 200],
              ['=', 'orientation', 'landscape'],
            ],
          ],
        ],
      ],
    ]);
  });

  it('ANDs a nested @media with the container around it', () => {
    const { conditions } = compile(
      '@container (min-width: 400px) { @media (min-width: 600px) { .a { color: red; } } }',
    );

    expect(conditions).toEqual([
      [
        '&',
        [
          ['@', null, ['>=', 'width', 400]],
          ['>=', 'width', 600],
        ],
      ],
    ]);
  });

  it('gives two rules under the same container query one shared condition id', () => {
    const { rules, conditions } = compile(
      '@container (min-width: 400px) { .a { color: red; } .b { color: blue; } }',
    );

    expect(conditions).toHaveLength(1);
    expect(rules.map(rule => rule.cond)).toEqual([0, 0]);
  });

  it('keeps a container apart from a media query with the same numbers', () => {
    const { conditions } = compile(
      '@media (min-width: 400px) { .a { color: red; } }\n@container (min-width: 400px) { .b { color: red; } }',
    );

    expect(conditions).toEqual([
      ['>=', 'width', 400],
      ['@', null, ['>=', 'width', 400]],
    ]);
  });

  it.each([
    ['a style query', '(style(--theme: dark))'],
    ['a scroll-state query', '(scroll-state(stuck: top))'],
    ['a feature no container answers', '(color)'],
    ['a length it cannot convert', '(width > 10vw)'],
  ])('drops the rule for %s and says so', (_label, condition) => {
    const { rules, conditions } = compile(
      `@container ${condition} { .a { color: red; } }\n.b { color: blue; }`,
    );

    expect(conditions).toEqual([]);
    expect(rules.map(rule => rule.tokens)).toEqual([['b']]);
    expect(warnings().join('\n')).toContain('cannot be answered here');
    expect(warnings().join('\n')).toContain('`@container` rule');
  });

  it('drops a rule whose name has no condition', () => {
    const { rules } = compile('@container card { .a { color: red; } }');

    expect(rules).toEqual([]);
  });

  it('answers aspect-ratio in a media query against the window', () => {
    const { conditions } = compile(
      '@media (aspect-ratio: 1 / 1) { .a { color: red; } }',
    );

    expect(conditions).toEqual([['=', 'aspect-ratio', 1]]);
  });
});
