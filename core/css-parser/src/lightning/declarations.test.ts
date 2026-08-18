// Co-located unit test for the typed declaration mapper. Every case feeds REAL lightningcss
// output — the helper below parses the CSS and hands `declarationToStyle` the same objects a
// visitor would — because the whole point of this file is that the AST already carries the
// structure the old text parser had to re-derive; asserting against a hand-built fake object
// would test the fake.
//
// Cases marked "differs from the text parser" are deliberate: they are the three silent bugs
// recorded in `.claude/rules/style-registry-collisions.md` (traps 4 and 5, plus the cross-file
// `var()` trap), plus the colour normalisation lightningcss does on the way in.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { transform } from 'lightningcss';
import { declarationToStyle, variablesIn } from './declarations.ts';
import type { IStyleObject } from './declarations.ts';

interface ICompileOptions {
  readonly variables?: Record<string, string>;
  readonly remToPx?: number;
  readonly filename?: string;
}

let fileCounter = 0;

/** Compile one rule body through lightningcss and map every declaration it produced. */
function compile(body: string, options: ICompileOptions = {}): IStyleObject {
  const declarations: unknown[] = [];

  transform({
    filename: 'input.css',
    code: new TextEncoder().encode(`.probe{${body}}`),
    visitor: {
      Rule(rule) {
        if (rule.type !== 'style') return;
        declarations.push(
          ...rule.value.declarations.declarations,
          ...rule.value.declarations.importantDeclarations,
        );
      },
    },
  });

  const context = {
    filename: options.filename ?? `case-${++fileCounter}.css`,
    variables: new Map(Object.entries(options.variables ?? {})),
    remToPx: options.remToPx,
  };

  const style: IStyleObject = {};
  for (const declaration of declarations) {
    Object.assign(style, declarationToStyle(declaration, context));
  }
  return style;
}

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

describe('declarationToStyle — longhands and simple values', () => {
  const cases: ReadonlyArray<readonly [string, IStyleObject]> = [
    ['padding-top: 8px', { paddingTop: 8 }],
    ['margin-left: 4px', { marginLeft: 4 }],
    ['border-top-width: 2px', { borderTopWidth: 2 }],
    ['width: 120px', { width: 120 }],
    ['width: 0', { width: 0 }],
    ['min-height: 40px', { minHeight: 40 }],
    ['opacity: .5', { opacity: 0.5 }],
    ['flex-grow: 2', { flexGrow: 2 }],
    ['z-index: 3', { zIndex: 3 }],
    ['aspect-ratio: 1.5', { aspectRatio: 1.5 }],
    // The text parser reads `2/3` with `parseFloat` and lands on 2; the typed ratio divides.
    ['aspect-ratio: 2/3', { aspectRatio: 0.6666667 }],
    // f32 storage turns 1.4 into 1.399999976158142 — seven significant digits restore it.
    ['line-height: 1.4', { lineHeight: 1.4 }],
    ['letter-spacing: .5px', { letterSpacing: 0.5 }],
  ];

  it.each(cases)('maps `%s`', (css, expected) => {
    expect(compile(css)).toEqual(expected);
  });

  it('emits nothing and stays silent for a value that IS the CSS initial value', () => {
    expect(compile('letter-spacing: normal')).toEqual({});
    expect(warnings()).toEqual([]);
  });

  it('passes an !important declaration through like any other', () => {
    expect(compile('z-index: 3 !important')).toEqual({ zIndex: 3 });
  });

  it('ignores anything that is not a lightningcss declaration', () => {
    const context = { filename: 'x.css', variables: new Map<string, string>() };
    expect(declarationToStyle(null, context)).toEqual({});
    expect(declarationToStyle('padding: 8px', context)).toEqual({});
    expect(declarationToStyle({ nope: true }, context)).toEqual({});
  });
});

