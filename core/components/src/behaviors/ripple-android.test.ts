// The Android ripple on a `<pressable>`, which needs `Platform.OS === 'android'` to exist at all —
// `rippleProps` returns undefined anywhere else, so this cannot live in the iOS-default suite next
// door and is its own file with its own mock. Same shape as
// `adapters/react/src/modules/status-bar/status-bar-android.test.tsx`.
//
// WHAT IT IS PINNING. Our old Pressable WRAPPER painted the ripple through a dedicated inner View,
// mirroring TouchableNativeFeedback — and read literally that makes the ripple impossible on a
// single node with no child. RN's own `Pressable` does not do that: it spreads the ripple's
// `viewProps` onto its own View (`Pressable.js:251`), so the background is an ordinary prop of the
// responder. This asserts the tag takes RN's shape.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@symbiote-native/engine', async () => {
  const actual = await vi.importActual<
    typeof import('@symbiote-native/engine')
  >('@symbiote-native/engine');
  return { ...actual, Platform: { ...actual.Platform, OS: 'android' } };
});

const { createLiveTree, installRecordingFabric } =
  await import('../../../test-utils/src/index');
const { createElement, createSurface, routeProp } =
  await import('@symbiote-native/engine');
const { registerPressableBehavior, PRESSABLE_TAG } =
  await import('./pressable');
const { rippleProps } = await import('../state/pressable');

const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
registerPressableBehavior();

let nextRootTag = 9800;
const TEST_ID = 'subject';

function commitTag(
  props: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  // Every case opens its own surface, and `appRoot()`/`findLive` search the creation log — without
  // this a later case would match an earlier one's node.
  fabric.reset();
  const node = createElement('RCTView', false, PRESSABLE_TAG);
  routeProp(node, 'testID', TEST_ID);
  for (const [key, value] of Object.entries(props)) routeProp(node, key, value);
  const surface = createSurface((nextRootTag += 1));
  surface.appendChild(node);
  surface.commit();

  const found = live.findLive(
    live.appRoot(),
    candidate => candidate.payload.testID === TEST_ID,
  );
  if (found === undefined) throw new Error('the subject never reached Fabric');
  return found.payload;
}

describe('a pressable tag carries its own Android ripple', () => {
  // CONTROL, and it is not decorative: this whole file is a mock of one field, and if the mock
  // failed to apply, `rippleProps` would return undefined and every case below would pass by
  // asserting the absence of something that was never built. Pin that the platform really moved.
  it('runs on the Android platform branch', () => {
    expect(rippleProps({ color: '#fff' })).toBeDefined();
  });

  it('resolves the config onto the element itself, not a child', () => {
    const props = commitTag({
      android_ripple: { color: '#ff0000', borderless: true, radius: 12 },
    });

    expect(props.nativeBackgroundAndroid).toEqual({
      type: 'RippleAndroid',
      color: '#ff0000',
      borderless: true,
      rippleRadius: 12,
    });
  });

  it('honours foreground, which picks the other native prop', () => {
    const props = commitTag({
      android_ripple: { color: '#00ff00', foreground: true },
    });

    expect(props.nativeForegroundAndroid).toBeDefined();
    expect(Object.keys(props)).not.toContain('nativeBackgroundAndroid');
  });

  it('does not send the raw config, which is not a native prop', () => {
    const props = commitTag({ android_ripple: { color: '#fff' } });

    expect(Object.keys(props)).not.toContain('android_ripple');
  });
});
