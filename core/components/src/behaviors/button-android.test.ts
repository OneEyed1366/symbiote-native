// Button's Android half as a TAG, and the reason it needs its own file: RN swaps the TOUCHABLE on
// Android (Button.js:281-284), and the two do not have the same shape. TouchableOpacity wraps its
// child in an `<Animated.View>` (TouchableOpacity.js:302,344); TouchableNativeFeedback renders
// nothing at all and clones its props onto the child instead (TouchableNativeFeedback.js:339). So
// Android's Button is one node SHORTER than iOS's, paints a ripple instead of a fade, and drives
// that ripple with two view commands. None of that is observable off Android.
//
// The mock replaces `select` as well as `OS`, and that is load-bearing rather than thorough:
// `platform/index.ios.ts` hardcodes `if ('ios' in spec) return spec.ios`, so a mock supplying only
// `OS: 'android'` leaves `render-button`'s module-load styles on the iOS branch and this suite
// would pin a shape no Android build produces (`render-button-android.test.ts` says the same).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '../../../test-utils/src/index';

vi.mock('@symbiote-native/engine', async () => {
  const actual = await vi.importActual<
    typeof import('@symbiote-native/engine')
  >('@symbiote-native/engine');
  return {
    ...actual,
    Platform: {
      ...actual.Platform,
      OS: 'android',
      select: <T>(spec: {
        android?: T;
        ios?: T;
        native?: T;
        default?: T;
      }): T | undefined => {
        if ('android' in spec) return spec.android;
        if ('native' in spec) return spec.native;
        return spec.default;
      },
    },
  };
});

const { clearHostBehaviors, createElement, createSurface, routeProp } =
  await import('@symbiote-native/engine');
type IListener = import('@symbiote-native/engine').IListener;
type ISymbioteEvent = import('@symbiote-native/engine').ISymbioteEvent;
type ISymbioteNode = import('@symbiote-native/engine').ISymbioteNode;
const { registerButtonBehavior, BUTTON_TAG } = await import('./button');
const { foldHostBag } = await import('../fold-host-bag');

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
let nextRootTag = 7400;

// The composed fade reads requestAnimationFrame off the host at call time and Node has none. Kept
// even though this platform runs no fade: the shim is what makes a REGRESSION here (the iOS
// touchable composed by mistake) fail on its assertion rather than on a missing global.
const frameTimers = new Map<number, ReturnType<typeof setTimeout>>();
let nextFrameId = 1;
Object.assign(globalThis, {
  requestAnimationFrame(callback: () => void): number {
    const id = nextFrameId++;
    const timer = setTimeout(() => {
      frameTimers.delete(id);
      callback();
    }, 16);
    frameTimers.set(id, timer);
    return id;
  },
  cancelAnimationFrame(id: number): void {
    const timer = frameTimers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    frameTimers.delete(id);
  },
});

const BUTTON_VIEW_NAME = 'RCTView';
const TEST_ID = 'subject';
const ANDROID_BLUE = '#2196F3';
const ANDROID_DISABLED_BACKGROUND = '#dfdfdf';
// TouchableNativeFeedback.js:343-348 — Button passes no `background`, so TNF resolves
// `SelectableBackground()` onto the background slot.
const SELECTABLE_BACKGROUND = {
  type: 'ThemeAttrAndroid',
  attribute: 'selectableItemBackground',
  rippleRadius: undefined,
};

function touchAt(x: number, y: number): ISymbioteEvent {
  // `pageX/pageY` drive the retention test, `locationX/locationY` the hotspot — RN reads the
  // second pair and defaults each to 0 (TouchableNativeFeedback.js:280).
  return { nativeEvent: { pageX: x, pageY: y, locationX: x, locationY: y } };
}

function mountButton(props: Readonly<Record<string, unknown>> = {}) {
  const node = createElement(BUTTON_VIEW_NAME, false, BUTTON_TAG);
  routeProp(node, 'testID', TEST_ID);
  routeProp(node, 'title', 'Save');
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();
  return { node, surface };
}

