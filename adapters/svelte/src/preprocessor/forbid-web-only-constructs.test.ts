// Guards the ONE thing this preprocessor exists for: constructs that compile cleanly under the
// DOM shim and then silently do nothing (svelte-adapter-dom-shim skill §7/§22d/§25). A regression
// here is invisible — the build stays green and the screen stays blank — so each construct gets an
// explicit case asserting the SPECIFIC thrown message, not just "it threw something", and the
// clean-markup cases assert the preprocessor is not over-reaching into constructs it must leave
// alone.

import { describe, expect, it } from 'vitest';
import { forbidWebOnlyConstructs } from './forbid-web-only-constructs';

const preprocessor = forbidWebOnlyConstructs();

function run(content: string): { code: string } {
  return preprocessor.markup({ content, filename: 'Probe.svelte' });
}

// Distinct from `run`: omits `filename` entirely rather than defaulting it, so the fallback
// branch is actually exercised.
function runWithNoFilename(content: string): { code: string } {
  return preprocessor.markup({ content });
}

describe('forbidWebOnlyConstructs — markup', () => {
  describe('Positive (markup that must pass through unchanged)', () => {
    it('passes clean markup through unchanged', () => {
      const source =
        '<symbiote-view p={{}}><symbiote-text p={{}}>hi</symbiote-text></symbiote-view>';
      expect(run(source).code).toBe(source);
    });

    // why: <svelte:element> is the only route to a CAPITALIZED, un-hyphenated native tag
    // (RNSScreen, RNSScreenStack…) — a literal <RNSScreen> parses as a component reference, not
    // an element (skill §22d). It was originally listed as dead/forbidden and that was reversed
    // once packages/navigation needed it; this pins the reversal so it cannot silently regress.
    it('does not forbid <svelte:element> — it is the load-bearing route to a capitalized native tag', () => {
      const source = "<svelte:element this={'RNSScreen'}>hi</svelte:element>";
      expect(run(source).code).toBe(source);
    });
  });

  describe('Negative (special elements with no meaning under React Native)', () => {
    it.each([
      ['<svelte:head>', '<svelte:head><title>x</title></svelte:head>'],
      ['<svelte:window>', '<svelte:window onresize={() => {}} />'],
      ['<svelte:document>', '<svelte:document onvisibilitychange={() => {}} />'],
      ['<svelte:body>', '<svelte:body onclick={() => {}} />'],
    ])(
      // why: each of these compiles and then is permanently inert under the DOM shim (skill §4)
      // — silent, not a crash — so the only safe behavior is refusing at build time.
      'rejects %s',
      (label, source) => {
        expect(() => run(source)).toThrow(label);
      },
    );

    // why: with no filename (a preprocessor can legitimately be invoked without one), the error
    // still has to name SOME source rather than crash on a missing string — the '<svelte>'
    // placeholder is the documented fallback for that path.
    it('falls back to a <svelte> placeholder in the message when no filename is given', () => {
      expect(() => runWithNoFilename('<svelte:head><title>x</title></svelte:head>')).toThrow(
        '<svelte>: <svelte:head>',
      );
    });
  });

  describe('Negative ({@html} — compiles, then renders nothing into a native tree)', () => {
    it('rejects {@html} at the top level', () => {
      expect(() => run('<script>let s = $state("")</script>{@html s}')).toThrow('{@html …}');
    });

    // why: {@html} can sit inside an {#if}/{#each}/snippet body, which hang off different AST
    // keys than the top-level fragment — the walk has to descend into every child, not just the
    // one field the special elements happen to live under.
    it('rejects {@html} nested inside a block', () => {
      const source =
        '<script>let s = $state("")</script>{#if s}<symbiote-view p={{}}>{@html s}</symbiote-view>{/if}';
      expect(() => run(source)).toThrow('{@html …}');
    });

    // why: a bare refusal with no alternative just moves the confusion to the author; naming
    // <View>/<Text> is the product contract, not a nicety.
    it('names an RN-appropriate alternative rather than just refusing', () => {
      expect(() => run('{@html "<b>x</b>"}')).toThrow(/<View>\/<Text>/);
    });
  });
});

