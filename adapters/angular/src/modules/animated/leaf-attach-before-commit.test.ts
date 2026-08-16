// The invariant AnimatedLeafBinder must hold no matter when the host node commits: a reconcile
// puts the leaf into the VALUE GRAPH immediately, and only the NATIVE binding
// (setNativeView/__makeNative/event attach) waits for the commit.
//
// Why it matters, and why it is easy to lose: `reconcile()` cancels the previous whenCommitted
// waiter before registering a new one. If building the leaf also lives behind that waiter, a burst
// of reconciles arriving before the first commit cancels each pending build in turn and the leaf
// is never attached at all - a sticky header's rebuilt AnimatedInterpolation then never reaches
// the graph, its listener never fires, and the pin sits at its resting value. The observable is
// graph attachment: AnimatedProps.__attach() registers the leaf as a CHILD of every animated node
// in its props.

import { describe, expect, it } from 'vitest';
import { AnimatedValue, createElement } from '@symbiote-native/engine';
import { AnimatedLeafBinder } from './animated-leaf-binder';

function styleProps(node: unknown): Record<string, unknown> {
  return { style: { transform: [{ translateY: node }] } };
}

describe('AnimatedLeafBinder before the host node commits', () => {
  // why: THE regression. An uncommitted node is the normal state at ngAfterViewInit under
  // Angular's batched zoneless CD, so this is the ordinary path, not an edge case.
  it('attaches the leaf to the value graph even though the node has not committed', () => {
    const node = createElement('RCTView');
    const binder = new AnimatedLeafBinder(() => node, 'test');
    const scroll = new AnimatedValue(0);
    const translateY = scroll.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    binder.reconcile(styleProps(translateY), false);

    expect(
      translateY.__getChildren().length,
      'the leaf must join the graph without waiting for a commit',
    ).toBeGreaterThan(0);

    binder.destroy();
  });

  // why: the cancel-then-requeue shape is what turns the above into a permanent failure rather
  // than a one-frame delay - each reconcile drops the previous waiter, so if the build rides on
  // it, a component reconciling faster than it commits never attaches anything.
  it('still has the newest interpolation attached after repeated pre-commit reconciles', () => {
    const node = createElement('RCTView');
    const binder = new AnimatedLeafBinder(() => node, 'test');
    const scroll = new AnimatedValue(0);

    binder.reconcile(
      styleProps(scroll.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })),
      false,
    );
    // The sticky header's 'rebuild-interpolation' after it measures: a brand-new node.
    const rebuilt = scroll.interpolate({ inputRange: [-1, 0, 40, 41], outputRange: [0, 0, 0, 1] });
    binder.reconcile(styleProps(rebuilt), false);

    expect(
      rebuilt.__getChildren().length,
      'the rebuilt interpolation must be the one wired into the graph',
    ).toBeGreaterThan(0);

    binder.destroy();
  });
});
