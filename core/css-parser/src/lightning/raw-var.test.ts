// A `var()` is never resolved at build time: the declaration ships under its RN name with the
// authored value text, and C++ substitutes it per node (ledger decisions 7 and 10)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileCssToRules } from './rules.ts';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

let fileCounter = 0;

function compile(css: string) {
  return compileCssToRules(css, { filename: `raw-var-${++fileCounter}.css` });
}

function styleOf(css: string) {
  return compile(css).rules.map(rule => rule.style);
}

function warnings(): string[] {
  return warn.mock.calls.map(call => String(call[0]));
}

describe('a declaration that reads a custom property', () => {
  it('ships the authored text under the RN name', () => {
    expect(styleOf('.a { color: var(--ink) }')).toEqual([{ color: 'var(--ink)' }]);
  });

  it('keeps a shorthand whole, to be expanded on the device', () => {
    expect(styleOf('.a { padding: var(--pad) 16px }')).toEqual([
      { padding: 'var(--pad) 16px' },
    ]);
  });

  it('keeps the fallback, nested references included', () => {
    expect(styleOf('.a { width: var(--w, var(--base, 12px)) }')).toEqual([
      { width: 'var(--w, var(--base, 12px))' },
    ]);
  });

  it('camel-cases a longhand', () => {
    expect(
      styleOf('.a { background-color: var(--bg); margin-top: var(--gap) }'),
    ).toEqual([{ backgroundColor: 'var(--bg)', marginTop: 'var(--gap)' }]);
  });

  it('names the shorthands by their RN keys', () => {
    expect(
      styleOf(
        '.a { border-radius: var(--r); border-color: var(--c); gap: var(--g); inset: var(--i) }',
      ),
    ).toEqual([
      { borderRadius: 'var(--r)', borderColor: 'var(--c)', gap: 'var(--g)', inset: 'var(--i)' },
    ]);
  });

  it('keeps a raw-kind property as text', () => {
    expect(styleOf('.a { box-shadow: 0 0 var(--blur) red }')).toEqual([
      { boxShadow: '0 0 var(--blur) red' },
    ]);
  });

  it('keeps text-shadow whole under its CSS name in camel case', () => {
    expect(styleOf('.a { text-shadow: 1px 1px var(--blur) red }')).toEqual([
      { textShadow: '1px 1px var(--blur) red' },
    ]);
  });

  it('does not warn about a variable another file declares', () => {
    compile('.a { color: var(--elsewhere) }');
    expect(warnings()).toEqual([]);
  });

  it('drops a property React Native has no name for, and says so', () => {
    expect(styleOf('.a { grid-template-columns: var(--cols) }')).toEqual([]);
    expect(warnings()[0]).toContain('"grid-template-columns"');
  });
});

describe('a CSS-wide keyword on a container property', () => {
  it.each(['initial', 'unset'])('resets with `%s`, so a later rule can cancel an earlier one', word => {
    expect(styleOf(`.a { container-type: ${word} }`)).toEqual([{ containerType: 'normal' }]);
    expect(styleOf(`.a { container-name: ${word} }`)).toEqual([{ containerName: 'none' }]);
    expect(styleOf(`.a { container: ${word} }`)).toEqual([
      { containerName: 'none', containerType: 'normal' },
    ]);
  });

  it.each(['inherit', 'revert'])('drops `%s` with a warning, as no parent style is read', word => {
    expect(styleOf(`.a { container-type: ${word} }`)).toEqual([]);
    expect(warnings().join('\n')).toContain(word);
  });
});

