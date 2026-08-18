// Solid twin of adapters/react/src/components/touchable-native-feedback/touchable-native-feedback.test.tsx.
// Drives REAL compiled Solid JSX through the universal renderer into the fake Fabric slot.
//
// SCOPE: the shared half (backgroundProps / canUseNativeForeground / the static factories in
// core/components' render-touchable-native-feedback.ts) has no unit test anywhere else in the
// repo, so this is its coverage too, not merely adapter wiring. No Negative group: nothing here
// throws — a missing background falls back to a default dict.
//
// Two cases have no React counterpart and are the point of this file. Solid runs a component body
// ONCE, so "the background changed after mount" is a silently-breakable claim here rather than
// something a reconciler makes true for free; and the press cycle's node-churn counter is the only
// headless trace of the rebuild-mid-gesture class of bug (.claude/rules/solid-descriptor-bridge.md
// §4 — the fake Fabric hands an event straight to the listener, so a lost responder grant is
// unreachable).
//
// KNOWN GAP (characterization, not fixed — same as React's file): canUseNativeForeground() reads
// Platform.OS, which headless vitest resolves to 'ios' (core/engine/src/platform/index.ts re-exports
// the iOS impl, whose OS is the literal 'ios'). So `useForeground` can NEVER reach its
// nativeForegroundAndroid branch here, and the key FLIP that withStableKeys exists for
// (nativeForegroundAndroid ⇄ nativeBackgroundAndroid) is unreachable headless too — its widening
// has no test in this file and needs a real Android run.

import { createSignal } from 'solid-js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { mount, unmount } from '../../render';
import { View } from '../view';
import {
  TouchableNativeFeedback,
  type INativeFeedbackBackground,
} from './index';

const ROOT_TAG = 8_311;
const TARGET = 'native-feedback';
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';

