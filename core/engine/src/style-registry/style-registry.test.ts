// Unit test for the style registry. Each test registers its own
// styles and clearGlobalStyles() in beforeEach isolates them from one another.
//
// resolveClassName has no throwing path — every input, including a malformed one, resolves to
// a style object or `{}`. There is no Negative group here for that reason; the second group
// below is named "returns empty" (the unit's real contract) instead.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  isClassNameValue,
  registerRules,
  resolveClassName,
  clearGlobalStyles,
} from './index';

describe('style-registry', () => {
  beforeEach(() => {
    clearGlobalStyles();
  });

  describe('resolves a match', () => {
    it('resolves an exact registered class name', () => {
      registerRules([
        {
          tokens: ['foo'],
          specificity: [0, 1, 0],
          order: 0,
          style: { color: 'red' },
        },
      ]);
      expect(resolveClassName('foo')).toEqual({ color: 'red' });
    });

    it('merges an array of registered class names, later wins on collision', () => {
      registerRules([
        {
          tokens: ['a'],
          specificity: [0, 1, 0],
          order: 0,
          style: { color: 'red', padding: 1 },
        },
        {
          tokens: ['b'],
          specificity: [0, 1, 0],
          order: 1,
          style: { color: 'blue' },
        },
      ]);
      expect(resolveClassName(['a', 'b'])).toEqual({
        color: 'blue',
        padding: 1,
      });
    });

    // why: an adapter's class/className prop can arrive as a mixed array (`class="foo"` plus an
    // inline style object literal, e.g. Vue's `:class="[cls, { color: 'x' }]"`) — a registered
    // name and a raw style object must merge exactly like two registered names do.
    it('merges a registered class name with a raw style object in the same array', () => {
      registerRules([
        {
          tokens: ['foo'],
          specificity: [0, 1, 0],
          order: 0,
          style: { color: 'red' },
        },
      ]);
      expect(resolveClassName(['foo', { padding: 4 }])).toEqual({
        color: 'red',
        padding: 4,
      });
    });

    it('passes an object through unchanged', () => {
      expect(resolveClassName({ color: 'red' })).toEqual({ color: 'red' });
    });

    // why: a rule's tokens are a SET, so the class string may carry them in any order and may
    // carry more of its own besides.
    it('matches a compound rule against the tokens in either order', () => {
      registerRules([
        {
          tokens: ['btn', 'primary'],
          specificity: [0, 2, 0],
          order: 0,
          style: { color: 'white', padding: 8 },
        },
      ]);
      const expected = { color: 'white', padding: 8 };
      expect(resolveClassName('btn primary')).toEqual(expected);
      expect(resolveClassName('primary btn')).toEqual(expected);
      expect(resolveClassName('primary extra btn')).toEqual(expected);
    });

    it('merges every single-class rule the string matches, later rule wins', () => {
      registerRules([
        {
          tokens: ['a'],
          specificity: [0, 1, 0],
          order: 0,
          style: { color: 'red' },
        },
        {
          tokens: ['b'],
          specificity: [0, 1, 0],
          order: 1,
          style: { color: 'blue' },
        },
        {
          tokens: ['c'],
          specificity: [0, 1, 0],
          order: 2,
          style: { padding: 4 },
        },
      ]);
      expect(resolveClassName('a b c')).toEqual({ color: 'blue', padding: 4 });
    });

    // why: class names are matched AS AUTHORED — the registry does no kebab->camel (or any other)
    // normalization, so a hyphenated selector resolves under its hyphenated name and nothing else.
    it('resolves a kebab-case class name under its authored token', () => {
      registerRules([
        {
          tokens: ['section-label'],
          specificity: [0, 1, 0],
          order: 0,
          style: { color: 'red' },
        },
        {
          tokens: ['info-text'],
          specificity: [0, 1, 0],
          order: 1,
          style: { color: 'blue' },
        },
      ]);
      expect(resolveClassName('section-label')).toEqual({ color: 'red' });
      expect(resolveClassName('section-label info-text')).toEqual({
        color: 'blue',
      });
      expect(resolveClassName('sectionLabel')).toEqual({});
    });

    // why: `.card { padding: 8; background: white }` + `.card.big { padding: 16 }` on
    // `class="card big"` is padding 16 AND background white — the more specific rule LAYERS OVER
    // the single-class one rather than replacing it.
    it('layers a compound rule over the single-class rules instead of replacing them', () => {
      registerRules([
        {
          tokens: ['card'],
          specificity: [0, 1, 0],
          order: 0,
          style: { padding: 8, backgroundColor: 'white' },
        },
        {
          tokens: ['card', 'big'],
          specificity: [0, 2, 0],
          order: 1,
          style: { padding: 16 },
        },
      ]);
      expect(resolveClassName('card big')).toEqual({
        padding: 16,
        backgroundColor: 'white',
      });
    });

    // why: nothing caps the token count. The permutation search this replaced gave up past four
    // parts, so a five-token element silently skipped every compound rule it should have matched.
    it('matches a compound rule inside a five-token class string', () => {
      registerRules([
        {
          tokens: ['card', 'big'],
          specificity: [0, 2, 0],
          order: 0,
          style: { padding: 16 },
        },
      ]);
      expect(resolveClassName('one card two big three')).toEqual({
        padding: 16,
      });
    });
  });

  describe('returns empty — the real contract for "no match", not an error', () => {
    it('returns an empty style for an unregistered class name', () => {
      expect(resolveClassName('missing')).toEqual({});
    });

    it('returns an empty style for undefined, null, and an empty string', () => {
      expect(resolveClassName(undefined)).toEqual({});
      expect(resolveClassName(null)).toEqual({});
      expect(resolveClassName('')).toEqual({});
    });

    // why: distinct branch from the plain empty-string case above — this goes through trim()
    // rather than the leading falsy-value guard, and must land on the same empty result.
    it('returns an empty style for a whitespace-only string', () => {
      expect(resolveClassName('   ')).toEqual({});
    });

    // why: the empty set is a subset of every class list, so a token-less rule would paint every
    // element on the screen. It can only come from a broken compile and is dropped on sight.
    it('ignores a rule that names no token at all', () => {
      registerRules([
        {
          tokens: [],
          specificity: [0, 0, 0],
          order: 0,
          style: { color: 'red' },
        },
      ]);
      expect(resolveClassName('anything')).toEqual({});
    });

    it('clears prior registrations', () => {
      registerRules([
        {
          tokens: ['foo'],
          specificity: [0, 1, 0],
          order: 0,
          style: { color: 'red' },
        },
      ]);
      clearGlobalStyles();
      expect(resolveClassName('foo')).toEqual({});
    });

    // why: resolution is memoized per class string, so clearing has to drop the memo too or a
    // string resolved before the clear keeps answering from it.
    it('clears the resolution memo, not just the index', () => {
      registerRules([
        {
          tokens: ['foo'],
          specificity: [0, 1, 0],
          order: 0,
          style: { color: 'red' },
        },
      ]);
      expect(resolveClassName('foo')).toEqual({ color: 'red' });
      clearGlobalStyles();
      expect(resolveClassName('foo')).toEqual({});
    });
  });
});

