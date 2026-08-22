// The contract examples/react's StyleShowcaseScreen demonstrates, asserted.
//
// That screen is a showcase of the whole @symbiote-native/css-parser surface, built so a
// regression PAINTS: its corner-radius tile goes square, its filtered tile becomes its own twin,
// its limits tiles turn red. That only works while the CSS behind each tile still compiles to
// what the tile claims — and nobody looks at a simulator on every commit. The golden corpus
// snapshot next door pins the emitted BYTES of these same six sheets, which catches any change
// at all but says nothing about which change matters; this file names the specific facts each
// tile rests on, so a break reports the tile rather than a diff.
//
// It drives the real compiler over the real sheets on disk and then the real runtime registry
// over the emitted rules, so a break on either half is caught: a rule that stops being emitted,
// and a rule that stops WINNING.
//
// Lives here rather than in examples/react because examples/* is outside the pnpm workspace and
// resolves @symbiote-native/* from published tarballs — a test there would grade the last
// release, not the working tree. `tests/**` is this config's bucket for a check that reads
// several packages and asserts a contract between them.
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { compileCssFile } from '../core/css-parser/src/metro-css-module/index.ts';
import type { IStyleRule } from '../core/engine/src/style-registry/index.ts';
import {
  clearGlobalStyles,
  registerRules,
  resolveClassName,
} from '../core/engine/src/style-registry/index.ts';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const SHEET_DIR = 'examples/react/screens';

const MAIN = `${SHEET_DIR}/StyleShowcase.css`;
const MODULE = `${SHEET_DIR}/StyleShowcase.module.css`;
const LIMITS = `${SHEET_DIR}/StyleShowcase.limits.css`;
const SCSS = `${SHEET_DIR}/showcase.scss`;
const LESS = `${SHEET_DIR}/showcase.less`;
const STYLUS = `${SHEET_DIR}/showcase.styl`;

interface ICompiled {
  readonly rules: readonly IStyleRule[];
  readonly exports: Record<string, string>;
  readonly warnings: readonly string[];
}

// The compiled module is JS source, so the payload is read back out of it rather than eval'd —
// the registerRules([...]) argument and the `export default` map are exactly what Metro hands
// the bundle, and both are plain JSON by construction.
async function compile(relativePath: string): Promise<ICompiled> {
  const warnings: string[] = [];
  const spy = vi
    .spyOn(console, 'warn')
    .mockImplementation((...parts: unknown[]) => {
      warnings.push(parts.map(String).join(' '));
    });

  const source = readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
  const { code } = await compileCssFile(source, relativePath);
  spy.mockRestore();

  const rulesMatch = /registerRules\((\[[\s\S]*?\])\);/.exec(code);
  if (rulesMatch === null) {
    throw new Error(`${relativePath}: emitted no registerRules() call`);
  }
  const exportsMatch = /export default (\{[\s\S]*?\});/.exec(code);

  return {
    rules: JSON.parse(rulesMatch[1]),
    exports: exportsMatch === null ? {} : JSON.parse(exportsMatch[1]),
    warnings,
  };
}

function ruleFor(
  compiled: ICompiled,
  ...tokens: readonly string[]
): IStyleRule | undefined {
  return compiled.rules.find(
    rule =>
      rule.tokens.length === tokens.length &&
      tokens.every(token => rule.tokens.includes(token)),
  );
}

let main: ICompiled;
let cssModule: ICompiled;
let limits: ICompiled;
let scss: ICompiled;
let less: ICompiled;
let stylus: ICompiled;

// Sequential, NOT Promise.all: compile() installs a console.warn spy for the duration of one
// compile, and concurrent compiles would each restore the other's spy — the warnings then land
// on whichever file happened to be listening, and the three limits assertions read empty.
beforeAll(async () => {
  main = await compile(MAIN);
  cssModule = await compile(MODULE);
  limits = await compile(LIMITS);
  scss = await compile(SCSS);
  less = await compile(LESS);
  stylus = await compile(STYLUS);
});

// The registry is module-global, so every runtime case starts from empty and registers only the
// sheet it is about. Registration ORDER is part of the cascade (a later import outranks an
// earlier one at equal specificity), and a leftover sheet would quietly change it.
beforeEach(() => {
  clearGlobalStyles();
});
afterAll(() => {
  clearGlobalStyles();
});