describe('declarationToStyle — shorthand expansion (trap 4)', () => {
  const cases: ReadonlyArray<readonly [string, IStyleObject]> = [
    ['padding: 8px', { padding: 8 }],
    // DIFFERS from the text parser, on purpose: it emitted `{ padding: 8 }` and lost the 16.
    [
      'padding: 8px 16px',
      { paddingTop: 8, paddingRight: 16, paddingBottom: 8, paddingLeft: 16 },
    ],
    [
      'padding: 1px 2px 3px 4px',
      { paddingTop: 1, paddingRight: 2, paddingBottom: 3, paddingLeft: 4 },
    ],
    // DIFFERS from the text parser: it emitted `{ margin: 5 }`.
    [
      'margin: 5px 10px',
      { marginTop: 5, marginRight: 10, marginBottom: 5, marginLeft: 10 },
    ],
    [
      'margin: 0 auto',
      {
        marginTop: 0,
        marginRight: 'auto',
        marginBottom: 0,
        marginLeft: 'auto',
      },
    ],
    ['border-width: 2px', { borderWidth: 2 }],
    [
      'border-width: 1px 2px 3px 4px',
      {
        borderTopWidth: 1,
        borderRightWidth: 2,
        borderBottomWidth: 3,
        borderLeftWidth: 4,
      },
    ],
    ['border-width: thin', { borderWidth: 1 }],
    ['border-radius: 4px', { borderRadius: 4 }],
    [
      'border-radius: 4px 8px',
      {
        borderTopLeftRadius: 4,
        borderTopRightRadius: 8,
        borderBottomRightRadius: 4,
        borderBottomLeftRadius: 8,
      },
    ],
    ['border-radius: 50%', { borderRadius: '50%' }],
    // RN has no `inset`-era guarantee, so this one always expands even when uniform.
    ['inset: 0', { top: 0, right: 0, bottom: 0, left: 0 }],
    ['inset: 0 10px', { top: 0, right: 10, bottom: 0, left: 10 }],
    ['gap: 8px', { gap: 8 }],
    ['gap: 8px 12px', { rowGap: 8, columnGap: 12 }],
    ['border-style: solid', { borderStyle: 'solid' }],
  ];

  it.each(cases)('maps `%s`', (css, expected) => {
    expect(compile(css)).toEqual(expected);
  });

  it('drops a per-side border-style — RN has only the shorthand', () => {
    expect(compile('border-style: solid dashed')).toEqual({});
    expect(warnings()[0]).toContain('"border-style" differs per side');
  });

  it('drops a per-axis overflow — RN has one overflow prop', () => {
    expect(compile('overflow: hidden')).toEqual({ overflow: 'hidden' });
    expect(compile('overflow: hidden scroll')).toEqual({});
    expect(warnings().join('\n')).toContain('"overflow" differs per axis');
  });

  it('keeps the RN one-key `flex` for the `flex: <number>` form', () => {
    expect(compile('flex: 1')).toEqual({ flex: 1 });
    expect(compile('flex: 2')).toEqual({ flex: 2 });
  });

  it('expands a full three-part flex, which RN cannot say in one key', () => {
    expect(compile('flex: 1 0 auto')).toEqual({
      flexGrow: 1,
      flexShrink: 0,
      flexBasis: 'auto',
    });
  });
});

describe('declarationToStyle — lengths, percentages, rem', () => {
  const cases: ReadonlyArray<readonly [string, IStyleObject]> = [
    // lightningcss reports a percentage as a fraction (1 === 100%); it comes back out as text.
    ['width: 100%', { width: '100%' }],
    ['max-width: 50%', { maxWidth: '50%' }],
    ['height: auto', { height: 'auto' }],
    ['font-size: 1.5rem', { fontSize: 24 }],
    ['padding-top: 2em', { paddingTop: 32 }],
    ['width: 12pt', { width: 16 }],
  ];

  it.each(cases)('maps `%s`', (css, expected) => {
    expect(compile(css)).toEqual(expected);
  });

  it('honours a custom root font size', () => {
    expect(compile('font-size: 1.5rem', { remToPx: 10 })).toEqual({
      fontSize: 15,
    });
  });
});

