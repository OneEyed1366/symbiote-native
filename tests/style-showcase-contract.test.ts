// The contract `examples/react`'s `StyleShowcaseScreen` demonstrates, asserted per tile
// The real compiler runs over the real sheets, then the real registry over the emitted rules
// Lives here, not in `examples/react`, since examples resolve published tarballs, not the tree
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
import { containerStyleOf } from '../core/engine/src/container-tracking.ts';
import type { IStyleRule } from '../core/engine/src/style-registry/index.ts';
import type {
  IMediaCondition,
  IMediaEnvironment,
} from '../core/engine/src/style-registry/media-evaluate.ts';
import {
  clearGlobalStyles,
  registerRules,
  resolveClassName,
  setMediaEnvironment,
} from '../core/engine/src/style-registry/index.ts';

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const SHEET_DIR = 'examples/react/screens';

const MAIN = `${SHEET_DIR}/StyleShowcase.css`;
const MODULE = `${SHEET_DIR}/StyleShowcase.module.css`;
const LIMITS = `${SHEET_DIR}/StyleShowcase.limits.css`;
const MEDIA = `${SHEET_DIR}/StyleShowcase.media.css`;
const LAB = `${SHEET_DIR}/StyleShowcase.lab.css`;
const LAB_E2E = 'examples/react/e2e/lab-colors.ts';
const LAB_PANELS = `${SHEET_DIR}/style-showcase/lab-panels.tsx`;
const SCSS = `${SHEET_DIR}/showcase.scss`;
const LESS = `${SHEET_DIR}/showcase.less`;
const STYLUS = `${SHEET_DIR}/showcase.styl`;

type ICompiled = {
  readonly rules: readonly IStyleRule[];
  readonly conditions: readonly IMediaCondition[];
  readonly exports: Record<string, string>;
  readonly warnings: readonly string[];
};

