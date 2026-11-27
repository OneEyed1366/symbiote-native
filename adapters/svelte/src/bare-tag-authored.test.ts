// Bare tag authored in an app, compiled by the real Svelte compiler and read off the Fabric tree
// Per-attribute markup like `<view testID="x" style={s} class="card" onPress={fn}>` must survive
// Svelte's own codegen, which `bare-tag-parity.test.ts` (the `p` bag) does not cover

// Codegen may lowercase an attribute name or stringify a value before the renderer sees it
// `canonical-prop-names.ts` restores names, and the last two `it`s below pin the values
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import {
  createLiveTree,
  installRecordingFabric,
} from '@symbiote-native/test-utils';
import {
  isSymbioteNode,
  propOf,
  registerRules,
  type ISymbioteNode,
} from '@symbiote-native/engine';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);

// Each `it` mounts its own surface under a fresh root tag with no shared reset in the original
// suite — `installFabric`'s `appRoot()` tolerated that because `committed` only ever held the
// live test's root. The recording host's creation log does not forget on its own, so `appRoot()`
// (a `find` over that log) would keep answering with the FIRST surface ever created without this.
beforeEach(() => fabric.reset());

// Named for this suite alone — two suites sharing a compiled artifact race under a full run
// (`.claude/rules/smoke-compiled-artifact-collisions.md`).
const PROBE_OUT = join(__dirname, '.smoke-compiled-authored-bare-tag.mjs');

// Copied from `metro-svelte-transformer.cjs`. A measurement taken on a compiler's STOCK
// configuration is a fact about somebody else's build.
const COMPILE_OPTIONS = {
  generate: 'client',
  fragments: 'tree',
  css: 'external',
} as const;

const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const settle = async (): Promise<void> => {
  await tick();
  await tick();
  await tick();
};

// Every arm labels its node with `id`, which the primitive fold turns into `nativeID`, rather than
// with `testID`. On a tag whose name is not also an SVG element the compiler lowercases even a
// DYNAMIC attribute name, so `testID` arrives as `testid` and a testID-keyed locator silently finds
// nothing — a missing node reads as a broken fix. `id` is already lowercase everywhere.

/** The committed payload of the labelled node — what the engine would hand the renderer for it. */
function committedProps(label: string): Record<string, unknown> {
  const hit = live.findLive(
    live.appRoot(),
    node => node.props.nativeID === label,
  );
  if (hit === undefined) throw new Error(`no committed node labelled ${label}`);
  return hit.payload;
}

/**
 * The ENGINE node behind it — where a listener lands, which no payload shows.
 *
 * The label is asked of the HOST (`propOf`), not read off a field: JS holds no props now, and
 * `instanceHandle` is the node itself.
 */
function engineNodeFor(label: string): ISymbioteNode {
  const found = fabric.find(
    node =>
      isSymbioteNode(node.instanceHandle) &&
      propOf(node.instanceHandle, 'nativeID') === label,
  );
  const handle = found?.instanceHandle;
  if (!isSymbioteNode(handle))
    throw new Error(`no engine node labelled ${label}`);
  return handle;
}

/** Compile a real `.svelte` source, mount it, settle. */
async function mountSource(source: string, rootTag: number): Promise<void> {
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'Authored.svelte' }).js
      .code,
  );
  // Node caches a dynamic import by resolved path, so each arm needs a fresh query string
  // or it silently re-runs the previous arm's module
  const { default: Probe } = (await import(
    `file://${PROBE_OUT}?arm=${rootTag}`
  )) as { default: Component };
  mount(rootTag, Probe, {});
  await settle();
}

afterAll(() => {
  rmSync(PROBE_OUT, { force: true });
});

