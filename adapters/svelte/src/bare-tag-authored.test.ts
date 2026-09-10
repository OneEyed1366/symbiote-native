// An app-authored bare tag, compiled by the REAL Svelte compiler with the lowering preprocessor
// OUT of the pipeline, mounted, and read off the committed Fabric tree.
//
// `bare-tag-parity.test.ts` compares the wrapper against the `p={{…}}` bag the transform builds,
// and `dom-shim/bare-tag-props.test.ts` drives `ShimElement` by hand. Neither answers the question
// that decides whether the transform can be deleted: does ordinary per-attribute markup —
// `<view testID="x" style={s} class="card" onPress={fn}>` — survive Svelte's own codegen.
//
// It does not take one path. Measured against svelte@5.56.8 with the shipping options
// (`{fragments:'tree', css:'external', generate:'client'}`), an attribute reaches the shim through
// four helpers, and WHICH one is decided by the tag NAME — because `view`, `text`, `image` and
// `switch` are real SVG element names and svelte's analyser puts them in the SVG namespace, while
// `pressable` and `modal` stay in html and the hyphenated tags are custom elements:
//
//                       view/text/image/switch    pressable, modal      text-input, …
//   static string       template -> setAttribute, name LOWERCASED       set_custom_element_data
//   dynamic value       set_attribute             set_attribute         set_custom_element_data
//                       name KEPT, value raw      name LOWERCASED       -> String(value)
//   class={…}           set_class, is_html 0      set_class, is_html 1  set_class, is_html 1
//                       -> setAttribute           -> dom.className      -> dom.className
//   style={…}           set_style -> cssText (stringified) + a private Symbol (the real value)
//   on<Name>={fn}       $.event('<Name>') -> addEventListener
//
// All four the shim now answers, and the last two were recorded here as unfixable until
// 2026-09-07. The lowercased NAMES and the stringified VALUES are settled by the compiler before
// any code of ours runs, but neither is beyond repair from below: a lowercased name is recovered
// through `dom-shim/canonical-prop-names.ts`, and a stringified value never happens once
// `get_setters` finds a real prototype setter — which it does only because `customElements.get()`
// returns something truthy. See those two files for the mechanism; the last two `it`s below are
// what pin it.
import { afterAll, describe, expect, it } from 'vitest';
import { compile } from 'svelte/compiler';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Component } from 'svelte';
import { installFabric } from '@symbiote-native/test-utils';
import { registerRules } from '@symbiote-native/engine';
import './register';
import { mount, unmount } from './render';

if (globalThis.window === undefined)
  Object.assign(globalThis, { window: globalThis });
if (globalThis.navigator === undefined)
  Object.assign(globalThis, { navigator: { product: 'ReactNative' } });

const fabric = installFabric();

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

// Every arm labels its node with `id`, which the primitive fold turns into `nativeID`, rather than
// with `testID`. On a tag whose name is not also an SVG element the compiler lowercases even a
// DYNAMIC attribute name, so `testID` arrives as `testid` and a testID-keyed locator silently finds
// nothing — a missing node reads as a broken fix. `id` is already lowercase everywhere.
function findByLabel(
  nodes: readonly unknown[],
  label: string,
): Record<string, unknown> | undefined {
  for (const node of nodes) {
    if (!isRecord(node)) continue;
    const props = node.props;
    if (isRecord(props) && props.nativeID === label) return props;
    const children = node.children;
    if (Array.isArray(children)) {
      const hit = findByLabel(children, label);
      if (hit !== undefined) return hit;
    }
  }
  return undefined;
}

/** The committed props of the labelled node. */
function committedProps(label: string): Record<string, unknown> {
  const hit = findByLabel(fabric.appRoot().children, label);
  if (hit === undefined) throw new Error(`no committed node labelled ${label}`);
  return hit;
}

/** The ENGINE node behind it — where a listener lands, which no payload shows. */
function engineNodeFor(label: string): Record<string, unknown> {
  const found = fabric.find(node => {
    const handle = node.instanceHandle;
    return isRecord(handle) && isRecord(handle.props)
      ? handle.props.nativeID === label
      : false;
  });
  const handle = found?.instanceHandle;
  if (!isRecord(handle)) throw new Error(`no engine node labelled ${label}`);
  return handle;
}

