// The LAW the class registry has to obey, written from the Vue and Svelte scoped-CSS specs
// rather than from this implementation — so a test failing here means we diverged from the
// frameworks, not that an internal detail moved. The sibling style-registry.test.ts covers the
// registry's own API surface; this file covers what a component author is entitled to expect.
//
// No Negative group: resolveClassName has no throwing path, scoped or not — every scenario
// below is Positive (a rule applies) or a documented divergence (a rule deliberately does not
// apply, and returns `{}` rather than erroring).
//
// Sources (read 2026-08-14):
//   Vue, https://vuejs.org/api/sfc-css-features.html — `.example { }` + `<div class="example">`
//     compiles to `.example[data-v-f3f3eg9] { }` + `<div class="example" data-v-f3f3eg9>`. The
//     element KEEPS its original class and GAINS an attribute; the selector gains the attribute
//     too. A compound `.card.big` becomes `.card.big[data-v-…]`, matching only an element that
//     carries both classes.
//   Svelte, https://svelte.dev/docs/svelte/scoped-styles — "This works by adding a class to
//     affected elements" (`class="card svelte-123xyz"`), and "Each scoped selector receives a
//     specificity increase of 0-1-0, as a result of the scoping class being added to the
//     selector. This means that a `p` selector defined in a component will take precedence over
//     a `p` selector defined in a global stylesheet, even if the global stylesheet is loaded
//     later."
//
// Two consequences drive most of what is asserted below, and neither is obvious from our own
// representation — SymbioteNative has no DOM and no attribute matching, so a scope is expressed by
// RENAMING the token (`card` -> `card__svelte-h`) rather than by adding a second class or an
// attribute. The rename must not lose what the second-class model kept:
//   1. a global rule of the same class name STILL applies to a scoped element (both frameworks
//      leave the original class on the element), with the scoped rule winning on a conflict
//      (+0-1-0);
//   2. a compound rule applies when the element carries ALL of its tokens — and layers over the
//      single-class rules per the cascade rather than replacing them (0-2-0 beats 0-1-0 on the
//      properties it restates, and says nothing about the rest).
//
// The scope ids used here are literal rather than computed: the point is the SHAPE the two
// compilers emit (`data-v-<base36>` / `svelte-<base36>`), which is what the registry keys off.

import { beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules, resolveClassName } from './index';

const VUE_SCOPE = 'data-v-f3f3eg9';
const SVELTE_SCOPE = 'svelte-123xyz';
// CSS Modules — a standalone `.module.css` file AND Vue's `<style module>`, which emit the same
// `<class>__module__<hash>` shape. The scope carries its own `__`, which is exactly what the
// registry's scoped-base split has to keep handling; `scopedKey` below composes it unchanged.
const MODULE_SCOPE = 'module__1a2b3c4d';

// A scoped block renames EVERY token it defines, in the stylesheet and in the markup alike:
// `.card.big` inside the block registers the token pair `card__<scope>` / `big__<scope>`, and the
// markup it rewrites says `class="card__<scope> big__<scope>"`. Building both sides from the same
// helper keeps the pairing visible in each test.
function scopedKey(name: string, scope: string): string {
  return `${name}__${scope}`;
}

function scopedClass(tokens: string[], scope: string): string {
  return tokens.map(token => scopedKey(token, scope)).join(' ');
}

// (a,b,c) as CSS counts it: a=id, b=class/attribute/pseudo-class, c=type. Every rule here is
// class-only, so b is the token count and a/c stay 0.
function classRule(
  tokens: string[],
  style: Record<string, string | number>,
  order = 0,
): {
  tokens: string[];
  specificity: [number, number, number];
  order: number;
  style: Record<string, string | number>;
} {
  return { tokens, specificity: [0, tokens.length, 0], order, style };
}

beforeEach(() => {
  clearGlobalStyles();
});