describe('an app-authored bare tag', () => {
  it('routes a dynamic attribute without stringifying it', async () => {
    await mountSource(
      [
        '<script>',
        '  const lines = 3;',
        '</script>',
        '<view id="dyn" accessibilityLabel={"hi"} numberOfLines={lines}></view>',
      ].join('\n'),
      9_820,
    );

    const props = committedProps('dyn');
    expect(props.accessibilityLabel).toBe('hi');
    // The DOM would coerce this to "3", and the renderer must not
    expect(props.numberOfLines).toBe(3);

    unmount(9_820);
    await settle();
  });

  // `from_tree` builds each template once and clones it per instance, so a clone must replay
  // every static attribute, and the label itself is a static `id` folded to `nativeID`
  it('replays the static attributes the template baked in', async () => {
    await mountSource(
      '<view id="static" accessible="true" pointerEvents="box-none"></view>',
      9_821,
    );

    const props = committedProps('static');
    expect(props.accessible).toBe('true');
    // The compiler lowercases this name before the renderer sees it, so `canonical-prop-names.ts`
    // restores it: an author cannot spell it in a way that survives
    expect(props.pointerEvents).toBe('box-none');
    expect(props, 'the fold consumed the raw key').not.toHaveProperty('id');

    unmount(9_821);
    await settle();
  });

  // `set_class` takes two exits, chosen by the element's compiled namespace and not by the author
  // The test covers both shapes, as a fix for one exit alone leaves half of an app's markup
  // silently unstyled
  it('routes a dynamic class through the style registry, on both class exits', async () => {
    registerRules([
      {
        tokens: ['authored-tile'],
        specificity: [0, 1, 0],
        order: 0,
        style: { width: 40, opacity: 0.5 },
      },
    ]);
    await mountSource(
      [
        '<script>',
        '  const cls = "authored-tile";',
        '</script>',
        // Nested: the child inherits the SVG namespace, so both take the setAttribute exit.
        '<view id="nested-outer" class={cls}>',
        '  <pressable id="nested-inner" class={cls}></pressable>',
        '</view>',
        // Siblings of a fragment: html namespace, so both take the className exit.
        '<view id="sibling-view" class={cls}></view>',
        '<pressable id="sibling-pressable" class={cls}></pressable>',
      ].join('\n'),
      9_822,
    );

    for (const arm of [
      'nested-outer',
      'nested-inner',
      'sibling-view',
      'sibling-pressable',
    ]) {
      const props = committedProps(arm);
      expect(props.width, `${arm}: the registered rule resolved`).toBe(40);
      expect(props.opacity, `${arm}: and all of it`).toBe(0.5);
    }

    unmount(9_822);
    await settle();
  });

  // `set_style` stringifies, so an RN style object reaches the attribute as "[object Object]"
  // The only surviving copy is the one Svelte caches on the node, see `style-cache.ts`
  it('routes a style OBJECT, which cssText cannot carry', async () => {
    await mountSource(
      [
        '<script>',
        '  const boxStyle = { width: 12, opacity: 1 };',
        '</script>',
        '<view id="styled" style={boxStyle}></view>',
      ].join('\n'),
      9_823,
    );

    const props = committedProps('styled');
    expect(props.width).toBe(12);
    expect(props.opacity).toBe(1);
    // The stringified copy must not have leaked in beside it.
    expect(props).not.toHaveProperty('cssText');

    unmount(9_823);
    await settle();
  });

  // `$.event()` passes the authored name minus `on`, so `onPress` arrives as `Press`
  // The renderer must map it to the engine event name, or nothing is dispatched to the listener
  it('routes an on<Name> handler under the engine event name', async () => {
    await mountSource(
      [
        '<script>',
        '  const onPress = () => {};',
        '  const onLayout = () => {};',
        '</script>',
        '<view id="evt" onPress={onPress} onLayout={onLayout}></view>',
      ].join('\n'),
      9_824,
    );

    const listeners = engineNodeFor('evt').listeners;
    expect(listeners instanceof Map, 'the handler reached the engine').toBe(
      true,
    );
    expect(listeners instanceof Map && listeners.has('press')).toBe(true);
    // `layout` is one of the six events Fabric gates on a boolean prop, so the committed payload is
    // a second, independent oracle for the same normalization — a listener stored as `Layout` sets
    // no flag (`.claude/rules/fabric-boolean-event-gates.md`).
    expect(committedProps('evt').onLayout).toBe(true);

    unmount(9_824);
    await settle();
  });

  // The compiler lowercases an attribute name for some tag families, so a fix verified on `view`
  // alone certifies nothing about `pressable`
  // `accessibilityLabel` is the oracle: a lowercased key reaches the payload and is red nowhere
  it('restores the attribute casing the compiler dropped, on every tag family', async () => {
    await mountSource(
      [
        '<script>',
        '  const label = "dyn";',
        '</script>',
        // SVG-named: the STATIC name is lowercased, the dynamic one is kept.
        '<view id="case-view" accessibilityLabel="stat"></view>',
        '<view id="case-view-dyn" accessibilityLabel={label}></view>',
        // plain html: BOTH spellings are lowercased.
        '<pressable id="case-press" accessibilityLabel="stat"></pressable>',
        '<pressable id="case-press-dyn" accessibilityLabel={label}></pressable>',
        // custom element: neither is, and this arm is the control that says so.
        '<safe-area-view id="case-sav" accessibilityLabel="stat"></safe-area-view>',
      ].join('\n'),
      9_825,
    );

    // Read every arm before asserting, so a break names ALL the spellings it broke rather than
    // stopping at the first — the pressable arms are the ones a view-only fix would leave behind.
    const arms = [
      'case-view',
      'case-view-dyn',
      'case-press',
      'case-press-dyn',
      'case-sav',
    ];
    const canonical: Record<string, unknown> = {};
    const lowercased: Record<string, unknown> = {};
    for (const arm of arms) {
      const props = committedProps(arm);
      canonical[arm] = props.accessibilityLabel;
      lowercased[arm] = props.accessibilitylabel;
    }

    expect(canonical, JSON.stringify(canonical)).toEqual({
      'case-view': 'stat',
      'case-view-dyn': 'dyn',
      'case-press': 'stat',
      'case-press-dyn': 'dyn',
      'case-sav': 'stat',
    });
    expect(lowercased, 'no arm kept the compiler spelling').toEqual({
      'case-view': undefined,
      'case-view-dyn': undefined,
      'case-press': undefined,
      'case-press-dyn': undefined,
      'case-sav': undefined,
    });

    unmount(9_825);
    await settle();
  });

  // A hyphenated tag is a custom element to the compiler, which hands every prop on as
  // `String(value)` or assigns it to a plain property, so scalars and objects must survive
  it('keeps a scalar a scalar and commits an object, on a custom-element tag', async () => {
    await mountSource(
      [
        '<script>',
        '  const slop = { top: 4 };',
        '</script>',
        '<text-input id="ce" maxLength={5} editable={false} hitSlop={slop}></text-input>',
      ].join('\n'),
      9_826,
    );

    const props = committedProps('ce');
    expect(props.maxLength, 'a number, not "5"').toBe(5);
    expect(props.editable, 'a boolean, not "false"').toBe(false);
    expect(props.hitSlop, 'an object survives at all').toEqual({ top: 4 });

    unmount(9_826);
    await settle();
  });
});

