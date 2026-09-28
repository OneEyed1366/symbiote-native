// Ground-truth check for the new fade wiring. Reads live.payload, not fabric.find's
// authored props: the fade is a setNativeProps clone on top of the render's own
// commit, same as this adapter's vShow test precedent.

import { defineComponent, h, ref, type VNode } from '@vue/runtime-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mount,
  Transition,
  TransitionGroup,
  unmount,
} from '@symbiote-native/vue';
import {
  createLiveTree,
  installRecordingFabric,
  type ILiveNode,
} from '@symbiote-native/test-utils';

const ROOT_TAG = 722;
const fabric = installRecordingFabric();
const live = createLiveTree(fabric);
const tick = (): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, 0));
const wait = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

// rAF is not a Node global; polyfill it (setTimeout-based), same as the React
// adapter's animated-integration.test.tsx.
let frameClock = 0;
const pendingFrames = new Map<number, (time: number) => void>();
let nextFrameId = 1;

function installRequestAnimationFrame(): void {
  Object.assign(globalThis, {
    requestAnimationFrame(callback: (time: number) => void): number {
      const id = nextFrameId++;
      pendingFrames.set(id, callback);
      setTimeout(() => {
        const cb = pendingFrames.get(id);
        if (cb !== undefined) {
          pendingFrames.delete(id);
          frameClock += 16;
          cb(frameClock);
        }
      }, 0);
      return id;
    },
    cancelAnimationFrame(id: number): void {
      pendingFrames.delete(id);
    },
  });
}

beforeEach(() => {
  fabric.reset();
  frameClock = 0;
  pendingFrames.clear();
  nextFrameId = 1;
  installRequestAnimationFrame();
});
afterEach(() => {
  unmount(ROOT_TAG);
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
});

function committed(testID: string): ILiveNode | undefined {
  return live.findLive(live.appRoot(), node => node.props.testID === testID);
}

describe('Transition', () => {
  it('fades a v-if child in from opacity 0 and settles at 1', async () => {
    const show = ref(false);
    const App = defineComponent({
      render(): VNode {
        return h(
          Transition,
          { duration: 32 },
          {
            default: () =>
              show.value ? h('view', { testID: 'box' }) : undefined,
          },
        );
      },
    });

    mount(ROOT_TAG, App);
    show.value = true;
    await tick();
    expect(committed('box')?.payload.opacity).toBe(0);

    await wait(200);
    expect(committed('box')?.payload.opacity).toBe(1);
  });

  it('fades a leaving child to opacity 0 before removing it', async () => {
    const show = ref(true);
    const App = defineComponent({
      render(): VNode {
        return h(
          Transition,
          { duration: 32 },
          {
            default: () =>
              show.value ? h('view', { testID: 'box' }) : undefined,
          },
        );
      },
    });

    mount(ROOT_TAG, App);
    await tick();
    show.value = false;
    await wait(20);
    expect(committed('box')?.payload.opacity).toBeLessThan(1);

    await wait(200);
    expect(committed('box')).toBeUndefined();
  });
});

describe('TransitionGroup', () => {
  it('fades in each newly added keyed item', async () => {
    const items = ref<number[]>([1]);
    const App = defineComponent({
      render(): VNode {
        return h(
          TransitionGroup,
          { duration: 32 },
          {
            default: () =>
              items.value.map(item =>
                h('view', { key: item, testID: `item-${item}` }),
              ),
          },
        );
      },
    });

    mount(ROOT_TAG, App);
    await tick();
    items.value = [1, 2];
    await tick();
    expect(committed('item-2')?.payload.opacity).toBe(0);

    await wait(200);
    expect(committed('item-2')?.payload.opacity).toBe(1);
  });
});
