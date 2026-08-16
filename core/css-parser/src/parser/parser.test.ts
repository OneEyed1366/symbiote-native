// Co-located unit test: parseCSS compiles a plain CSS string into a
// `{ className: RNStyleObject }` map, mapping CSS properties and values onto their
// React Native style prop names and values. extractClassTokens/classTokensIn are the
// selector-tokenizing half both parseCSS and the scoped-style compilers (Vue/Svelte) share.

import { describe, expect, it, vi } from 'vitest';
import { classTokensIn, extractClassTokens, parseCSS } from './index';

describe('parseCSS', () => {
  describe('positive — maps a supported selector/declaration to an RN style entry', () => {
    it('maps a single class selector', () => {
      expect(parseCSS('.card { color: red }')).toEqual({
        card: { color: 'red' },
      });
    });

    it('converts kebab-case properties and kebab-case class names to camelCase', () => {
      expect(parseCSS('.btn-primary { background-color: blue }')).toEqual({
        btnPrimary: { backgroundColor: 'blue' },
      });
    });

    it('maps aspect-ratio to a plain number, unlike transform/shadow it has no shape mismatch', () => {
      expect(parseCSS('.thumbnail { aspect-ratio: 1.5 }')).toEqual({
        thumbnail: { aspectRatio: 1.5 },
      });
    });

    it('flattens a compound selector into one camelCase class name', () => {
      expect(parseCSS('.btn.primary { font-weight: bold }')).toEqual({
        btnPrimary: { fontWeight: 'bold' },
      });
    });

    it('flattens a descendant selector into one camelCase class name', () => {
      expect(parseCSS('.card .title { color: red }')).toEqual({
        cardTitle: { color: 'red' },
      });
    });

    it('converts a px value to a plain number', () => {
      expect(parseCSS('.box { padding: 10px }')).toEqual({
        box: { padding: 10 },
      });
    });

    it('keeps a percentage value as a string', () => {
      expect(parseCSS('.box { width: 50% }')).toEqual({
        box: { width: '50%' },
      });
    });

    it('maps gap and its row/column variants', () => {
      expect(parseCSS('.box { gap: 12px; row-gap: 4px; column-gap: 8px }')).toEqual({
        box: { gap: 12, rowGap: 4, columnGap: 8 },
      });
    });

    // why: two separate rules for the same collapsed class name are two separate <style> lines
    // or a re-declared selector — CSS lets an author split a rule that way, and the cascade
    // (later wins, unset properties survive) has to apply across the whole stylesheet, not just
    // within one postcss Rule node.
    it('merges two rules for the same class across the stylesheet, keeping properties neither restates', () => {
      expect(parseCSS('.card { color: red } .card { padding: 4 }')).toEqual({
        card: { color: 'red', padding: 4 },
      });
    });

    it('lets a later rule for the same class win a conflicting property', () => {
      expect(parseCSS('.card { color: red } .card { color: blue }')).toEqual({
        card: { color: 'blue' },
      });
    });

    it('resolves a var() reference declared in :root', () => {
      const css = `
        :root { --primary-color: teal; }
        .card { color: var(--primary-color); }
      `;
      expect(parseCSS(css)).toEqual({
        card: { color: 'teal' },
      });
    });

    // why: a var() with a fallback must still resolve when the custom property was never
    // declared — the fallback is the spec's whole reason to exist, not a decoration.
    it('falls back to the var() fallback value when the custom property is never declared', () => {
      expect(parseCSS('.card { color: var(--missing, teal) }')).toEqual({
        card: { color: 'teal' },
      });
    });

    it('evaluates a calc() multiplication', () => {
      expect(parseCSS('.box { margin-top: calc(2 * 10px) }')).toEqual({
        box: { marginTop: 20 },
      });
    });

    // why: evaluateCalc's own contract (see its docstring) is "a single multiplication, or the
    // first numeric term as a fallback" — addition is NOT evaluated. Pinning this so the gap
    // stays a documented, deliberate limitation rather than something a future refactor
    // "accidentally" fixes without anyone noticing the contract changed.
    it('falls back to the first term for a calc() addition, which it does not evaluate', () => {
      expect(parseCSS('.box { margin-top: calc(2px + 10px) }')).toEqual({
        box: { marginTop: 2 },
      });
    });

    // why: `--local` is a CSS custom property, not a real RN style prop — leaking it into the
    // style object would hand `mapCSSProperty` (and eventually the Fabric commit) a prop it has
    // no mapping for, for a name that was never meant to reach a component's style at all.
    it('drops a custom-property declaration inside a class rule from its output style', () => {
      expect(parseCSS('.card { --local: 1; color: red }')).toEqual({
        card: { color: 'red' },
      });
    });

    it("drops an unsupported property without throwing, keeping the rule's supported ones", () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(parseCSS('.card { animation: spin 1s linear; color: red }')).toEqual({
        card: { color: 'red' },
      });
      expect(warn).toHaveBeenCalledWith(
        '[@symbiote-native/css-parser] unsupported CSS property "animation" dropped',
      );

      warn.mockRestore();
    });

    // why: a rule that contributes NO supported property must not leave behind an empty `{}`
    // entry for its class — an empty style object is indistinguishable from "found a class with
    // no styles" and would still overwrite a real style registered for the same name.
    it('contributes no entry at all for a rule whose only property is unsupported', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(parseCSS('.card { animation: spin 1s linear }')).toEqual({});

      warn.mockRestore();
    });

    it('warns once per unique unsupported property per parseCSS() call', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      parseCSS('.a { animation: none; } .b { animation: none; }');
      expect(warn).toHaveBeenCalledTimes(1);

      warn.mockRestore();
    });

    // `transform`/`box-shadow` are passed through as raw, UNPARSED CSS text — RN's own JS
    // pre-processors (core/engine/src/process-transform, core/engine/src/process-box-shadow)
    // parse this exact syntax at commit time, including matrix()/inset/spread/multi-shadow lists,
    // so css-parser's only job is the kebab→camel rename, not a value transform.
    it('passes transform through untouched as raw CSS text, just renamed to camelCase', () => {
      expect(parseCSS('.box { transform: translateX(10px) rotate(45deg) scale(1.5) }')).toEqual({
        box: { transform: 'translateX(10px) rotate(45deg) scale(1.5)' },
      });
    });

    it('passes box-shadow through untouched as raw CSS text, just renamed to camelCase', () => {
      expect(parseCSS('.card { box-shadow: inset 0 2px 4px 6px rgba(0, 0, 0, 0.3) }')).toEqual({
        card: { boxShadow: 'inset 0 2px 4px 6px rgba(0, 0, 0, 0.3)' },
      });
    });

    // Same raw-passthrough reasoning as transform/box-shadow above: core/engine/src/process-filter,
    // process-transform-origin, and process-background-image already parse these exact CSS
    // syntaxes at commit time, ported from RN's own JS processors.
    it('passes filter through untouched as raw CSS text, just renamed to camelCase', () => {
      expect(parseCSS('.card { filter: brightness(0.5) blur(4px) }')).toEqual({
        card: { filter: 'brightness(0.5) blur(4px)' },
      });
    });

    it('passes transform-origin through untouched as raw CSS text, renamed to camelCase', () => {
      expect(parseCSS('.box { transform-origin: top left }')).toEqual({
        box: { transformOrigin: 'top left' },
      });
    });

    // RN's own style prop is `experimental_backgroundImage`, not a plain camelCase rename of the
    // CSS property — see the PROPERTY_TABLE comment.
    it('passes background-image through untouched as raw CSS text, renamed to experimental_backgroundImage', () => {
      expect(parseCSS('.card { background-image: linear-gradient(to right, red, blue) }')).toEqual({
        card: { experimental_backgroundImage: 'linear-gradient(to right, red, blue)' },
      });
    });

    it('maps text-shadow to RN text shadow props', () => {
      expect(parseCSS('.title { text-shadow: 1px 1px 2px black }')).toEqual({
        title: {
          textShadowColor: 'black',
          textShadowOffset: { width: 1, height: 1 },
          textShadowRadius: 2,
        },
      });
    });

    it('unwraps a :global(...) selector to its inner class name', () => {
      expect(parseCSS(':global(.reset) { margin: 0 }')).toEqual({
        reset: { margin: 0 },
      });
    });

    it('unwraps a :global(...) compound selector', () => {
      expect(parseCSS(':global(.btn.primary) { font-weight: bold }')).toEqual({
        btnPrimary: { fontWeight: 'bold' },
      });
    });

    // why: a partial `:global(...)` is the ordinary way to reach markup this file does not own,
    // so the rule has to register under a key of its own. Dropping it (the previous behavior)
    // silently threw the declarations away; folding it into `.card`'s key would leak them onto
    // every plain `.card` element.
    it('registers a partial :global(...) under the key of the whole chain, not of its scoped half', () => {
      expect(parseCSS('.card { padding: 4px } .card :global(.reset) { margin: 0 }')).toEqual({
        card: { padding: 4 },
        cardReset: { margin: 0 },
      });
    });

    it('skips @media at-rules with a warning instead of throwing', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const css = `
        @media (min-width: 600px) {
          .card { color: red; }
        }
        .title { color: blue; }
      `;
      expect(parseCSS(css)).toEqual({
        title: { color: 'blue' },
      });
      expect(warn).toHaveBeenCalled();

      warn.mockRestore();
    });

    it('returns an empty object for empty input', () => {
      expect(parseCSS('')).toEqual({});
    });
  });

  // why: RN has no element-selector, hover/focus-variant, or universal-selector concept, so a
  // selector with no RN equivalent must contribute nothing rather than a nonsensical class.
  describe('returns nothing for a selector with no RN equivalent (no property is dropped, no error)', () => {
    it('contributes nothing for a pseudo-class rule', () => {
      expect(parseCSS(':hover { color: red }')).toEqual({});
    });

    it('contributes nothing for a bare element selector', () => {
      expect(parseCSS('div { color: red }')).toEqual({});
    });

    it('drops the whole rule for a pseudo-class trailing a class selector, without leaking into the base class', () => {
      expect(
        parseCSS('.card { padding: 10px } .card:hover { padding: 20px; opacity: 0.5 }'),
      ).toEqual({
        card: { padding: 10 },
      });
    });
  });

  // why: postcss.parse() is not wrapped in a try/catch here — malformed CSS surfaces to the
  // caller (the Metro transformer) as an immediate build failure instead of silently producing
  // a partial/wrong style map, which would be far harder to notice.
  describe('negative — malformed CSS is rejected, not silently partially parsed', () => {
    it("throws postcss's own CssSyntaxError for an unclosed block", () => {
      expect(() => parseCSS('.card { color: red ')).toThrow(/Unclosed block/);
    });
  });
});

