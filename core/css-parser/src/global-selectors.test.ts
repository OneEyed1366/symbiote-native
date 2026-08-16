// The two `:global(...)` queries a scope-suffixing caller asks: which registered KEY stays
// unsuffixed, and which markup TOKEN does. Framework-free — the Vue transformer's and the Svelte
// preprocessor's own suites prove they consume the answers identically.

import { describe, expect, it } from 'vitest';
import { globalClassNamesIn, globalClassTokensIn } from './global-selectors.ts';

describe('globalClassNamesIn — keys whose whole selector lives outside the file scope', () => {
  describe('positive — an entirely global selector', () => {
    it.each([
      [':global(.reset) { margin: 0 }', ['reset']],
      [':global(.btn.primary) { font-weight: bold }', ['btnPrimary']],
      [':global(.card .title) { color: red }', ['cardTitle']],
      [':global(.reset-btn) { margin: 0 }', ['resetBtn']],
      [':global(.a):global(.b) { color: red }', ['aB']],
      // A bare element contributes no token of its own, so the chain is still entirely global.
      [':global(.reset) span { color: red }', ['reset']],
    ])('exempts the key of %s', (css, expected) => {
      expect([...globalClassNamesIn(css)]).toEqual(expected);
    });

    it('collects one entry per selector of a comma-separated list', () => {
      expect([...globalClassNamesIn(':global(.a), :global(.b) { color: red }')]).toEqual([
        'a',
        'b',
      ]);
    });
  });

  // why: the key of a partially-global chain belongs to THIS file — the rule only applies where
  // the file's own `.card` does, so exempting it would let two components' `.card :global(.reset)`
  // rules overwrite each other in the shared registry.
  describe('negative — a selector with a scoped part keeps its key', () => {
    it.each([
      '.card :global(.reset) { margin: 0 }',
      '.card > :global(.reset) { margin: 0 }',
      '.card:global(.reset) { margin: 0 }',
      ':global(.reset) .title { color: red }',
      '.card { padding: 4px }',
    ])('does not exempt the key of %s', css => {
      expect([...globalClassNamesIn(css)]).toEqual([]);
    });

    // why: the payload names `reset`, but `.reset`'s OWN rule is this file's — a text scan that
    // only asks "does `:global(.reset)` appear anywhere" unscopes a class the author never
    // marked global.
    it('does not exempt a class that has its own scoped rule beside a partial :global()', () => {
      const css = '.reset { color: red } .card :global(.reset) { margin: 0 }';
      expect([...globalClassNamesIn(css)]).toEqual([]);
    });

    it('returns an empty set for empty input', () => {
      expect([...globalClassNamesIn('')]).toEqual([]);
    });
  });
});

describe('globalClassTokensIn — tokens that came out of a :global() payload', () => {
  describe('positive', () => {
    it.each([
      [':global(.reset) { margin: 0 }', ['reset']],
      ['.card :global(.reset) { margin: 0 }', ['reset']],
      ['.card :global(.legacy-widget) span { color: red }', ['legacyWidget']],
      ['.card :global(.btn.primary) { color: red }', ['btn', 'primary']],
      ['.card:global(.reset) { margin: 0 }', ['reset']],
      [':global(.a) :global(.b) { color: red }', ['a', 'b']],
    ])('exempts the payload tokens of %s', (css, expected) => {
      expect([...globalClassTokensIn(css)]).toEqual(expected);
    });

    // why: this is the pair that has to disagree. The rule as a whole is the file's own (its key
    // is scoped), yet the `reset` half must stay spellable in markup this file does not own.
    it('exempts the token of a partial :global() whose key is NOT exempt', () => {
      const css = '.card :global(.reset) { margin: 0 }';
      expect(globalClassTokensIn(css).has('reset')).toBe(true);
      expect(globalClassNamesIn(css).has('cardReset')).toBe(false);
    });
  });

  describe('negative', () => {
    it('exempts nothing from a selector with no :global() at all', () => {
      expect([...globalClassTokensIn('.card .title { color: red }')]).toEqual([]);
    });

    // why: the rule registers nothing (a pseudo-class has no RN equivalent), so its payload names
    // nothing to exempt — and letting it through would unscope a `reset` some other rule owns.
    it('exempts nothing from a selector the parser drops', () => {
      expect([...globalClassTokensIn('.card :global(.reset:hover) { margin: 0 }')]).toEqual([]);
    });

    // why: same contract parseCSS has — malformed CSS surfaces to the Metro transformer as a
    // build failure instead of a silently partial exemption set, which would be far harder to
    // notice. The caller reaches parseCSS first anyway, so it throws there before it throws here.
    it('rejects an unbalanced :global( rather than exempting part of it', () => {
      expect(() => globalClassTokensIn('.card :global(.reset { margin: 0 }')).toThrow(
        /Unclosed bracket/,
      );
    });

    it('returns an empty set for empty input', () => {
      expect([...globalClassTokensIn('')]).toEqual([]);
    });
  });
});