describe('a callback prop a behavior reads off node.props', () => {
  // why: Svelte turns EVERY `on<Name>` attribute into `$.event()`, so `onValueChange` — which
  // `behaviors/{switch,text-input}.ts` read as `node.props.onValueChange`, never as a listener —
  // reached `addEventListener` and was stashed under `valueChange`, a name nothing dispatches to.
  // The toggle moved natively and the app's callback never ran, with nothing red. Only `routeProp`
  // knows which `on*` names the node's ViewConfig declares as events, so the handler has to go
  // through the same bag every other attribute does.
  it('reaches node.props rather than the listener stash', async () => {
    await mountSource(
      [
        '<script>',
        '  const onValueChange = () => {};',
        '</script>',
        '<switch id="cb" onValueChange={onValueChange} value={false}></switch>',
      ].join('\n'),
      9_827,
    );

    const node = engineNodeFor('cb');
    expect(
      typeof propOf(node, 'onValueChange') === 'function',
      'the behavior reads this key off the node, not the listener stash',
    ).toBe(true);

    // The control: a name the ViewConfig DOES declare still becomes a listener, so this is not a
    // fix that sends every handler to the props bag.
    const listeners = node.listeners;
    expect(listeners instanceof Map && listeners.has('valueChange')).toBe(
      false,
    );

    unmount(9_827);
    await settle();
  });

  // why: the case above proves ROUTING; this proves it's actually CALLABLE. `target_handler`
  // (Svelte's listener wrapper) always calls with ONE real-object argument and mutates it — a
  // two-argument `(text, event)` callback crashes; `text`/`value` ride the event as a FIELD.

  // `onPress`/`onFocus`/responder callbacks never had this problem — their sole argument already
  // IS the event object.
  it('calls the app fn through the compiled wrapper, text carried on the event', async () => {
    const received: unknown[] = [];
    Object.assign(globalThis, {
      __onValueChangeProbe: (next: unknown) => received.push(next),
    });
    await mountSource(
      [
        '<script>',
        '  const onValueChange = (event) => globalThis.__onValueChangeProbe(event.text);',
        '</script>',
        '<text-input id="typed" value="" onValueChange={onValueChange}></text-input>',
      ].join('\n'),
      9_828,
    );

    const node = engineNodeFor('typed');
    expect(() =>
      fabric.fireEvent(node, 'topChange', { text: 'ab', eventCount: 1 }),
    ).not.toThrow();
    expect(received).toEqual(['ab']);

    unmount(9_828);
    await settle();
  });

  it('calls the app fn through the compiled wrapper for a switch toggle', async () => {
    const received: unknown[] = [];
    Object.assign(globalThis, {
      __onSwitchValueChangeProbe: (next: unknown) => received.push(next),
    });
    await mountSource(
      [
        '<script>',
        '  const onValueChange = (event) => globalThis.__onSwitchValueChangeProbe(event.value);',
        '</script>',
        '<switch id="toggled" value={false} onValueChange={onValueChange}></switch>',
      ].join('\n'),
      9_829,
    );

    const node = engineNodeFor('toggled');
    expect(() =>
      fabric.fireEvent(node, 'topChange', { value: true }),
    ).not.toThrow();
    expect(received).toEqual([true]);

    unmount(9_829);
    await settle();
  });
});
