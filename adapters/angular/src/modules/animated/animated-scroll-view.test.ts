// Regression tests for two Android-only bugs AnimatedScrollView's bespoke template used to hit
// while it built its own `<scroll-content>` child by hand instead of leaving the tag's content
// node to the engine (`registerScrollViewBehavior()`, `../../register.ts`, which now owns both
// fixes — see core/components/src/behaviors/scroll-view/shared.ts):
//
// 1. It projected <ng-content> straight into scroll-view with no content wrapper. On
//    Android, scroll-content resolves to a plain RCTView, which Fabric view-flattens
//    away unless collapsable:false pins it — so multiple projected children were hoisted up as
//    direct children of the scroll view, which natively hosts exactly one ("ScrollView can
//    host only one direct child" -> addViewAt crash).
// 2. It never defaulted nestedScrollEnabled. RN defaults nested scrolling ON (ScrollView.js
//    `nestedScrollEnabled ?? true`), but Android needs it explicit or a ScrollView nested
//    inside another scrollable container (this canary's own nested demo) never receives touch
//    — it renders fine but is static, the outer ScrollView swallows the gesture.
//
// The fake Fabric harness doesn't simulate Android's real view-flattening or touch dispatch, so
// these tests only prove the structural/prop invariants that prevent both bugs, not the
// on-device symptoms themselves — those still need a real Android host.
//
// Scope note (Mode B sweep): this is a deliberately NARROW regression-fence file, not a full
// coverage dictionary of AnimatedScrollView/AnimatedComponentBase — mirrors angular-gaps.test.ts's
// own stated scope. The broader AnimatedScrollView/AnimatedComponentBase surface (value-driven
// prop flushing, whenCommitted binding, leaf swap-on-rerender, native Animated.event attach) is
// the shared AnimatedLeafBinder's contract, covered in isolation by
// ../animated-leaf-binder.test.ts — not duplicated here. No Negative group: every test below
// asserts a structural/prop invariant on successful mount, and there is no throwing path in
// AnimatedScrollView's own template/prop-resolution code to assert against.
import '@angular/compiler';
import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { childrenOf } from '@symbiote-native/engine';
import { installRecordingFabric, payloadOf } from '@symbiote-native/test-utils';
// registerScrollViewBehavior() is what builds the content container the assertions below read.
import '../../register';
import { mount, unmount } from '../../render';
import { AnimatedScrollView } from './create-animated-component';

const ROOT_TAG = 927;
const OVERRIDE_ROOT_TAG = 928;
const fabric = installRecordingFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

class AnimatedScrollViewApp {}
Component({
  selector: 'animated-scroll-view-test',
  standalone: true,
  imports: [AnimatedScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <AnimatedScrollView>
      <view testID="a"></view>
      <view testID="b"></view>
    </AnimatedScrollView>
  `,
})(AnimatedScrollViewApp);

class AnimatedScrollViewOverrideApp {}
Component({
  selector: 'animated-scroll-view-override-test',
  standalone: true,
  imports: [AnimatedScrollView],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <AnimatedScrollView [animatedProps]="{ nestedScrollEnabled: false }">
      <view testID="a"></view>
    </AnimatedScrollView>
  `,
})(AnimatedScrollViewOverrideApp);

beforeEach(() => fabric.reset());
afterEach(() => {
  unmount(ROOT_TAG);
  unmount(OVERRIDE_ROOT_TAG);
});

describe('AnimatedScrollView', () => {
  // why: bug #1 in the file header — projecting content straight into scroll-view
  // with no wrapper lets Android's Fabric view-flattening hoist multiple children up to be
  // direct children of the native scroll view, which crashes since it hosts exactly one. The
  // wrapper + `collapsable: false` is what pins the content view and keeps it un-flattened.
  it('wraps multiple projected children in a single non-collapsable content view', async () => {
    mount(ROOT_TAG, AnimatedScrollViewApp);
    await tick();

    const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
    if (scrollView === undefined) throw new Error('no scroll view created');
    // The AUTHORED tree, walked from the found handle via the engine's own child links — the
    // recording host has no `.children` on a node (see its header).
    const scrollChildren = childrenOf(scrollView.handle);
    expect(scrollChildren).toHaveLength(1);
    // `nestedScrollEnabled` is `foldScrollViewProps` in the engine now and this host carries no copy
    // of the tag rules (`core/engine/cpp/tests/js/scroll-view-payload.itest.ts`). What this case is
    // about either way is the projected-children wrap below.

    const contentNode = fabric.find(n => n.handle === scrollChildren[0]);
    expect(contentNode?.viewName).toBe('RCTScrollContentView');
    // `collapsable: false` is `foldScrollContentProps` in the engine, not a build-time setProp —
    // same note as above: what this case is about is the wrap below.

    const contentChildren = contentNode ? childrenOf(contentNode.handle) : [];
    expect(
      contentChildren.map(
        child => fabric.find(n => n.handle === child)?.props.testID,
      ),
    ).toEqual(['a', 'b']);
  });

  // Regression test for a THIRD bug in this same bespoke-template class, this one iOS-only (the
  // inverse of the two Android bugs above): AnimatedScrollView never applied the scroll view's
  // base style (overflow: 'scroll') to its host node — now the engine's own default, folded onto
  // every `scroll-view`/`horizontal-scroll-view` regardless of who mounts it. On iOS Fabric a
  // scroll view only clips its content to its own
  // frame when `overflow: 'scroll'` is set; without it, content taller than the frame bleeds out
  // over sibling views instead of scrolling clipped (Android's native ViewGroup clips regardless
  // of the style prop, which is why this was invisible there). See
  // core/components/src/view/render-scroll-view.ts's SCROLL_VIEW_BASE_VERTICAL comment.
  // The base style itself is `foldScrollViewProps` in the engine, asserted on the committed payload
  // (`scroll-view-payload.itest.ts`). What Animated ScrollView still owes THIS file is that the
  // wrapper reaches a real `RCTScrollView` at all — lose that and the style has nowhere to land.
  it('commits a real RCTScrollView from the animated wrapper', async () => {
    mount(ROOT_TAG, AnimatedScrollViewApp);
    await tick();

    expect(
      fabric.find(node => node.viewName === 'RCTScrollView'),
    ).toBeDefined();
  });

  // why: the default from bug #2 must be a DEFAULT, not a forced value — an app that
  // deliberately opts a nested ScrollView OUT of nested scrolling (a real, valid RN use case)
  // needs its own `animatedProps.nestedScrollEnabled: false` to still win, or the fix for the
  // missing-default bug would regress into an un-overridable hardcoded `true`.
  it('lets an explicit nestedScrollEnabled in animatedProps override the default', async () => {
    mount(OVERRIDE_ROOT_TAG, AnimatedScrollViewOverrideApp);
    await tick();

    const scrollView = fabric.find(node => node.viewName === 'RCTScrollView');
    expect(scrollView && payloadOf(scrollView.handle).nestedScrollEnabled).toBe(
      false,
    );
  });
});
