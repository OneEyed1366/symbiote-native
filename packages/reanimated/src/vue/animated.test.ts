import { isSymbioteNode, type ISymbioteNode } from '@symbiote-native/engine';
import { createLiveTree } from '@symbiote-native/test-utils';
import { mount, unmount } from '@symbiote-native/vue';
import { defineComponent, h, nextTick } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateProps } from 'react-native-reanimated/src/updateProps';
import {
  recordUpdateWrites,
  type IUpdateWrite,
} from '../../test-support/update-writes';
import { installWrapperHost } from '../../test-support/wrapper-host';
import { settle, workletOf } from '../../test-support/worklet';
import Animated, {
  createAnimatedComponent,
  createCSSAnimatedComponent,
  Image,
  Text,
  View,
} from './animated';
import { useAnimatedStyle } from './composables/use-animated-style';
import { useSharedValue } from './composables/use-shared-value';
import '../register';

vi.mock('react-native-reanimated/src/updateProps', () => ({
  updateProps: vi.fn(),
}));

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 16_501;
const writes: IUpdateWrite[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  recordUpdateWrites(updateProps, writes);
});

afterEach(() => {
  unmount(ROOT_TAG);
  vi.useRealTimers();
});

describe('Animated.View, Text and Image', () => {
  it('are the host tags themselves, with no component in between', () => {
    expect([View, Text, Image]).toEqual(['view', 'text', 'image']);
  });

  it('are reachable from the default export too', () => {
    expect(Animated.View).toBe(View);
    expect(Animated.createAnimatedComponent).toBe(createAnimatedComponent);
  });

  it('createAnimatedComponent hands back the very component it was given', () => {
    const component = defineComponent({ render: () => null });

    expect(createAnimatedComponent(component)).toBe(component);
  });

  it('createCSSAnimatedComponent hands the component back too', () => {
    const component = defineComponent({ render: () => null });

    expect(createCSSAnimatedComponent(component)).toBe(component);
  });
});

describe('an Animated.View with an animated style', () => {
  async function mountWith(styleOf: (handle: object) => unknown) {
    const shared: { value: number }[] = [];
    const nodes: ISymbioteNode[] = [];
    const Screen = defineComponent({
      setup() {
        const opacity = useSharedValue(0.5);
        shared.push(opacity);
        const handle = useAnimatedStyle(
          workletOf(() => ({ opacity: opacity.value }), [opacity], 61),
        );
        return () =>
          h(View, {
            style: styleOf(handle),
            ref: (instance: unknown) => {
              if (isSymbioteNode(instance)) nodes.push(instance);
            },
          });
      },
    });
    mount(ROOT_TAG, Screen);
    await nextTick();
    await settle();
    return { shared, nodes };
  }

  it('shows the starting values and is then driven by the UI side', async () => {
    const { shared, nodes } = await mountWith(handle => handle);
    const node = nodes.at(0);
    if (node === undefined) throw new Error('the view did not mount');
    expect(live.nodeOf(node).payload.opacity).toBe(0.5);
    writes.length = 0;

    const opacity = shared.at(0);
    if (opacity === undefined) throw new Error('the screen did not render');
    opacity.value = 0.2;
    await settle();

    expect(writes.map(write => write.updates)).toEqual([{ opacity: 0.2 }]);
  });

  it('is told apart in an array of styles, which Vue merges before the renderer sees it', async () => {
    const { shared, nodes } = await mountWith(handle => [
      { width: 10 },
      handle,
    ]);
    const node = nodes.at(0);
    if (node === undefined) throw new Error('the view did not mount');
    expect(live.nodeOf(node).payload.opacity).toBe(0.5);
    expect(live.nodeOf(node).payload.width).toBe(10);
    expect(Object.keys(live.nodeOf(node).payload)).not.toContain(
      'viewDescriptors',
    );
    writes.length = 0;

    const opacity = shared.at(0);
    if (opacity === undefined) throw new Error('the screen did not render');
    opacity.value = 0.2;
    await settle();

    expect(writes.map(write => write.updates)).toEqual([{ opacity: 0.2 }]);
  });
});