function listenerOf(node: ISymbioteNode, name: string): IListener {
  const listener = node.listeners?.get(name);
  if (listener === undefined)
    throw new Error(`no "${name}" listener — the behavior did not attach`);
  return listener;
}

// The LIVE tree, over the recording host — `appRoot()` searches the CREATION log, so `fabric.reset()`
// runs per case (`beforeEach` below).
//
// THREE NODES, and every hop is asserted: the host IS the styled button view here, so a text node
// found under an intermediate RCTView would mean the iOS shape leaked onto Android.
function subtreeOf(testID: string): {
  host: ILiveNode;
  text: ILiveNode;
  label: ILiveNode | undefined;
} {
  const host = live.findLive(
    live.appRoot(),
    node => node.payload.testID === testID,
  );
  if (host === undefined) throw new Error(`no committed node testID=${testID}`);
  expect(host.viewName).toBe('RCTView');
  expect(host.children).toHaveLength(1);
  const text = host.children[0];
  expect(text.viewName).toBe('RCTText');
  const label = text.children[0];
  if (label !== undefined) expect(label.viewName).toBe('RCTRawText');
  return { host, text, label };
}

function countNodes(node: ILiveNode): number {
  return 1 + node.children.reduce((sum, kid) => sum + countNodes(kid), 0);
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(400);
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
  fabric.reset();
  registerButtonBehavior();
});

afterEach(() => {
  clearHostBehaviors();
  vi.useRealTimers();
});