// Browser-only IMPORTS fail the same way the special elements do — permanently undefined values,
// no error anywhere — one level up from the markup. The boundary matters as much as the ban: the
// rest of these modules is pure and must keep working, so both directions are covered. Mapping
// measured per subpackage, see svelte-adapter-dom-shim skill §25.
describe('forbidWebOnlyConstructs — browser-only svelte imports', () => {
  describe('Positive (pure members of the same modules stay importable)', () => {
    it('leaves the pure members of svelte/reactivity alone', () => {
      const source =
        '<script>import { SvelteMap, SvelteSet, SvelteDate, createSubscriber } from "svelte/reactivity";</script>';
      expect(run(source).code).toBe(source);
    });

    it('leaves svelte/motion alone — Tween/Spring drive real requestAnimationFrame here', () => {
      const source = '<script>import { Tween } from "svelte/motion";</script>';
      expect(run(source).code).toBe(source);
    });

    it('leaves svelte/store and svelte/easing alone', () => {
      const source =
        '<script>import { writable } from "svelte/store"; import { cubicOut } from "svelte/easing";</script>';
      expect(run(source).code).toBe(source);
    });
  });

  describe('Negative (whole-module ban: svelte/reactivity/window)', () => {
    it("rejects any import from 'svelte/reactivity/window'", () => {
      expect(() =>
        run('<script>import { innerWidth } from "svelte/reactivity/window";</script>'),
      ).toThrow('svelte/reactivity/window');
    });

    it('names the RN replacements rather than just refusing', () => {
      expect(() =>
        run('<script>import { innerHeight } from "svelte/reactivity/window";</script>'),
      ).toThrow(/devicePixelRatio/);
    });

    it('explains that scrollX/screenLeft have no equivalent at all', () => {
      expect(() =>
        run('<script>import { scrollY } from "svelte/reactivity/window";</script>'),
      ).toThrow(/no equivalent for scrollX/);
    });

    // why: the ban applies at the module boundary, so a namespace import bans the same as a
    // named one — an author cannot dodge it by renaming the import shape.
    it('rejects a namespace import of svelte/reactivity/window too', () => {
      expect(() => run('<script>import * as w from "svelte/reactivity/window";</script>')).toThrow(
        'svelte/reactivity/window',
      );
    });

    it('checks a <script module> block too, not only the instance script', () => {
      expect(() =>
        run('<script module>import { devicePixelRatio } from "svelte/reactivity/window";</script>'),
      ).toThrow('svelte/reactivity/window');
    });
  });

  describe('Negative (named-only ban: MediaQuery out of svelte/reactivity)', () => {
    it("rejects MediaQuery specifically, not all of 'svelte/reactivity'", () => {
      expect(() => run('<script>import { MediaQuery } from "svelte/reactivity";</script>')).toThrow(
        'MediaQuery',
      );
    });

    // why: a namespace binding defers member selection to runtime, so `R.MediaQuery` is
    // unreachable to this check — `import * as R` used to walk straight past the ban and hand
    // the author the exact silently-false MediaQuery the guard exists to catch.
    it('rejects a namespace import of svelte/reactivity, which it cannot see through', () => {
      expect(() => run('<script>import * as R from "svelte/reactivity";</script>')).toThrow(
        'imported as a namespace',
      );
    });

    it('still names MediaQuery and its RN replacement when refusing the namespace import', () => {
      expect(() => run('<script>import * as R from "svelte/reactivity";</script>')).toThrow(
        /MediaQuery[\s\S]*createWidthQuery/,
      );
    });

    // why: the namespace refusal must not spill onto the modules that carry no `named`
    // restriction at all — those already throw one level up, on the module itself.
    it('leaves a namespace import of a module with no ban untouched', () => {
      const source = '<script>import * as store from "svelte/store";</script>';
      expect(run(source).code).toBe(source);
    });
  });
});
