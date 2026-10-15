import { act, createElement } from 'react';
import { mount, unmount } from '@symbiote-native/react';
import type { ISymbioteNode } from '@symbiote-native/engine';
import { createLiveTree } from '@symbiote-native/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { updateProps } from 'react-native-reanimated/src/updateProps';
import { installWrapperHost } from '../../test-support/wrapper-host';
import {
  recordUpdateWrites,
  type IUpdateWrite,
} from '../../test-support/update-writes';
import { settle, workletOf } from '../../test-support/worklet';
import Animated, {
  createAnimatedComponent,
  createCSSAnimatedComponent,
  Image,
  Text,
  View,
} from './animated';
import { useAnimatedStyle } from './hooks/use-animated-style';
import { useSharedValue } from './hooks/use-shared-value';
import '../register';

vi.mock('react-native-reanimated/src/updateProps', () => ({
  updateProps: vi.fn(),
}));

const host = installWrapperHost();
const live = createLiveTree(host.fabric);
const ROOT_TAG = 16_001;
const writes: IUpdateWrite[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  recordUpdateWrites(updateProps, writes);
});

afterEach(() => {
  act(() => unmount(ROOT_TAG));
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
    const component = () => null;

    expect(createAnimatedComponent(component)).toBe(component);
  });

  it('createCSSAnimatedComponent hands the component back too', () => {
    const component = () => null;

    expect(createCSSAnimatedComponent(component)).toBe(component);
  });
});

describe('an Animated.View with an animated style', () => {
  it('shows the starting values and is then driven by the UI side', async () => {
    const shared: { value: number }[] = [];
    const nodes: ISymbioteNode[] = [];
    function Screen() {
      const opacity = useSharedValue(0.5);
      shared.push(opacity);
      const style = useAnimatedStyle(
        workletOf(() => ({ opacity: opacity.value }), [opacity], 61),
      );
      return createElement(View, {
        style: [{ width: 10 }, style],
        ref: (instance: ISymbioteNode | null) => {
          if (instance) nodes.push(instance);
        },
      });
    }

    act(() => mount(ROOT_TAG, createElement(Screen)));
    await settle();
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
});