describe('declarationToStyle — calc() (trap 5)', () => {
  it('evaluates a sum whose operands all reduce to px', () => {
    expect(compile('width: calc(1rem + 2px)')).toEqual({ width: 18 });
    expect(warnings()).toEqual([]);
  });

  it('evaluates what lightningcss already folded', () => {
    // `calc(2rem * 2)` reaches us as a plain `4rem`, `calc(10px + 4px)` as `14px`.
    expect(compile('height: calc(2rem * 2)')).toEqual({ height: 64 });
    expect(compile('width: calc(10px + 4px)')).toEqual({ width: 14 });
  });

  const dropped: ReadonlyArray<string> = [
    // DIFFERS from the text parser, on purpose: it emitted `{ width: 100 }`, i.e. ~100pt wide.
    'width: calc(100% - 24px)',
    'width: calc(50% + 10px)',
    'width: calc(100vw - 32px)',
    'width: min(100px, 50%)',
  ];

  it.each(dropped)('drops `%s` with a warning', css => {
    expect(compile(css)).toEqual({});
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('[@symbiote-native/css-parser]');
  });

  it('names calc() as the reason when the expression is what failed', () => {
    compile('width: calc(100% - 24px)');
    expect(warnings()[0]).toContain('calc() mixing units');
  });
});

describe('declarationToStyle — colors', () => {
  const cases: ReadonlyArray<readonly [string, IStyleObject]> = [
    ['color: rgba(0, 0, 0, .5)', { color: 'rgba(0, 0, 0, 0.5)' }],
    ['color: rgba(0, 0, 0, .3)', { color: 'rgba(0, 0, 0, 0.3)' }],
    ['background-color: #000', { backgroundColor: '#000' }],
    ['background-color: #0f1e30', { backgroundColor: '#0f1e30' }],
    ['color: #123456', { color: '#123456' }],
    // DIFFERS from the text parser (`'red'`): lightningcss normalises every legacy notation to
    // rgb before we see it, so a keyword and an hsl() both come back as their hex. RN's
    // processColor reads hex and keyword alike, so this is a spelling change, not a behaviour one.
    ['color: red', { color: '#f00' }],
    ['color: hsl(200, 50%, 40%)', { color: '#379' }],
    [
      'border-top-color: #ff8800cc',
      { borderTopColor: 'rgba(255, 136, 0, 0.8)' },
    ],
    ['border-color: red', { borderColor: '#f00' }],
    [
      'border-color: red blue',
      {
        borderTopColor: '#f00',
        borderRightColor: '#00f',
        borderBottomColor: '#f00',
        borderLeftColor: '#00f',
      },
    ],
  ];

  it.each(cases)('maps `%s`', (css, expected) => {
    expect(compile(css)).toEqual(expected);
  });

  it('drops a wide-gamut color RN cannot read', () => {
    expect(compile('color: oklch(50% 0.1 200)')).toEqual({});
    expect(warnings()).toHaveLength(1);
  });
});

describe('declarationToStyle — raw passthrough properties', () => {
  // These are handed to the engine as CSS TEXT on purpose (RN's own JS processors parse them at
  // commit time), so the assertion is on lightningcss's printed form of the typed value.
  const cases: ReadonlyArray<readonly [string, IStyleObject]> = [
    [
      'transform: translateX(10px) rotate(45deg)',
      { transform: 'translateX(10px) rotate(45deg)' },
    ],
    ['filter: blur(2px)', { filter: 'blur(2px)' }],
    ['transform-origin: top left', { transformOrigin: '0 0' }],
    ['display: flex', { display: 'flex' }],
    ['position: absolute', { position: 'absolute' }],
    ['flex-direction: row', { flexDirection: 'row' }],
    ['align-items: center', { alignItems: 'center' }],
    ['text-align: center', { textAlign: 'center' }],
    ['font-weight: bold', { fontWeight: 'bold' }],
    ['font-weight: 600', { fontWeight: '600' }],
    ['font-style: italic', { fontStyle: 'italic' }],
    ['font-family: "Inter", sans-serif', { fontFamily: 'Inter, sans-serif' }],
    ['text-decoration-line: underline', { textDecorationLine: 'underline' }],
  ];

  it.each(cases)('maps `%s`', (css, expected) => {
    expect(compile(css)).toEqual(expected);
  });

  it('prints a gradient back for the engine to parse', () => {
    expect(
      compile(
        'background-image: linear-gradient(45deg, #ff3e00 0%, #0f1e30 100%)',
      ),
    ).toEqual({
      experimental_backgroundImage:
        'linear-gradient(45deg, #ff3e00 0%, #0f1e30 100%)',
    });
  });

  it('prints a box-shadow back for the engine to parse', () => {
    expect(compile('box-shadow: 0 2px 4px rgba(0, 0, 0, .2)')).toEqual({
      boxShadow: '0 2px 4px #0003',
    });
  });
});

