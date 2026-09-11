// Unit test for wave-1 component core logic (ImageBackground / InputAccessoryView / Modal).
// Exercises the shared render fns + Modal state machine alone; no adapter, no Fabric slot.
// Ported from the headless `wave1-core.smoke.ts`.
//
// No Negative group for the three render fns: each is a pure, total function over its typed
// props (no guard clause, nothing throws) — every scenario below is Positive. The Modal state
// machine (modalReducer/shouldRenderModal) is likewise total over its two action kinds.

import { describe, expect, it } from 'vitest';
import { flattenStyle } from '@symbiote-native/engine';
import type { IDescriptor, IDescriptorChild } from '../descriptor';
import { renderInputAccessoryView } from '../view/render-input-accessory-view';
import { renderModal } from '../view/render-modal';
import {
  createInitialModalState,
  modalReducer,
  shouldRenderModal,
} from '../state/modal';

function asDescriptor(child: IDescriptorChild | undefined): IDescriptor {
  if (child === undefined || typeof child === 'string')
    throw new Error('expected a descriptor child');
  return child;
}

// ImageBackground left this file with its render fn: it is a TAG now, and the composition it used
// to describe is built by the behavior. Its coverage moved to
// `behaviors/image-background.test.ts`, which asserts the COMMITTED tree rather than a descriptor.

describe('renderInputAccessoryView', () => {
  const style = { flex: 1 };
  const host = renderInputAccessoryView({
    nativeID: 'kbd-bar',
    backgroundColor: '#eee',
    style,
    passthrough: { testID: 'iav', accessibilityLabel: 'bar' },
  });

  it('hosts a input-accessory-view forwarding its props', () => {
    expect(host.type).toBe('input-accessory-view');
    expect(host.props.nativeID).toBe('kbd-bar');
    expect(host.props.backgroundColor).toBe('#eee');
    expect(host.props.style).toBe(style);
  });

  it('merges passthrough and injects no structural children (the adapter adds user children)', () => {
    expect(host.props.testID).toBe('iav');
    expect(host.props.accessibilityLabel).toBe('bar');
    expect(host.children).toHaveLength(0);
  });

  // ABSENT, not present-and-undefined, and the difference is load-bearing rather than tidy.
  // `nativeID` has an alias source: the wrapper leaves `id` in passthrough and the renderer renames
  // it, so a `nativeID: undefined` emitted here is written AFTER that rename and deletes it. The
  // keys were briefly made unconditional on the reasoning that `setProp` collapses undefined to
  // absent — true, and exactly what makes the write destructive instead of inert.
  it('omits nativeID and backgroundColor when undefined', () => {
    const bare = renderInputAccessoryView({ passthrough: {} });
    expect('nativeID' in bare.props).toBe(false);
    expect('backgroundColor' in bare.props).toBe(false);
  });
});