describe('panel 1 — declarations the compiler emits', () => {
  it('expands a four-value padding and border-width into four distinct sides', () => {
    expect(ruleFor(main, 'sc-shorthand-box')?.style).toMatchObject({
      paddingTop: 6,
      paddingRight: 12,
      paddingBottom: 26,
      paddingLeft: 38,
      borderTopWidth: 1,
      borderRightWidth: 4,
      borderBottomWidth: 10,
      borderLeftWidth: 20,
    });
  });

  it('keeps all four corner-radius longhands', () => {
    // The bug the whole screen was built around: a corner longhand parses to a Size2D PAIR, and
    // reading it through the generic dimension path returned null and dropped it on a plain 20px.
    expect(ruleFor(main, 'sc-corner-longhand')?.style).toMatchObject({
      borderTopLeftRadius: 28,
      borderTopRightRadius: 4,
      borderBottomRightRadius: 28,
      borderBottomLeftRadius: 4,
    });
  });

  it('hands gradient, filter, transform-origin and box-shadow through as raw text', () => {
    // Each is a real native Fabric prop with a JS pre-parse the ENGINE owns, so css-parser only
    // renames the property. A missing key here means the rename was lost, not the parse.
    expect(
      ruleFor(main, 'sc-gradient-tile')?.style.experimental_backgroundImage,
    ).toContain('linear-gradient');
    expect(ruleFor(main, 'sc-filter-tile')?.style.filter).toContain(
      'grayscale',
    );
    expect(
      ruleFor(main, 'sc-origin-square-corner')?.style.transformOrigin,
    ).toBe('0 0');
    // Two comma-separated layers, both surviving — the decompose-to-shadowOffset heuristic this
    // replaced could only carry one.
    expect(
      String(ruleFor(main, 'sc-shadow-tile')?.style.boxShadow).split(',')
        .length,
    ).toBe(2);
  });
});

describe('panel 2 — specificity and source order', () => {
  it('gives the compound rule (0,2,0) and places it EARLIER in the file than the base', () => {
    const compound = ruleFor(main, 'sc-spec-tile', 'sc-spec-strong');
    const base = ruleFor(main, 'sc-spec-tile');
    expect(compound?.specificity).toEqual([0, 2, 0]);
    expect(base?.specificity).toEqual([0, 1, 0]);
    // The demo is only honest while the weaker rule is the LATER one — otherwise "specificity
    // beats position" is demonstrated by a file where position agrees anyway.
    expect(Number(compound?.order)).toBeLessThan(Number(base?.order));
  });

  it('lets the earlier, more specific rule win the fill', () => {
    registerRules(main.rules);
    expect(
      resolveClassName('sc-spec-tile sc-spec-strong').backgroundColor,
    ).toBe('#2f7d4f');
  });

  it('breaks an equal-specificity tie by the later line', () => {
    registerRules(main.rules);
    const resolved = resolveClassName(
      'sc-spec-tile sc-spec-early sc-spec-late',
    );
    // #7bd0ff is .sc-spec-late; #f2789a is .sc-spec-early, declared immediately above it.
    expect(resolved.borderColor).toBe('#7bd0ff');
  });
});

describe('panel 3 — compound selectors', () => {
  it('emits rules keyed on one, two and three modifiers', () => {
    expect(ruleFor(main, 'sc-tri', 'sc-t-a')?.specificity).toEqual([0, 2, 0]);
    expect(ruleFor(main, 'sc-tri', 'sc-t-a', 'sc-t-b')?.specificity).toEqual([
      0, 3, 0,
    ]);
    expect(
      ruleFor(main, 'sc-tri', 'sc-t-a', 'sc-t-b', 'sc-t-c')?.specificity,
    ).toEqual([0, 4, 0]);
  });

  it('layers a four-token element over the base instead of replacing it', () => {
    registerRules(main.rules);
    const resolved = resolveClassName('sc-tri sc-t-a sc-t-b sc-t-c');
    // From the three-modifier rule…
    expect(resolved.backgroundColor).toBe('#4a2a6b');
    expect(resolved.borderColor).toBe('#f5a524');
    // …from the two-modifier rule…
    expect(resolved.borderWidth).toBe(6);
    // …from .sc-t-c alone…
    expect(resolved.borderRadius).toBe(34);
    // …and the base's own geometry, which no modifier restates. Four tokens is exactly where the
    // retired permutation registry gave up.
    expect(resolved.height).toBe(72);
  });
});

describe('panel 6 — CSS Modules', () => {
  it('exports authored kebab keys, not camelCase', () => {
    expect(Object.keys(cssModule.exports).sort()).toEqual([
      'sc-chip-base',
      'sc-chip-loud',
      'sc-chip-text',
      'sc-chip-tinted',
      'sc-global-mark',
    ]);
  });

  it('flattens the composes chain composed-FIRST', () => {
    // Left-to-right merge in the registry means composed-last would let the base override the
    // composer, which is backwards from what `composes` means.
    const tokens = cssModule.exports['sc-chip-loud'].split(' ');
    expect(tokens.map(token => token.split('__module__')[0])).toEqual([
      'sc-chip-base',
      'sc-chip-tinted',
      'sc-chip-loud',
    ]);
  });

  it('resolves the chain to the last hop`s fill over the base`s shape', () => {
    registerRules(cssModule.rules);
    const resolved = resolveClassName(cssModule.exports['sc-chip-loud']);
    expect(resolved.backgroundColor).toBe('#2f7d4f');
    expect(resolved.borderRadius).toBe(999);
  });

  it('exports a :global() name as itself, unscoped', () => {
    expect(cssModule.exports['sc-global-mark']).toBe('sc-global-mark');
    // Upstream CSS Modules omits a global from the map entirely; we add it back so the author
    // keeps typed `styles.x` access instead of dropping to a bare string literal.
    expect(ruleFor(cssModule, 'sc-global-mark')?.style).toMatchObject({
      borderTopRightRadius: 4,
      borderBottomLeftRadius: 4,
    });
  });
});

