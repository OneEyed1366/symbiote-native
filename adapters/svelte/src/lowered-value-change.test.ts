// `onValueChange` must reach the app from a LOWERED TextInput, not only from the component wrapper.
//
// It is not a Fabric event — it is a fold over the raw `change` payload that the wrapper used to
// perform in its own lifecycle. Lowering deletes the wrapper, so before the engine grew the fold the
// callback was simply never called: the field echoed keystrokes (native owns its own text) while
// every value the app derived from it stayed frozen. Device-found 2026-08-31 in examples/solid's
// canary, and reproduced by examples/svelte's own `Hello, ${name}` greeting.
//
// The repair lives BELOW the fork, in `core/components/src/behaviors/text-input.ts`
// (`callValueChange`), so all five adapters inherit it. Refusing to lower an element carrying the
// prop was the other candidate and is strictly worse — it makes the optimisation opt out of the
// idiom the ecosystem actually writes. This file is the Svelte-side proof that the shared repair
// actually arrives here, because the route to `node.props` is per-adapter: Svelte is a flat-bag
// adapter, so the prop travels through `routeProp`, whose `/^on[A-Z]/` branch diverts a handler to
// `setEventListener` — but only for an event the ViewConfig DECLARES. `valueChange` is not one, so
// it falls through to `setProp` and lands in `node.props`. That is a property of the engine's
// routing, not of this adapter, and it is exactly the kind of cross-layer assumption
// `.claude/rules/verify-the-deciding-side.md` says to measure rather than read.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { HOST_PRIMITIVES } from '@symbiote-native/components/host-primitives';
import { installFabric } from '@symbiote-native/test-utils';
import { lowerHostPrimitives } from './preprocessor/lower-host-primitives';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();

const PROBE_OUT = join(__dirname, '.smoke-compiled-value-change-probe.mjs');
const ROOT_TAG = 9_301;
const SINGLELINE = 'RCTSinglelineTextInputView';
const TYPED_TEXT = 'ab';
const ACK_COUNT = 7;

// The probe reports through a global because it is compiled to a loose `.mjs` and imported by path,
// so there is no module boundary to hand a closure across.
const SINK = '__symbioteValueChangeSink';
const sink: string[] = [];
Object.assign(globalThis, { [SINK]: sink });

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

const PACKAGE_IMPORT_LINE = /^.*from '@symbiote-native\/svelte';$/m;

const SOURCE = [
  `<script>`,
  `  import { TextInput, View } from '@symbiote-native/svelte';`,
  `</script>`,
  `<View>`,
  `  <TextInput value="" onValueChange={next => globalThis.${SINK}.push(next)} />`,
  `</View>`,
].join('\n');

// The `<View>` is not scenery. With the TextInput alone, a refusal leaves the source byte-identical
// and `lower()` throws before the control is ever evaluated — so the control would pass every run
// without being able to fail, which is the vacuous shape this repo keeps re-finding. A second,
// always-lowerable element means a refused TextInput still yields CHANGED code, and the control is
// then the only thing standing between a refusal and a green run.

// Lowering leaves the now-unused import behind, and it must go: the probe is imported by path, so
// that specifier would drag the package barrel — and every `.svelte` in it — through a loader with
// no Svelte plugin. Honest precisely BECAUSE the binding is dead after lowering.
function lower(source: string): string {
  const result = lowerHostPrimitives().markup({
    content: source,
    filename: 'ValueChangeProbe.svelte',
  });
  const lowered = result === undefined ? source : result.code;
  if (lowered === source) throw new Error('the transform refused the probe');
  return lowered.replace(PACKAGE_IMPORT_LINE, '');
}

// Membership in a set derived from the spec, never a substring: the four spellings form a prefix
// family, so `includes('symbiote-text-input')` is true for the `-managed` wrapper tags too — which
// would let a REFUSAL read as a lowering and make everything below a false green.
function loweredTag(out: string): string | undefined {
  const primitive = HOST_PRIMITIVES.TextInput;
  const lowerable = new Set(
    [primitive?.intrinsic, primitive?.intrinsicWhen?.intrinsic].filter(
      (tag): tag is string => tag !== undefined,
    ),
  );
  for (const match of out.matchAll(/<(symbiote-[a-z-]+)/g))
    if (lowerable.has(match[1])) return match[1];
  return undefined;
}

afterAll(() => rmSync(PROBE_OUT, { force: true }));

describe('a lowered TextInput hands the app its text', () => {
  it('calls onValueChange from the host behavior, with no wrapper in the path', async () => {
    const lowered = lower(SOURCE);

    // POSITIVE CONTROL, asserted BEFORE the behaviour under test. "the callback fired" is produced
    // equally by a lowered element whose machine works and by a transform that quietly refused and
    // left the wrapper to do it — and the wrapper has always worked. Without this the test would
    // still pass with the whole repair reverted.
    expect(loweredTag(lowered), 'the probe actually lowered').toBe(
      HOST_PRIMITIVES.TextInput?.intrinsic,
    );

    writeFileSync(
      PROBE_OUT,
      compile(lowered, {
        generate: 'client',
        fragments: 'tree',
        css: 'external',
        filename: 'ValueChangeProbe.svelte',
      }).js.code,
    );
    const { default: Probe } = (await import(`file://${PROBE_OUT}`)) as {
      default: Component;
    };
    mount(ROOT_TAG, Probe, {});
    await tick();
    await tick();

    const node = fabric.find(n => n.viewName === SINGLELINE);
    expect(node, 'the lowered tag committed a single-line input').toBeDefined();
    if (node === undefined) return;

    fabric.fireEvent(node.instanceHandle, 'topChange', {
      text: TYPED_TEXT,
      eventCount: ACK_COUNT,
    });
    await tick();
    await tick();

    expect(sink).toEqual([TYPED_TEXT]);
    unmount(ROOT_TAG);
  });
});