describe('renderModal', () => {
  it('builds a modal host with the default attributes', () => {
    const root = renderModal({
      visible: true,
      passthrough: { testID: 'm', onShow: () => {} },
    });
    expect(root.type).toBe('modal');
    expect(flattenStyle(root.props.style).position).toBe('absolute');
    expect(root.props.animationType).toBe('none');
    expect(root.props.presentationStyle).toBe('fullScreen');
    expect(root.props.visible).toBe(true);
    expect(root.props.testID).toBe('m');
    expect(typeof root.props.onShow).toBe('function');
  });

  it('nests a single collapsable:false container with an opaque white backdrop', () => {
    const root = renderModal({ visible: true, passthrough: {} });
    const container = asDescriptor(root.children[0]);
    expect(root.children).toHaveLength(1);
    expect(container.type).toBe('view');
    expect(container.props.collapsable).toBe(false);
    const containerStyle = flattenStyle(container.props.style);
    expect(containerStyle.backgroundColor).toBe('white');
    expect(containerStyle.flex).toBe(1);
    expect(container.children).toHaveLength(0);
  });

  it('flips presentationStyle to overFullScreen and the backdrop to transparent when transparent', () => {
    const transparent = renderModal({
      visible: true,
      transparent: true,
      passthrough: {},
    });
    expect(transparent.props.presentationStyle).toBe('overFullScreen');
    const container = asDescriptor(transparent.children[0]);
    expect(flattenStyle(container.props.style).backgroundColor).toBe(
      'transparent',
    );
  });

  it('lets backdropColor override the container background', () => {
    const tinted = renderModal({
      visible: true,
      backdropColor: '#123456',
      passthrough: {},
    });
    const container = asDescriptor(tinted.children[0]);
    expect(flattenStyle(container.props.style).backgroundColor).toBe('#123456');
  });

  it('lets an explicit presentationStyle win over the transparent default', () => {
    const explicit = renderModal({
      visible: true,
      transparent: true,
      presentationStyle: 'pageSheet',
      passthrough: {},
    });
    expect(explicit.props.presentationStyle).toBe('pageSheet');
  });

  // why: 'none' is only the RN default — an explicit animationType must reach the host node
  // unchanged, or a caller could never opt into 'slide'/'fade'.
  it('forwards an explicit animationType over the none default', () => {
    const sliding = renderModal({
      visible: true,
      animationType: 'slide',
      passthrough: {},
    });
    expect(sliding.props.animationType).toBe('slide');
  });

  // why: RCTModalHostView is one node shared by iOS and Android; every platform-only prop
  // (supportedOrientations/allowSwipeDismissal on iOS, hardwareAccelerated/*Translucent on
  // Android) must reach it name-for-name, since core/components has no per-platform branch of
  // its own here — the native side is what ignores the props it doesn't own.
  it('name-forwards every iOS and Android platform prop onto the host node', () => {
    const root = renderModal({
      visible: true,
      supportedOrientations: ['portrait', 'landscape'],
      allowSwipeDismissal: true,
      hardwareAccelerated: true,
      statusBarTranslucent: true,
      navigationBarTranslucent: true,
      passthrough: {},
    });
    expect(root.props.supportedOrientations).toEqual(['portrait', 'landscape']);
    expect(root.props.allowSwipeDismissal).toBe(true);
    expect(root.props.hardwareAccelerated).toBe(true);
    expect(root.props.statusBarTranslucent).toBe(true);
    expect(root.props.navigationBarTranslucent).toBe(true);
  });
});

describe('modal keep-alive state machine', () => {
  it('seeds isRendered from the initial visibility', () => {
    expect(createInitialModalState(true).isRendered).toBe(true);
    expect(createInitialModalState(false).isRendered).toBe(false);
  });

  it('drops the keep-alive on hide and is identity-stable when already hidden', () => {
    const visible = createInitialModalState(true);
    const hidden = modalReducer(visible, { type: 'hide' });
    expect(hidden.isRendered).toBe(false);
    expect(modalReducer(hidden, { type: 'hide' })).toBe(hidden);
  });

  it('re-arms the keep-alive on show and is identity-stable when already shown', () => {
    const hidden = modalReducer(createInitialModalState(true), {
      type: 'hide',
    });
    const shown = modalReducer(hidden, { type: 'show' });
    expect(shown.isRendered).toBe(true);
    expect(modalReducer(shown, { type: 'show' })).toBe(shown);
  });

  it('gates rendering: hidden+not-rendered -> none, visible or keep-alive frame -> node', () => {
    expect(shouldRenderModal(false, { isRendered: false })).toBe(false);
    expect(shouldRenderModal(true, { isRendered: false })).toBe(true);
    expect(shouldRenderModal(false, { isRendered: true })).toBe(true);
    // The steady-state visible case: both inputs true is the ordinary "shown and still shown"
    // frame, not just a transitional exit-animation state.
    expect(shouldRenderModal(true, { isRendered: true })).toBe(true);
  });
});