describe('compound selectors — the rule is the same scoped and unscoped', () => {
  it('applies a compound rule to an element carrying every one of its tokens', () => {
    registerRules([classRule(['card', 'big'], { padding: 16 })]);
    expect(resolveClassName('card big')).toEqual({ padding: 16 });
  });

  it('applies the same rule when the block is scoped', () => {
    registerRules([
      classRule(
        [scopedKey('card', SVELTE_SCOPE), scopedKey('big', SVELTE_SCOPE)],
        { padding: 16 },
      ),
    ]);
    expect(
      resolveClassName(scopedClass(['card', 'big'], SVELTE_SCOPE)),
    ).toEqual({ padding: 16 });
  });

  it('does NOT apply a compound rule to an element carrying only one of its tokens', () => {
    // `.card.big[data-v-…]` cannot match `<View class="card">`. The single-token element must
    // come back with nothing, not with the compound rule's declarations.
    registerRules([
      classRule([scopedKey('card', VUE_SCOPE), scopedKey('big', VUE_SCOPE)], {
        padding: 16,
      }),
    ]);
    expect(resolveClassName(scopedClass(['card'], VUE_SCOPE))).toEqual({});
  });

  it('ignores the order the tokens are written in', () => {
    // CSS matches a compound selector against the element's class SET; `class="big card"` and
    // `class="card big"` are the same element as far as `.card.big` is concerned.
    registerRules([
      classRule(
        [scopedKey('card', SVELTE_SCOPE), scopedKey('big', SVELTE_SCOPE)],
        { padding: 16 },
      ),
    ]);
    expect(
      resolveClassName(scopedClass(['big', 'card'], SVELTE_SCOPE)),
    ).toEqual({ padding: 16 });
  });

  it('matches a compound rule on an element carrying MORE classes than the rule names', () => {
    // `.card.big` matches `<View class="card big extra">` too — a selector constrains, it does
    // not enumerate.
    registerRules([
      classRule(
        [scopedKey('card', SVELTE_SCOPE), scopedKey('big', SVELTE_SCOPE)],
        { padding: 16 },
      ),
    ]);
    expect(
      resolveClassName(scopedClass(['card', 'big', 'extra'], SVELTE_SCOPE)),
    ).toEqual({
      padding: 16,
    });
  });

  // why: nothing caps the element's token count. The key-permutation lookup this replaced stopped
  // at four parts, so a five-class element skipped every compound rule it should have matched —
  // silently, since a miss and "no such rule" look identical from the outside.
  it('matches a compound rule on a five-class element', () => {
    registerRules([
      classRule(
        [scopedKey('card', SVELTE_SCOPE), scopedKey('big', SVELTE_SCOPE)],
        { padding: 16 },
      ),
    ]);
    expect(
      resolveClassName(
        scopedClass(['one', 'card', 'two', 'big', 'three'], SVELTE_SCOPE),
      ),
    ).toEqual({ padding: 16 });
  });

  it('applies a three-token compound rule', () => {
    registerRules([
      classRule(
        [
          scopedKey('card', SVELTE_SCOPE),
          scopedKey('big', SVELTE_SCOPE),
          scopedKey('loud', SVELTE_SCOPE),
        ],
        { padding: 24 },
      ),
    ]);
    expect(
      resolveClassName(scopedClass(['card', 'big', 'loud'], SVELTE_SCOPE)),
    ).toEqual({
      padding: 24,
    });
  });
});