describe('extractClassTokens — the tokens a selector is built from', () => {
  describe('positive — an RN-expressible selector', () => {
    it.each([
      ['.card', ['card']],
      ['.btn.primary', ['btn', 'primary']],
      ['.card .title', ['card', 'title']],
      ['.card > .title', ['card', 'title']],
      ['div.card', ['card']],
      ['.my-class-name', ['myClassName']],
      ['.card-box.is-big', ['cardBox', 'isBig']],
      ['#header', ['header']],
      ['[data-theme]', ['dataTheme']],
      [':global(.reset)', ['reset']],
    ])('splits %s', (selector, expected) => {
      expect(extractClassTokens(selector)).toEqual(expected);
    });

    // why: a chain link can itself be compound, and the element has to carry BOTH of its names.
    // Keeping only `.btn` registered the rule under `cardBtn`, a key no `class="card btn primary"`
    // element ever resolves to — and it is the shape a `:global()`-wrapped compound erases into.
    it('keeps every class of a compound part of a descendant chain', () => {
      expect(extractClassTokens('.card .btn.primary')).toEqual(['card', 'btn', 'primary']);
    });

    // why: `.card > div` names an element with no class of its own — the descendant walk still
    // has to produce the ONE token that IS a class rather than reject the whole selector, since
    // dropping `.card` here would make an ordinary "class, then a plain child element" selector
    // unexpressable.
    it('keeps the class token from a descendant selector where the other part is a bare element', () => {
      expect(extractClassTokens('.card > div')).toEqual(['card']);
    });
  });

  // why: null is the "no RN equivalent, drop the whole rule" signal parseCSS acts on — every
  // shape that must produce it is as much a part of the contract as the shapes that succeed.
  describe('returns null for a selector with no RN equivalent', () => {
    it.each(['div', '*', ':hover', '.card:hover', '.card::before'])('rejects %s', selector => {
      expect(extractClassTokens(selector)).toBeNull();
    });

    // why: two bare elements joined by a combinator carry no class/id at all — same "nothing to
    // scope" conclusion as a lone `div`, reached through the descendant branch instead of the
    // element-selector guard at the top.
    it('rejects a descendant selector where neither part carries a class or id', () => {
      expect(extractClassTokens('div p')).toBeNull();
    });

    // why: `div.` (an element selector with a trailing, empty compound part) has a dot but no
    // class name after it — the compound branch must fall through to null instead of returning
    // an empty/undefined token.
    it('rejects an element selector with a dangling empty compound part', () => {
      expect(extractClassTokens('div.')).toBeNull();
    });

    it('rejects an empty selector', () => {
      expect(extractClassTokens('')).toBeNull();
    });
  });

  // why: `:global()` marks a part of a selector as living outside the file's scope; it does not
  // change which classes an element has to carry. So a selector tokenizes identically with and
  // without the wrapper, wherever in the chain it sits. This follows Svelte, whose compiler
  // erases the wrapper per relative selector and keeps the rest of the chain scoped, rather than
  // Vue's `pluginScoped`, which replaces the WHOLE selector with the `:global()` payload and so
  // widens `.card :global(.reset)` into a stylesheet-wide `.reset` — see the rationale on
  // stripGlobalWrappers in ./index.ts.
  describe('erases a :global(...) wrapper anywhere in the selector, keeping its payload', () => {
    it.each([
      [':global(.reset)', ['reset']],
      [':global(.reset) .title', ['reset', 'title']],
      ['.card :global(.reset)', ['card', 'reset']],
      ['.card :global(.legacy-widget) span', ['card', 'legacyWidget']],
      ['.card > :global(.reset)', ['card', 'reset']],
      [':global(.btn.primary)', ['btn', 'primary']],
      ['.card :global(.btn.primary)', ['card', 'btn', 'primary']],
      ['.card:global(.reset)', ['card', 'reset']],
    ])('tokenizes %s', (selector, expected) => {
      expect(extractClassTokens(selector)).toEqual(expected);
    });

    // why: the point of erasing the wrapper is that the wrapped part is indistinguishable from
    // the same part written bare — if the two ever tokenized differently, a rule would register
    // under a key its own markup could not resolve to.
    it('tokenizes a partial :global(...) exactly like the same chain written without it', () => {
      expect(extractClassTokens('.card :global(.legacy-widget) span')).toEqual(
        extractClassTokens('.card .legacy-widget span'),
      );
    });

    // why: `:global()` erasure must not smuggle an unsupported selector past the pseudo-class
    // guard — a payload with no RN equivalent is still dropped, wrapper or not.
    it.each([':global(div)', ':global(*)', '.card :global(.reset:hover)'])(
      'still rejects %s, whose payload has no RN equivalent',
      selector => {
        expect(extractClassTokens(selector)).toBeNull();
      },
    );
  });
});

