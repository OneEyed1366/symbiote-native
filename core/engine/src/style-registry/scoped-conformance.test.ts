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
import { clearGlobalStyles, registerStyles, resolveClassName } from './index';

const VUE_SCOPE = 'data-v-f3f3eg9';
const SVELTE_SCOPE = 'svelte-123xyz';

// What a `<style scoped>` block compiles to in this project: the collapsed class key, suffixed
// once. `.card.big` inside the block registers as `cardBig__<scope>`, and the markup it rewrites
// says `class="card__<scope> big__<scope>"` — every token suffixed. Building both here keeps the
// two halves visibly paired in each test.
function scopedKey(name: string, scope: string): string {
  return `${name}__${scope}`;
}

function scopedClass(tokens: string[], scope: string): string {
  return tokens.map(token => scopedKey(token, scope)).join(' ');
}

beforeEach(() => {
  clearGlobalStyles();
});

describe('compound selectors — the rule is the same scoped and unscoped', () => {
  it('applies a compound rule to an element carrying every one of its tokens', () => {
    registerStyles({ cardBig: { padding: 16 } });
    expect(resolveClassName('card big')).toEqual({ padding: 16 });
  });

  it('applies the same rule when the block is scoped', () => {
    registerStyles({ [scopedKey('cardBig', SVELTE_SCOPE)]: { padding: 16 } });
    expect(resolveClassName(scopedClass(['card', 'big'], SVELTE_SCOPE))).toEqual({ padding: 16 });
  });

  it('does NOT apply a compound rule to an element carrying only one of its tokens', () => {
    // `.card.big[data-v-…]` cannot match `<View class="card">`. The single-token element must
    // come back with nothing, not with the compound rule's declarations.
    registerStyles({ [scopedKey('cardBig', VUE_SCOPE)]: { padding: 16 } });
    expect(resolveClassName(scopedClass(['card'], VUE_SCOPE))).toEqual({});
  });

  it('ignores the order the tokens are written in', () => {
    // CSS matches a compound selector against the element's class SET; `class="big card"` and
    // `class="card big"` are the same element as far as `.card.big` is concerned.
    registerStyles({ [scopedKey('cardBig', SVELTE_SCOPE)]: { padding: 16 } });
    expect(resolveClassName(scopedClass(['big', 'card'], SVELTE_SCOPE))).toEqual({ padding: 16 });
  });

  it('matches a compound rule on an element carrying MORE classes than the rule names', () => {
    // `.card.big` matches `<View class="card big extra">` too — a selector constrains, it does
    // not enumerate.
    registerStyles({ [scopedKey('cardBig', SVELTE_SCOPE)]: { padding: 16 } });
    expect(resolveClassName(scopedClass(['card', 'big', 'extra'], SVELTE_SCOPE))).toEqual({
      padding: 16,
    });
  });

  it('applies a three-token compound rule', () => {
    registerStyles({ [scopedKey('cardBigLoud', SVELTE_SCOPE)]: { padding: 24 } });
    expect(resolveClassName(scopedClass(['card', 'big', 'loud'], SVELTE_SCOPE))).toEqual({
      padding: 24,
    });
  });
});