describe('button host behavior on Android', () => {
  // THE HEADLINE CLAIM. RN's Android Button commits ONE FEWER NODE than its iOS Button, because
  // TNF clones onto Button's own view instead of wrapping it. Counted rather than eyeballed: the
  // hop assertions in `subtreeOf` prove the SHAPE, this proves nothing extra is hiding beside it.
  it('commits RN’s three-node Android subtree, not iOS’s four', async () => {
    const { node } = mountButton();
    await settle();

    const { host, label } = subtreeOf(TEST_ID);
    expect(countNodes(host)).toBe(3);
    // The label still carries the app's title — WHERE it lands is this case's subject, and that is
    // the hop `subtreeOf` proves. The UPPERCASING left on 2026-09-18: it is `foldButtonLabel` in
    // `SymbioteFabricProps.cpp`, behind `#ifdef ANDROID`, and this suite runs against neither an
    // Android build nor the C++ payload builder — it mocks `Platform.OS`, which the rule no longer
    // reads. Asserting 'SAVE' here would now be asserting a mock of nothing.
    //
    // NOT REPLACED, and that is the honest state: the identity branch is pinned in
    // `core/engine/cpp/tests/js/button-derived-payload.itest.ts`, the Android branch is pinned
    // NOWHERE, exactly like `android_ripple` and `decelerationRate`'s constants. A compile-time
    // branch needs a build that compiles it.
    expect(label?.payload.text).toBe('Save');
    expect(node.childHost).toBeDefined();
  });

  it('paints the Material look on the HOST, which is the cloned button view', async () => {
    mountButton();
    await settle();

    const { host } = subtreeOf(TEST_ID);
    // On iOS this lives one node down and is `{}`; here the host IS `<View style={buttonStyles}>`.
    expect(host.payload.backgroundColor).toBe(ANDROID_BLUE);
    expect(host.payload.elevation).toBe(4);
    expect(host.payload.borderRadius).toBe(2);
    // The LABEL's white left on 2026-09-18 with the rest of its style — `foldButtonLabelStyle` in
    // `SymbioteFabricProps.cpp`, whose Android branch is `#ifdef ANDROID` and therefore pinned
    // nowhere headless. This file mocks `Platform.OS`, which that rule does not read.
  });

  it('carries the selectable-background ripple and runs no opacity fade', async () => {
    mountButton();
    await settle();

    const { host } = subtreeOf(TEST_ID);
    expect(host.payload.nativeBackgroundAndroid).toEqual(SELECTABLE_BACKGROUND);
    // `useForeground` is not a Button prop, so the foreground slot is never the one TNF picks.
    expect(Object.keys(host.payload)).not.toContain('nativeForegroundAndroid');
    // `collapsable`, not `opacity`, and the difference was measured rather than assumed. Binding an
    // Animated value is what forces `collapsable: false` (touchable-opacity.ts's `attach`), and
    // that key survives; the fade's `opacity` does NOT reach the payload here at all, because the
    // Material fold below overwrites the whole style slot. So an `opacity` assertion would pass
    // under a composed TouchableOpacity and prove nothing.
    expect(Object.keys(host.payload)).not.toContain('collapsable');
  });

  // The Android half of the colour pair. Here `color` tints the BUTTON and leaves the label white;
  // `button.test.ts` asserts the mirror, where it tints the label and leaves the view at its
  // constant `{}`. Two platforms, two different nodes, one owner prop.
  it('re-tints the host when color changes after mount', async () => {
    const { surface, node } = mountButton();
    await settle();
    expect(subtreeOf(TEST_ID).host.payload.backgroundColor).toBe(ANDROID_BLUE);

    routeProp(node, 'color', '#ff0000');
    surface.commit();
    await settle();

    const after = subtreeOf(TEST_ID);
    expect(after.host.payload.backgroundColor).toBe('#ff0000');
    // The label's half of this pair — that it keeps Android's own white rather than picking up the
    // tint — was the half a one-hop mark would have lost, and it is `foldButtonLabelStyle`'s now.
    // Its iOS twin is asserted on the committed payload in
    // `core/engine/cpp/tests/js/button-derived-payload.itest.ts`; the Android branch is not.
    // That the raw `color` is absent from the HOST is the engine's strip (`foldButtonProps`), which
    // this host's TypeScript `fabricProps` does not carry — asserted in
    // `core/engine/cpp/tests/js/button-payload.itest.ts`. The re-tint above is the question here,
    // and it is the one that proves the strip reaches the payload without touching the node.
  });

  it('greys both nodes when disabled changes after mount', async () => {
    const { surface, node } = mountButton();
    await settle();

    routeProp(node, 'disabled', true);
    surface.commit();
    await settle();

    const after = subtreeOf(TEST_ID);
    expect(after.host.payload.backgroundColor).toBe(
      ANDROID_DISABLED_BACKGROUND,
    );
    expect(after.host.payload.elevation).toBe(0);
    // The label's grey is `foldButtonLabelStyle`'s, Android branch, and unreachable here.
  });

  // TouchableNativeFeedback.js:230-252. Without these the drawable is installed and never animates:
  // the JS responder consumes the touch, so Android's own pressed-state handling never fires and
  // the button looks dead while every callback runs.
  it('drives the ripple with hotspotUpdate and setPressed on the right beats', async () => {
    const onPress = vi.fn();
    const { node } = mountButton({ onPress });
    await settle();
    const host = subtreeOf(TEST_ID).host;
    fabric.commands.length = 0;

    // NO `settle()` anywhere inside the gesture, and that is the assertion about
    // `minPressDuration: 0` (TouchableNativeFeedback.js:226). The press machine's 130 ms
    // deactivation floor defers `onPressOut`, so with the floor left in place the release below
    // dispatches NOTHING synchronously and the ripple stays lit after the finger is gone — while a
    // test that advanced its timers first would see the command anyway and pass.
    listenerOf(node, 'pressIn')(touchAt(12, 34));
    listenerOf(node, 'startShouldSetResponder')(touchAt(12, 34));
    // RN's order inside onPressIn: hotspot first, so the ripple starts under the finger.
    expect(fabric.commands.map(c => c.commandName)).toEqual([
      'hotspotUpdate',
      'setPressed',
    ]);
    expect(fabric.commands[0].args).toEqual([12, 34]);
    expect(fabric.commands[0].handle).toBe(host.handle);
    expect(fabric.commands[1].args).toEqual([true]);

    fabric.commands.length = 0;
    listenerOf(node, 'responderMove')(touchAt(13, 35));
    // Move sends the hotspot and nothing else — the view is already pressed.
    expect(fabric.commands.map(c => c.commandName)).toEqual(['hotspotUpdate']);
    expect(fabric.commands[0].args).toEqual([13, 35]);

    fabric.commands.length = 0;
    listenerOf(node, 'press')(touchAt(12, 34));
    listenerOf(node, 'pressOut')(touchAt(12, 34));
    expect(fabric.commands.map(c => c.commandName)).toEqual(['setPressed']);
    expect(fabric.commands[0].args).toEqual([false]);
    expect(onPress).toHaveBeenCalledTimes(1);
    await settle();
  });

  // `focusable` LEFT ON 2026-09-18 — `foldButtonProps` in `SymbioteFabricProps.cpp` — and this
  // harness carries no copy of the tag rules. The pair is the `whether a button is a focus stop`
  // block in `core/engine/cpp/tests/js/button-payload.itest.ts`.
  //
  // THE OWNER'S FOLD SURVIVES ON THIS PLATFORM AND ONLY THIS ONE, which is the part worth keeping
  // here rather than only in the iOS twin: Android still needs the view style and the ripple
  // background, so `buildStructure` binds a fold behind `IS_ANDROID`. Off Android it binds none at
  // all. The cases below are what hold that half.

  // why: THE arm that made `HOST_PRIMITIVES.Button.aliases` necessary rather than inherited.
  //
  // Button's touchable is swapped by platform (Button.js:281-284), and only ONE of the two arms
  // renames `id` itself: `touchable-opacity`'s own `foldPayload` does, the bare press machine this
  // platform composes does not (`Pressable`'s spec entry does it for that tag instead). Measured
  // with no entry, on the committed payload:
  //
  //   iOS      nativeID: 'from-id'   id: absent      the touchable-opacity fold
  //   Android  nativeID: undefined   id: 'from-id'   a key no ViewConfig declares -> dropped
  //
  // So the alias is what makes the two platforms agree, and the iOS twin of this test passes with
  // NO entry at all — which is exactly why declining the entry looked free.
  //
  // ONE arm, unlike the iOS twin's two. There the raw bag is a legitimate second path (the
  // touchable folds it itself, so the two compose and both must give one answer); here nothing
  // folds a raw bag, and every adapter delivers a folded one — React, Angular and Svelte through
  // `foldHostBag`, Vue and Solid through their renderers' own alias step.
  it('folds `id` to `nativeID`, which no layer on this platform does for it', async () => {
    mountButton(foldHostBag(BUTTON_TAG, { id: 'from-id', nativeID: 'losing' }));
    await settle();

    const { host } = subtreeOf(TEST_ID);
    // RN gives `id` unconditional priority over `nativeID` (View.js:77-79).
    expect(host.payload.nativeID).toBe('from-id');
    // A raw `id` is a key no ViewConfig declares, so Fabric drops it and the label is lost with
    // nothing red — the strip is only ever visible here.
    expect(host.payload.id).toBeUndefined();
  });

  // The control. Without a registration the tag is a bare view: no subtree, no ripple, no
  // listener — so every assertion above is answering the behavior and not an engine default.
  it('builds nothing when the behavior is not registered', async () => {
    clearHostBehaviors();
    const { node } = mountButton();
    await settle();

    const host = live.findLive(
      live.appRoot(),
      n => n.payload.testID === TEST_ID,
    );
    expect(host?.children).toHaveLength(0);
    expect(host?.payload.nativeBackgroundAndroid).toBeUndefined();
    expect(node.listeners?.get('pressIn')).toBeUndefined();
  });
});