describe('classTokensIn — every registered key mapped back to its selector tokens', () => {
  describe('positive', () => {
    it('maps each registered key back to the tokens its selector was built from', () => {
      const css = '.card { color: red } .card.big { color: blue } .card .title { color: green }';
      expect(classTokensIn(css)).toEqual(
        new Map([
          ['card', ['card']],
          ['cardBig', ['card', 'big']],
          ['cardTitle', ['card', 'title']],
        ]),
      );
    });

    // why: this map is what a scoped-style compiler suffixes from — the key is the registered
    // name, the tokens are the markup names. A partial `:global(...)` has to appear here with
    // BOTH tokens, or the rule registers under a key its own element cannot resolve to.
    it('maps a partial :global(...) key back to every token of its chain', () => {
      expect(classTokensIn('.card :global(.legacy-widget) { color: red }')).toEqual(
        new Map([['cardLegacyWidget', ['card', 'legacyWidget']]]),
      );
    });

    it('splits a comma-separated selector list into one entry per selector', () => {
      expect(classTokensIn('.a.b, .c { color: red }')).toEqual(
        new Map([
          ['aB', ['a', 'b']],
          ['c', ['c']],
        ]),
      );
    });

    // why: a comma-separated list can legitimately mix a selector with an RN equivalent and one
    // without (e.g. a shared `.card, :hover { }` rule an author never meant to split apart) —
    // the unrecognized half must be skipped, not turn the whole rule into a parse failure.
    it('keeps only the selectors with an RN equivalent from a mixed comma-separated list', () => {
      expect(classTokensIn('.card, div { color: red }')).toEqual(new Map([['card', ['card']]]));
    });

    it('drops at-rules, silently — parseCSS already warns on its own pass', () => {
      const css = '@media (min-width: 600px) { .card.big { color: red } } .title { color: blue }';
      expect(classTokensIn(css)).toEqual(new Map([['title', ['title']]]));
    });

    it('returns an empty map for empty input', () => {
      expect(classTokensIn('')).toEqual(new Map());
    });
  });

  // why: same postcss.parse() call, same no-catch contract as parseCSS — a scoped-style
  // compiler (Vue/Svelte) calling this at build time must see a build failure, not a Map that
  // silently omits the malformed rule's classes.
  describe('negative — malformed CSS is rejected', () => {
    it("throws postcss's own CssSyntaxError for an unclosed block", () => {
      expect(() => classTokensIn('.card { color: red ')).toThrow(/Unclosed block/);
    });
  });
});