describe('cascade — a compound rule layers over the single-class rules', () => {
  it('keeps the declarations the compound rule does not restate', () => {
    // `.card` is 0-1-0, `.card.big` is 0-2-0: the compound wins `padding` and says nothing about
    // `backgroundColor`, which therefore survives. Returning the compound alone would blank it.
    registerRules([
      classRule(
        [scopedKey('card', SVELTE_SCOPE)],
        { padding: 8, backgroundColor: 'white' },
        0,
      ),
      classRule(
        [scopedKey('card', SVELTE_SCOPE), scopedKey('big', SVELTE_SCOPE)],
        { padding: 16 },
        1,
      ),
    ]);
    expect(
      resolveClassName(scopedClass(['card', 'big'], SVELTE_SCOPE)),
    ).toEqual({
      padding: 16,
      backgroundColor: 'white',
    });
  });

  it('lets the compound rule win the property both rules set', () => {
    registerRules([
      classRule([scopedKey('card', SVELTE_SCOPE)], { padding: 8 }, 0),
      classRule(
        [scopedKey('card', SVELTE_SCOPE), scopedKey('big', SVELTE_SCOPE)],
        { padding: 16 },
        1,
      ),
    ]);
    expect(
      resolveClassName(scopedClass(['card', 'big'], SVELTE_SCOPE)),
    ).toEqual({ padding: 16 });
  });

  it('merges the single-class rules with each other when no compound rule exists', () => {
    registerRules([
      classRule(
        [scopedKey('card', SVELTE_SCOPE)],
        { padding: 8, backgroundColor: 'white' },
        0,
      ),
      classRule([scopedKey('big', SVELTE_SCOPE)], { padding: 16 }, 1),
    ]);
    expect(
      resolveClassName(scopedClass(['card', 'big'], SVELTE_SCOPE)),
    ).toEqual({
      padding: 16,
      backgroundColor: 'white',
    });
  });
});

describe('a scoped element is still reached by the global stylesheet', () => {
  it('applies a global rule of the same class name underneath the scoped one', () => {
    // Vue leaves `class="card"` on the element and adds `[data-v-…]`; Svelte adds a second class
    // next to `card`. Either way App.css's `.card` still matches. Our rename has to reproduce
    // that explicitly or the global rule silently vanishes the moment a component defines a
    // class of the same name.
    registerRules([
      classRule(['card'], { padding: 8, backgroundColor: 'white' }, 0),
      classRule([scopedKey('card', VUE_SCOPE)], { padding: 12 }, 1),
    ]);
    expect(resolveClassName(scopedClass(['card'], VUE_SCOPE))).toEqual({
      padding: 12,
      backgroundColor: 'white',
    });
  });

  it('lets the scoped rule win the conflicting property (+0-1-0 over the global one)', () => {
    registerRules([
      classRule(['card'], { color: 'red' }, 0),
      classRule([scopedKey('card', SVELTE_SCOPE)], { color: 'blue' }, 1),
    ]);
    expect(resolveClassName(scopedClass(['card'], SVELTE_SCOPE))).toEqual({
      color: 'blue',
    });
  });

  // why: the scoped rule has to win even when the global one is registered LAST — the rename ate
  // the +0-1-0 the scoping class carries on the web, so both rules arrive at the same declared
  // specificity and the tie is broken by which tokens the element only matched through its base.
  it('lets the scoped rule win even when the global stylesheet loads later', () => {
    registerRules([
      classRule([scopedKey('card', SVELTE_SCOPE)], { color: 'blue' }),
    ]);
    registerRules([classRule(['card'], { color: 'red' })]);
    expect(resolveClassName(scopedClass(['card'], SVELTE_SCOPE))).toEqual({
      color: 'blue',
    });
  });

  it('applies a global rule to a token the component does not define at all', () => {
    // A class the block never mentions is left un-suffixed by both compilers, so it resolves
    // against the global registry exactly as it would outside any component.
    registerRules([
      classRule(['highlight'], { color: 'red' }, 0),
      classRule([scopedKey('card', SVELTE_SCOPE)], { padding: 8 }, 1),
    ]);
    expect(
      resolveClassName(`${scopedKey('card', SVELTE_SCOPE)} highlight`),
    ).toEqual({
      padding: 8,
      color: 'red',
    });
  });
});