describe('declarationToStyle — custom properties and var()', () => {
  it('ignores a `--x` declaration: the caller collects those in a pre-pass', () => {
    expect(compile('--mist: #eee')).toEqual({});
    expect(warnings()).toEqual([]);
  });

  it('substitutes a declared custom property', () => {
    expect(
      compile('background-color: var(--mist)', {
        variables: { '--mist': '#eee' },
      }),
    ).toEqual({ backgroundColor: '#eee' });
  });

  it('substitutes inside a shorthand and still expands the result', () => {
    expect(
      compile('padding: var(--pad) 16px', { variables: { '--pad': '8px' } }),
    ).toEqual({
      paddingTop: 8,
      paddingRight: 16,
      paddingBottom: 8,
      paddingLeft: 16,
    });
  });

  it('substitutes a var() nested in calc()', () => {
    expect(
      compile('width: calc(var(--w) + 2px)', { variables: { '--w': '1rem' } }),
    ).toEqual({ width: 18 });
  });

  it('follows a custom property that itself uses another one', () => {
    expect(
      compile('color: var(--fg)', {
        variables: { '--fg': 'var(--ink)', '--ink': '#123456' },
      }),
    ).toEqual({ color: '#123456' });
  });

  it('uses the var() fallback when the name is undeclared', () => {
    expect(compile('color: var(--nope, #333)')).toEqual({ color: '#333' });
    expect(warnings()).toEqual([]);
  });

  it('DIFFERS from the text parser: drops an undeclared var() instead of shipping its text', () => {
    // The text parser registers the literal string `"var(--mist)"` and sends it to Fabric, which
    // paints nothing — the cross-file trap in `.claude/rules/style-registry-collisions.md`.
    expect(compile('color: var(--mist)')).toEqual({});
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('"--mist"');
    expect(warnings()[0]).toContain('not declared in this file');
  });
});

describe('declarationToStyle — unsupported properties', () => {
  it('warns once per (file, property) and drops', () => {
    const filename = 'dedupe-probe.css';
    expect(compile('grid-template-columns: 1fr', { filename })).toEqual({});
    expect(compile('grid-template-columns: 2fr', { filename })).toEqual({});
    expect(warnings()).toHaveLength(1);
    expect(warnings()[0]).toContain('unsupported CSS property');
  });

  it('warns again for the same property in a different file', () => {
    compile('grid-template-columns: 1fr', { filename: 'a-probe.css' });
    compile('grid-template-columns: 1fr', { filename: 'b-probe.css' });
    expect(warnings()).toHaveLength(2);
  });

  it('warns on a property name lightningcss does not know either', () => {
    expect(compile('colr: red')).toEqual({});
    expect(warnings()[0]).toContain('"colr"');
  });
});