// isClassNameValue narrows an `unknown` prop value at the routeProp boundary before
// resolveClassName ever sees it (a class/className prop can arrive as literally anything, since
// any adapter can hand over anything). No throwing path — it is a total predicate over `unknown`.
describe('isClassNameValue', () => {
  it('accepts a string', () => {
    expect(isClassNameValue('foo')).toBe(true);
  });

  it('accepts a plain object', () => {
    expect(isClassNameValue({ color: 'red' })).toBe(true);
  });

  it('accepts an array', () => {
    expect(isClassNameValue(['foo', { color: 'red' }])).toBe(true);
  });

  // why: `typeof null === 'object'` in JS — the guard has to reject null explicitly, or every
  // component with no class/className prop at all would get treated as a valid style object.
  it('rejects null even though typeof null is "object"', () => {
    expect(isClassNameValue(null)).toBe(false);
  });

  it('rejects undefined, a number, and a boolean', () => {
    expect(isClassNameValue(undefined)).toBe(false);
    expect(isClassNameValue(42)).toBe(false);
    expect(isClassNameValue(true)).toBe(false);
  });
});

// A scoped style block renames every class it defines (`card` -> `card__svelte-h`), in the
// stylesheet AND in the markup, so a scoped rule's tokens carry the suffix per token exactly as
// the element's do. Both scope prefixes in use are covered: `svelte-` and Vue's `data-v-`.
describe('style-registry — scoped class names', () => {
  beforeEach(() => {
    clearGlobalStyles();
  });

  it('resolves a compound rule whose tokens are each scope-suffixed', () => {
    registerRules([
      {
        tokens: ['card__svelte-1a2b3c4d', 'big__svelte-1a2b3c4d'],
        specificity: [0, 2, 0],
        order: 0,
        style: { padding: 16 },
      },
    ]);
    expect(
      resolveClassName('card__svelte-1a2b3c4d big__svelte-1a2b3c4d'),
    ).toEqual({ padding: 16 });
  });

  it('does the same for a Vue data-v- scope', () => {
    registerRules([
      {
        tokens: ['btn__data-v-9z8y7x', 'primary__data-v-9z8y7x'],
        specificity: [0, 2, 0],
        order: 0,
        style: { color: 'white' },
      },
    ]);
    expect(
      resolveClassName('btn__data-v-9z8y7x primary__data-v-9z8y7x'),
    ).toEqual({
      color: 'white',
    });
  });

  it('does not match a token carrying a different scope', () => {
    registerRules([
      {
        tokens: ['card__svelte-1a2b3c4d', 'big__svelte-1a2b3c4d'],
        specificity: [0, 2, 0],
        order: 0,
        style: { padding: 16 },
      },
    ]);
    expect(
      resolveClassName('card__svelte-1a2b3c4d big__svelte-99999999'),
    ).toEqual({});
  });

  it('layers a scoped class over a global rule of the same base name', () => {
    // The web equivalent is one element carrying `class="card svelte-h"`, where App.css's
    // `.card` still applies underneath the component's own rule. Here the scope is expressed by
    // renaming the token, so the base has to be re-consulted explicitly.
    registerRules([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 8, backgroundColor: 'white' },
      },
      {
        tokens: ['card__svelte-1a2b3c4d'],
        specificity: [0, 1, 0],
        order: 1,
        style: { padding: 12 },
      },
    ]);
    expect(resolveClassName('card__svelte-1a2b3c4d')).toEqual({
      padding: 12,
      backgroundColor: 'white',
    });
  });

  it('never reads a BEM class as a scoped one', () => {
    // `card__title` splits at `__` exactly like a scoped token does; only the suffix SHAPE
    // separates them. Merging `.card` into `.card__title` here would be a silent, wrong cascade.
    registerRules([
      {
        tokens: ['card'],
        specificity: [0, 1, 0],
        order: 0,
        style: { padding: 8 },
      },
      {
        tokens: ['card__title'],
        specificity: [0, 1, 0],
        order: 1,
        style: { color: 'red' },
      },
    ]);
    expect(resolveClassName('card__title')).toEqual({ color: 'red' });
  });
});