describe('scoping actually scopes', () => {
  it('keeps two components own .card rules apart', () => {
    const other = 'svelte-99999999';
    registerRules([
      classRule([scopedKey('card', SVELTE_SCOPE)], { padding: 8 }, 0),
      classRule([scopedKey('card', other)], { padding: 3 }, 1),
    ]);
    expect(resolveClassName(scopedClass(['card'], SVELTE_SCOPE))).toEqual({
      padding: 8,
    });
    expect(resolveClassName(scopedClass(['card'], other))).toEqual({
      padding: 3,
    });
  });

  it('keeps two components own .card.big rules apart', () => {
    const other = 'svelte-99999999';
    registerRules([
      classRule(
        [scopedKey('card', SVELTE_SCOPE), scopedKey('big', SVELTE_SCOPE)],
        { padding: 16 },
        0,
      ),
      classRule(
        [scopedKey('card', other), scopedKey('big', other)],
        { padding: 4 },
        1,
      ),
    ]);
    expect(
      resolveClassName(scopedClass(['card', 'big'], SVELTE_SCOPE)),
    ).toEqual({ padding: 16 });
    expect(resolveClassName(scopedClass(['card', 'big'], other))).toEqual({
      padding: 4,
    });
  });

  it('does not match a compound rule across two different scopes', () => {
    // Tokens from two components can only end up on one element by hand-authoring; there is no
    // rule that legitimately spans both, so nothing must be invented for it.
    registerRules([
      classRule(
        [scopedKey('card', SVELTE_SCOPE), scopedKey('big', SVELTE_SCOPE)],
        { padding: 16 },
      ),
    ]);
    expect(
      resolveClassName(
        `${scopedKey('card', SVELTE_SCOPE)} ${scopedKey('big', 'svelte-99999999')}`,
      ),
    ).toEqual({});
  });

  it('never reads a BEM class as a scoped one', () => {
    // `card__title` splits at `__` exactly like a scoped token; only the suffix SHAPE separates
    // them. Merging `.card` into `.card__title` would be a silent, wrong cascade across a naming
    // convention half the CSS world uses.
    registerRules([
      classRule(['card'], { padding: 8 }, 0),
      classRule(['card__title'], { color: 'red' }, 1),
    ]);
    expect(resolveClassName('card__title')).toEqual({ color: 'red' });
  });
});

// Deliberate divergences from the web, asserted so they stay deliberate. Each is a consequence of
// the registry matching one element's class SET, with no tree to match against.
describe('documented divergences from web CSS', () => {
  it('flattens a descendant selector into a compound one — both tokens on ONE element', () => {
    // `.card .title` compiles to the same token pair `.card.title` would. On the web it matches a
    // `.title` INSIDE a `.card`; here it matches an element carrying both. There is no tree at
    // resolve time, so real descendant matching is not expressible.
    registerRules([
      classRule(
        [scopedKey('card', SVELTE_SCOPE), scopedKey('title', SVELTE_SCOPE)],
        { color: 'red' },
      ),
    ]);
    expect(
      resolveClassName(scopedClass(['card', 'title'], SVELTE_SCOPE)),
    ).toEqual({
      color: 'red',
    });
    expect(resolveClassName(scopedClass(['title'], SVELTE_SCOPE))).toEqual({});
  });
});

// The registry half of `:global()`. The compiler half - erasing the wrapper, exempting its
// payload from the rename - lives in @symbiote-native/css-parser; what arrives here is the result:
// a rule whose own tokens carry the scope and whose `:global()` token does not.
describe('a partial :global() reaches the markup it was written for', () => {
  it('resolves a scoped selector whose :global() half is unsuffixed in the markup', () => {
    // `.card :global(.reset) { padding: 16 }` in a scoped block. `.card` is the file's own, so it
    // is renamed; `reset` names markup the file does not own, so it is left alone. Both halves
    // have to meet at lookup time.
    registerRules([
      classRule([scopedKey('card', SVELTE_SCOPE), 'reset'], { padding: 16 }),
    ]);
    expect(
      resolveClassName(`${scopedKey('card', SVELTE_SCOPE)} reset`),
    ).toEqual({ padding: 16 });
  });

  it('applies the global token’s own rule underneath the scoped compound', () => {
    // `reset` still resolves against the global registry on its own - the compound layers over
    // it rather than replacing it, exactly as an all-scoped compound does.
    registerRules([
      classRule(['reset'], { margin: 0, padding: 4 }, 0),
      classRule([scopedKey('card', SVELTE_SCOPE), 'reset'], { padding: 16 }, 1),
    ]);
    expect(
      resolveClassName(`${scopedKey('card', SVELTE_SCOPE)} reset`),
    ).toEqual({
      margin: 0,
      padding: 16,
    });
  });

  // why: `:global(.reset)` names the UNSCOPED class `reset`, and a foreign component's
  // `reset__<other>` still carries `reset` underneath its rename — on the web that element is
  // literally `class="reset svelte-other"`, which `.reset` matches. So this DOES apply, and the
  // guard that keeps scopes apart is the OTHER half of the rule: `card__<scope>` is asked for
  // literally and no foreign token can supply it.
  it('reaches a :global() token another component also scoped', () => {
    registerRules([
      classRule([scopedKey('card', SVELTE_SCOPE), 'reset'], { padding: 16 }),
    ]);
    expect(
      resolveClassName(
        `${scopedKey('card', SVELTE_SCOPE)} ${scopedKey('reset', 'svelte-99999999')}`,
      ),
    ).toEqual({ padding: 16 });
    expect(
      resolveClassName(
        `${scopedKey('card', 'svelte-99999999')} ${scopedKey('reset', 'svelte-99999999')}`,
      ),
    ).toEqual({});
  });
});

