// Proves TouchableNativeFeedback: the pure static
// factories (SelectableBackground / Ripple), that the native ripple drawable lands on
// the underlying Pressable's committed node, that a press round-trips through that
// Pressable, and that a missing background defaults to SelectableBackground. Android-only
// feature; on iOS the native prop is inert but still committed (exactly what we assert).
//
// SCOPE: `backgroundProps`/`canUseNativeForeground`/the static factories (core/components'
// render-touchable-native-feedback.ts) have no unit test anywhere else in the repo — this
// integration test is their only coverage, not merely adapter-wiring proof. No Negative group:
// nothing here throws; a missing/invalid background just falls back to a default dict.
//
// KNOWN GAP (characterization, not fixed): `canUseNativeForeground()` reads Platform.OS, which
// headless vitest resolves to 'ios' (core/engine/src/platform/index.ts has no Metro to pick
// .android — see that file's comment). So `useForeground` can NEVER reach its `true` branch
// (nativeForegroundAndroid) in this suite; only the always-false-here fallback is reachable.
// The `useForeground` test below is intentionally a characterization of the FALLBACK branch, not
// a proof that the real Android/API23 foreground path works — that needs a real Android/detox run.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { View, TouchableNativeFeedback, mount, unmount } from '@symbiote-native/react';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';

const ROOT_TAG = 130;
const TOUCH_START = 'topTouchStart';
const TOUCH_END = 'topTouchEnd';

const fabric = installFabric();
beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// The responder is the Pressable's own RCTView, the first non-box-none RCTView created.
function responderHandle(): unknown {
  const view = fabric.find(n => n.viewName === 'RCTView' && n.props.pointerEvents !== 'box-none');
  if (!view) throw new Error('no RCTView (Pressable responder) was created');
  return view.instanceHandle;
}

// The feedback View carries the native ripple drawable.
function feedbackProps(): Record<string, unknown> {
  const node: IFakeNode | undefined = fabric.find(
    n =>
      n.props.nativeBackgroundAndroid !== undefined ||
      n.props.nativeForegroundAndroid !== undefined,
  );
  if (!node) throw new Error('no node carried a native background/foreground');
  return node.props;
}

describe('React TouchableNativeFeedback', () => {
  // why: callers reach these as `TouchableNativeFeedback.Ripple(...)` etc. (RN's own static-
  // method surface) to build the exact dict shape Android's native ripple manager expects —
  // wrong keys/values here mean a silently broken ripple on device, nothing throws to catch it.
  it('builds the right config dicts from the static factories', () => {
    const sel = TouchableNativeFeedback.SelectableBackground();
    expect(sel.type).toBe('ThemeAttrAndroid');
    expect(sel.attribute).toBe('selectableItemBackground');

    expect(TouchableNativeFeedback.SelectableBackground(12).rippleRadius).toBe(12);
    expect(TouchableNativeFeedback.SelectableBackgroundBorderless().attribute).toBe(
      'selectableItemBackgroundBorderless',
    );

    const ripple = TouchableNativeFeedback.Ripple('#fff', true);
    expect(ripple.type).toBe('RippleAndroid');
    expect(ripple.color).toBe('#fff');
    expect(ripple.borderless).toBe(true);
  });

  // why: the resolved background must actually reach the real committed native node under the
  // key Android's ReactViewManager reads (nativeBackgroundAndroid) — a config dict that never
  // lands on a real prop would build correctly and still do nothing on device.
  it('lands the ripple background on the committed node as nativeBackgroundAndroid', () => {
    mount(
      ROOT_TAG,
      <TouchableNativeFeedback background={TouchableNativeFeedback.Ripple('#00f', false)}>
        <View />
      </TouchableNativeFeedback>,
    );
    const props = feedbackProps();
    const bg = props.nativeBackgroundAndroid;
    expect(isRecord(bg) && bg.type === 'RippleAndroid' && bg.color === '#00f').toBe(true);
    // without useForeground the foreground prop must be absent.
    expect(props.nativeForegroundAndroid).toBeUndefined();
  });

  // why: TouchableNativeFeedback is built on Pressable for its press wiring (the ripple View is
  // purely decorative) — this proves the press synthesis path still works end-to-end through the
  // extra feedback View nesting, not just that the ripple prop exists.
  it('fires onPress through the underlying Pressable', () => {
    let presses = 0;
    mount(
      ROOT_TAG,
      <TouchableNativeFeedback
        onPress={() => {
          presses++;
        }}
      >
        <View />
      </TouchableNativeFeedback>,
    );
    const handle = responderHandle();
    fabric.fireEvent(handle, TOUCH_START);
    fabric.fireEvent(handle, TOUCH_END);
    expect(presses).toBe(1);
  });

  // why: RN never leaves a TouchableNativeFeedback with zero feedback — an unset `background`
  // must fall back to SelectableBackground() so the control always visibly reacts to touch.
  it('defaults a missing background to SelectableBackground', () => {
    mount(
      ROOT_TAG,
      <TouchableNativeFeedback>
        <View />
      </TouchableNativeFeedback>,
    );
    const bg = feedbackProps().nativeBackgroundAndroid;
    expect(isRecord(bg) && bg.attribute === 'selectableItemBackground').toBe(true);
  });

  // characterization [Platform.OS resolves to 'ios' headless — see file header]: useForeground
  // requests the foreground ripple slot, but on a platform where canUseNativeForeground() is
  // false it must fall back to the background slot rather than dropping the ripple entirely.
  // QUESTION: this only proves the fallback; the real Android/API23 foreground branch
  // (nativeForegroundAndroid actually being used) has no automated coverage anywhere in the repo.
  it('characterization: useForeground falls back to nativeBackgroundAndroid on this host', () => {
    mount(
      ROOT_TAG,
      <TouchableNativeFeedback useForeground background={TouchableNativeFeedback.Ripple('#0f0', false)}>
        <View />
      </TouchableNativeFeedback>,
    );
    const props = feedbackProps();
    expect(props.nativeForegroundAndroid).toBeUndefined();
    const bg = props.nativeBackgroundAndroid;
    expect(isRecord(bg) && bg.type === 'RippleAndroid' && bg.color === '#0f0').toBe(true);
  });

  // why: canUseNativeForeground() is exposed as a static so callers can branch their own UI on
  // it (RN does the same) — proves it is reachable as a real boolean, and matches the platform
  // gate this host resolves to (false, since Platform.OS is 'ios' headless).
  it('exposes canUseNativeForeground() reflecting this host\'s platform gate', () => {
    expect(TouchableNativeFeedback.canUseNativeForeground()).toBe(false);
  });
});
