// Rule-based resolution: the registry matches a rule when its token list is a SUBSET of the
// element's classes, so nothing here depends on the order the classes are written in or on how
// many classes an element carries. The second one is why this file exists at all — the
// key-permutation path this replaced stopped looking past four parts, which was a correctness
// cliff, not a budget.

import { beforeEach, describe, expect, it } from 'vitest';
import { clearGlobalStyles, registerRules, resolveClassName } from './index';

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

describe('style-registry — rules', () => {
  beforeEach(() => {
    clearGlobalStyles();
  });

  describe('subset matching', () => {
    it('matches a single-token rule', () => {
      registerRules([classRule(['card'], { padding: 8 })]);
      expect(resolveClassName('card')).toEqual({ padding: 8 });
    });

    it('matches a two-token rule from either class order', () => {
      registerRules([classRule(['a', 'b'], { color: 'red' })]);
      expect(resolveClassName('a b')).toEqual({ color: 'red' });
      expect(resolveClassName('b a')).toEqual({ color: 'red' });
    });

    // why: the old path reversed a collapsed key, so a compound whose parts are not classes in
    // their own right had to be guessed back apart. Here there is nothing to guess.
    it('matches a compound whose tokens have no standalone rule', () => {
      registerRules([classRule(['btn', 'primary'], { color: 'white' })]);
      expect(resolveClassName('btn primary')).toEqual({ color: 'white' });
    });

    it('does not match a compound when the element carries only one of its tokens', () => {
      registerRules([classRule(['btn', 'primary'], { color: 'white' })]);
      expect(resolveClassName('btn')).toEqual({});
      expect(resolveClassName('primary')).toEqual({});
    });

    it('matches an extra-token element (subset, not equality)', () => {
      registerRules([classRule(['a', 'b'], { color: 'red' })]);
      expect(resolveClassName('a b c')).toEqual({ color: 'red' });
    });

    // why: the exact case the retired part-count cap dropped — five classes skipped the compound
    // branch entirely, so a rule over any two of them silently never fired.
    it('matches inside a five-token element, the case the part-count cap dropped', () => {
      registerRules([
        classRule(['d', 'e'], { color: 'red' }),
        classRule(['a', 'e'], { padding: 4 }),
      ]);
      expect(resolveClassName('a b c d e')).toEqual({
        color: 'red',
        padding: 4,
      });
    });

    it('ignores a rule none of whose tokens the element carries', () => {
      registerRules([classRule(['x', 'y'], { color: 'red' })]);
      expect(resolveClassName('a b')).toEqual({});
    });

    it('clears the rule index too', () => {
      registerRules([classRule(['card'], { padding: 8 })]);
      clearGlobalStyles();
      expect(resolveClassName('card')).toEqual({});
    });
  });

  describe('cascade order', () => {
    it('lets the more specific rule win per property, keeping the rest', () => {
      registerRules([
        classRule(['a', 'b'], { padding: 16 }),
        classRule(['a'], { padding: 8, backgroundColor: 'white' }),
      ]);
      expect(resolveClassName('a b')).toEqual({
        padding: 16,
        backgroundColor: 'white',
      });
    });

    // why: registration order must NOT decide when specificity differs — the array above is
    // already reversed on purpose, this one proves the sort, not the input order.
    it('sorts by specificity regardless of the order the rules were registered in', () => {
      registerRules([
        classRule(['a'], { color: 'blue' }),
        classRule(['a', 'b'], { color: 'red' }),
      ]);
      expect(resolveClassName('a b')).toEqual({ color: 'red' });
    });

    it('compares specificity a before b before c', () => {
      registerRules([
        {
          tokens: ['a'],
          specificity: [1, 0, 0],
          order: 0,
          style: { color: 'id' },
        },
        {
          tokens: ['a', 'b', 'c'],
          specificity: [0, 3, 0],
          order: 1,
          style: { color: 'classes' },
        },
      ]);
      expect(resolveClassName('a b c')).toEqual({ color: 'id' });
    });

    it('breaks an equal-specificity tie by source order within one registration', () => {
      registerRules([
        classRule(['a'], { color: 'second' }, 1),
        classRule(['b'], { color: 'first' }, 0),
      ]);
      expect(resolveClassName('a b')).toEqual({ color: 'second' });
    });

    // why: `order` only counts lines inside one file, so it cannot rank two files against each
    // other — the epoch does, and a later import has to win even with a lower line number.
    it('ranks a later registration over an earlier one of equal specificity', () => {
      registerRules([classRule(['a'], { color: 'early' }, 99)]);
      registerRules([classRule(['a'], { color: 'late' }, 0)]);
      expect(resolveClassName('a')).toEqual({ color: 'late' });
    });
  });

  describe('scoped tokens', () => {
    it('layers a scoped rule over a global rule of the same base name', () => {
      registerRules([
        classRule(['card'], { padding: 8, backgroundColor: 'white' }),
        classRule(['card__svelte-abcd1234'], { padding: 12 }),
      ]);
      expect(resolveClassName('card__svelte-abcd1234')).toEqual({
        padding: 12,
        backgroundColor: 'white',
      });
    });

    it('does the same for a Vue data-v- scope and a CSS-Modules scope', () => {
      registerRules([
        classRule(['card'], { padding: 8 }),
        classRule(['card__data-v-9z8y7x'], { margin: 2 }),
        classRule(['card__module__1a2b3c'], { margin: 3 }),
      ]);
      expect(resolveClassName('card__data-v-9z8y7x')).toEqual({
        padding: 8,
        margin: 2,
      });
      expect(resolveClassName('card__module__1a2b3c')).toEqual({
        padding: 8,
        margin: 3,
      });
    });

    // why: a BEM class splits at `__` exactly like a scoped token; only the tail SHAPE tells
    // them apart, and reading `card__title` as a scoped `card` would merge the block's styles in.
    it('never reads a BEM class as a scoped one', () => {
      registerRules([
        classRule(['card'], { padding: 8 }),
        classRule(['card__title'], { color: 'red' }),
      ]);
      expect(resolveClassName('card__title')).toEqual({ color: 'red' });
    });

    it('matches a scoped compound from the separately-suffixed tokens the markup carries', () => {
      registerRules([
        classRule(['card__svelte-abcd1234', 'big__svelte-abcd1234'], {
          padding: 16,
        }),
      ]);
      expect(
        resolveClassName('card__svelte-abcd1234 big__svelte-abcd1234'),
      ).toEqual({ padding: 16 });
    });
  });

  // The memo makes a repeated class string one Map.get. It is only correct while every
  // registration drops it — a stale entry would pin a pre-import cascade for the app's lifetime.
  describe('memo', () => {
    it('hands back the same object for a repeated class string', () => {
      registerRules([classRule(['a', 'b'], { color: 'red' })]);
      expect(resolveClassName('a b')).toBe(resolveClassName('a b'));
    });

    it('re-resolves after registerRules', () => {
      registerRules([classRule(['a'], { color: 'red' })]);
      expect(resolveClassName('a')).toEqual({ color: 'red' });
      registerRules([classRule(['a'], { color: 'blue' })]);
      expect(resolveClassName('a')).toEqual({ color: 'blue' });
    });

    // why: a miss is memoized too, so a rule registered afterwards has to drop that entry or the
    // class stays permanently unstyled.
    it('re-resolves a memoized miss once a rule for it lands', () => {
      expect(resolveClassName('a')).toEqual({});
      registerRules([classRule(['a'], { color: 'red' })]);
      expect(resolveClassName('a')).toEqual({ color: 'red' });
    });

    it('re-resolves after clearGlobalStyles', () => {
      registerRules([classRule(['a'], { color: 'red' })]);
      expect(resolveClassName('a')).toEqual({ color: 'red' });
      clearGlobalStyles();
      expect(resolveClassName('a')).toEqual({});
    });

    // why: the bound is drop-all, so the entry that overflowed it must still resolve — a stale
    // read here would be a wrong style on screen, not just a slow one.
    it('keeps resolving correctly past its size bound', () => {
      registerRules([classRule(['hit'], { color: 'red' })]);
      for (let index = 0; index < 600; index++) {
        expect(resolveClassName(`unique-${index}`)).toEqual({});
      }
      expect(resolveClassName('hit')).toEqual({ color: 'red' });
    });
  });
});