// Compound resolution must not depend on WHICH scoping mechanism produced the names. Measured
// 2026-08-19: it did — every compound rule authored in a `.module.css` (or a Vue `<style module>`)
// was silently dead, because the scope split ran on the LAST `__` and the module form carries its
// own. Vue `<style scoped>` and Svelte `<style>` were unaffected and passed the rest of this file,
// which is why it went unseen. Parameterized so a fourth mechanism cannot be added with coverage
// for only three.
describe('compound rules resolve under EVERY scoping mechanism', () => {
  const MECHANISMS: ReadonlyArray<readonly [string, string]> = [
    ['Vue <style scoped>', VUE_SCOPE],
    ['Svelte <style>', SVELTE_SCOPE],
    ['CSS Modules / Vue <style module>', MODULE_SCOPE],
  ];

  it.each(MECHANISMS)('applies a compound rule under %s', (_label, scope) => {
    registerRules([
      classRule([scopedKey('badge', scope), scopedKey('loud', scope)], {
        padding: 9,
      }),
    ]);
    expect(resolveClassName(scopedClass(['badge', 'loud'], scope))).toEqual({
      padding: 9,
    });
  });

  it.each(MECHANISMS)(
    'layers a compound over its single-class rule under %s',
    (_label, scope) => {
      registerRules([
        classRule(
          [scopedKey('badge', scope)],
          { borderColor: 'grey', margin: 2 },
          0,
        ),
        classRule(
          [scopedKey('badge', scope), scopedKey('loud', scope)],
          { borderColor: 'red' },
          1,
        ),
      ]);
      expect(resolveClassName(scopedClass(['badge', 'loud'], scope))).toEqual({
        borderColor: 'red',
        margin: 2,
      });
    },
  );

  it.each(MECHANISMS)(
    'leaves a single-token element unmatched under %s',
    (_label, scope) => {
      registerRules([
        classRule([scopedKey('badge', scope), scopedKey('loud', scope)], {
          padding: 9,
        }),
      ]);
      expect(resolveClassName(scopedKey('badge', scope))).toEqual({});
    },
  );
});

// The guard the shape test exists for, kept beside the widening that could most easily break it:
// a BEM class is a plain name that happens to contain `__`, and reading it as a scoped token
// would merge the block's rule into the element's.
describe('a BEM class is never mistaken for a scoped token', () => {
  it('does not fall back to the block rule for `card__title`', () => {
    registerRules([classRule(['card'], { margin: 1 })]);
    expect(resolveClassName('card__title')).toEqual({});
  });

  it('does not read a bare hash tail as a scope', () => {
    // `module__<hash>` is matched by the literal `module` marker, never by "the tail looks like a
    // hash" - which would swallow every BEM name whose element is alphanumeric.
    registerRules([classRule(['card'], { margin: 1 })]);
    expect(resolveClassName('card__1a2b3c4d')).toEqual({});
  });
});
