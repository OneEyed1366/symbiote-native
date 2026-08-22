// The JS half of Solid's Animated wrap. The native half lives in animated-native-driver.test.tsx.
//
// Three of these four assertions exist because of a Solid-specific hazard that no other adapter
// has, and each is written to FAIL on the shape a naive port would produce — see
// .claude/rules/solid-descriptor-bridge.md for why a snapshot, a vanished key, or a rebuilt
// subtree are all silent here rather than loud.

import { createSignal } from 'solid-js';
import type { JSX } from '../../jsx-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { getNativeTag, isSymbioteNode } from '@symbiote-native/engine';
import { mount, unmount } from '../../render';
import { Animated } from './index';
import { createAnimatedComponent } from './create-animated-component';

const ROOT_TAG = 613;
const fabric = installFabric();

// The surface commits on a microtask (requestCommit), so every assertion waits one macrotask.
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => fabric.reset());
afterEach(() => unmount(ROOT_TAG));

// The app's own view sits under the synthetic box-none AppContainer root.
function appView(): IFakeNode {
  return fabric.appRoot().children[0];
}

describe('Solid createAnimatedComponent', () => {
  it('reduces an animated prop to a concrete value on first paint', async () => {
    const opacity = new Animated.Value(0.25);
    mount(ROOT_TAG, () => <Animated.View style={{ opacity }} />);
    await tick();

    // A live AnimatedValue reaching Fabric would serialize as an object and paint nothing.
    expect(appView().props.opacity).toBe(0.25);
  });

  it('drives a frame through the leaf without rebuilding the subtree', async () => {
    const opacity = new Animated.Value(0);
    mount(ROOT_TAG, () => (
      <Animated.View style={{ opacity }}>
        <symbiote-text>label</symbiote-text>
      </Animated.View>
    ));
    await tick();

    // The one headless-observable difference between "updates a leaf" and "replaces the subtree".
    // Solid's `insert` REPLACES, so a wrap that let the animated value into the reactive graph
    // would recreate the child on every frame — invisible to any assertion about the value itself.
    const created = fabric.counts.createNode;
    opacity.setValue(1);
    await tick();

    expect(fabric.counts.createNode).toBe(created);
    expect(appView().props.opacity).toBe(1);
  });

  it('clears a prop that VANISHES from a spread bag', async () => {
    // The hazard needs a key that leaves the SET, not a value that goes undefined: a plain
    // `testID={sig()}` call site always emits the key, so it exercises nothing. Measured — that
    // version passed with the wrap's widening removed. A dynamic spread is the real shape, and the
    // base here deliberately does not widen its own bag, so this pins the WRAP.
    const Bare = (props: Record<string, unknown>): JSX.Element => (
      <symbiote-view {...props} />
    );
    const AnimatedBare = createAnimatedComponent(Bare);

    const [carry, setCarry] = createSignal(true);
    const spreadBag = (): Record<string, unknown> =>
      carry() ? { testID: 'before' } : {};
    mount(ROOT_TAG, () => <AnimatedBare {...spreadBag()} />);
    await tick();
    expect(appView().props.testID).toBe('before');

    setCarry(false);
    await tick();
    // Literal null, not absence: that is how the engine spells 'reset to default' to Fabric
    // (symbiote-engine-core §8). Without the wrap's widening the key never reaches diffProps and
    // the node keeps 'before' forever — Solid's `spread` has no removal pass.
    expect(appView().props.testID).toBeNull();
  });

  it('gives the caller the base instance and the leaf the resolved host node', async () => {
    let received: unknown = null;
    mount(ROOT_TAG, () => (
      <Animated.View
        ref={(instance: unknown) => {
          received = instance;
        }}
      />
    ));
    await tick();

    // View hands back the host node itself, so the caller's ref and the leaf's target coincide
    // here; the ScrollView case (a handle carrying getScrollNode) is covered by the sticky-header
    // suite, which drives this same wrap through scroll-view/sticky-header.tsx.
    expect(isSymbioteNode(received)).toBe(true);
    expect(isSymbioteNode(received) ? getNativeTag(received) : undefined).toBe(
      appView().tag,
    );
  });
});