describe('cascade — a compound rule layers over the single-class rules', () => {
  it('keeps the declarations the compound rule does not restate', () => {
    // `.card` is 0-1-0, `.card.big` is 0-2-0: the compound wins `padding` and says nothing about
    // `backgroundColor`, which therefore survives. Returning the compound alone would blank it.
    registerStyles({
      [scopedKey('card', SVELTE_SCOPE)]: { padding: 8, backgroundColor: 'white' },
      [scopedKey('cardBig', SVELTE_SCOPE)]: { padding: 16 },
    });
    expect(resolveClassName(scopedClass(['card', 'big'], SVELTE_SCOPE))).toEqual({
      padding: 16,
      backgroundColor: 'white',
    });
  });

  it('lets the compound rule win the property both rules set', () => {
    registerStyles({
      [scopedKey('card', SVELTE_SCOPE)]: { padding: 8 },
      [scopedKey('cardBig', SVELTE_SCOPE)]: { padding: 16 },
    });
    expect(resolveClassName(scopedClass(['card', 'big'], SVELTE_SCOPE))).toEqual({ padding: 16 });
  });

  it('merges the single-class rules with each other when no compound rule exists', () => {
    registerStyles({
      [scopedKey('card', SVELTE_SCOPE)]: { padding: 8, backgroundColor: 'white' },
      [scopedKey('big', SVELTE_SCOPE)]: { padding: 16 },
    });
    expect(resolveClassName(scopedClass(['card', 'big'], SVELTE_SCOPE))).toEqual({
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
    registerStyles({
      card: { padding: 8, backgroundColor: 'white' },
      [scopedKey('card', VUE_SCOPE)]: { padding: 12 },
    });
    expect(resolveClassName(scopedClass(['card'], VUE_SCOPE))).toEqual({
      padding: 12,
      backgroundColor: 'white',
    });
  });

  it('lets the scoped rule win the conflicting property (+0-1-0 over the global one)', () => {
    registerStyles({
      card: { color: 'red' },
      [scopedKey('card', SVELTE_SCOPE)]: { color: 'blue' },
    });
    expect(resolveClassName(scopedClass(['card'], SVELTE_SCOPE))).toEqual({ color: 'blue' });
  });

  it('applies a global rule to a token the component does not define at all', () => {
    // A class the block never mentions is left un-suffixed by both compilers, so it resolves
    // against the global registry exactly as it would outside any component.
    registerStyles({
      highlight: { color: 'red' },
      [scopedKey('card', SVELTE_SCOPE)]: { padding: 8 },
    });
    expect(resolveClassName(`${scopedKey('card', SVELTE_SCOPE)} highlight`)).toEqual({
      padding: 8,
      color: 'red',
    });
  });
});

describe('scoping actually scopes', () => {
  it('keeps two components own .card rules apart', () => {
    const other = 'svelte-99999999';
    registerStyles({
      [scopedKey('card', SVELTE_SCOPE)]: { padding: 8 },
      [scopedKey('card', other)]: { padding: 3 },
    });
    expect(resolveClassName(scopedClass(['card'], SVELTE_SCOPE))).toEqual({ padding: 8 });
    expect(resolveClassName(scopedClass(['card'], other))).toEqual({ padding: 3 });
  });

  it('keeps two components own .card.big rules apart', () => {
    const other = 'svelte-99999999';
    registerStyles({
      [scopedKey('cardBig', SVELTE_SCOPE)]: { padding: 16 },
      [scopedKey('cardBig', other)]: { padding: 4 },
    });
    expect(resolveClassName(scopedClass(['card', 'big'], SVELTE_SCOPE))).toEqual({ padding: 16 });
    expect(resolveClassName(scopedClass(['card', 'big'], other))).toEqual({ padding: 4 });
  });

  it('does not build a compound key across two different scopes', () => {
    // Tokens from two components can only end up on one element by hand-authoring; there is no
    // rule that legitimately spans both, so nothing must be invented for it.
    registerStyles({ [scopedKey('cardBig', SVELTE_SCOPE)]: { padding: 16 } });
    expect(
      resolveClassName(`${scopedKey('card', SVELTE_SCOPE)} ${scopedKey('big', 'svelte-99999999')}`),
    ).toEqual({});
  });

  it('never reads a BEM class as a scoped one', () => {
    // `card__title` splits at `__` exactly like a scoped token; only the suffix SHAPE separates
    // them. Merging `.card` into `.card__title` would be a silent, wrong cascade across a naming
    // convention half the CSS world uses.
    registerStyles({ card: { padding: 8 }, card__title: { color: 'red' } });
    expect(resolveClassName('card__title')).toEqual({ color: 'red' });
  });
});

// Deliberate divergences from the web, asserted so they stay deliberate. Each is a consequence
// of the registry being a flat name->style Map with no tree to match against.
describe('documented divergences from web CSS', () => {
  it('flattens a descendant selector into a compound one — both tokens on ONE element', () => {
    // `.card .title` registers as `cardTitle`, the same key `.card.title` would produce. On the
    // web it matches a `.title` INSIDE a `.card`; here it matches an element carrying both.
    // There is no tree at resolve time, so real descendant matching is not expressible.
    registerStyles({ [scopedKey('cardTitle', SVELTE_SCOPE)]: { color: 'red' } });
    expect(resolveClassName(scopedClass(['card', 'title'], SVELTE_SCOPE))).toEqual({
      color: 'red',
    });
    expect(resolveClassName(scopedClass(['title'], SVELTE_SCOPE))).toEqual({});
  });

  it('gives up on a compound rule beyond four tokens', () => {
    // Permutation count grows factorially, so the lookup is capped. Past the cap only the
    // single-class rules apply — a silent miss, hence the explicit test.
    registerStyles({ aB: { padding: 1 } });
    expect(resolveClassName('a b c d e')).toEqual({});
  });

});

// The registry half of `:global()`. The compiler half - erasing the wrapper, exempting its
// payload from the scope suffix - lives in @symbiote-native/css-parser; what arrives here is the
// result: a key suffixed as a whole, against markup where only the component's own tokens are.
describe('a partial :global() reaches the markup it was written for', () => {
  it('resolves a scoped selector whose :global() half is unsuffixed in the markup', () => {
    // `.card :global(.reset) { padding: 16 }` in a scoped block. The rule as a whole belongs to
    // the file (`.card` is its own), so its collapsed key is suffixed; `reset` names markup the
    // file does not own, so the token is not. Both halves have to meet at lookup time.
    //
    // The divergence this buys, deliberately: a fully-scoped `.card.reset` collapses to the very
    // same key, so a `reset` handed down from a parent matches it too. The key format cannot tell
    // the author's own token from a foreign one - that needs a registry indexed by token set,
    // with per-token scope.
    registerStyles({ [scopedKey('cardReset', SVELTE_SCOPE)]: { padding: 16 } });
    expect(resolveClassName(`${scopedKey('card', SVELTE_SCOPE)} reset`)).toEqual({ padding: 16 });
  });

  it('applies the global token’s own rule underneath the scoped compound', () => {
    // `reset` still resolves against the global registry on its own - the compound layers over
    // it rather than replacing it, exactly as an all-scoped compound does.
    registerStyles({
      reset: { margin: 0, padding: 4 },
      [scopedKey('cardReset', SVELTE_SCOPE)]: { padding: 16 },
    });
    expect(resolveClassName(`${scopedKey('card', SVELTE_SCOPE)} reset`)).toEqual({
      margin: 0,
      padding: 16,
    });
  });

  it('still refuses to bridge two different scopes', () => {
    // The unscoped token is what has no scope to disagree with. Two tokens that each carry a
    // DIFFERENT suffix have no single one to factor out, and no rule legitimately spans two
    // components - that stays unmatched.
    registerStyles({ [scopedKey('cardReset', SVELTE_SCOPE)]: { padding: 16 } });
    expect(
      resolveClassName(
        `${scopedKey('card', SVELTE_SCOPE)} ${scopedKey('reset', 'svelte-99999999')}`,
      ),
    ).toEqual({});
  });
});