describe('declarationToStyle — text-shadow (object-valued style entry)', () => {
  // Parity target is the shape the retired text pass emitted — same three keys, same
  // `{ width, height }` offset object, same black default when the author wrote no color.
  it('maps a full text-shadow', () => {
    expect(compile('text-shadow: 1px 2px 3px rgba(0, 0, 0, .3)')).toEqual({
      textShadowColor: 'rgba(0, 0, 0, 0.3)',
      textShadowOffset: { width: 1, height: 2 },
      textShadowRadius: 3,
    });
    expect(warnings()).toEqual([]);
  });

  it('defaults the radius to 0 when the author wrote no blur', () => {
    expect(compile('text-shadow: 1px 2px red')).toEqual({
      textShadowColor: '#f00',
      textShadowOffset: { width: 1, height: 2 },
      textShadowRadius: 0,
    });
  });

  it('defaults the color to black when the author wrote none', () => {
    // CSS defaults an omitted shadow color to `currentColor`, which RN has no concept of.
    expect(compile('text-shadow: 1px 2px 3px')).toEqual({
      textShadowColor: '#000000',
      textShadowOffset: { width: 1, height: 2 },
      textShadowRadius: 3,
    });
  });

  it('scales rem offsets like any other length', () => {
    expect(compile('text-shadow: .5rem 1rem 2px #333')).toEqual({
      textShadowColor: '#333',
      textShadowOffset: { width: 8, height: 16 },
      textShadowRadius: 2,
    });
  });

  it('keeps only the first layer and warns, wording matching the text parser', () => {
    expect(compile('text-shadow: 1px 2px 3px red, 4px 5px 6px blue')).toEqual({
      textShadowColor: '#f00',
      textShadowOffset: { width: 1, height: 2 },
      textShadowRadius: 3,
    });
    expect(warnings()[0]).toContain(
      'multiple text-shadow layers are not supported, only the first is applied',
    );
  });

  it('carries both offset components, not just one', () => {
    // Guards the object path itself: a mapper that emitted `{ width }` alone would still
    // satisfy a `toMatchObject`-style check on the other two keys.
    const style = compile('text-shadow: 7px 9px 1px #000');
    expect(style.textShadowOffset).toEqual({ width: 7, height: 9 });
  });
});

describe('variablesIn', () => {
  it('collects a custom property declared in :root', () => {
    expect([...variablesIn(':root{--mist:#eee}', 'a.css')]).toEqual([
      ['--mist', '#eee'],
    ]);
  });

  it('collects a custom property declared in an ordinary class rule', () => {
    // Nothing orders `:root` first, which is why this is a pass of its own.
    expect([...variablesIn('.card{--pad:8px;color:red}', 'a.css')]).toEqual([
      ['--pad', '8px'],
    ]);
  });

  it('collects one declared inside an at-rule', () => {
    expect([
      ...variablesIn('@media (min-width:600px){.wide{--m:4px}}', 'a.css'),
    ]).toEqual([['--m', '4px']]);
  });

  it('lets the later declaration of a name win, as the cascade does', () => {
    const variables = variablesIn(':root{--a:#eee}.card{--a:#111}', 'a.css');
    expect(variables.get('--a')).toBe('#111');
    expect(variables.size).toBe(1);
  });

  it('returns an empty map for a file that declares none', () => {
    expect(variablesIn('.card{color:red}', 'a.css').size).toBe(0);
    expect(variablesIn('', 'a.css').size).toBe(0);
  });

  it('stores a var() chain VERBATIM — resolution stays in declarationToStyle', () => {
    const variables = variablesIn(
      ':root{--ink:#123456;--fg:var(--ink)}',
      'a.css',
    );
    expect(variables.get('--fg')).toBe('var(--ink)');
    expect(variables.get('--ink')).toBe('#123456');
  });

  it('keeps a var() fallback in the stored text', () => {
    expect(
      variablesIn(':root{--f:var(--nope, 12px)}', 'a.css').get('--f'),
    ).toBe('var(--nope, 12px)');
  });

  it('keeps a multi-token value intact', () => {
    expect(
      variablesIn(':root{--g:1px solid rgba(0,0,0,.5)}', 'a.css').get('--g'),
    ).toBe('1px solid rgba(0, 0, 0, 0.5)');
  });

  it('feeds declarationToStyle end to end', () => {
    const css = '.card{--pad:8px;padding:var(--pad) 16px}';
    const variables = variablesIn(css, 'e2e.css');
    expect(
      compile('padding: var(--pad) 16px', {
        variables: Object.fromEntries(variables),
      }),
    ).toEqual({
      paddingTop: 8,
      paddingRight: 16,
      paddingBottom: 8,
      paddingLeft: 16,
    });
  });
});