describe('panel 7 — SCSS, Less and Stylus really ran', () => {
  // Each padding is a variable times two, so the number appears nowhere in the source: seeing it
  // proves the preprocessor evaluated, not merely that the file was found.
  it.each([
    ['scss', () => scss, 'scss-tile', 26, 14],
    ['less', () => less, 'less-tile', 22, 18],
    ['stylus', () => stylus, 'styl-tile', 18, 22],
  ])(
    '%s emits arithmetic and a mixin result',
    (_language, get, token, horizontalPadding, radius) => {
      expect(ruleFor(get(), String(token))?.style).toMatchObject({
        paddingRight: horizontalPadding,
        borderRadius: radius,
      });
    },
  );

  it.each([
    ['scss', () => scss, 'scss-tile', 'scss-tile-on'],
    ['less', () => less, 'less-tile', 'less-tile-on'],
    ['stylus', () => stylus, 'styl-tile', 'styl-tile-on'],
  ])(
    '%s compiles its & nest to a COMPOUND, not a descendant',
    (_l, get, base, modifier) => {
      // A nest that produced a descendant selector would land in the limits panel's territory:
      // the combinator is dropped from the rule and it matches like a compound anyway.
      expect(
        ruleFor(get(), String(base), String(modifier))?.specificity,
      ).toEqual([0, 2, 0]);
    },
  );
});

describe('panel 8 — the limits, each with its warning', () => {
  it('drops @media, @supports and @container whole, and says so', () => {
    // ONE rule for .sc-limit-cond — the base. Three more would mean a condition was honoured,
    // which is worse than dropping: the rules inside would paint unconditionally.
    const conditionRules = limits.rules.filter(rule =>
      rule.tokens.includes('sc-limit-cond'),
    );
    expect(conditionRules).toHaveLength(1);
    expect(conditionRules[0].style.backgroundColor).toBe('#16243a');

    for (const atRule of ['@media', '@supports', '@container']) {
      expect(
        limits.warnings.some(
          warning =>
            warning.includes(atRule) && warning.includes('not supported'),
        ),
        `no warning naming ${atRule}`,
      ).toBe(true);
    }
  });

  it('drops a calc() mixing a percentage with a length, and keeps a bare percentage', () => {
    expect(ruleFor(limits, 'sc-limit-calc-bad')?.style).not.toHaveProperty(
      'width',
    );
    expect(ruleFor(limits, 'sc-limit-calc-ok')?.style.width).toBe('100%');
    expect(limits.warnings.some(warning => warning.includes('calc()'))).toBe(
      true,
    );
  });

  it('reduces a descendant selector to a compound one — the wrong-fire, pinned', () => {
    // Stage 4 is open: the combinator rides along in the rule but nothing consumes it, so
    // `.a .b` matches an element carrying BOTH names. This asserts the WRONG behaviour on
    // purpose — the tile shows it, and when stage 4 lands this test is what says so.
    const descendant = ruleFor(limits, 'sc-combo-parent', 'sc-combo-child');
    expect(descendant?.specificity).toEqual([0, 2, 0]);

    registerRules(limits.rules);
    // The nested child, which is what the rule was written for, gets nothing.
    expect(resolveClassName('sc-combo-child').backgroundColor).toBe('#1c2c46');
    // The single element carrying both names, which the web would never match, goes red.
    expect(
      resolveClassName('sc-combo-parent sc-combo-child').backgroundColor,
    ).toBe('#7a1f2b');
  });

  it('resolves a var() from this file and drops one from another', () => {
    expect(ruleFor(limits, 'sc-limit-var-local')?.style.borderColor).toBe(
      '#a3d94f',
    );
    // The foreign reference was the only declaration in its rule, so the rule itself is gone —
    // it used to ship the literal string "var(--mist)" to Fabric instead, build-clean.
    expect(ruleFor(limits, 'sc-limit-var-foreign')).toBeUndefined();
    expect(
      limits.warnings.some(
        warning =>
          warning.includes('--mist') && warning.includes('not declared'),
      ),
    ).toBe(true);
  });
});