const fabric = installFabric();
const flush = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Reads the LIVE committed tree, never `fabric.created` — a created node's props are frozen at
// first commit, so anything asserted after an update has to come off the committed child set
// (symbiote-engine-core §8).
function committed(
  predicate: (node: IFakeNode) => boolean,
): IFakeNode | undefined {
  let found: IFakeNode | undefined;
  const walk = (nodes: IFakeNode[]): void => {
    for (const node of nodes) {
      if (found === undefined && predicate(node)) found = node;
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return found;
}

// The feedback view is the one carrying the native drawable.
function feedbackProps(): Record<string, unknown> {
  const node = committed(
    n =>
      n.props.nativeBackgroundAndroid !== undefined ||
      n.props.nativeForegroundAndroid !== undefined,
  );
  if (node === undefined)
    throw new Error('no node carried a native background/foreground');
  return node.props;
}

// The responder is the Pressable's own view, reached by the testID forwarded through it.
function responderHandle(): unknown {
  const node = fabric.find(n => n.props.testID === TARGET);
  if (node === undefined)
    throw new Error(`no node created with testID=${TARGET}`);
  return node.instanceHandle;
}

describe('Solid TouchableNativeFeedback', () => {
  // why: callers reach these as `TouchableNativeFeedback.Ripple(...)` (RN's own static surface) to
  // build the exact dict Android's ripple manager expects — wrong keys mean a silently broken
  // ripple on device, nothing throws to catch it.
  it('builds the right config dicts from the static factories', () => {
    const sel = TouchableNativeFeedback.SelectableBackground();
    expect(sel.type).toBe('ThemeAttrAndroid');
    expect(sel.attribute).toBe('selectableItemBackground');

    expect(TouchableNativeFeedback.SelectableBackground(12).rippleRadius).toBe(
      12,
    );
    expect(
      TouchableNativeFeedback.SelectableBackgroundBorderless().attribute,
    ).toBe('selectableItemBackgroundBorderless');

    const ripple = TouchableNativeFeedback.Ripple('#fff', true);
    expect(ripple.type).toBe('RippleAndroid');
    expect(ripple.color).toBe('#fff');
    expect(ripple.borderless).toBe(true);
  });

  // why: the resolved background must reach the real committed node under the key Android's
  // ReactViewManager reads — a dict that never lands on a prop builds fine and does nothing.
  it('lands the ripple background on the committed node as nativeBackgroundAndroid', async () => {
    mount(ROOT_TAG, () => (
      <TouchableNativeFeedback
        background={TouchableNativeFeedback.Ripple('#00f', false)}
      >
        <View />
      </TouchableNativeFeedback>
    ));
    await flush();

    const props = feedbackProps();
    const background = props.nativeBackgroundAndroid;
    expect(
      isRecord(background) &&
        background.type === 'RippleAndroid' &&
        background.color === '#00f',
    ).toBe(true);
    // Without useForeground the foreground slot must hold nothing.
    expect(props.nativeForegroundAndroid).toBeUndefined();
    // The child rides UNDER the feedback view — that nesting is the whole mechanism, the drawable
    // paints behind whatever it wraps.
    const feedback = committed(
      n => n.props.nativeBackgroundAndroid !== undefined,
    );
    expect(feedback?.children.length).toBe(1);
  });

  // why: RN never leaves a TouchableNativeFeedback with zero feedback — an unset `background`
  // falls back to SelectableBackground() so the control always visibly reacts to touch.
  it('defaults a missing background to SelectableBackground', async () => {
    mount(ROOT_TAG, () => (
      <TouchableNativeFeedback>
        <View />
      </TouchableNativeFeedback>
    ));
    await flush();

    const background = feedbackProps().nativeBackgroundAndroid;
    expect(
      isRecord(background) &&
        background.attribute === 'selectableItemBackground',
    ).toBe(true);
  });

  // why: the component is built on Pressable purely for the press wiring (the feedback view is
  // decorative) — this proves the press path still works end-to-end through the extra nesting.
  it('fires onPress through the underlying Pressable', async () => {
    let presses = 0;
    mount(ROOT_TAG, () => (
      <TouchableNativeFeedback
        testID={TARGET}
        onPress={() => {
          presses++;
        }}
      >
        <View />
      </TouchableNativeFeedback>
    ));
    await flush();

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(presses).toBe(1);
  });

  // SOLID-ONLY. why: the body runs ONCE, so a background read outside an accessor would freeze at
  // its mount-time value and the drawable would never follow the app's state. React and Vue
  // re-render the component and cannot express this bug.
  it('follows a background that changes after mount', async () => {
    const [background, setBackground] = createSignal<INativeFeedbackBackground>(
      TouchableNativeFeedback.Ripple('#00f', false),
    );
    mount(ROOT_TAG, () => (
      <TouchableNativeFeedback background={background()}>
        <View />
      </TouchableNativeFeedback>
    ));
    await flush();

    setBackground(TouchableNativeFeedback.Ripple('#f00', true, 9));
    await flush();

    const updated = feedbackProps().nativeBackgroundAndroid;
    expect(
      isRecord(updated) &&
        updated.color === '#f00' &&
        updated.borderless === true &&
        updated.rippleRadius === 9,
    ).toBe(true);
  });

  // SOLID-ONLY, and the only headless trace of the rebuild-mid-gesture class of bug: the fake
  // Fabric dispatches straight into the node's listener map, so there is no responder negotiation
  // to lose (.claude/rules/solid-descriptor-bridge.md §4). A press must re-prop, never re-create —
  // if the feedback view or the child subtree were rebuilt inside the touch handler, the counter
  // grows here and the grant dies on device.
  it('creates no node across a full press cycle', async () => {
    mount(ROOT_TAG, () => (
      <TouchableNativeFeedback testID={TARGET}>
        <View />
      </TouchableNativeFeedback>
    ));
    await flush();
    const createdAtMount = fabric.counts.createNode;

    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    await flush();
    expect(fabric.counts.createNode, 'press-in rebuilt a subtree').toBe(
      createdAtMount,
    );

    fabric.fireEvent(handle, TOUCH_END);
    await flush();
    expect(fabric.counts.createNode, 'release rebuilt a subtree').toBe(
      createdAtMount,
    );
  });

  // characterization [Platform.OS resolves to 'ios' headless — see the file header]: useForeground
  // requests the foreground slot, but where canUseNativeForeground() is false it must fall back to
  // the background slot rather than dropping the ripple entirely.
  // QUESTION: this proves only the fallback; the real Android/API 23 foreground branch has no
  // automated coverage anywhere in the repo.
  it('characterization: useForeground falls back to nativeBackgroundAndroid on this host', async () => {
    mount(ROOT_TAG, () => (
      <TouchableNativeFeedback
        useForeground
        background={TouchableNativeFeedback.Ripple('#0f0', false)}
      >
        <View />
      </TouchableNativeFeedback>
    ));
    await flush();

    const props = feedbackProps();
    expect(props.nativeForegroundAndroid).toBeUndefined();
    const background = props.nativeBackgroundAndroid;
    expect(
      isRecord(background) &&
        background.type === 'RippleAndroid' &&
        background.color === '#0f0',
    ).toBe(true);
  });

  // why: canUseNativeForeground() is exposed as a static so callers can branch their own UI on it
  // (RN does the same) — proves it is reachable and matches the gate this host resolves to.
  it("exposes canUseNativeForeground() reflecting this host's platform gate", () => {
    expect(TouchableNativeFeedback.canUseNativeForeground()).toBe(false);
  });
});
