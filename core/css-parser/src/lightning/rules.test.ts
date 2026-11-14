// `compileCssToRules` is the only level that sees a rule's SELECTOR and its DECLARATIONS at once,
// which is why one warning has to live here rather than in ./selectors.ts — see the `:root` block
// in both files.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileCssToRules } from './rules.ts';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

function warnings(): string[] {
  return warn.mock.calls.map(call => String(call[0]));
}

describe('compileCssToRules — `:root`', () => {
  it('says nothing about a block that only declares custom properties', () => {
    const { rules } = compileCssToRules(
      ':root { --lime: #a3d94f; }\n.tile { color: var(--lime); }',
      { filename: 'tokens.css' },
    );

    // Silent, and the read stays a reference for the device to substitute
    expect(warnings()).toEqual([]);
    expect(rules.map(rule => rule.style)).toEqual([{ color: 'var(--lime)' }]);
  });

  it('speaks up when the same block also carries a painting declaration', () => {
    compileCssToRules(':root { --lime: #a3d94f; color: blue; }', {
      filename: 'tokens.css',
    });

    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('tokens.css');
    expect(warnings()[0]).toContain('more than custom properties');
  });
});

describe('compileCssToRules — CSS-wide keywords on a custom property', () => {
  it('ships each keyword as the text the native lookup reads', () => {
    const { rules } = compileCssToRules(
      '.a { --i: inherit; --n: initial; --u: unset; --r: revert; --l: revert-layer; }',
      { filename: 'tokens.css' },
    );

    expect(rules.map(rule => rule.style)).toEqual([
      { '--i': 'inherit', '--n': 'initial', '--u': 'unset', '--r': 'revert', '--l': 'revert-layer' },
    ]);
  });
});

describe('compileCssToRules — `@property`', () => {
  it('hands the descriptor over as authored text for the native registry', () => {
    const { properties } = compileCssToRules(
      '@property --gap {\n  syntax: "<length> | auto";\n  inherits: false;\n  initial-value: 4px;\n}',
      { filename: 'tokens.css' },
    );

    expect(properties).toEqual([
      { name: '--gap', syntax: '<length> | auto', inherits: false, initialValue: '4px' },
    ]);
  });

  it('leaves initialValue out for the universal syntax without one', () => {
    const { properties } = compileCssToRules(
      '@property --any { syntax: "*"; inherits: true; }',
      { filename: 'tokens.css' },
    );

    expect(properties).toEqual([{ name: '--any', syntax: '*', inherits: true }]);
  });

  it('hands an empty initial value over as the empty string', () => {
    const { properties } = compileCssToRules(
      '@property --registered { syntax: "*"; initial-value: ; inherits: false; }',
      { filename: 'tokens.css' },
    );

    expect(properties).toEqual([
      { name: '--registered', syntax: '*', inherits: false, initialValue: '' },
    ]);
  });

  it('keeps the initial value text that a parsed form would round', () => {
    const { properties } = compileCssToRules(
      '@property --tint { syntax: "<color>"; inherits: true; initial-value: #A3D94F; }',
      { filename: 'tokens.css' },
    );

    expect(properties.map(property => property.initialValue)).toEqual(['#A3D94F']);
  });

  it('drops a typed rule with no initial value, as a browser does', () => {
    const { properties } = compileCssToRules(
      '@property --gap { syntax: "<length>"; inherits: true; }',
      { filename: 'tokens.css' },
    );

    expect(properties).toEqual([]);
  });

  it('carries the condition of an enclosing @media block', () => {
    const { properties, conditions } = compileCssToRules(
      '@media (min-width: 600px) { @property --gap { syntax: "*"; inherits: true; } }',
      { filename: 'tokens.css' },
    );

    expect(properties).toEqual([{ name: '--gap', syntax: '*', inherits: true, cond: 0 }]);
    expect(conditions).toEqual([['>=', 'width', 600]]);
    expect(warnings()).toEqual([]);
  });

  it('leaves a rule outside any @media without a condition', () => {
    const { properties } = compileCssToRules(
      '@property --a { syntax: "*"; inherits: true; }\n@media (min-width: 600px) { @property --b { syntax: "*"; inherits: true; } }',
      { filename: 'tokens.css' },
    );

    expect(properties.map(property => property.cond)).toEqual([undefined, 0]);
  });

  // Ported from wpt `css-properties-values-api/at-property.html`
  it.each(['none', '0', '1', '"true"', '"false"', 'calc(0)'])(
    'drops a rule whose inherits is [%s]',
    inherits => {
      const { properties } = compileCssToRules(
        `@property --x { syntax: "*"; inherits: ${inherits}; }`,
        { filename: 'tokens.css' },
      );

      expect(properties).toEqual([]);
    },
  );

  it.each([
    ['true', true],
    ['false', false],
  ])('keeps a rule whose inherits is [%s]', (inherits, expected) => {
    const { properties } = compileCssToRules(
      `@property --x { syntax: "*"; inherits: ${inherits}; }`,
      { filename: 'tokens.css' },
    );

    expect(properties.map(property => property.inherits)).toEqual([expected]);
  });

  it.each(['<color>', 'foo | bar'])(
    'drops a rule whose syntax is not quoted [%s]',
    syntax => {
      const { properties } = compileCssToRules(
        `@property --x { syntax: ${syntax}; inherits: true; initial-value: red; }`,
        { filename: 'tokens.css' },
      );

      expect(properties).toEqual([]);
    },
  );

  it.each(['foo', '-foo'])('drops a rule whose name is [%s]', name => {
    const { properties } = compileCssToRules(
      `@property ${name} { syntax: "*"; inherits: true; }`,
      { filename: 'tokens.css' },
    );

    expect(properties).toEqual([]);
  });

  it.each(['*', ' * ', '* ', '\t*\t'])(
    'hands the universal syntax over as written [%j]',
    syntax => {
      const { properties } = compileCssToRules(
        `@property --x { syntax: "${syntax}"; inherits: true; }`,
        { filename: 'tokens.css' },
      );

      expect(properties.map(property => property.syntax)).toEqual([syntax]);
    },
  );
});
