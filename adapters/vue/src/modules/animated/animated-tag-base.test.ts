// createAnimatedComponent over an intrinsic TAG rather than a component. `Animated.View` is built
// over `View`, so the day a primitive becomes a public tag this receives a string — the same
// widening React made (`ComponentType<P> | string`).
//
// CHILDREN are the half that looked like it needed work and does not. The wrapper forwards the
// whole slots object, and for an element Vue unwraps it by calling `children.default()` and
// recursing on the RESULT rather than going back through `h` — which would drop a slot returning
// a lone VNode. It cannot: Vue wraps every slot at initSlots so `slots.default()` returns an
// array either way. A branch calling the slot ourselves was written, break-tested, found to move
// nothing, and removed. The child here is a lone VNode precisely because that is the spelling the
// suspected hazard needed.

import { describe, expect, it } from 'vitest';
import { defineComponent, h } from '@vue/runtime-core';
import { mount, unmount } from '@symbiote-native/vue';
import { installFabric, type IFakeNode } from '@symbiote-native/test-utils';
import { createAnimatedComponent } from './create-animated-component';

const ROOT_TAG = 7411;
const fabric = installFabric();
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));

function census(): { views: string[]; props: Record<string, unknown> } {
  const views: string[] = [];
  let first: Record<string, unknown> = {};
  const walk = (nodes: readonly IFakeNode[]): void => {
    for (const node of nodes) {
      views.push(node.viewName);
      if (views.length === 2) first = { ...node.props };
      walk(node.children);
    }
  };
  walk(fabric.committed);
  return { views, props: first };
}

describe('createAnimatedComponent over a tag', () => {
  it('commits its children and folds its props', async () => {
    const AnimatedTag = createAnimatedComponent('symbiote-view');
    fabric.reset();
    mount(
      ROOT_TAG,
      defineComponent({
        setup: () => () =>
          h(AnimatedTag, { 'accessibility-label': 'bar' }, () =>
            h('symbiote-text', {}, 'hi'),
          ),
      }),
    );
    await tick();
    const { views, props } = census();
    unmount(ROOT_TAG);

    // The child is the point: forwarding the slots object instead of calling it commits only the
    // container and the view, and every assertion about props still passes.
    expect(views).toContain('RCTText');
    expect(views).toContain('RCTRawText');
    // And the renderer's kebab fold still applies through the wrapper.
    expect(props.accessibilityLabel).toBe('bar');
  });

  it('names itself after the tag, since a tag has no displayName', () => {
    const AnimatedTag = createAnimatedComponent('symbiote-view');
    expect(AnimatedTag.name).toBe('Animated(symbiote-view)');
  });
});
