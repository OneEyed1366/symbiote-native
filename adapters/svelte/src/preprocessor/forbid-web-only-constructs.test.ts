// Guards the ONE thing this preprocessor exists for: constructs that compile cleanly under the
// DOM shim and then silently do nothing. A regression here is invisible — the build stays green
// and the screen stays blank — so each construct gets an explicit case, and the clean-markup case
// asserts the preprocessor is not over-reaching.

import { describe, expect, it } from 'vitest';
import { forbidWebOnlyConstructs } from './forbid-web-only-constructs';

const preprocessor = forbidWebOnlyConstructs();

function run(content: string): { code: string } {
  return preprocessor.markup({ content, filename: 'Probe.svelte' });
}

describe('forbidWebOnlyConstructs', () => {
  it.each([
    ['<svelte:head>', '<svelte:head><title>x</title></svelte:head>'],
    ['<svelte:window>', '<svelte:window onresize={() => {}} />'],
    ['<svelte:document>', '<svelte:document onvisibilitychange={() => {}} />'],
    ['<svelte:body>', '<svelte:body onclick={() => {}} />'],
  ])('rejects %s', (label, source) => {
    expect(() => run(source)).toThrow(label);
  });

  it('rejects {@html} at the top level', () => {
    expect(() => run('<script>let s = $state("")</script>{@html s}')).toThrow('{@html …}');
  });

  it('rejects {@html} nested inside a block', () => {
    const source =
      '<script>let s = $state("")</script>{#if s}<symbiote-view p={{}}>{@html s}</symbiote-view>{/if}';
    expect(() => run(source)).toThrow('{@html …}');
  });

  it('names an RN-appropriate alternative rather than just refusing', () => {
    expect(() => run('{@html "<b>x</b>"}')).toThrow(/<View>\/<Text>/);
  });

  it('passes clean markup through unchanged', () => {
    const source = '<symbiote-view p={{}}><symbiote-text p={{}}>hi</symbiote-text></symbiote-view>';
    expect(run(source).code).toBe(source);
  });
});

// Browser-only IMPORTS fail the same way the special elements do — permanently undefined values,
// no error anywhere — one level up from the markup. The boundary matters as much as the ban: the
// rest of these modules is pure and must keep working, so the negative cases below are the real
// point of this block. Mapping measured per subpackage, see svelte-adapter-dom-shim skill §25.
describe('forbidWebOnlyConstructs — browser-only svelte imports', () => {
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

  it("rejects MediaQuery specifically, not all of 'svelte/reactivity'", () => {
    expect(() => run('<script>import { MediaQuery } from "svelte/reactivity";</script>')).toThrow(
      'MediaQuery',
    );
  });

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

  it('checks a <script module> block too, not only the instance script', () => {
    expect(() =>
      run('<script module>import { devicePixelRatio } from "svelte/reactivity/window";</script>'),
    ).toThrow('svelte/reactivity/window');
  });
});