/** Compile a real `.svelte` source with NO lowering preprocessor, mount it, settle. */
async function mountSource(source: string, rootTag: number): Promise<void> {
  writeFileSync(
    PROBE_OUT,
    compile(source, { ...COMPILE_OPTIONS, filename: 'Authored.svelte' }).js
      .code,
  );
  // Node caches a dynamic import by resolved path, so each arm needs a fresh query string or it
  // silently re-runs the previous arm's module (svelte-adapter-dom-shim §15).
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
    // The DOM would coerce this to "3". `set_attribute` hands a non-string straight through for a
    // name with no prototype setter, and the shim must not coerce it either.
    expect(props.numberOfLines).toBe(3);

    unmount(9_820);
    await settle();
  });

  // why: `from_tree` builds each template ONCE, writes its static attributes onto that master and
  // then clones per instance. A clone that copies only the inert attribute Map commits nothing —
  // and every attribute an app spells as a literal string is a static attribute. Finding the node
  // at all is half the assertion: the label itself is a static `id` that had to be replayed AND
  // folded to `nativeID`.
  it('replays the static attributes the template baked in', async () => {
    await mountSource(
      '<view id="static" accessible="true" pointerEvents="box-none"></view>',
      9_821,
    );

    const props = committedProps('static');
    expect(props.accessible).toBe('true');
    // The compiler lowercased this name before the shim saw it; `canonical-prop-names.ts` is what
    // puts it back. Source and expectation were both `pointerevents` while that was unfixable —
    // an author cannot spell it in a way that survives, so the lowercase spelling is not a
    // separate case to preserve, it is the ONLY thing the shim ever receives.
    expect(props.pointerEvents).toBe('box-none');
    expect(props, 'the fold consumed the raw key').not.toHaveProperty('id');

    unmount(9_821);
    await settle();
  });

  // why: `set_class` takes TWO exits and NEITHER the tag nor the author picks which. It is the
  // element's compiled NAMESPACE: anything under a `<view>` root inherits SVG and is passed
  // `is_html: 0` -> `setAttribute('class', …)`, which was already routed; the same two tags written
  // as siblings of a fragment are html, get `is_html: 1`, and are assigned to `dom.className` —
  // a plain JS property without a setter, so nothing routes and nothing is red. Hence the two
  // shapes below rather than two tag names: a fix for either exit alone leaves half of a real
  // app's markup silently unstyled.
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

  // why: `set_style` STRINGIFIES — `to_style(value)` is `String(value)`, so an RN style object
  // reaches `dom.style.cssText` as "[object Object]" and the only surviving copy is the private
  // Symbol it caches one line later. See `dom-shim/style-cache.ts`.
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

  // why: two independent failures in one line of markup. `$.event()` ends its teardown check with
  // a BARE `dom instanceof HTMLMediaElement`, which throws ReferenceError on an undeclared global
  // and took the whole mount with it; and it passes the authored name minus `on`, so `onPress`
  // arrives as `Press` — a listener the engine dispatches nothing to.
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

  // why: the compiler lowercases an attribute NAME in two of the three spellings, and which two
  // depends on the tag — so a fix verified on `view` alone certifies nothing about `pressable`.
  // `accessibilityLabel` is the oracle rather than `testID` because it is a name Fabric declares
  // and the shim does not otherwise touch: a lowercased key reaches the payload, changes nothing
  // on device, and is red nowhere.
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

  // why: a hyphenated tag is a CUSTOM ELEMENT to the compiler, so every prop goes through
  // `set_custom_element_data` — which keeps the name and destroys the value instead. A scalar is
  // handed on as `String(value)` and an object is assigned to a plain JS property nothing reads,
  // unless `get_setters` finds a real prototype setter for that exact name.
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
    const props = node.props;
    expect(
      isRecord(props) && typeof props.onValueChange === 'function',
      'the behavior reads this key off node.props',
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

  // why: the case above proves ROUTING — the handler lands on `node.props.onValueChange` rather
  // than in the listener stash. This proves it is actually CALLABLE from a native event.
  // `target_handler` (Svelte's own listener wrapper — `$.event()` calls `create_event`, which
  // builds `target_handler` and passes THAT to `dom.addEventListener`, never the app's raw closure;
  // `svelte-shim-element-global-must-be-an-ancestor.md`, "the fifth door") ALWAYS calls with exactly
  // one argument, a real object, and mutates it internally
  // (`Object.defineProperty(event, 'currentTarget', …)`, then `event[event_symbol] = …`). A
  // two-argument `(text, event)` callback used to crash the moment `text` — a bare string — landed
  // in that sole argument slot. `callValueChange` (`core/components/src/behaviors/text-input.ts`)
  // now calls `listener(event)` with `text` (or `value`, for Switch) carried as a FIELD on that same
  // real object, which survives both of `target_handler`'s mutation attempts. Device-reproduced
  // crash fixed 2026-09-10.
  //
  // `onPress`/`onFocus`/responder callbacks never had this problem — their sole argument already IS
  // the event object, so `target_handler(event)` merely reroutes the call through Svelte's own
  // dispatch before invoking the real handler.
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