// The compiled module is JS source, so the payload is read back out of it rather than eval'd
// Both the `registerRules` rules and the `export default` map are plain JSON by construction
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

  const rulesMatch =
    /registerRules\((\[[\s\S]*?\])(?:, (\[[\s\S]*?\]))?\);/.exec(code);
  if (rulesMatch === null) {
    throw new Error(`${relativePath}: emitted no registerRules() call`);
  }
  const exportsMatch = /export default (\{[\s\S]*?\});/.exec(code);

  return {
    rules: JSON.parse(rulesMatch[1]),
    conditions: rulesMatch[2] === undefined ? [] : JSON.parse(rulesMatch[2]),
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
let media: ICompiled;
let lab: ICompiled;
let scss: ICompiled;
let less: ICompiled;
let stylus: ICompiled;

// Sequential, NOT Promise.all, since each compile installs a `console.warn` spy
// Concurrent compiles would restore each other's spy and misfile the warnings
beforeAll(async () => {
  main = await compile(MAIN);
  cssModule = await compile(MODULE);
  limits = await compile(LIMITS);
  media = await compile(MEDIA);
  lab = await compile(LAB);
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

  // The token stays a `var()` here, since C++ substitutes it per node on the device
  it('lets the earlier, more specific rule win the fill', () => {
    registerRules(main.rules);
    expect(
      resolveClassName('sc-spec-tile sc-spec-strong').backgroundColor,
    ).toBe('var(--sc-win)');
  });

  it('breaks an equal-specificity tie by the later line', () => {
    registerRules(main.rules);
    const resolved = resolveClassName(
      'sc-spec-tile sc-spec-early sc-spec-late',
    );
    // `--sc-sky` is .sc-spec-late; `--sc-rose` is .sc-spec-early, declared immediately above it
    expect(resolved.borderColor).toBe('var(--sc-sky)');
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
    [
      'scss',
      () => scss,
      { token: 'scss-tile', paddingRight: 26, borderRadius: 14 },
    ],
    [
      'less',
      () => less,
      { token: 'less-tile', paddingRight: 22, borderRadius: 18 },
    ],
    [
      'stylus',
      () => stylus,
      { token: 'styl-tile', paddingRight: 18, borderRadius: 22 },
    ],
  ])('%s emits arithmetic and a mixin result', (_language, get, expected) => {
    const { token, ...style } = expected;
    expect(ruleFor(get(), token)?.style).toMatchObject(style);
  });

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
  it('drops @supports whole and says so, and keeps @container behind its condition', () => {
    // The base paints always, the `@container` body only once a container above it matches
    const conditionRules = limits.rules.filter(rule =>
      rule.tokens.includes('sc-limit-cond'),
    );
    expect(conditionRules).toHaveLength(2);
    expect(conditionRules[0].style.backgroundColor).toBe('#16243a');
    expect(conditionRules[0].cond).toBeUndefined();
    expect(conditionRules[1].cond).toBe(0);
    expect(limits.conditions[0]).toEqual(['@', null, ['>=', 'width', 1]]);

    expect(
      limits.warnings.some(
        warning =>
          warning.includes('@supports') && warning.includes('not supported'),
      ),
      'no warning naming @supports',
    ).toBe(true);
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
    // Pins a known wrong-fire: nothing consumes the combinator, so `.a .b` matches one element
    // carrying both names, and this test is what says so once descendant matching lands
    const descendant = ruleFor(limits, 'sc-combo-parent', 'sc-combo-child');
    expect(descendant?.specificity).toEqual([0, 2, 0]);

    registerRules(limits.rules);
    // The nested child, which the rule was written for, gets nothing
    expect(resolveClassName('sc-combo-child').backgroundColor).toBe('#1c2c46');
    // The single element carrying both names, which the web never matches, goes red
    expect(
      resolveClassName('sc-combo-parent sc-combo-child').backgroundColor,
    ).toBe('#7a1f2b');
  });

  it('ships a var() raw whether this file or another declares it', () => {
    expect(ruleFor(limits, 'sc-limit-var-local')?.style.borderColor).toBe(
      'var(--sc-limit-lime)',
    );
    expect(ruleFor(limits, 'sc-limit-var-foreign')?.style.borderColor).toBe(
      'var(--mist)',
    );
    expect(
      limits.warnings.some(warning => warning.includes('not declared')),
    ).toBe(false);
  });
});

const PHONE: IMediaEnvironment = {
  width: 390,
  height: 844,
  resolution: 3,
  orientation: 'portrait',
  'prefers-color-scheme': 'light',
  'prefers-reduced-motion': 'no-preference',
  'prefers-contrast': 'no-preference',
  'prefers-reduced-transparency': 'no-preference',
  platform: 'ios',
  dir: 'ltr',
};

describe('panel 9 — @media, evaluated at runtime', () => {
  function tileStyle() {
    registerRules(media.rules, media.conditions);
    return resolveClassName('sc-media-tile');
  }

  it('paints the slate base on a narrow portrait window, with no warning', () => {
    setMediaEnvironment(PHONE);
    expect(tileStyle()).toMatchObject({ backgroundColor: '#16243a' });
    expect(media.warnings).toEqual([]);
  });

  it('turns green once the window is 600 wide, and slate again when it shrinks', () => {
    setMediaEnvironment(PHONE);
    registerRules(media.rules, media.conditions);

    setMediaEnvironment({ ...PHONE, width: 800 });
    expect(resolveClassName('sc-media-tile').backgroundColor).toBe('#2f7d4f');

    setMediaEnvironment(PHONE);
    expect(resolveClassName('sc-media-tile').backgroundColor).toBe('#16243a');
  });

  it('gets an amber border in landscape and keeps its fill', () => {
    setMediaEnvironment({
      ...PHONE,
      width: 844,
      height: 390,
      orientation: 'landscape',
    });
    expect(tileStyle()).toMatchObject({
      borderColor: '#e0a23a',
      backgroundColor: '#2f7d4f',
    });
  });
});

describe('panels 10 to 12 - the device lab', () => {
  const boxOf = (width: number) => () => ({ width, height: 112 });

  it('paints rose below 600 wide and teal from 600, with no warning', () => {
    registerRules(lab.rules, lab.conditions);

    setMediaEnvironment({ ...PHONE, width: 599 });
    expect(resolveClassName('lab-media-swatch').backgroundColor).toBe(
      '#e63946',
    );

    setMediaEnvironment({ ...PHONE, width: 600 });
    expect(resolveClassName('lab-media-swatch').backgroundColor).toBe(
      '#2a9d8f',
    );
    expect(lab.warnings).toEqual([]);
  });

  it.each([
    ['lab-consumer-swatch', 'backgroundColor', '#f4a261', '#264653'],
    ['lab-nested-inner', 'color', '#e76f51', '#6a4c93'],
    ['lab-first-swatch', 'backgroundColor', '#ff006e', '#3a86ff'],
    ['lab-first-nested-inner', 'color', '#fb5607', '#06d6a0'],
  ])(
    '%s is plain below 240 wide and held from 240',
    (token, property, plain, held) => {
      setMediaEnvironment(PHONE);
      registerRules(lab.rules, lab.conditions);

      expect(resolveClassName(token, boxOf(239))).toMatchObject({
        [property]: plain,
      });
      expect(resolveClassName(token, boxOf(240))).toMatchObject({
        [property]: held,
      });
    },
  );

  it('makes a container of each box and fixes the first one at 320', () => {
    expect(ruleFor(lab, 'lab-container')?.style).toMatchObject({
      containerType: 'size',
    });
    expect(ruleFor(lab, 'lab-container-first')?.style).toMatchObject({
      containerType: 'size',
      width: 320,
    });
  });

  it('ships the var() raw, since the value comes from the token or the surface', () => {
    expect(ruleFor(lab, 'lab-var-swatch')?.style.backgroundColor).toBe(
      'var(--lab-accent)',
    );
  });

  it('keeps the light colour on a light device and takes indigo on a dark one', () => {
    registerRules(lab.rules, lab.conditions);

    setMediaEnvironment({ ...PHONE, 'prefers-color-scheme': 'light' });
    expect(resolveClassName('lab-scheme-swatch').backgroundColor).toBe(
      '#ff9f1c',
    );

    setMediaEnvironment({ ...PHONE, 'prefers-color-scheme': 'dark' });
    expect(resolveClassName('lab-scheme-swatch').backgroundColor).toBe(
      '#5e60ce',
    );
  });

  it('reads the precedence token with var() and declares it on a :root token and a node class', () => {
    expect(ruleFor(lab, 'lab-prec-swatch')?.style.backgroundColor).toBe(
      'var(--lab-prec)',
    );
    expect(ruleFor(lab, 'lab-prec-node')?.style).toMatchObject({
      '--lab-prec': '#9ef01a',
    });
  });

  it('makes an inline-size container, and a height query in it never holds', () => {
    setMediaEnvironment(PHONE);
    registerRules(lab.rules, lab.conditions);
    const open = containerStyleOf(
      ruleFor(lab, 'lab-axis-box')?.style,
      undefined,
    )?.open;
    const inlineSize = () => ({ width: 320, height: 112, open });

    expect(ruleFor(lab, 'lab-axis-box')?.style).toMatchObject({
      containerType: 'inline-size',
    });
    expect(resolveClassName('lab-axis-width', inlineSize).backgroundColor).toBe(
      '#4361ee',
    );
    expect(
      resolveClassName('lab-axis-height', inlineSize).backgroundColor,
    ).toBe('#fcbf49');
  });

  it('leaves the container box plain, since its own query asks a container above it', () => {
    setMediaEnvironment(PHONE);
    registerRules(lab.rules, lab.conditions);

    expect(
      resolveClassName('lab-axis-box', () => undefined).backgroundColor,
    ).toBe('#6d597a');
  });

  it('declares every colour the device test counts, each once', () => {
    // The amber override is written by the panel at runtime, every other colour by the sheet
    const sheet = [LAB, LAB_PANELS]
      .map(file => readFileSync(path.join(REPO_ROOT, file), 'utf8'))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '')
      .toLowerCase();
    const spec = readFileSync(path.join(REPO_ROOT, LAB_E2E), 'utf8');
    const counted = [...spec.matchAll(/hexToRgb\('(#[0-9a-f]{6})'\)/gi)].map(
      match => match[1].toLowerCase(),
    );

    expect(counted).toHaveLength(23);
    expect(counted.filter(color => !sheet.includes(color))).toEqual([]);
    expect(new Set(counted).size).toBe(counted.length);
  });
});