describe('a custom property declared in a class rule', () => {
  it('ships as a `--name` style key next to the rest', () => {
    expect(styleOf('.a { --accent: #123456; width: 4px }')).toEqual([
      { '--accent': '#123456', width: 4 },
    ]);
  });

  it('keeps a chain to another variable as text', () => {
    expect(styleOf('.a { --b: var(--a, 8px) }')).toEqual([{ '--b': 'var(--a, 8px)' }]);
  });

  it('keeps a multi-token value intact', () => {
    expect(styleOf('.a { --edge: 1px solid rgba(0, 0, 0, .5) }')).toEqual([
      { '--edge': '1px solid #00000080' },
    ]);
  });

  it('keeps the condition of an enclosing @media on the rule', () => {
    const { rules } = compile('@media (min-width: 600px) { .wide { --m: 4px } }');
    expect(rules.map(rule => rule.style)).toEqual([{ '--m': '4px' }]);
    expect(rules[0]?.cond).toBeDefined();
  });

  it('lets the later declaration of a name win', () => {
    expect(styleOf('.a { --x: 1px; --x: 2px }')).toEqual([{ '--x': '2px' }]);
  });
});

describe('a custom property declared on :root', () => {
  it('goes to `rootVariables` in source order, with no rule', () => {
    const { rules, rootVariables } = compile(':root { --lime: #a3d94f; --gap: 8px }');
    expect(rules).toEqual([]);
    expect(rootVariables).toEqual([
      { name: '--lime', value: '#a3d94f' },
      { name: '--gap', value: '8px' },
    ]);
    expect(warnings()).toEqual([]);
  });

  it('keeps the read in the class rule unresolved', () => {
    const { rules } = compile(':root { --lime: #a3d94f }\n.tile { color: var(--lime) }');
    expect(rules.map(rule => rule.style)).toEqual([{ color: 'var(--lime)' }]);
  });

  it('carries the condition of an enclosing @media', () => {
    const { rootVariables, conditions } = compile(
      '@media (prefers-color-scheme: dark) { :root { --bg: #000 } }',
    );
    expect(rootVariables).toHaveLength(1);
    expect(rootVariables[0]).toMatchObject({ name: '--bg', value: '#000' });
    const cond = rootVariables[0]?.cond;
    expect(cond).toBeDefined();
    expect(conditions[cond ?? -1]).toEqual(['=', 'prefers-color-scheme', 'dark']);
  });

  it('still warns when the block also paints', () => {
    const { rootVariables } = compile(':root { --lime: #a3d94f; color: blue }');
    expect(rootVariables).toEqual([{ name: '--lime', value: '#a3d94f' }]);
    expect(warnings()[0]).toContain('more than custom properties');
  });
});

// Ported from wpt `css-variables/test_variable_legal_values.html`: any balanced token run is a
// legal custom property value, and an unbalanced one drops the declaration so the earlier wins
describe('the values a custom property may hold', () => {
  const allowed = [
    '37',
    '12em',
    '75ms',
    'foo()',
    'foo(bar())',
    '( )',
    '{ }',
    '[ ]',
    '@foobar',
    '@media',
    '@foobar {}',
    '@media {}',
    '(;)',
  ];

  it.each(allowed)('keeps `%s` as written', value => {
    expect(styleOf(`.a { --test: green; --test: ${value} }`)).toEqual([{ '--test': value }]);
  });

  it('keeps a percentage, printed with a decimal point by lightningcss', () => {
    expect(styleOf('.a { --test: 25% }')).toEqual([{ '--test': '25.0%' }]);
  });

  const unbalanced = [']', ')', '(])', '[)]', '(})'];

  it.each(unbalanced)('ignores the unbalanced `%s` and keeps the earlier value', value => {
    expect(styleOf(`.a { --test: green; --test: ${value} }`)).toEqual([{ '--test': 'green' }]);
  });

  it('keeps the declarations on both sides of an unbalanced one', () => {
    expect(styleOf('.a { width: 2px; color: ]; height: 3px }')).toEqual([
      { width: 2, height: 3 },
    ]);
  });

  it('still tells the author about the unbalanced declaration', () => {
    compile('.a { color: ] }');
    expect(warnings().join('\n')).toContain('Unexpected token');
  });
});
