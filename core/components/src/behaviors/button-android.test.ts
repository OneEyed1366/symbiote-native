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
// The Material palette and the selectable-background dict went with the cases that read them — they
// live beside the rule in `SymbioteFabricProps.cpp` and are asserted in `android-rules.android
// .itest.ts`, not restated here.

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
    // The label carries the app's title, uppercased: Android's `title.toUpperCase()` is applied in
    // JS at the slot redirect (`slotValueFor`), which is what this mocked `Platform.OS` steers.
    expect(label?.payload.text).toBe('SAVE');
    expect(node.childHost).toBeDefined();
  });

  // why: Button.js:352-353 — Android renders `title.toUpperCase()`, JavaScript's full-Unicode
  // uppercase, so a Cyrillic or German title uppercases too (ß -> SS).
  it('uppercases the title with full Unicode, as JS toUpperCase does', async () => {
    mountButton({ title: 'Сохранить straße' });
    await settle();

    expect(subtreeOf(TEST_ID).label?.payload.text).toBe('СОХРАНИТЬ STRASSE');
  });

  // The Material look (style, selectable background, `color` override, disabled greying, re-tint)
  // is asserted against the committed payload in `android-rules.android.itest.ts`, not here — this
  // file only mocks `Platform.OS`, which a C++ rule never reads.

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

  // `focusable` is `foldButtonProps` in C++ now; this harness carries no copy — see
  // `button-payload.itest.ts`. The owner's fold still binds behind `IS_ANDROID` here (view style
  // + ripple background); off Android it binds none.

  // why: Button's touchable swaps by platform (Button.js:281-284) — only touchable-opacity's own
  // fold renames `id`, so without an alias here Android's bare press machine leaves `id`
  // unrenamed and Fabric drops it as an undeclared key.
  it('folds `id` to `nativeID`, which no layer on this platform does for it', async () => {
    mountButton({ id: 'from-id', nativeID: 'losing' });
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
