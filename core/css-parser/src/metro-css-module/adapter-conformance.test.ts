// End-to-end conformance for the standalone-CSS path, across the three adapters that consume it
// (React `className`, Solid `class`, Angular `addClass`/`removeClass`). The chain runs for real:
// compileCssFile -> the emitted module's registerRules argument + default export -> the engine's
// registerRules -> routeProp with each adapter's class-prop spelling -> flattenStyle off the node.
//
// It exists because the compiler and the registry are DIFFERENT packages, compiled separately,
// and they have to agree on one thing: a rule carries the class-token SET its selector was
// written with (each token already scoped in a `.module.css`), and the registry matches a rule
// whose tokens are a subset of the element's. The compiler's own unit tests cannot see that half,
// and neither can the golden snapshot, which pins bytes. Sibling module-runtime.test.ts proves
// the same meeting point at the resolveClassName level; this file proves it through the prop each
// adapter actually sets, plus the class+style merge that only routeProp performs.
//
// Reaches into core/engine by relative path on purpose: neither package depends on the other and
// neither should — same arrangement module-runtime.test.ts and golden-corpus.test.ts use.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearGlobalStyles,
  registerRules,
  type IStyleRule,
} from '../../../engine/src/style-registry/index.ts';
import {
  createElement,
  getExplicitStyle,
  routeProp,
  type ISymbioteNode,
} from '../../../engine/src/node.ts';
import { flattenStyle } from '../../../engine/src/style/index.ts';
import { compileCssFile } from './index.ts';

// Authored values live here rather than inline in the assertions, so the CSS text below and every
// expectation are one source of truth and cannot drift apart.
const CARD_BACKGROUND = '#fff';
const CARD_PADDING_TOP = 8;
const BIG_PADDING_TOP = 16;
// Deliberately not `#ffd700`: the declaration mapper normalises a color to its shortest form and
// would report that one back as the named color `gold`, so the constant would not be what lands.
// `#ffd701` has no shorter form.
const PROMO_BACKGROUND = '#ffd701';
const RESET_MARGIN_TOP = 0;
const LEGACY_OPACITY = 0.5;
const LEGACY_RESET_BORDER_TOP_WIDTH = 1;
const GLOBAL_KEBAB_Z_INDEX = 3;
const INLINE_BACKGROUND = '#00f';

// One authored stylesheet drives both file kinds, so every difference in the results is the
// `.module` extension and nothing else.
//
// `.card` carries TWO properties on purpose: `composes` and the compound rule both restate only
// ONE of them, so the property they do NOT restate is what proves the layering order rather than
// a coincidence of equal values.
const AUTHORED_CSS = `
.card { background-color: ${CARD_BACKGROUND}; padding-top: ${CARD_PADDING_TOP}px; }
.card.big { padding-top: ${BIG_PADDING_TOP}px; }
.legacy-reset { border-top-width: ${LEGACY_RESET_BORDER_TOP_WIDTH}px; }
:global(.reset) { margin-top: ${RESET_MARGIN_TOP}px; }
:global(.global-kebab) { z-index: ${GLOBAL_KEBAB_Z_INDEX}; }
.card :global(.legacy) { opacity: ${LEGACY_OPACITY}; }
.promo { composes: card; background-color: ${PROMO_BACKGROUND}; }
`;

const HOST_COMPONENT = 'RCTView';

const REGISTER_RULES_CALL = /registerRules\((.*)\);/;
const DEFAULT_EXPORT = /export default (.*);/;

function payloadOf(code: string, pattern: RegExp): Record<string, unknown> {
  const match = pattern.exec(code);
  if (match === null || match[1] === undefined) {
    throw new Error(`compileCssFile emitted no ${pattern.source}`);
  }
  const parsed: unknown = JSON.parse(match[1]);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error(`${pattern.source} payload is not an object`);
  }
  return { ...parsed };
}

function installRules(code: string): void {
  registerRules(rulesFrom(code));
}

// The emitted `registerRules([...])` argument, narrowed entry by entry into the engine's own
// IStyleRule — the per-field checks are what turn the parsed JSON's `unknown` values into the
// rules registerRules takes, without a cast. Duplicated from sibling module-runtime.test.ts
// rather than shared: importing a helper out of a test file would run its suite a second time.
function rulesFrom(code: string): IStyleRule[] {
  const match = REGISTER_RULES_CALL.exec(code);
  if (match?.[1] === undefined) {
    throw new Error('compileCssFile emitted no registerRules(...) call');
  }
  const parsed: unknown = JSON.parse(match[1]);
  if (!Array.isArray(parsed)) {
    throw new Error('the registerRules payload is not an array');
  }
  return parsed.map(toRule);
}

function toRule(value: unknown): IStyleRule {
  if (!isRecord(value)) {
    throw new Error('a registerRules entry is not an object');
  }
  const { tokens, specificity, order, style } = value;
  if (!isStringArray(tokens)) throw new Error('a rule carries no token list');
  if (!isSpecificity(specificity)) {
    throw new Error('a rule carries no (a,b,c) specificity');
  }
  if (typeof order !== 'number') throw new Error('a rule carries no order');
  if (typeof style !== 'object' || style === null) {
    throw new Error('a rule carries no style');
  }
  return { tokens, specificity, order, style: { ...style } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isSpecificity(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(item => typeof item === 'number')
  );
}

function classOf(classMap: Record<string, unknown>, name: string): string {
  const value = classMap[name];
  if (typeof value !== 'string') {
    throw new Error(`no exported class \`${name}\``);
  }
  return value;
}

// ---------------------------------------------------------------------------
// The three class-prop spellings, each a faithful transcript of that adapter's renderer.
// ---------------------------------------------------------------------------

// Ivy never sets a whole `class` string: it compiles class=, [class.x] and [ngClass] alike down to
// per-token addClass/removeClass, and adapters/angular/src/renderer/index.ts accumulates them into
// a per-node Set that it re-joins on every change. Mirrored here rather than imported, because
// core/css-parser must not depend on an adapter.
const angularTokens = new WeakMap<ISymbioteNode, Set<string>>();

function angularAddClass(node: ISymbioteNode, name: string): void {
  const tokens = angularTokens.get(node) ?? new Set<string>();
  tokens.add(name);
  angularTokens.set(node, tokens);
  routeProp(node, 'class', [...tokens].join(' '));
}

function angularRemoveClass(node: ISymbioteNode, name: string): void {
  const tokens = angularTokens.get(node);
  if (tokens === undefined) return;
  tokens.delete(name);
  routeProp(node, 'class', tokens.size > 0 ? [...tokens].join(' ') : undefined);
}

interface IAdapterSpelling {
  readonly label: string;
  readonly setClass: (node: ISymbioteNode, className: string) => void;
  readonly setStyle: (
    node: ISymbioteNode,
    style: Record<string, unknown>,
  ) => void;
}

const ADAPTERS: readonly IAdapterSpelling[] = [
  {
    label: 'React className',
    setClass: (node, className) => routeProp(node, 'className', className),
    setStyle: (node, style) => routeProp(node, 'style', style),
  },
  {
    label: 'Solid class',
    setClass: (node, className) => routeProp(node, 'class', className),
    setStyle: (node, style) => routeProp(node, 'style', style),
  },
  {
    label: 'Angular addClass',
    setClass: (node, className) => {
      for (const token of className.split(/\s+/).filter(Boolean)) {
        angularAddClass(node, token);
      }
    },
    // Angular decomposes a [style] binding into per-key ɵɵstyleMap/setStyle calls, each merging
    // onto the explicit half routeProp tracks — never onto node.props.style, which by then is the
    // [classStyle, explicitStyle] pair.
    setStyle: (node, style) => {
      for (const [key, value] of Object.entries(style)) {
        const current = getExplicitStyle(node);
        const base =
          typeof current === 'object' && current !== null ? current : {};
        routeProp(node, 'style', { ...base, [key]: value });
      }
    },
  },
];

function styledNode(
  adapter: IAdapterSpelling,
  className: string,
): ISymbioteNode {
  const node = createElement(HOST_COMPONENT);
  adapter.setClass(node, className);
  return node;
}

function resolvedStyle(node: ISymbioteNode): Record<string, unknown> {
  return flattenStyle(node.props.style);
}

// ---------------------------------------------------------------------------
// The two file kinds.
// ---------------------------------------------------------------------------

interface IFileKind {
  readonly label: string;
  readonly filename: string;
  // A plain .css emits no default export — markup names the authored class directly, which is an
  // identity map. Modeling it as one lets a single table drive both kinds.
  readonly identityClassMap: Record<string, unknown> | null;
  // `.promo` composes `.card`. Only a .module.* file resolves that, so the two kinds differ in
  // exactly one property: the one `.promo` does not restate.
  readonly promoStyle: Record<string, unknown>;
}

const AUTHORED_NAMES = [
  'card',
  'big',
  'legacy-reset',
  'reset',
  'global-kebab',
  'legacy',
  'promo',
];

const PLAIN_KIND: IFileKind = {
  label: 'plain .css',
  filename: 'adapter-conformance.css',
  identityClassMap: Object.fromEntries(
    AUTHORED_NAMES.map(name => [name, name]),
  ),
  promoStyle: { backgroundColor: PROMO_BACKGROUND },
};

const MODULE_KIND: IFileKind = {
  label: '.module.css',
  filename: 'adapter-conformance.module.css',
  identityClassMap: null,
  promoStyle: {
    backgroundColor: PROMO_BACKGROUND,
    paddingTop: CARD_PADDING_TOP,
  },
};

for (const kind of [PLAIN_KIND, MODULE_KIND]) {
  describe(`${kind.label} through each adapter's class prop`, () => {
    let classMap: Record<string, unknown>;

    beforeEach(async () => {
      clearGlobalStyles();
      const { code } = await compileCssFile(AUTHORED_CSS, kind.filename);
      installRules(code);
      classMap = kind.identityClassMap ?? payloadOf(code, DEFAULT_EXPORT);
    });

    for (const adapter of ADAPTERS) {
      describe(adapter.label, () => {
        it('resolves a plain single class', () => {
          const node = styledNode(adapter, classOf(classMap, 'card'));

          expect(resolvedStyle(node)).toEqual({
            backgroundColor: CARD_BACKGROUND,
            paddingTop: CARD_PADDING_TOP,
          });
        });

        it('resolves a compound rule when the element carries both classes', () => {
          // why P0: `.card.big` is the rule shape that stayed dead in a .module.css for months.
          // The rule names both tokens, each carrying the scope, and matches only an element that
          // carries both. The single-class half must survive underneath (backgroundColor), or the
          // compound silently replaced the cascade instead of layering over it.
          const node = styledNode(
            adapter,
            `${classOf(classMap, 'card')} ${classOf(classMap, 'big')}`,
          );

          expect(resolvedStyle(node)).toEqual({
            backgroundColor: CARD_BACKGROUND,
            paddingTop: BIG_PADDING_TOP,
          });
        });

        it('names a compound-only class yet gives it no style of its own', () => {
          // Two halves. REACHABILITY: `big` never appears standalone in the stylesheet, so a
          // compiler that only exported names it saw alone would make the compound unusable from
          // markup — classOf throws if the map has no entry. EMPTINESS: it owns no rule of its
          // own, so it must not leak the compound's declarations onto a single-class element.
          const big = classOf(classMap, 'big');

          expect(resolvedStyle(styledNode(adapter, big))).toEqual({});
        });

        it('resolves a fully :global() class from its authored name', () => {
          const node = styledNode(adapter, classOf(classMap, 'reset'));

          expect(resolvedStyle(node)).toEqual({
            marginTop: RESET_MARGIN_TOP,
          });
        });

        it('resolves a partial :global() only when the scoped half is present too', () => {
          // `.card :global(.legacy)`: the rule belongs to this file (it is gated by the file's
          // own scoped `.card` token), while the `legacy` token must stay unsuffixed so it
          // matches the foreign class it was written for.
          const withBoth = styledNode(
            adapter,
            `${classOf(classMap, 'card')} ${classOf(classMap, 'legacy')}`,
          );
          const legacyAlone = styledNode(adapter, classOf(classMap, 'legacy'));

          expect(resolvedStyle(withBoth)).toEqual({
            backgroundColor: CARD_BACKGROUND,
            paddingTop: CARD_PADDING_TOP,
            opacity: LEGACY_OPACITY,
          });
          expect(resolvedStyle(legacyAlone)).toEqual({});
        });

        it('layers a composing class over what it composes', () => {
          // The registry merges a space-separated class string LEFT TO RIGHT, so the composed
          // name has to come first and the class's own name last. Reversed, backgroundColor would
          // read back as the card's — which is why `.card` carries a second property the composing
          // rule does not restate.
          const node = styledNode(adapter, classOf(classMap, 'promo'));

          expect(resolvedStyle(node)).toEqual(kind.promoStyle);
        });

        it('lets an inline style prop win over the class-derived one, in either order', () => {
          const classFirst = styledNode(adapter, classOf(classMap, 'card'));
          adapter.setStyle(classFirst, { backgroundColor: INLINE_BACKGROUND });

          const styleFirst = createElement(HOST_COMPONENT);
          adapter.setStyle(styleFirst, { backgroundColor: INLINE_BACKGROUND });
          adapter.setClass(styleFirst, classOf(classMap, 'card'));

          const expected = {
            backgroundColor: INLINE_BACKGROUND,
            paddingTop: CARD_PADDING_TOP,
          };
          expect(resolvedStyle(classFirst)).toEqual(expected);
          expect(resolvedStyle(styleFirst)).toEqual(expected);
        });
      });
    }

    describe('Angular incremental addClass / removeClass', () => {
      it('follows the token set as classes are added and removed one at a time', () => {
        const node = createElement(HOST_COMPONENT);
        const card = classOf(classMap, 'card');
        const big = classOf(classMap, 'big');

        angularAddClass(node, card);
        expect(resolvedStyle(node)).toEqual({
          backgroundColor: CARD_BACKGROUND,
          paddingTop: CARD_PADDING_TOP,
        });

        angularAddClass(node, big);
        expect(resolvedStyle(node)).toEqual({
          backgroundColor: CARD_BACKGROUND,
          paddingTop: BIG_PADDING_TOP,
        });

        // Dropping the compound's second token must fall back to the single-class rule, not keep
        // the compound's padding.
        angularRemoveClass(node, big);
        expect(resolvedStyle(node)).toEqual({
          backgroundColor: CARD_BACKGROUND,
          paddingTop: CARD_PADDING_TOP,
        });

        angularRemoveClass(node, card);
        expect(resolvedStyle(node)).toEqual({});
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Kebab-case authoring — no longer a place the two file kinds disagree: both key a class by the
// name the author wrote, and the `.module.*` half differs only in appending the scope.
// ---------------------------------------------------------------------------

describe('kebab-case authored classes', () => {
  beforeEach(() => {
    clearGlobalStyles();
  });

  it('resolves from a plain .css under the authored spelling only', async () => {
    // A class registers AS AUTHORED — `.legacy-reset` is the token `legacy-reset`, full stop.
    // There is no camelCase key and so no camelCase spelling to fall back from: markup that
    // writes `legacyReset` names a class this stylesheet never declared.
    const { code } = await compileCssFile(AUTHORED_CSS, PLAIN_KIND.filename);
    installRules(code);

    for (const adapter of ADAPTERS) {
      expect(resolvedStyle(styledNode(adapter, 'legacy-reset'))).toEqual({
        borderTopWidth: LEGACY_RESET_BORDER_TOP_WIDTH,
      });
      expect(resolvedStyle(styledNode(adapter, 'legacyReset'))).toEqual({});
    }
  });

  it('keys a .module.css export map as authored, local and :global alike', async () => {
    const { code } = await compileCssFile(AUTHORED_CSS, MODULE_KIND.filename);
    installRules(code);
    const classMap = payloadOf(code, DEFAULT_EXPORT);

    // ONE spelling for both halves, and it is the one the author wrote. Nothing normalizes on the
    // way out any more, so a local class and a `:global` one are keyed the same way and
    // `styles['legacy-reset']` is what type-checks (classNamesToDtsSource quotes a non-identifier
    // key for exactly this).
    expect(classMap['legacy-reset']).toBeTypeOf('string');
    expect(classMap['global-kebab']).toBeTypeOf('string');
    expect(classMap['legacyReset']).toBeUndefined();
    expect(classMap['globalKebab']).toBeUndefined();

    for (const adapter of ADAPTERS) {
      expect(
        resolvedStyle(styledNode(adapter, classOf(classMap, 'legacy-reset'))),
      ).toEqual({ borderTopWidth: LEGACY_RESET_BORDER_TOP_WIDTH });
      expect(
        resolvedStyle(styledNode(adapter, classOf(classMap, 'global-kebab'))),
      ).toEqual({ zIndex: GLOBAL_KEBAB_Z_INDEX });
    }
  });
});

// ---------------------------------------------------------------------------

describe('a .module.css class layers over a same-named global class', () => {
  // The real two-file arrangement: an app-wide `App.css` and a component's own `Card.module.css`
  // both declaring `.card`. On the web the element would carry both class names; we express the
  // scope by RENAMING the token instead, so the registry has to re-consult the unscoped base or
  // the global rule silently vanishes the moment a component declares the same name.
  //
  // This is the one cell that depends on the engine reading `__module__<hash>` as a scope tail:
  // the element's scoped token has to contribute its unscoped base to the match set. The compound
  // cells above match on the literal scoped tokens alone.
  const GLOBAL_CARD_CSS = `.card { border-top-width: ${LEGACY_RESET_BORDER_TOP_WIDTH}px; }`;
  const SCOPED_CARD_CSS = `.card { background-color: ${CARD_BACKGROUND}; }`;

  beforeEach(() => {
    clearGlobalStyles();
  });

  for (const adapter of ADAPTERS) {
    it(`keeps the global declarations underneath (${adapter.label})`, async () => {
      const globalCss = await compileCssFile(GLOBAL_CARD_CSS, 'App.css');
      const scopedCss = await compileCssFile(
        SCOPED_CARD_CSS,
        'Card.module.css',
      );
      installRules(globalCss.code);
      installRules(scopedCss.code);
      const classMap = payloadOf(scopedCss.code, DEFAULT_EXPORT);

      const node = styledNode(adapter, classOf(classMap, 'card'));

      expect(resolvedStyle(node)).toEqual({
        borderTopWidth: LEGACY_RESET_BORDER_TOP_WIDTH,
        backgroundColor: CARD_BACKGROUND,
      });
    });
  }
});

// ---------------------------------------------------------------------------

describe('value normalization is the same in both file kinds', () => {
  // Both kinds now go through the SAME declaration mapper, which normalises a color to its
  // shortest form — so `white` lands as `#fff` whether or not the file is a `.module.*`. Pinned
  // because the two kinds diverged here once (only the module half was minified), and a
  // cross-kind assertion written against that divergence would read as correct and be wrong.
  const NAMED_COLOR_CSS = '.tinted { background-color: white; }';
  const NORMALIZED = '#fff';

  beforeEach(() => {
    clearGlobalStyles();
  });

  it('hexes a named color in a plain .css and in a .module.css alike', async () => {
    const plain = await compileCssFile(NAMED_COLOR_CSS, 'tint.css');
    const scoped = await compileCssFile(NAMED_COLOR_CSS, 'tint.module.css');

    expect(rulesFrom(plain.code)).toEqual([
      {
        tokens: ['tinted'],
        specificity: [0, 1, 0],
        order: 0,
        style: { backgroundColor: NORMALIZED },
      },
    ]);
    installRules(scoped.code);
    const classMap = payloadOf(scoped.code, DEFAULT_EXPORT);
    expect(
      resolvedStyle(styledNode(ADAPTERS[0], classOf(classMap, 'tinted'))),
    ).toEqual({ backgroundColor: NORMALIZED });
  });
});
